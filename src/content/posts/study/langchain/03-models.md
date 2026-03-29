---
title: LangChain 核心组件 01：Models
published: 2026-03-26
description: 先把模型对象本身看明白：如何初始化、调用、流式输出，以及模型层负责什么、不负责什么。
tags: [LangChain, Models]
category: LangChain
draft: false
comment: true
---

> 从这里开始，学习顺序正式进入“先组件，后 Agents”。Models 是最先该熟悉的，因为几乎所有上层能力最终都要落回模型调用。

## 1. 介绍

大语言模型是功能强大的人工智能工具，能够像人类一样理解和生成文本。它们用途广泛，无需针对每项任务进行专门训练，即可完成内容创作、语言翻译、文本摘要和问答等工作。

除文本生成外，许多模型还支持以下功能：
- 工具调用—— 调用外部工具（如数据库查询或 API 调用），并将结果应用于回复中。
- 结构化输出—— 约束模型的输出遵循指定格式。
- 多模态能力—— 处理并返回文本以外的数据，如图像、音频和视频。
- 推理能力—— 模型通过多步推理得出结论。

模型是智能体的推理引擎，驱动智能体的决策过程，决定调用哪些工具、如何解读结果以及何时给出最终答案。

你所选择模型的质量与能力，直接影响智能体的基础可靠性和运行性能。不同模型擅长不同任务 —— 部分模型更擅长遵循复杂指令，部分擅长结构化推理，还有部分支持更大的上下文。

当然。以上是废话。

## 2. Basic Usage
Models有两种方法使用，一种是作为agent的大脑，详见上一章；另一个是在agent loop外直接被调用

### (1) 初始化模型

感觉其实不用我多说什么，主要用的就是`init_chat_model`和Model Class两种方案，在上上一章中已经尝试并使用过。前者是通用的创建方法，后者是特定代理商的。

```python
import os
from langchain.chat_models import init_chat_model

os.environ["OPENAI_API_KEY"] = "sk-..."

model = init_chat_model("gpt-5.2")
```

```python
import os
from langchain_openai import ChatOpenAI

os.environ["OPENAI_API_KEY"] = "sk-..."

model = ChatOpenAI(model="gpt-5.2")
```

### (2) 支持的模型
看[这里](https://docs.langchain.com/oss/python/integrations/providers/overview)，主流的都支持。

## 3. 参数

Chat Model 在初始化时可以传入一系列参数来控制模型行为。不同模型、不同 Provider 支持的参数并不完全一致，但有一些是比较通用的。

常见参数如下：

- `model`  
  指定要使用的具体模型名称或标识符。  
  有时也可以把 provider 一起写进去，比如 `openai:gpt-5`。

- `api_key`  
  用于向模型提供商鉴权的密钥。  
  一般通过环境变量读取，也可以在初始化时直接传入。

- `temperature`  
  控制输出的随机性。  
  值越高，回答通常越发散、越有创造性；值越低，回答越稳定、越接近确定性输出。

- `max_tokens`  
  限制模型本次最多生成多少 token。  
  可以粗略理解为控制“回复最长能写多长”。

- `timeout`  
  请求超时时间。  
  如果超过设定时间模型还没有返回结果，请求就会被取消。

- `max_retries`  
  请求失败时的最大重试次数。  
  常见的网络超时、限流（429）或服务端错误（5xx）通常会自动重试；像 401、404 这类客户端错误一般不会重试。

使用 `init_chat_model` 时，这些参数通常可以直接作为关键字参数传入，例如：

```python
from langchain.chat_models import init_chat_model

model = init_chat_model(
    "claude-sonnet-4-6",
    temperature=0.7,
    timeout=30,
    max_tokens=1000,
    max_retries=6,
)
```

## 4. 调用 (Invocation)

必须调用聊天模型才能生成输出结果。共有三种主要的调用方法，每种方法适用于不同的使用场景。

### (1) Invoke
可以记得，agent就是使用invoke来创建一次回答的对象，model同样如此，很简单：
```python
response = model.invoke("Why do parrots have colorful feathers?")
print(response)
```
可以向对话模型提供消息列表来表示对话历史。每条消息都带有一个角色，模型通过该角色来标识对话中消息的发送方。这里之后会在Messages组件中细聊：
```python
conversation = [
    {"role": "system", "content": "You are a helpful assistant that translates English to French."},
    {"role": "user", "content": "Translate: I love programming."},
    {"role": "assistant", "content": "J'adore la programmation."},
    {"role": "user", "content": "Translate: I love building applications."}
]

response = model.invoke(conversation)
print(response)  # AIMessage("J'adore créer des applications.")
```
或：
```python
from langchain.messages import HumanMessage, AIMessage, SystemMessage

conversation = [
    SystemMessage("You are a helpful assistant that translates English to French."),
    HumanMessage("Translate: I love programming."),
    AIMessage("J'adore la programmation."),
    HumanMessage("Translate: I love building applications.")
]

response = model.invoke(conversation)
print(response)  # AIMessage("J'adore créer des applications.")
```

我们这里，直接print来看一下AIMessage里面是什么内容。

```python
AIMessage(
    content="J'adore creer des applications.",
    additional_kwargs={
        "refusal": None
    },
    response_metadata={
        "token_usage": {
            "completion_tokens": 7,
            "prompt_tokens": 48,
            "total_tokens": 55,
            "completion_tokens_details": {
                "accepted_prediction_tokens": 0,
                "audio_tokens": 0,
                "reasoning_tokens": 0,
                "rejected_prediction_tokens": 0
            },
            "prompt_tokens_details": {
                "audio_tokens": 0,
                "cached_tokens": 0
            }
        },
        "model_provider": "openai",
        "model_name": "gpt-4o-mini-2024-07-18",
        "system_fingerprint": "fp_eb37e061ec",
        "id": "chatcmpl-DNt7u2YGuVpI3LG99vAdG3aG486te",
        "finish_reason": "stop",
        "logprobs": None
    },
    id="lc_run--019d2d8e-ad56-7d90-9180-83c9de41a83b-0",
    tool_calls=[],
    invalid_tool_calls=[],
    usage_metadata={
        "input_tokens": 48,
        "output_tokens": 7,
        "total_tokens": 55,
        "input_token_details": {
            "audio": 0,
            "cache_read": 0
        },
        "output_token_details": {
            "audio": 0,
            "reasoning": 0
        }
    }
)
```

可以看到，其中 `content` 表示模型真正回复的文本；`usage_metadata` 是 LangChain 统一整理后的 token 使用情况；`response_metadata` 则更多保存模型提供商返回的原始元数据，例如模型名称、结束原因、logprobs 和更细粒度的 token usage 信息。如果本次回复涉及工具调用，还会在 `tool_calls` 中体现；如果没有，则通常是空列表。

现在你应该理解Model那一章从哪里得到的元数据字段（说实话不明白为什么官网Messages要放在Model后面呢，还有为什么Agents要放在Messages前面）。

对比一下Agents，它被invoke的时候一般返回agent当前的最终state，这是一个结果字典。我们用response["messages"][-1]看到的才是AIMessage。

如果这里print发现直接返回直接就是字符串，检查一下用的是不是对话模型。LangChain的对话模型都是用Chat作为前缀。

### (2) Stream

大多数模型能够在生成输出内容的同时进行流式传输。通过逐步展示输出结果，流式传输可显著提升用户体验，对于较长的响应尤为明显。

调用stream()会返回一个迭代器，该迭代器会在输出片段生成时逐一产出。你可以使用循环来实时处理每个片段：
```python
for chunk in model.stream("Why do parrots have colorful feathers?"):
    print(chunk.text, end="|", flush=True)
```

与invoke()不同，该方法会在模型完成完整响应生成后返回单个AIMessage；而stream()会返回多个AIMessageChunk对象，每个对象均包含输出文本的一部分。重要的是，流中的每个数据块都可通过累加方式拼接成完整消息：
```python
full = None  # None | AIMessageChunk
for chunk in model.stream("What color is the sky?"):
    full = chunk if full is None else full + chunk
    print(full.text)

# The
# The sky
# The sky is
# The sky is typically
# The sky is typically blue
# ...

print(full.content_blocks)
# [{"type": "text", "text": "The sky is typically blue..."}]
```

这里最终生成的消息可以和invoke()生成的消息同等对待 —— 例如，可将其整合至消息历史中，并作为对话上下文回传给模型。

### (3) Batch

将一批独立的模型请求进行批处理，能够显著提升性能并降低成本，因为处理过程可以并行执行：

```python
responses = model.batch([
    "Why do parrots have colorful feathers?",
    "How do airplanes fly?",
    "What is quantum computing?"
])
for response in responses:
    print(response)
```

默认情况下batch()只会返回整个批次的最终输出结果，没如果需要每次都有结果需要用batch_as_completed()：
```python
for response in model.batch_as_completed([
    "Why do parrots have colorful feathers?",
    "How do airplanes fly?",
    "What is quantum computing?"
]):
    print(response)
```

结果可能会乱序返回，但每个结果都会包含输入索引，可根据需要通过匹配来还原原始顺序。

## 5. 工具调用 (Tool calling)

模型可以请求调用工具来执行各类任务，例如从数据库获取数据、进行网络搜索或运行代码。工具由以下两部分配对组成：
- 一个schema，包含工具名称、描述以及 / 或者参数定义（通常为 JSON 模式）
- 用于执行的函数或协程。

注意function calling和tool calling在这里表示一个意思，混用。

下面是用户与模型之间的基本工具调用流程：

```mermaid  theme={"theme":{"light":"catppuccin-latte","dark":"catppuccin-mocha"}}
sequenceDiagram
    participant U as User
    participant M as Model
    participant T as Tools

    U->>M: "What's the weather in SF and NYC?"
    M->>M: Analyze request & decide tools needed

    par Parallel Tool Calls
        M->>T: get_weather("San Francisco")
        M->>T: get_weather("New York")
    end

    par Tool Execution
        T-->>M: SF weather data
        T-->>M: NYC weather data
    end

    M->>M: Process results & generate response
    M->>U: "SF: 72°F sunny, NYC: 68°F cloudy"
```

模型要想使用自定义工具，必须要通过`bind_tools`方法将其绑定，那么在后续调用过程中，模型就可以根据需要选择调用任意已绑定的工具。比如：
```python
from langchain.tools import tool

@tool
def get_weather(location: str) -> str:
    """Get the weather at a location."""
    return f"It's sunny in {location}."


model_with_tools = model.bind_tools([get_weather])

response = model_with_tools.invoke("What's the weather like in Boston?")
for tool_call in response.tool_calls:
    # View tool calls made by the model
    print(f"Tool: {tool_call['name']}")
    print(f"Args: {tool_call['args']}")
```

在绑定用户自定义工具时，模型的响应会包含一个请求以执行工具。当独立于智能体使用模型时，需要由你自行执行所请求的工具，并将结果返回给模型，供其在后续推理中使用。而在使用智能体时，智能体循环会为你自动处理工具执行流程。（所以工具还是写在Agent里面好，咳咳）

## 6. Structured output

格式化输出有三种方式可以做，Pydantic、TypedDict和Json Schema，定义好了作为参数传给 `model.with_structured_output`函数即可。

## 7. Advanced topic

### (1) Model profiles
LangChain 聊天模型可以通过profile属性公开一个包含其所支持功能与特性的字典，让应用根据模型能力动态适配（这部分数据很多来自 models.dev，并且这是 beta feature，格式后面可能会变）：
```python
model.profile
# {
#   "max_input_tokens": 400000,
#   "image_inputs": True,
#   "reasoning_output": True,
#   "tool_calling": True,
#   ...
# }
```

### (2) 多模态 (Multimodal)

部分模型能够处理并返回图像、音频和视频等非文本数据。你可以通过提供内容块（这一部分在Message中介绍）来向模型传递非文本数据。

然后有些模型还可以返回多模态数据，生成的AIMessage将包含带有多模态类型的内容块

```python
response = model.invoke("Create a picture of a cat")
print(response.content_blocks)
# [
#     {"type": "text", "text": "Here's a picture of a cat"},
#     {"type": "image", "base64": "...", "mime_type": "image/jpeg"},
# ]
```
### (3) 推理 (Reasoning)

许多模型支持推理，可以选择呈现推理过程。流式推理输出如下：
```python
for chunk in model.stream("Why do parrots have colorful feathers?"):
    reasoning_steps = [r for r in chunk.content_blocks if r["type"] == "reasoning"]
    print(reasoning_steps if reasoning_steps else chunk.text)
```
Complete展现推理如下：
```python
response = model.invoke("Why do parrots have colorful feathers?")
reasoning_steps = [b for b in response.content_blocks if b["type"] == "reasoning"]
print(" ".join(step["reasoning"] for step in reasoning_steps))
```

### (4) 本地大模型
这……好像跟LangChain本身关系不大，如果用到的时候查一下接法。

### (5) Prompt catching

也就是提示词缓存技术，以降低重复处理相同令牌时的延迟和成本。不同模型的供应商不同，OpenAI和Gemini其实等提供了隐式提示词缓存。服务器提供商也允许用户手动指定缓存节点，比如ChatOpenAI的prompt_cache_key。

### (6) 服务端工具调用
pass

### (7) 限额

pass

### (8) Base URL and proxy settings

这个特性我们之前就用过，就是第三方
```python
model = init_chat_model(
    model="MODEL_NAME",
    model_provider="openai",
    base_url="BASE_URL",
    api_key="YOUR_API_KEY",
)
```

### (9) Log probabilities

做实验的时候可能会需要。某些模型可通过在初始化模型时设置logprobs参数，配置为返回代表指定令牌概率的令牌级对数概率：
```python
model = init_chat_model(
    model="gpt-4.1",
    model_provider="openai"
).bind(logprobs=True)

response = model.invoke("Why do parrots talk?")
print(response.response_metadata["logprobs"])
```

返回回来的将是这样的结果：
```python
{
  "content": [...],
  "refusal": None
}
```

content是模型生成出来的 token 明细列表，refusal是否触发拒答，这里是 None，说明没有拒答。

而content中的每一项，大概是这样的：
```python
{
  "token": "Par",
  "bytes": [80, 97, 114],
  "logprob": -5.512236498361744e-07,
  "top_logprobs": []
}
```
字段的意思是，这一个token对应的字节显示，还有选中这个token的对数概率，越接近0越稳定。粗略可以记为0附近很有把握，-0.1到-1还比较合理，-2以下没这么稳了。（-0.69对应的概率差不多是0.5，-2.3对应的差不多是0.1）。

另外，注意到像 `logprobs` 这类更偏 provider-specific 的信息，则通常放在 `response_metadata` 中

### (10) Token usage

多家模型提供商会在调用响应中返回令牌使用信息。如果该信息可用，将会被包含在对应模型生成的AIMessage对象中。但是不能按照response.tokens这种方式读，因为他们不是AIMessage的顶层属性，而是在`usage_metadata`中。

可以使用回调函数或上下文管理器来跟踪应用程序中不同模型的总令牌使用数量，如下所示：
```python
from langchain.chat_models import init_chat_model
from langchain_core.callbacks import UsageMetadataCallbackHandler

model_1 = init_chat_model(model="gpt-4.1-mini")
model_2 = init_chat_model(model="claude-haiku-4-5-20251001")

callback = UsageMetadataCallbackHandler()
result_1 = model_1.invoke("Hello", config={"callbacks": [callback]})
result_2 = model_2.invoke("Hello", config={"callbacks": [callback]})
print(callback.usage_metadata)
```
或
```python
from langchain.chat_models import init_chat_model
from langchain_core.callbacks import get_usage_metadata_callback

model_1 = init_chat_model(model="gpt-4.1-mini")
model_2 = init_chat_model(model="claude-haiku-4-5-20251001")

with get_usage_metadata_callback() as cb:
    model_1.invoke("Hello")
    model_2.invoke("Hello")
    print(cb.usage_metadata)
```

我们会得到如下的统计信息：
```python
{
    'gpt-4.1-mini-2025-04-14': {
        'input_tokens': 8,
        'output_tokens': 10,
        'total_tokens': 18,
        'input_token_details': {'audio': 0, 'cache_read': 0},
        'output_token_details': {'audio': 0, 'reasoning': 0}
    },
    'claude-haiku-4-5-20251001': {
        'input_tokens': 8,
        'output_tokens': 21,
        'total_tokens': 29,
        'input_token_details': {'cache_read': 0, 'cache_creation': 0}
    }
}
```

### (11) Invocation config

调用模型时，你可以通过config参数，使用RunnableConfig字典传递额外配置。这能够在运行时对执行行为、回调函数以及元数据追踪进行控制，如：
```python
response = model.invoke(
    "Tell me a joke",
    config={
        "run_name": "joke_generation",      # Custom name for this run
        "tags": ["humor", "demo"],          # Tags for categorization
        "metadata": {"user_id": "123"},     # Custom metadata
        "callbacks": [my_callback_handler], # Callback handlers
    }
)
```

这些配置值在以下场景中尤为实用：
- 使用LangSmith追踪进行调试
- 实现自定义日志记录或监控
- 控制生产环境中的资源使用
- 追踪复杂流程中的调用过程

### (12) Configurable models

你还可以通过指定configurable_fields来创建可在运行时配置的模型。若你未指定模型取值，那么'model'和'model_provider'将默认处于可配置状态。

```python
from langchain.chat_models import init_chat_model

configurable_model = init_chat_model(temperature=0)

configurable_model.invoke(
    "what's your name",
    config={"configurable": {"model": "gpt-5-nano"}},  # Run with GPT-5-Nano
)
configurable_model.invoke(
    "what's your name",
    config={"configurable": {"model": "claude-sonnet-4-6"}},  # Run with Claude
)
```
