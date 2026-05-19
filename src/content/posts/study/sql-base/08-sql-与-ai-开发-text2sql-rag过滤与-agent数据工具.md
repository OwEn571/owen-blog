---
title: SQL 与 AI 开发：Text2SQL、RAG 过滤与 Agent 数据工具
published: 2026-05-17
description: 回到最初的学习动机：SQL 为什么会出现在 AI 应用里，以及开发者需要怎样给模型提供 schema、权限和执行边界。
tags: [SQL, Text2SQL, RAG, Agent]
category: SQL
draft: false
comment: false
---

学 SQL 的直接收益是能查数据库。但放到 AI 开发里，它还有另一层价值：让模型能接触结构化数据。

很多信息不是以文档形式存在的，而是藏在表里：

- 用户、订单、商品、库存。
- 任务、日志、实验、评估结果。
- 工单、项目、权限、配置。
- 对话记录、工具调用、模型响应和反馈。

这些数据很难只靠向量检索解决。它们更适合用 SQL 精确查询。

所以 AI 应用里的数据访问，通常会同时有两条路：

- 非结构化知识：文档、网页、PDF、笔记，更适合向量检索和 RAG。
- 结构化数据：用户、订单、日志、指标，更适合 SQL。

很多系统做得不稳，不是模型不会回答，而是没有把这两类数据分清楚。

这一篇主要用两张 AI 日志表：

`agent_runs`：

| id | user_id | model_name | status | latency_ms | created_at |
| ---: | ---: | --- | --- | ---: | --- |
| 1 | 10 | gpt-4o-mini | success | 1200 | 2026-05-10 |
| 2 | 10 | gpt-4o-mini | failed | 1800 | 2026-05-11 |
| 3 | 11 | qwen-vl | failed | 2400 | 2026-05-12 |
| 4 | 12 | gpt-4o-mini | failed | 1600 | 2026-05-12 |

`agent_tool_calls`：

| id | run_id | tool_name | status | created_at |
| ---: | ---: | --- | --- | --- |
| 101 | 2 | web_search | failed | 2026-05-11 |
| 102 | 2 | sql_query | success | 2026-05-11 |
| 103 | 3 | vision_parse | failed | 2026-05-12 |
| 104 | 4 | web_search | failed | 2026-05-12 |

## 1. Text2SQL：自然语言到 SQL

Text2SQL 的目标是把自然语言问题转成 SQL。这里提供一个榜单：https://bird-bench.github.io/

比如用户问：

> 最近 7 天每天有多少次失败的 Agent 运行？

模型可能生成：

```sql
SELECT
  DATE(created_at) AS day,
  COUNT(*) AS failed_runs
FROM agent_runs
WHERE status = 'failed'
  AND created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY day;
```

套到上面的 `agent_runs` 表，返回结果可能是：

| day | failed_runs |
| --- | ---: |
| 2026-05-11 | 1 |
| 2026-05-12 | 2 |

这类能力看起来很美好，但前提是模型得知道：

- 有哪些表。
- 每张表是什么意思。
- 字段名和字段含义。
- 表之间怎么关联。
- 时间、状态、金额这些字段的单位和取值范围。

也就是说，Text2SQL 不只是模型能力，也是 schema 设计和上下文工程问题。

一个比较稳的 Text2SQL 流程不是“用户问题 -> SQL -> 执行”，而是：

1. 识别用户意图和需要的表。
2. 让模型基于有限 schema 生成查询计划。
3. 生成 SQL。
4. 做静态检查和权限检查。
5. 执行只读查询。
6. 把结果交给模型总结。

中间多出来的检查步骤，看起来啰嗦，但它们是在保护数据库和用户数据。

## 2. 给模型的 schema 不能太随意

如果直接把数据库所有建表语句塞给模型，可能会出现几个问题：

- 上下文太长。
- 暴露不该暴露的表和字段。
- 模型注意力分散。
- 业务含义仍然不清楚。

更好的方式是给一份面向查询的 schema 说明：

```text
Table: agent_runs
Description: 每次 Agent 执行的总记录，一行对应一次完整运行。
Columns:
- id: 主键
- user_id: 发起运行的用户 id
- status: 运行状态，可取 success、failed、running
- model_name: 本次运行使用的模型
- created_at: 运行开始时间
- latency_ms: 总耗时，单位毫秒

Recommended queries:
- 按 created_at 做时间过滤
- 按 status 统计成功率或失败数量
- 通过 id 关联 agent_tool_calls.run_id
```

模型需要的不只是字段名，还需要字段背后的业务语义。

如果表很多，还可以先做 schema 路由：根据问题判断最可能相关的几张表，只把这几张表的说明给模型。比如用户问“最近失败的工具调用”，就没必要把订单、商品、支付表都塞进去。

我更愿意给模型这种上下文：

```text
User question:
最近 7 天哪个工具失败最多？

Relevant tables:
- agent_tool_calls: 每次工具调用，一行一次调用
- agent_runs: 每次 Agent 运行，一行一次运行

Join path:
- agent_tool_calls.run_id -> agent_runs.id

Important columns:
- agent_tool_calls.tool_name: 工具名
- agent_tool_calls.status: success 或 failed
- agent_tool_calls.created_at: 调用时间
```

在这份 schema 说明下，模型可以生成：

```sql
SELECT tool_name, COUNT(*) AS failed_count
FROM agent_tool_calls
WHERE status = 'failed'
  AND created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY tool_name
ORDER BY failed_count DESC;
```

返回结果可能是：

| tool_name | failed_count |
| --- | ---: |
| web_search | 2 |
| vision_parse | 1 |

这比单纯贴一坨建表语句更接近“给模型一张可读地图”。

## 3. RAG 里的 SQL：metadata filter

RAG 不一定只做向量相似度。很多时候，先用结构化条件缩小范围，效果会更稳定。

比如用户问：

> 只看 2026 年发布的 FastAPI 笔记，里面有没有讲 CORS？

这可以拆成两层：

1. SQL 或 metadata filter：限定 `category = 'PythonWeb'`，`published_at` 在 2026 年。
2. 向量检索：在过滤后的文档块里找 CORS 相关内容。

这种方式比全库向量搜索更可控，也更符合用户问题里的明确约束。

如果把文档块存在一张表里，可能会长这样：

```text
document_chunks
- id
- document_id
- category
- published_at
- author
- chunk_text
- embedding
```

如果它的数据是：

| id | category | published_at | chunk_text |
| ---: | --- | --- | --- |
| 1 | PythonWeb | 2026-03-21 | FastAPI 如何配置 CORS... |
| 2 | RAG | 2026-03-30 | 向量检索和重排... |
| 3 | PythonWeb | 2025-12-10 | Flask 路由基础... |

那么结构化过滤可以先执行：

```sql
SELECT id, chunk_text
FROM document_chunks
WHERE category = 'PythonWeb'
  AND published_at >= '2026-01-01'
  AND published_at < '2027-01-01';
```

返回结果是：

| id | chunk_text |
| ---: | --- |
| 1 | FastAPI 如何配置 CORS... |

用户问题里的“2026 年”“FastAPI 笔记”不是语义相似度问题，而是明确过滤条件。先过滤，再向量检索，通常会比直接全库检索更稳。

这也是混合检索的一个基本思路：结构化条件负责缩小边界，向量相似度负责在边界内找语义相关内容。

## 4. Agent 数据工具：最好从只读开始

Agent 可以把 SQL 查询作为工具。但默认最好只开放只读查询。

一个工具可以设计成：

```text
Tool: query_database
Input:
- sql: 只允许 SELECT 语句
Rules:
- 必须带 LIMIT，除非是聚合查询
- 最大返回 100 行
- 查询超时 5 秒
- 禁止访问敏感字段
```

这比让模型拿到数据库连接随便执行安全得多。

如果确实需要写入，不建议让模型直接生成 `UPDATE` 或 `DELETE`。更好的方式是设计业务工具：

```text
Tool: mark_ticket_resolved
Input:
- ticket_id
- resolution_note
```

让工具内部执行固定 SQL，并做权限检查、参数校验和审计日志。

## 5. 结果解释也要防幻觉

SQL 查询返回的是结构化结果，但模型总结结果时仍然可能说过头。

比如 SQL 只查到了最近 7 天的失败次数，模型却总结成“这个工具一直不稳定”，这就超出了数据范围。比较稳的做法是把查询条件和结果规模一起交给模型：

```text
SQL result context:
- 时间范围：最近 7 天
- 返回行数：5
- 指标：每个工具的失败调用次数
- 限制：没有查询成功率，只查询失败次数
```

这样模型更容易把结论限定在数据能支持的范围内。

## 6. 开发者要审查什么

看到模型生成 SQL 时，可以先检查这些点：

- 查询意图是否和用户问题一致。
- 表和字段是否选对。
- JOIN 条件是否合理。
- 是否误用了 `INNER JOIN` 导致数据丢失。
- 是否缺少时间范围或 `LIMIT`。
- 聚合字段是否正确。
- 是否可能访问敏感信息。
- 是否包含写入、删除、改表等危险操作。

这也是为什么 SQL 基础值得学。我们不一定要手写所有查询，但必须有能力判断模型写出来的查询靠不靠谱。

## 7. 一个最小工作流

如果要做一个简单的 Text2SQL 功能，我会先从这个流程开始：

1. 只选择少量查询安全的表。
2. 手写 schema 描述和示例问题。
3. 要求模型先解释查询计划，再生成 SQL。
4. 对 SQL 做静态检查，只允许 `SELECT`。
5. 自动追加或校验 `LIMIT`。
6. 执行查询并把结果返回给模型总结。
7. 记录用户问题、SQL、结果行数和耗时，方便后续评估。

还可以加几条简单的护栏：

- 查询必须命中白名单表。
- 不允许 `SELECT *` 返回敏感字段。
- 不允许无时间范围地扫日志大表。
- 不允许多语句执行。
- 对 `DROP`、`ALTER`、`TRUNCATE`、`UPDATE`、`DELETE` 直接拒绝。
- 查询结果超过阈值时，只返回聚合摘要或要求用户缩小范围。

SQL 在 AI 应用里不是一个孤立技能。它连接了数据建模、权限、安全、检索、评估和工具调用。学它的目的，也不是为了背更多语法，而是让 AI 系统在面对结构化数据时更可靠。
