---
title: SQL 性能直觉：索引、执行计划与慢查询
published: 2026-05-17
description: 不追求一次学完数据库优化，先理解索引为什么能加速、为什么不是越多越好，以及执行计划能告诉我们什么。
tags: [SQL, Index, 性能优化]
category: SQL
draft: false
comment: false
---

SQL 能查出来是一回事，查得快又是另一回事。

刚开始学习不需要立刻钻进复杂优化，但至少要建立几个性能直觉：

- 数据库不是魔法，它也要扫描数据。
- 索引可以减少扫描范围。
- 索引不是越多越好。
- 慢查询通常需要看执行计划，而不是靠猜。

这一篇用一张稍微抽象的小用户表来讲：

| id | name | email | created_at |
| ---: | --- | --- | --- |
| 1 | Owen | owen@example.com | 2026-05-01 |
| 2 | Alice | alice@example.com | 2026-05-03 |
| 3 | Bob | bob@example.com | 2026-05-04 |

真实性能问题通常出现在几十万、几百万甚至更多行的数据里。小表只是为了看清查询形状。

## 1. 没有索引时，可能要全表扫描

假设有一张很大的用户表：

```sql
SELECT id, name, email
FROM users
WHERE email = 'owen@example.com';
```

返回结果本身很简单：

| id | name | email |
| ---: | --- | --- |
| 1 | Owen | owen@example.com |

如果 `email` 没有索引，数据库可能需要从头到尾检查很多行，才能找到匹配记录。这就是全表扫描。

数据量小的时候无所谓，数据量大以后就会变慢。

## 2. 索引像一本目录

给 `email` 建索引：

```sql
CREATE INDEX idx_users_email ON users(email);
```

之后再按 `email` 查询，数据库可以先查索引，再定位到对应行。它不必把整张表都扫一遍。

主键通常天然有索引，所以按 `id` 查一般很快：

```sql
SELECT *
FROM users
WHERE id = 1;
```

可以把索引粗略想象成一本书后面的目录。没有目录时，只能一页页翻；有目录时，可以先定位关键词在哪些页，再去看正文。

## 3. 哪些字段适合建索引

常见候选包括：

- 经常出现在 `WHERE` 里的字段。
- 经常用于 `JOIN` 的字段。
- 经常用于排序的字段。
- 高选择性的字段，也就是能过滤掉大量数据的字段。

例如订单表里，`user_id` 经常用于查询某个用户的订单：

| id | user_id | total_amount | created_at |
| ---: | ---: | ---: | --- |
| 101 | 1 | 99.00 | 2026-05-01 |
| 102 | 1 | 199.00 | 2026-05-03 |
| 103 | 2 | 299.00 | 2026-05-04 |

```sql
CREATE INDEX idx_orders_user_id ON orders(user_id);
```

如果经常查询某个用户的最近订单，可以考虑联合索引：

```sql
CREATE INDEX idx_orders_user_created_at ON orders(user_id, created_at);
```

联合索引的顺序很重要。`(user_id, created_at)` 更适合这类查询：

```sql
SELECT id, total_amount, created_at
FROM orders
WHERE user_id = 1
ORDER BY created_at DESC
LIMIT 20;
```

因为查询先按 `user_id` 缩小范围，再在这个用户的订单里按时间排序。

## 4. 让查询更容易用上索引

有些写法会让索引难以发挥作用。比如在字段上套函数：

```sql
SELECT id, email
FROM users
WHERE LOWER(email) = 'owen@example.com';
```

如果只有普通的 `email` 索引，数据库不一定能直接使用它。更常见的做法是提前规范化存储，或者为表达式单独建索引，具体取决于数据库能力。

再比如模糊匹配：

```sql
WHERE email LIKE '%@example.com'
```

前面有 `%` 时，普通 B-tree 索引通常很难直接加速。搜索类需求可能需要全文索引、倒排索引，或者专门的搜索引擎。

入门阶段先记一个词：sargable。它大概表示查询条件能不能有效利用索引。我们不必马上背术语，但要有这个直觉：条件写法会影响数据库怎么找数据。

## 5. 索引不是越多越好

索引会加快读取，但也有成本：

- 占用额外存储空间。
- 插入、更新、删除时也要维护索引。
- 索引太多会让优化器选择变复杂。

所以索引应该服务具体查询，不是看到字段就加。

一个比较稳的学习顺序是：

1. 先写清楚业务查询。
2. 观察慢在哪里。
3. 看执行计划。
4. 给高频慢查询补索引。
5. 再验证是否真的变快。

## 6. EXPLAIN：让数据库解释它怎么查

不同数据库的执行计划命令略有差异，但常见入口是 `EXPLAIN`：

```sql
EXPLAIN
SELECT id, name, email
FROM users
WHERE email = 'owen@example.com';
```

没有索引时，执行计划可能类似这样：

| operation | table | detail |
| --- | --- | --- |
| Seq Scan | users | filter: email = 'owen@example.com' |

加了索引后，可能变成：

| operation | index | detail |
| --- | --- | --- |
| Index Scan | idx_users_email | condition: email = 'owen@example.com' |

不同数据库的真实字段名不一样，但我们先抓住核心：有没有从全表扫描变成索引扫描。

执行计划会告诉我们数据库准备怎么执行查询，比如是否使用索引、扫描多少行、JOIN 顺序是什么。

学习阶段不用一开始看懂所有字段，但可以先关注：

- 有没有全表扫描。
- 有没有使用预期索引。
- 预估扫描行数是否很大。
- JOIN 是否导致结果暴涨。

如果用 MySQL，`EXPLAIN` 的结果通常会包含这些字段。比如 `users.email` 没有索引时：

```sql
EXPLAIN
SELECT id, name, email
FROM users
WHERE email = 'owen@example.com';
```

可能看到类似结果：

| id | select_type | table | type | possible_keys | key | rows | Extra |
| ---: | --- | --- | --- | --- | --- | ---: | --- |
| 1 | SIMPLE | users | ALL |  |  | 1000000 | Using where |

这几个字段可以先这样理解：

| 字段 | 含义 | 这里说明什么 |
| --- | --- | --- |
| `table` | 正在访问哪张表 | 查的是 `users` |
| `type` | 访问方式 | `ALL` 表示全表扫描 |
| `possible_keys` | 可能用到的索引 | 空，说明没有合适索引 |
| `key` | 实际使用的索引 | 空，说明没用索引 |
| `rows` | 预计扫描行数 | 可能要扫 100 万行 |
| `Extra` | 额外信息 | `Using where` 表示扫描后再按条件过滤 |

这时给 `email` 建一个索引：

```sql
CREATE INDEX idx_users_email ON users(email);
```

再看执行计划，可能变成：

| id | select_type | table | type | possible_keys | key | rows | Extra |
| ---: | --- | --- | --- | --- | --- | ---: | --- |
| 1 | SIMPLE | users | ref | idx_users_email | idx_users_email | 1 |  |

这里的变化就很关键：

- `type` 从 `ALL` 变成 `ref`，说明不再全表扫描，而是按索引查找。
- `key` 变成 `idx_users_email`，说明真的用上了刚才创建的索引。
- `rows` 从 `1000000` 变成 `1`，说明预计扫描量大幅下降。

所以看 `EXPLAIN` 时，不是为了背字段，而是为了回答三个问题：

1. 有没有走索引？
2. 扫描行数是不是太多？
3. 有没有额外排序、临时表、回表等成本？

再看一个排序例子：

```sql
EXPLAIN
SELECT id, total_amount, created_at
FROM orders
WHERE user_id = 1
ORDER BY created_at DESC
LIMIT 20;
```

如果只有 `user_id` 单列索引，可能会看到：

| table | type | key | rows | Extra |
| --- | --- | --- | ---: | --- |
| orders | ref | idx_orders_user_id | 3000 | Using where; Using filesort |

`Using filesort` 表示数据库还需要额外排序。它不一定真的写磁盘文件，但说明排序没有完全被索引顺序接住。

如果这个查询很高频，可以考虑联合索引：

```sql
CREATE INDEX idx_orders_user_created_at
ON orders(user_id, created_at);
```

再看执行计划，可能变成：

| table | type | key | rows | Extra |
| --- | --- | --- | ---: | --- |
| orders | ref | idx_orders_user_created_at | 20 | Using where |

这就说明数据库可以先按 `user_id` 定位，再利用索引里已经排好的 `created_at` 顺序取最近 20 条，少做很多排序工作。

如果用 PostgreSQL，还可以在测试环境看更具体的执行情况：

```sql
EXPLAIN ANALYZE
SELECT id, name, email
FROM users
WHERE email = 'owen@example.com';
```

返回结果除了计划，还会带实际执行时间、实际扫描行数等信息，形状可能像：

| node | actual rows | execution time |
| --- | ---: | ---: |
| Index Scan using idx_users_email | 1 | 0.05 ms |

`ANALYZE` 会实际执行查询，所以不要在生产库上随便对高成本写法使用它。

## 7. 不同数据库里的索引长得不一样

“索引”不是某一种固定结构，而是一类思想：用额外的数据结构，换取更快的查找、排序或相似度搜索。

不同数据库的目标不同，所以索引设计也不一样。

### PostgreSQL / MySQL：关系型数据库里的 B-tree 直觉

在 PostgreSQL、MySQL 这类关系型数据库里，最常见的索引是 B-tree 或类似 B+tree 的结构。它很适合：

- 等值查询：`WHERE email = 'owen@example.com'`
- 范围查询：`WHERE created_at >= '2026-01-01'`
- 排序：`ORDER BY created_at DESC`
- 联合条件：`WHERE user_id = 1 ORDER BY created_at DESC`

比如：

```sql
CREATE INDEX idx_users_email ON users(email);
```

这类索引适合精确查找某个邮箱。

再比如：

```sql
CREATE INDEX idx_orders_user_created_at ON orders(user_id, created_at);
```

它适合这种查询：

```sql
SELECT id, total_amount, created_at
FROM orders
WHERE user_id = 1
ORDER BY created_at DESC
LIMIT 20;
```

可以理解成索引里先按 `user_id` 组织，再在同一个用户内部按 `created_at` 排序。数据库不必从所有订单里慢慢找这个用户的最近订单。

PostgreSQL 还支持很多专门索引，比如：

| 索引类型 | 常见用途 |
| --- | --- |
| B-tree | 等值、范围、排序，最常见 |
| GIN | 数组、JSONB、全文搜索等多值结构 |
| GiST | 地理、范围、相似度等更复杂的查询 |
| Hash | 等值查询，但使用场景相对窄 |

MySQL InnoDB 里还常听到“聚簇索引”。它的核心直觉是：表数据本身按主键索引组织，主键查找非常自然；二级索引查到主键后，可能还要再回到主键索引里取完整行，这就是常说的“回表”。

### SQLite：轻量数据库也有 B-tree

SQLite 也会使用 B-tree 来组织表和索引。虽然它是嵌入式数据库，但索引直觉和关系型数据库类似：

```sql
CREATE INDEX idx_users_email ON users(email);
```

如果数据量很小，建不建索引可能体感差异不大；但数据量上来以后，`WHERE email = ...` 这类查询仍然会受益。

SQLite 很适合本地应用、小工具、原型系统。学习 SQL 时用它练手也不错，因为不用先搭一个复杂服务。

### Redis：很多访问路径来自数据结构本身

Redis 不是关系型数据库，它更像一个内存数据结构服务器。很多时候，我们不是先建一张表再建索引，而是直接选择合适的数据结构来形成访问路径。

比如用 String 直接按 key 查：

```text
GET user:1
```

这里的 key 本身就像一个直接定位入口。

如果要按分数排序，可以用 Sorted Set：

```text
ZADD user_score 98 user:1
ZADD user_score 85 user:2
ZREVRANGE user_score 0 9 WITHSCORES
```

这类结构内部通常会维护适合排序和范围查询的数据结构，所以查排行榜很快。

但 Redis 默认不是关系型数据库那种“任意字段都能建二级索引”的模式。如果想按 `email` 找用户，常见做法是自己维护一个反向映射：

```text
SET user_email:owen@example.com user:1
GET user_email:owen@example.com
```

也可以使用 RediSearch 这类模块做更完整的搜索和索引。这里的关键区别是：Redis 里很多“索引设计”要在 key 设计和数据结构选择时提前想好。

### Milvus：向量数据库的索引是为了相似度搜索

Milvus 面对的是向量检索，不是普通的 `WHERE id = 1`。它要解决的问题通常是：

> 给一个 query embedding，找最相似的 Top K 个向量。

向量数据库如果暴力比较所有向量，数据量大时会很慢。所以会使用近似最近邻索引，比如 IVF、HNSW 等。

一个很粗略的直觉：

| 索引思路 | 直觉 |
| --- | --- |
| IVF | 先把向量空间分成很多簇，查询时只看最相关的几个簇 |
| HNSW | 建一张多层近邻图，查询时沿图快速靠近相似向量 |
| DiskANN / 磁盘型索引 | 面向更大规模数据，尽量减少内存压力 |

Milvus 里的索引经常要和指标一起看，比如 cosine、inner product、L2。因为“相似”本身就有不同定义。

这和 SQL 索引的差别很大：

- SQL 索引常用于精确匹配、范围过滤、排序。
- Redis 索引常体现在 key 和数据结构设计上。
- Milvus 索引用于高维向量的相似度搜索。

但它们背后的交换都一样：额外维护一份结构，让查询不用从头扫到尾。

## 8. AI 应用里的性能问题

AI 应用经常会把“自然语言问题”转成数据库查询。这时性能风险更明显：

- 用户问题很开放，模型可能生成无边界查询。
- 缺少 `LIMIT` 会返回大量数据。
- 模型可能 JOIN 很多表。
- 模型可能在大字段上做模糊搜索。
- 错误聚合可能拖慢整库。

所以 Text2SQL 和数据库 Agent 不应该只验证“语法能不能跑”，还要验证“查询是否安全、可控、不会拖垮系统”。

一个简单的防线是：

- 只开放只读账号。
- 设置查询超时。
- 限制返回行数。
- 对生成 SQL 做静态检查。
- 高风险查询先解释给人看，再执行。

性能优化可以很深，但入门阶段先记住一句话：索引是为了减少不必要的扫描，执行计划是为了少靠猜。
