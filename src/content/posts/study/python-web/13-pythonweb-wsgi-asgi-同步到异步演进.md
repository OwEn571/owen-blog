---
title: WSGI → ASGI：Python Web 从同步到异步的演进
published: 2026-05-13
description: 为什么 Python Web 生态要从 WSGI 走向 ASGI？同步模型的瓶颈在哪里，async/await 解决了什么，以及这跟 Java Servlet 3.1 异步化有什么相似之处。
tags: [PythonWeb, ASGI, WSGI, Async, 架构]
category: PythonWeb
weight: 13
draft: false
comment: true
---

你用 FastAPI 写 `async def` 时可能觉得理所当然——但 Python Web 不是一开始就支持异步的。从 WSGI 到 ASGI 的演进，背后是一整套并发模型的升级。

> **Java Web 对比**：Java 经历了类似的演进——Servlet 2.5（同步，一个请求一个线程）→ Servlet 3.0（异步，`AsyncContext`）→ Servlet 3.1（非阻塞 I/O）→ Spring WebFlux（响应式，类似 ASGI 的异步事件循环）。Python 的 WSGI→ASGI 就是在走 Java 走过的同一条路。

## 1. WSGI：同步时代的地基

WSGI（Web Server Gateway Interface）是 Python Web 的第一个标准接口，诞生于 2003 年（PEP 333）。它规定了：

```python
def application(environ, start_response):
    # environ: dict，包含请求的所有信息
    # start_response: 回调函数，用来发送状态码和响应头
    # 返回值: 响应体的迭代器

    status = "200 OK"
    headers = [("Content-Type", "text/plain")]
    start_response(status, headers)
    return [b"Hello World"]
```

**WSGI 的致命局限：一切都是同步的。**

- `environ` 是完整的 dict ——请求体必须全部读完才能传给应用
- `return [b"..."]` ——响应体必须全部生成才能返回
- 没有 `await`，没有事件循环，没有异步 I/O
- 一个请求占用一个线程（或进程），1000 个并发 = 1000 个线程

> **Java Web 对比**：WSGI 的 `environ` dict 就是 Java 的 `HttpServletRequest` 对象，`start_response` 回调就是 `HttpServletResponse`。同步模型下，WSGI 相当于 Servlet 2.5 时代——每个请求吃一个线程。

## 2. 同步模型的瓶颈在哪里

假设你的接口要做三件事：

```python
def handler(request):
    user = db.query("SELECT * FROM users WHERE id = ?", uid)   # 10ms
    result = external_api.call(user)                            # 50ms
    log = file.write(result)                                    # 5ms
    return result
```

同步模型下，这 65ms 里线程全程占着，即使大部分时间在等 I/O。1000 个并发 → 1000 个线程 → 每个线程 8MB 栈 → 8GB 内存。

异步模型的思路：等 I/O 的时候把线程让出去干别的。

```
同步: [=====CPU=====][==========等DB==========][=CPU=][=======等API=======][=CPU=]
                         线程占着不放

异步: [=====CPU=====] 让出 → 去处理别的请求 → DB 回来了 → [=CPU=] 让出 → API 回来了 → [=CPU=]
```

这就是 Python `async/await` 做的事：在等 I/O 的间隙去处理别的请求，**用更少的线程服务更多的并发**。

### 2.1 协程（coroutine）到底是什么

上面说的"暂停、让出、恢复"，在 Python 里的实现就叫**协程**。理解协程最好的方式，是从最普通的函数开始对比：

**普通函数（子例程）**：

```python
def add(a, b):
    return a + b

result = add(1, 2)   # 调用 → 执行 → 返回。函数一旦开始，必须跑完才能交还控制权。
```

普通函数的控制流是**单向的**：调用者 → 函数 → 返回。函数在执行期间不可能暂停，也不可能把控制权暂时还给调用者。

**生成器 — 协程的前身**：

```python
def count():
    yield 1
    yield 2
    yield 3

g = count()
next(g)  # → 1，函数暂停在第一个 yield
next(g)  # → 2，函数从上次暂停处恢复，执行到第二个 yield 再暂停
```

`yield` 做到了普通函数做不到的事：**暂停 + 恢复**。调用 `next()` → 函数执行到 `yield` → 暂停，返回一个值 → 再 `next()` → 从上次暂停处继续。这种"可以暂停的函数"就是协程的雏形。

**async/await — 真正的协程**：

```python
async def fetch_data(url):
    print(f"开始请求 {url}")
    response = await http_get(url)   # ← 在这里暂停，把控制权还给事件循环
    print(f"{url} 返回了 {len(response)} 字节")
    return response
```

`async def` 声明的函数返回一个**协程对象**。调用 `fetch_data("...")` **不会执行函数体**——它只创建了一个"待执行的配方"：

```python
coro = fetch_data("https://example.com")   # 什么都没发生，只是创建了协程对象
# 要让协程真正运行，需要事件循环来调度它
```

`await` 是协程的"暂停点"。当执行到 `await http_get(url)` 时：
1. 协程暂停
2. 控制权还给事件循环
3. 事件循环去处理别的协程（比如另一个请求的 `fetch_data`）
4. `http_get` 完成后，事件循环把结果送回这个协程
5. 协程从 `await` 处恢复，继续执行

**一句话**：协程就是一个**可以在等结果时主动让出控制权、之后能被恢复继续执行的函数**。它不是线程——没有抢占、没有锁、没有上下文切换开销。10000 个协程可以跑在一个线程里，靠事件循环来回调度。

> **Java 对比**：Java 的协程（Virtual Threads，JDK 21+ 正式发布）更晚才落地。在 Virtual Threads 之前，Java 靠线程池 + `CompletableFuture` 来做异步——本质是多线程，每个线程有独立栈。Python 的协程从 Python 3.5（2015）就是一等公民，走的事件循环 + async/await 路线，是单线程内调度。Go 的 goroutine 更接近 Java 的 Virtual Threads——用户态调度、可抢占、多核并行。

### 2.2 事件循环（Event Loop）的角色

协程不能自己运行——需要一个**调度器**来管理所有的协程，决定"谁该执行、谁该等待"。这个调度器就是事件循环。

```python
import asyncio

async def main():
    # 同时发起两个 HTTP 请求
    task1 = asyncio.create_task(fetch_data("https://api1.example.com"))
    task2 = asyncio.create_task(fetch_data("https://api2.example.com"))
    # 两个协程交替执行——哪个的 I/O 先完成，哪个先恢复
    result1 = await task1
    result2 = await task2
    return result1, result2

asyncio.run(main())  # 创建事件循环，调度 main() 协程
```

事件循环的工作方式：

```
事件循环的队列: [fetch_data("api1"), fetch_data("api2")]

  1. 取 fetch_data("api1") → 执行到 await http_get → 暂停，api1 的 I/O 发出
  2. 取 fetch_data("api2") → 执行到 await http_get → 暂停，api2 的 I/O 发出
  3. 队列空了，事件循环在后台等 I/O 事件
  4. api1 的响应回来了 → 把 fetch_data("api1") 放回队列
  5. 取 fetch_data("api1") → 从 await 处恢复，继续执行 → 完成
  6. api2 的响应回来了 → 把 fetch_data("api2") 放回队列
  7. 取 fetch_data("api2") → 恢复 → 完成
```

这就是单线程并发——**没有两个协程同时在跑，但每个协程都在等 I/O 时不浪费 CPU**。

### 2.2.1 事件循环怎么知道"该恢复了"？

你代码里写 `await http_get(url)` 时，底层发生的事情：

```python
# 你写的代码
async def fetch_data(url):
    response = await http_get(url)    # ← 在这里挂起
```

`http_get(url)` 底层会创建一个 TCP socket 连接到目标服务器，然后调用操作系统的 `send()` 发出 HTTP 请求。之后，这个 socket 就进入"等待响应"状态。

**关键机制：事件循环不是轮询，是靠操作系统的 I/O 多路复用（epoll/kqueue）。**

```python
# 事件循环内部的简化逻辑（伪代码）
class EventLoop:
    def __init__(self):
        self.ready_queue = []           # 准备执行的协程
        self.waiting = {}               # fd → 等待该 fd 的协程

    def run(self):
        while self.ready_queue or self.waiting:
            # 1. 执行所有就绪的协程，直到它们全部 await 暂停
            while self.ready_queue:
                coro = self.ready_queue.pop()
                coro.send(None)          # 恢复协程，它会执行到下一个 await
                # 如果协程在 await 处调用了 socket.recv()，底层会：
                #   注册这个 fd 到 epoll，说"这个 fd 可读时通知我"
                #   把协程放入 self.waiting[fd]

            # 2. 没有就绪协程了 → 调 OS 的 epoll，阻塞等待 I/O 事件
            if self.waiting:
                ready_fds = epoll.wait(timeout=None)  # ← 在这里阻塞，不占 CPU
                # epoll 返回所有"有数据可读"的 fd 列表

            # 3. 把等到了 I/O 的协程放回就绪队列
            for fd in ready_fds:
                coro = self.waiting.pop(fd)
                self.ready_queue.append(coro)         # 下一轮循环执行它

            # 回到步骤 1
```

**一句话版本**：

1. 协程 `await` 一个 I/O 操作时，事件循环把这个协程和对应的**文件描述符（fd）**绑定，记到等待表里
2. 所有协程都挂起后，事件循环调 `epoll.wait()`——**操作系统把线程挂起，CPU 完全释放**
3. 当网卡收到数据 → 内核中断 → TCP 栈处理 → 内核标记该 fd 为"可读" → `epoll.wait()` 返回这个 fd
4. 事件循环根据 fd 查到对应的协程 → 放回就绪队列 → 协程从 `await` 处恢复

**所以不是"事件循环不断轮询每个协程看数据到了没"——它在等操作系统通知**。10000 个协程都在等 I/O 时，事件循环只调了一次 `epoll.wait()`，阻塞在那，CPU 利用率为 0%。这就是为什么单线程能撑几万并发——大部分时间它在等内核通知，不消耗 CPU。

**`asyncio.create_task` 和 `await` 的分工**：

```python
task1 = asyncio.create_task(fetch_data("https://api1.example.com"))
# ↑ 把协程包装成 Task，注册到事件循环的待执行队列
# 此时 fetch_data 还没开始跑——它只是被"排上日程"

result1 = await task1
# ↑ "我（当前协程）需要 task1 的结果。如果 task1 还没完成，把我挂起，
#    等 task1 完成后事件循环会唤醒我。"
```

`create_task` 是"让这个协程开始跑"，`await` 是"我需要这个值，没好的话我等着"。两者分开让你可以同时启动多个 task，让它们并发执行，再逐一等待结果。

> **类比**：事件循环是餐厅前台，协程是等菜的客人，fd 是桌号。客人坐下后告诉前台"我在 3 号桌，菜好了叫我"。前台不每隔 5 秒跑去问后厨"3 号桌的菜好了没"——他等后厨按铃（epoll 通知），然后去 3 号桌喊客人。

### 2.3 协程不是线程：关键区别

| | 线程 | 协程 |
|---|---|---|
| 调度者 | 操作系统（抢占式） | 事件循环（协作式） |
| 切换代价 | 高（保存/恢复寄存器、切换内核栈） | 低（只是 Python 函数调用） |
| 内存占用 | 每线程约 8MB 栈空间 | 每协程约几 KB |
| 并发量 | 几百到几千 | 几万到几十万 |
| 适合场景 | CPU 密集型 | I/O 密集型 |
| Python 里的问题 | GIL 限制多线程并行 | GIL 不影响，单线程内调度 |

**协作式 vs 抢占式**：线程会被操作系统随时暂停（抢占），你不需要在代码里显式说"我这里可以暂停"——但代价是要用锁保护共享数据。协程是协作式的——只在 `await` 处主动让出，你不用加锁（因为不会有两个协程同时访问同一个变量），但你要保证不在协程里写阻塞代码（会卡住整个事件循环）。

> **面试常见追问**："Python 的 async 能利用多核吗？" — 不能，因为它是单线程事件循环。如果需要多核并行，用 `multiprocessing` 或 `concurrent.futures.ProcessPoolExecutor` 在多个进程里各跑一个事件循环。但 Web 服务通常是 I/O 密集型，单核 + 协程已经够用。

## 3. ASGI：异步时代的接口

ASGI 把 WSGI 的单次"请求→响应"模型升级为可暂停、可恢复的异步协议。

```python
async def application(scope, receive, send):
    assert scope["type"] == "http"

    # 可以 await receive() 分块读取请求体
    body = b""
    more_body = True
    while more_body:
        msg = await receive()
        body += msg.get("body", b"")
        more_body = msg.get("more_body", False)

    # 可以在处理中途 await 数据库、API 等异步操作
    result = await async_db_query(...)

    # 可以分块发送响应
    await send({"type": "http.response.start", "status": 200, "headers": [...]})
    await send({"type": "http.response.body", "body": json.dumps(result).encode()})
```

**关键差异**：

| | WSGI | ASGI |
|---|---|---|
| 函数签名 | `def app(environ, start_response)` | `async def app(scope, receive, send)` |
| 读取请求体 | 一次性全部读入 `environ["wsgi.input"]` | `await receive()` 分块读取 |
| 发送响应 | `start_response` + `return [body]` | `await send(...)` 分块发送 |
| 并发模型 | 多线程/多进程 | 单线程事件循环 + async/await |
| WebSocket | 不支持 | 原生支持 |
| 代表框架 | Flask, Django 1.x | FastAPI, Starlette, Django 3+ |

## 4. FastAPI 的 `async def` 到底什么意思

```python
@app.get("/items")
async def read_items():
    items = await db.fetch_all("SELECT * FROM items")
    return items
```

`async def` 意味着：
- 这个函数返回一个协程（coroutine）
- Uvicorn 在事件循环里调度它
- 遇到 `await` 时，协程暂停，事件循环去处理别的请求
- 被等待的操作完成后，协程恢复执行

如果你写成普通 `def`：

```python
@app.get("/items")
def read_items():
    items = db.fetch_all_sync("SELECT * FROM items")  # 阻塞！
    return items
```

FastAPI 会把同步函数扔进线程池执行，避免阻塞事件循环。但这是兜底策略——能 async 就 async。

## 5. ASGI 支持 WebSocket 是因为协议本身就是双向的

WSGI 不支持 WebSocket 的根本原因：它的设计是"一个请求 → 一个响应"，单向的。

ASGI 的 scope/receive/send 模型天然支持双向持久连接——因为 `receive()` 和 `send()` 是独立的、可以反复调用的异步函数：

```python
# ASGI WebSocket 的 scope
scope = {
    "type": "websocket",
    "path": "/ws/chat",
    ...
}

# 通过 receive/send 实现双向通信
while True:
    msg = await receive()        # 等客户端发消息
    await send({"type": "websocket.send", "text": f"Echo: {msg['text']}"})
```

## 6. 这一篇在整个体系中的位置

```
HTTP 协议       ← 所有 Web 框架的共同地基
  │
WSGI (2003)     ← Python 同步 Web 的起点（Flask, Django）
  │                   Java: Servlet 2.5
  │
ASGI (2018)     ← Python 异步 Web 的新标准（FastAPI, Starlette）
  │                   Java: Servlet 3.1 / Spring WebFlux
  │
FastAPI         ← 基于 ASGI 的现代 Web 框架
```

理解这条演进路径后，`async def` 不再只是语法，而是整个 Python Web 并发模型升级的终点。
