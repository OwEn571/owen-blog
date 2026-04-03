---
title: FastAPI 输出层：响应模型、状态码与数据更新
published: 2026-03-29
description: 从 response_model 开始，把输出约束、状态码、路径操作配置、jsonable_encoder、PUT/PATCH 更新语义一起收进一层。
tags: [FastAPI, Response Model, Status Code]
category: FastAPI
draft: false
comment: true
---

前面几篇主要在看“请求怎么进来”。这一篇开始把视角转到输出端：接口最终要返回什么、返回到什么程度、文档和数据过滤怎样跟着一起工作。

## 1. `response_model` 到底在解决什么

最直接的写法，是在返回类型上做类型注解：

```python3
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()


class Item(BaseModel):
    name: str
    description: str | None = None
    price: float
    tax: float | None = None
    tags: list[str] = []


@app.post("/items/")
async def create_item(item: Item) -> Item:
    return item


@app.get("/items/")
async def read_items() -> list[Item]:
    return [
        Item(name="Portal Gun", price=42.0),
        Item(name="Plumbus", price=32.0),
    ]
```

这样做的效果不只是“有类型提示”，还包括：

- 自动生成响应 schema
- 自动体现在 OpenAPI 文档里
- 返回数据结构不匹配时更早暴露问题

## 2. 返回类型和 `response_model` 的关系

有时函数真实返回的东西，和你希望文档/过滤层看到的模型不完全一样。这时候可以把 `response_model` 写在装饰器上。

```python3
from typing import Any
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()


class Item(BaseModel):
    name: str
    description: str | None = None
    price: float
    tax: float | None = None
    tags: list[str] = []


@app.get("/items/", response_model=list[Item])
async def read_items() -> Any:
    return [
        {"name": "Portal Gun", "price": 42.0},
        {"name": "Plumbus", "price": 32.0},
    ]
```

官方文档明确提到：

- 如果同时声明了返回类型和 `response_model`
- 那么 FastAPI 最终会以 `response_model` 为准

来源：Response Model 官方页 <https://fastapi.tiangolo.com/zh/tutorial/response-model/>

## 3. 响应模型不仅描述输出，也会过滤输出

这是 `response_model` 很值的一点。

官方文档专门提到“返回类型与数据过滤”这一层：即使函数返回了更多字段，FastAPI 也会按响应模型把不该暴露的字段过滤掉。  
来源：Response Model 官方页 <https://fastapi.tiangolo.com/zh/tutorial/response-model/>

这也是为什么用户模型常常会拆成：

- `UserIn`
- `UserOut`

或者用继承关系把公共字段提出来。

## 4. `response_model_exclude_unset`、`include`、`exclude`

如果模型里有很多默认值，但响应里只想保留“真实设置过的字段”，可以这样写：

```python3
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()


class Item(BaseModel):
    name: str
    description: str | None = None
    price: float
    tax: float = 10.5
    tags: list[str] = []


items = {
    "foo": {"name": "Foo", "price": 50.2},
    "bar": {"name": "Bar", "description": "The bartenders", "price": 62, "tax": 20.2},
}


@app.get("/items/{item_id}", response_model=Item, response_model_exclude_unset=True)
async def read_item(item_id: str):
    return items[item_id]
```

如果只想挑部分字段，也可以用：

- `response_model_include`
- `response_model_exclude`

不过这类写法更适合临时裁剪；真正长期可维护的接口，通常还是拆独立输出模型更清楚。

## 5. 状态码不是附属配置，而是输出语义的一部分

你在本地 13、16 这两份笔记里把状态码和路径操作配置单独记出来，这一步其实很值，因为它们就是输出层的一部分。

```python3
from fastapi import FastAPI, status
from pydantic import BaseModel

app = FastAPI()


class Item(BaseModel):
    name: str
    description: str | None = None
    price: float
    tax: float | None = None


@app.post("/items/", status_code=status.HTTP_201_CREATED)
async def create_item(item: Item) -> Item:
    return item
```

常见的几个记忆点：

- `200`：默认成功
- `201`：创建成功
- `204`：成功但没有响应体
- `400/404`：客户端错误
- `500`：服务端错误

## 6. 路径操作配置：`tags`、`summary`、`description`

这些参数看起来像“文档修饰”，实际上对大一点的项目非常重要。

```python3
from enum import Enum
from fastapi import FastAPI

app = FastAPI()


class Tags(Enum):
    items = "items"
    users = "users"


@app.get("/items/", tags=[Tags.items], summary="读取条目列表")
async def get_items():
    return ["Portal gun", "Plumbus"]
```

这类配置会直接影响：

- `/docs` 里的分组
- OpenAPI 中的语义结构
- 前后端对接口的认知方式

如果应用大起来了，把标签收进 `Enum` 会比到处散落字符串稳很多。

## 7. `jsonable_encoder` 的位置

`jsonable_encoder()` 最容易在“更新数据”和“写入数据库前序列化”这两个场景里出现。

```python3
from datetime import datetime
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel

fake_db = {}


class Item(BaseModel):
    title: str
    timestamp: datetime
    description: str | None = None


def update_item(id: str, item: Item):
    json_compatible_item_data = jsonable_encoder(item)
    fake_db[id] = json_compatible_item_data
```

它的作用就是：

- 把 Pydantic 模型转成更适合 JSON 的结构
- 顺手把 `datetime`、`UUID` 这类类型转换成可序列化形式

如果你后面要把数据存进数据库、缓存或者文件，这一步非常常见。

## 8. PUT 和 PATCH 的区别

你在 18.md 里已经把这一层写出来了，放到输出层来看会更顺：

- `PUT` 更像整体替换
- `PATCH` 更像部分更新

```python3
from fastapi import FastAPI
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel

app = FastAPI()


class Item(BaseModel):
    name: str | None = None
    description: str | None = None
    price: float | None = None
    tax: float = 10.5
    tags: list[str] = []


items = {
    "foo": {"name": "Foo", "price": 50.2},
    "bar": {"name": "Bar", "description": "The bartenders", "price": 62, "tax": 20.2},
}


@app.patch("/items/{item_id}", response_model=Item)
async def update_item(item_id: str, item: Item):
    stored_item_data = items[item_id]
    stored_item_model = Item(**stored_item_data)
    update_data = item.model_dump(exclude_unset=True)
    updated_item = stored_item_model.model_copy(update=update_data)
    items[item_id] = jsonable_encoder(updated_item)
    return updated_item
```

这里最核心的一步其实是：

```python
item.model_dump(exclude_unset=True)
```

它保证只有用户真的传了的字段才会参与更新，而不会让模型默认值把旧数据覆盖掉。

## 9. 响应层为什么值得单独当一篇看

刚开始学 FastAPI，很容易只盯着“能不能把参数收进来”。但真正把接口做稳，靠的是输出端：

- 返回什么模型
- 过滤掉什么字段
- 用什么状态码表达结果
- 文档怎么展示
- 更新时怎样避免误覆盖

输入层决定你怎么接请求，输出层决定你的接口能不能长久稳定。
