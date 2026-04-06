---
title: LangGraph 学习路线图：先建图，再进入持久化与中断
published: 2026-04-05
description: 这组笔记从 LangGraph 入门开始，沿着 StateGraph、持久化、durable execution、流式与 interrupts 走主线，再补上 time-travel、memory、subgraphs 与典型 agent 模式。
tags: [LangGraph, 学习路线, Agent]
category: LangGraph
draft: false
pinned: true
priority: 1
comment: false
---

LangGraph 的官方材料很强，但也有一个和 LangChain 类似的问题：它更像“能力文档”和“特性索引”，不完全像一条平滑的学习路线。

如果直接按功能点跳着看，很容易出现这几种感觉：

- 刚理解 `StateGraph`，后面就已经在谈 `interrupt`、`checkpoint`、`task`。
- `Memory / Persistence / Time-travel / Durable execution` 这几块彼此高度相关，但常常被拆着读。
- 一些概念第一次出现时只是“先拿来用”，真正的边界要到后面几节才清楚。

所以这组文集我按“先搭一个图，再逐步让它变得像真正能上线的工作流”的顺序整理成下面这条主线：

1. `LangGraph 入门：StateGraph、节点、边、工具与记忆初探`
先把最小可运行图搭出来，搞清楚节点、边、状态和工具调用是怎么衔接的。

2. `Persistence：线程、检查点、状态历史与 Store`
理解 LangGraph 为什么能回放、恢复、分叉，以及线程和检查点到底保存了什么。

3. `Durable Execution：为什么副作用最好放进 task`
把“能保存状态”和“能安全恢复执行”区分开，建立 durable execution 的基本直觉。

4. `Streaming：图为什么能流式吐 token、状态和调试事件`
把 `stream()/astream()` 的几种模式看清楚，理解 LangGraph 的运行时可观测性。

5. `Interrupts：人类介入、审批流与恢复执行`
把中断真正放回工作流里看，理解它为什么是 LangGraph 里最重要的能力之一。

6. `Time-travel：重放与分叉`
用检查点回溯历史，做调试、回放与分叉试验。

7. `Memory：短期与长期记忆`
搞清楚短期 checkpoint 和记忆 Store 的职责边界，以及如何管理上下文膨胀。

8. `Subgraphs：子图复用与持久化策略`
让复杂图变成可组合的模块，同时掌握子图的命名空间与持久化模式。

9. `从流程到 Agent：建图思路`
先画流程，再拆节点与 state，最后才落到可运行的图。

10. `典型工作模式：Prompt Chaining / Parallel / Routing / Orchestrator / Evaluator`
把常见结构收成模板，方便以后按需套用或组合。

如果是第一次系统学 LangGraph，建议按这里的顺序一路往下读：
先学“怎么建图”，再学“怎么让图能恢复、能暂停、能观测”，最后再补齐 time-travel、memory 与 agent 模式，理解会顺很多。
