---
title: SFT 监督微调：指令跟随与格式对齐
published: 2026-05-27
description: 从数据格式、训练目标、能学到什么和局限出发，理解 SFT 为什么是后训练的第一步，但不是对齐训练的终点。
tags: [LLM, SFT, InstructionTuning]
category: LLM Base
draft: false
comment: true
---

> SFT 是后训练里最容易上手的一步，也是很多模型从 base 走向 chat 的第一步。它的关键不是“继续训练一下”，而是用高质量指令数据教模型：用户在提需求时，应该如何稳定地回答。

# 一、SFT 是什么

SFT 全称是 Supervised Fine-tuning，监督微调。

在 LLM 后训练语境里，它通常指：

> 使用人工或合成的 instruction-response 数据，对预训练模型继续做监督学习，让模型学会按用户指令输出符合预期的回答。

如果说预训练的目标是：

```text
给定前文，预测下一个 token
```

那么 SFT 更像是：

```text
给定 system + user 指令，学习 assistant 应该如何回答
```

它的训练目标仍然可以是 token-level 交叉熵，但监督信号来自“高质量回答”。

# 二、SFT 数据长什么样

SFT 数据的本质是“输入条件 + 目标回答”，但工程里常见格式有好几种。面试里最好不要只说“问答对”，可以按 Alpaca、ShareGPT 和 messages 三类说。

## 1. Alpaca：单轮指令数据

Alpaca 最初来自斯坦福的指令微调数据集。后来社区里说的“Alpaca 格式”，通常指这种单轮任务结构：

```json
{
  "instruction": "把下面这段话总结成三点。",
  "input": "长文本内容...",
  "output": "1. ...\n2. ...\n3. ..."
}
```

它适合：

- 摘要
- 翻译
- 分类
- 信息抽取
- 结构化生成
- 单轮问答

Alpaca 的优点是简单直接，缺点是不太自然地表达多轮对话和工具调用。

## 2. ShareGPT：多轮对话数据

你之前记成 “SharpGPT” 的，大概率是 `ShareGPT`。

ShareGPT 更适合多轮对话和复杂交互。它的核心不是单个 `instruction`，而是一串 `conversations`：

```json
{
  "conversations": [
    {
      "from": "human",
      "value": "请解释一下什么是 DPO。"
    },
    {
      "from": "gpt",
      "value": "DPO 是 Direct Preference Optimization..."
    },
    {
      "from": "human",
      "value": "它和 RLHF 有什么区别？"
    },
    {
      "from": "gpt",
      "value": "可以从 reward model、训练稳定性和工程复杂度三点比较..."
    }
  ]
}
```

它常见角色包括：

- `human`
- `gpt`
- `function_call`
- `observation`

所以 ShareGPT 格式很适合：

- 聊天助手
- 多轮追问
- 工具调用轨迹
- Agent 交互
- 多模态对话

比如多模态数据里，经常会把图片路径和 `<image>` 占位符放进 ShareGPT 格式：

```json
{
  "image": "images/sample.png",
  "conversations": [
    {
      "from": "human",
      "value": "<image>\n这张图里血液形态是什么？"
    },
    {
      "from": "gpt",
      "value": "这属于滴落形态。"
    }
  ]
}
```

这个和你 fine-tuning 模块里的 Qwen2.5-VL 小样本微调是同一条线：数据格式不仅要表达文本，还要和模型模板、图像路径、训练框架对齐。

## 3. Messages：更通用的对话格式

现在常见的 SFT 数据也会整理成 OpenAI / Anthropic / Qwen 这类 messages 风格：

```json
{
  "messages": [
    {
      "role": "system",
      "content": "你是一个严谨、清晰的技术学习助手。"
    },
    {
      "role": "user",
      "content": "请解释一下什么是预训练。"
    },
    {
      "role": "assistant",
      "content": "预训练是大模型训练的第一阶段，通常使用大规模无标注语料做自监督学习..."
    }
  ]
}
```

这种格式的好处是角色边界更清楚：

- `system`：全局行为约束
- `user`：用户输入
- `assistant`：模型目标输出
- `tool`：工具返回结果

对于工具调用模型，还会包含工具 schema 和调用轨迹：

```json
{
  "messages": [
    {"role": "user", "content": "查一下今天上海天气。"},
    {
      "role": "assistant",
      "tool_calls": [
        {
          "name": "weather",
          "arguments": {"location": "上海"}
        }
      ]
    },
    {"role": "tool", "content": "晴，28 摄氏度。"},
    {"role": "assistant", "content": "今天上海天气晴，约 28 摄氏度。"}
  ]
}
```

这类数据教模型的不只是“内容”，还有角色边界、调用格式和结果整合方式。

## 4. 三种格式怎么选

| 格式 | 核心结构 | 适合场景 | 局限 |
| --- | --- | --- | --- |
| Alpaca | `instruction / input / output` | 单轮任务、摘要、分类、结构化生成 | 多轮和工具调用表达不自然 |
| ShareGPT | `conversations` | 多轮对话、Agent、工具轨迹、多模态 | 数据清洗和模板对齐更麻烦 |
| Messages | `system / user / assistant / tool` | 现代 Chat/Tool-use 模型训练 | 需要和具体模型 chat template 对齐 |

如果面试官问“SFT 数据长什么样”，可以这样回答：

> SFT 数据本质是 instruction-response 监督信号。工程里常见三种格式：Alpaca 适合单轮指令任务，ShareGPT 适合多轮对话和工具调用，messages 格式则更接近现在 Chat API 的组织方式。训练时这些结构化数据最终都会经过 chat template 渲染成 token 序列，通常只对 assistant 输出部分计算 loss。

# 三、Tool-use SFT：工具调用也是一种格式对齐

工具调用模型的 SFT 数据会更复杂，因为它不仅要学会回答，还要学会在合适的时候生成结构化工具调用。

一个简化样本是：

```json
{
  "messages": [
    {"role": "user", "content": "查一下今天上海天气。"},
    {
      "role": "assistant",
      "tool_calls": [
        {
          "name": "weather",
          "arguments": {"location": "上海"}
        }
      ]
    },
    {"role": "tool", "content": "晴，28 摄氏度。"},
    {"role": "assistant", "content": "今天上海天气晴，约 28 摄氏度。"}
  ]
}
```

这条数据包含三个学习目标：

1. 什么时候不用直接回答，而是先调用工具。
2. 工具名和参数怎么按 schema 生成。
3. 拿到工具结果后，怎么整合成自然语言答案。

所以 tool-use SFT 和普通 SFT 的区别是：

- 普通 SFT 学“问题 -> 回答”。
- tool-use SFT 学“问题 -> 工具调用 -> 观察结果 -> 最终回答”。

不过 SFT 主要还是模仿轨迹。它能教格式和常见模式，但不一定能优化长程任务成功率，这也是后面 Agentic RL 要解决的问题。

# 四、Chat Template：对话格式如何进入模型

真实训练时，`messages` 这样的结构化数据不会直接进入 Transformer。它会先经过 chat template，被渲染成一段带特殊标记的文本。

例如：

```text
<|system|>
你是一个严谨、清晰的技术助手。
<|user|>
请解释一下什么是预训练。
<|assistant|>
预训练是大模型训练的第一阶段...
```

不同模型的模板不同。Qwen、LLaMA、ChatML、OpenAI-style messages 都会有自己的特殊 token 和角色标记。

这件事很重要，因为 SFT 不只是训练“答案内容”，还在训练模型识别：

- 哪段是 system。
- 哪段是 user。
- 哪段是 assistant。
- assistant 从哪里开始回答。
- 多轮对话里上下文如何延续。

如果 template 和推理时使用的格式不一致，模型可能训练时学得很好，推理时却不稳定。

# 五、Label Mask：不是所有 token 都应该算 loss

SFT 的输入里包含 system、user、assistant 三类文本，但通常只希望模型学习 assistant 的输出。

例如：

```text
system: 你是一个技术助手
user: 什么是 DPO？
assistant: DPO 是一种直接偏好优化方法...
```

训练时常见做法是：

```text
system 和 user token 的 label 设为 -100，不参与 loss
assistant token 参与 cross-entropy loss
```

也就是说，模型会看到完整上下文，但梯度主要来自 assistant 回答部分。

为什么不让 user 也算 loss？

因为我们不是要训练模型“生成用户问题”，而是训练它“在给定用户问题后生成回答”。如果把 user 部分也算进去，模型会浪费容量学习复述输入格式。

# 六、SFT 学到什么

SFT 主要学习四类东西。

## 1. 指令跟随

用户说“用三点回答”，模型就用三点。

用户说“只输出 JSON”，模型就尽量只输出 JSON。

这和 base model 的自由续写差别很大。

## 2. 输出格式

很多业务场景不是回答对就行，还要求格式稳定：

- Markdown 列表
- JSON
- 表格
- 代码块
- 固定字段
- 多轮对话格式

比如：

```json
{
  "risk_level": "high",
  "reason": "合同中缺少违约责任条款",
  "suggestion": "补充双方违约责任和赔偿范围"
}
```

SFT 可以显著提升这种格式服从能力。

## 3. 回答风格

同一个问题可以有很多回答风格：

- 技术讲解风格：先定义，再比较，再给例子。
- 客服风格：先安抚，再解决。
- 法律风格：先结论，再依据，再风险提示。
- 教学风格：先直觉，再公式，再练习。

SFT 可以把这种风格写进模型行为里。

## 4. 领域任务映射

比如：

```text
输入一段病历 -> 输出结构化摘要
输入一份合同 -> 输出风险点
输入一段报错 -> 输出排查步骤
输入一张商品图 -> 输出质检标签
```

这类任务如果有高质量样本，SFT 往往很有效。

# 七、SFT 的训练直觉

训练时，模型会看到完整上下文，但通常只对 assistant 的回答部分计算 loss。

也就是说，system 和 user 是条件，assistant answer 是要学习的目标。

比如：

```text
system: 你是一个技术助手
user: 什么是 DPO？
assistant: DPO 是一种直接偏好优化方法...
```

训练目标是让模型在这个上下文下，更大概率生成 assistant 那段回答。

这解释了为什么 SFT 数据质量极其重要：

模型不会自动知道“这条回答是不是好”，它只是被要求模仿。如果数据里有啰嗦、错误、格式混乱、过度拒答，模型都会学。

# 八、SFT 数据怎么做更好

高质量 SFT 数据通常有几个特点：

**1. 指令清晰**

不要让 user prompt 含糊到连人都不知道要什么。

**2. 输出可学习**

回答要稳定、结构清楚、风格统一，而不是每条都完全不一样。

**3. 覆盖真实场景**

不要只做理想问题，要加入长尾、边界、异常输入。

**4. 难度有层次**

简单问答、复杂推理、多轮澄清、工具调用都要有。

**5. 避免错误标签**

SFT 对错误答案非常敏感。少量高质量数据常常比大量脏数据更好。

**6. 留出评估集**

训练集和评估集要分开，避免只是在背训练样本。

# 九、训练工程里的几个细节

## 1. Packing

短样本很多时，如果每条样本都 padding 到最大长度，会浪费大量显存。Packing 会把多条短对话拼进同一个上下文窗口，提高训练效率。

但 packing 要确保不同样本之间的 attention mask 和 label mask 正确，否则模型可能跨样本偷看上下文。

## 2. 截断

长对话超过最大长度时，需要决定从前面截断还是从后面截断。

如果任务依赖最新用户问题，通常不能把最后一轮 user 和 assistant 截掉；如果任务依赖 system 规则，也不能把 system 丢掉。

## 3. 数据混合比例

SFT 数据里可能混合通用对话、代码、数学、安全、工具调用和领域问答。比例会显著影响模型性格。

例如安全样本太多，模型容易保守；代码样本太少，模型代码能力可能下降；格式样本质量差，模型输出 schema 会不稳定。

## 4. 学习率

SFT 通常比预训练学习率小很多。因为模型已经有能力，只是在塑形。如果学习率过大，容易破坏原模型能力。

# 十、SFT 的局限

SFT 很重要，但不能解决所有问题。

## 1. 它不会天然知道哪个答案更受欢迎

同一个问题，下面两个答案都可能正确：

```text
答案 A：短，直接，适合忙碌用户。
答案 B：长，完整，适合学习用户。
```

SFT 只能模仿数据里的某个答案，不能直接建模“人类更偏好哪个”。

## 2. 它容易复制数据偏差

如果训练数据里总是过度解释，模型就会变啰嗦。

如果训练数据里很多拒答，模型就会变保守。

如果训练数据里格式不稳定，模型输出也会不稳定。

## 3. 它不擅长优化任务结果

比如代码任务，SFT 可以模仿“看起来像正确代码”的答案，但代码能不能跑通，还需要测试、执行反馈或 RL 进一步优化。

## 4. 它对长程 Agent 任务不够

工具调用任务里，SFT 能教轨迹格式，但不能充分优化“最后任务是否成功”。Agentic RL 更关注这个问题。

# 十一、SFT 和 Prompt Engineering 的关系

一个常见问题是：能不能只靠 prompt，不做 SFT？

答案是：看场景。

| 方案 | 适合情况 | 局限 |
| --- | --- | --- |
| Prompt | 需求轻、变化快、格式要求不极端 | 稳定性有限，上下文成本高 |
| SFT | 任务固定、格式固定、风格固定 | 需要数据和训练成本 |
| RAG | 需要外部知识、知识更新快 | 依赖检索质量 |
| DPO/RL | 需要偏好或结果优化 | 数据和工程更复杂 |

如果只是让模型“偶尔按某个格式回答”，prompt 可能够。

如果每天都要稳定输出同一种结构，SFT 更适合。

# 十二、一个具体例子：技术讲解风格 SFT

假设要训练一个“AI 技术讲解助手”，一条 SFT 数据可以这样设计：

```json
{
  "messages": [
    {"role": "system", "content": "你是一个帮助学习者理解 AI 训练方法的助手。回答要准确、结构清晰、先直觉后细节。"},
    {"role": "user", "content": "DPO 和 RLHF 有什么区别？"},
    {"role": "assistant", "content": "可以从三点回答。第一，RLHF 通常需要先训练 reward model，再用 PPO 优化策略；DPO 不显式训练 reward model，而是直接使用 chosen/rejected 偏好对更新模型。第二，RLHF 更接近在线强化学习，工程复杂度更高；DPO 是离线偏好优化，训练更稳定。第三，DPO 适合已有高质量偏好数据的场景，而 RLHF/PPO 在需要在线探索和复杂奖励时更有表达力。"}
  ]
}
```

这条数据教会模型的不是 DPO 知识本身，而是：

- 技术问题先分点。
- 先讲核心差异。
- 再讲工程复杂度。
- 最后讲适用场景。

# 十三、本篇小结

SFT 的核心不是“让模型多看一些问答”，而是把对话格式、角色边界、输出风格和任务流程通过监督信号写进模型行为里。

最关键的训练细节是：

```text
messages -> chat template -> token ids
system/user 作为条件
assistant answer 作为 label
label mask 控制哪些 token 参与 loss
cross-entropy 更新模型参数
```

理解这一点以后，再看 DPO、RLHF、工具调用 SFT 都会清楚很多：它们不是凭空出现的新范式，而是在 SFT 这个“模仿好答案”的基础上继续引入偏好、奖励或环境反馈。
