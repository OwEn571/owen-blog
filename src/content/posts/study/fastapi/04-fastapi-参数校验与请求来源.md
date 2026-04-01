---
title: FastAPI 参数校验：Query、Path、Body、Cookie、Header
published: 2026-03-28
description: 把 Query、Path、Body、Cookie、Header 统一进一个心智模型：参数从哪里来，以及怎样利用 Annotated 和 Pydantic 做精细校验。
tags: [FastAPI, Validation, Query, Header]
category: FastAPI
draft: false
comment: true
---

> 我觉得官方教程在这一段最容易让人产生“怎么又是一个新章节”的感觉。其实 `Query / Path / Body / Cookie / Header` 可以一起理解：它们本质上都在回答“参数从哪里来”，只不过来源不同、约束方式不同。

## 1. `Query`、`Path`、`Body` 的核心作用

这三个工具最重要的意义，不是“多一个函数”，而是：

**告诉 FastAPI 参数的来源，并附带额外规则。**

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

- 明确告诉框架：这个参数来自查询字符串
- 补充了长度、说明等规则

`Path()` 同理，只不过针对路径参数。

## 2. `Annotated` 的意义

这一段的写法刚开始容易显得绕，但它其实很好懂：

```python3
q: Annotated[str | None, Query(max_length=50)] = None
```

可以把它理解成：

- 真正的数据类型是 `str | None`
- 额外的校验和文档说明在 `Query(...)` 里

这使得“类型”和“约束”可以放在一处表达。

## 3. 额外校验：长度、范围、正则、别名

`Query`、`Path`、`Body` 都支持一大批相似的约束参数，例如：

- `max_length`
- `min_length`
- `pattern`
- `gt` / `ge`
- `lt` / `le`
- `alias`
- `deprecated`
- `include_in_schema`

比如：

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

- `item_id` 必须 `>= 1`
- 查询参数对外暴露的名字叫 `item-query`

## 4. 自定义校验：`AfterValidator`

有些规则没法只靠 `gt`、`max_length` 解决，这时候就可以接 Pydantic 的验证器。

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

这一步很重要，因为它说明 FastAPI 的校验能力并不只停留在简单规则上，而是能自然接入 Pydantic 的更复杂能力。

## 5. 用模型承接一整组查询参数

查询参数多起来之后，散着写会越来越乱。这个时候可以把它们收成模型：

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

这段特别值得记，因为它让“查询条件”也能像请求体一样被建模。

## 6. Cookie 和 Header 其实也是同一套逻辑

Cookie 和 Header 这两章单独拆开看会很碎，但本质上还是同一个模式：只是来源不同。

```python3
from typing import Annotated
from fastapi import Cookie, FastAPI, Header
from pydantic import BaseModel

app = FastAPI()


@app.get("/items/")
async def read_items(session_id: Annotated[str | None, Cookie()] = None):
    return {"session_id": session_id}


@app.get("/h_items/")
async def read_items(user_agent: Annotated[str | None, Header()] = None):
    return {"User-Agent": user_agent}
```

甚至它们也能用模型一起收：

```python3
class Cookies(BaseModel):
    model_config = {"extra": "forbid"}

    session_id: str
    fatebook_tracker: str | None = None
    googall_tracker: str | None = None


@app.get("/cs_items/")
async def read_items(cookies: Annotated[Cookies, Cookie()]):
    return cookies
```

以及：

```python3
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

## 7. 这一阶段应该记住什么

到这里最值得建立的统一心智是：

- 参数不仅有“类型”，还有“来源”
- `Query / Path / Body / Cookie / Header` 是来源标记
- Pydantic 负责更深层的结构化校验

只要这个心智建立起来，后面无论遇到表单、文件上传，还是依赖注入，理解都会顺得多。
