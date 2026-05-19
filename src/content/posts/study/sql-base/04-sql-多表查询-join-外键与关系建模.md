---
title: SQL 多表查询：JOIN、外键与关系建模
published: 2026-05-17
description: 理解为什么数据要拆成多张表，以及如何用 INNER JOIN、LEFT JOIN 把关系重新查询出来。
tags: [SQL, JOIN, 关系建模]
category: SQL
draft: false
comment: false
---

SQL 真正开始变有用，通常是从 `JOIN` 开始的。

单表查询只能回答“这张表里有什么”。但真实业务里的问题经常跨表：

- 查询每个订单对应的用户邮箱。
- 查询每个用户最近一次支付记录。
- 查询某篇文章的作者信息和评论数量。
- 查询某次 Agent 运行关联的工具调用和最终结果。

这些都需要多表查询。

这一篇用两张表来讲。

`users` 表：

| id | name | email |
| ---: | --- | --- |
| 1 | Owen | owen@example.com |
| 2 | Alice | alice@example.com |
| 3 | Bob | bob@example.com |

`orders` 表：

| id | user_id | total_amount | status |
| ---: | ---: | ---: | --- |
| 101 | 1 | 99.00 | paid |
| 102 | 1 | 199.00 | paid |
| 103 | 2 | 49.00 | pending |

可以先观察一个事实：Bob 在用户表里存在，但订单表里没有他的订单。

## 1. 为什么要拆表

假设有用户和订单两类数据。如果把它们全塞进一张大表，可能会变成：

| order_id | user_name | user_email | total_amount |
| --- | --- | --- | --- |
| 1 | Owen | owen@example.com | 99 |
| 2 | Owen | owen@example.com | 199 |

用户信息会随着每个订单重复出现。重复越多，越容易出现更新不一致：如果用户改了邮箱，要改很多行。

更合理的方式是拆成两张表：

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE
);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  total_amount DECIMAL(10, 2) NOT NULL,
  status TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

订单表只保存 `user_id`，通过它指向用户表。

拆表的目标不是让查询变复杂，而是让数据只在该出现的地方出现一次。用户邮箱属于用户，不属于订单；订单金额属于订单，不属于用户。把责任分清楚，后面更新和查询才不容易互相污染。

## 2. FOREIGN KEY：把关系交给数据库检查

`user_id` 这个字段本身表达的是一种设计思路：订单属于某个用户，所以订单表里保存用户 id。

但如果只写一个普通的 `user_id INTEGER NOT NULL`，数据库并不知道它一定要对应 `users.id`。这时即使插入一条不存在用户的订单，数据库也可能允许：

| id | user_id | total_amount | status |
| ---: | ---: | ---: | --- |
| 104 | 999 | 88.00 | paid |

如果 `users` 表里没有 `id = 999`，这就是一条“孤儿订单”。

所以可以在建表时声明外键约束：

```sql
FOREIGN KEY (user_id) REFERENCES users(id)
```

它的意思是：`orders.user_id` 必须引用 `users.id` 中真实存在的值。

这样数据库会帮我们守住几条规则：

- 插入订单时，`user_id` 必须能在 `users.id` 中找到。
- 更新订单的 `user_id` 时，也不能改成不存在的用户。
- 删除用户时，如果还有订单引用这个用户，数据库会根据外键规则阻止删除，或者按设置做级联处理。

所以可以把三件事分开理解：

| 概念 | 作用 |
| --- | --- |
| `user_id` 字段 | 在表结构上表达“订单属于用户” |
| `FOREIGN KEY` | 在数据库层面强制检查这个关系是否合法 |
| `JOIN` | 查询时利用这个关系把两张表连起来 |

没有外键，也可以写 `JOIN`；但没有外键，数据库不会主动帮你阻止脏数据。学习阶段先记住：`JOIN` 是查数据时用，`FOREIGN KEY` 是保护数据时用。

> 设置外键的时候可以写 ON UPDATE CASCADE ，这样主键更新的时候就会级联更新，必须显式配置。但是业务中尽量别更新主键，尤其是id这种 surrogate key （代理键，也就是没有业务含义，只是为了唯一标识一行而生成的id，对应的有业务信息的叫自然键），最好一旦生成就保持稳定。

## 3. INNER JOIN：只返回匹配成功的数据

查询订单和对应用户邮箱：

```sql
SELECT
  orders.id AS order_id,
  users.email,
  orders.total_amount,
  orders.status
FROM orders
INNER JOIN users ON orders.user_id = users.id;
```

> 这里并不是 `FROM orders` 只从 `orders` 查，而是从 `orders INNER JOIN users ON orders.user_id = users.id` 这张临时连接结果里查。

返回结果是：

| order_id | email | total_amount | status |
| ---: | --- | ---: | --- |
| 101 | owen@example.com | 99.00 | paid |
| 102 | owen@example.com | 199.00 | paid |
| 103 | alice@example.com | 49.00 | pending |

`INNER JOIN` 的含义是：两边能匹配上的行才返回。

如果某个订单的 `user_id` 找不到用户，这条订单不会出现在结果里。这通常是合理的，因为它代表关系不完整。

如果表名比较长，可以从一开始就使用别名：

```sql
SELECT
  o.id AS order_id,
  u.email,
  o.total_amount,
  o.status
FROM orders AS o
INNER JOIN users AS u ON o.user_id = u.id;
```

我个人更喜欢这种写法，因为一眼能看出每个字段来自哪张表。

## 4. LEFT JOIN：保留左表数据

如果我们想查“所有用户，以及他们的订单”，即使用户没有订单也要返回，就用 `LEFT JOIN`：

```sql
SELECT
  users.id,
  users.name,
  orders.id AS order_id,
  orders.total_amount
FROM users
LEFT JOIN orders ON users.id = orders.user_id;
```

返回结果是：

| id | name | order_id | total_amount |
| ---: | --- | ---: | ---: |
| 1 | Owen | 101 | 99.00 |
| 1 | Owen | 102 | 199.00 |
| 2 | Alice | 103 | 49.00 |
| 3 | Bob |  |  |

`LEFT JOIN` 会保留左边 `users` 表的所有行。没有匹配订单时，订单相关字段会是 `NULL`。

这在排查数据时很常用。比如想找从未下单的用户：

```sql
SELECT users.id, users.name
FROM users
LEFT JOIN orders ON users.id = orders.user_id
WHERE orders.id IS NULL;
```

返回结果是：

| id | name |
| ---: | --- |
| 3 | Bob |

`LEFT JOIN` 的方向很重要。`users LEFT JOIN orders` 是保留所有用户；如果写成 `orders LEFT JOIN users`，保留的就是所有订单。读 JOIN 时，先看左边是哪张表。

## 5. 一对多会让行数变多

JOIN 不是简单地“把字段补上”。如果一个用户有 3 张订单，那么用户表里的一行，JOIN 之后可能变成 3 行。

```sql
SELECT
  u.id,
  u.name,
  o.id AS order_id
FROM users AS u
JOIN orders AS o ON u.id = o.user_id
WHERE u.id = 1;
```

返回结果是：

| id | name | order_id |
| ---: | --- | ---: |
| 1 | Owen | 101 |
| 1 | Owen | 102 |

如果用户 1 有三张订单，结果就会有三行。这不是重复，而是一对多关系展开后的自然结果。

这也是 JOIN 后做统计时最容易出错的地方。比如你 JOIN 了订单表以后再 `COUNT(users.id)`，统计出来的可能不是用户数，而是用户和订单展开后的行数。需要去重时可以用：

```sql
SELECT COUNT(DISTINCT u.id) AS user_count
FROM users AS u
JOIN orders AS o ON u.id = o.user_id;
```

## 6. JOIN 后再聚合

`JOIN` 和 `GROUP BY` 经常一起使用。

比如统计每个用户的已支付订单金额：

```sql
SELECT
  users.id,
  users.name,
  SUM(orders.total_amount) AS paid_amount
FROM users
JOIN orders ON users.id = orders.user_id
WHERE orders.status = 'paid'
GROUP BY users.id, users.name
ORDER BY paid_amount DESC;
```

> 这里 GROUP 后面有两个字段，意思是按照 (users.id, users.name) 这个组合来分组。为什么不直接 GROUP BY users.id 呢？因为 SELECT 中还写了普通列 users.name，在严格SQL规则下，SELECT 里出现的非聚合列，通常都要出现在 GROUP BY 里。

返回结果是：

| id | name | paid_amount |
| ---: | --- | ---: |
| 1 | Owen | 298.00 |

这里先把用户和订单关联起来，再过滤已支付订单，最后按用户分组统计金额。

如果想保留没有支付订单的用户，就要更小心。下面这个写法会因为 `WHERE o.status = 'paid'` 把没有订单的用户过滤掉：

```sql
SELECT u.id, u.name, SUM(o.total_amount) AS paid_amount
FROM users AS u
LEFT JOIN orders AS o ON u.id = o.user_id
WHERE o.status = 'paid'
GROUP BY u.id, u.name;
```

更稳的写法是把条件放进 JOIN 条件里：

```sql
SELECT
  u.id,
  u.name,
  COALESCE(SUM(o.total_amount), 0) AS paid_amount
FROM users AS u
LEFT JOIN orders AS o
  ON u.id = o.user_id
  AND o.status = 'paid'
GROUP BY u.id, u.name;
```

`COALESCE` 的意思是：如果结果是 `NULL`，就用后面的默认值。这里没有已支付订单的用户，金额就显示为 0。

## 7. 表别名：让查询短一点

表名长的时候，可以用别名：

```sql
SELECT
  u.id,
  u.name,
  SUM(o.total_amount) AS paid_amount
FROM users AS u
JOIN orders AS o ON u.id = o.user_id
WHERE o.status = 'paid'
GROUP BY u.id, u.name;
```

`AS` 可以省略，但学习阶段写出来更清楚。

## 8. 多对多关系通常要经过中间表

如果要表示“订单包含多个商品，一个商品也可以出现在多个订单里”，一般会有一张订单明细表：

`products` 表：

| id | name |
| ---: | --- |
| 201 | SQL Notebook |
| 202 | Database Mug |

`order_items` 表：

| order_id | product_id | quantity | price |
| ---: | ---: | ---: | ---: |
| 101 | 201 | 2 | 39.00 |
| 101 | 202 | 1 | 21.00 |

```sql
CREATE TABLE order_items (
  order_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  PRIMARY KEY (order_id, product_id)
);
```

查询订单里的商品时，路径会变成：

```sql
SELECT
  o.id AS order_id,
  p.name AS product_name,
  oi.quantity,
  oi.price
FROM orders AS o
JOIN order_items AS oi ON o.id = oi.order_id
JOIN products AS p ON oi.product_id = p.id
WHERE o.id = 101;
```

返回结果是：

| order_id | product_name | quantity | price |
| ---: | --- | ---: | ---: |
| 101 | SQL Notebook | 2 | 39.00 |
| 101 | Database Mug | 1 | 21.00 |

这类中间表很常见。看 schema 时，如果发现表名像 `xxx_yyy`，里面主要是两个外键，基本就可以怀疑它是在表达多对多关系。

## 9. Text2SQL 最容易在 JOIN 上翻车

模型生成 SQL 时，`JOIN` 是高风险区域。常见问题包括：

- 关联字段选错，比如把 `orders.id` 和 `users.id` 直接连起来。
- 应该用 `LEFT JOIN` 却用了 `INNER JOIN`，导致无匹配的数据被悄悄丢掉。
- 多对多关系没有经过中间表，结果重复行暴涨。
- JOIN 后聚合没有处理重复，统计结果偏大。

所以做 AI 数据查询工具时，给模型提供清晰 schema 很重要。最好明确告诉它：

- 每张表代表什么实体。
- 主键和外键是什么。
- 表之间是一对一、一对多，还是多对多。
- 哪些 JOIN 路径是推荐的。

掌握 `JOIN` 以后，SQL 就从单表检索进入了关系推理。下一篇再看如何把复杂查询拆成更可读的步骤。
