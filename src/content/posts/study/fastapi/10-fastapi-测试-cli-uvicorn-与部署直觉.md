---
title: FastAPI 验证与运行：Testing、CLI、Uvicorn 与 Workers
published: 2026-03-24
description: 把测试、调试、fastapi CLI、uvicorn、手动运行和 workers 收到一起，形成一条更完整的“本地开发到部署”的路径。
tags: [FastAPI, Testing, Uvicorn, Deployment]
category: FastAPI
draft: false
comment: true
---

如果前面的内容是在搭接口本身，这一篇就是在补“怎么确认它是对的，以及怎么把它跑起来”。

## 1. `TestClient`：为什么测试可以写成普通 `def`

官方测试页给的最小例子非常清楚：

```python3
from fastapi import FastAPI
from fastapi.testclient import TestClient

app = FastAPI()


@app.get("/")
async def read_main():
    return {"msg": "Hello World"}


client = TestClient(app)


def test_read_main():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"msg": "Hello World"}
```

官方特别提醒了两点：

- 测试函数可以是普通 `def`
- `client.get()` 也是普通调用，不需要 `await`

这让你可以直接用 `pytest`，不会一上来就卡在异步测试细节里。  
来源：Testing 官方页 <https://fastapi.tiangolo.com/zh/tutorial/testing/>

## 2. 测试文件通常怎么放

官方示例里常见的是：

```text
app/
├── __init__.py
├── main.py
└── test_main.py
```

这样 `test_main.py` 可以直接相对导入：

```python
from .main import app
```

如果项目结构更大，也可以把测试单独放到 `tests/` 目录，但第一次入门时，先把测试贴着应用写更容易理解。

## 3. `fastapi dev` 是开发模式

开发时，最顺手的仍然是：

```bash
fastapi dev
```

或者：

```bash
fastapi dev main.py
```

如果没传路径，CLI 会尝试自动找应用；如果传了路径，它会按路径推断应用对象。官方也说明了，长期来看更推荐在 `pyproject.toml` 里配置 `entrypoint`，这样工具链更稳定。  
来源：First Steps / FastAPI CLI 官方页  
<https://fastapi.tiangolo.com/zh/tutorial/first-steps/>  
<https://fastapi.tiangolo.com/zh/fastapi-cli/>

## 4. `fastapi run` 是生产模式入口

官方 CLI 页明确写到：

- `fastapi dev`：开发模式
- `fastapi run`：生产模式

而且 FastAPI CLI 内部实际就是基于 Uvicorn 来跑应用。  
来源：FastAPI CLI 官方页 <https://fastapi.tiangolo.com/zh/fastapi-cli/>

也就是说，FastAPI 没有发明一套独立服务器，而是在 CLI 层帮你把 Uvicorn 这类 ASGI 服务器包起来了。

## 5. 手动运行为什么还是要懂 `uvicorn main:app`

官方手动运行页给出的最核心命令是：

```bash
uvicorn main:app --host 0.0.0.0 --port 80
```

这个字符串一定要能看懂：

- `main`：`main.py`
- `app`：文件里的 `app = FastAPI()` 对象

它等价于：

```python
from main import app
```

所以 `uvicorn main:app` 的本质，就是告诉 ASGI 服务器“去哪里导入应用”。  
来源：手动运行服务器官方页 <https://fastapi.tiangolo.com/zh/deployment/manually/>

## 6. `fastapi dev`、`fastapi run`、`uvicorn main:app` 应该怎么选

可以直接按场景分：

- 本地开发：`fastapi dev`
- 想直接操作底层服务器：`uvicorn main:app`
- 更接近生产的 FastAPI CLI 启动：`fastapi run`

如果只是平时写代码，`fastapi dev` 最省心。  
如果要真正理解部署、容器和 server process，`uvicorn main:app` 一定要看懂。

## 7. `--reload` 的位置

`--reload` 只适合开发阶段。

```bash
uvicorn main:app --reload
```

它的意义是：

- 文件变化后自动重启

它不是生产特性，而是开发便利。

## 8. 为什么还会在代码里写 `uvicorn.run(app, ...)`

你本地 21.md 里记的是这种方式：

```python3
import uvicorn
from fastapi import FastAPI

app = FastAPI()


@app.get("/")
def root():
    return {"hello world": "ok"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

这类写法最适合：

- 本地点一下文件直接调试
- 临时验证逻辑
- 不想切回终端敲命令

但它更像“调试入口”，不是长期部署约定。

## 9. Workers：多进程是什么时候开始重要

官方 Workers 页给出的典型命令是：

```bash
uvicorn main:app --host 0.0.0.0 --port 8080 --workers 4
```

来源：Workers 官方页 <https://fastapi.tiangolo.com/zh/deployment/server-workers/>

这里的意思是：

- 启动多个 worker 进程
- 用多个进程共同处理请求

这通常和生产部署有关，而不是入门开发阶段就要立刻开。

第一次学时更值得先记住的是：

- 单进程开发跑通
- 理解 CLI 和 Uvicorn 的关系
- 再去看 workers、多进程、容器和反向代理

## 10. 从本地到部署，这一层真正连起来的是什么

这一篇其实是在把几条原本散落的线收起来：

- 怎么测试
- 怎么调试
- 怎么启动
- 怎么理解 CLI
- 怎么理解 Uvicorn
- 怎么理解 workers

当这些线连起来之后，FastAPI 才算真的从“写几个接口”走向“能把服务稳稳跑起来”。
