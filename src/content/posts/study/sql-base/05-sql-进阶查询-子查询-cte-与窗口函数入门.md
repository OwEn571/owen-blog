---
title: SQL 进阶查询：子查询、CTE 与窗口函数入门
published: 2026-05-17
description: 当查询开始变复杂，用子查询、CTE 和窗口函数把问题拆开，让 SQL 更可读、更适合迭代。
tags: [SQL, CTE, 窗口函数]
category: SQL
draft: false
comment: false
---

写 SQL 时，经常会遇到一种情况：单个 `SELECT` 能写出来，但越写越长，越看越晕。

这时可以先记住一个原则：复杂查询不要硬挤在一层里，先拆步骤。

SQL 里常见的拆法有三种：

- 子查询。
- CTE，也就是 `WITH`。
- 窗口函数。

这三种东西不一定都算“高级技巧”。更准确地说，它们是在帮我们把复杂问题写清楚。

这一篇继续用订单表：

| id | user_id | total_amount | status | created_at |
| ---: | ---: | ---: | --- | --- |
| 101 | 1 | 99.00 | paid | 2026-05-01 |
| 102 | 1 | 199.00 | paid | 2026-05-03 |
| 103 | 2 | 49.00 | pending | 2026-05-03 |
| 104 | 2 | 299.00 | paid | 2026-05-04 |
| 105 | 3 | 399.00 | paid | 2026-05-05 |

因为子查询会用订单反查用户，所以这里也放一张对应的 `users` 表：

| id | name | email |
| ---: | --- | --- |
| 1 | Owen | owen@example.com |
| 2 | Alice | alice@example.com |
| 3 | Bob | bob@example.com |

## 1. 子查询：把一个查询嵌进另一个查询

假设我们想查“消费金额高于平均订单金额的订单”。

先求平均值：

```sql
SELECT AVG(total_amount)
FROM orders
WHERE status = 'paid';
```

已支付订单是 99、199、299、399，平均值是：

| avg |
| ---: |
| 249.00 |

再把它放进外层查询：

```sql
SELECT id, user_id, total_amount
FROM orders
WHERE status = 'paid'
  AND total_amount > (
    SELECT AVG(total_amount)
    FROM orders
    WHERE status = 'paid'
  );
```

返回结果是：

| id | user_id | total_amount |
| ---: | ---: | ---: |
| 104 | 2 | 299.00 |
| 105 | 3 | 399.00 |

括号里的查询会先得到一个平均值，外层再用它过滤订单。

子查询很好理解，但嵌套太深会降低可读性。

子查询还经常和 `IN` 一起出现。比如查“下过已支付订单的用户”：

```sql
SELECT id, name, email
FROM users
WHERE id IN (
  SELECT user_id
  FROM orders
  WHERE status = 'paid'
);
```

返回结果是：

| id | name | email |
| ---: | --- | --- |
| 1 | Owen | owen@example.com |
| 2 | Alice | alice@example.com |
| 3 | Bob | bob@example.com |

它的意思是：先在订单表里找出已支付订单对应的用户 id，再去用户表里查这些用户。

如果只是判断是否存在，也可以用 `EXISTS`：

```sql
SELECT u.id, u.name, u.email
FROM users AS u
WHERE EXISTS (
  SELECT 1
  FROM orders AS o
  WHERE o.user_id = u.id
    AND o.status = 'paid'
);
```

`EXISTS` 的重点不是返回什么列，而是内层查询是否能找到至少一行。

## 2. CTE：给中间结果起名字

CTE 的写法是 `WITH name AS (...)`。它很像在 SQL 顶部定义一个临时结果。

同样的问题可以写成：

```sql
WITH paid_avg AS (
  SELECT AVG(total_amount) AS avg_amount
  FROM orders
  WHERE status = 'paid'
)
SELECT o.id, o.user_id, o.total_amount
FROM orders AS o
CROSS JOIN paid_avg AS p
WHERE o.status = 'paid'
  AND o.total_amount > p.avg_amount;
```

这个例子不一定比子查询短，但可读性更强：先定义 `paid_avg`，再使用它。

CTE 更适合多步骤查询。比如：

```sql
WITH paid_orders AS (
  SELECT user_id, total_amount
  FROM orders
  WHERE status = 'paid'
),
user_spend AS (
  SELECT user_id, SUM(total_amount) AS total_spent
  FROM paid_orders
  GROUP BY user_id
)
SELECT user_id, total_spent
FROM user_spend
WHERE total_spent >= 1000
ORDER BY total_spent DESC;
```

这段 SQL 的思路很像写程序：

1. 先拿到已支付订单。
2. 再按用户汇总消费。
3. 最后筛选高价值用户。

套到这张小表里，`user_spend` 这个中间结果会是：

| user_id | total_spent |
| ---: | ---: |
| 1 | 298.00 |
| 2 | 299.00 |
| 3 | 399.00 |

因为没有人的消费超过 1000，所以最终返回空表：

| user_id | total_spent |
| ---: | ---: |

CTE 最大的好处是便于调试。你可以先只运行第一个 CTE，确认 `paid_orders` 对不对；再运行到 `user_spend`；最后再加外层筛选。复杂 SQL 最怕一口气写到底，因为错了以后不知道错在哪一步。

有些数据库会把 CTE 当成优化边界，有些会自动内联。入门阶段先不用纠结这一层，先把可读性写出来，真正遇到慢查询再看执行计划。

## 3. 窗口函数：保留明细的同时做统计

`GROUP BY` 会把多行压缩成一行。有时我们不想丢掉明细，但又想在每行旁边放一个统计值，这时就可以用窗口函数。

比如：查看每个用户的订单，并给订单按时间倒序编号。

```sql
SELECT
  id,
  user_id,
  total_amount,
  created_at,
  ROW_NUMBER() OVER (
    PARTITION BY user_id
    ORDER BY created_at DESC
  ) AS order_rank
FROM orders;
```

返回结果是：

| id | user_id | total_amount | created_at | order_rank |
| ---: | ---: | ---: | --- | ---: |
| 102 | 1 | 199.00 | 2026-05-03 | 1 |
| 101 | 1 | 99.00 | 2026-05-01 | 2 |
| 104 | 2 | 299.00 | 2026-05-04 | 1 |
| 103 | 2 | 49.00 | 2026-05-03 | 2 |
| 105 | 3 | 399.00 | 2026-05-05 | 1 |

可以读成：

在每个 `user_id` 分组内部，按 `created_at` 倒序排列，并给每行编号。

如果只想要每个用户最近一笔订单，可以再包一层：

```sql
WITH ranked_orders AS (
  SELECT
    id,
    user_id,
    total_amount,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY user_id
      ORDER BY created_at DESC
    ) AS order_rank
  FROM orders
)
SELECT id, user_id, total_amount, created_at
FROM ranked_orders
WHERE order_rank = 1;
```

返回结果就是每个用户最近一笔订单：

| id | user_id | total_amount | created_at |
| ---: | ---: | ---: | --- |
| 102 | 1 | 199.00 | 2026-05-03 |
| 104 | 2 | 299.00 | 2026-05-04 |
| 105 | 3 | 399.00 | 2026-05-05 |

窗口函数也可以做“每行旁边带一个组内统计值”。比如给每笔订单带上该用户的总消费：

```sql
SELECT
  id,
  user_id,
  total_amount,
  SUM(total_amount) OVER (
    PARTITION BY user_id
  ) AS user_total_amount
FROM orders
WHERE status = 'paid';
```

返回结果是：

| id | user_id | total_amount | user_total_amount |
| ---: | ---: | ---: | ---: |
| 101 | 1 | 99.00 | 298.00 |
| 102 | 1 | 199.00 | 298.00 |
| 104 | 2 | 299.00 | 299.00 |
| 105 | 3 | 399.00 | 399.00 |

这和 `GROUP BY user_id` 不一样。`GROUP BY` 会把每个用户压成一行；窗口函数保留每笔订单，只是在旁边多放一个组内统计。

常见窗口函数可以先记这几个：

- `ROW_NUMBER()`：组内编号，不并列。
- `RANK()`：组内排名，有并列时会跳号。
- `DENSE_RANK()`：组内排名，有并列时不跳号。
- `SUM(...) OVER (...)`：组内累计或统计。
- `AVG(...) OVER (...)`：组内平均。

## 4. 一个 AI 日志例子

假设有一张 `agent_runs` 表，我们想找每个模型最近 3 次失败运行：

| id | model_name | status | latency_ms | created_at |
| ---: | --- | --- | ---: | --- |
| 1 | gpt-4o-mini | failed | 1800 | 2026-05-10 |
| 2 | gpt-4o-mini | success | 1200 | 2026-05-11 |
| 3 | gpt-4o-mini | failed | 1600 | 2026-05-12 |
| 4 | qwen-vl | failed | 2400 | 2026-05-11 |
| 5 | qwen-vl | failed | 2100 | 2026-05-13 |

```sql
WITH ranked_failed_runs AS (
  SELECT
    id,
    model_name,
    status,
    latency_ms,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY model_name
      ORDER BY created_at DESC
    ) AS failed_rank
  FROM agent_runs
  WHERE status = 'failed'
)
SELECT id, model_name, latency_ms, created_at
FROM ranked_failed_runs
WHERE failed_rank <= 3
ORDER BY model_name, created_at DESC;
```

返回结果是：

| id | model_name | latency_ms | created_at |
| ---: | --- | ---: | --- |
| 3 | gpt-4o-mini | 1600 | 2026-05-12 |
| 1 | gpt-4o-mini | 1800 | 2026-05-10 |
| 5 | qwen-vl | 2100 | 2026-05-13 |
| 4 | qwen-vl | 2400 | 2026-05-11 |

这类查询用普通 `GROUP BY` 很难自然表达，因为我们不是要每个模型的一行统计，而是要每个模型内部的若干条明细。

## 5. 为什么这对 AI 开发有用

很多 AI 系统会产生日志和评估结果。我们经常不只想知道总量，还想保留样本级别信息。

例如：

- 每个用户最近一次对话。
- 每个模型版本最慢的 10 次请求。
- 每个任务类型里评分最高和最低的样本。
- 每个 Agent 运行中第几次工具调用失败。

这些都很适合用 CTE 和窗口函数表达。

## 6. 学习阶段的建议

刚开始不需要追求写出最短 SQL。更好的目标是：

- 先写出正确查询。
- 再用 CTE 拆成能读懂的步骤。
- 最后再考虑性能和执行计划。

SQL 是声明式语言，但复杂 SQL 仍然需要清晰的思路。CTE 的价值就在这里：它让查询像笔记一样，一步一步把问题展开。
