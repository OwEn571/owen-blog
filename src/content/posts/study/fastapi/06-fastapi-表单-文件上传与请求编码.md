---
title: FastAPI 请求编码切换：表单、文件上传与 UploadFile
published: 2026-03-28
description: 从 JSON 切到 multipart/form-data，把 Form、File、UploadFile、表单模型和多文件上传一并收进请求编码这一层。
tags: [FastAPI, Form, UploadFile]
category: FastAPI
draft: false
comment: true
---

到这里最容易产生的误解是：好像“FastAPI 接请求”就等于“FastAPI 收 JSON”。其实不是。只要开始碰登录表单、图片上传、附件上传，请求编码就已经切到另一层了。

## 1. 为什么上传文件一定会牵涉到表单

JSON 和表单最大的区别不是语法，而是使用场景：

- JSON：更适合结构化数据交换
- `multipart/form-data`：适合文本字段 + 二进制文件一起传

所以一旦接口里要上传文件，几乎就等于在说：这次请求不会是普通 JSON，而会是表单编码。

## 2. 用 `Form` 接收表单字段

```python3
from typing import Annotated
from fastapi import FastAPI, Form

app = FastAPI()


@app.post("/login/")
async def login(
    username: Annotated[str, Form()],
    password: Annotated[str, Form()],
):
    return {"username": username}
```

这里的重点不是“又多学一个函数”，而是明确告诉 FastAPI：

- 这两个参数不是从 JSON 里读
- 而是从表单字段里读

如果项目里要收表单数据，需要先安装：

```bash
pip install python-multipart
```

## 3. 表单也可以建模

```python3
from typing import Annotated
from fastapi import FastAPI, Form
from pydantic import BaseModel

app = FastAPI()


class FormData(BaseModel):
    username: str
    password: str


@app.post("/login/")
async def login(data: Annotated[FormData, Form()]):
    return data
```

这一点很值，因为它说明：

- 表单字段不是“只能散着收”
- 也能继续走模型化这条路

## 4. 文件上传：`bytes` 和 `UploadFile`

```python3
from typing import Annotated
from fastapi import FastAPI, File, UploadFile

app = FastAPI()


@app.post("/files/")
async def create_file(file: Annotated[bytes, File()]):
    return {"file_size": len(file)}


@app.post("/uploadfile/")
async def create_upload_file(file: UploadFile):
    return {"filename": file.filename}
```

这两种写法都能收文件，但语义不一样：

- `bytes`：FastAPI 直接把整个文件读进内存
- `UploadFile`：给你一个更适合处理文件流的大文件接口

## 5. 为什么 `UploadFile` 更常用

你在本地笔记里把它写得很清楚，核心优势有这些：

- 文件先在内存里缓冲，超过阈值后会落盘
- 更适合图片、视频、大文件
- 能拿到元数据，比如 `filename`、`content_type`
- 提供异步文件方法
- 底层暴露的是真正的 file-like 对象

所以简单记法是：

- 小文件、只想马上拿内容：`bytes`
- 更真实的上传场景：`UploadFile`

## 6. `UploadFile` 常用属性和方法

最常用的属性：

- `filename`
- `content_type`
- `file`

最常用的方法：

- `await file.read()`
- `await file.write(data)`
- `await file.seek(0)`
- `await file.close()`

尤其是 `seek(0)`，在“已经读过一次，还想再从头处理”的场景里很常见。

## 7. 同时接表单和文件

```python3
from typing import Annotated
from fastapi import FastAPI, File, Form, UploadFile

app = FastAPI()


@app.post("/files/")
async def create_file(
    file: Annotated[bytes, File()],
    fileb: Annotated[UploadFile, File()],
    token: Annotated[str, Form()],
):
    return {
        "file_size": len(file),
        "token": token,
        "fileb_content_type": fileb.content_type,
    }
```

这就是表单编码最常见的真实场景：

- 文本字段
- 一个或多个文件
- 一次请求一起提交

## 8. 多文件上传和可选文件

文件参数也能继续做扩展：

- 可选文件：给默认值 `None`
- 多文件上传：声明成 `list[UploadFile]`
- 即便是 `UploadFile`，也能继续在 `File()` 里补元信息

所以它的使用方式和前面学过的 `Body / Query / Form` 很一致，只不过这次载体换成了文件。

## 9. 从请求流角度看这一层

到这里，其实不是又学了三个新 API，而是把“请求编码”这个层补完整了：

- URL 参数：路径和查询
- JSON 请求体：Pydantic 模型
- 表单和文件：`Form / File / UploadFile`

这样你后面再看认证表单、头像上传、附件接口，就不会觉得这些接口是完全不同的一套东西。
