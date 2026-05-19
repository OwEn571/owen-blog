---
title: SQL 聚合分组：COUNT、GROUP BY 与 HAVING
published: 2026-05-17
description: 从明细查询进入统计查询，理解 COUNT、SUM、AVG、GROUP BY 和 HAVING 的使用方式。
tags: [SQL, GROUP BY, 聚合]
category: SQL
draft: false
comment: false
---

前一篇主要是在查“哪些行符合条件”。但很多真实问题不是要明细，而是要统计：

- 今天新增了多少用户？
- 每个用户下了多少单？
- 每个状态的订单金额是多少？
- 哪些商品销量超过 100？

这类问题就需要聚合和分组。

这一篇用一张订单表来观察“明细如何变成统计结果”：

| id | user_id | total_amount | status | created_at |
| --- | --- | ---: | --- | --- |
| 1 | 1 | 99.00 | paid | 2026-05-01 |
| 2 | 1 | 199.00 | paid | 2026-05-03 |
| 3 | 2 | 49.00 | pending | 2026-05-03 |
| 4 | 2 | 299.00 | paid | 2026-05-04 |
| 5 | 3 | 19.00 | canceled | 2026-05-04 |

## 1. 常见聚合函数

聚合函数会把多行数据合成一个结果。

```sql
SELECT COUNT(*) AS order_count
FROM orders;
```

上面的 `orders` 表一共有 5 行，所以返回结果是：

| order_count |
| ---: |
| 5 |

常见聚合函数有：

- `COUNT(*)`：统计行数。
- `COUNT(column)`：统计某列非空值的数量。
- `COUNT(DISTINCT column)`：统计某列去重后的数量。
- `SUM(column)`：求和。
- `AVG(column)`：平均值。
- `MIN(column)`：最小值。
- `MAX(column)`：最大值。

`COUNT(*)` 和 `COUNT(column)` 的区别值得单独记一下。前者数行数，后者只数这个字段不为 `NULL` 的行。

```sql
SELECT
  COUNT(*) AS total_orders,
  COUNT(status) AS orders_with_status,
  COUNT(DISTINCT user_id) AS unique_users
FROM orders;
```

这张小表里每条订单都有 `status`，并且一共有 3 个不同的 `user_id`，所以返回结果是：

| total_orders | orders_with_status | unique_users |
| ---: | ---: | ---: |
| 5 | 5 | 3 |

如果某一列有空值，`COUNT(column)` 就不会把空值算进去；而 `COUNT(*)` 仍然会统计整行。

比如统计已支付订单的总金额：

```sql
SELECT SUM(total_amount) AS paid_amount
FROM orders
WHERE status = 'paid';
```

套到上面的订单表，只有 1、2、4 三笔订单是 `paid`，所以返回：

| paid_amount |
| ---: |
| 597.00 |

## 2. GROUP BY：按某个维度分组

如果只写聚合函数，得到的是全表或过滤后整体的一行结果。想按某个维度分别统计，就用 `GROUP BY`。

统计每种订单状态的数量：

```sql
SELECT status, COUNT(*) AS order_count
FROM orders
GROUP BY status;
```

返回结果是：

| status | order_count |
| --- | ---: |
| canceled | 1 |
| paid | 3 |
| pending | 1 |

可以读成：

把 `orders` 按 `status` 分组，然后每组算一次数量。

再比如统计每个用户的订单数：

```sql
SELECT user_id, COUNT(*) AS order_count
FROM orders
GROUP BY user_id;
```

统计每个用户的总消费：

```sql
SELECT user_id, SUM(total_amount) AS total_spent
FROM orders
WHERE status = 'paid'
GROUP BY user_id;
```

返回结果是：

| user_id | total_spent |
| ---: | ---: |
| 1 | 298.00 |
| 2 | 299.00 |

如果要按天统计订单数，可以先把时间字段转换成日期。不同数据库写法略有差异，PostgreSQL 里可以这样写：

```sql
SELECT DATE(created_at) AS day, COUNT(*) AS order_count
FROM orders
GROUP BY DATE(created_at)
ORDER BY day;
```

只要 SELECT 里有聚合函数，又有非聚合字段，就要用 GROUP BY 说明“按哪个字段分组”

这类查询在日志分析里非常常见。

## 3. WHERE 和 HAVING 的区别

`WHERE` 是分组前过滤行，`HAVING` 是分组后过滤统计结果。

比如：统计支付订单数大于 3 的用户。

```sql
SELECT user_id, COUNT(*) AS paid_order_count
FROM orders
WHERE status = 'paid'
GROUP BY user_id
HAVING COUNT(*) > 3;
```

套到这张小表里，返回结果是空的，因为没有用户的已支付订单数大于 3：

| user_id | paid_order_count |
| ---: | ---: |

空结果不是报错，它只是表示没有分组满足条件。

这里的执行思路是：

1. 先用 `WHERE status = 'paid'` 过滤出已支付订单。
2. 再按 `user_id` 分组。
3. 每组计算 `COUNT(*)`。
4. 最后用 `HAVING COUNT(*) > 3` 过滤分组结果。

这也是刚学 SQL 时很容易混的地方：`WHERE` 不能直接过滤聚合结果。

可以粗略记成一句话：`WHERE` 管原始行，`HAVING` 管分组后的结果。

## 4. GROUP BY 中 SELECT 的限制

如果用了 `GROUP BY`，`SELECT` 中通常只能放两类东西：

- 被分组的字段。
- 聚合函数的结果。

比如下面这样是合理的：

```sql
SELECT status, COUNT(*) AS order_count
FROM orders
GROUP BY status;
```

但如果写：

```sql
SELECT status, id, COUNT(*) AS order_count
FROM orders
GROUP BY status;
```

`id` 就会很奇怪：每个状态下面有很多订单 id，数据库不知道应该返回哪一个。不同数据库对这种写法的宽容程度不同，但学习时最好先保持严格。

## 5. 聚合结果也可以排序和限制

聚合之后经常要找 Top N。比如找消费最高的 10 个用户：

```sql
SELECT user_id, SUM(total_amount) AS total_spent
FROM orders
WHERE status = 'paid'
GROUP BY user_id
ORDER BY total_spent DESC
LIMIT 10;
```

返回结果是：

| user_id | total_spent |
| ---: | ---: |
| 2 | 299.00 |
| 1 | 298.00 |

注意这里的 `ORDER BY total_spent` 用的是 `SELECT` 里起的别名。很多数据库支持这种写法，读起来也更自然。

## 6. AI 应用里的聚合

评估 AI 系统时，经常会用到聚合查询。比如：

- 每个模型版本的平均响应耗时。
- 每个评估维度的通过率。
- 每天的失败样本数量。
- 每类错误的占比。

一个例子：

```sql
SELECT model_name, AVG(latency_ms) AS avg_latency
FROM ai_requests
WHERE created_at >= '2026-05-01'
GROUP BY model_name
ORDER BY avg_latency DESC;
```

这类查询能把大量日志变成可比较的指标。SQL 的聚合能力，本质上是在帮我们把“数据明细”压缩成“判断依据”。

下一篇会进入 SQL 最关键的能力之一：多表查询，也就是 `JOIN`。
