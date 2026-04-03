---
title: FastAPI 输入基础：路径参数与查询参数
published: 2026-04-01
description: 把 URL 上最常见的两类输入拆开：路径参数负责定位资源，查询参数负责表达筛选和附加条件。
tags: [FastAPI, Path Params, Query Params]
category: FastAPI
draft: false
comment: true
---

官方把路径参数和查询参数拆成了两个章节，这样查资料很舒服；连续学习时，把它们放在一起会更顺，因为它们本质上都在回答同一个问题：请求里的输入，先从 URL 的哪一层进来。

## 1. 路径参数：资源定位的一部分

```python3
from fastapi import FastAPI

app = FastAPI()


@app.get("/items/{item_id}")
async def read_item(item_id: str):
    return {"item_id": item_id}
```

这里的 `item_id` 不只是一个字符串变量，而是 URL 路径的一部分。

FastAPI 会根据类型注解自动解析：

- 写成 `str`，`/items/foo` 和 `/items/4` 都行
- 写成 `int`，传 `foo` 会自动报校验错误

所以它不是“先拿到字符串，再自己转”，而是直接把 Python 类型系统接到了请求解析层。

## 2. 路径匹配的顺序很重要

```python3
@app.get("/users/me")
async def read_user_me():
    return {"user_id": "the current user"}


@app.get("/users/{user_id}")
async def read_user(user_id: str):
    return {"user_id": user_id}
```

`/users/me` 必须写在 `/users/{user_id}` 前面，否则 `me` 会被当成普通的 `user_id`。

这里很容易以为 FastAPI 会自动优先匹配更具体的路径，但实际还是要考虑声明顺序。

## 3. 枚举路径参数

当路径参数只能从一组有限值里选时，可以直接用 `Enum`：

```python3
from enum import Enum


class ModelName(str, Enum):
    alexnet = "alexnet"
    resnet = "resnet"
    lenet = "lenet"


@app.get("/models/{model_name}")
async def get_model(model_name: ModelName):
    if model_name is ModelName.alexnet:
        return {"model_name": model_name, "message": "Deep Learning FTW!"}
    if model_name.value == "lenet":
        return {"model_name": model_name, "message": "LeCNN all the images"}
    return {"model_name": model_name, "message": "Have some residuals"}
```

这样文档里会直接展示可选值，而不是一个自由输入框。

## 4. 路径转换器

有时候变量本身还想继续吃掉路径，可以用 Starlette 的路径转换器：

```python3
@app.get("/files/{file_path:path}")
async def read_file(file_path: str):
    return {"file_path": file_path}
```

这里的 `:path` 让 `file_path` 可以包含 `/`。

## 5. 查询参数：`?` 后面的附加条件

```python3
from fastapi import FastAPI

app = FastAPI()

fake_items_db = [{"item_name": "Foo"}, {"item_name": "Bar"}, {"item_name": "Baz"}]


@app.get("/items/")
async def read_items(skip: int = 0, limit: int = 10):
    return fake_items_db[skip : skip + limit]
```

对应请求可以写成：

```text
/items/?skip=0&limit=10
```

只要参数不是路径参数，FastAPI 默认就会把它解释成查询参数。

## 6. 路径参数和查询参数可以同时存在

```python3
@app.get("/items/{item_id}")
async def read_item(
    item_id: str,
    p: str = "test",
    q: str | None = None,
    short: bool = False,
):
    item = {"item_id": item_id}
    if q:
        item.update({"q_info": f"q传入了参数{q}"})
    if p:
        item.update({"p_info": "测试成功，默认查询了p"})
    if short:
        item.update({"short_info": "你真传了short啊"})
    return item
```

这里：

- `item_id` 是路径参数
- `p`、`q`、`short` 是查询参数

布尔查询参数也会自动做转换。像 `1`、`true`、`on` 都会被识别成 `True`。

## 7. 一开始最值得建立的区分

这一阶段最重要的不是背更多 API，而是先把 URL 上的输入层分开：

- 路径参数：属于资源标识的一部分
- 查询参数：属于对本次请求的额外说明

后面无论进入请求体、表单还是依赖注入，只要这个区分先站稳，阅读体验会顺很多。
