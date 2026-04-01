---
title: FastAPI 输入基础：路径参数与查询参数
published: 2026-03-30
description: 先把 URL 里的输入层拆开：路径参数、查询参数、自动类型转换、顺序匹配与自动文档各自意味着什么。
tags: [FastAPI, Path Params, Query Params]
category: FastAPI
draft: false
comment: true
---

> 官方教程把路径参数和查询参数拆成了两个章节，这样查资料很方便；但实际学习时，这两者更适合一起理解，因为它们本质上都在回答同一个问题：请求里的输入，到底从哪里来。

## 1. 路径参数：URL 结构的一部分

最基础的路径参数写法就是这样：

```python3
from fastapi import FastAPI

app = FastAPI()


@app.get("/items/{item_id}")
async def read_item(item_id: str):
    return {"item_id": item_id}
```

这里的 `item_id` 不是普通字符串，而是从路径里提取出来的变量。

FastAPI 会根据类型注解自动做解析：

- 写成 `str`，`/items/foo` 和 `/items/4` 都可以
- 写成 `int`，传 `foo` 就会自动报校验错误

这意味着 FastAPI 不只是“拿到字符串再自己转”，而是直接把 Python 类型系统接进了请求解析过程。

## 2. 路径匹配的顺序非常重要

这一点在刚开始时很容易踩坑。

```python3
@app.get("/users/me")
async def read_user_me():
    return {"user_id": "the current user"}


@app.get("/users/{user_id}")
async def read_user(user_id: str):
    return {"user_id": user_id}
```

`/users/me` 必须写在 `/users/{user_id}` 前面，否则 `me` 会被当成一个普通的 `user_id`。

所以路径操作不是“只看谁更具体”，还要看**声明顺序**。

## 3. 枚举路径参数：把可选值写死进类型系统

当路径参数只能取一组有限值时，用 `Enum` 会非常自然：

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

这样一来，自动文档里这个参数会直接变成可选项，而不是自由输入框。

## 4. 路径转换器：允许路径本身再包含路径

有时候我们希望把整个文件路径当成一个变量接住：

```python3
@app.get("/files/{file_path:path}")
async def read_file(file_path: str):
    return {"file_path": file_path}
```

这里的 `:path` 是 Starlette 提供的路径转换器，FastAPI 可以直接用。

## 5. 查询参数：URL 中 `?` 后面的输入

查询参数和路径参数最大的区别是：它不属于路径结构本身，而是属于“附加条件”。

```python3
from fastapi import FastAPI

app = FastAPI()

fake_items_db = [{"item_name": "Foo"}, {"item_name": "Bar"}, {"item_name": "Baz"}]


@app.get("/items/")
async def read_item(skip: int = 0, limit: int = 10):
    return fake_items_db[skip : skip + limit]
```

对应请求可以写成：

```text
/items/?skip=0&limit=10
```

只要参数不是路径参数，FastAPI 就会自动把它解释成查询参数。

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

布尔查询参数也会自动转换。比如：

- `?short=on`
- `?short=1`
- `?short=true`

这些都会被当成 `True`。

## 7. 到这里应该形成的心智模型

在这一阶段，我觉得最重要的是把输入分成两层：

- **路径参数**：资源定位的一部分
- **查询参数**：对这次请求的附加说明

FastAPI 的关键体验在于：

- 自动根据类型注解做转换
- 自动校验
- 自动反映到 `/docs`

所以你写的并不是“给框架看的注释”，而是真正参与请求处理的结构信息。
