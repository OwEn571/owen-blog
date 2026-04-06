---
title: Docker 学习路线图：镜像到 Compose 的一条主线
published: 2026-04-06
description: 先把“镜像 -> 容器 -> 数据卷 -> 网络 -> Dockerfile -> Compose”的主线打通，再补细节命令。
tags: [Docker, 学习路线, DevOps]
category: Docker
draft: false
pinned: true
priority: 1
comment: false
---

Docker 的命令很多，但理解它其实只需要一条主线：

`镜像 -> 容器 -> 数据卷 -> 网络 -> Dockerfile -> Compose`

这套顺序能解释 80% 的 Docker 使用场景。后续不管是部署、迁移、或者改造容器化流程，都可以沿着这条主线倒推回去。

目前已经整理了第一篇完整入门笔记，后面会继续补更细的实战与排错。
