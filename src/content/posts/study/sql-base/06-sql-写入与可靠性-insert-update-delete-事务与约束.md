---
title: SQL 写入与可靠性：INSERT、UPDATE、DELETE、事务与约束
published: 2026-05-17
description: 查询是读数据，写入会改变数据。这一篇整理 INSERT、UPDATE、DELETE、事务、ACID 和约束的基础直觉。
tags: [SQL, Transaction, ACID, 数据可靠性]
category: SQL
draft: false
comment: false
---

前几篇都在读数据。这一篇开始写数据。

写数据比查数据更需要谨慎，因为它会改变数据库状态。尤其是 `UPDATE` 和 `DELETE`，少写一个 `WHERE` 就可能变成事故。

所以我会把写入类 SQL 分成两层来看：语法本身怎么写，以及怎样避免把数据写坏。

这一篇先假设 `users` 表当前是：

| id | name | email | status | created_at | deleted_at |
| ---: | --- | --- | --- | --- | --- |
| 1 | Owen | owen@example.com | active | 2026-05-01 |  |
| 2 | Alice | alice@example.com | inactive | 2025-12-01 |  |

## 1. INSERT：插入新记录

插入用户：

```sql
INSERT INTO users (name, email, status, created_at)
VALUES ('Owen', 'owen@example.com', 'active', CURRENT_TIMESTAMP);
```

如果插入的是一个新用户 `Cindy`：

```sql
INSERT INTO users (name, email, status, created_at)
VALUES ('Cindy', 'cindy@example.com', 'active', CURRENT_TIMESTAMP)
RETURNING id, name, email, status;
```

返回结果可能是：

| id | name | email | status |
| ---: | --- | --- | --- |
| 3 | Cindy | cindy@example.com | active |

此时表里就多了一行：

| id | name | email | status | created_at | deleted_at |
| ---: | --- | --- | --- | --- | --- |
| 1 | Owen | owen@example.com | active | 2026-05-01 |  |
| 2 | Alice | alice@example.com | inactive | 2025-12-01 |  |
| 3 | Cindy | cindy@example.com | active | 2026-05-17 |  |

建议显式写出列名，而不是依赖表字段顺序。这样表结构调整时，SQL 更不容易悄悄错位。

一次插入多行：

```sql
INSERT INTO users (name, email, status, created_at)
VALUES
  ('Alice', 'alice@example.com', 'active', CURRENT_TIMESTAMP),
  ('Bob', 'bob@example.com', 'active', CURRENT_TIMESTAMP);
```

有些数据库支持插入后直接返回新记录，比如 PostgreSQL 的 `RETURNING`：

```sql
INSERT INTO users (name, email, status, created_at)
VALUES ('Owen', 'owen@example.com', 'active', CURRENT_TIMESTAMP)
RETURNING id, name, email;
```

这在后端接口里很常见：创建完用户后，直接把新用户的 `id` 返回给调用方。

## 2. UPDATE：更新已有记录

更新一条用户状态：

```sql
UPDATE users
SET status = 'inactive'
WHERE id = 1;
```

执行后，用户 1 的状态会变化：

| id | name | status |
| ---: | --- | --- |
| 1 | Owen | inactive |

`WHERE` 非常关键。如果写成：

```sql
UPDATE users
SET status = 'inactive';
```

就是把整张表所有用户都改成 `inactive`。

实际操作前，可以先用同样条件查一遍：

```sql
SELECT id, name, status
FROM users
WHERE id = 1;
```

确认命中范围，再执行更新。

如果要批量更新，更要先查数量：

```sql
SELECT COUNT(*) AS affected_users
FROM users
WHERE status = 'inactive'
  AND created_at < '2026-01-01';
```

返回结果是：

| affected_users |
| ---: |
| 1 |

确认数量符合预期，再执行：

```sql
UPDATE users
SET status = 'archived'
WHERE status = 'inactive'
  AND created_at < '2026-01-01';
```

## 3. DELETE：删除记录

删除一条记录：

```sql
DELETE FROM users
WHERE id = 1;
```

同样，`WHERE` 不能少。

很多业务不会直接物理删除，而是软删除：

```sql
UPDATE users
SET deleted_at = CURRENT_TIMESTAMP
WHERE id = 1;
```

执行后可以理解成：

| id | name | status | deleted_at |
| ---: | --- | --- | --- |
| 1 | Owen | inactive | 2026-05-17 01:00:00 |

软删除的好处是可恢复、可审计；坏处是后续查询要记得过滤 `deleted_at IS NULL`。

如果系统里有软删除，就要统一约定“正常查询是否默认过滤软删除记录”。否则一个列表接口忘了过滤，用户就可能看到已经删除的数据。

## 4. 事务：要么都成功，要么都失败

事务可以把多条操作包成一个整体。

比如用户下单时，可能需要：

1. 创建订单。
2. 扣库存。
3. 记录支付流水。

这些操作最好一起成功，或者一起失败。

```sql
BEGIN;

INSERT INTO orders (user_id, total_amount, status, created_at)
VALUES (1, 99.00, 'paid', CURRENT_TIMESTAMP);

UPDATE products
SET stock = stock - 1
WHERE id = 10
  AND stock > 0;

COMMIT;
```

如果执行前商品库存是：

| id | name | stock |
| ---: | --- | ---: |
| 10 | SQL Notebook | 3 |

执行后会变成：

| id | name | stock |
| ---: | --- | ---: |
| 10 | SQL Notebook | 2 |

如果中间出错，就回滚：

```sql
ROLLBACK;
```

实际业务里，还要检查扣库存是否真的更新到了行。因为 `AND stock > 0` 如果不满足，`UPDATE` 可能影响 0 行。这个时候应该回滚订单，而不是继续提交。

事务的价值是保护数据一致性。AI Agent 如果被允许执行写入类 SQL，更需要外层加权限、审批和事务控制。

## 5. 事务控制语法：BEGIN、COMMIT、ROLLBACK、FOR UPDATE

前面代码里出现了几个事务相关语法，这里单独捋一下。

| 语法 | 作用 |
| --- | --- |
| `BEGIN` | 开启一个事务 |
| `COMMIT` | 提交事务，让本次修改正式生效 |
| `ROLLBACK` | 回滚事务，撤销本次事务里还没提交的修改 |
| `FOR UPDATE` | 查询时锁住命中的行，通常用于接下来要更新的场景 |

前三个是事务控制语句。可以理解成：

```sql
BEGIN;

-- 中间写多条 INSERT / UPDATE / DELETE

COMMIT;
```

如果中间发现不应该继续，就执行：

```sql
ROLLBACK;
```

`COMMIT` 之后，修改就正式提交了；`ROLLBACK` 一般只能撤销当前事务里还没有提交的修改。

> 大多数数据库客户端默认是 autocommit 自动提交，如果没显式 BEGIN，它可能执行完就自动提交了。提交之后再 ROLLBACK，一般就撤不回来了。所以我们可以用 BEGIN 来做事务，如果中间有执行错误、失败的，可以不提交而是回滚。

`FOR UPDATE` 稍微特殊，它是“锁定读”。普通 `SELECT` 多数时候只是读快照，不会锁住这行：

```sql
SELECT stock
FROM products
WHERE id = 10;
```

如果后面马上要扣库存，可以写成：

```sql
BEGIN;

SELECT stock
FROM products
WHERE id = 10
FOR UPDATE;

UPDATE products
SET stock = stock - 1
WHERE id = 10
  AND stock > 0;

COMMIT;
```

`FOR UPDATE` 的意思是：我不只是看看库存，我接下来要改它，所以先把这行锁住。其他事务如果也想修改这行，通常要等当前事务 `COMMIT` 或 `ROLLBACK` 之后才能继续。

比如库存表当前是：

| id | name | stock |
| ---: | --- | ---: |
| 10 | SQL Notebook | 1 |

事务 A 先执行：

```sql
BEGIN;

SELECT stock
FROM products
WHERE id = 10
FOR UPDATE;
```

事务 B 此时也执行同样的 `SELECT ... FOR UPDATE`，就会等待事务 A 释放锁。这样就能避免两个事务同时读到 `stock = 1`，然后都扣库存成功。

所以可以先记住：

> 普通 `SELECT` 是读数据；`SELECT ... FOR UPDATE` 是“读出来，并且先锁住，准备修改”。

## 6. ACID：事务为什么可靠

提到事务，经常会看到 ACID。它不是一条 SQL 语法，而是数据库事务可靠性的四个性质：

| 字母 | 含义 | 直觉 |
| --- | --- | --- |
| A | Atomicity，原子性 | 一组操作要么全部成功，要么全部失败 |
| C | Consistency，一致性 | 事务前后，数据都要满足约束和业务规则 |
| I | Isolation，隔离性 | 并发事务之间不能随便互相干扰 |
| D | Durability，持久性 | 事务提交后，结果应该可靠保存 |

还是用下单扣库存来理解。

**原子性**：创建订单成功了，但扣库存失败了，这时不能只留下订单。要么订单和库存一起成功，要么一起回滚。

**一致性**：如果数据库规定库存不能小于 0，事务结束后就不应该出现 `stock = -1`。约束、外键、检查条件都在帮数据库守住一致性。

**隔离性**：两个用户同时买最后一件商品，如果不隔离，两个事务都可能看到库存是 1，然后都扣成功。数据库需要用锁、MVCC 或隔离级别来控制这种并发问题。

**持久性**：`COMMIT` 成功以后，即使程序重启，刚才提交的数据也应该还在。数据库会通过日志、刷盘等机制尽量保证这一点。

可以把 ACID 先记成一句话：

> 事务让一组修改像一个可靠动作：不做半截、不破坏规则、不被并发随便打乱、提交后能留下来。

这里面最容易在业务开发中遇到的是隔离性。比如“查库存 -> 扣库存”不是简单两句 SQL 就万事大吉；在高并发场景里，还要考虑两个请求同时操作同一行数据的问题。入门阶段先知道 ACID 在保护什么，后面再深入隔离级别、锁和 MVCC。

## 7. 约束：把规则放进数据库

常见约束包括：

- `NOT NULL`：不能为空。
- `UNIQUE`：不能重复。
- `PRIMARY KEY`：主键。
- `FOREIGN KEY`：外键关系。
- `CHECK`：自定义检查条件。

例如订单金额不能小于 0：

```sql
CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  total_amount DECIMAL(10, 2) NOT NULL CHECK (total_amount >= 0),
  status TEXT NOT NULL
);
```

约束的意义是：不要只相信应用代码。只要数据规则足够重要，就应该尽量让数据库也参与防守。

## 8. 参数化：不要拼接用户输入

写 SQL 时还要注意 SQL 注入。危险写法大概是这样：

```text
"SELECT * FROM users WHERE email = '" + user_input + "'"
```

如果用户输入里包含特殊 SQL 片段，就可能改变原本的查询含义。正确方向是使用参数化查询，让数据库驱动把输入当成值，而不是当成 SQL 语法。

伪代码大概是：

```python
cursor.execute(
    "SELECT id, name FROM users WHERE email = %s",
    [email],
)
```

不同语言和数据库驱动的占位符写法不同，但原则一样：SQL 结构和用户输入要分开。

## 9. 给 AI 工具调用的边界

如果一个 Agent 可以访问 SQL 工具，我会先把权限分层：

- 默认只允许 `SELECT`。
- 探索查询自动加 `LIMIT`。
- 禁止直接执行 `UPDATE`、`DELETE`、`DROP`。
- 写入操作必须走专门的业务 API。
- 高风险操作需要人工确认。

原因很简单：模型可以帮我们生成查询，但不能把生产数据库当试验田。

这一篇先建立写入和可靠性的底线。下一篇再看性能直觉：为什么有些查询会慢，以及索引到底在帮什么忙。
