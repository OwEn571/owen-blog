---
title: FastAPI 参数校验：Query、Path、Body、Cookie、Header
published: 2026-03-30
description: 把 Query、Path、Body、Cookie、Header 统一进一个心智模型：参数从哪里来，以及怎样利用 Annotated 和 Pydantic 做精细校验。
tags: [FastAPI, Validation, Query, Header]
category: FastAPI
draft: false
comment: true
---

官方教程在这里会连续切出 `Query`、`Path`、`Body`、`Cookie`、`Header` 好几页，第一次读容易觉得“怎么又来一个函数”。更顺的理解方式是：它们其实都在回答同一个问题，只是参数来源不同。

## 1. `Query`、`Path`、`Body` 的真正作用

```python3
from typing import Annotated
from fastapi import FastAPI, Query, Path

app = FastAPI()


@app.get("/items/")
async def read_items(
    q: Annotated[str | None, Query(max_length=50, description="随便传个字符串")] = None,
):
    results = {"items": [{"item_id": "Foo"}, {"item_id": "Bar"}]}
    if q:
        results.update({"q": q})
    return results
```

这里 `Query(...)` 做了两件事：

- 告诉 FastAPI：这个参数来自查询字符串
- 顺手附带额外约束和文档信息

`Path()` 和 `Body()` 也是同样的模式，只是来源不同。

## 2. `Annotated` 的意义

```python3
q: Annotated[str | None, Query(max_length=50)] = None
```

可以把它拆成两层：

- 真正的数据类型是 `str | None`
- 额外的校验规则和来源说明放在 `Query(...)`

这样“类型”和“元信息”就放在了一起，读起来会比老写法更清楚。

## 3. 常见约束：长度、范围、别名、弃用

`Query`、`Path`、`Body` 支持一大批相似的约束参数：

- `max_length`
- `min_length`
- `pattern`
- `gt` / `ge`
- `lt` / `le`
- `alias`
- `deprecated`
- `include_in_schema`

```python3
@app.get("/p_items/{item_id}")
async def read_items(
    item_id: Annotated[int, Path(title="我是一个title", ge=1)],
    q: Annotated[str | None, Query(alias="item-query")] = None,
):
    results = {"item_id": item_id}
    if q:
        results.update({"q": q})
    return results
```

这里：

- `item_id` 必须大于等于 1
- 对外暴露的查询参数名是 `item-query`

## 4. 自定义校验：`AfterValidator`

有些规则不是 `gt`、`max_length` 这种现成参数能覆盖的，这时可以接 Pydantic 验证器。

```python3
import random
from pydantic import AfterValidator

data = {
    "isbn-9781529046137": "The Hitchhiker's Guide to the Galaxy",
    "imdb-tt0371724": "The Hitchhiker's Guide to the Galaxy",
    "isbn-9781439512982": "Isaac Asimov: The Complete Stories, Vol. 2",
}


def check_valid_id(id: str):
    if not id.startswith(("isbn-", "imdb-")):
        raise ValueError('Invalid ID format, it must start with "isbn-" or "imdb-"')
    return id


@app.get("/v_items/")
async def read_items(
    id: Annotated[str | None, AfterValidator(check_valid_id)] = None,
):
    if id:
        item = data.get(id)
    else:
        id, item = random.choice(list(data.items()))
    return {"id": id, "name": item}
```

这一步很重要，因为它说明 FastAPI 并不只支持“表面上的参数约束”，而是可以自然接入 Pydantic 更细的校验能力。

## 5. 用模型承接一整组查询参数

查询参数一多，散着写会越来越乱。这个时候可以把它们建成一个模型：

```python3
from typing import Annotated, Literal
from fastapi import Query
from pydantic import BaseModel, Field


class FilterParams(BaseModel):
    model_config = {"extra": "forbid"}

    limit: int = Field(100, gt=0, le=100)
    offset: int = Field(0, ge=0)
    order_by: Literal["created_at", "updated_at"] = "created_at"
    tags: list[str] = []


@app.get("/items/")
async def read_items(filter_query: Annotated[FilterParams, Query()]):
    return filter_query
```

这段非常值得记，因为它把“查询参数”也推进了结构化建模这一层。

## 6. Cookie 和 Header 其实还是同一个模式

它们看起来像两个新知识点，本质上还是同一个问题：参数从哪里来。

```python3
from typing import Annotated
from fastapi import Cookie, FastAPI, Header

app = FastAPI()


@app.get("/items/")
async def read_items(session_id: Annotated[str | None, Cookie()] = None):
    return {"session_id": session_id}


@app.get("/h_items/")
async def read_items(user_agent: Annotated[str | None, Header()] = None):
    return {"User-Agent": user_agent}
```

这类来源参数也能继续用模型收起来：

```python3
from pydantic import BaseModel


class CommonHeaders(BaseModel):
    host: str
    save_data: bool
    if_modified_since: str | None = None
    traceparent: str | None = None
    x_tag: list[str] = []


@app.get("/hs_items/")
async def read_items(headers: Annotated[CommonHeaders, Header()]):
    return headers
```

## 7. 到这里最值得留下来的心智

这一层最重要的不是把 `Query / Path / Body / Cookie / Header` 分别背下来，而是先把统一模式站稳：

- 参数先有类型
- 参数再有来源
- 参数还可以继续叠加规则

后面你再看表单、文件上传、依赖注入，理解会快很多，因为底层模式其实没变。
