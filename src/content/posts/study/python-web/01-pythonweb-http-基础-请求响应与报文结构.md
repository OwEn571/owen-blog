---
title: HTTP 基础：请求-响应模型、报文结构与状态码
published: 2026-05-13
description: 在写任何 Web 框架之前，先理解 HTTP 本身：请求-响应模型、报文结构、方法语义、状态码分类和常见 Header。这是 Python Web 和 Java Web 共同的地基。
tags: [PythonWeb, HTTP, Backend, 基础]
category: PythonWeb
weight: 1
draft: false
comment: true
---

框架会变，HTTP 不会。不管你用的是 FastAPI、Flask、Spring Boot 还是 Express，底层都是同一个协议在跑。这一篇把 HTTP 的核心概念收在一起，作为整个 Python Web 系列的地基。

> **Java Web 对比**：Java 生态里，Servlet 规范（`HttpServletRequest` / `HttpServletResponse`）就是对 HTTP 报文的对象级封装。FastAPI 的 `Request` 对象本质上在干同一件事——把原始 HTTP 报文解析成程序可操作的结构。理解 HTTP 本身之后，两边框架的 API 差异就只是语法糖。

## 1. HTTP 是什么

HTTP（HyperText Transfer Protocol）是 Web 的通信协议。它的工作模型极其简单：

```
客户端                          服务端
  |                               |
  |──── 请求 (Request) ──────────→|
  |                               |  (处理)
  |←─── 响应 (Response) ──────────|
  |                               |
```

一次交互就是一个请求-响应对。服务端不会主动给客户端推消息（HTTP/1.1 如此，HTTP/2 有 Server Push 但已被废弃）。

## 2. 请求报文的结构

一个 HTTP 请求由四部分组成：

```http
POST /api/items HTTP/1.1           ← 请求行：方法 + 路径 + 协议版本
Host: example.com                  ← 请求头：键值对元信息
Content-Type: application/json
Authorization: Bearer xxx

{"name": "Foo", "price": 42.0}     ← 请求体：数据（GET 请求通常没有）
```

**请求行**三个要素：

| 部分 | 示例 | 含义 |
|------|------|------|
| 方法 | `POST` | 要对资源做什么 |
| 路径 | `/api/items` | 操作哪个资源 |
| 协议版本 | `HTTP/1.1` | 用哪版协议 |

> **Java Web 对比**：Spring Boot 的 `@PostMapping("/api/items")` 本质上就是在声明"当收到 `POST /api/items` 时调用这个方法"。FastAPI 的 `@app.post("/api/items")` 同理。

## 3. HTTP 方法的语义

| 方法 | 语义 | 安全 | 幂等 | 典型场景 |
|------|------|------|------|---------|
| `GET` | 获取资源 | ✓ | ✓ | 查询、读取 |
| `POST` | 创建资源 | ✗ | ✗ | 新增、提交 |
| `PUT` | 整体替换 | ✗ | ✓ | 全量更新 |
| `PATCH` | 部分修改 | ✗ | ✗ | 局部更新 |
| `DELETE` | 删除资源 | ✗ | ✓ | 删除 |

**安全**：不改变服务端状态。**幂等**：执行一次和执行多次效果相同。

这些语义不是你"守规矩"的问题——浏览器、CDN、搜索引擎爬虫都会根据方法做出不同行为。比如 `GET` 请求可以被 CDN 缓存，`POST` 不会。

## 4. 状态码：服务端的"一句话回复"

状态码不只是一个数字，它是服务端对请求结果的语义表达。

| 范围 | 类别 | 最常见 |
|------|------|--------|
| 1xx | 信息 | `101` 协议切换（WebSocket） |
| 2xx | 成功 | `200 OK`、`201 Created`、`204 No Content` |
| 3xx | 重定向 | `301` 永久、`302` 临时、`304` 未修改 |
| 4xx | 客户端错误 | `400 Bad Request`、`401 Unauthorized`、`403 Forbidden`、`404 Not Found`、`422 Unprocessable` |
| 5xx | 服务端错误 | `500 Internal Server Error`、`502 Bad Gateway`、`503 Service Unavailable` |

**设计中最重要的抉择**：`401` vs `403`——`401` 是"你没给我凭证"，`403` 是"我知道你是谁但你没权限"。`404` vs `422`——`404` 是"资源不存在"，`422` 是"资源存在但你给的数据不对"。

> **Java Web 对比**：Spring 用 `@ResponseStatus(HttpStatus.CREATED)` 注解，FastAPI 用 `status_code=201` 参数。语义完全一样，语法不同。

## 5. 常见请求头和响应头

请求头（客户端→服务端）：

| Header | 作用 |
|--------|------|
| `Host` | 目标主机（HTTP/1.1 必须） |
| `Content-Type` | 请求体的格式，如 `application/json` |
| `Authorization` | 认证凭证 |
| `Accept` | 客户端能接收的响应格式 |
| `User-Agent` | 客户端标识 |
| `Cookie` | 携带会话信息 |

响应头（服务端→客户端）：

| Header | 作用 |
|--------|------|
| `Content-Type` | 响应体的格式 |
| `Content-Length` | 响应体字节数 |
| `Set-Cookie` | 让浏览器存 Cookie |
| `Cache-Control` | 缓存策略 |
| `Location` | 重定向目标（配合 3xx） |
| `Access-Control-Allow-Origin` | CORS 白名单 |

## 6. 内容协商：`Content-Type` 和 `Accept`

一次请求里，`Content-Type` 是"我发给你的是什么格式"，`Accept` 是"我希望你回给我什么格式"。

常见的 `Content-Type`：

| 值 | 场景 |
|----|------|
| `application/json` | REST API（最常见） |
| `application/x-www-form-urlencoded` | 普通表单提交 |
| `multipart/form-data` | 含文件上传的表单 |
| `text/html` | HTML 页面 |
| `text/plain` | 纯文本 |

FastAPI 不需要你手动解析 `Content-Type`——它根据类型注解和 `Form()`/`Body()`/`File()` 自动处理。但理解这一层之后，你会明白为什么"上传文件一定要用 `multipart/form-data`"——因为 JSON 无法内嵌二进制数据，必须用 multipart 的 boundary 机制分段传输。

## 7. 一次完整请求发生了什么

以 `POST /api/items` 为例：

```
1. 浏览器构建 HTTP 请求报文（方法、路径、Header、Body）
2. DNS 解析域名 → IP
3. TCP 三次握手
4. TLS 握手（HTTPS）
5. 发送 HTTP 请求报文
6. 服务端接收 → Web Server（Caddy/Nginx）→ ASGI Server（Uvicorn）→ FastAPI
7. FastAPI 解析报文 → 路由匹配 → 校验 → 执行 handler
8. 构建 HTTP 响应报文 → 原路返回
9. 浏览器接收 → 解析 → 渲染
```

后面我们在 ASGI 协议篇会详细展开第 6-7 步在 Python 里的具体实现。

## 8. 这一篇在整个 Python Web 体系里的位置

```
HTTP 协议（本篇） ← 所有 Web 框架的共同地基
  │
  ├── Python：FastAPI / Flask / Django
  └── Java：Spring Boot / Servlet
```

理解 HTTP 本身之后，框架的 API 不再是"要背的咒语"，而是"协议语义的自然映射"。
