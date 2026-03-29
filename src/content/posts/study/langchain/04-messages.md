---
title: LangChain 核心组件 02：Messages
published: 2026-03-25
description: 理清 LangChain 里最核心的数据单位：不同消息类型、内容块、多模态输入，以及它们为什么是模型上下文的基础。
tags: [LangChain, Messages]
category: LangChain
draft: false
comment: true
---

> 官方文档里 Messages 放在 Models 后面、但 Agents 前面，而且很多地方又提前引用它。我这里把它明确放在第二个组件位置，因为模型真正吃进去的上下文，本质上就是消息。

## 1. 介绍
消息是 LangChain 中模型上下文的基本单元，它们代表模型的输入与输出，在与大语言模型交互时，承载着表征对话状态所需的内容和元数据。

消息是包含以下内容的对象：
- 角色 - 标识消息类型（例如 系统、用户）
- 内容 - 表示消息的实际内容（如文本、图像、音频、文档等）
- 元数据 - 可选字段，例如响应信息、消息 ID 和令牌使用量
  
LangChain 提供了适用于所有模型提供商的标准消息类型，确保无论调用何种模型，行为都保持一致。

## 2. 基础使用
最简单的应用方法就是invoke模型（或者agent）的时候传入，下面给了用messages包里的传入方法，也可以直接像之前一样写成一个字典：
```python
from langchain.chat_models import init_chat_model
from langchain.messages import HumanMessage, AIMessage, SystemMessage

model = init_chat_model("gpt-5-nano")

system_msg = SystemMessage("You are a helpful assistant.")
human_msg = HumanMessage("Hello, how are you?")

# Use with chat models
messages = [system_msg, human_msg]
response = model.invoke(messages)  # Returns AIMessage
```

### (1) 文本提示词
文本提示词是字符串 —— 非常适合无需保留对话历史的简单生成任务。调用也很简单：
```python
response = model.invoke("Write a haiku about spring")
```
### (2) 消息提示词
或者，你也可以通过提供消息对象列表的方式，向模型传入一组消息。
```python
from langchain.messages import SystemMessage, HumanMessage, AIMessage

messages = [
    SystemMessage("You are a poetry expert"),
    HumanMessage("Write a haiku about spring"),
    AIMessage("Cherry blossoms bloom...")
]
response = model.invoke(messages)
```
只有这样，才能启动多轮对话、加入多模态内容、加入系统提示等。

### (3) 字典形式
只是(2)的一种变体，一般写这个更方便：
```python
messages = [
    {"role": "system", "content": "You are a poetry expert"},
    {"role": "user", "content": "Write a haiku about spring"},
    {"role": "assistant", "content": "Cherry blossoms bloom..."}
]
response = model.invoke(messages)
```

## 3. 消息类型 (Message types)
- System message - 告知模型行为方式并为交互提供上下文
- Human message  - 代表用户输入以及与模型的交互
- AI message  - 由模型生成的响应，包含文本内容、工具调用和元数据
- Tool message - 代表工具调用的输出结果

### (1) System message
SystemMessage是一组初始指令，用于设定模型的行为模式。你可以通过系统消息来设定沟通基调、定义模型角色，并制定回复准则，如下：
```python
from langchain.messages import SystemMessage, HumanMessage

system_msg = SystemMessage("""
You are a senior Python developer with expertise in web frameworks.
Always provide code examples and explain your reasoning.
Be concise but thorough in your explanations.
""")

messages = [
    system_msg,
    HumanMessage("How do I create a REST API?")
]
response = model.invoke(messages)
```

### (2) Human message
HumanMessage代表用户的输入与交互行为。它们可以包含文本、图像、音频、文件以及任意数量的多模态内容。
```python
response = model.invoke([
  HumanMessage("What is machine learning?")
])
```

也可以给消息添加一些元数据。这个部分需要查看运营商具体支持的字段，如：
```python
human_msg = HumanMessage(
    content="Hello!",
    name="alice",  # Optional: identify different users
    id="msg_123",  # Optional: unique identifier for tracing
)
```

### (3) AI message
AIMessage代表模型调用的输出结果。它们可以包含多模态数据、工具调用以及可供后续访问的服务提供商专属元数据。我们上一章已经拆解过AIMessage里面都有什么了，这里不再细说。

需要注意一点就是不同服务提供方对消息类型的权重分配与语境处理方式各不相同，这意味着有时手动创建一个新的AIMessage对象，并将其插入消息历史中，使其看起来像是由模型生成的，会很有帮助，比如：
```python
from langchain.messages import AIMessage, SystemMessage, HumanMessage

# Create an AI message manually (e.g., for conversation history)
ai_msg = AIMessage("I'd be happy to help you with that question!")

# Add to conversation history
messages = [
    SystemMessage("You are a helpful assistant"),
    HumanMessage("Can you help me?"),
    ai_msg,  # Insert as if it came from the model
    HumanMessage("Great! What's 2+2?")
]

response = model.invoke(messages)
```

### (4) Tool message
对于支持工具调用的模型，AI 消息可以包含工具调用。工具消息用于将单次工具执行的结果回传给模型。

不过工具可以直接生成ToolMessage对象。下面我们展示一个简单示例，具体在Tool那一章细说：
```python
from langchain.messages import AIMessage
from langchain.messages import ToolMessage

# After a model makes a tool call
# (Here, we demonstrate manually creating the messages for brevity)
ai_message = AIMessage(
    content=[],
    tool_calls=[{
        "name": "get_weather",
        "args": {"location": "San Francisco"},
        "id": "call_123"
    }]
)

# Execute tool and create result message
weather_result = "Sunny, 72°F"
tool_message = ToolMessage(
    content=weather_result,
    tool_call_id="call_123"  # Must match the call ID
)

# Continue conversation
messages = [
    HumanMessage("What's the weather in San Francisco?"),
    ai_message,  # Model's tool call
    tool_message,  # Tool execution result
]
response = model.invoke(messages)  # Model processes the result
```

## 4. 消息内容 (Message content)

你可以将消息的内容视作发送给模型的数据载荷。消息具备content属性，该属性为松散类型，支持字符串以及无类型对象列表（如字典）。这使得 LangChain 聊天模型能够直接兼容服务商原生结构，例如多模态内容及其他数据。

此外，LangChain 还为文本、推理、引用、多模态数据、服务端工具调用及其他消息内容提供了专用的内容类型。详见下方的content block的说明。

LangChain 聊天模型通过content属性接收消息内容。
该属性可包含以下任一形式：
- 字符串
- 服务商原生格式的内容块列表
- LangChain 标准内容块的列表

这里提供一个多模态的例子：
```python
from langchain.messages import HumanMessage

# String content
human_message = HumanMessage("Hello, how are you?")

# Provider-native format (e.g., OpenAI)
human_message = HumanMessage(content=[
    {"type": "text", "text": "Hello, how are you?"},
    {"type": "image_url", "image_url": {"url": "https://example.com/image.jpg"}}
])

# List of standard content blocks
human_message = HumanMessage(content_blocks=[
    {"type": "text", "text": "Hello, how are you?"},
    {"type": "image", "url": "https://example.com/image.jpg"},
])
```

### (1) 标准内容块 (Standard content blocks)
消息对象实现了 content_blocks 属性，该属性会惰性解析 content 属性，将其转换为标准的类型安全表示形式。例如，由 ChatAnthropic 或 ChatOpenAI 生成的消息会包含对应服务商格式的 thinking 或 reasoning 内容块，但可被惰性解析为统一的 ReasoningContentBlock表示形式：

```python
from langchain.messages import AIMessage

message = AIMessage(
    content=[
        {
            "type": "reasoning",
            "id": "rs_abc123",
            "summary": [
                {"type": "summary_text", "text": "summary 1"},
                {"type": "summary_text", "text": "summary 2"},
            ],
        },
        {"type": "text", "text": "...", "id": "msg_abc123"},
    ],
    response_metadata={"model_provider": "openai"}
)
print(message.content_blocks)
```
打印结果如下，证明被成功解析。

```
[{'type': 'reasoning', 'id': 'rs_abc123', 'reasoning': 'summary 1'},
 {'type': 'reasoning', 'id': 'rs_abc123', 'reasoning': 'summary 2'},
 {'type': 'text', 'text': '...', 'id': 'msg_abc123'}]
```

### (2) 多模态
多模态指的是处理文本、音频、图像和视频等不同形式数据的能力。LangChain 包含可在不同服务提供商之间通用的此类数据标准类型。

聊天模型能够接收多模态数据作为输入，并将其生成为输出。我们只需要简单的将content的类型设置成需要的类型，比如text、image、file（pdf）、audio、video等。前面不少地方都举过例子。

### (3) Content block reference

`content_blocks` 是 LangChain v1 引入的标准化消息内容表示方式。  
它不是对 `content` 的替代，而是把不同 Provider 的消息内容统一整理成一组带类型的字典，便于跨模型访问和处理。

每个 block 都会带一个 `type` 字段，常见类型可以分为下面几类。

#### 1. Core
最基础的内容类型。

- `text`  
  标准文本内容。  
  常见字段包括：
  - `type="text"`
  - `text`
  - `annotations`
  - `extras`

- `reasoning`  
  模型的推理内容。  
  常见字段包括：
  - `type="reasoning"`
  - `reasoning`
  - `extras`

#### 2. Multimodal
用于多模态输入或输出。

- `image`  
  图片内容。常见字段：
  - `type="image"`
  - `url` / `base64`
  - `id`
  - `mime_type`

- `audio`  
  音频内容。常见字段：
  - `type="audio"`
  - `url` / `base64`
  - `id`
  - `mime_type`

- `video`  
  视频内容。常见字段：
  - `type="video"`
  - `url` / `base64`
  - `id`
  - `mime_type`

- `file`  
  通用文件内容，例如 PDF。常见字段：
  - `type="file"`
  - `url` / `base64`
  - `id`
  - `mime_type`

- `text-plain`  
  纯文本文档内容，例如 `.txt`、`.md`。常见字段：
  - `type="text-plain"`
  - `text`
  - `mime_type`

#### 3. Tool Calling
和工具调用有关的内容块。

- `tool_call`  
  普通工具调用。常见字段：
  - `type="tool_call"`
  - `name`
  - `args`
  - `id`

- `tool_call_chunk`  
  流式输出中的工具调用片段。常见字段：
  - `type="tool_call_chunk"`
  - `name`
  - `args`
  - `id`
  - `index`

- `invalid_tool_call`  
  无法正确解析的工具调用，一般用于捕获 JSON 解析失败等问题。常见字段：
  - `type="invalid_tool_call"`
  - `name`
  - `args`
  - `error`

#### 4. Server-Side Tool Execution
和服务端工具执行有关的内容块。

- `server_tool_call`  
  服务端执行的工具调用。常见字段：
  - `type="server_tool_call"`
  - `id`
  - `name`
  - `args`

- `server_tool_call_chunk`  
  服务端工具调用的流式片段。常见字段：
  - `type="server_tool_call_chunk"`
  - `id`
  - `name`
  - `args`
  - `index`

- `server_tool_result`  
  服务端工具执行结果。常见字段：
  - `type="server_tool_result"`
  - `tool_call_id`
  - `id`
  - `status`
  - `output`

#### 5. Provider-Specific
用于放置服务商特有、暂时无法标准化的内容。

- `non_standard`  
  Provider 专有的逃生口。常见字段：
  - `type="non_standard"`
  - `value`

总的来说，`content_blocks` 的意义就在于：即使不同模型底层返回的原始格式不一样，LangChain 也尽量帮我们统一成一套更稳定的访问方式。

### (4) Use with chat models

Chat model 接收一组 messages 作为输入，并通常返回一个 `AIMessage` 作为输出。  
如果消息中包含标准化的 `content_blocks`，那么我们就可以更稳定地处理文本、推理、多模态数据以及工具调用结果，而不用总是去适配不同 Provider 的原始格式。

不过需要注意的是，`content_blocks` 主要是 LangChain 提供的一层标准化抽象，它并不意味着所有模型都支持所有类型的内容。像图片、音频、PDF、视频等输入形式，仍然要以具体 Provider 的能力说明为准。
