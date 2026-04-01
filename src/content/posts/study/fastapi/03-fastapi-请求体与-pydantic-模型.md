---
title: FastAPI 请求体：Pydantic 模型、多参数与嵌套结构
published: 2026-03-29
description: 当输入不再只是 URL 参数，而是一整个 JSON 请求体时，FastAPI 如何借助 Pydantic 做解析、校验、嵌套和文档生成。
tags: [FastAPI, Pydantic, Request Body]
category: FastAPI
draft: false
comment: true
---

> 到了请求体这一层，FastAPI 的真正优势会开始明显起来：你不再是手写 JSON 解析，而是直接把数据结构声明成模型，让校验、转换、编辑器支持和 OpenAPI 一起联动。

## 1. 用 Pydantic 模型声明请求体

最基础的请求体写法如下：

```python3
from fastapi import FastAPI
from pydantic import BaseModel


class Item(BaseModel):
    name: str
    description: str | None = None
    price: float
    tax: float | None = None


app = FastAPI()


@app.post("/item/")
async def create_item(item: Item):
    item_dict = item.model_dump()
    if item.tax is not None:
        price_with_tax = item.price + item.tax
        item_dict.update({"price_with_tax": price_with_tax})
    return item_dict
```

这里的关键不是“能收到 JSON”，而是：

- FastAPI 会把请求体按 `Item` 模型解析
- Pydantic 会自动校验字段类型
- 错误时会指出具体字段和原因
- 生成的 schema 会自动进入 OpenAPI 文档

## 2. 路径参数、查询参数、请求体可以一起出现

```python3
@app.put("/items/{item_id}")
async def update_item(item_id: int, item: Item, q: str | None = None):
    result = {"item_id": item_id, **item.model_dump()}
    if q:
        result.update({"q": q})
    return result
```

这里其实已经把三层输入放在一起了：

- `item_id`：路径参数
- `q`：查询参数
- `item`：请求体

理解这一点很重要，因为后面很多复杂接口，本质上都是这三类输入的组合。

## 3. 多个请求体参数

当一个接口需要提交多个结构对象时，可以直接声明多个 Pydantic 模型：

```python3
from pydantic import BaseModel


class Item(BaseModel):
    name: str
    description: str | None = None
    price: float
    tax: float | None = None


class User(BaseModel):
    username: str
    full_name: str | None = None


@app.put("/items/{item_id}")
async def update_item(item_id: int, item: Item, user: User):
    results = {"item_id": item_id, "item": item, "user": user}
    return results
```

这时 FastAPI 会期望请求体长成：

```json
{
  "item": {
    "name": "Foo",
    "description": "The pretender",
    "price": 42.0,
    "tax": 3.2
  },
  "user": {
    "username": "dave",
    "full_name": "Dave Grohl"
  }
}
```

## 4. 简单类型如果想放进 Body，需要显式声明

```python3
from typing import Annotated
from fastapi import Body


@app.put("/b_items/{item_id}")
async def update_item(
    item_id: int,
    item: Item,
    user: User,
    importance: Annotated[int, Body(gt=0)],
):
    results = {"item_id": item_id, "item": item, "user": user, "importance": importance}
    return results
```

这是一个很容易忽略的规则：

- Pydantic 模型默认会被当成请求体
- 简单类型如果不额外声明，默认会被当成查询参数

所以 `Body()` 的作用，不只是加校验，还在告诉 FastAPI：**这个参数来自请求体**。

## 5. 嵌套模型

Pydantic 的强项之一就是可以自然表达复杂嵌套结构。

```python3
from pydantic import BaseModel, HttpUrl


class Image(BaseModel):
    url: HttpUrl
    name: str


class Item(BaseModel):
    name: str
    description: str | None = None
    price: float
    tax: float | None = None
    tags: set[str] = set()
    images: list[Image] | None = None


@app.put("/items/{item_id}")
async def update_item(item_id: int, item: Item):
    return {"item_id": item_id, "item": item}
```

这里顺手也能看到几类好用的能力：

- `HttpUrl`：校验 URL
- `set[str]`：去重标签
- `list[Image]`：子模型列表

## 6. 给请求体补示例和文档信息

你写的模型不仅能校验数据，还能直接影响 API 文档的展示效果。

一种方式是在模型里写：

```python3
class Item(BaseModel):
    name: str
    description: str | None = None
    price: float
    tax: float | None = None

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "name": "Foo",
                    "description": "A very nice Item",
                    "price": 35.4,
                    "tax": 3.2,
                }
            ]
        }
    }
```

另一种方式是在 `Body()` 里写 `openapi_examples`：

```python3
@app.put("/o_items/{item_id}")
async def update_item(
    *,
    item_id: int,
    item: Annotated[
        Item,
        Body(
            openapi_examples={
                "normal": {
                    "summary": "A normal example",
                    "description": "A **normal** item works correctly.",
                    "value": {
                        "name": "Foo",
                        "description": "A very nice Item",
                        "price": 35.4,
                        "tax": 3.2,
                    },
                }
            },
        ),
    ],
):
    return {"item_id": item_id, "item": item}
```

这会直接反映到 `/docs` 里。

## 7. 这一阶段应该记住什么

我自己到这里最大的收获是：FastAPI 里的请求体不是“手动解析 JSON”，而是“声明数据模型”。

一旦你把结构声明清楚了：

- 解析
- 校验
- 编辑器补全
- OpenAPI
- 文档示例

这些能力就会自动串起来。

所以这一阶段真正该练的，不是“记住某个装饰器”，而是学会把输入数据建模。
