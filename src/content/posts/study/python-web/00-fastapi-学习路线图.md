---
title: Python Web 学习路线：从 HTTP 请求到生产部署
published: 2026-04-03
description: 把 Python Web 的核心知识重新排成一条主线：协议层 → 框架层 → 工程化 → 部署，FastAPI 作为框架层的主线贯穿，但每一站背后是 Web 通用原理。
tags: [PythonWeb, FastAPI, 学习路线, Backend]
category: PythonWeb
draft: false
pinned: true
priority: 1
comment: false
---

本专题以 FastAPI 为主线框架来讲 Python Web 后端开发。不是只学 FastAPI 的 API——而是把它当作一条线索，把 Web 通用知识串起来。文中在适当位置加入了 **Java Web 对比**（Spring Boot / Servlet），因为大多数后端团队仍以 Java 为主，用对比建立跨语言的理解，面试时也能展示更广的技术视野。

## 学习路径（15 篇，按请求流排）

### 第一部分：Web 通用地基

| # | 笔记 | 学什么 | 为什么先学 |
|---|---|---|---|
| 1 | **HTTP 基础** | 请求-响应模型、报文结构、方法语义、状态码、常见 Header | 框架会变，HTTP 不变。先搞懂协议本身，再用 FastAPI 只是语法不同 |
| 2 | **应用入口** | `app = FastAPI()`、`fastapi dev`、`uvicorn`、`entrypoint` | 把一个最小应用跑起来，理解 ASGI 服务器和框架的关系 |
| 3 | **路径参数与查询参数** | URL 输入的两类参数：`{item_id}` vs `?q=xxx` | 请求进来，第一步是"资源定位" |
| 4 | **请求体与 Pydantic** | JSON body、Pydantic 模型、嵌套结构 | 当输入不只是一两个 URL 参数，而是整个数据结构 |

### 第二部分：输入校验层

| # | 笔记 | 学什么 |
|---|---|---|
| 5 | **参数校验** | `Query/Path/Body/Cookie/Header` 统一心智模型、`AfterValidator` |
| 6 | **响应层** | `response_model`、状态码语义、输出过滤、`PUT/PATCH` |
| 7 | **表单与文件上传** | `Form`、`UploadFile`、`multipart/form-data`、请求编码切换 |

### 第三部分：工程化结构

| # | 笔记 | 学什么 |
|---|---|---|
| 8 | **依赖注入** | `Depends`、`yield` 资源管理、`HTTPException`、OAuth2 起步 |
| 9 | **模块化** | `APIRouter`、多文件组织、`lifespan` 应用生命周期 |
| 10 | **中间件与 CORS** | 中间件洋葱模型、CORS 跨域、`BackgroundTasks` |
| 11 | **测试与 CLI 部署** | `TestClient`、`pytest`、`uvicorn`、`--workers` |

### 第四部分：协议与部署深水区

| # | 笔记 | 学什么 | 面试价值 |
|---|---|---|---|
| 12 | **ASGI 协议** | `scope/receive/send` 三要素、Starlette 路由匹配、`@app.get` 装饰器原理 | ★★★ Q23 "FastAPI 底层" |
| 13 | **WSGI → ASGI 演进** | 同步到异步的架构升级、`async def` 的真正含义 | ★★★ "为什么用 FastAPI" |
| 14 | **部署链路** | systemd + Uvicorn + Caddy，你项目真实的部署拓扑 | ★★ 工程化经验 |
| 15 | **Docker Compose 实战** | 多服务编排、healthcheck、数据卷、启动顺序，用你的 compose.yml 讲 | ★★ DevOps 能力 |

这 15 篇串起来就是：**HTTP 协议 → 框架输入输出 → 工程化组织 → 协议底层 → 生产部署**，一条完整的 Python Web 后端能力线。
