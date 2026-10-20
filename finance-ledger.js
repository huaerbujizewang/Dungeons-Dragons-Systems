(function (root) {
    'use strict';

    let settings = null;
    let operationSequence = 0;

    const sourceLabels = {
        shop_purchase: '购买物品',
        item_sale: '出售物品',
        refund: '购买退款',
        gacha: '干员寻访',
        wheel: '军械库转盘',
        bank_deposit: '银行存款',
        bank_withdraw: '银行取款',
        bank_interest: '银行利息',
        stock_buy: '买入股票',
        stock_sell: '卖出股票',
        stock_reversal: '股票交易撤回',
        city_settlement: '城市月度结算',
        proposal_budget: '议案预算结算'
    };

    function configure(options) {
        settings = { url: options.url, key: options.key };
    }

    function encodeContext(context) {
        if (!sourceLabels[context.source]) throw new Error('未知的资金交易来源。');
        const payload = {
            source: context.source,
            title: String(context.title || sourceLabels[context.source]).slice(0, 120),
            note: String(context.note || '').slice(0, 2000),
            details: context.details || {}
        };
        const bytes = new TextEncoder().encode(JSON.stringify(payload));
        if (bytes.length > 12000) throw new Error('资金交易明细过长。');
        return root.btoa(String.fromCharCode(...bytes));
    }

    async function withContext(client, context) {
        if (!settings) throw new Error('资金记录模块尚未初始化。');
        const encoded = encodeContext(context);
        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        if (!data?.session?.access_token) throw new Error('登录已过期，请重新登录。');

        // Each operation gets its own headers, so concurrent trades cannot share a label.
        return root.supabase.createClient(settings.url, settings.key, {
            auth: {
                persistSession: false, autoRefreshToken: false, detectSessionInUrl: false,
                storageKey: `finance-operation-${++operationSequence}`
            },
            global: {
                headers: {
                    Authorization: `Bearer ${data.session.access_token}`,
                    'X-Finance-Context': encoded
                }
            }
        });
    }

    function participantLabels(entry) {
        const isRequest = ['income', 'expense', 'memo'].includes(entry.entry_type);
        const actor = entry.requester_email || (!isRequest ? entry.reviewer_email : '');
        const labels = actor ? [`${isRequest ? '申请人' : '操作人'}：${actor === 'system' ? '系统' : actor}`] : [];
        if (isRequest && entry.reviewer_email) labels.push(`审批人：${entry.reviewer_email}`);
        return labels;
    }

    const api = { configure, encodeContext, withContext, participantLabels, sourceLabels };
    root.FinanceLedger = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
