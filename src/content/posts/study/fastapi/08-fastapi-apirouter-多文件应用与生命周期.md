---
title: FastAPI Bigger Applications：APIRouter、多文件应用与生命周期
published: 2026-03-26
description: 当单文件应用开始变大，把 APIRouter、include_router、多文件结构和 lifespan 放到同一条工程化路径里看。
tags: [FastAPI, APIRouter, Lifespan]
category: FastAPI
draft: false
comment: true
---

FastAPI 的前面几章都还能在一个文件里完成，但一旦路由、依赖和安全逻辑变多，问题就会从“会不会写”变成“怎么组织”。

## 1. `APIRouter` 解决的不是功能，而是组织

`APIRouter` 不是另一个小型 `FastAPI`，它更像“可组合的路由组”。

官方 Bigger Applications 页里最值得留下来的直觉是：

- 应用不是只有一个 `app`
- 路由可以先在各自模块里组织好
- 最后再由主应用统一挂载

## 2. 最常见的多文件结构

这类结构是最典型的起点：

```text
app/
├── __init__.py
├── main.py
├── dependencies.py
└── routers/
    ├── __init__.py
    ├── items.py
    └── users.py
```

这里的分层已经很清楚：

- `main.py`：组装应用
- `routers/`：各业务路由
- `dependencies.py`：共享依赖

## 3. 在路由模块里定义 `APIRouter`

```python3
from fastapi import APIRouter, Depends, HTTPException

from ..dependencies import get_token_header

router = APIRouter(
    prefix="/items",
    tags=["items"],
    dependencies=[Depends(get_token_header)],
    responses={404: {"description": "Not found"}},
)


@router.get("/")
async def read_items():
    return [{"name": "Foo"}]
```

这一层最重要的点是：

- `prefix`
- `tags`
- `dependencies`
- `responses`

都可以直接挂在 `APIRouter` 上，而不用在每个路径操作里重复写。

## 4. 在主应用里 `include_router`

```python3
from fastapi import Depends, FastAPI

from .dependencies import get_query_token
from .routers import items, users, admin

app = FastAPI(dependencies=[Depends(get_query_token)])

app.include_router(users.router)
app.include_router(items.router)
app.include_router(
    admin.router,
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(get_token_header)],
    responses={418: {"description": "I'm a teapot"}},
)
```

官方文档里这段很有代表性，因为它说明：

- 路由模块本身可以保持通用
- 应用层再决定怎么挂载它
- `include_router()` 时还能继续补 `prefix`、`tags`、`dependencies`、`responses`

来源：Bigger Applications 官方页 <https://fastapi.tiangolo.com/zh/tutorial/bigger-applications/>

## 5. 这样组织的真正好处

这不是为了“目录看起来整齐”，而是为了几件更实在的事：

- 共享路由模块更容易
- 共享依赖逻辑更自然
- 主应用装配时灵活度更高
- `/docs` 里的标签分组也更清楚

## 6. `lifespan`：把应用级初始化和清理写成一对

如果有些资源应该在应用启动时加载、关闭时释放，FastAPI 现在更推荐用 `lifespan`。

```python3
from contextlib import asynccontextmanager
from fastapi import FastAPI

ml_models = {}


def fake_answer_to_everything_ml_model(x: float):
    return x * 42


@asynccontextmanager
async def lifespan(app: FastAPI):
    ml_models["answer_to_everything"] = fake_answer_to_everything_ml_model
    yield
    ml_models.clear()


app = FastAPI(lifespan=lifespan)


@app.get("/predict")
async def predict(x: float):
    result = ml_models["answer_to_everything"](x)
    return {"result": result}
```

官方文档明确写到：

- `yield` 之前在应用启动前执行
- `yield` 之后在应用结束时清理

来源：Lifespan 官方页 <https://fastapi.tiangolo.com/zh/advanced/events/>

## 7. `lifespan` 和依赖里的 `yield` 有什么不同

它们都用到了 `yield`，但层级不一样：

- 依赖里的 `yield`：围绕一次请求
- `lifespan`：围绕整个应用生命周期

所以适合放在 `lifespan` 里的，通常是：

- 模型预加载
- 全局连接池初始化
- 应用级缓存

而数据库 session 这种更短命的资源，还是更适合放依赖里。
