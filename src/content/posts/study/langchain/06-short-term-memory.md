---
title: LangChain 核心组件 04：Short-term Memory
published: 2026-03-23
description: 把对话线程里的状态和历史真正留住，并学会在上下文有限时修剪、删除、总结消息。
tags: [LangChain, Memory]
category: LangChain
draft: false
comment: true
---

> 这一篇我放在 Tools 后面，是因为记忆本质上是在“模型 + 消息 + 工具调用”都成立之后，才真正开始变得重要。它处理的是对话变长之后的现实问题。

## 1. 介绍
记忆是一种能够记录过往交互信息的系统。对于智能体而言，记忆至关重要，因为它能让智能体记住过往的交互过程，从反馈中学习，并适应用户的偏好。当智能体处理涉及大量用户交互的复杂任务时，这项能力对于提升效率与用户满意度都不可或缺。

短期记忆可让应用程序在单一对话线程或对话中记住过往的交互内容。

对话历史是短期记忆最常见的形式。冗长的对话对当下的大语言模型构成挑战；完整的对话历史可能无法容纳于大语言模型的上下文窗口中，进而导致上下文丢失或错误。

即便你的模型支持完整的上下文长度，大多数大语言模型在处理长上下文时的表现依然不佳。它们会被过时或无关的内容“干扰”，同时还会面临响应速度变慢、成本升高的问题。

聊天模型通过Message接收上下文信息，这些消息包含指令（系统消息）和输入内容（用户消息）。在聊天应用中，消息会在用户输入与模型回复之间交替呈现，由此形成的消息列表会随着时间推移不断变长。由于上下文窗口存在限制，许多应用都可以借助相关技术来移除或“遗忘”过时信息。

## 2. 基本使用
要为智能体添加短期记忆（线程级持久化），你需要在创建智能体时指定一个checkpointer。

```python
from langchain.agents import create_agent
from langgraph.checkpoint.memory import InMemorySaver  


agent = create_agent(
    "gpt-5",
    tools=[get_user_info],
    checkpointer=InMemorySaver(),
)

agent.invoke(
    {"messages": [{"role": "user", "content": "Hi! My name is Bob."}]},
    {"configurable": {"thread_id": "1"}},
)
```

而在生产环境中，往往使用数据库支持的检查点保存器，如使用langgraph提供的和Postgres结合的包：
```python
pip install langgraph-checkpoint-postgres
```

然后，我们用如下语法连接数据库：
```python
from langchain.agents import create_agent

from langgraph.checkpoint.postgres import PostgresSaver  


DB_URI = "postgresql://postgres:postgres@localhost:5442/postgres?sslmode=disable"
with PostgresSaver.from_conn_string(DB_URI) as checkpointer:
    checkpointer.setup() # auto create tables in PostgreSQL
    agent = create_agent(
        "gpt-5",
        tools=[get_user_info],
        checkpointer=checkpointer,
    )
```

至于对更多数据库的支持，看[这里](https://docs.langchain.com/oss/python/langgraph/persistence#checkpointer-libraries)。

## 3. 自定义agent记忆
默认情况下，agents通过AgentState来管理短期记忆，比如直接用message键来查看对话历史。

但是，我们也可以给AgentState加入别的信息，自定义的state schemas会被传递给create_agent的state_schema参数。
```python
from langchain.agents import create_agent, AgentState
from langgraph.checkpoint.memory import InMemorySaver


class CustomAgentState(AgentState):
    user_id: str
    preferences: dict

agent = create_agent(
    "gpt-5",
    tools=[get_user_info],
    state_schema=CustomAgentState,
    checkpointer=InMemorySaver(),
)

# Custom state can be passed in invoke
result = agent.invoke(
    {
        "messages": [{"role": "user", "content": "Hello"}],
        "user_id": "user_123",
        "preferences": {"theme": "dark"}
    },
    {"configurable": {"thread_id": "1"}})
```

## 4. 超出上下文的解决方案
### (1) Trim messages
大多数大语言模型都有其支持的最大上下文窗口（以令牌为单位计量）。

判断何时截断消息的一种方法是统计消息历史中的令牌数量，当令牌数接近该上限时便进行截断。若你使用 LangChain 框架，可借助消息裁剪工具，指定需要保留的令牌数量，以及处理边界时所采用的strategy（例如保留最后max_tokens个令牌）。

若要在Agent中裁剪消息历史，可使用@before_model中间件装饰器，示例如下：
```python
from langchain.messages import RemoveMessage
from langgraph.graph.message import REMOVE_ALL_MESSAGES
from langgraph.checkpoint.memory import InMemorySaver
from langchain.agents import create_agent, AgentState
from langchain.agents.middleware import before_model
from langgraph.runtime import Runtime
from langchain_core.runnables import RunnableConfig
from typing import Any


@before_model
def trim_messages(state: AgentState, runtime: Runtime) -> dict[str, Any] | None:
    """Keep only the last few messages to fit context window."""
    messages = state["messages"]

    if len(messages) <= 3:
        return None  # No changes needed

    first_msg = messages[0]
    recent_messages = messages[-3:] if len(messages) % 2 == 0 else messages[-4:]
    new_messages = [first_msg] + recent_messages

    return {
        "messages": [
            RemoveMessage(id=REMOVE_ALL_MESSAGES),
            *new_messages
        ]
    }

agent = create_agent(
    your_model_here,
    tools=your_tools_here,
    middleware=[trim_messages],
    checkpointer=InMemorySaver(),
)

config: RunnableConfig = {"configurable": {"thread_id": "1"}}

agent.invoke({"messages": "hi, my name is bob"}, config)
agent.invoke({"messages": "write a short poem about cats"}, config)
agent.invoke({"messages": "now do the same but for dogs"}, config)
final_response = agent.invoke({"messages": "what's my name?"}, config)

final_response["messages"][-1].pretty_print()
"""
================================== Ai Message ==================================

Your name is Bob. You told me that earlier.
If you'd like me to call you a nickname or use a different name, just say the word.
"""
```

我们可以看到，trim_message方法被加上`@before_model`装饰器，放进了中间件（之前介绍过before_model的位置。这里使用了langgraph.graph.message的方法，REMOVE_ALL_MESSAGES。还是使用了一些高级用法，比如运行时，这里暂时不用看。

### (2) Delete message
这里使用RemoveMessage把消息从图中删掉
```python
from langchain.messages import RemoveMessage  

def delete_messages(state):
    messages = state["messages"]
    if len(messages) > 2:
        # remove the earliest two messages
        return {"messages": [RemoveMessage(id=m.id) for m in messages[:2]]}
```

如果是要删除所有消息，就按照trim message方案中那样：
```python
from langgraph.graph.message import REMOVE_ALL_MESSAGES  

def delete_messages(state):
    return {"messages": [RemoveMessage(id=REMOVE_ALL_MESSAGES)]}
```

给出一个完整删除最早期两个消息的过程：
```python
from langchain.messages import RemoveMessage
from langchain.agents import create_agent, AgentState
from langchain.agents.middleware import after_model
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.runtime import Runtime
from langchain_core.runnables import RunnableConfig


@after_model
def delete_old_messages(state: AgentState, runtime: Runtime) -> dict | None:
    """Remove old messages to keep conversation manageable."""
    messages = state["messages"]
    if len(messages) > 2:
        # remove the earliest two messages
        return {"messages": [RemoveMessage(id=m.id) for m in messages[:2]]}
    return None


agent = create_agent(
    "gpt-5-nano",
    tools=[],
    system_prompt="Please be concise and to the point.",
    middleware=[delete_old_messages],
    checkpointer=InMemorySaver(),
)

config: RunnableConfig = {"configurable": {"thread_id": "1"}}

for event in agent.stream(
    {"messages": [{"role": "user", "content": "hi! I'm bob"}]},
    config,
    stream_mode="values",
):
    print([(message.type, message.content) for message in event["messages"]])

for event in agent.stream(
    {"messages": [{"role": "user", "content": "what's my name?"}]},
    config,
    stream_mode="values",
):
    print([(message.type, message.content) for message in event["messages"]])
```

### (3) Summarize messages
如上所示，裁剪或删除消息的问题在于，消息队列的筛选操作可能会导致信息丢失。正因如此，部分应用采用更为复杂的方法，即借助对话模型对消息历史进行总结，从而获得更好的效果。
![alt text](/images/study/langchain/image-10.png)

我们使用SummarizationMiddleware中间件对历史对话进行总结，完整用法示例如下：
```python
from langchain.agents import create_agent
from langchain.agents.middleware import SummarizationMiddleware
from langgraph.checkpoint.memory import InMemorySaver
from langchain_core.runnables import RunnableConfig


checkpointer = InMemorySaver()

agent = create_agent(
    model="gpt-4.1",
    tools=[],
    middleware=[
        SummarizationMiddleware(
            model="gpt-4.1-mini",
            trigger=("tokens", 4000),
            keep=("messages", 20)
        )
    ],
    checkpointer=checkpointer,
)

config: RunnableConfig = {"configurable": {"thread_id": "1"}}
agent.invoke({"messages": "hi, my name is bob"}, config)
agent.invoke({"messages": "write a short poem about cats"}, config)
agent.invoke({"messages": "now do the same but for dogs"}, config)
final_response = agent.invoke({"messages": "what's my name?"}, config)

final_response["messages"][-1].pretty_print()
"""
================================== Ai Message ==================================

Your name is Bob!
"""
```

## 5. 访问记忆

可以通过多种方式访问和修改智能体的短期记忆（也叫state）。
### (1) 工具
在工具一节就详细介绍过，tool可以通过ToolRuntime来修改state的信息。下面我们直接贴官网的两个示例，一个是读取state，一个是写入state：
```python
from langchain.agents import create_agent, AgentState
from langchain.tools import tool, ToolRuntime


class CustomState(AgentState):
    user_id: str

@tool
def get_user_info(
    runtime: ToolRuntime
) -> str:
    """Look up user info."""
    user_id = runtime.state["user_id"]
    return "User is John Smith" if user_id == "user_123" else "Unknown user"

agent = create_agent(
    model="gpt-5-nano",
    tools=[get_user_info],
    state_schema=CustomState,
)

result = agent.invoke({
    "messages": "look up user information",
    "user_id": "user_123"
})
print(result["messages"][-1].content)
# > User is John Smith.
```

```python
from langchain.tools import tool, ToolRuntime
from langchain_core.runnables import RunnableConfig
from langchain.messages import ToolMessage
from langchain.agents import create_agent, AgentState
from langgraph.types import Command
from pydantic import BaseModel


class CustomState(AgentState):
    user_name: str

class CustomContext(BaseModel):
    user_id: str

@tool
def update_user_info(
    runtime: ToolRuntime[CustomContext, CustomState],
) -> Command:
    """Look up and update user info."""
    user_id = runtime.context.user_id
    name = "John Smith" if user_id == "user_123" else "Unknown user"
    return Command(update={
        "user_name": name,
        # update the message history
        "messages": [
            ToolMessage(
                "Successfully looked up user information",
                tool_call_id=runtime.tool_call_id
            )
        ]
    })

@tool
def greet(
    runtime: ToolRuntime[CustomContext, CustomState]
) -> str | Command:
    """Use this to greet the user once you found their info."""
    user_name = runtime.state.get("user_name", None)
    if user_name is None:
       return Command(update={
            "messages": [
                ToolMessage(
                    "Please call the 'update_user_info' tool it will get and update the user's name.",
                    tool_call_id=runtime.tool_call_id
                )
            ]
        })
    return f"Hello {user_name}!"

agent = create_agent(
    model="gpt-5-nano",
    tools=[update_user_info, greet],
    state_schema=CustomState,
    context_schema=CustomContext,
)

agent.invoke(
    {"messages": [{"role": "user", "content": "greet the user"}]},
    context=CustomContext(user_id="user_123"),
)
```

### (2) Prompt
在中间件中访问短期记忆（状态），基于对话历史或自定义状态字段生成动态提示词。

```python
from langchain.agents import create_agent
from typing import TypedDict
from langchain.agents.middleware import dynamic_prompt, ModelRequest


class CustomContext(TypedDict):
    user_name: str


def get_weather(city: str) -> str:
    """Get the weather in a city."""
    return f"The weather in {city} is always sunny!"


@dynamic_prompt
def dynamic_system_prompt(request: ModelRequest) -> str:
    user_name = request.runtime.context["user_name"]
    system_prompt = f"You are a helpful assistant. Address the user as {user_name}."
    return system_prompt


agent = create_agent(
    model="gpt-5-nano",
    tools=[get_weather],
    middleware=[dynamic_system_prompt],
    context_schema=CustomContext,
)

result = agent.invoke(
    {"messages": [{"role": "user", "content": "What is the weather in SF?"}]},
    context=CustomContext(user_name="John Smith"),
)
for msg in result["messages"]:
    msg.pretty_print()
```

如果你还有印象，这个`@dynamic_prompt`是专门调整提示词的装饰器，范围比直接before_model或者wrap_model_xxxx更小。

### (3) After model
在agent一章提到了这个部分，是在模型返回消息之后进行操作的钩子，当然也可以用于操作state。
```mermaid
%%{init: {
  "theme": "base",
  "themeVariables": {
    "fontFamily": "monospace"
  },
  "flowchart": {
    "curve": "basis"
  }
}}%%
graph TD
    S(["__start__"])
    MODEL(model)
    POST(after_model)
    TOOLS(tools)
    E(["__end__"])

    S --> MODEL
    MODEL --> POST
    POST -.-> E
    POST -.-> TOOLS
    TOOLS --> MODEL

    classDef blueHighlight fill:#DBEAFE,stroke:#2563EB,color:#1E3A8A;
    classDef greenHighlight fill:#DCFCE7,stroke:#16A34A,color:#14532D;
    classDef neutral fill:#F3F4F6,stroke:#9CA3AF,stroke-width:2px,color:#374151;

    class S blueHighlight;
    class E blueHighlight;
    class POST greenHighlight;
    class MODEL,TOOLS neutral;

```

这里提供一个示例，一看就懂了。这是触发STOP_WORDS的时候消除所有消息。
```python
from langchain.messages import RemoveMessage
from langgraph.checkpoint.memory import InMemorySaver
from langchain.agents import create_agent, AgentState
from langchain.agents.middleware import after_model
from langgraph.runtime import Runtime


@after_model
def validate_response(state: AgentState, runtime: Runtime) -> dict | None:
    """Remove messages containing sensitive words."""
    STOP_WORDS = ["password", "secret"]
    last_message = state["messages"][-1]
    if any(word in last_message.content for word in STOP_WORDS):
        return {"messages": [RemoveMessage(id=last_message.id)]}
    return None

agent = create_agent(
    model="gpt-5-nano",
    tools=[],
    middleware=[validate_response],
    checkpointer=InMemorySaver(),
)
```
