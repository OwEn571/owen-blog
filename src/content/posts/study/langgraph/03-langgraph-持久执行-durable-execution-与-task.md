---
title: LangGraph 核心能力 02：Durable Execution 与 task 封装
published: 2026-04-02
description: 理解 LangGraph 为什么强调 durable execution，以及为什么把副作用包进 task 会比直接写在 node 里更稳。
tags: [LangGraph, Durable Execution, Task]
category: LangGraph
draft: false
comment: true
---

> 这篇最值得记住的一句话是：LangGraph 的恢复不是从“代码那一行”继续，而是从某个可回放起点重新执行。

持久执行是一种技术，进程或工作流会在关键节点保存进度，使其能够暂停，并在后续从断点处精准恢复执行。该技术在需要human-in-loop的场景中尤为实用 —— 用户可在流程继续前进行检查、验证或修改；同时也适用于可能遭遇中断或错误的长时间运行任务（例如调用大模型超时）。通过保留已完成的工作，持久执行可让进程无需重复处理先前步骤即可恢复，即便间隔时间较长（例如一周后）也能实现。

LangGraph 内置的持久化层为工作流提供持久执行能力，确保每个执行步骤的状态都保存至持久化存储中。这一特性保证，无论工作流是因系统故障中断，还是为了human-in-loop交互而暂停，都能从最后记录的状态恢复执行。

值得注意的是，只要用了 checkpointer，就已经开启 durable execution，但是恢复时不是从“代码那一行”继续，而是从某个可重放起点重跑到中断处。所以要把“副作用/不确定操作”（API 调用、写文件、随机数）包进 task，并尽量做幂等。另外，选择durability 模式：exit / async / sync。

提一下幂等(idempotent)，它是指同一个操作执行 1 次和执行多次，结果一样。比如把用户语言设置为 zh 就是幂等的，而余额+100则是非幂等的。你在 LangGraph durable execution 里会遇到它，是因为失败重试/回放可能重复执行。

解决操作不幂等的常见解法，是给一次业务操作生成唯一的幂等键（idempotency_key），下游根据key去重。

## 示例对比：直接在 node 中请求 vs 用 `@task` 封装请求
这两段代码核心区别，在这里。

```python
from typing import NotRequired
from typing_extensions import TypedDict
import uuid

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import StateGraph, START, END
import requests

# Define a TypedDict to represent the state
class State(TypedDict):
    url: str
    result: NotRequired[str]

def call_api(state: State):
    """Example node that makes an API request."""
    result = requests.get(state['url']).text[:100]  # Side-effect  #
    return {
        "result": result
    }

# Create a StateGraph builder and add a node for the call_api function
builder = StateGraph(State)
builder.add_node("call_api", call_api)

# Connect the start and end nodes to the call_api node
builder.add_edge(START, "call_api")
builder.add_edge("call_api", END)

# Specify a checkpointer
checkpointer = InMemorySaver()

# Compile the graph with the checkpointer
graph = builder.compile(checkpointer=checkpointer)

# Define a config with a thread ID.
thread_id = uuid.uuid4()
config = {"configurable": {"thread_id": thread_id}}

# Invoke the graph
graph.invoke({"url": "https://www.example.com"}, config)
```
```python
from typing import NotRequired
from typing_extensions import TypedDict
import uuid

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.func import task
from langgraph.graph import StateGraph, START, END
import requests

# Define a TypedDict to represent the state
class State(TypedDict):
    urls: list[str]
    result: NotRequired[list[str]]


@task
def _make_request(url: str):
    """Make a request."""
    return requests.get(url).text[:100]

def call_api(state: State):
    """Example node that makes an API request."""
    requests = [_make_request(url) for url in state['urls']]
    results = [request.result() for request in requests]
    return {
        "results": results
    }

# Create a StateGraph builder and add a node for the call_api function
builder = StateGraph(State)
builder.add_node("call_api", call_api)

# Connect the start and end nodes to the call_api node
builder.add_edge(START, "call_api")
builder.add_edge("call_api", END)

# Specify a checkpointer
checkpointer = InMemorySaver()

# Compile the graph with the checkpointer
graph = builder.compile(checkpointer=checkpointer)

# Define a config with a thread ID.
thread_id = uuid.uuid4()
config = {"configurable": {"thread_id": thread_id}}

# Invoke the graph
graph.invoke({"urls": ["https://www.example.com"]}, config)
```

| 对比维度 | 直接在 node 里 `requests.get()` | 用 `@task` 封装 `_make_request()` |
| --- | --- | --- |
| 副作用位置 | 副作用直接写在 node 内 | 副作用被隔离到 task 内 |
| 恢复/重放时行为 | node 可能被重放，副作用可能重复触发 | 已成功完成的 task 结果可被复用，减少重复副作用 |
| 失败恢复粒度 | 粒度较粗，通常按 node 重新执行 | 粒度更细，按 task 级别恢复更可控 |
| 代码组织 | 简单直接，但不利于 durable 场景 | 结构更清晰，适合长流程和容错 |
| 推荐场景 | 一次性、无副作用、演示代码 | 生产或半生产，涉及 API/IO/不确定操作 |

## 为什么官方推荐第二种
在 durable execution 中，恢复不是回到某一行代码，而是从某个可重放起点继续。  
如果副作用写在 node 里，重放时容易重复调用外部 API。  
把副作用放进 `@task`，可以让 LangGraph 更好地记录和复用已完成工作，减少重复执行风险。

## 这两个例子的结论
1. 第一段代码可运行，但更像“最小示例”，适合理解流程。
2. 第二段代码是 durable execution 更推荐的写法，尤其是有外部 API 调用时。
3. 即便用了 task，也应尽量保证调用幂等（例如带幂等键），因为失败重试时仍可能重跑未成功完成的 task。

## 小修正（你的第二段代码）
`State` 里写的是 `result: NotRequired[list[str]]`，但返回值是 `{"results": results}`。  
字段名建议统一为一个，例如都用 `results`，避免状态键不一致。
