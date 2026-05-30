---
title: 后训练总览：Post-training、SFT、RLHF、DPO 与 GRPO
published: 2026-05-27
description: 从 base model 到 assistant model，梳理后训练要解决的问题，以及 SFT、RLHF/PPO、DPO、GRPO、安全对齐和工具训练之间的关系。
tags: [LLM, PostTraining, SFT, RLHF, DPO, GRPO]
category: LLM Base
draft: false
comment: true
---

> 后训练是把“会续写文本的模型”变成“能稳定服务用户的模型”的过程。它不是单个算法，而是一组围绕指令、偏好、安全和任务成功率展开的训练流程。

# 一、后训练解决什么

预训练后的 base model 已经有很多知识和语言能力，但它还不一定像一个助手。

它可能会：

- 不按用户格式要求输出。
- 面对危险请求也直接回答。
- 答案冗长、含糊、风格不稳定。
- 多个候选答案里选不到人类更喜欢的那个。
- 工具调用格式错、参数错、步骤乱。

后训练要解决的就是这些问题。

一句话概括：

> 后训练通过 SFT、偏好优化、强化学习、安全对齐和工具训练，把 base model 调成更会听指令、更符合人类偏好、更安全、更适合实际任务的 assistant model。

可以把后训练看成三层：

```text
第一层：会回答
SFT 学指令跟随和格式

第二层：答得更好
DPO / RLHF / GRPO 优化偏好或任务结果

第三层：可上线
安全对齐、工具调用、评估、数据飞轮
```

<!-- TODO: 图片占位：可以补一张“base model -> SFT -> preference/RL -> safety/tool -> assistant model”的流程图。 -->

# 二、SFT：先学会按指令回答

SFT 是 Supervised Fine-tuning，监督微调。

它使用的数据不是只有一种格式。面试里可以先按这三类讲：

- `Alpaca`：单轮指令格式，典型字段是 `instruction / input / output`，适合摘要、翻译、分类、结构化生成这类明确任务。
- `ShareGPT`：多轮对话格式，核心是 `conversations`，常见角色有 `human / gpt / function_call / observation`，更适合聊天助手、工具调用和复杂交互。
- `messages`：现在很多框架和 API 更常用的统一格式，按 `system / user / assistant / tool` 组织，训练时再通过 chat template 渲染成模型真正看到的 token。

例如现在常见的 messages 格式长这样：

```json
{
  "messages": [
    {"role": "system", "content": "你是一个严谨的 AI 助手。"},
    {"role": "user", "content": "请用三点解释什么是预训练。"},
    {"role": "assistant", "content": "1. 预训练是...\\n2. 它通常...\\n3. 它的产物..."}
  ]
}
```

如果是 LLaMA-Factory 这类训练框架，还会在 `dataset_info` 里声明数据集格式，比如 `formatting: "alpaca"` 或 `formatting: "sharegpt"`，并把自定义字段映射到框架需要的字段。

SFT 主要学三件事：

1. 指令跟随：用户问什么就回答什么。
2. 输出格式：列表、JSON、Markdown、代码块、多轮对话。
3. 领域风格：比如客服口吻、技术解释风格、教学讲解结构。

SFT 的直觉很简单：给模型看大量“好问题 -> 好回答”，让它模仿。

更底层一点说，SFT 通常还是 token-level 交叉熵训练：system/user 部分作为条件，assistant 部分作为 label，常见做法是把 system/user token 的 label mask 掉，只让 assistant answer 参与 loss。

但 SFT 有局限：

- 它只知道模仿，不知道两个答案哪个更好。
- 数据质量决定上限，坏数据会被学进去。
- 它不能直接优化用户满意度或任务成功率。
- 对复杂偏好、安全边界和长程任务不够。

所以 SFT 往往是后训练的第一步，而不是终点。

# 三、RLHF/PPO：用奖励模型优化偏好

RLHF 是 Reinforcement Learning from Human Feedback，人类反馈强化学习。

经典流程是三步：

```text
SFT
-> 训练 Reward Model
-> 用 PPO 做策略优化
```

第一步，先用 SFT 得到一个能正常对话的模型。

第二步，收集偏好数据：

```text
prompt: 解释什么是 DPO
chosen: 清晰、准确、有结构的回答
rejected: 含糊、错误或啰嗦的回答
```

然后训练一个 reward model，让它给回答打分。

第三步，用 PPO 优化策略模型，让模型生成更高 reward 的回答，同时用 KL 约束防止模型偏离参考模型太远。

为什么要 KL？

因为如果只追求 reward，模型可能会钻 reward model 的空子，也就是 reward hacking。比如变得特别啰嗦、重复某些高分模板，甚至损伤原本的语言能力。

所以 PPO 的核心不是“奖励越高越好”，而是：

> 在不偏离原模型太远的前提下，提高人类偏好奖励。

# 四、DPO：直接用偏好对训练

DPO 是 Direct Preference Optimization。

它想解决 RLHF/PPO 流程复杂的问题：

- 训练 reward model 麻烦。
- PPO 训练不稳定。
- 需要采样、打分、更新，工程成本高。
- reward model 可能被钻空子。

DPO 使用的数据仍然是偏好对：

```text
prompt
chosen response
rejected response
```

但它不显式训练 reward model，也不跑在线 RL，而是直接优化策略模型，让模型相对 reference model 更倾向 chosen，而不是 rejected。

可以先记一个直觉：

> DPO 把“人类更喜欢 chosen”这件事，直接转成“模型应该提高 chosen 的相对概率、降低 rejected 的相对概率”。

它的关键概念包括：

- policy model：正在训练的模型。
- reference model：冻结的参考模型，通常是 SFT 模型。
- chosen / rejected：偏好数据中的好回答和差回答。
- beta：控制偏离 reference model 的强度。
- 隐式 KL：DPO 的目标里天然带着不要偏离 reference 太远的约束。

DPO 的优点是简单、稳定、工程成本低。缺点是它更依赖离线偏好数据，对需要在线探索、可验证奖励或长程任务的场景，不一定够。

# 五、GRPO：用组内相对优势做强化学习

GRPO 是 Group Relative Policy Optimization。

它常被放在 RLVR、数学推理、代码和可验证任务里讨论。核心想法是：

> 对同一个 prompt 采样多条回答，用 reward/verifier 打分，然后在这一组内部计算相对优势，不再额外训练 critic/value model。

简单流程：

1. 对同一个 prompt 采样 G 个回答。
2. 用规则、测试、reward model 或 verifier 给每个回答打分。
3. 在组内做归一化，得到相对 advantage。
4. 高于组平均的回答被强化，低于组平均的回答被压低。
5. 加上 KL 或 clip 约束，防止策略更新过猛。

和 PPO 相比，GRPO 省掉了 value model / critic，工程上更轻。和 DPO 相比，它不只是静态偏好对，而是可以基于可验证 reward 对模型采样结果进行优化。

一个很直观的例子：

```text
prompt: 计算 17 * 23

回答 A: 391，reward = 1
回答 B: 381，reward = 0
回答 C: 391，但过程有小错误，reward = 0.5
```

GRPO 会在这组回答内部判断谁相对更好，再推动模型更倾向生成高 reward 的回答。

# 六、安全对齐：知道哪些不能答

安全对齐不是简单加一句 system prompt。

它通常要覆盖：

- 有害内容拒答。
- 隐私和敏感信息保护。
- 非法、暴力、自伤等风险请求处理。
- 医疗、法律、金融等高风险建议的边界。
- 偏见、歧视和不公平输出。
- 越狱和提示注入防护。

安全对齐的数据可能包括：

- 安全指令数据。
- 红队攻击样本。
- 拒答示例。
- 合规回答示例。
- 对抗样本。

这里的难点是平衡：模型不能有害，但也不能什么都拒答。过度拒答会伤害可用性，拒答不足又会带来安全风险。

# 七、Tool-use 和 Agentic RL

现在很多模型不只是回答文本，还要调用工具。

比如：

- 搜索网页。
- 查询数据库。
- 调用日历、邮件、表格。
- 写代码并运行测试。
- 读取文件、修改文件、提交 PR。

SFT 可以教会模型工具调用格式，例如：

```json
{
  "tool": "search",
  "arguments": {
    "query": "DPO paper"
  }
}
```

但复杂任务里，只会格式不够。模型还要学会：

- 什么时候调用工具。
- 选哪个工具。
- 参数怎么填。
- 观察结果怎么用。
- 失败后怎么重试。
- 多步任务什么时候停止。

这就是 Agentic RL 更关心的问题：优化长程任务成功率，而不只是模仿某条轨迹。

# 八、几种方法怎么选

可以先用这个表建立直觉：

| 方法 | 最适合解决 | 优点 | 局限 |
| --- | --- | --- | --- |
| SFT | 指令跟随、格式、基础对话 | 简单直接 | 不能区分多个答案优劣 |
| DPO | 离线偏好优化 | 稳定、成本低 | 依赖偏好数据，探索弱 |
| RLHF/PPO | 人类偏好优化 | 表达能力强，可在线优化 | 工程复杂，训练不稳定 |
| GRPO | 可验证任务、推理、代码 | 省 critic，适合组内比较 | 需要有效 reward/verifier |
| Agentic RL | 工具调用和长程任务 | 对任务成功率更直接 | 环境、奖励和评估更复杂 |

真实训练里并不是只选一个。常见路线是：

```text
Base model
-> SFT
-> DPO 或 RLHF
-> 针对数学/代码/工具任务做 GRPO/RLVR/Agentic RL
-> 安全评估和上线灰度
```

# 九、后训练的统一视角

后训练方法很多，但可以放在一个统一框架里理解：

```text
模型当前会怎么输出
-> 我们希望它怎么输出
-> 用什么信号表达这种希望
-> 用什么 loss / reward 更新参数
```

不同方法的差别主要在“信号”不同。

| 方法 | 训练信号 | 参数更新的含义 |
| --- | --- | --- |
| SFT | 标准答案 | 让模型模仿目标回答 |
| DPO | chosen/rejected | 让模型更偏向 chosen |
| RLHF/PPO | reward model 分数 | 让模型生成高 reward 回答 |
| GRPO | 组内 reward | 让高于组平均的采样更常出现 |
| Safety SFT/RL | 安全标签和偏好 | 让模型形成拒答和边界 |
| Agentic RL | 环境成功/失败 | 让整条工具轨迹更可能成功 |

所以后训练不是单纯“让模型更聪明”，而是把模型行为压到某个目标分布上。这个目标分布可能是人类写出来的回答、偏好标注、规则奖励、单元测试、工具环境反馈，也可能是安全策略。

# 十、后训练常见副作用

后训练很有用，但每一步都可能带来副作用。

**1. SFT 后模型变得模板化**

如果 SFT 数据风格太单一，模型会学成固定口吻，回答看起来稳定但缺少灵活性。

**2. 偏好优化后模型变啰嗦**

如果 chosen 回答普遍更长，DPO/RLHF 可能让模型误以为“长就是好”。

**3. 安全训练后过度拒答**

如果安全数据只有拒答，没有足够多“安全地回答正常问题”的样本，模型会变得保守。

**4. RL 后 reward hacking**

如果 reward model 或 verifier 有漏洞，模型会学会刷分，而不是真正解决任务。

**5. 能力遗忘**

某一类后训练数据比例过高，可能损伤数学、代码、长上下文或多语言能力。

因此后训练必须和评估绑定。每一次训练都要同时看目标能力是否提升，以及非目标能力是否退化。

# 十一、本篇小结

后训练的本质是行为塑形。预训练后的 base model 已经会建模语言分布，但还不稳定地服务用户；后训练通过 SFT、偏好优化、强化学习、安全对齐和工具轨迹，把模型从“会续写”推向“会执行任务”。

可以把主线记成：

```text
SFT 先让模型会照着好答案说
DPO/RLHF 让模型知道多个答案哪个更好
GRPO/RLVR 让模型在可验证任务里根据结果变强
Agentic RL 让模型在环境中通过工具把事情做完
安全对齐让模型知道边界在哪里
```
