---
title: SQL 入门：关系模型、表、行、列与主键
published: 2026-05-17
description: 从数据库最基本的对象开始：表、行、列、字段类型、主键、外键和 NULL，先把结构化数据的心智搭起来。
tags: [SQL, Database, 关系模型]
category: SQL
draft: false
comment: false
---

SQL 的第一步不是背 `SELECT`，而是先理解它面对的数据长什么样。

关系型数据库把数据组织成一张张表。表里每一行是一条记录，每一列是一类属性。比如一个用户表可以长这样：

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

这里已经出现了几个核心概念：

- `users` 是表名。
- `id`、`name`、`email`、`status`、`created_at` 是列名。
- `INTEGER`、`TEXT`、`TIMESTAMP` 是字段类型。
- `PRIMARY KEY` 表示主键，用来唯一识别一行。
- `NOT NULL` 表示这个字段不能空。
- `UNIQUE` 表示这个字段不能重复。
- `DEFAULT` 表示插入数据时如果没有传这个字段，就使用默认值。

如果把这张表翻译成人话，就是：系统里有很多用户，每个用户都有一个唯一 `id`，最好有名字和创建时间，邮箱如果存在就不能和别人重复；新用户默认是 `active` 状态，创建时间默认用当前时间。

这一篇先用一张很小的用户表做例子：

| id | name | email | status | created_at |
| --- | --- | --- | --- | --- |
| 1 | Owen | owen@example.com | active | 2026-05-01 10:00:00 |
| 2 | Alice | alice@example.com | active | 2026-05-02 09:30:00 |
| 3 | Bob |  | inactive | 2026-05-03 21:10:00 |

这张表里每一行是一个用户，每一列是这个用户的一类属性。Bob 的 `email` 为空，后面讲 `NULL` 时会用到它。

## 1. 表不是 Excel

刚接触数据库时，很容易把表理解成 Excel。但数据库表更强调约束和关系。

Excel 里一个单元格可以随手填任何东西，数据库不太鼓励这样。字段类型、主键、唯一约束、非空约束，都是为了让数据有稳定形状。稳定的形状很重要，因为后面的查询、统计、程序调用、模型生成 SQL，全都依赖这份结构。

比如 `created_at` 如果有时是日期，有时是中文字符串，有时为空，那后面想按时间排序、筛选最近 7 天、统计每天新增用户都会变得很痛苦。

所以建表其实是在提前回答一个问题：这类数据应该长成什么样？只要表结构稳定，后面的 SQL、后端接口、Agent 工具调用才有稳定的抓手。

## 2. 主键：一行数据的身份证

主键的作用是唯一识别一行。常见写法是：

```sql
id INTEGER PRIMARY KEY
```

在业务里，用户的名字可能重复，邮箱也可能因为历史数据或迁移问题出错，但 `id` 应该稳定唯一。程序查询、更新、关联数据时，通常都靠主键。

比如：

```sql
SELECT *
FROM users
WHERE id = 1;
```

返回结果就是：

| id | name | email | status | created_at |
| --- | --- | --- | --- | --- |
| 1 | Owen | owen@example.com | active | 2026-05-01 10:00:00 |

这句话的含义很明确：我要找 `users` 表里主键为 1 的那一行。

主键最好不要承载太多业务含义。比如不要把邮箱直接当主键，因为邮箱可能改；也不要把用户名当主键，因为用户名可能重复。一个稳定的 `id` 会让系统后续演进轻松很多。

## 3. 外键：表与表之间的关系

真实业务里，数据通常不会只放在一张大表里。比如订单表可能长这样：

```sql
CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  total_amount DECIMAL(10, 2) NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL
);
```

这里的 `user_id` 指向 `users.id`，表示“这张订单属于哪个用户”。这就是关系型数据库里非常常见的建模方式。

有些数据库会显式写外键约束：

```sql
FOREIGN KEY (user_id) REFERENCES users(id)
```

外键可以帮助数据库检查关系是否合法。比如不能让一张订单指向一个根本不存在的用户。

这里对应的是最常见的一对多关系：一个用户可以有多张订单，一张订单只属于一个用户。这个“关系”不是写在文章里的抽象概念，而是落在字段上的：`orders.user_id` 指向 `users.id`。

如果以后遇到多对多关系，通常还会多出一张中间表。比如一篇文章可以有多个标签，一个标签也可以属于多篇文章，就可能有：

```sql
CREATE TABLE post_tags (
  post_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (post_id, tag_id)
);
```

这张表自己不一定代表一个业务实体，它代表的是“文章和标签之间的关联”。

## 4. NULL：不是空字符串，也不是 0

`NULL` 表示未知、缺失或不适用。它不是空字符串 `''`，也不是数字 `0`。

这点在查询时很重要。判断空值不能写：

```sql
WHERE email = NULL
```

而应该写：

```sql
WHERE email IS NULL
```

如果套到上面的示例表，返回结果是：

| id | name | email | status | created_at |
| --- | --- | --- | --- | --- |
| 3 | Bob |  | inactive | 2026-05-03 21:10:00 |

判断非空则是：

```sql
WHERE email IS NOT NULL
```

如果一个字段业务上必须存在，就尽量加 `NOT NULL`。不然很多问题会被推迟到查询和业务代码里爆出来。

## 5. DEFAULT：给字段设置默认值

建表时可以给字段设置默认值。这样插入数据时，如果没有显式传这个字段，数据库会自动填上默认值。

比如上面的用户表里：

```sql
status TEXT NOT NULL DEFAULT 'active',
created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
```

这表示：

- 如果插入用户时不传 `status`，默认就是 `active`。
- 如果插入用户时不传 `created_at`，默认就是当前时间。

插入时可以这样写：

```sql
INSERT INTO users (id, name, email)
VALUES (4, 'Cindy', 'cindy@example.com');
```

数据库会自动补出类似这样的结果：

| id | name | email | status | created_at |
| ---: | --- | --- | --- | --- |
| 4 | Cindy | cindy@example.com | active | 2026-05-17 16:20:00 |

默认值很适合放这些字段：

- 状态字段，比如 `status DEFAULT 'active'`
- 时间字段，比如 `created_at DEFAULT CURRENT_TIMESTAMP`
- 计数字段，比如 `retry_count DEFAULT 0`
- 布尔字段，比如 `is_deleted DEFAULT false`

但默认值也不能乱用。如果某个字段必须由业务明确决定，就不要随便给默认值，否则可能把错误输入悄悄盖过去。

## 6. 示例字段是否全面

这篇里的 `users` 表不是完整的用户系统设计，只是为了入门保留的最小例子。真实业务表可能还会有很多字段：

```text
users
- id
- name
- email
- password_hash
- status
- role
- created_at
- updated_at
- deleted_at
- last_login_at
```

但学习 SQL 时，一开始不适合把字段铺太满。字段太多会干扰主线：先理解表、行、列、主键、外键、NULL、默认值和约束，比一上来追求“真实系统所有字段”更重要。

所以可以这样看：

- 入门示例表：字段少，用来学概念。
- 真实业务表：字段多，用来表达完整业务状态。
- 建模能力：知道什么时候该加字段、什么时候该加约束、什么时候该拆表。

## 7. 字段命名也会影响可读性

SQL 不是只给数据库看的，它也给人和模型看。

比较清楚的字段名通常有这些特征：

- 主键统一叫 `id`，外键用 `xxx_id`。
- 时间字段用 `created_at`、`updated_at`、`deleted_at` 这类稳定习惯。
- 状态字段用 `status`，并明确有哪些取值。
- 金额字段带上单位或语义，比如 `total_amount`、`price`。

这些习惯对 Text2SQL 也有帮助。字段名越贴近业务含义，模型越不容易把字段猜错。

## 8. AI 开发为什么也要懂这些

当我们让模型做 Text2SQL，或者让 Agent 调用数据库工具时，模型并不是在凭空猜答案。它需要理解表结构：

- 哪张表存用户？
- 哪个字段是时间？
- 哪个字段能关联订单？
- 哪些字段可能为空？
- 哪些字段代表状态、金额、数量？

如果开发者自己都不清楚这些，模型生成的 SQL 就很难被审查。SQL 基础的第一层价值，就是让我们能看懂结构化数据的边界。

这一篇先停在“表是什么”。下一篇进入最常用的读取语法：`SELECT`、`WHERE`、`ORDER BY` 和 `LIMIT`。
