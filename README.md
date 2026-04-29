# 🛠️ DM 数据库运维手册 (SQL Operations Manual)

> **操作提示**：所有命令请在 Supabase 的 **SQL Editor** 中运行。
> 涉及具体玩家时，请将代码中的 `'master@almorel.com'` 替换为实际玩家邮箱。

### 1. 🔑 权限与账号管理

#### 设置管理员权限 (Root / DM)
*   **Root**: 最高权限，能看全服日志、分配 DM。
*   **DM**: 能管理分配给自己的玩家，能上架商品。
```sql
-- 将某人设为 DM
insert into admin_users (id, role_level)
select id, 'dm' from auth.users where email = 'IDRotF@1.com'
on conflict (id) do update set role_level = 'dm';
```

#### 指派玩家给特定 DM
```sql
-- 将玩家 A 指派给 DM B 管理
update profiles 
set assigned_dm_id = (select id from auth.users where email = 'dm的邮箱@qq.com')
where email = '玩家的邮箱@gmail.com';
```

#### 强行激活账号 (修复 Email not confirmed)
```sql
update auth.users set email_confirmed_at = now() where email = '玩家邮箱@example.com';
```

---
### 2. 📜 政务厅 (V2)：发布新议案与多轮决胜

这是推动领地剧情的核心功能。在 V2 版本中，你可以发布传统的“是非题”议案，也可以发布带有不同预算的“多项选择题”议案。

#### 发布一条【是非题】提案 
最基础的赞成/反对模式。

```sql
do $$
declare
  target_uid uuid;
begin
  -- 1. 选定目标玩家 (请替换为真实的玩家邮箱或ID)
  select id into target_uid from auth.users where email = 'master@almorel.com';

  if target_uid is not null then
    -- 2. 插入提案
    insert into city_proposals_v2 (user_id, proposer_name, title, description, proposal_type, cost) values
    (
      target_uid, 
      '薇艾拉', -- 提案人名字 (必须是该玩家有的雇员，否则头像不显示)
      '增加城门夜间守卫', 
      '最近城外流寇频发，我建议将夜班守卫数量增加一倍，以防万一。', 
      'boolean', -- 指定为是非题
      500 -- 批准所需扣除的金币
    );
  end if;
end $$;
```

#### 发布一条【选择题】提案
当事件包含多个走向，且每个选项开销不同（甚至可以赚钱）时使用。

```sql
do $$
declare
  target_uid uuid;
begin
  -- 1. 选定目标玩家
  select id into target_uid from auth.users where email = 'master@almorel.com';

  if target_uid is not null then
    -- 2. 插入提案。注意 choice 类型不需要填外层的 cost，而是在 options 的 JSON 里填
    insert into city_proposals_v2 (user_id, proposer_name, title, description, proposal_type, options) values
    (
      target_uid, 
      '克莱门汀·瓦勒留斯', 
      '关于北区贫民窟的实地查探与改建评估', 
      '致各位真龙领主：关于北墙外的贫民窟，我已完成初步的情报汇总。请诸位在以下方案中做出抉择。', 
      'choice', -- 指定为选择题
      -- 核心：用 JSONB 格式定义选项池。cost 可以是正数(扣钱)、0 或负数(赚钱)
      '[
        {"id": "opt_A", "text": "方案A：交由竖琴手同盟暗中代管", "cost": 15000},
        {"id": "opt_B", "text": "方案B：雇佣冒险者公会武力接管", "cost": 30000},
        {"id": "opt_C", "text": "方案C：保留黑市，抽取高额特许税", "cost": -20000}
      ]'::jsonb 
    );
  end if;
end $$;
```

#### 重置/删除提案（多选）
由于 V2 版本引入了多轮投票机制（`proposal_votes_v2` 表），在重置状态时，最好连同旧选票一起清理，并重置时间，以便让玩家重新走一遍流程。

```sql
-- 1. 删除某个标题的提案
-- (注：我们在建表时使用了 ON DELETE CASCADE，所以这里删除了议案，对应的投票记录也会自动删掉，非常安全)
delete from city_proposals_v2 where title = '关于北区贫民窟的实地查探与改建评估';

-- 2. 重置某个提案（让大家重新投第一轮）
do $$
declare
  target_prop_id integer;
begin
  -- 找到目标提案的 ID
  select id into target_prop_id from city_proposals_v2 where title = '关于北区贫民窟的实地查探与改建评估' limit 1;
  
  if target_prop_id is not null then
    -- 清空所有的投票记录
    delete from proposal_votes_v2 where proposal_id = target_prop_id;
    
    -- 将状态打回待办，轮次归1，清空系统判定理由，重置倒计时为今天
    update city_proposals_v2 
    set status = 'pending', 
        current_round = 1, 
        decision_reason = null, 
        created_at = now() 
    where id = target_prop_id;
  end if;
end $$;
```
#### 重置/删除某个提案（是非）

```sql

-- 删除某个标题的提案

delete from city_proposals where title = '扩建奥术研究室';



-- 或者重置状态为“待审批”

update city_proposals set status = 'pending' where title = '扩建奥术研究室';

```
---
### 3. 🏰 领地经济：修改收支与人口 (多城架构版)

> **当前可用地域代码：**
> - `almorel` (艾尔莫瑞尔 - 首都)
> - `dragon_mine` (巨龙之心矿区)
> - `herakmar` (赫拉克玛尔城)
> - `khilku` (希尔库港)

#### 修改城市基础数据 (人口/补贴)
```sql
-- 修改首都艾尔莫瑞尔的人口与援助
update city_stats 
set population = 6500, -- 修改人口
    subsidy = 0        -- 修改外部援助 (例如莱瑟曼撤资)
where location = 'almorel' -- 【关键】必须指定城市
and user_id = (select id from auth.users where email = 'master@almorel.com');
```

#### 增加新的支出项目 (City Expenses)
```sql
-- 插入一条新的【艾尔莫瑞尔】建筑维护费
insert into city_expenses (user_id, location, name, count, unit_cost, category)
select id, 'almorel', '魔法塔能量维护', 1, 500, 'building' -- category可选: staff(职员), building(建筑), trade_cost(贸易成本)
from auth.users where email = 'master@almorel.com';

-- 🌟 示例：给【巨龙之心矿区】增加安保开销
insert into city_expenses (user_id, location, name, count, unit_cost, category)
select id, 'dragon_mine', '矿区重甲监工', 5, 100, 'staff'
from auth.users where email = 'master@almorel.com';
```

#### 增加新的收入项目 (City Incomes)
```sql
-- 插入一条新的【艾尔莫瑞尔】贸易收入 (category 设为 'trade')
insert into city_incomes (user_id, location, name, count, unit_price, amount, category)
select id, 'almorel', '向哈鲁阿出口卷轴', 10, 200, 2000, 'trade' -- category可选: tax(专项税), state(国营产业), trade(对外贸易)
from auth.users where email = 'master@almorel.com';

-- 🌟 示例：插入一条【巨龙之心矿区】的国营矿石收入 (category 设为 'state')
insert into city_incomes (user_id, location, name, count, unit_price, amount, category)
select id, 'dragon_mine', '精金原矿直销', 5, 800, 4000, 'state' 
from auth.users where email = 'master@almorel.com';
```

#### 修改现有支出项目的数值
```sql
-- 例如：艾尔莫瑞尔的铁矿进货价涨了
update city_expenses 
set unit_cost = 450 
where name like '%铁矿%' 
and location = 'almorel' -- 【关键】只涨艾尔莫瑞尔的铁矿成本
and user_id = (select id from auth.users where email = 'master@almorel.com');
```

#### 修改现有收入项目的数值
```sql
-- 例如：火绳枪贸易单价上涨 (3把 x 550 变成 3把 x 660)
update city_incomes 
set unit_price = 660, 
    amount = count * 660 
where name like '%火绳枪%' 
and location = 'almorel' 
and user_id = (select id from auth.users where email = 'master@almorel.com');

-- 修改城市税率
update city_stats 
set tax_rate = 1.5  -- 在这里填入你想要的新税率，比如 1.5
where location = 'almorel' 
  and user_id = (select id from auth.users where email = 'master@almorel.com');
```

#### 修改现有人员的数量 (扩编/裁员)
```sql
-- 给【艾尔莫瑞尔】已有的市政杂工数量 +2 (外交部1 + 情报部1)
update city_expenses 
set count = count + 2 
where name = '市政杂工' 
and location = 'almorel' 
and user_id = (select id from auth.users where email = 'master@almorel.com');

-- 给【艾尔莫瑞尔】已有的市政文职人员数量 +3 (外交部2 + 情报部1)
update city_expenses 
set count = count + 3 
where name = '市政文职人员' 
and location = 'almorel' 
and user_id = (select id from auth.users where email = 'master@almorel.com');
```



### 4. 🏬 集市与图鉴管理

#### 从图鉴批量随机进货
```sql
-- 给指定玩家随机上架
select admin_random_restock((select id from auth.users where email = 'master@almorel.com'));

-- 全服公共随机上架 (参数填 null)
select admin_random_restock(null);
```
#### 下架某个人的所有商品
```sql
DELETE FROM shop_items 
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'master@almorel.com');
```

#### 往图鉴 (Compendium) 添加新物品
这样以后你在后台搜素时就能搜到它。
```sql
insert into compendium_items (name, rarity, category, price, description) values
('斩首巨剑', '传说', '魔法物品', 25000, '对特定生物造成斩首效果...');
```

---

### 5. 👥 雇员与队伍状态

#### 更改雇员状态 (在职/休假/离职)
```sql
-- 让 "艾斯特拉" 结束休假，回来上班
update employees 
set status = '在职' 
where name = '艾斯特拉' and user_id = (select id from auth.users where email = 'master@almorel.com');
```

#### 晋升为核心队友
核心队友不会显示工资，且不能被解雇。
```sql
update employees 
set role = '核心队友', salary = 0 
where name = '某个NPC名字';
```

#### 加入某人
为伊凡·琴创建核心队友档案
```sql
insert into employees (name, salary, status, role, is_in_party, user_id)
select 
  '伊凡·琴',      -- 名字
  0,             -- 核心队友薪资为0
  '在职',         -- 初始状态
  '核心队友',     -- 身份标识
  false,         -- 初始不在队伍中
  id             -- 关联 master 账号的 ID
from auth.users 
where email = 'master@almorel.com'
on conflict do nothing;
```

#### 修复头像错误
如果上传头像失败，可以手动更新 URL。
```sql
update employees 
set avatar_url = 'https://你的图片地址.png' 
where name = '凯拉';
```

---

### 6. 🎒 玩家背包急救

#### 删除顽固物品 (无法在前端删除时)
```sql
delete from user_inventory 
where item_name = '博丽币' 
and user_id = (select id from auth.users where email = 'master@almorel.com');
```

#### 强行修改物品数量
```sql
update user_inventory 
set quantity = 99 
where item_name = '治疗药水' 
and user_id = (select id from auth.users where email = 'master@almorel.com');
```

---

### 7. 🚨 紧急修复 (RLS 权限重置)

如果突然谁都看不了数据，或者报错 Permission Denied，运行这个全开补丁（慎用，仅调试）：

```sql
-- 允许所有登录用户查看所有表 (仅用于排查问题)
create policy "Emergency Read All" on profiles for select using (auth.role() = 'authenticated');
create policy "Emergency Read Inventory" on user_inventory for select using (auth.role() = 'authenticated');
```

### 8. 🃏 军推卡牌与战局管理

#### 录入新卡牌 (添加至卡牌图鉴)
```sql
-- id 建议以 a_ 或 e_ 开头以区分阵营。readiness_bonus 仅帝国生效。
insert into war_cards (id, faction, name, effect, readiness_bonus) values
('a_01', 'alliance', '竖琴手急报', '（事件）揭示一个相邻区域的敌军动向。', 0),
('e_01', 'empire', '强行军指令', '（事件）目标部队立刻进行一次额外的移动。', 3);
```

#### 配置或补充抽牌堆 (Draw Pile)
在游戏开始前，或需要给某一方强行塞牌时使用。数组左侧为牌顶。
```sql
-- 覆盖联军的抽牌堆
update war_decks 
set draw_pile = '["a_01", "a_02", "a_03"]'::jsonb 
where faction = 'alliance';

-- 覆盖帝国的抽牌堆
update war_decks 
set draw_pile = '["e_01", "e_02"]'::jsonb 
where faction = 'empire';
```

#### 紧急修改进度条 (整备度/凝聚力)
```sql
update war_state 
set empire_readiness = 30, alliance_readiness = 90 
where id = 1;
```
#### 洗入新增手牌
```sql
UPDATE war_decks SET 
    draw_pile = (SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) FROM war_cards WHERE faction = 'alliance'), 
    hand = '[]'::jsonb, 
    discard_pile = '[]'::jsonb 
WHERE faction = 'alliance';

UPDATE war_decks SET 
    draw_pile = (SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) FROM war_cards WHERE faction = 'empire'), 
    hand = '[]'::jsonb, 
    discard_pile = '[]'::jsonb 
WHERE faction = 'empire';
```

#### 重置战局 (重开一局)
```sql
-- 1. 重置战局全局状态 (回到第1回合、联军弃牌阶段、清空悬挂任务、恢复初始整备度)
UPDATE war_state 
SET current_turn = 1, 
    active_faction = 'alliance', 
    current_phase = 'discard',
    empire_readiness = 20,    -- 假设帝国初始整备度是 20
    alliance_readiness = 100, -- 假设联军初始凝聚力是 100
    active_quests = '[]'::jsonb
WHERE id = 1;

-- 2. 联军牌堆重置 (清空手牌/弃牌，将图鉴里所有联军卡牌全自动洗入抽牌堆)
UPDATE war_decks 
SET draw_pile = (SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) FROM war_cards WHERE faction = 'alliance'),
    hand = '[]'::jsonb,
    discard_pile = '[]'::jsonb
WHERE faction = 'alliance';

-- 3. 帝国牌堆重置 (清空手牌/弃牌，将图鉴里所有帝国卡牌全自动洗入抽牌堆)
UPDATE war_decks 
SET draw_pile = (SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) FROM war_cards WHERE faction = 'empire'),
    hand = '[]'::jsonb,
    discard_pile = '[]'::jsonb
WHERE faction = 'empire';

-- 4. (可选) 清空上一局的战报日志，让公屏清爽干干净净
TRUNCATE TABLE war_logs RESTART IDENTITY;
INSERT INTO war_logs (log_text) VALUES ('【系统】旧的战局已归档。全新楚尔特战役推演正式启动！');
```
## 授权说明

本仓库采用双重授权结构。
同时，第三方素材与依赖库遵循其各自的原始许可证。

### 代码部分

本仓库中的源代码使用 **GNU General Public License v3.0** 授权。

包括但不限于：

- 各类html
- 配置文件
- 构建相关代码

详见 [`LICENSE`](./LICENSE)。

### 非代码内容部分

除非另有说明，本仓库中的非代码内容使用  
**Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International**  
即 **CC BY-NC-SA 4.0** 授权。

包括但不限于：

- 世界观设定
- 任何剧情文本
- 角色描述
- 阵营描述
- 地图
- 图片
- 插画
- UI 视觉稿
- 设定文档
- 叙事内容

详见 [`LICENSE-CONTENT`](./LICENSE-CONTENT)。

### 商业使用

未经版权持有人明确书面许可，不得将非代码内容用于商业用途。

Copyright © 2026 滑而不稽则罔.
“滑而不稽则罔”为作者公开使用的笔名。
---

