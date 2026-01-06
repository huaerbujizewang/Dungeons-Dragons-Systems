# 🛡️ D&D 系统 DM 运维手册 (SQL)

这些命令需要在 Supabase 的 **SQL Editor** 中运行。
> **注意：** 涉及 `update` 或 `delete` 的操作，建议先用 `select` 查一下确认无误再执行。

### 1. 🔑 账号管理

#### 强行激活某个账号 (修复 Email not confirmed)
当玩家注册后无法收到邮件，或你想直接帮他激活时使用。
```sql
update auth.users 
set email_confirmed_at = now() 
where email = '玩家邮箱@example.com';
```

#### 强行修改玩家密码
当玩家彻底忘记密码时，DM 可以帮他重置（玩家登录后应立即修改）。
```sql
update auth.users 
set encrypted_password = crypt('新密码123456', gen_salt('bf')) 
where email = '玩家邮箱@example.com';
```

#### 删除某个玩家 (慎用！)
这会级联删除他的所有数据（背包、雇员、金币记录等）。
```sql
delete from auth.users where email = '玩家邮箱@example.com';
```

---

### 2. 💰 资产与物品修复

#### 给玩家发钱 (上帝拨款)
```sql
update profiles 
set gold_gp = gold_gp + 1000 -- 增加 1000 金币
where email = '玩家邮箱@example.com';
```

#### 彻底清空某玩家的背包
```sql
delete from user_inventory 
where user_id = (select id from auth.users where email = '玩家邮箱@example.com');
```

#### 修复错误的物品分类 (比如把所有的'长剑'改成'装备')
```sql
update user_inventory set category = '装备' where item_name = '长剑';
update shop_items set category = '装备' where name = '长剑';
```

---

### 3. 👥 雇员与队伍

#### 强行把某人设为“核心队友”
这会让他无法被解雇，且在雇员中心置顶显示。
```sql
update employees 
set role = '核心队友', salary = 0 
where name = '角色名字';
```

#### 强行解散某玩家的所有队伍 (一键离队)
当队伍卡死或者出现幽灵队员时使用。
```sql
update employees 
set is_in_party = false 
where user_id = (select id from auth.users where email = '玩家邮箱@example.com');
```

#### 转移雇员的所有权 (把 A 的雇员送给 B)
```sql
update employees 
set user_id = (select id from auth.users where email = '接收者@example.com')
where name = '雇员名字' 
and user_id = (select id from auth.users where email = '原主人@example.com');
```

---

### 4. 🏪 集市管理

#### 批量删除某类商品 (如下架所有“普通”物品)
```sql
delete from shop_items where rarity = '普通';
```

#### 将某商品设为“全服可见”
如果你不小心把它设成了特供，可以用这个命令公开。
```sql
update shop_items set user_id = null where name = '商品名称';
```

---

### 5. 🛡️ 权限修复 (救命专用)

如果你的网页提示 `Permission denied` 或者数据加载不出来，运行这三条“万能钥匙”：

```sql
-- 1. 允许 DM (你) 操作所有表
create policy "DM GOD MODE" on user_inventory for all using (auth.jwt() ->> 'email' = '你的DM邮箱');

-- 2. 允许玩家读写自己的背包
create policy "User Own Inventory" on user_inventory for all using (auth.uid() = user_id);

-- 3. 允许玩家读写自己的雇员
create policy "User Own Employees" on employees for all using (auth.uid() = user_id);
```
