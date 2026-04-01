---
title: FastAPI 起步：第一个应用与并发直觉
published: 2026-03-31
description: 从最小 Hello World 开始，顺手把自动文档、OpenAPI、async/await 和并发直觉一起建立起来。
tags: [FastAPI, Async, OpenAPI]
category: FastAPI
draft: false
comment: true
---

> 这一篇对应我最开始写的 `1_main.py` 和 `2_burger_app.py`。官方教程一上来先让你跑通一个最小例子，这是对的；我这里顺手把“异步和并发到底在 FastAPI 里意味着什么”一起放进来，这样后面看到 `async def` 不会只把它当成语法装饰。

## 1. 第一个 FastAPI 应用

FastAPI 的入口非常直接：导入 `FastAPI`，创建实例，然后给路径绑定处理函数。

```python3
from fastapi import FastAPI

app = FastAPI()


@app.get("/")
async def root():
    return {"message": "Hello world"}
```

这里有两个最重要的概念：

- `app = FastAPI()`：创建应用实例。
- `@app.get("/")`：把下面这个函数注册成处理 `GET /` 的路径操作函数。

你一旦把它跑起来，FastAPI 就会自动帮你生成：

- `/openapi.json`
- `/docs`（Swagger UI）
- `/redoc`（ReDoc）

也就是说，代码并不是“写完再额外写一份文档”，而是代码本身经过 OpenAPI 规范转换后，直接长成文档页面。

## 2. 为什么路径函数可以直接写 `async`

FastAPI 的一个很强的体验点是：你只要按 Python 的异步语法来写，框架就能顺势接住它。

```python3
from fastapi import FastAPI
import asyncio

app = FastAPI()


async def make_burger(name: str, seconds: int):
    print(f"{name}: 开始做了")
    await asyncio.sleep(seconds)
    print(f"{name}: 做好了")
    return name


async def get_burgers(count: int):
    tasks = [
        asyncio.create_task(make_burger(f"汉堡{i + 1}", 3 + i))
        for i in range(count)
    ]
    return await asyncio.gather(*tasks)


@app.get("/burgers/{count}")
async def order_burgers(count: int):
    burgers = await get_burgers(count)
    return {"count": count, "burgers": burgers}
```

这个“做汉堡”例子本身不是在教你写业务，而是在帮你建立一个直觉：

- I/O 密集型任务适合异步并发
- `await` 的意义不是“更快”，而是“等的时候别把整个服务堵住”
- FastAPI 对 `async def` 的支持不是额外插件，而是路径函数的一等公民

## 3. 协程、线程池和 FastAPI 的选择

我自己在这里最容易混淆的是：到底什么时候写 `async def`，什么时候写普通 `def`。

一个很实用的记法是：

- `async def`：适合 I/O 密集型逻辑，例如等待数据库、网络请求、文件读取。
- `def`：如果你写的是同步函数，FastAPI 会把它放到外部线程池里执行，避免直接堵住主事件循环。

所以 FastAPI 不是“所有东西都必须异步”，而是：

- 如果你能异步，就直接异步
- 如果你现在是同步逻辑，它也会帮你兜底

## 4. 开发模式和文档入口

开发时最常见的启动方式是：

```bash
fastapi dev
```

它会自动热重载，所以你改代码时会看到服务重启。这个模式适合开发，不是生产部署方式。

跑起来之后，最值得立刻记住的三个地址是：

- `http://127.0.0.1:8000`
- `http://127.0.0.1:8000/docs`
- `http://127.0.0.1:8000/redoc`

## 5. 这一阶段应该记住什么

如果只保留最小心智，我觉得就三句：

1. FastAPI 先是一个 `FastAPI` 实例，然后一切都围绕路径函数展开。
2. 代码会自动长成 OpenAPI 和文档页面。
3. `async / await` 在这里不是噱头，而是服务端处理 I/O 并发的基础表达方式。

有了这三点，后面再看路径参数、查询参数和请求体时，就不会只是在背语法，而是在理解“请求怎么进入框架”。
