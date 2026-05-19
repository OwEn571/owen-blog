---
title: SQL 学习路线图：从表查询到 AI 应用里的结构化数据
published: 2026-05-17
description: 先把 SELECT、过滤、聚合、JOIN、子查询、事务和索引这些基础打通，再看它们在 RAG、Text2SQL 和 Agent 工具调用里的位置。
tags: [SQL, 学习路线, Database, AI]
category: SQL
draft: false
pinned: true
priority: 1
comment: false
---

我以前容易把 SQL 当成“后端开发才会用到的数据库语言”。但最近越看 AI 应用，越发现它其实经常站在系统边上：

- RAG 里要用 metadata filter，把自然语言问题转成结构化过滤条件。
- Text2SQL 本身就是让模型读懂表结构，再生成可执行查询。
- Agent 做工具调用时，经常要查订单、用户、日志、指标这些结构化数据。
- 评估和实验分析也离不开按条件筛选、分组统计和对比结果。

所以这组 SQL 笔记不打算写成“数据库管理员大全”，而是先服务一个更朴素的目标：能读懂表，能安全查询，能理解多表关系，能知道模型什么时候在生成危险或不合理的 SQL。

虽然标题叫 SQL，但我不会只停在语法。事务的 ACID、约束、索引、执行计划、隔离和权限边界这些数据库基础，也会穿插进来。因为真正开发时，我们不是在孤立地“写 SQL 语句”，而是在和一个会保存状态、保证一致性、承受并发访问的数据库系统打交道。

这组文章里的 SQL 示例会尽量使用比较通用的写法；如果涉及 `INTERVAL`、`RETURNING`、窗口函数这类不同数据库方言略有差异的地方，我会按 PostgreSQL 风格来写，并在心智上提醒自己：真正落地时还要看 MySQL、SQLite、PostgreSQL 或 DuckDB 的具体语法差别。

我会先按这条路线整理：

1. `SQL 入门：关系模型、表、行、列与主键`
先建立数据库的基本心智：表为什么不是 Excel，主键、外键、字段类型和 NULL 到底在约束什么。

2. `SQL 查询基础：SELECT、WHERE、ORDER BY 与 LIMIT`
从最常见的读取开始，掌握投影、过滤、排序、分页这些几乎每天都会用到的操作。

3. `SQL 聚合分组：COUNT、GROUP BY 与 HAVING`
理解“明细数据”和“统计结果”的区别。很多报表、日志分析和评估指标，其实就是这一层。

4. `SQL 多表查询：JOIN、外键与关系建模`
进入 SQL 最关键的一步：数据为什么要拆成多张表，以及怎么通过 JOIN 把关系重新拼回来。

5. `SQL 进阶查询：子查询、CTE 与窗口函数入门`
当单条查询开始变复杂，就需要能把问题拆成中间步骤。CTE 更像给 SQL 查询加一个可读的草稿区。

6. `SQL 写入与可靠性：INSERT、UPDATE、DELETE、事务与约束`
查询只是读世界，写入会改变世界。这一篇重点放在如何少犯危险错误，以及事务、ACID 和约束为什么重要。

7. `SQL 性能直觉：索引、执行计划与慢查询`
不追求一上来精通优化，但至少要知道索引为什么能加速，也知道它不是越多越好。

8. `SQL 与 AI 开发：Text2SQL、RAG 过滤与 Agent 数据工具`
最后回到最初的动机：把 SQL 放回 AI 应用里，看模型如何使用结构化数据，以及开发者需要给它哪些边界。

## 统一样例

为了后面的文章不来回换场景，我会主要围绕两类表来讲。

第一类是传统业务表：

```text
users
- id
- name
- email
- status
- created_at

orders
- id
- user_id
- total_amount
- status
- created_at

products
- id
- name
- stock
- price
```

它们适合解释主键、外键、过滤、聚合、JOIN、事务和索引。

第二类是 AI 应用日志表：

```text
agent_runs
- id
- user_id
- model_name
- status
- latency_ms
- created_at

agent_tool_calls
- id
- run_id
- tool_name
- status
- created_at
```

它们适合解释为什么 AI 开发也经常离不开 SQL：很多系统问题最后都会落成“查某个时间范围内、某种状态下、某个模型版本或某类工具调用的表现”。

这条路线的目标不是背语法，而是形成一套“结构化数据直觉”。如果能看到一个产品问题，就自然想到它背后可能有哪些表、字段、关系和查询路径，那 SQL 就开始真正有用了。
