---
title: LangChain 前置：OpenAI API 调用基线
published: 2026-03-28
description: 在正式进入 LangChain 之前，先建立最小调用心智：同步、异步、流式和常见参数到底是什么。
tags: [LangChain, OpenAI, SDK]
category: LangChain
draft: false
comment: true
---

> 这篇被我放在 LangChain 学习路径的最前面。它严格来说不是 LangChain 本体，而是为了先弄明白“模型调用本身长什么样”，后面看 Models、Messages、Streaming 时会顺很多。

## 1. 介绍与安装
官网的介绍是：OpenAI API 可应用于理解或生成自然语言、代码或图像的几乎所有任务。我们提供一系列不同功率级别的模型，适用于不同的任务，并具有微调自定义模型的能力。这些模型可以用于从内容生成到语义搜索和分类的一切。

我们要调用了解OpenAI包的用法，可以前往[OpenAI Python API library](https://github.com/openai/openai-python)查看；如果想快速用了解怎么用这个包来开发，可以看[OpenAI Developers的接口文档](https://developers.openai.com/api/docs/quickstart)。笔者整理的时候，这个包在pypi上的stable版本已经v2.29.0，一些教程还在用旧版的接口。

首先，最基本的当然是从PyPI安装
```python
pip install openai
```

安装完成用pip show openai可以看到
```
Name: openai
Version: 2.29.0
Summary: The official Python library for the openai API
Home-page: https://github.com/openai/openai-python
Author: 
Author-email: OpenAI <support@openai.com>
License: Apache-2.0
Location: /opt/homebrew/anaconda3/envs/agent/lib/python3.13/site-packages
Requires: anyio, distro, httpx, jiter, pydantic, sniffio, tqdm, typing-extensions
Required-by: 
```

## 2. 快速使用

### (1) 主流新接口 - responses.create(...)

github页提供了一个示例。由于我们没有OpenAI额度😭，我们换中转API。

一般情况下，我们会用python-dotenv的方法将API秘钥添加到.env中，然后载入，防止直接写进源码。下面写法也可以不用find_dotenv，直接一句load_dotenv()，就会去默认环境找。

```python
import os
from dotenv import load_dotenv, find_dotenv
from openai import OpenAI

_ = load_dotenv(find_dotenv())

client = OpenAI(
    api_key=os.environ["QIHANG_API"],
    base_url=os.environ["QIHANG_BASE_URL"]
)

response = client.responses.create(
    model = "gpt-4o-mini",
    instructions= "你是猪",
    input = "叫一声"
)

print(response.output_text)
```

![alt text](/images/study/langchain/image.png)

### (2) 传统聊天信息 - chat.completions

这是偏“传统聊天消息”的接口风格。相比而言，新版的instructions + input更像直接回答，而messages更像多轮聊天形式。

另外需要注意的是，这里的role必须是标准角色，比如system、user、assistant。

对比两者，还有接口返回的结构不同，可以观察一下。

```python
import os
from dotenv import load_dotenv, find_dotenv
from openai import OpenAI

_ = load_dotenv(find_dotenv())

client = OpenAI(
    api_key=os.environ["QIHANG_API"],
    base_url=os.environ["QIHANG_BASE_URL"]
)

completion = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[
        {
            "role": "system", 
            "content": "你要像一只猪一样说话"
        },
        {
            "role": "user",
            "content": "你最喜欢什么事情啊？",
        },
    ],
)

print(completion.choices[0].message.content)
```

![alt text](/images/study/langchain/image-1.png)

### (3) 图像

可以在input里面用content加入type键。默认`input_text`换成`input_image`即可图像即可，有两种形式，一种是用在线图像的URL，一般用`{"type": "input_image", "image_url": f"{img_url}"}`，一种是base64，base64包的用法在这里略掉，可以在[Base64包用法](https://docs.python.org/zh-cn/3/library/base64.html)里面查看。

### (4) 异步使用
与正常使用几乎没区别，只是换成了AsyncOpenAI，举例如下：
```python
import os
import asyncio
from openai import AsyncOpenAI
from dotenv import load_dotenv

load_dotenv()

client = AsyncOpenAI(
    api_key=os.environ.get("QIHANG_API"),
    base_url=os.environ.get("QIHANG_BASE_URL")
)


async def main() -> None:
    response = await client.responses.create(
        model="gpt-4o-mini", input="Explain disestablishmentarianism to a smart five year old.说中文"
    )
    print(response.output_text)


asyncio.run(main())
```

### (5) aiohttp
默认情况下，异步客户端使用 HTTP 请求。然而，为了提高并发性能，也可以使用 aiohttp 作为 HTTP 后端。不过aiohttp暂时还没看，skip一下。

### (6) 流式回答
流式回答可以让模型不要等整段生成完再一次性返回，而是边生成边把事件流发回来。官方文档描述为server-sent events，SDK中会拿到一个可迭代对象，所以能一直打印，直到收到完成事件为止。

直接print会打印整个对象的一大堆信息，我们也可以看一下：
```
ResponseTextDeltaEvent(content_index=0, delta='善', item_id='msg_01cd90f5c2f813180069c3fef6a7e08190b9a175ce86233099', logprobs=[], output_index=0, sequence_number=492, type='response.output_text.delta', obfuscation='JRiZxCSRiPjcp8M')
```
如果想呈现目前常见的打字机输出，可以只打印每个事件的delta字段，然后把flush设置为True（即将缓存区的数据立刻写入文件同时清空缓冲区）。
```python
import os
import asyncio
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

client = OpenAI(
    api_key=os.environ.get("QIHANG_API"),
    base_url=os.environ.get("QIHANG_BASE_URL")
)


stream = client.responses.create(
    model= "gpt-4o-mini",
    input = "写一个关于猪的鬼故事",
    stream = True
)

# stream会得到可迭代的一堆event
for event in stream:
    if event.type == "response.output_text.delta":
        print(event.delta,end="",flush=True)
print()
```

暂时经常用到的应该就是这些，后面可以边学边看

## 3. 参数
[API字典](https://github.com/openai/openai-python/blob/main/api.md)在这里，可以随用随看，里面包含一大堆参数。
