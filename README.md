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

## 9. 🕯️ DND / COC 多团支持与新增功能

本节记录近期新增的 COC 兼容功能。原有 DND 功能不需要改动；未特别标记的账号默认仍按 DND 处理。

### 9.1 初始化数据库字段

首次使用前，请在 Supabase SQL Editor 中执行以下两个脚本：

```sql
-- 账号团类型字段：dnd / coc，默认 dnd
-- 文件：profiles_campaign_type.sql

-- 雇员中心第三分栏：中立与社会连结
-- 文件：employees_social_connections.sql
```

也可以直接打开并复制运行：

- `profiles_campaign_type.sql`
- `employees_social_connections.sql`

### 9.2 设置账号为 DND 或 COC

进入主界面后，用 DM 或 Root 账号打开：

```text
DM 控制台 → 玩家资产操控（视角切换） → 选择玩家 → 团类型
```

可选值：

- `DND`：默认模式，保留原本全部 DND 功能。
- `COC`：COC 模式，会隐藏不适合 COC 的入口。

Root 账号还可以在：

```text
安全与权限 → 账号权限管理
```

直接用每个账号右侧的 `DND / COC` 下拉框批量调整。

### 9.3 COC 账号会隐藏哪些入口

账号标记为 `COC` 后，`index.html` 会自动隐藏：

- 战局
- 抽卡
- 地理
- 领地治理
- 政务厅
- 科研中心
- OMNI
- 超位法术
- 法术图鉴
- 物品图鉴

仍保留的主要入口包括：

- 商城
- 队伍
- 背包
- 雇员中心
- 其他内容中未被隐藏的档案入口，例如编年史、人物志、赏金名录、阅报室、敌人图鉴等

### 9.4 COC 显示单位

COC 账号只做 `index.html` 内置显示替换，底层字段名不变。

显示效果：

- DND：`FR1494 2月12日`、`GP`
- COC：`公元1494年2月12日`、`美元`

受影响的前端展示包括：

- 顶栏日期
- 顶栏资金
- DM 控制台玩家资金
- 商店价格
- 雇员薪资
- 悬赏金额
- 出售回收价
- 时间推进 / 结算提示

注意：数据库字段仍是 `profiles.world_date` 和 `profiles.gold_gp`。这是为了兼容旧逻辑，不需要改表名。

### 9.5 COC7th 怪物 / NPC JSON

怪物图鉴现在支持 COC7th 格式。关键字段是：

```json
{
  "system": "coc7th"
}
```

只要 `stat_block.system` 写成 `"coc7th"`，敌人图鉴就会使用 COC 面板渲染，不再按 DND 的 CR / AC / 六维修正值来显示。

完整模板见：

```text
coc7th_bestiary_template.json
```

最小示例：

```json
{
  "system": "coc7th",
  "name": "塞拉斯·卡拉瓦乔",
  "meta": "犯罪主脑",
  "basic_info": {
    "size": "中型",
    "gender": "男",
    "height": "185cm",
    "origin": "全球犯罪网络",
    "birthday": "未知",
    "tags": ["残暴无情", "贪得无厌", "迷恋权力"]
  },
  "hp": 15,
  "armor": "1点 防弹背心",
  "move": 7,
  "characteristics": {
    "str": 60,
    "con": 60,
    "siz": 90,
    "dex": 60,
    "int": 100,
    "app": "35*",
    "pow": 80,
    "edu": 93
  },
  "derived": {
    "san": 50,
    "mp": 16,
    "luck": 80,
    "db": "+1D4",
    "build": 1
  },
  "combat": {
    "attacks_per_round": 1,
    "attacks": [
      { "name": "斗殴", "value": "70%（35/14）", "damage": "1D3+1D4" },
      { "name": ".45自动手枪", "value": "80%（40/16）", "damage": "1D10+2" },
      { "name": "闪避", "value": "45%（22/9）" }
    ]
  },
  "skills": [
    { "name": "估价", "value": "80%" },
    { "name": "信用评级", "value": "90%" },
    { "name": "恐吓", "value": "90%" }
  ],
  "languages": [
    { "name": "英语", "value": "93%" }
  ],
  "special_abilities": [
    {
      "name": "催眠",
      "value": "70%",
      "desc": "目标进行POW对抗检定；成功后目标被控制1D6小时。"
    }
  ],
  "spells": ["支配术", "犹格-索托斯之拳", "枯萎术"],
  "talents": [
    {
      "name": "钢铁意志",
      "desc": "进行意志检定时可以花费10点幸运来获得一个奖励骰。"
    }
  ],
  "background": {
    "appearance": "外貌骇人，个子很高，脸藏在灰白色的面具之下。",
    "traits": "冷酷、精于算计、瑕疵必报",
    "wounds": "面具下似乎有旧战伤。"
  },
  "armor_note": "可填写护甲、异常构造、穿刺武器最小伤害等长说明。",
  "sanity_loss": "知情人丧失1/1D4理智值。",
  "notes": ["*戴着面具（面具下的样貌不为人所知）"],
  "resume": "没人知道他到底是想当世界首富还是想控制全世界。"
}
```

`basic_info` 是故事性档案字段，COC 人物建议至少保留：

- `size`：体型。
- `tags`：标签数组。
- `gender`：性别或宿主说明。
- `height`：数字身高，例如 `185cm`。
- `origin`：出身、活动区域或组织来源。
- `birthday`：生日 / 出生信息。

长履历仍放在顶层 `resume`，与 DND JSON 保持兼容。`background` 只放形象、特质、伤口等背景条目，不再使用 `background.resume`。

如果是会法术或有异常能力的 COC NPC，推荐使用：

- `special_abilities`：催眠、传心术、死亡射线等非普通技能。
- `spells`：可以直接写字符串数组，例如 `["支配术", "犹格-索托斯之拳", "枯萎术"]`。
- `armor_note`：护甲与异常身体结构的长说明。
- `sanity_loss`：理智损失规则。

额外模板见：

```text
coc7th_spellcaster_template.json
```

### 9.6 在 DM 控制台录入 COC7th 怪物

路径：

```text
DM 控制台 → 怪物图鉴在线编辑器
```

使用方式：

1. 选择已有怪物，或留空新建。
2. 填写怪物名称、阵营势力、身份标签、可见权限等基础字段。
3. 点击 `套用 COC7th 模板`，系统会把塞拉斯·卡拉瓦乔模板写入 Stat Block。
4. 根据实际 NPC 修改 JSON。
5. 点击 `保存 / 录入怪物至数据库`。

如果只想让某些玩家看见基础档案，但隐藏战斗数据，可以继续使用：

```text
战斗属性遮罩玩家邮箱
```

填入玩家邮箱或 `all`。被遮罩者打开“战斗属性”页时会看到“情报不足”。

### 9.7 雇员中心新增“中立与社会连结”

雇员中心现在分为三栏：

```text
⚔️ 核心队友
🛡️ 雇员 / 随从
⚖️ 中立与社会连结
```

分类规则来自 `employees.role`：

- `核心队友` → 核心队友栏
- `玩家角色` → 核心队友栏
- `中立与社会连结` → 中立与社会连结栏
- `雇员`、`随从`、其他普通值 → 雇员 / 随从栏

DM 调整路径：

```text
DM 控制台 → 玩家资产操控（视角切换） → 选择玩家 → 人员分类调整
```

可选分类：

- `核心队友`
- `玩家角色`
- `雇员`
- `随从`
- `中立与社会连结`

中立与社会连结通常用于：

- 线人
- 盟友
- 社交关系
- 可交涉 NPC
- 暂不属于队伍或雇佣体系的人物

如果某个社会连结也需要隐藏战斗数据或神话真相，可以在该人物的 `stat_block` 中加入与怪物图鉴相同的遮罩字段：

```json
{
  "visibility": {
    "combat_masked_to": ["all"]
  }
}
```

或只遮罩某些玩家：

```json
{
  "visibility": {
    "combat_masked_to": ["player@example.com"]
  }
}
```

被遮罩者仍能看到基础档案；点击“战斗属性”时会显示“情报不足”。

### 9.8 后台新增人员、玩家角色与可见性

新增或管理人员的路径：

```text
DM 控制台 → 玩家资产操控（视角切换） → 选择玩家
```

选择玩家后，右侧会出现两个新增后台区块：

```text
➕ 新增人员 / 社会连结
👁️ 人员显示 / 情报遮罩
```

`➕ 新增人员 / 社会连结` 用于直接写入 `employees` 数据：

- `姓名`：人物显示名。
- `分类`：核心队友、玩家角色、雇员、随从、中立与社会连结。
- `状态`：默认在职，也可以设置科研中、出差、休假等。
- `薪资 / 资金`：普通雇员薪资；玩家角色会自动使用 `-1`。
- `头像 URL`、`立绘 URL`：可空；立绘可以用英文逗号分隔多张。
- `玩家列表显示`：关闭后，该人物不会出现在普通玩家的人员列表、小队选择和中立与社会连结栏里；DM/root 仍可见。
- `战斗/神话情报遮罩`：填 `all` 或玩家邮箱。人物仍可见，但战斗属性、神话真相显示为“情报不足”。
- `空白 DND`、`COC 普通`、`COC 施法者`：快速生成 `stat_block` 模板。

`👁️ 人员显示 / 情报遮罩` 用于修改已经存在的人物：

- 取消 `玩家列表显示` 或点击 `完全隐藏`：整个人物对玩家隐藏，DM/root 仍可见。
- 点击 `恢复显示`：重新让玩家在对应分栏看到该人物。
- 填写遮罩邮箱或 `all`：玩家能看到基础档案，但看不到战斗/神话信息。
- 点击 `加入当前` 会把当前选中的玩家邮箱加入遮罩列表。

COC 账号的人员卡会隐藏 DND 雇员流程按钮：

- `填卡`
- `履历`
- `出差`
- `调回`

COC 人员、玩家角色和社会连结请优先使用后台的 `人员 / 社会连结 JSON` 与 `人员图片管理` 维护。

这两个开关的区别：

```text
is_visible_to_player = false
→ 玩家完全看不见这个人物。

stat_block.visibility.combat_masked_to = ["all"] 或 ["player@example.com"]
→ 玩家看得见人物，但战斗/神话情报显示为“情报不足”。
```

启用后台可见性开关前，请先在 Supabase 执行：

```text
employees_visibility.sql
```

### 9.9 SQL 直接操作示例

#### 将账号标记为 COC

```sql
update profiles
set campaign_type = 'coc'
where email = '玩家邮箱@example.com';
```

#### 将账号恢复为 DND

```sql
update profiles
set campaign_type = 'dnd'
where email = '玩家邮箱@example.com';
```

#### 将某人改为中立与社会连结

```sql
update employees
set role = '中立与社会连结'
where name = '某个NPC名字'
and user_id = (select id from auth.users where email = '玩家邮箱@example.com');
```

#### 新增一个社会连结人物

```sql
insert into employees (name, salary, status, role, is_in_party, is_visible_to_player, user_id)
select
  '塞拉斯·卡拉瓦乔',
  0,
  '在职',
  '中立与社会连结',
  false,
  true,
  id
from auth.users
where email = '玩家邮箱@example.com';
```

#### 新增一个玩家暂时看不见的社会连结

```sql
insert into employees (name, salary, status, role, is_in_party, is_visible_to_player, stat_block, user_id)
select
  '未知线人',
  0,
  '在职',
  '中立与社会连结',
  false,
  false,
  '{"visibility":{"combat_masked_to":["all"]}}',
  id
from auth.users
where email = '玩家邮箱@example.com';
```
