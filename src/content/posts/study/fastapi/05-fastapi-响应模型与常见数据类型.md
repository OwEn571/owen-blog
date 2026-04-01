---
title: FastAPI 输出层：响应模型与常见数据类型
published: 2026-03-27
description: 把注意力从“请求怎么进来”转到“响应怎么出去”，理解返回类型、响应模型，以及 Pydantic 支持的常见数据类型。
tags: [FastAPI, Response Model, Pydantic]
category: FastAPI
draft: false
comment: true
---

> 前面几篇主要都在看“输入”。这一篇换个方向，看 FastAPI 如何约束输出，以及 Pydantic 在类型层面到底给了我们哪些现成能力。

## 1. 响应模型的思路

在 FastAPI 里，响应模型和请求体模型其实是一体两面：

- 请求体模型：约束输入
- 响应模型：约束输出

最直接的写法，就是在返回类型上做类型注解：

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

这里的意义不是“写得好看”，而是：

- FastAPI 会知道接口返回什么结构
- 文档会自动展示这个响应 schema
- 如果返回数据结构不匹配，问题会更早暴露

## 2. 额外数据类型：不只是 `str/int/bool`

FastAPI 和 Pydantic 能直接处理的类型远不止基础类型。

你现在这部分笔记已经提到了几类最常见的：

- `UUID`
- `datetime.datetime`
- `datetime.date`
- `datetime.time`
- `datetime.timedelta`
- `frozenset`
- `bytes`
- `Decimal`

这些类型的价值在于：你不用再自己手动转来转去，FastAPI 会在请求与响应阶段帮你处理对应的表示形式。

例如：

- `datetime` 会按 ISO 8601 格式进出
- `UUID` 在 JSON 中通常表现为字符串
- `set` / `frozenset` 会体现为去重后的数组

## 3. Pydantic 类型能力可以分成几层

你当前笔记里已经把这件事总结得很清楚，我这里重新收一下结构：

### (1) Python 标准库类型

这是最常用的一层：

- `str`
- `int`
- `float`
- `bool`
- `bytes`
- `list[str]`
- `dict[str, int]`
- `set[int]`
- `str | None`
- `Literal`
- `Enum`
- `date / datetime / time / timedelta`
- `UUID / Decimal`

### (2) Pydantic 自带的额外类型

这类不是 Python 原生类型，但 Pydantic 直接支持，例如：

- `SecretStr`
- `SecretBytes`
- `JsonValue`

### (3) 网络与格式类类型

这类在 Web 开发里尤其常见：

- `EmailStr`
- `AnyUrl`
- 其它 URL / IP 相关类型

### (4) 自定义类型

这其实是最灵活的一层。比如：

```python3
from typing import Annotated
from pydantic import Field

PositiveInt = Annotated[int, Field(gt=0)]
```

这不是在声明一个全新的底层类型，而是在“已有类型 + 规则”的基础上做复用。

## 4. 为什么这部分重要

刚开始看 FastAPI 时，很容易把注意力全放在路径和请求体上，觉得“能收参数就行”。但响应模型和类型系统其实决定了两件更长期的事情：

1. 你的接口对外到底是否稳定
2. 你的自动文档是否可信

如果输入模型和输出模型都写清楚，那么：

- 前端更容易对接
- 文档更容易维护
- 接口演进更不容易失控

## 5. 当前这组 FastAPI 笔记到哪里为止

到这一篇为止，我目前的笔记已经把 FastAPI 的入门层核心走通了：

- 应用入口
- 异步直觉
- 路径参数 / 查询参数
- 请求体与模型
- 参数校验与来源
- 响应模型与类型系统

接下来如果继续往后学，最自然的延伸方向会是：

1. 状态码与错误处理
2. 表单和文件上传
3. 依赖注入
4. 安全与认证
5. 数据库
6. 多文件工程化
7. 部署

到那时，这一组 FastAPI 笔记就会真正从“入门”长成“可以拿来搭服务”的路线。
