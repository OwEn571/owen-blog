---
title: FastAPI 请求体：Pydantic 模型、多参数与嵌套结构
published: 2026-03-31
description: 当输入不再只是 URL 参数，而是一整个 JSON 请求体时，FastAPI 如何借助 Pydantic 做解析、校验、嵌套和文档生成。
tags: [FastAPI, Pydantic, Request Body]
category: FastAPI
draft: false
comment: true
---

从这一篇开始，输入不再只是 URL 上的几个值，而是成块的数据结构。FastAPI 的优势也从这里开始明显：不是自己手写 JSON 解析，而是直接把结构声明成模型。

## 1. 用 Pydantic 模型声明请求体

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
- 文档会自动生成 schema
- 校验错误会定位到具体字段

## 2. 路径参数、查询参数、请求体可以一起出现

```python3
@app.put("/items/{item_id}")
async def update_item(item_id: int, item: Item, q: str | None = None):
    result = {"item_id": item_id, **item.model_dump()}
    if q:
        result.update({"q": q})
    return result
```

这里已经把三类最核心的输入组合起来了：

- `item_id`：路径参数
- `q`：查询参数
- `item`：请求体

后面很多复杂接口，本质上还是这三层输入的组合。

## 3. 多个请求体参数

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
    return {"item_id": item_id, "item": item, "user": user}
```

这时 FastAPI 期望请求体长成：

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
    return {"item_id": item_id, "item": item, "user": user, "importance": importance}
```

这里有个很关键的规则：

- Pydantic 模型默认会被当成请求体
- 简单类型如果不额外声明，默认会被当成查询参数

所以 `Body()` 不只是补校验，它还在明确参数来源。

## 5. 嵌套模型

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

这里顺手也能看到 Pydantic 提供的几个常用能力：

- `HttpUrl`：校验 URL
- `set[str]`：自动去重
- `list[Image]`：子模型列表

## 6. 给请求体补示例和文档信息

模型不仅负责校验，还会直接影响 `/docs` 里的展示效果。

可以在模型里写：

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

也可以在 `Body()` 里写 `openapi_examples`，这样能给同一个接口准备多个示例场景。

## 7. 请求体这一层真正带来的变化

到了这里，FastAPI 的体验已经开始和“手写 Flask 风格的 JSON 解析”拉开差距了。

你写的不是“接收一个 dict 再自己判空”，而是：

- 先把数据结构声明出来
- 再让框架负责解析
- 再让文档跟着模型自动长出来

这也是为什么后面学响应模型、依赖注入和安全时，Pydantic 一直会反复出现。
