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

-- 将某人设为 Root (慎用)
-- 把 'dm' 改为 'root' 即可
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

### 2. 📜 政务厅：发布新议案

这是推动剧情的核心功能。你需要手动插入数据来让玩家看到新的审批卡片。

#### 发布一条新提案
```sql
do $$
declare
  target_uid uuid;
begin
  -- 1. 选定目标玩家
  select id into target_uid from auth.users where email = 'master@almorel.com';

  if target_uid is not null then
    -- 2. 插入提案
    insert into city_proposals (user_id, proposer_name, title, description, cost) values
    (
      target_uid, 
      '艾琳', -- 提案人名字 (必须是该玩家有的雇员，否则头像不显示)
      '扩建奥术研究室', -- 标题
      '随着研究的深入，现有的场地已不足以支撑更高环阶的法术实验。我们需要扩建地下设施。', -- 描述
      2000 -- 批准所需的金币 (0表示不花钱)
    );
  end if;
end $$;
```

#### 重置/删除某个提案
```sql
-- 删除某个标题的提案
delete from city_proposals where title = '扩建奥术研究室';

-- 或者重置状态为“待审批”
update city_proposals set status = 'pending' where title = '扩建奥术研究室';
```

---

### 3. 🏰 领地经济：修改收支与人口

#### 修改城市基础数据 (人口/补贴)
```sql
update city_stats 
set population = 6500, -- 修改人口
    subsidy = 0        -- 修改补贴 (例如莱瑟曼撤资)
where user_id = (select id from auth.users where email = 'master@almorel.com');
```

#### 增加新的支出项目 (City Expenses)
```sql
-- 插入一条新的建筑维护费
insert into city_expenses (user_id, name, count, unit_cost, category)
select id, '魔法塔能量维护', 1, 500, 'building' -- category可选: staff, building, trade_cost
from auth.users where email = 'master@almorel.com';
```

#### 增加新的收入项目 (City Incomes)
```sql
-- 插入一条新的贸易收入
insert into city_incomes (user_id, name, count, unit_price, amount)
select id, '向哈鲁阿出口卷轴', 10, 200, 2000 -- amount 最好等于 count * unit_price
from auth.users where email = 'master@almorel.com';
```

#### 修改现有项目的数值
```sql
-- 例如：铁矿涨价了
update city_expenses 
set unit_cost = 450 
where name like '%铁矿%' and user_id = (select id from auth.users where email = 'master@almorel.com');
```

---

### 4. 🏬 集市与图鉴管理

#### 从图鉴批量随机进货
```sql
-- 给指定玩家随机上架：1传说, 6极珍稀, 10珍稀, 20非普通
select admin_random_restock((select id from auth.users where email = 'master@almorel.com'));

-- 全服公共随机上架 (参数填 null)
select admin_random_restock(null);
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
