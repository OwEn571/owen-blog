---
title: AIOS Newsroom 总览：从比赛 Demo 到服务器上的 Agent Ecosystem
published: 2026-04-07
description: 本文整理 AIOS Newsroom 的目标、分层、运行方式，以及它为何以 Lab 项目而不是单篇文章的形式存在。
tags: [AIOS, Agent System, Workflow, Lab]
category: AIOS Newsroom
draft: false
comment: true
---

> 项目展示页位于 [AIOS Newsroom](/lab/aios-newsroom/)，负责展示当前在线运行状态；本文用于整理系统目标、结构与设计思路。

## 1. 这个项目现在是什么

它已经不再只是最初那种“比赛里为了跑通效果而写出来的一串多智能体脚本”了。

现在这套系统更接近下面这个组合：

- `AIOS kernel`：服务器上的 runtime
- `news workflow app`：新闻业务主线
- `storage + workflow memory`：逐步 AIOS 化的运行 substrate
- `agent registry`：动态注册和运行新 agent 的 control plane
- `dashboard + report product`：面向前端展示的产品层入口

所以它的重点不再只是“能不能生成一份新闻报”，而是：

- 能不能作为一个真正运行中的 agent system 存在
- 能不能保留状态、指标、产物和动态扩展能力
- 能不能被挂进自己的博客里，成为一个可展示的长期项目

## 2. 为什么要把它挂到 Lab，而不是只写文章

`Study` 更适合讲清楚知识、路线和原理。

但像 AIOS 这种项目，如果只写文章会有一个天然损失：别人只能看到你“会讲”，却看不到你“真的把系统搭起来了”。

因此 `Lab` 在这个项目中承担的是系统展示职责：

- 把系统真正挂到线上
- 展示当前 latest run、report、dashboard 和 agent registry
- 让项目本身成为一张可以点开的系统名片

也就是说，`Study` 是知识地图，`Lab` 是系统展厅。

## 3. 为什么这个项目必须保留 AIOS

如果只是为了做一份日报产品，不一定非得上 AIOS。

用更传统的方式，也可以很快做出：

- 定时任务
- FastAPI 服务
- 检索与生成链路
- HTML 日报页面

但这不是我保留这个项目的初衷。

我真正想做的是：

- 在服务器上常驻运行 `AIOS kernel`
- 让新闻系统只是第一个 first-party app
- 后面可以继续注册新的 agent，继续扩展 runtime 和 ecosystem

这样这个项目讲的就不是“我做了一个日报脚本”，而是：

> 我把一个比赛型多智能体系统，逐步重构成了运行在 AIOS kernel 上的 agent ecosystem。

## 4. 现在这套系统的工作方式

目前主工作流是：

`hot_api -> sort -> search -> generate -> review -> report`

但它现在已经不只是这条线本身。

系统外层还会同时保留：

- `run`
- `state`
- `metrics`
- `snapshot`
- `report html/json/txt`
- `dynamic agents`

所以当前项目真正重要的部分是两层：

1. 业务层的新闻 workflow
2. 系统层的 runtime / control plane / observability

## 5. 这个目录当前记录什么

这个目录不会写成普通“项目周记”，而会按更清晰的几类文章持续归档：

### A. 总览与结构文

适合放：

- 项目目标
- 架构图
- 目录说明
- 服务分层

### B. 设计与取舍文

适合放：

- 为什么保留 AIOS
- 为什么不走纯 API workflow
- 为什么需要 storage / memory / control plane

### C. 构建与部署文

适合放：

- 服务怎么部署
- 博客怎么接进来
- 同域展示怎么做
- 前端如何读取 runtime 状态

### D. 失败复盘与质量优化文

适合放：

- 为什么这轮新闻质量不够好
- 哪些 hallucination 被拦掉了
- workflow memory 实际有没有起作用

## 6. 项目页与项目文章如何配合

这个目录不是给项目“附带几篇文章”，而是和展示页共同组成项目本身的一部分：

- 项目页负责展示在线系统
- 目录文章负责解释系统为什么会长成这样
- 两者互相引用，而不是割裂

因此它的阅读路径也很明确：

1. 先在 `/lab/aios-newsroom/` 看当前在线系统长什么样
2. 再从这个目录往下读设计、流程、部署和复盘文章

这会比单独做一个“项目介绍页”更有生命力。

## 7. 后续将持续补充的方向

后续会持续补充的几类文章包括：

1. `AIOS Newsroom 架构图：kernel、workflow、storage、memory 与 agent registry`
2. `为什么这个项目不能退化成纯 API 工作流`
3. `从比赛工程到可运行系统：这次重构到底改了什么`
4. `把 AIOS 项目挂进博客 Lab：前端展示页怎么设计`

随着这些文章逐步补齐，`Lab` 会同时具备“系统展示”和“项目解释”两层结构。
