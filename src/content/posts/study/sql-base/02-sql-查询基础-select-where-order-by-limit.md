---
title: SQL 查询基础：SELECT、WHERE、ORDER BY 与 LIMIT
published: 2026-05-17
description: 掌握最常用的数据读取方式：选择列、过滤行、排序结果和限制返回数量。
tags: [SQL, SELECT, 查询]
category: SQL
draft: false
comment: false
---

SQL 最常见的用途是查询数据。一个基础查询通常长这样：

```sql
SELECT id, name, email
FROM users
WHERE created_at >= '2026-01-01'
ORDER BY created_at DESC
LIMIT 20;
```

可以先把它读成一句话：

从 `users` 表里，找出 `created_at` 大于等于 `2026-01-01` 的用户，只返回 `id`、`name`、`email` 三列，按创建时间倒序排列，最多返回 20 条。

这也是我觉得 SQL 很适合入门的地方：它看起来像代码，但更接近一句结构化的中文。

这一篇继续用一张小用户表：

| id | name | email | status | created_at |
| --- | --- | --- | --- | --- |
| 1 | Owen | owen@example.com | active | 2026-05-01 10:00:00 |
| 2 | Alice | alice@example.com | active | 2026-05-03 09:30:00 |
| 3 | Bob |  | inactive | 2026-05-04 21:10:00 |
| 4 | Cindy | cindy@example.com | active | 2026-05-05 08:20:00 |

## 1. SELECT：选择要看的列

最直接的查询是：

```sql
SELECT *
FROM users;
```

`*` 表示所有列。学习和临时排查时可以用，但正式代码里更推荐明确写出需要的列：

```sql
SELECT id, name, email
FROM users;
```

返回结果会只剩这三列：

| id | name | email |
| --- | --- | --- |
| 1 | Owen | owen@example.com |
| 2 | Alice | alice@example.com |
| 3 | Bob |  |
| 4 | Cindy | cindy@example.com |

这样有几个好处：

- 结果更清楚。
- 减少不必要的数据传输。
- 表结构新增字段时，不会意外影响调用方。

如果只是临时看数据，`SELECT *` 没问题；如果是写进后端接口、定时任务、Agent 工具里，就尽量明确列名。以后排查问题时，会少很多“这个字段怎么突然冒出来”的惊喜。

## 2. WHERE：过滤行

`WHERE` 用来筛选符合条件的行。

```sql
SELECT id, name, email
FROM users
WHERE status = 'active';
```

返回结果是：

| id | name | email |
| --- | --- | --- |
| 1 | Owen | owen@example.com |
| 2 | Alice | alice@example.com |
| 4 | Cindy | cindy@example.com |

常见条件包括：

```sql
-- 等于
WHERE status = 'active'

-- 不等于
WHERE status <> 'deleted'

-- 大于、小于
WHERE id > 2

-- 区间
WHERE created_at BETWEEN '2026-01-01' AND '2026-01-31'

-- 多个候选值
WHERE status IN ('active', 'inactive')

-- 模糊匹配
WHERE email LIKE '%@example.com'

-- 空值判断
WHERE deleted_at IS NULL
```

### LIKE：按文本模式模糊匹配

`LIKE` 后面跟的是一个字符串模式。它最常用的两个通配符是：

| 通配符 | 含义 |
| --- | --- |
| `%` | 匹配任意长度的任意字符，包括 0 个字符 |
| `_` | 匹配刚好 1 个任意字符 |

比如查邮箱以 `@example.com` 结尾的用户：

```sql
SELECT id, name, email
FROM users
WHERE email LIKE '%@example.com';
```

返回结果是：

| id | name | email |
| ---: | --- | --- |
| 1 | Owen | owen@example.com |
| 2 | Alice | alice@example.com |
| 4 | Cindy | cindy@example.com |

几种常见写法可以先这样记：

```sql
-- 以 A 开头
WHERE name LIKE 'A%'

-- 以 .com 结尾
WHERE email LIKE '%.com'

-- 包含 example
WHERE email LIKE '%example%'

-- 第二个字符是 i
WHERE name LIKE '_i%'

-- 刚好 5 个字符
WHERE name LIKE '_____'
```

`LIKE` 很适合做简单文本过滤，但如果数据量很大，或者要做复杂搜索，就要考虑全文索引、搜索引擎，或者专门的检索方案了。

多个条件可以用 `AND` 和 `OR` 组合：

```sql
SELECT id, name, status
FROM users
WHERE status = 'active'
  AND id > 1;
```

如果有 `OR`，最好用括号写清楚优先级：

```sql
SELECT id, name, email, status
FROM users
WHERE status = 'active'
  AND (email IS NOT NULL OR id = 3);
```

SQL 里的字符串一般用单引号。不同数据库对双引号、反引号的含义不完全一样，初学时先养成字符串用单引号、字段名不乱加引号的习惯会更稳。

## 3. ORDER BY：排序

`ORDER BY` 用来控制结果顺序。

```sql
SELECT id, name, created_at
FROM users
ORDER BY created_at DESC;
```

- `ASC` 是升序，从小到大。
- `DESC` 是降序，从大到小。

如果不写排序，数据库不保证结果天然按照某个稳定顺序返回。所以分页、列表、排行榜这类场景，最好明确写 `ORDER BY`。

也可以按多个字段排序：

```sql
SELECT id, status, created_at
FROM users
ORDER BY status ASC, created_at DESC;
```

这表示先按状态升序，再在同一状态里按创建时间倒序。

如果分页时只按一个可能重复的字段排序，比如只按 `created_at`，同一秒创建的多条记录顺序可能不稳定。更稳的写法是再补一个主键：

```sql
SELECT id, name, created_at
FROM users
ORDER BY created_at DESC, id DESC
LIMIT 10;
```

返回结果会按最新创建时间排在前面：

| id | name | created_at |
| --- | --- | --- |
| 4 | Cindy | 2026-05-05 08:20:00 |
| 3 | Bob | 2026-05-04 21:10:00 |
| 2 | Alice | 2026-05-03 09:30:00 |
| 1 | Owen | 2026-05-01 10:00:00 |

## 4. LIMIT：限制返回数量

`LIMIT` 用来限制返回行数。

```sql
SELECT id, name
FROM users
ORDER BY created_at DESC
LIMIT 10;
```

这在 AI 应用里尤其重要。让模型或工具直接查询全表很危险，一方面可能慢，另一方面可能把太多数据塞进上下文。

一个比较安全的习惯是：只要是探索性查询，先加 `LIMIT`。

### 分页：一次只取一小段结果

分页就是把很多条结果拆成一页一页返回。

比如一个用户列表有 1000 条数据，页面上不可能一次全展示出来，通常会变成：

| 页码 | 含义 |
| ---: | --- |
| 第 1 页 | 第 1 到 20 条 |
| 第 2 页 | 第 21 到 40 条 |
| 第 3 页 | 第 41 到 60 条 |

这里的 `20` 就是每页条数，也常叫 `page_size`。

SQL 里常用 `LIMIT` 和 `OFFSET` 实现这种分页：

```sql
SELECT id, name
FROM users
ORDER BY created_at DESC, id DESC
LIMIT 20 OFFSET 40;
```

这表示：

```text
跳过前 40 条，再取 20 条
```

也就是取第 3 页。因为：

```text
第 1 页：OFFSET 0，LIMIT 20
第 2 页：OFFSET 20，LIMIT 20
第 3 页：OFFSET 40，LIMIT 20
```

如果用公式表示：

```text
OFFSET = (page - 1) * page_size
LIMIT = page_size
```

比如每页 2 条，用当前这张 `users` 小表演示：

```sql
SELECT id, name, created_at
FROM users
ORDER BY created_at DESC, id DESC
LIMIT 2 OFFSET 0;
```

第 1 页返回：

| id | name | created_at |
| ---: | --- | --- |
| 4 | Cindy | 2026-05-05 08:20:00 |
| 3 | Bob | 2026-05-04 21:10:00 |

第 2 页：

```sql
SELECT id, name, created_at
FROM users
ORDER BY created_at DESC, id DESC
LIMIT 2 OFFSET 2;
```

返回：

| id | name | created_at |
| ---: | --- | --- |
| 2 | Alice | 2026-05-03 09:30:00 |
| 1 | Owen | 2026-05-01 10:00:00 |

MySQL 里还常见另一种写法：

```sql
LIMIT 40, 20
```

它和下面这句意思接近：

```sql
LIMIT 20 OFFSET 40
```

也就是跳过 40 条，取 20 条。刚开始更推荐记 `LIMIT ... OFFSET ...`，语义更直观。

分页时一定要配合稳定排序。否则数据库每次返回顺序不一定完全一样，用户翻页时可能看到重复或遗漏的数据。

`OFFSET` 分页很直观，但数据量很大时，深分页会变慢。真正做无限滚动或消息列表时，常会改用基于游标的分页，比如记住上一页最后一条记录的 `created_at` 和 `id`。

## 5. 一个完整例子

假设我们想找“最近创建的 10 个活跃用户”：

```sql
SELECT id, name, email, created_at
FROM users
WHERE status = 'active'
ORDER BY created_at DESC
LIMIT 10;
```

返回结果是：

| id | name | email | created_at |
| --- | --- | --- | --- |
| 4 | Cindy | cindy@example.com | 2026-05-05 08:20:00 |
| 2 | Alice | alice@example.com | 2026-05-03 09:30:00 |
| 1 | Owen | owen@example.com | 2026-05-01 10:00:00 |

如果再加一个条件：邮箱不能为空。

```sql
SELECT id, name, email, created_at
FROM users
WHERE status = 'active'
  AND email IS NOT NULL
ORDER BY created_at DESC
LIMIT 10;
```

## 6. SQL 的书写顺序和理解顺序

SQL 通常按这个顺序写：

```sql
SELECT ...
FROM ...
WHERE ...
GROUP BY ...
HAVING ...
ORDER BY ...
LIMIT ...
```

但理解时可以先从 `FROM` 开始：从哪张表取数据，先过滤哪些行，再选择哪些列，最后排序和限制数量。这样读复杂 SQL 会舒服很多。

这也是为什么有些字段别名不能直接在 `WHERE` 里用：逻辑上 `WHERE` 发生得比 `SELECT` 更早。刚开始不用死记执行顺序，但知道这个直觉会少很多疑惑。

## 7. 给 Text2SQL 的一点直觉

用户说“查一下最近的活跃用户”，模型需要把自然语言拆成几件事：

- “用户”对应 `users` 表。
- “活跃”可能对应 `status = 'active'`。
- “最近”通常对应 `ORDER BY created_at DESC`。
- “查一下”最好加 `LIMIT`，否则范围太大。

所以 SQL 查询基础不只是语法，它也是自然语言到结构化查询的翻译规则。下一篇会进入聚合和分组，也就是从“查明细”走到“做统计”。
