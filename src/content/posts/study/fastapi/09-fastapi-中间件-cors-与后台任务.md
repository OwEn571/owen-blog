---
title: FastAPI 扩展层：中间件、CORS 与后台任务
published: 2026-03-25
description: 把路由之外那层请求包裹逻辑收起来：中间件、CORS 配置，以及请求结束后再执行的后台任务。
tags: [FastAPI, Middleware, CORS]
category: FastAPI
draft: false
comment: true
---

写到这里之后，FastAPI 里的“路由函数”已经不是唯一重点了。请求在进入路由前、离开路由后，还会经过另外一层东西。

## 1. 中间件的基本形状

```python3
import time
from fastapi import FastAPI, Request

app = FastAPI()


@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    start_time = time.perf_counter()
    response = await call_next(request)
    process_time = time.perf_counter() - start_time
    response.headers["X-Process-Time"] = str(process_time)
    return response
```

中间件可以直接理解成：

1. 请求先经过它
2. 它再把请求交给路由
3. 路由返回响应后，它还能继续处理响应

所以它特别适合做：

- 请求耗时统计
- 日志
- 统一响应头
- 跨域

官方中间件页还特地提到，测耗时更适合用 `time.perf_counter()` 而不是 `time.time()`。  
来源：Middleware 官方页 <https://fastapi.tiangolo.com/zh/tutorial/middleware/>

## 2. 多个中间件的顺序

如果有多个中间件，最后添加的会在最外层。

```python
app.add_middleware(MiddlewareA)
app.add_middleware(MiddlewareB)
```

请求流会是：

- 请求：`MiddlewareB -> MiddlewareA -> 路由`
- 响应：`路由 -> MiddlewareA -> MiddlewareB`

这一点一开始不容易直觉化，但把它想成洋葱模型就清楚了：后加的包在外面。

## 3. CORS 不是 FastAPI 特性，而是浏览器跨域规则

很多人第一次碰 CORS 时，会觉得这是框架自带的怪东西。其实本质上它是浏览器的跨域限制，FastAPI 只是提供了一个标准中间件来处理。

```python3
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

origins = [
    "http://localhost.tiangolo.com",
    "https://localhost.tiangolo.com",
    "http://localhost",
    "http://localhost:8080",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

官方文档里有一个特别值得记的细节：

- 如果 `allow_credentials=True`
- 那么 `allow_origins`、`allow_methods`、`allow_headers` 不能都写成 `["*"]`

它们必须显式指定。  
来源：CORS 官方页 <https://fastapi.tiangolo.com/zh/tutorial/cors/>

## 4. CORS 参数真正值得理解的几个

最常用的就是这些：

- `allow_origins`
- `allow_origin_regex`
- `allow_methods`
- `allow_headers`
- `allow_credentials`
- `expose_headers`
- `max_age`

第一次配置时最容易出问题的通常是：

- 前端地址没写对
- 明明带 cookie / token，却还在用全通配符

## 5. `BackgroundTasks` 的位置

后台任务不是任务队列系统，它更像“响应返回后，顺手把一个小尾巴继续做完”。

```python3
from fastapi import BackgroundTasks, FastAPI

app = FastAPI()


def write_notification(email: str, message: str = ""):
    with open("log.txt", mode="a") as email_file:
        email_file.write(f"notification for {email}: {message}\\n")


@app.post("/send-notification/{email}")
async def send_notification(email: str, background_tasks: BackgroundTasks):
    background_tasks.add_task(write_notification, email, message="some notification")
    return {"message": "Notification sent in the background"}
```

它的意思是：

- 先把响应返回给客户端
- 再在后台补做一些轻量工作

## 6. 后台任务也能进依赖系统

官方文档特别提到：

- `BackgroundTasks` 也可以参与依赖注入
- 在路径函数、依赖、子依赖里声明都可以
- FastAPI 会把它们合并到同一个对象上

```python3
from typing import Annotated
from fastapi import BackgroundTasks, Depends, FastAPI

app = FastAPI()


def write_log(message: str):
    with open("log.txt", mode="a") as log:
        log.write(message)


def get_query(background_tasks: BackgroundTasks, q: str | None = None):
    if q:
        background_tasks.add_task(write_log, f"found query: {q}\\n")
    return q


@app.post("/send-notification/{email}")
async def send_notification(
    email: str,
    background_tasks: BackgroundTasks,
    q: Annotated[str | None, Depends(get_query)],
):
    background_tasks.add_task(write_log, f"message to {email}\\n")
    return {"message": "Message sent"}
```

来源：Background Tasks 官方页 <https://fastapi.tiangolo.com/zh/tutorial/background-tasks/>

## 7. 这一层的边界

中间件、CORS、后台任务这三件事放在一起很合理，因为它们都属于“不是业务字段本身，但又会围绕请求工作”的层。

它们不像路径参数或请求体那样直接决定接口数据结构，却会很明显地影响：

- 请求经过的路径
- 浏览器能不能调通
- 响应返回后的尾部动作
