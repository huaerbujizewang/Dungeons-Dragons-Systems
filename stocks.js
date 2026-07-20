(function () {
    const DAYS_PER_MONTH = 30;
    const MONTHS_PER_YEAR = 12;
    const MIN_PRICE = 0.01;
    const DETAILED_SETTLEMENT_MAX_DAYS = 180;
    const DB_PAGE_SIZE = 1000;
    const DB_WRITE_CHUNK_SIZE = 5000;

    const STOCK_DEFINITIONS = [
        { id: 'WCHP', code: 'WCHP', name: '白城联合港务', initial_price: 12 },
        { id: 'CDBK', code: 'CDBK', name: '大陆银行', initial_price: 18.5 },
        { id: 'SGTC', code: 'SGTC', name: '银轨交通公司', initial_price: 9.6 },
        { id: 'RKWL', code: 'RKWL', name: '罗克韦尔', initial_price: 24 },
        { id: 'PRMS', code: 'PRMS', name: '普罗米修斯', initial_price: 7.8 },
        { id: 'BRKC', code: 'BRKC', name: '巴莱克资本', initial_price: 13.2 },
        { id: 'CRGN', code: 'CRGN', name: '王冠粮业集团', initial_price: 6.4 },
        { id: 'CVDU', code: 'CVDU', name: '卡文迪许联合', initial_price: 31 }
    ];

    const STOCK_DEFINITION_CACHE_MS = 60 * 1000;
    const catchUpPromises = new Map();
    let stockDefinitionCache = { expiresAt: 0, data: null };

    const TREND_CONFIGS = [
        { type: '横盘', weight: 16, min: -0.03, max: 0.03, group: 'flat' },
        { type: '低波震荡', weight: 10, min: -0.05, max: 0.05, group: 'flat' },
        { type: '高波震荡', weight: 6, min: -0.10, max: 0.10, group: 'flat' },
        { type: '平缓上升', weight: 12, min: 0.05, max: 0.12, group: 'directional' },
        { type: '稳步上涨', weight: 8, min: 0.12, max: 0.25, group: 'directional' },
        { type: '震荡上涨', weight: 8, min: 0.10, max: 0.30, group: 'volatileDirectional' },
        { type: '加速上涨', weight: 4, min: 0.25, max: 0.50, group: 'accelerating' },
        { type: '暴涨', weight: 2, min: 0.60, max: 1.50, group: 'burst' },
        { type: '平缓下降', weight: 10, min: -0.12, max: -0.05, group: 'directional' },
        { type: '稳步下跌', weight: 7, min: -0.25, max: -0.12, group: 'directional' },
        { type: '震荡下跌', weight: 7, min: -0.30, max: -0.10, group: 'volatileDirectional' },
        { type: '加速下跌', weight: 3, min: -0.50, max: -0.25, group: 'accelerating' },
        { type: '暴跌', weight: 2, min: -0.80, max: -0.40, group: 'burst' },
        { type: '冲高回落', weight: 2, min: -0.05, max: 0.10, group: 'riseThenFall' },
        { type: '探底回升', weight: 2, min: -0.10, max: 0.10, group: 'fallThenRise' },
        { type: '跳跃震荡', weight: 1, min: -0.15, max: 0.15, group: 'jump' }
    ];

    function assertClient(client) {
        if (!client) throw new Error('Supabase client is required.');
    }

    function toNumber(value, fallback = 0) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    function roundMoney(value) {
        return Math.round(toNumber(value) * 100) / 100;
    }

    function roundRate(value) {
        return Math.round(toNumber(value) * 1000000) / 1000000;
    }

    function chunkArray(items, size = 500) {
        const chunks = [];
        for (let index = 0; index < items.length; index += size) {
            chunks.push(items.slice(index, index + size));
        }
        return chunks;
    }

    async function fetchPaged(makeQuery, pageSize = DB_PAGE_SIZE) {
        const allRows = [];
        for (let start = 0; ; start += pageSize) {
            const { data, error } = await makeQuery().range(start, start + pageSize - 1);
            if (error) throw error;
            allRows.push(...(data || []));
            if (!data || data.length < pageSize) break;
        }
        return allRows;
    }

    function isMissingRelationError(error) {
        const message = String(error?.message || error?.details || '');
        return error?.code === '42P01'
            || /schema cache|does not exist|Could not find the table/i.test(message);
    }

    function normalizeDate(date) {
        const safe = date || {};
        return {
            year: parseInt(safe.year, 10),
            month: parseInt(safe.month, 10),
            day: parseInt(safe.day, 10)
        };
    }

    function defaultCalendarForCampaign(campaignType = 'dnd') {
        return String(campaignType || '').toLowerCase() === 'coc' ? 'ce' : 'dr';
    }

    function normalizeCalendarSystem(value, campaignType = 'dnd') {
        const raw = String(value || '').trim().toLowerCase();
        if (raw === 'tirlian' || raw === 'tilian' || raw === 'tl') return 'tirlian';
        if (raw === 'imperial' || raw === 'empire') return 'imperial';
        if (raw === 'dr' || raw === 'fr') return 'dr';
        if (raw === 'ce' || raw === 'ad' || raw === 'gregorian' || raw === 'coc') return 'ce';
        return defaultCalendarForCampaign(campaignType);
    }

    function convertCalendarYear(year, calendarSystem = 'dr') {
        if (!Number.isFinite(Number(year))) return year ?? '----';
        return Number(year);
    }

    function formatDisplayDate(date, calendarSystem = 'dr', campaignType = 'dnd') {
        const d = normalizeDate(date);
        const system = normalizeCalendarSystem(calendarSystem, campaignType);
        const year = convertCalendarYear(d.year, system);
        if (system === 'tirlian') return `蒂尔兰历${year}年${d.month}月${d.day}日`;
        if (system === 'imperial') return `帝国历${year}年${d.month}月${d.day}日`;
        if (system === 'ce') return `公元${year}年${d.month}月${d.day}日`;
        return `DR${year} ${d.month}月${d.day}日`;
    }

    function isValidDate(date) {
        const d = normalizeDate(date);
        return Number.isInteger(d.year) && Number.isInteger(d.month) && Number.isInteger(d.day)
            && d.month >= 1 && d.month <= MONTHS_PER_YEAR && d.day >= 1 && d.day <= DAYS_PER_MONTH;
    }

    function dateToSerial(date) {
        const d = normalizeDate(date);
        return (d.year * MONTHS_PER_YEAR * DAYS_PER_MONTH) + ((d.month - 1) * DAYS_PER_MONTH) + (d.day - 1);
    }

    function serialToDate(serial) {
        let rest = parseInt(serial, 10);
        const year = Math.floor(rest / (MONTHS_PER_YEAR * DAYS_PER_MONTH));
        rest -= year * MONTHS_PER_YEAR * DAYS_PER_MONTH;
        const month = Math.floor(rest / DAYS_PER_MONTH) + 1;
        const day = (rest % DAYS_PER_MONTH) + 1;
        return { year, month, day };
    }

    function compareDates(a, b) {
        return dateToSerial(a) - dateToSerial(b);
    }

    function addDays(date, days) {
        return serialToDate(dateToSerial(date) + days);
    }

    function listMonthsBetween(fromDate, toDate) {
        const months = [];
        let year = fromDate.year;
        let month = fromDate.month;
        while (year < toDate.year || (year === toDate.year && month <= toDate.month)) {
            months.push({ year, month });
            month += 1;
            if (month > MONTHS_PER_YEAR) {
                month = 1;
                year += 1;
            }
        }
        return months;
    }

    function pad(value, width) {
        return String(value).padStart(width, '0');
    }

    function dateKey(date) {
        const d = normalizeDate(date);
        return `${pad(d.year, 4)}-${pad(d.month, 2)}-${pad(d.day, 2)}`;
    }

    function monthKey(year, month) {
        return `${pad(year, 4)}-${pad(month, 2)}`;
    }

    function parseDateValue(value) {
        if (!value) return null;
        if (typeof value === 'object') return normalizeDate(value);
        const match = String(value).match(/^(-?\d+)-(\d{1,2})-(\d{1,2})$/);
        if (!match) return null;
        return { year: parseInt(match[1], 10), month: parseInt(match[2], 10), day: parseInt(match[3], 10) };
    }

    function datePayload(date) {
        const d = normalizeDate(date);
        return {
            date_key: dateKey(d),
            date_value: d,
            date_serial: dateToSerial(d),
            year: d.year,
            month: d.month,
            day: d.day
        };
    }

    function randomBetween(min, max) {
        const low = Math.min(min, max);
        const high = Math.max(min, max);
        return low + Math.random() * (high - low);
    }

    function pickCount(min, max) {
        return Math.floor(randomBetween(min, max + 1));
    }

    function pickTrendConfig() {
        const total = TREND_CONFIGS.reduce((sum, cfg) => sum + cfg.weight, 0);
        let roll = Math.random() * total;
        for (const cfg of TREND_CONFIGS) {
            roll -= cfg.weight;
            if (roll <= 0) return cfg;
        }
        return TREND_CONFIGS[0];
    }

    function normalizeSeriesToTarget(values, target) {
        const current = values.reduce((sum, value) => sum + value, 0);
        const diff = target - current;
        return values.map(value => roundRate(value + diff / DAYS_PER_MONTH));
    }

    function flatTrendReturns(config, target) {
        const volatility = config.type === '高波震荡' ? 0.012 : config.type === '低波震荡' ? 0.006 : 0.004;
        const values = Array.from({ length: DAYS_PER_MONTH }, () => randomBetween(-volatility, volatility));
        return normalizeSeriesToTarget(values, target);
    }

    function directionalTrendReturns(config, target) {
        const dailyBase = target / DAYS_PER_MONTH;
        const volatility = config.group === 'volatileDirectional' ? Math.abs(dailyBase) * 2 + 0.009 : Math.abs(dailyBase) + 0.004;
        const values = Array.from({ length: DAYS_PER_MONTH }, () => dailyBase + randomBetween(-volatility, volatility));
        return normalizeSeriesToTarget(values, target);
    }

    function acceleratingTrendReturns(config, target) {
        const sign = Math.sign(target) || 1;
        const weights = Array.from({ length: DAYS_PER_MONTH }, (_, index) => 0.35 + Math.pow((index + 1) / DAYS_PER_MONTH, 2) * 1.8);
        const totalWeight = weights.reduce((sum, value) => sum + value, 0);
        const values = weights.map(weight => (target * weight / totalWeight) + randomBetween(-0.006, 0.006) * sign);
        return normalizeSeriesToTarget(values, target);
    }

    function burstTrendReturns(config, target) {
        const sign = Math.sign(target) || 1;
        const values = Array.from({ length: DAYS_PER_MONTH }, () => randomBetween(-0.01, 0.01));
        const burstCount = pickCount(2, 4);
        const used = new Set();
        while (used.size < burstCount) used.add(pickCount(3, DAYS_PER_MONTH - 3));
        const burstShare = target * randomBetween(0.55, 0.78);
        const perBurst = burstShare / burstCount;
        used.forEach(index => {
            values[index - 1] += perBurst + randomBetween(0.01, 0.04) * sign;
        });
        return normalizeSeriesToTarget(values, target);
    }

    function riseThenFallReturns(config, target) {
        const values = [];
        for (let day = 1; day <= DAYS_PER_MONTH; day++) {
            const firstHalf = day <= 15;
            values.push(firstHalf ? randomBetween(0.004, 0.025) : randomBetween(-0.026, -0.004));
        }
        return normalizeSeriesToTarget(values, target);
    }

    function fallThenRiseReturns(config, target) {
        const values = [];
        for (let day = 1; day <= DAYS_PER_MONTH; day++) {
            const firstHalf = day <= 15;
            values.push(firstHalf ? randomBetween(-0.026, -0.004) : randomBetween(0.004, 0.025));
        }
        return normalizeSeriesToTarget(values, target);
    }

    function jumpTrendReturns(config, target) {
        const values = Array.from({ length: DAYS_PER_MONTH }, () => randomBetween(-0.008, 0.008));
        const jumpCount = pickCount(3, 6);
        const used = new Set();
        while (used.size < jumpCount) used.add(pickCount(2, DAYS_PER_MONTH - 1));
        used.forEach(index => {
            const sign = Math.random() > 0.5 ? 1 : -1;
            values[index - 1] += sign * randomBetween(0.08, 0.20);
        });
        return normalizeSeriesToTarget(values, target);
    }

    function generateMonthlyReturns(config, targetReturn) {
        if (config.group === 'flat') return flatTrendReturns(config, targetReturn);
        if (config.group === 'directional' || config.group === 'volatileDirectional') return directionalTrendReturns(config, targetReturn);
        if (config.group === 'accelerating') return acceleratingTrendReturns(config, targetReturn);
        if (config.group === 'burst') return burstTrendReturns(config, targetReturn);
        if (config.group === 'riseThenFall') return riseThenFallReturns(config, targetReturn);
        if (config.group === 'fallThenRise') return fallThenRiseReturns(config, targetReturn);
        if (config.group === 'jump') return jumpTrendReturns(config, targetReturn);
        return flatTrendReturns(config, targetReturn);
    }

    async function ensureStockDefinitions(client, options = {}) {
        assertClient(client);
        if (!options.force && stockDefinitionCache.data && Date.now() < stockDefinitionCache.expiresAt) {
            return stockDefinitionCache.data;
        }
        const { data, error } = await client.from('stocks').select('*').order('code', { ascending: true });
        if (error) throw error;
        const definitions = data && data.length ? data : STOCK_DEFINITIONS;
        stockDefinitionCache = {
            data: definitions,
            expiresAt: Date.now() + STOCK_DEFINITION_CACHE_MS
        };
        return definitions;
    }

    async function getMarketConfig(client, accountId) {
        const { data, error } = await client
            .from('account_stock_market')
            .select('*')
            .eq('account_id', accountId)
            .maybeSingle();
        if (error) throw error;
        if (data) return data;

        const payload = {
            account_id: accountId,
            market_enabled: false,
            market_open_date: null,
            open_date_key: null,
            open_date_serial: null
        };
        const { data: inserted, error: insertError } = await client
            .from('account_stock_market')
            .insert([payload])
            .select('*')
            .single();
        if (insertError) throw insertError;
        return inserted;
    }

    function marketOpenDate(market) {
        return parseDateValue(market?.market_open_date) || parseDateValue(market?.open_date_key);
    }

    function isMarketTradable(market, currentDate) {
        const openDate = marketOpenDate(market);
        return Boolean(market?.market_enabled && openDate && compareDates(currentDate, openDate) >= 0);
    }

    async function clearGeneratedMarketData(client, accountId) {
        const generatedTables = [
            'stock_price_history',
            'stock_daily_returns',
            'stock_monthly_trends',
            'account_stock_state'
        ];
        const results = await Promise.all(generatedTables.map(table =>
            client.from(table).delete().eq('account_id', accountId)
        ));
        results.forEach(result => {
            if (result.error) throw result.error;
        });
    }

    async function deleteAccountStockData(options) {
        const { client, accountId } = options;
        assertClient(client);
        if (!accountId) throw new Error('缺少账号。');
        const stockTables = [
            'stock_transactions',
            'stock_holdings',
            'stock_price_history',
            'stock_daily_order_totals',
            'stock_dm_adjustments',
            'stock_news',
            'stock_trading_halts',
            'stock_daily_returns',
            'stock_monthly_trends',
            'account_stock_state',
            'account_stock_market'
        ];
        const results = await Promise.all(stockTables.map(table =>
            client.from(table).delete().eq('account_id', accountId)
        ));
        results.forEach(result => {
            if (result.error) throw result.error;
        });
    }

    async function clearGeneratedStockData(options) {
        const { client, accountId } = options;
        assertClient(client);
        if (!accountId) throw new Error('缺少账号。');
        await clearGeneratedMarketData(client, accountId);
    }

    async function setMarketConfig(options) {
        const { client, accountId, enabled, openDate, currentDate } = options;
        assertClient(client);
        if (!accountId) throw new Error('缺少账号。');
        if (openDate && !isValidDate(openDate)) throw new Error('股票市场开启日期无效。');
        const previousMarket = await getMarketConfig(client, accountId);
        const previousOpenDate = marketOpenDate(previousMarket);
        const openDateChanged = Boolean(openDate)
            && (!previousOpenDate || dateToSerial(previousOpenDate) !== dateToSerial(openDate));

        const payload = {
            account_id: accountId,
            market_enabled: Boolean(enabled),
            updated_at: new Date().toISOString()
        };
        if (openDate) {
            payload.market_open_date = normalizeDate(openDate);
            payload.open_date_key = dateKey(openDate);
            payload.open_date_serial = dateToSerial(openDate);
        }

        const { data, error } = await client
            .from('account_stock_market')
            .upsert(payload, { onConflict: 'account_id' })
            .select('*')
            .single();
        if (error) throw error;

        if (openDateChanged) {
            await clearGeneratedMarketData(client, accountId);
        }

        if (data.market_enabled && currentDate && isMarketTradable(data, currentDate)) {
            await catchUpMarket({ client, accountId, currentDate });
        }
        return data;
    }

    async function ensureAccountInitialized(client, accountId, openDate) {
        const stocks = await ensureStockDefinitions(client);
        const { data: states, error: stateError } = await client
            .from('account_stock_state')
            .select('stock_id')
            .eq('account_id', accountId);
        if (stateError) throw stateError;

        const existing = new Set((states || []).map(row => row.stock_id));
        const missingStates = stocks
            .filter(stock => !existing.has(stock.id))
            .map(stock => ({
                account_id: accountId,
                stock_id: stock.id,
                current_price: roundMoney(stock.initial_price)
            }));
        if (missingStates.length) {
            const { error } = await client
                .from('account_stock_state')
                .upsert(missingStates, { onConflict: 'account_id,stock_id' });
            if (error) throw error;
        }

        if (openDate) {
            const historyRows = stocks.map(stock => ({
                account_id: accountId,
                stock_id: stock.id,
                price: roundMoney(stock.initial_price),
                base_return: 0,
                order_impact: 0,
                dm_adjustment: 0,
                ...datePayload(openDate)
            }));
            const { error } = await client
                .from('stock_price_history')
                .upsert(historyRows, { onConflict: 'account_id,stock_id,date_key' });
            if (error) throw error;
        }
        return stocks;
    }

    async function ensureDailyReturnsForMonth(client, accountId, stockId, year, month) {
        const { data: existingReturns, error: returnError } = await client
            .from('stock_daily_returns')
            .select('day')
            .eq('account_id', accountId)
            .eq('stock_id', stockId)
            .eq('year', year)
            .eq('month', month);
        if (returnError) throw returnError;
        if ((existingReturns || []).length >= DAYS_PER_MONTH) return;

        let { data: trend, error: trendError } = await client
            .from('stock_monthly_trends')
            .select('*')
            .eq('account_id', accountId)
            .eq('stock_id', stockId)
            .eq('year', year)
            .eq('month', month)
            .maybeSingle();
        if (trendError) throw trendError;

        let config;
        if (!trend) {
            config = pickTrendConfig();
            const targetReturn = randomBetween(config.min, config.max);
            const payload = {
                account_id: accountId,
                stock_id: stockId,
                year,
                month,
                trend_type: config.type,
                target_return: roundRate(targetReturn)
            };
            const { data: inserted, error } = await client
                .from('stock_monthly_trends')
                .insert([payload])
                .select('*')
                .single();
            if (error) throw error;
            trend = inserted;
        }

        config = TREND_CONFIGS.find(item => item.type === trend.trend_type) || TREND_CONFIGS[0];
        const returns = generateMonthlyReturns(config, toNumber(trend.target_return, randomBetween(config.min, config.max)));
        const existingDays = new Set((existingReturns || []).map(row => row.day));
        const rows = [];
        for (let day = 1; day <= DAYS_PER_MONTH; day++) {
            if (existingDays.has(day)) continue;
            const d = { year, month, day };
            rows.push({
                account_id: accountId,
                stock_id: stockId,
                base_return: returns[day - 1],
                ...datePayload(d)
            });
        }
        if (rows.length) {
            const { error } = await client
                .from('stock_daily_returns')
                .upsert(rows, { onConflict: 'account_id,stock_id,date_key' });
            if (error) throw error;
        }
    }

    async function settleStocksBetween(options) {
        const { fromDate, toDate } = options;
        if (!isValidDate(fromDate) || !isValidDate(toDate)) return;
        const totalDays = dateToSerial(toDate) - dateToSerial(fromDate);
        if (totalDays > DETAILED_SETTLEMENT_MAX_DAYS) {
            return settleStocksBetweenBulk(options);
        }
        return settleStocksBetweenDetailed(options);
    }

    async function settleStocksBetweenBulk(options) {
        const { client, accountId, fromDate, toDate } = options;
        assertClient(client);
        if (!accountId || !isValidDate(fromDate) || !isValidDate(toDate)) return;
        const market = await getMarketConfig(client, accountId);
        if (!market?.market_enabled) return;
        const openDate = marketOpenDate(market);
        const fromSerial = dateToSerial(fromDate);
        const targetSerial = dateToSerial(toDate);
        if (targetSerial <= fromSerial) return;

        const activeStartSerial = openDate ? Math.max(fromSerial, dateToSerial(openDate)) : fromSerial;
        if (activeStartSerial >= targetSerial) return;

        const stocks = await ensureAccountInitialized(client, accountId, openDate);
        const stockIds = stocks.map(stock => stock.id);
        const activeStartDate = serialToDate(activeStartSerial);
        const lastSettledDate = addDays(toDate, -1);

        const activeMonths = listMonthsBetween(activeStartDate, lastSettledDate);
        const minYear = activeMonths[0]?.year ?? activeStartDate.year;
        const maxYear = activeMonths[activeMonths.length - 1]?.year ?? lastSettledDate.year;

        const [statesRes, anchorHistoryRes, existingTrends, existingReturnRows, orderRows, dmRows, haltRows] = await Promise.all([
            client
                .from('account_stock_state')
                .select('*')
                .eq('account_id', accountId)
                .in('stock_id', stockIds),
            client
                .from('stock_price_history')
                .select('*')
                .eq('account_id', accountId)
                .eq('date_serial', activeStartSerial)
                .in('stock_id', stockIds),
            fetchPaged(() => client
                .from('stock_monthly_trends')
                .select('*')
                .eq('account_id', accountId)
                .gte('year', minYear)
                .lte('year', maxYear)
                .in('stock_id', stockIds)),
            fetchPaged(() => client
                .from('stock_daily_returns')
                .select('*')
                .eq('account_id', accountId)
                .gte('date_serial', activeStartSerial)
                .lt('date_serial', targetSerial)
                .in('stock_id', stockIds)),
            fetchPaged(() => client
                .from('stock_daily_order_totals')
                .select('*')
                .eq('account_id', accountId)
                .gte('date_serial', activeStartSerial)
                .lt('date_serial', targetSerial)
                .in('stock_id', stockIds)),
            fetchPaged(() => client
                .from('stock_dm_adjustments')
                .select('*')
                .eq('account_id', accountId)
                .gte('effective_date_serial', activeStartSerial)
                .lt('effective_date_serial', targetSerial)
                .in('stock_id', stockIds)),
            fetchStockHaltsBetween(client, accountId, stockIds, activeStartSerial, targetSerial)
        ]);
        if (statesRes.error) throw statesRes.error;
        if (anchorHistoryRes.error) throw anchorHistoryRes.error;

        const currentPrices = Object.fromEntries(stocks.map(stock => [stock.id, roundMoney(stock.initial_price)]));
        for (const state of statesRes.data || []) {
            currentPrices[state.stock_id] = roundMoney(state.current_price);
        }
        for (const row of anchorHistoryRes.data || []) {
            currentPrices[row.stock_id] = roundMoney(row.price);
        }

        const trendMap = {};
        for (const row of existingTrends || []) {
            trendMap[`${row.stock_id}:${monthKey(row.year, row.month)}`] = row;
        }

        const missingTrendRows = [];
        const returnSeriesMap = {};
        function getMonthlyReturnSeries(stockId, year, month) {
            const key = `${stockId}:${monthKey(year, month)}`;
            if (returnSeriesMap[key]) return returnSeriesMap[key];
            let trend = trendMap[key];
            if (!trend) {
                const config = pickTrendConfig();
                const targetReturn = randomBetween(config.min, config.max);
                trend = {
                    account_id: accountId,
                    stock_id: stockId,
                    year,
                    month,
                    trend_type: config.type,
                    target_return: roundRate(targetReturn)
                };
                trendMap[key] = trend;
                missingTrendRows.push(trend);
            }
            const config = TREND_CONFIGS.find(item => item.type === trend.trend_type) || TREND_CONFIGS[0];
            returnSeriesMap[key] = generateMonthlyReturns(config, toNumber(trend.target_return, randomBetween(config.min, config.max)));
            return returnSeriesMap[key];
        }

        const dailyReturnMap = {};
        for (const row of existingReturnRows || []) {
            dailyReturnMap[`${row.date_key}:${row.stock_id}`] = row;
        }
        const orderMap = {};
        for (const row of orderRows || []) {
            orderMap[`${row.date_key}:${row.stock_id}`] = row;
        }
        const dmMap = {};
        for (const row of dmRows || []) {
            dmMap[`${row.effective_date_key}:${row.stock_id}`] = row;
        }
        const haltMap = groupHaltsByStock(haltRows);

        const historyRows = [];
        const dailyReturnRows = [];
        for (let serial = activeStartSerial; serial < targetSerial; serial++) {
            const from = serialToDate(serial);
            const to = serialToDate(serial + 1);
            const key = dateKey(from);
            for (const stock of stocks) {
                const returns = getMonthlyReturnSeries(stock.id, from.year, from.month);
                const existingDailyReturn = dailyReturnMap[`${key}:${stock.id}`];
                const halted = isStockHaltedOn(haltMap, stock.id, serial);
                const baseReturn = halted ? 0 : existingDailyReturn
                    ? toNumber(existingDailyReturn.base_return, 0)
                    : toNumber(returns[from.day - 1], 0);
                const order = orderMap[`${key}:${stock.id}`] || {};
                const orderImpact = halted ? 0 : toNumber(order.buy_impact, 0) - toNumber(order.sell_impact, 0);
                const dmAdjustment = halted ? 0 : toNumber(dmMap[`${key}:${stock.id}`]?.percentage, 0);
                const currentPrice = currentPrices[stock.id] || roundMoney(stock.initial_price);
                const cleanPrice = roundMoney(Math.max(MIN_PRICE, currentPrice * (1 + baseReturn + orderImpact + dmAdjustment)));

                if (!existingDailyReturn || halted) {
                    dailyReturnRows.push({
                        account_id: accountId,
                        stock_id: stock.id,
                        base_return: roundRate(baseReturn),
                        ...datePayload(from)
                    });
                }
                historyRows.push({
                    account_id: accountId,
                    stock_id: stock.id,
                    price: cleanPrice,
                    base_return: roundRate(baseReturn),
                    order_impact: roundRate(orderImpact),
                    dm_adjustment: roundRate(dmAdjustment),
                    previous_price: currentPrice,
                    ...datePayload(to)
                });

                currentPrices[stock.id] = cleanPrice;
            }
        }

        for (const chunk of chunkArray(missingTrendRows, DB_WRITE_CHUNK_SIZE)) {
            const { error } = await client
                .from('stock_monthly_trends')
                .upsert(chunk, { onConflict: 'account_id,stock_id,year,month' });
            if (error) throw error;
        }

        for (const chunk of chunkArray(dailyReturnRows, DB_WRITE_CHUNK_SIZE)) {
            const { error } = await client
                .from('stock_daily_returns')
                .upsert(chunk, { onConflict: 'account_id,stock_id,date_key' });
            if (error) throw error;
        }

        for (const chunk of chunkArray(historyRows, DB_WRITE_CHUNK_SIZE)) {
            const { error } = await client
                .from('stock_price_history')
                .upsert(chunk, { onConflict: 'account_id,stock_id,date_key' });
            if (error) throw error;
        }

        const stateRows = stocks.map(stock => ({
            account_id: accountId,
            stock_id: stock.id,
            current_price: currentPrices[stock.id] || roundMoney(stock.initial_price),
            updated_at: new Date().toISOString()
        }));
        const { error: stateError } = await client
            .from('account_stock_state')
            .upsert(stateRows, { onConflict: 'account_id,stock_id' });
        if (stateError) throw stateError;

        const { error: clearOrderError } = await client
            .from('stock_daily_order_totals')
            .delete()
            .eq('account_id', accountId)
            .gte('date_serial', activeStartSerial)
            .lt('date_serial', targetSerial);
        if (clearOrderError) throw clearOrderError;

        const { error: clearDmError } = await client
            .from('stock_dm_adjustments')
            .delete()
            .eq('account_id', accountId)
            .gte('effective_date_serial', activeStartSerial)
            .lt('effective_date_serial', targetSerial);
        if (clearDmError) throw clearDmError;
    }

    async function settleStocksBetweenDetailed(options) {
        const { client, accountId, fromDate, toDate } = options;
        assertClient(client);
        if (!accountId || !isValidDate(fromDate) || !isValidDate(toDate)) return;
        const market = await getMarketConfig(client, accountId);
        if (!market?.market_enabled) return;
        const openDate = marketOpenDate(market);
        const stocks = await ensureAccountInitialized(client, accountId, openDate);
        const stockIds = stocks.map(stock => stock.id);
        const steps = [];
        let cursor = normalizeDate(fromDate);
        const fromSerial = dateToSerial(fromDate);
        const targetSerial = dateToSerial(toDate);
        while (dateToSerial(cursor) < targetSerial) {
            const nextDate = addDays(cursor, 1);
            if (isMarketTradable(market, cursor)) {
                steps.push({ fromDate: cursor, toDate: nextDate, fromKey: dateKey(cursor) });
            }
            cursor = nextDate;
        }
        if (!steps.length) return;

        const activeMonths = listMonthsBetween(steps[0].fromDate, steps[steps.length - 1].fromDate);
        for (const monthInfo of activeMonths) {
            await Promise.all(stocks.map(stock =>
                ensureDailyReturnsForMonth(client, accountId, stock.id, monthInfo.year, monthInfo.month)
            ));
        }

        const [statesRes, anchorHistoryRes, returnRows, orderRows, dmRows, haltRows] = await Promise.all([
            client
                .from('account_stock_state')
                .select('*')
                .eq('account_id', accountId)
                .in('stock_id', stockIds),
            client
                .from('stock_price_history')
                .select('*')
                .eq('account_id', accountId)
                .eq('date_serial', fromSerial)
                .in('stock_id', stockIds),
            fetchPaged(() => client
                .from('stock_daily_returns')
                .select('*')
                .eq('account_id', accountId)
                .gte('date_serial', fromSerial)
                .lt('date_serial', targetSerial)
                .in('stock_id', stockIds)),
            fetchPaged(() => client
                .from('stock_daily_order_totals')
                .select('*')
                .eq('account_id', accountId)
                .gte('date_serial', fromSerial)
                .lt('date_serial', targetSerial)
                .in('stock_id', stockIds)),
            fetchPaged(() => client
                .from('stock_dm_adjustments')
                .select('*')
                .eq('account_id', accountId)
                .gte('effective_date_serial', fromSerial)
                .lt('effective_date_serial', targetSerial)
                .in('stock_id', stockIds)),
            fetchStockHaltsBetween(client, accountId, stockIds, fromSerial, targetSerial)
        ]);
        if (statesRes.error) throw statesRes.error;
        if (anchorHistoryRes.error) throw anchorHistoryRes.error;

        const currentPrices = Object.fromEntries(stocks.map(stock => [stock.id, roundMoney(stock.initial_price)]));
        for (const state of statesRes.data || []) {
            currentPrices[state.stock_id] = roundMoney(state.current_price);
        }
        for (const row of anchorHistoryRes.data || []) {
            currentPrices[row.stock_id] = roundMoney(row.price);
        }

        const returnsMap = {};
        for (const row of returnRows || []) {
            returnsMap[`${row.date_key}:${row.stock_id}`] = row;
        }
        const orderMap = {};
        for (const row of orderRows || []) {
            orderMap[`${row.date_key}:${row.stock_id}`] = row;
        }
        const dmMap = {};
        for (const row of dmRows || []) {
            dmMap[`${row.effective_date_key}:${row.stock_id}`] = row;
        }
        const haltMap = groupHaltsByStock(haltRows);

        const historyRows = [];
        const forcedDailyReturnRows = [];
        for (const step of steps) {
            const stepSerial = dateToSerial(step.fromDate);
            for (const stock of stocks) {
                const mapKey = `${step.fromKey}:${stock.id}`;
                const currentPrice = currentPrices[stock.id] || roundMoney(stock.initial_price);
                const halted = isStockHaltedOn(haltMap, stock.id, stepSerial);
                const baseReturn = halted ? 0 : toNumber(returnsMap[mapKey]?.base_return, 0);
                const order = orderMap[mapKey] || {};
                const orderImpact = halted ? 0 : toNumber(order.buy_impact, 0) - toNumber(order.sell_impact, 0);
                const dmAdjustment = halted ? 0 : toNumber(dmMap[mapKey]?.percentage, 0);
                const totalReturn = baseReturn + orderImpact + dmAdjustment;
                const nextPrice = Math.max(MIN_PRICE, currentPrice * (1 + totalReturn));
                const cleanPrice = roundMoney(nextPrice);
                if (halted) {
                    forcedDailyReturnRows.push({
                        account_id: accountId,
                        stock_id: stock.id,
                        base_return: 0,
                        ...datePayload(step.fromDate)
                    });
                }
                historyRows.push({
                    account_id: accountId,
                    stock_id: stock.id,
                    price: cleanPrice,
                    base_return: roundRate(baseReturn),
                    order_impact: roundRate(orderImpact),
                    dm_adjustment: roundRate(dmAdjustment),
                    previous_price: currentPrice,
                    ...datePayload(step.toDate)
                });
                currentPrices[stock.id] = cleanPrice;
            }
        }

        for (const chunk of chunkArray(forcedDailyReturnRows, DB_WRITE_CHUNK_SIZE)) {
            const { error } = await client
                .from('stock_daily_returns')
                .upsert(chunk, { onConflict: 'account_id,stock_id,date_key' });
            if (error) throw error;
        }

        for (const chunk of chunkArray(historyRows)) {
            const { error } = await client
                .from('stock_price_history')
                .upsert(chunk, { onConflict: 'account_id,stock_id,date_key' });
            if (error) throw error;
        }

        const stateRows = stocks.map(stock => ({
            account_id: accountId,
            stock_id: stock.id,
            current_price: currentPrices[stock.id] || roundMoney(stock.initial_price),
            updated_at: new Date().toISOString()
        }));
        const { error: stateError } = await client
            .from('account_stock_state')
            .upsert(stateRows, { onConflict: 'account_id,stock_id' });
        if (stateError) throw stateError;

        const { error: clearOrderError } = await client
            .from('stock_daily_order_totals')
            .delete()
            .eq('account_id', accountId)
            .gte('date_serial', fromSerial)
            .lt('date_serial', targetSerial);
        if (clearOrderError) throw clearOrderError;

        const { error: clearDmError } = await client
            .from('stock_dm_adjustments')
            .delete()
            .eq('account_id', accountId)
            .gte('effective_date_serial', fromSerial)
            .lt('effective_date_serial', targetSerial);
        if (clearDmError) throw clearDmError;
    }

    async function settleOneStockDay(options) {
        const { client, accountId, fromDate, toDate } = options;
        const market = options.market || await getMarketConfig(client, accountId);
        if (!isMarketTradable(market, fromDate)) return;
        const openDate = marketOpenDate(market);
        const stocks = options.stocks || await ensureAccountInitialized(client, accountId, openDate);

        if (!options.skipDailyReturnEnsure) {
            await Promise.all(stocks.map(stock =>
                ensureDailyReturnsForMonth(client, accountId, stock.id, fromDate.year, fromDate.month)
            ));
        }

        const stockIds = stocks.map(stock => stock.id);
        const fromKey = dateKey(fromDate);
        const fromSerial = dateToSerial(fromDate);
        const { data: states, error: statesError } = await client
            .from('account_stock_state')
            .select('*')
            .eq('account_id', accountId)
            .in('stock_id', stockIds);
        if (statesError) throw statesError;
        const stateMap = Object.fromEntries((states || []).map(row => [row.stock_id, row]));

        const { data: returns, error: returnsError } = await client
            .from('stock_daily_returns')
            .select('*')
            .eq('account_id', accountId)
            .eq('date_key', fromKey)
            .in('stock_id', stockIds);
        if (returnsError) throw returnsError;
        const returnMap = Object.fromEntries((returns || []).map(row => [row.stock_id, row]));

        const { data: orderTotals, error: orderError } = await client
            .from('stock_daily_order_totals')
            .select('*')
            .eq('account_id', accountId)
            .eq('date_key', fromKey)
            .in('stock_id', stockIds);
        if (orderError) throw orderError;
        const orderMap = Object.fromEntries((orderTotals || []).map(row => [row.stock_id, row]));

        const { data: dmAdjustments, error: dmError } = await client
            .from('stock_dm_adjustments')
            .select('*')
            .eq('account_id', accountId)
            .eq('effective_date_key', fromKey)
            .in('stock_id', stockIds);
        if (dmError) throw dmError;
        const dmMap = Object.fromEntries((dmAdjustments || []).map(row => [row.stock_id, row]));
        const haltMap = groupHaltsByStock(await fetchStockHaltsBetween(client, accountId, stockIds, fromSerial, fromSerial + 1));

        const historyRows = [];
        const nextStates = [];
        const forcedDailyReturnRows = [];
        for (const stock of stocks) {
            const state = stateMap[stock.id];
            const currentPrice = roundMoney(state?.current_price || stock.initial_price);
            const halted = isStockHaltedOn(haltMap, stock.id, fromSerial);
            const baseReturn = halted ? 0 : toNumber(returnMap[stock.id]?.base_return, 0);
            const order = orderMap[stock.id] || {};
            const orderImpact = halted ? 0 : toNumber(order.buy_impact, 0) - toNumber(order.sell_impact, 0);
            const dmAdjustment = halted ? 0 : toNumber(dmMap[stock.id]?.percentage, 0);
            const totalReturn = baseReturn + orderImpact + dmAdjustment;
            const nextPrice = Math.max(MIN_PRICE, currentPrice * (1 + totalReturn));
            const cleanPrice = roundMoney(nextPrice);
            if (halted) {
                forcedDailyReturnRows.push({
                    account_id: accountId,
                    stock_id: stock.id,
                    base_return: 0,
                    ...datePayload(fromDate)
                });
            }
            historyRows.push({
                account_id: accountId,
                stock_id: stock.id,
                price: cleanPrice,
                base_return: roundRate(baseReturn),
                order_impact: roundRate(orderImpact),
                dm_adjustment: roundRate(dmAdjustment),
                previous_price: currentPrice,
                ...datePayload(toDate)
            });
            nextStates.push({
                account_id: accountId,
                stock_id: stock.id,
                current_price: cleanPrice,
                updated_at: new Date().toISOString()
            });
        }

        if (forcedDailyReturnRows.length) {
            const { error: forcedReturnError } = await client
                .from('stock_daily_returns')
                .upsert(forcedDailyReturnRows, { onConflict: 'account_id,stock_id,date_key' });
            if (forcedReturnError) throw forcedReturnError;
        }

        const { error: historyError } = await client
            .from('stock_price_history')
            .upsert(historyRows, { onConflict: 'account_id,stock_id,date_key' });
        if (historyError) throw historyError;

        const { error: stateError } = await client
            .from('account_stock_state')
            .upsert(nextStates, { onConflict: 'account_id,stock_id' });
        if (stateError) throw stateError;

        const { error: clearOrderError } = await client
            .from('stock_daily_order_totals')
            .delete()
            .eq('account_id', accountId)
            .eq('date_key', fromKey);
        if (clearOrderError) throw clearOrderError;

        const { error: clearDmError } = await client
            .from('stock_dm_adjustments')
            .delete()
            .eq('account_id', accountId)
            .eq('effective_date_key', fromKey);
        if (clearDmError) throw clearDmError;
    }

    async function catchUpMarket(options) {
        const { client, accountId, currentDate, historyDays = null, repairSparseHistory = false } = options;
        const market = await getMarketConfig(client, accountId);
        if (!isMarketTradable(market, currentDate)) return;
        const openDate = marketOpenDate(market);
        const stocks = await ensureAccountInitialized(client, accountId, openDate);
        const currentSerial = dateToSerial(currentDate);
        const openSerial = openDate ? dateToSerial(openDate) : currentSerial;
        const latestHistoryResults = await Promise.all(stocks.map(stock =>
            client
                .from('stock_price_history')
                .select('stock_id,date_value,date_serial')
                .eq('account_id', accountId)
                .eq('stock_id', stock.id)
                .lte('date_serial', currentSerial)
                .order('date_serial', { ascending: false })
                .limit(1)
        ));
        latestHistoryResults.forEach(res => {
            if (res.error) throw res.error;
        });
        const latestRows = latestHistoryResults.map(res => res.data?.[0]).filter(Boolean);
        let startDate = openDate;
        if (latestRows.length === stocks.length) {
            const serials = latestRows.map(row => Number(row.date_serial));
            const minSerial = Math.min(...serials);
            const maxSerial = Math.max(...serials);
            startDate = minSerial === maxSerial
                ? parseDateValue(latestRows[0]?.date_value)
                : openDate;
        }
        if (repairSparseHistory && startDate && compareDates(startDate, currentDate) >= 0 && Number.isFinite(historyDays) && historyDays >= 0) {
            const requiredStartSerial = historyDays > 0
                ? Math.max(openSerial, currentSerial - historyDays)
                : openSerial;
            const expectedRowsPerStock = Math.max(1, currentSerial - requiredStartSerial + 1);
            const recentHistoryRows = await fetchPaged(() => client
                .from('stock_price_history')
                .select('stock_id,date_serial')
                .eq('account_id', accountId)
                .gte('date_serial', requiredStartSerial)
                .lte('date_serial', currentSerial)
                .in('stock_id', stocks.map(stock => stock.id)));
            const counts = Object.fromEntries(stocks.map(stock => [stock.id, 0]));
            for (const row of recentHistoryRows || []) {
                if (counts[row.stock_id] !== undefined) counts[row.stock_id] += 1;
            }
            const hasSparseHistory = stocks.some(stock => counts[stock.id] < expectedRowsPerStock);
            if (hasSparseHistory) startDate = openDate;
        }
        if (startDate && compareDates(startDate, currentDate) < 0) {
            const key = `${accountId}:${dateKey(currentDate)}`;
            if (!catchUpPromises.has(key)) {
                const promise = settleStocksBetween({ client, accountId, fromDate: startDate, toDate: currentDate })
                    .finally(() => catchUpPromises.delete(key));
                catchUpPromises.set(key, promise);
            }
            await catchUpPromises.get(key);
        }

        await Promise.all(stocks.map(stock =>
            ensureDailyReturnsForMonth(client, accountId, stock.id, currentDate.year, currentDate.month)
        ));
    }

    async function repairMarketHistory(options) {
        const { client, accountId, currentDate } = options;
        assertClient(client);
        if (!accountId || !isValidDate(currentDate)) return;
        const market = await getMarketConfig(client, accountId);
        if (!market?.market_enabled || !isMarketTradable(market, currentDate)) return;
        const openDate = marketOpenDate(market);
        if (!openDate || compareDates(openDate, currentDate) >= 0) return;
        await clearGeneratedMarketData(client, accountId);
        const key = `${accountId}:${dateKey(currentDate)}:repair`;
        if (!catchUpPromises.has(key)) {
            const promise = settleStocksBetweenBulk({ client, accountId, fromDate: openDate, toDate: currentDate })
                .finally(() => catchUpPromises.delete(key));
            catchUpPromises.set(key, promise);
        }
        await catchUpPromises.get(key);
        const stocks = await ensureStockDefinitions(client);
        await Promise.all(stocks.map(stock =>
            ensureDailyReturnsForMonth(client, accountId, stock.id, currentDate.year, currentDate.month)
        ));
    }

    function impactTier(amount) {
        const value = toNumber(amount, 0);
        if (value < 100000) return 0;
        if (value < 250000) return 0.005;
        if (value < 500000) return 0.01;
        if (value < 1000000) return 0.02;
        if (value < 2000000) return 0.035;
        return 0.05;
    }

    async function changeGold(client, accountId, delta) {
        const { data: profile, error } = await client
            .from('profiles')
            .select('gold_gp')
            .eq('id', accountId)
            .single();
        if (error) throw error;
        const nextGold = roundMoney(toNumber(profile.gold_gp, 0) + delta);
        const { error: updateError } = await client
            .from('profiles')
            .update({ gold_gp: nextGold })
            .eq('id', accountId);
        if (updateError) throw updateError;
        return nextGold;
    }

    async function recordOrderImpact(client, accountId, stockId, currentDate, type, totalAmount) {
        const key = dateKey(currentDate);
        const { data: current, error } = await client
            .from('stock_daily_order_totals')
            .select('*')
            .eq('account_id', accountId)
            .eq('stock_id', stockId)
            .eq('date_key', key)
            .maybeSingle();
        if (error) throw error;

        const buyTotal = toNumber(current?.buy_total, 0);
        const sellTotal = toNumber(current?.sell_total, 0);
        const buyImpact = toNumber(current?.buy_impact, 0);
        const sellImpact = toNumber(current?.sell_impact, 0);
        const tradeImpact = impactTier(totalAmount);
        const payload = {
            account_id: accountId,
            stock_id: stockId,
            buy_total: buyTotal,
            sell_total: sellTotal,
            buy_impact: buyImpact,
            sell_impact: sellImpact,
            ...datePayload(currentDate)
        };

        if (type === 'buy') {
            const newTotal = buyTotal + totalAmount;
            payload.buy_total = roundMoney(newTotal);
            payload.buy_impact = roundRate(buyImpact + (tradeImpact || Math.max(0, impactTier(newTotal) - impactTier(buyTotal))));
        } else {
            const newTotal = sellTotal + totalAmount;
            payload.sell_total = roundMoney(newTotal);
            payload.sell_impact = roundRate(sellImpact + (tradeImpact || Math.max(0, impactTier(newTotal) - impactTier(sellTotal))));
        }

        const { error: upsertError } = await client
            .from('stock_daily_order_totals')
            .upsert(payload, { onConflict: 'account_id,stock_id,date_key' });
        if (upsertError) throw upsertError;
    }

    async function getTradableState(client, accountId, stockId, currentDate) {
        const market = await getMarketConfig(client, accountId);
        if (!isMarketTradable(market, currentDate)) throw new Error('白城证券交易所尚未开放。');
        await catchUpMarket({ client, accountId, currentDate });
        await assertStockNotHalted(client, accountId, stockId, currentDate);
        const { data: state, error } = await client
            .from('account_stock_state')
            .select('*')
            .eq('account_id', accountId)
            .eq('stock_id', stockId)
            .single();
        if (error) throw error;
        return state;
    }

    async function getActiveStockHalt(client, accountId, stockId, currentDate) {
        if (!accountId || !stockId || !isValidDate(currentDate)) return null;
        const serial = dateToSerial(currentDate);
        const { data, error } = await client
            .from('stock_trading_halts')
            .select('*')
            .eq('account_id', accountId)
            .eq('stock_id', stockId)
            .lte('start_date_serial', serial)
            .gte('end_date_serial', serial)
            .maybeSingle();
        if (error) {
            if (isMissingRelationError(error)) return null;
            throw error;
        }
        return data || null;
    }

    async function assertStockNotHalted(client, accountId, stockId, currentDate) {
        const halt = await getActiveStockHalt(client, accountId, stockId, currentDate);
        if (!halt) return;
        const endDate = halt.end_date_value || serialToDate(halt.end_date_serial);
        throw new Error(`该股票正在封停交易，封停至 ${endDate.year}-${endDate.month}-${endDate.day}。`);
    }

    async function fetchStockHaltsBetween(client, accountId, stockIds, fromSerial, targetSerial) {
        if (!accountId || !stockIds?.length || !Number.isFinite(fromSerial) || !Number.isFinite(targetSerial)) return [];
        return fetchPaged(() => client
            .from('stock_trading_halts')
            .select('*')
            .eq('account_id', accountId)
            .in('stock_id', stockIds)
            .lte('start_date_serial', targetSerial - 1)
            .gte('end_date_serial', fromSerial)
        ).catch(error => {
            if (isMissingRelationError(error)) return [];
            throw error;
        });
    }

    function groupHaltsByStock(rows) {
        const map = {};
        for (const row of rows || []) {
            if (!map[row.stock_id]) map[row.stock_id] = [];
            map[row.stock_id].push(row);
        }
        return map;
    }

    function isStockHaltedOn(haltsByStock, stockId, serial) {
        return Boolean((haltsByStock?.[stockId] || []).some(row =>
            toNumber(row.start_date_serial, Infinity) <= serial
            && toNumber(row.end_date_serial, -Infinity) >= serial
        ));
    }

    function isMissingRpcError(error) {
        const message = String(error?.message || '');
        return error?.code === 'PGRST202'
            || /trade_stock/i.test(message) && /schema cache|function|could not find/i.test(message);
    }

    async function tradeStockRpc(client, accountId, stockId, quantity, currentDate, type) {
        const { data, error } = await client.rpc('trade_stock', {
            p_account_id: accountId,
            p_stock_id: stockId,
            p_quantity: quantity,
            p_type: type,
            p_current_date: normalizeDate(currentDate)
        });
        if (error) {
            if (isMissingRpcError(error)) return null;
            throw error;
        }
        return {
            price: roundMoney(data?.price),
            total: roundMoney(data?.total),
            quantity: parseInt(data?.quantity, 10),
            gold: roundMoney(data?.gold),
            holdingQuantity: parseInt(data?.holdingQuantity, 10),
            averageCost: roundMoney(data?.averageCost)
        };
    }

    async function buyStock(options) {
        const { client, accountId, stockId, quantity, currentDate } = options;
        const qty = parseInt(quantity, 10);
        if (!Number.isInteger(qty) || qty <= 0) throw new Error('买入数量必须是正整数。');
        await assertStockNotHalted(client, accountId, stockId, currentDate);
        const rpcResult = await tradeStockRpc(client, accountId, stockId, qty, currentDate, 'buy');
        if (rpcResult) return rpcResult;

        const state = await getTradableState(client, accountId, stockId, currentDate);
        const price = roundMoney(state.current_price);
        const total = roundMoney(price * qty);

        const { data: profile, error: profileError } = await client
            .from('profiles')
            .select('gold_gp')
            .eq('id', accountId)
            .single();
        if (profileError) throw profileError;
        if (toNumber(profile.gold_gp, 0) < total) throw new Error('金币不足，无法买入。');

        const { data: holding, error: holdError } = await client
            .from('stock_holdings')
            .select('*')
            .eq('account_id', accountId)
            .eq('stock_id', stockId)
            .maybeSingle();
        if (holdError) throw holdError;

        await changeGold(client, accountId, -total);
        const oldQty = toNumber(holding?.quantity, 0);
        const oldCost = toNumber(holding?.average_cost, 0);
        const newQty = oldQty + qty;
        const averageCost = roundMoney(((oldQty * oldCost) + total) / newQty);
        const { error: holdingError } = await client
            .from('stock_holdings')
            .upsert({
                account_id: accountId,
                stock_id: stockId,
                quantity: newQty,
                average_cost: averageCost,
                updated_at: new Date().toISOString()
            }, { onConflict: 'account_id,stock_id' });
        if (holdingError) throw holdingError;

        await insertTransaction(client, accountId, stockId, currentDate, 'buy', qty, price, total);
        await recordOrderImpact(client, accountId, stockId, currentDate, 'buy', total);
        return { price, total, quantity: qty };
    }

    async function sellStock(options) {
        const { client, accountId, stockId, quantity, currentDate } = options;
        const qty = parseInt(quantity, 10);
        if (!Number.isInteger(qty) || qty <= 0) throw new Error('卖出数量必须是正整数。');
        await assertStockNotHalted(client, accountId, stockId, currentDate);
        const rpcResult = await tradeStockRpc(client, accountId, stockId, qty, currentDate, 'sell');
        if (rpcResult) return rpcResult;

        const state = await getTradableState(client, accountId, stockId, currentDate);
        const price = roundMoney(state.current_price);
        const total = roundMoney(price * qty);

        const { data: holding, error: holdError } = await client
            .from('stock_holdings')
            .select('*')
            .eq('account_id', accountId)
            .eq('stock_id', stockId)
            .maybeSingle();
        if (holdError) throw holdError;
        if (!holding || toNumber(holding.quantity, 0) < qty) throw new Error('持仓不足，无法卖出。');

        const newQty = toNumber(holding.quantity, 0) - qty;
        if (newQty <= 0) {
            const { error: deleteError } = await client
                .from('stock_holdings')
                .delete()
                .eq('account_id', accountId)
                .eq('stock_id', stockId);
            if (deleteError) throw deleteError;
        } else {
            const { error: updateError } = await client
                .from('stock_holdings')
                .update({ quantity: newQty, updated_at: new Date().toISOString() })
                .eq('account_id', accountId)
                .eq('stock_id', stockId);
            if (updateError) throw updateError;
        }

        await changeGold(client, accountId, total);
        await insertTransaction(client, accountId, stockId, currentDate, 'sell', qty, price, total);
        await recordOrderImpact(client, accountId, stockId, currentDate, 'sell', total);
        return { price, total, quantity: qty };
    }

    async function insertTransaction(client, accountId, stockId, currentDate, type, quantity, price, totalAmount) {
        const { error } = await client.from('stock_transactions').insert([{
            account_id: accountId,
            stock_id: stockId,
            type,
            quantity,
            price,
            total_amount: totalAmount,
            ...datePayload(currentDate)
        }]);
        if (error) throw error;
    }

    async function setDmAdjustment(options) {
        const { client, accountId, stockId, currentDate, percentage } = options;
        const value = toNumber(percentage, NaN);
        if (!Number.isFinite(value)) throw new Error('修正百分比必须是数字。');
        const payload = datePayload(currentDate);
        const { error } = await client
            .from('stock_dm_adjustments')
            .upsert({
                account_id: accountId,
                stock_id: stockId,
                effective_date_key: payload.date_key,
                effective_date_value: payload.date_value,
                effective_date_serial: payload.date_serial,
                percentage: roundRate(value),
                created_at: new Date().toISOString()
            }, { onConflict: 'account_id,stock_id,effective_date_key' });
        if (error) throw error;
    }

    async function getStockChangeOnDate(options) {
        const { client, accountId, stockId, date } = options;
        assertClient(client);
        if (!accountId || !stockId || !isValidDate(date)) throw new Error('涨跌查询参数不完整。');
        const payload = datePayload(date);
        const { data: row, error } = await client
            .from('stock_price_history')
            .select('*')
            .eq('account_id', accountId)
            .eq('stock_id', stockId)
            .eq('date_key', payload.date_key)
            .maybeSingle();
        if (error) throw error;
        if (!row) return null;

        let previousPrice = row.previous_price == null ? null : toNumber(row.previous_price, null);
        if (!previousPrice) {
            const { data: previousRow, error: previousError } = await client
                .from('stock_price_history')
                .select('price')
                .eq('account_id', accountId)
                .eq('stock_id', stockId)
                .lt('date_serial', payload.date_serial)
                .order('date_serial', { ascending: false })
                .limit(1)
                .maybeSingle();
            if (previousError) throw previousError;
            previousPrice = previousRow ? toNumber(previousRow.price, null) : null;
        }

        const price = toNumber(row.price, 0);
        const change = previousPrice ? (price / previousPrice) - 1 : 0;
        return {
            stock_id: stockId,
            price: roundMoney(price),
            previous_price: previousPrice == null ? null : roundMoney(previousPrice),
            change: roundRate(change),
            ...payload
        };
    }

    async function splitStock(options) {
        const { client, accountId, stockId, currentDate, ratioFrom = 1, ratioTo } = options;
        assertClient(client);
        const from = parseInt(ratioFrom, 10);
        const to = parseInt(ratioTo, 10);
        if (!accountId || !stockId || !isValidDate(currentDate)) throw new Error('拆股参数不完整。');
        if (from !== 1 || !Number.isInteger(to) || to <= 1) throw new Error('目前只支持 1:N 拆股。');

        const stocks = await ensureStockDefinitions(client);
        const stock = stocks.find(item => item.id === stockId);
        if (!stock) throw new Error('股票不存在。');

        const factor = to / from;
        const { data: stateRows, error: stateReadError } = await client
            .from('account_stock_state')
            .select('*')
            .eq('account_id', accountId)
            .eq('stock_id', stockId);
        if (stateReadError) throw stateReadError;
        const { data: holdingRows, error: holdingReadError } = await client
            .from('stock_holdings')
            .select('*')
            .eq('account_id', accountId)
            .eq('stock_id', stockId);
        if (holdingReadError) throw holdingReadError;
        const splitPayload = datePayload(currentDate);
        const { data: currentHistory, error: currentHistoryError } = await client
            .from('stock_price_history')
            .select('*')
            .eq('account_id', accountId)
            .eq('stock_id', stockId)
            .eq('date_key', splitPayload.date_key)
            .maybeSingle();
        if (currentHistoryError) throw currentHistoryError;

        const originalCurrentPrice = roundMoney(toNumber(stateRows?.[0]?.current_price, stock.initial_price));
        const splitPrice = roundMoney(originalCurrentPrice / factor);
        const stateUpdates = (stateRows?.length ? stateRows : [{ account_id: accountId, stock_id: stockId, current_price: originalCurrentPrice }]).map(row => ({
            ...row,
            current_price: splitPrice,
            updated_at: new Date().toISOString()
        }));
        const holdingUpdates = (holdingRows || []).map(row => ({
            ...row,
            quantity: Math.floor(toNumber(row.quantity, 0) * factor),
            average_cost: roundMoney(toNumber(row.average_cost, 0) / factor),
            updated_at: new Date().toISOString()
        }));
        for (const chunk of chunkArray(stateUpdates, DB_WRITE_CHUNK_SIZE)) {
            const { error } = await client.from('account_stock_state').upsert(chunk, { onConflict: 'account_id,stock_id' });
            if (error) throw error;
        }
        for (const chunk of chunkArray(holdingUpdates, DB_WRITE_CHUNK_SIZE)) {
            const { error } = await client.from('stock_holdings').upsert(chunk, { onConflict: 'account_id,stock_id' });
            if (error) throw error;
        }

        const { error: staleHistoryError } = await client
            .from('stock_price_history')
            .delete()
            .eq('account_id', accountId)
            .eq('stock_id', stockId)
            .gt('date_serial', splitPayload.date_serial);
        if (staleHistoryError) throw staleHistoryError;

        const { error: splitHistoryError } = await client
            .from('stock_price_history')
            .upsert({
                account_id: accountId,
                stock_id: stockId,
                price: splitPrice,
                base_return: roundRate(currentHistory?.base_return || 0),
                order_impact: roundRate(currentHistory?.order_impact || 0),
                dm_adjustment: roundRate(currentHistory?.dm_adjustment || 0),
                previous_price: currentHistory?.previous_price == null
                    ? originalCurrentPrice
                    : roundMoney(toNumber(currentHistory.previous_price, stock.initial_price)),
                ...splitPayload
            }, { onConflict: 'account_id,stock_id,date_key' });
        if (splitHistoryError) throw splitHistoryError;

        const title = `${stock.name} 宣布 1:${to} 拆股`;
        const body = `${stock.name}（${stock.code}）完成 1:${to} 拆股。持股数量按 ${to} 倍调整，当前价按比例折算；拆股日前历史价格保留，之后走势重新计算。`;
        const { error: newsError } = await client.from('stock_news').insert([{
            account_id: accountId,
            stock_id: stockId,
            type: 'split',
            title,
            body,
            ratio_from: from,
            ratio_to: to,
            ...datePayload(currentDate)
        }]);
        if (newsError) throw newsError;
    }

    async function haltStockTrading(options) {
        const { client, accountId, stockId, currentDate, days, reason = '' } = options;
        assertClient(client);
        const haltDays = parseInt(days, 10);
        if (!accountId || !stockId || !isValidDate(currentDate)) throw new Error('封停参数不完整。');
        if (!Number.isInteger(haltDays) || haltDays <= 0) throw new Error('封停天数必须是正整数。');

        const stocks = await ensureStockDefinitions(client);
        const stock = stocks.find(item => item.id === stockId);
        if (!stock) throw new Error('股票不存在。');

        const startDate = normalizeDate(currentDate);
        const endDate = addDays(startDate, haltDays - 1);
        const startPayload = datePayload(startDate);
        const endPayload = datePayload(endDate);
        const zeroReturnRows = [];
        for (let serial = startPayload.date_serial; serial <= endPayload.date_serial; serial++) {
            zeroReturnRows.push({
                account_id: accountId,
                stock_id: stockId,
                base_return: 0,
                ...datePayload(serialToDate(serial))
            });
        }
        const { error: haltError } = await client
            .from('stock_trading_halts')
            .upsert({
                account_id: accountId,
                stock_id: stockId,
                start_date_key: startPayload.date_key,
                start_date_value: startPayload.date_value,
                start_date_serial: startPayload.date_serial,
                end_date_key: endPayload.date_key,
                end_date_value: endPayload.date_value,
                end_date_serial: endPayload.date_serial,
                days: haltDays,
                reason: String(reason || '').trim() || null,
                created_at: new Date().toISOString()
            }, { onConflict: 'account_id,stock_id' });
        if (haltError) throw haltError;

        for (const chunk of chunkArray(zeroReturnRows, DB_WRITE_CHUNK_SIZE)) {
            const { error } = await client
                .from('stock_daily_returns')
                .upsert(chunk, { onConflict: 'account_id,stock_id,date_key' });
            if (error) throw error;
        }

        const { error: staleHistoryError } = await client
            .from('stock_price_history')
            .delete()
            .eq('account_id', accountId)
            .eq('stock_id', stockId)
            .gt('date_serial', startPayload.date_serial);
        if (staleHistoryError) throw staleHistoryError;

        const title = `${stock.name} 暂停交易 ${haltDays} 日`;
        const body = `${stock.name}（${stock.code}）自 ${startDate.year}-${startDate.month}-${startDate.day} 至 ${endDate.year}-${endDate.month}-${endDate.day} 暂停交易。`;
        const { error: newsError } = await client.from('stock_news').insert([{
            account_id: accountId,
            stock_id: stockId,
            type: 'halt',
            title,
            body,
            ratio_from: 1,
            ratio_to: 1,
            ...startPayload
        }]);
        if (newsError) throw newsError;

        return {
            stock,
            days: haltDays,
            startDate,
            endDate
        };
    }

    async function resumeStockTrading(options) {
        const { client, accountId, stockId, currentDate } = options;
        assertClient(client);
        if (!accountId || !stockId || !isValidDate(currentDate)) throw new Error('解除封停参数不完整。');

        const stocks = await ensureStockDefinitions(client);
        const stock = stocks.find(item => item.id === stockId);
        if (!stock) throw new Error('股票不存在。');

        const payload = datePayload(currentDate);
        const { data: halt, error: haltReadError } = await client
            .from('stock_trading_halts')
            .select('*')
            .eq('account_id', accountId)
            .eq('stock_id', stockId)
            .maybeSingle();
        if (haltReadError) throw haltReadError;
        if (!halt) throw new Error('该股票没有封停记录。');

        const { error: haltDeleteError } = await client
            .from('stock_trading_halts')
            .delete()
            .eq('account_id', accountId)
            .eq('stock_id', stockId);
        if (haltDeleteError) throw haltDeleteError;

        const { error: staleReturnsError } = await client
            .from('stock_daily_returns')
            .delete()
            .eq('account_id', accountId)
            .eq('stock_id', stockId)
            .gte('date_serial', payload.date_serial);
        if (staleReturnsError) throw staleReturnsError;

        const { error: staleHistoryError } = await client
            .from('stock_price_history')
            .delete()
            .eq('account_id', accountId)
            .eq('stock_id', stockId)
            .gt('date_serial', payload.date_serial);
        if (staleHistoryError) throw staleHistoryError;

        const resumeDate = payload.date_value;
        const title = `${stock.name} 恢复交易`;
        const body = `${stock.name}（${stock.code}）自 ${resumeDate.year}-${resumeDate.month}-${resumeDate.day} 起解除封停并恢复交易。`;
        const { error: newsError } = await client.from('stock_news').insert([{
            account_id: accountId,
            stock_id: stockId,
            type: 'resume',
            title,
            body,
            ratio_from: 1,
            ratio_to: 1,
            ...payload
        }]);
        if (newsError) throw newsError;

        return {
            stock,
            resumedDate: payload.date_value
        };
    }

    async function loadSnapshot(options) {
        const { client, accountId, currentDate, includeFuture = false, historyDays = 45 } = options;
        assertClient(client);
        const market = await getMarketConfig(client, accountId);
        if (market.market_enabled && currentDate && isMarketTradable(market, currentDate)) {
            await catchUpMarket({ client, accountId, currentDate, historyDays });
        }

        const stocks = await ensureStockDefinitions(client);
        const stockIds = stocks.map(stock => stock.id);
        const currentSerial = currentDate ? dateToSerial(currentDate) : null;
        const makeHistoryQuery = () => {
            let query = client
                .from('stock_price_history')
                .select('*')
                .eq('account_id', accountId)
                .in('stock_id', stockIds)
                .order('date_serial', { ascending: true });
            if (currentDate) {
                if (!includeFuture) query = query.lte('date_serial', currentSerial);
                if (Number.isFinite(historyDays) && historyDays > 0) {
                    query = query.gte('date_serial', currentSerial - historyDays);
                }
            }
            return query;
        };
        const makeHaltsQuery = () => {
            let query = client
                .from('stock_trading_halts')
                .select('*')
                .eq('account_id', accountId)
                .in('stock_id', stockIds);
            if (currentSerial != null) {
                query = query.lte('start_date_serial', currentSerial).gte('end_date_serial', currentSerial);
            }
            return query;
        };
        const [statesRes, holdingsRes, historyRows, trendsRes, returnsRes, dmRes, newsRows, haltRows] = await Promise.all([
            client.from('account_stock_state').select('*').eq('account_id', accountId).in('stock_id', stockIds),
            client.from('stock_holdings').select('*').eq('account_id', accountId).in('stock_id', stockIds),
            fetchPaged(makeHistoryQuery),
            client.from('stock_monthly_trends').select('*').eq('account_id', accountId).eq('year', currentDate.year).eq('month', currentDate.month).in('stock_id', stockIds),
            client.from('stock_daily_returns').select('*').eq('account_id', accountId).eq('year', currentDate.year).eq('month', currentDate.month).in('stock_id', stockIds).order('day', { ascending: true }),
            client.from('stock_dm_adjustments').select('*').eq('account_id', accountId).in('stock_id', stockIds),
            fetchPaged(() => client.from('stock_news').select('*').eq('account_id', accountId).order('date_serial', { ascending: false }).order('created_at', { ascending: false }).limit(20)).catch(() => []),
            fetchPaged(makeHaltsQuery).catch(error => {
                if (isMissingRelationError(error)) return [];
                throw error;
            })
        ]);
        for (const res of [statesRes, holdingsRes, trendsRes, returnsRes, dmRes]) {
            if (res.error) throw res.error;
        }

        const history = includeFuture
            ? (historyRows || [])
            : (historyRows || []).filter(row => row.date_serial <= dateToSerial(currentDate));
        const historyByStock = {};
        for (const row of history) {
            if (!historyByStock[row.stock_id]) historyByStock[row.stock_id] = [];
            historyByStock[row.stock_id].push(row);
        }

        return {
            market,
            openDate: marketOpenDate(market),
            tradable: currentDate ? isMarketTradable(market, currentDate) : false,
            stocks,
            states: Object.fromEntries((statesRes.data || []).map(row => [row.stock_id, row])),
            holdings: Object.fromEntries((holdingsRes.data || []).map(row => [row.stock_id, row])),
            historyByStock,
            trends: Object.fromEntries((trendsRes.data || []).map(row => [row.stock_id, row])),
            dailyReturns: returnsRes.data || [],
            dmAdjustments: dmRes.data || [],
            news: newsRows || [],
            halts: Object.fromEntries((haltRows || []).map(row => [row.stock_id, row]))
        };
    }

    async function rollbackStocksToDate(options) {
        const { client, accountId, targetDate } = options;
        assertClient(client);
        if (!accountId || !isValidDate(targetDate)) return;
        const targetSerial = dateToSerial(targetDate);

        const futureTransactions = await fetchPaged(() => client
            .from('stock_transactions')
            .select('*')
            .eq('account_id', accountId)
            .gt('date_serial', targetSerial)
            .order('date_serial', { ascending: false }));

        for (const tx of futureTransactions || []) {
            const amount = toNumber(tx.total_amount, 0);
            await changeGold(client, accountId, tx.type === 'buy' ? amount : -amount);
        }

        for (const table of ['stock_transactions', 'stock_price_history', 'stock_daily_order_totals', 'stock_dm_adjustments', 'stock_news', 'stock_trading_halts']) {
            const serialColumn = table === 'stock_dm_adjustments'
                ? 'effective_date_serial'
                : table === 'stock_trading_halts'
                    ? 'start_date_serial'
                    : 'date_serial';
            const { error } = await client.from(table).delete().eq('account_id', accountId).gt(serialColumn, targetSerial);
            if (error) throw error;
        }
        const { error: returnDeleteError } = await client
            .from('stock_daily_returns')
            .delete()
            .eq('account_id', accountId)
            .gt('date_serial', targetSerial);
        if (returnDeleteError) throw returnDeleteError;

        const stocks = await ensureStockDefinitions(client);
        const keptTransactions = await fetchPaged(() => client
            .from('stock_transactions')
            .select('*')
            .eq('account_id', accountId)
            .lte('date_serial', targetSerial)
            .order('date_serial', { ascending: true })
            .order('created_at', { ascending: true }));

        const holdings = {};
        for (const tx of keptTransactions || []) {
            if (!holdings[tx.stock_id]) holdings[tx.stock_id] = { quantity: 0, costBasis: 0 };
            const h = holdings[tx.stock_id];
            const qty = toNumber(tx.quantity, 0);
            const amount = toNumber(tx.total_amount, 0);
            if (tx.type === 'buy') {
                h.quantity += qty;
                h.costBasis += amount;
            } else {
                const average = h.quantity > 0 ? h.costBasis / h.quantity : 0;
                h.quantity -= qty;
                h.costBasis = Math.max(0, h.costBasis - average * qty);
            }
        }

        const { error: holdingDeleteError } = await client
            .from('stock_holdings')
            .delete()
            .eq('account_id', accountId);
        if (holdingDeleteError) throw holdingDeleteError;
        const holdingRows = Object.entries(holdings)
            .filter(([, h]) => h.quantity > 0)
            .map(([stockId, h]) => ({
                account_id: accountId,
                stock_id: stockId,
                quantity: h.quantity,
                average_cost: roundMoney(h.costBasis / h.quantity),
                updated_at: new Date().toISOString()
            }));
        if (holdingRows.length) {
            const { error } = await client.from('stock_holdings').insert(holdingRows);
            if (error) throw error;
        }

        const targetHistory = await fetchPaged(() => client
            .from('stock_price_history')
            .select('*')
            .eq('account_id', accountId)
            .lte('date_serial', targetSerial)
            .order('date_serial', { ascending: false }));
        const historyByStock = {};
        for (const row of targetHistory || []) {
            if (!historyByStock[row.stock_id]) historyByStock[row.stock_id] = row;
        }

        const stateRows = stocks.map(stock => ({
            account_id: accountId,
            stock_id: stock.id,
            current_price: roundMoney(historyByStock[stock.id]?.price || stock.initial_price),
            updated_at: new Date().toISOString()
        }));
        const { error: stateError } = await client
            .from('account_stock_state')
            .upsert(stateRows, { onConflict: 'account_id,stock_id' });
        if (stateError) throw stateError;
    }

    window.BaichengStocks = {
        STOCK_DEFINITIONS,
        TREND_CONFIGS,
        addDays,
        buyStock,
        catchUpMarket,
        clearGeneratedStockData,
        compareDates,
        dateKey,
        dateToSerial,
        deleteAccountStockData,
        formatDate: formatDisplayDate,
        getMarketConfig,
        haltStockTrading,
        getStockChangeOnDate,
        impactTier,
        isMarketTradable,
        loadSnapshot,
        marketOpenDate,
        repairMarketHistory,
        resumeStockTrading,
        rollbackStocksToDate,
        sellStock,
        setDmAdjustment,
        setMarketConfig,
        splitStock,
        settleStocksBetween
    };
})();
