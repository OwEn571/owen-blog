---
title: LangGraph 核心能力 06：Memory 短期与长期记忆
published: 2026-03-29
description: 短期记忆通过 checkpoint 让图“记住”，长期记忆通过 Store 跨线程保存用户信息与语义检索。
tags: [LangGraph, Memory, Store]
category: LangGraph
draft: false
comment: true
---

# LangGraph能力 - Memory
人工智能应用需要记忆来在多次交互间共享上下文。在LangGraph中，你可以添加两种类型的记忆：
- 添加短期记忆作为智能体状态的一部分，以实现多轮对话。
- 添加长期记忆以跨会话存储用户专属或应用级别的数据。

## 1. 短期记忆

短期记忆，我们应该在LangChain的Short-term Memory和前面的持久化、时间旅行中已经很清晰知道了。现在我们补充一个在生成环境下使用的简单例子：
```python
from langgraph.checkpoint.postgres import PostgresSaver

DB_URI = "postgresql://postgres:postgres@localhost:5442/postgres?sslmode=disable"
with PostgresSaver.from_conn_string(DB_URI) as checkpointer:
    builder = StateGraph(...)
    graph = builder.compile(checkpointer=checkpointer)
```
这段代码是连接Postgres来存checkpoint，它的意义是把 thread 内状态变成可持久、可恢复、可生产使用。不过从LangGraph的概念上来说，这还是属于短期/线程内记忆。

还有一点，如果你的图中包含子图，只需在编译父图时提供检查点工具即可。LangGraph 会自动将检查点工具传递给子图。


## 2. 长期记忆
在前面持久化的章节中，我们说明了Store是负责跨线程共享长期记忆的结构，其中数据按命名空间组织，通过runtime注入读写，并可以支持自然语言query搜索记忆。

当你使用存储（store）编译图结构时，LangGraph 会自动将存储注入到你的节点函数中。推荐的访问存储方式是通过 Runtime 对象，下面是一个简单示例：
```python
from dataclasses import dataclass
from langgraph.runtime import Runtime
from langgraph.graph import StateGraph, MessagesState, START
import uuid

@dataclass
class Context:
    user_id: str

async def call_model(state: MessagesState, runtime: Runtime[Context]):
    user_id = runtime.context.user_id  
    namespace = (user_id, "memories")

    # Search for relevant memories
    memories = await runtime.store.asearch(
        namespace, query=state["messages"][-1].content, limit=3
    )
    info = "\n".join([d.value["data"] for d in memories])

    # ... Use memories in model call

    # Store a new memory
    await runtime.store.aput(
        namespace, str(uuid.uuid4()), {"data": "User prefers dark mode"}
    )

builder = StateGraph(MessagesState, context_schema=Context)
builder.add_node(call_model)
builder.add_edge(START, "call_model")
graph = builder.compile(store=store)

# Pass context at invocation time
graph.invoke(
    {"messages": [{"role": "user", "content": "hi"}]},
    {"configurable": {"thread_id": "1"}},
    context=Context(user_id="1"),
)
```

同样，生产级使用的时候，我们会用一个数据库：
```python
from langgraph.store.postgres import PostgresStore

DB_URI = "postgresql://postgres:postgres@localhost:5442/postgres?sslmode=disable"
with PostgresStore.from_conn_string(DB_URI) as store:
    builder = StateGraph(...)
    graph = builder.compile(store=store)
```

前面提到过的semantic搜索，借助嵌入模型实现：
```python
from langchain.embeddings import init_embeddings
from langgraph.store.memory import InMemoryStore

# Create store with semantic search enabled
embeddings = init_embeddings("openai:text-embedding-3-small")
store = InMemoryStore(
    index={
        "embed": embeddings,
        "dims": 1536,
    }
)

store.put(("user_123", "memories"), "1", {"text": "I love pizza"})
store.put(("user_123", "memories"), "2", {"text": "I am a plumber"})

items = store.search(
    ("user_123", "memories"), query="I'm hungry", limit=1
)
```

store.search是一个高层的API，面向LangGraph的长期记忆。InMemoryStore搜索的时候会用 embed_query(...) 生成查询向量，调 _cosine_similarity(...) 计算分数，不过不要随便推广，自然语言搜索是否支持、怎么做，依赖具体 store implementation。LangGraph 官方提供的是 BaseStore 抽象，以及像 InMemoryStore、AsyncSqliteStore、内置 Postgres store 这类实现，如果要用store后端用Milvus，通常要自己实现一个BaseStore。


## 3. 管理短期记忆
启用短期记忆后，随着对话变长，`messages` 很容易超过模型上下文窗口。这一部分其实已经在LangChain的Short-term Memory中整理过，不过我们再来看看LangGraph的写法，官方给出的常见处理方式有：
- Trim messages：在调用模型前截断消息，只保留最近一部分上下文。
- Delete messages：从图状态中永久删除某些消息。
- Summarize messages：把更早的消息总结成摘要，再替换原始消息。
- Manage checkpoints：直接查看和管理 thread 的 checkpoint 历史。
- Custom strategies：例如按角色过滤消息、只保留最近几轮工具调用等。

### 3.1 Trim messages
最简单的做法是在真正调用模型前，对 `messages` 做裁剪。官方推荐可以借助 LangChain 的 `trim_messages` 工具，按 token 数量保留最后一段上下文。

```python
from langchain_core.messages.utils import (
    trim_messages,
    count_tokens_approximately,
)

def call_model(state: MessagesState):
    messages = trim_messages(
        state["messages"],
        strategy="last",
        token_counter=count_tokens_approximately,
        max_tokens=128,
        start_on="human",
        end_on=("human", "tool"),
    )
    response = model.invoke(messages)
    return {"messages": [response]}
```

其中常见参数含义：
- `strategy="last"`：优先保留最新消息。
- `max_tokens`：裁剪后的消息总 token 上限。
- `start_on="human"`：尽量让裁剪后的历史从用户消息开始。
- `end_on=("human", "tool")`：裁剪边界尽量落在合法消息类型上。

这种方法的优点是简单直接，缺点是早期信息会被丢弃。

### 3.2 Delete messages
如果你不是“临时裁剪后喂给模型”，而是希望真正从图状态中删掉某些旧消息，可以返回 `RemoveMessage`。这会永久修改短期记忆。

```python
from langchain.messages import RemoveMessage

def delete_messages(state: MessagesState):
    messages = state["messages"]
    if len(messages) > 2:
        return {
            "messages": [RemoveMessage(id=m.id) for m in messages[:2]]
        }
    return {}
```

注意：
- 这种方式要求 `messages` 使用 `add_messages` reducer，也就是通常使用 `MessagesState` 或 `messages: Annotated[list, add_messages]`。
- 删除后仍要保证消息历史合法。比如有些模型要求消息历史以 `human` 开始；如果前面有 tool call，对应的 `ToolMessage` 也不能删乱。

### 3.3 Summarize messages
只裁剪和删除会丢失信息，所以更实用的方式是：把旧消息总结成一段摘要，然后只保留最近几条原始消息。

```python
from langchain.messages import HumanMessage, RemoveMessage
from langgraph.graph import MessagesState

class State(MessagesState):
    summary: str

def summarize_conversation(state: State):
    summary = state.get("summary", "")

    if summary:
        summary_message = (
            f"This is a summary of the conversation to date: {summary}\n\n"
            "Extend the summary by taking into account the new messages above:"
        )
    else:
        summary_message = "Create a summary of the conversation above:"

    messages = state["messages"] + [HumanMessage(content=summary_message)]
    response = model.invoke(messages)

    delete_messages = [RemoveMessage(id=m.id) for m in state["messages"][:-2]]
    return {
        "summary": response.content,
        "messages": delete_messages,
    }
```

这个模式的核心思想是：
- `summary` 单独作为 state 的一个键长期保留。
- 新摘要会在旧摘要基础上继续扩展，而不是每次从零总结。
- 原始消息不需要全部保留，只保留最近几条高价值上下文即可。

所以可以把它理解成：
- `messages`：保存最近的原始上下文
- `summary`：保存更早历史的压缩版本

### 3.4 管理 checkpoints
短期记忆本质上就是 thread 级别的 checkpoint 状态，因此也可以直接通过 checkpoint API 查看。
