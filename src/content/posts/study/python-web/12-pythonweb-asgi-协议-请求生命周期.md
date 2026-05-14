---
title: ASGI 协议与请求生命周期：从网络包到路由函数的完整旅程
published: 2026-05-13
description: 追一条 HTTP 请求在 Python Web 栈里的完整旅行：socket → HTTP 解析 → ASGI 三要素 (scope/receive/send) → Starlette 路由匹配 → 装饰器 handler → 响应返回。FastAPI 那条 `@app.post` 装饰器到底做了什么，这篇文章讲清楚。
tags: [PythonWeb, ASGI, Starlette, Uvicorn, 面试]
category: PythonWeb
weight: 12
draft: false
comment: true
---

你的面经里有一个问题直接熄火了：**"FastAPI 的 `@app.post` 为什么能处理请求？如果让你自己实现一个类似的框架，怎么设计？"**

这个问题不是在考 FastAPI 语法，而是在考你**是否理解 Python Web 框架的底层机制**。这一篇把整条链路拆开。

> **Java Web 对比**：Java 的 Servlet 容器（Tomcat）启动时会加载 `web.xml` 或扫描 `@WebServlet` 注解，建立 URL→Servlet 映射表。请求来了，Tomcat 把 `HttpServletRequest` 和 `HttpServletResponse` 传给对应的 Servlet。Python 这边，Uvicorn 扮演 Tomcat 的角色，ASGI 协议扮演 Servlet 规范的角色，Starlette/FastAPI 的 Router 扮演 `web.xml` 路由表。整条链路是对称的。

## 1. 请求进门前：Uvicorn 做了什么

真正的请求入口不是 `@app.get("/")` —— 在这之前，还有一个 ASGI 服务器在接客。

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Uvicorn 启动后做了三件事：

```
1. 在 0.0.0.0:8000 上监听 TCP socket
2. 用 uvloop（libuv 的 Python 绑定）跑事件循环
3. 从 app.main 模块导入 app 对象（`app = FastAPI()`）
```

当一个 HTTP 请求到达时：

```
网络包 → socket 接收 → HTTP/1.1 协议解析（httptools）
→ 把原始报文变成三个 Python 对象：scope, receive, send
→ 传给 app(scope, receive, send)
```

这三个对象就是 **ASGI 协议的核心**。

## 2. ASGI 三要素：scope, receive, send

ASGI 不是框架，不是服务器，而是一份**接口规范**。它规定了一个 Python 应用必须是一个可调用对象，签名为：

```python
async def application(scope, receive, send):
    ...
```

三个参数的含义：

| 参数 | 类型 | 内容 | 类比 Java |
|------|------|------|-----------|
| `scope` | `dict` | 请求的元信息：method、path、headers、query_string、server 等 | `HttpServletRequest` 的所有 getter |
| `receive` | `async callable` | **服务器提供的异步函数**。应用调用 `await receive()` 来读取客户端发来的请求体。每次调用返回一个数据块：`{"type": "http.request", "body": b"...", "more_body": bool}`。`more_body=True` 表示后面还有数据，应用需要继续调 `receive()` 直到 `more_body=False` | `request.getInputStream()` |
| `send` | `async callable` | **服务器提供的异步函数**。应用调用 `await send({...})` 把响应发回客户端。先发 `http.response.start`（状态码+响应头），再发 `http.response.body`（响应体），可以分多次发送 | `HttpServletResponse` 的所有 setter |

**关键理解：`receive` 和 `send` 都是服务器（Uvicorn）提供的，不是应用自己实现的。**

Uvicorn 在调用你的 `app(scope, receive, send)` 之前，已经把这两个函数创建好了：

```
Uvicorn 内部（简化）:

1. 从 TCP socket 读到 HTTP 请求行和请求头 → 填好 scope dict
2. 创建 receive 函数 → 这个函数内部从 socket 的缓冲区读 body 数据
3. 创建 send 函数 → 这个函数内部往 socket 写响应数据
4. 调用 app(scope, receive, send)
```

所以 `receive` 的"主语"是**应用**调用它来收数据，但"实现方"是**服务器**——是 Uvicorn 定义了 `receive` 的逻辑（从 socket 读），然后把函数引用传给你的应用。这就是为什么 ASGI 规范里说 `receive` 是一个 "callable provided by the server"：

```python
# 从应用视角看：
async def app(scope, receive, send):
    # receive 是服务器给我的"快递取件函数"
    # 我每次调用它，它就去 socket 那边取下一块数据

    body_chunk = await receive()  # ← 应用主动调用，服务器被动响应
    # 返回: {"type": "http.request", "body": b"{\"name\":", "more_body": True}

    body_chunk = await receive()  # ← 再取下一块
    # 返回: {"type": "http.request", "body": b"\"Foo\"}", "more_body": False}
    #                                                         ↑
    #                                         服务器告诉我"没了，不用再调了"
```

**为什么设计成应用主动调用 `receive()`，而不是服务器直接把完整 body 放在 scope 里？**

三个原因：

1. **大请求体**：如果客户端上传一个 500MB 的文件，把整个 body 放进 scope dict 意味着服务器要先把 500MB 全部读到内存才能调用应用。用 `receive()` 分块读取，应用可以边收边处理（比如边读边写磁盘）。

2. **流式上传**：客户端可能还在发送数据，服务器不可能"预知"完整的 body。`receive()` 是异步的——数据到了就返回，没到就等待——应用不需要阻塞等整个 body 收完。

3. **WebSocket**：WebSocket 连接是持久的、双向的。连接建立后，客户端随时可能发消息过来。`receive()` 就是"等下一个消息"的接口——每次调用阻塞直到有消息到达。如果用 scope 传一次性数据，WebSocket 根本没法表达。

> **Java 对比**：Java Servlet 的 `HttpServletRequest.getInputStream()` 返回一个 `ServletInputStream`，调用者 `.read()` 来分块读取——本质上也是应用主动读取。区别是 Servlet 的 `read()` 是阻塞的（同步），ASGI 的 `receive()` 是 `await` 的（异步）。

## 3. 一个最简 ASGI 应用（不用任何框架）

你可以不用 FastAPI，用 20 行代码写一个完整的 Web 应用：

```python
# raw_asgi.py — 不依赖任何框架的 Web 应用
async def app(scope, receive, send):
    # 只处理 HTTP 请求，忽略 WebSocket
    if scope["type"] != "http":
        return

    path = scope["path"]
    method = scope["method"]

    if method == "GET" and path == "/":
        # 发送响应头
        await send({
            "type": "http.response.start",
            "status": 200,
            "headers": [(b"content-type", b"application/json")],
        })
        # 发送响应体
        await send({
            "type": "http.response.body",
            "body": b'{"message": "Hello World"}',
        })
    else:
        await send({
            "type": "http.response.start",
            "status": 404,
            "headers": [(b"content-type", b"text/plain")],
        })
        await send({
            "type": "http.response.body",
            "body": b"Not Found",
        )
```

用 Uvicorn 跑起来：

```bash
uvicorn raw_asgi:app
```

这就是 FastAPI 的底层。FastAPI 只是在这个基础上加了路由表、Pydantic 校验、依赖注入、自动文档。

## 4. 路由是怎么注册的：`@app.get("/")` 的真相

`app = FastAPI()` 创建了一个应用对象。它的核心是一个**路由表**——本质上是一个 Python 字典：

```python
# FastAPI/Starlette 内部简化版
routes = []  # 路由列表

def get(path):
    def decorator(func):
        routes.append(("GET", path, func))
        return func
    return decorator
```

当你写：

```python
@app.get("/items/{item_id}")
async def read_item(item_id: int):
    return {"item_id": item_id}
```

装饰器 `@app.get("/items/{item_id}")` 实际做的事：

1. 创建一个 `APIRoute` 对象，包含：路径 `/items/{item_id}`、HTTP 方法 `GET`、handler 函数 `read_item`
2. 把这个 route 对象注册到 `app.router.routes` 列表里
3. 同时解析 `item_id: int` 类型注解 → 存为路径参数的 Pydantic 校验器

> **Java Web 对比**：这一步等价于 Spring 扫描 `@GetMapping("/items/{itemId}")` 注解 → 往 `RequestMappingHandlerMapping` 注册一个映射。FastAPI 的路由表存在 `app.router.routes`（内存 list），Spring 存在 `HandlerMapping`（内存 map）。数据结构不同，职责一样。

## 5. 请求来了怎么匹配：Starlette Router

当 scope 被传入 `FastAPI.__call__(scope, receive, send)` 后：

```
FastAPI.__call__(scope, receive, send)
  │
  └→ Starlette Router.__call__(scope, receive, send)
       │
       ├─ 从 scope 取出 method 和 path
       ├─ 遍历 self.routes，找匹配的 APIRoute
       │   (路径参数在这里被正则匹配并提取)
       │
       ├─ 找到了 → route.handle(scope, receive, send)
       │           → Pydantic 校验路径参数、查询参数、请求体
       │           → 解析依赖注入链
       │           → 调用你的 handler 函数
       │           → 序列化返回值 → send 出去
       │
       └─ 没找到 → 404
```

Starlette 的 `Router` 是路由匹配的核心。它内部把每个路径模式（如 `/items/{item_id}`）编译成正则表达式，请求来了就逐个匹配。**路径声明顺序就是匹配优先级**——所以 `/users/me` 必须写在 `/users/{user_id}` 前面。

## 6. 如果让你自己实现一个框架，三步搞定

面试官问"自己怎么做一个 FastAPI"，其实是在问三个核心能力：

**第一步：装饰器注册路由表**

```python
class MiniWeb:
    def __init__(self):
        self.routes = []

    def get(self, path):
        def decorator(func):
            self.routes.append(("GET", path, func))
            return func
        return decorator

    async def __call__(self, scope, receive, send):
        method = scope["method"]
        path = scope["path"]
        for route_method, route_path, handler in self.routes:
            if route_method == method and route_path == path:
                # 找到了，调用 handler
                result = handler()  # 简化：忽略参数解析
                body = json.dumps(result).encode()
                await send({"type": "http.response.start", "status": 200, ...})
                await send({"type": "http.response.body", "body": body})
                return
        # 没找到 → 404
        ...
```

**第二步：ASGI 兼容**——让 `MiniWeb()` 实例能作为 `app` 传给 `uvicorn mini_web:app`。只要实现了 `__call__(self, scope, receive, send)`，Uvicorn 就能跑。

**第三步：路径参数提取**——把 `/items/{item_id}` 编译成正则 `/items/(?P<item_id>[^/]+)`，匹配时提取 `item_id` 的值，根据函数签名里的类型注解做转换。

这就是一个最小 Web 框架的骨架。

## 7. 完整请求生命周期图

```
┌─────────────────────────────────────────────────┐
│ 网络层                                            │
├─────────────────────────────────────────────────┤
│ 1. TCP 包到达 socket                             │
│ 2. Uvicorn (uvloop) 接收                         │
│ 3. httptools 解析 HTTP → scope dict              │
├─────────────────────────────────────────────────┤
│ ASGI 协议层                                       │
├─────────────────────────────────────────────────┤
│ 4. scope = {                                     │
│      "type": "http",                             │
│      "method": "GET",                            │
│      "path": "/items/42",                        │
│      "headers": [(b"authorization", b"...")],    │
│      "query_string": b"q=test",                  │
│    }                                             │
│ 5. receive() → {"type": "http.request",          │
│                  "body": b'{"name":"Foo"}'}      │
├─────────────────────────────────────────────────┤
│ Starlette / FastAPI 层                            │
├─────────────────────────────────────────────────┤
│ 6. Router 匹配: GET /items/42 → read_item()      │
│ 7. 路径参数提取: item_id = 42 (Pydantic 校验)     │
│ 8. 依赖注入链: Depends(get_db) → db session       │
│ 9. 中间件洋葱层: CORS → Auth → 计时 → handler     │
│ 10. handler 执行 → 返回 {"item_id": 42, ...}     │
│ 11. response_model 过滤                          │
│ 12. jsonable_encoder 序列化                      │
├─────────────────────────────────────────────────┤
│ ASGI 协议层                                       │
├─────────────────────────────────────────────────┤
│ 13. send({"type": "http.response.start", 200})   │
│ 14. send({"type": "http.response.body", body})   │
├─────────────────────────────────────────────────┤
│ 网络层                                            │
├─────────────────────────────────────────────────┤
│ 15. Uvicorn 把响应写回 socket                     │
│ 16. TCP 包 → 客户端                               │
└─────────────────────────────────────────────────┘
```

这张图值得记。面试时被问"请求怎么进来的"，从第 1 步讲到第 16 步，没人会觉得你不懂 Web。
