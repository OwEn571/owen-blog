---
title: FastAPI 起步：应用入口、fastapi dev、entrypoint 与 uvicorn
published: 2026-04-02
description: 从第一个 FastAPI 应用开始，把 app 实例、fastapi dev、pyproject entrypoint、uvicorn 以及 async 并发直觉一次串起来。
tags: [FastAPI, FastAPI CLI, Uvicorn]
category: FastAPI
draft: false
comment: true
---

官方教程的第一步其实很适合直接上手，因为 FastAPI 的最小应用非常小，小到可以一下子把“应用对象、路径函数、自动文档”三件事一起看到。

## 1. 第一个 FastAPI 应用到底做了什么

```python3
from fastapi import FastAPI

app = FastAPI()


@app.get("/")
async def root():
    return {"message": "Hello World"}
```

这几行已经把 FastAPI 最关键的骨架全摆出来了：

- `app = FastAPI()`：创建应用对象
- `@app.get("/")`：注册一个处理 `GET /` 的路径操作
- `async def root()`：定义真正处理请求的函数

一旦跑起来，FastAPI 会自动生成：

- `/openapi.json`
- `/docs`
- `/redoc`

所以 FastAPI 的一个核心体验就是：写代码本身，也是在写接口 schema。

## 2. `fastapi dev` 是什么

FastAPI 自带了 CLI。官方文档里把它单独拆成了一页，但第一次接触时，最重要的其实就是先记住开发模式命令：

```bash
fastapi dev
```

官方文档说明，安装 `fastapi[standard]` 时，会附带 `fastapi` 这个命令行程序；开发环境里直接用 `fastapi dev` 即可启动开发服务器。它会自动热重载，所以改代码时服务会自动重启。  
来源：FastAPI CLI 官方页 <https://fastapi.tiangolo.com/zh/fastapi-cli/>

如果当前目录里正好是标准结构，比如有一个 `main.py` 并且里面有 `app = FastAPI()`，那这条命令通常就够了。

## 3. `entrypoint` 为什么值得早一点知道

官方在 First Steps 里补了一个很有用的点：可以在 `pyproject.toml` 里配置应用入口。

```toml
[tool.fastapi]
entrypoint = "main:app"
```

如果代码不在根目录，而是在 `backend/main.py` 里，那么可以写成：

```toml
[tool.fastapi]
entrypoint = "backend.main:app"
```

它本质上是在告诉 `fastapi` 命令：

- 去哪个模块找应用
- 应用对象名字是什么

这件事看起来像小细节，但对多文件工程很重要，因为它会让 `fastapi dev`、工具链、编辑器扩展都更容易找到你的应用入口。  
来源：First Steps 官方页 <https://fastapi.tiangolo.com/zh/tutorial/first-steps/>

## 4. 为什么还要知道 `uvicorn`

FastAPI 本身是 Web 框架，但真正负责接收 HTTP 请求、跑事件循环、把 ASGI 应用跑起来的，通常是 ASGI 服务器。

最常见的就是 `uvicorn`。

官方手动部署页里明确提到：

- 安装 `fastapi[standard]` 时也会安装 `uvicorn[standard]`
- `uvicorn[standard]` 里包含了像 `uvloop` 这样的推荐依赖

也就是说，FastAPI 和 Uvicorn 的关系可以简单记成：

- FastAPI：定义应用逻辑
- Uvicorn：真正把这个 ASGI 应用跑起来

来源：手动运行服务器官方页 <https://fastapi.tiangolo.com/zh/deployment/manually/>

## 5. `fastapi dev`、`fastapi run`、`uvicorn main:app` 到底是什么关系

这一点官方文档是分散着讲的，第一次学时很容易混。

可以直接这样记：

- `fastapi dev`：开发模式，带自动重载
- `fastapi run`：CLI 的生产模式入口
- `uvicorn main:app`：直接手动启动 ASGI 服务器

官方 CLI 页里明确写到：

- 开发环境用 `fastapi dev`
- 生产环境用 `fastapi run`
- FastAPI CLI 内部实际也是基于 Uvicorn

而手动运行页里则说明了：

```bash
uvicorn main:app --host 0.0.0.0 --port 80
```

这里的 `main:app` 含义是：

- `main`：`main.py` 这个模块
- `app`：模块里的 `app = FastAPI()` 对象

它等价于：

```python
from main import app
```

所以这三者并不冲突，只是站在不同层：

- `fastapi dev` / `fastapi run`：更像 FastAPI 提供的易用封装
- `uvicorn main:app`：直接操作 ASGI 服务器

## 6. `--reload` 为什么只该停留在开发阶段

官方手动运行页也特别提醒了 `--reload`。

它对开发很有用，因为改代码会自动重启。但它的本质是“开发便利”，不是生产能力。所以在生产部署里，通常不会把 `--reload` 一直开着。

因此最常见的分工是：

```bash
uvicorn main:app --reload
```

用在本地开发；

```bash
fastapi run main.py
```

或者：

```bash
uvicorn main:app --host 0.0.0.0 --port 80
```

更接近部署和容器场景。

## 7. 调试时把 `uvicorn.run()` 写进 `__main__`

你本地笔记里还写到了这种方式：

```python3
import uvicorn
from fastapi import FastAPI

app = FastAPI()


@app.get("/")
def root():
    return {"hello": "world"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

这种写法不是 FastAPI 官方主推的日常运行方式，但在本地直接调试时很顺手，尤其是你已经把应用写成一个普通 Python 文件、想直接点运行的时候。

它更像“开发时的 Python 入口”，而不是部署命令。

## 8. FastAPI 为什么能直接支持 `async def`

FastAPI 的另一个关键体验，是路径函数可以自然写成 `async def`。

```python3
import asyncio
from fastapi import FastAPI

app = FastAPI()


async def make_burger(name: str, seconds: int):
    await asyncio.sleep(seconds)
    return name


@app.get("/burgers/{count}")
async def order_burgers(count: int):
    tasks = [
        asyncio.create_task(make_burger(f"汉堡{i + 1}", 3 + i))
        for i in range(count)
    ]
    burgers = await asyncio.gather(*tasks)
    return {"count": count, "burgers": burgers}
```

这个“做汉堡”例子重要的地方不在汉堡，而在于它很适合建立一个直觉：

- I/O 密集型任务适合异步
- `await` 的意义不是“更快”，而是“等待时别堵住整个服务”
- FastAPI 对 `async def` 的支持不是附加功能，而是默认工作方式的一部分

如果路径函数写成普通 `def`，FastAPI 也能处理。它会把同步函数放到线程池里执行，避免直接阻塞事件循环。这个兜底机制意味着：

- 能异步就异步
- 还没异步化的同步逻辑也能先跑起来
