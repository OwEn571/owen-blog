---
title: FastAPI 组织逻辑：Depends、yield、错误处理与安全起步
published: 2026-03-27
description: 从 Depends 开始，把共享逻辑、yield 资源清理、HTTPException、自定义异常处理和 OAuth2PasswordBearer 串成一层。
tags: [FastAPI, Depends, Security]
category: FastAPI
draft: false
comment: true
---

前面几篇主要在搭“接口表层”。到了这里，FastAPI 开始真正长出工程味：共享逻辑、资源生命周期、认证入口和错误通道都在这一层。

## 1. `Depends` 在干什么

官方把依赖项单独拆成一章，这一章非常关键，因为 FastAPI 的很多高级能力都站在它上面。

```python3
from typing import Annotated
from fastapi import Depends, FastAPI

app = FastAPI()


async def common_parameters(q: str | None = None, skip: int = 0, limit: int = 100):
    return {"q": q, "skip": skip, "limit": limit}


@app.get("/items/")
async def read_items(commons: Annotated[dict, Depends(common_parameters)]):
    return commons


@app.get("/users/")
async def read_users(commons: Annotated[dict, Depends(common_parameters)]):
    return commons
```

这里可以直接把依赖注入理解成：

- 路径函数声明“我需要什么”
- FastAPI 负责先把这段逻辑跑完
- 再把结果注进来

它最值的地方在于复用：

- 共享查询参数
- 共享数据库会话
- 共享认证逻辑

## 2. `Depends` 里传的其实是可调用对象

官方文档明确提到，`Depends()` 里只接受一个参数，而且这个参数必须是可调用对象。你不需要自己加括号去调用它，FastAPI 会负责调用。  
来源：Dependencies 官方页 <https://fastapi.tiangolo.com/zh/tutorial/dependencies/>

所以依赖不一定非得是函数，也可以是类。

```python3
from typing import Annotated
from fastapi import Depends, FastAPI

app = FastAPI()


class CommonQueryParams:
    def __init__(self, q: str | None = None, skip: int = 0, limit: int = 100):
        self.q = q
        self.skip = skip
        self.limit = limit


@app.get("/items/")
async def read_items(
    commons: Annotated[CommonQueryParams, Depends(CommonQueryParams)],
):
    return {"q": commons.q, "skip": commons.skip, "limit": commons.limit}
```

这类写法的优势主要在于：

- 编辑器补全更自然
- 组织多参数依赖时更清楚

## 3. 子依赖和依赖缓存

依赖还可以继续依赖别的依赖：

```python3
from typing import Annotated
from fastapi import Cookie, Depends, FastAPI

app = FastAPI()


def query_extractor(q: str | None = None):
    return q


def query_or_cookie_extractor(
    q: Annotated[str | None, Depends(query_extractor)],
    last_query: Annotated[str | None, Cookie()] = None,
):
    if not q:
        return last_query
    return q


@app.get("/items/")
async def read_query(
    query_or_default: Annotated[str | None, Depends(query_or_cookie_extractor)],
):
    return {"q_or_cookie": query_or_default}
```

而且同一个请求里，FastAPI 不会重复计算同一个依赖结果，而是会缓存并复用。

## 4. 装饰器依赖和全局依赖

有些依赖不是为了把值注入进函数，而是为了让某个检查逻辑在进入路由前一定执行。这时可以放到装饰器上：

```python3
from typing import Annotated
from fastapi import Depends, FastAPI, Header, HTTPException

app = FastAPI()


async def verify_token(x_token: Annotated[str, Header()]):
    if x_token != "fake-super-secret-token":
        raise HTTPException(status_code=400, detail="X-Token header invalid")


@app.get("/items/", dependencies=[Depends(verify_token)])
async def read_items():
    return [{"item": "Foo"}, {"item": "Bar"}]
```

如果整个应用都需要某个依赖，也可以直接写到 `FastAPI(...)` 上。

## 5. `yield` 依赖：提供资源，也负责回收资源

你本地 19.md 这部分其实已经抓到重点了：`yield` 依赖不是返回一个值然后结束，而是先把值交出去，等请求处理完，再回来执行清理逻辑。

```python3
async def get_db():
    db = DBSession()
    try:
        yield db
    finally:
        db.close()
```

可以直接把它理解成：

- `yield` 前：准备资源
- `yield` 出去：把资源交给路径函数
- `yield` 后：做清理

最典型的场景就是数据库会话、文件句柄、临时连接。

## 6. 为什么 `try/finally` 总和 `yield` 一起出现

因为 `finally` 能保证：

- 即使中间抛异常
- 即使路径函数失败
- 清理逻辑也最终会执行

这一点在资源管理里很重要，不然连接和会话很容易泄漏。

## 7. 错误处理：先从 `HTTPException` 开始

```python3
from fastapi import FastAPI, HTTPException

app = FastAPI()

items = {"foo": "The Foo Wrestlers"}


@app.get("/items/{item_id}")
async def read_item(item_id: str):
    if item_id not in items:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"item": items[item_id]}
```

这是 FastAPI 最常见的错误出口。

如果只记一个点，那就是：

- `raise HTTPException(...)`

比手写响应对象更像“真正的错误通道”。

## 8. 自定义异常处理器

```python3
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class UnicornException(Exception):
    def __init__(self, name: str):
        self.name = name


app = FastAPI()


@app.exception_handler(UnicornException)
async def unicorn_exception_handler(request: Request, exc: UnicornException):
    return JSONResponse(
        status_code=418,
        content={"message": f"Oops! {exc.name} did something. There goes a rainbow..."},
    )
```

这一步意味着错误处理开始从“单个路由里的 if 判断”升级成“全局错误策略”。

## 9. 处理校验错误：`RequestValidationError`

当客户端输入数据不合法时，FastAPI 内部会抛出 `RequestValidationError`。这类错误也可以被接管：

```python3
from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import PlainTextResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

app = FastAPI()


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request, exc):
    return PlainTextResponse(str(exc.detail), status_code=exc.status_code)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc: RequestValidationError):
    message = "Validation errors:"
    for error in exc.errors():
        message += f"\\nField: {error['loc']}, Error: {error['msg']}"
    return PlainTextResponse(message, status_code=400)
```

官方还特别提到一个细节：

- 业务里抛错用 FastAPI 的 `HTTPException`
- 但注册异常处理器时，更适合注册 Starlette 的 `HTTPException`

因为这样连 Starlette 内部抛出的同类错误也能一起接住。  
来源：Handling Errors 官方页 <https://fastapi.tiangolo.com/zh/tutorial/handling-errors/>

## 10. 安全起步：`OAuth2PasswordBearer`

安全入门那一页最值得先记住的不是完整 OAuth2 流程，而是：

- FastAPI 把认证入口也做成了依赖

```python3
from fastapi import Depends, FastAPI
from fastapi.security import OAuth2PasswordBearer

app = FastAPI()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")


@app.get("/items/")
async def read_items(token: str = Depends(oauth2_scheme)):
    return {"token": token}
```

这里的 `tokenUrl="token"` 指向的是相对路径 `./token`，官方文档里专门解释了这一点。  
来源：Security First Steps 官方页 <https://fastapi.tiangolo.com/zh/tutorial/security/first-steps/>

一旦加上它，`/docs` 右上角就会出现 `Authorize` 按钮，交互文档会自动进入“可以带认证信息调试”的状态。

这一页最重要的意义，不是立刻把认证做完，而是先意识到：

- 安全在 FastAPI 里不是“外挂”
- 而是沿着依赖注入系统自然长出来的
