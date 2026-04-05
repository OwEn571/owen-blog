---
title: LangGraph 学习路线图：先建图，再进入持久化与中断
published: 2026-04-05
description: 这组笔记从 LangGraph 入门开始，顺着 StateGraph、持久化、durable execution、流式与 interrupts 这条主线往下走，尽量把概念放回一条连续工作流里。
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

目前我已经把手头写完的 1 到 5 篇整理进来了；后面的 `Time-travel` 和 `Memory`，暂时更像单独展开的备忘与补充，等笔记写得更完整后再单开文。

如果是第一次系统学 LangGraph，建议按这里的顺序一路往下读：
先学“怎么建图”，再学“怎么让图能恢复、能暂停、能观测”，最后再回头看更复杂的 agent 编排，理解会顺很多。
