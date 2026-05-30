---
title: LLM Base 写作规划
published: 2026-05-27
description: 大模型训练管线系列的写作说明：以知识本身为主线，围绕数据、参数、目标函数、评估和线上反馈展开。
tags: [LLM, 大模型, 学习路线]
category: LLM Base
draft: true
comment: true
---

## 写作目标

这个系列用于系统整理大模型训练管线，不写成零散名词速查，也不写成问答模板，而是尽量还原一条真实学习路径：

```text
模型为什么要预训练
预训练到底更新了哪些参数
中训练为什么能补领域和专项能力
后训练如何把 base model 塑造成 assistant model
SFT / DPO / RLHF / GRPO / Agentic RL 各自用什么信号更新模型
评估体系如何判断模型是否真的变好
数据飞轮如何把线上反馈沉淀为下一轮训练和评估数据
数据安全如何贯穿整个流程
```

写作风格参考深度学习辅导笔记：先给直觉，再讲结构和数据流，必要时补公式、表格、具体例子和工程细节。

## 当前目录

```text
01-大模型训练管线总览-从预训练到数据飞轮.md
02-预训练-pretraining-模型如何学到通用能力.md
03-中训练-continued-pretraining-领域增强与能力注入.md
04-后训练总览-post-training-sft-rlhf-dpo-grpo.md
05-SFT-监督微调-指令跟随与格式对齐.md
06-偏好学习-DPO-从RLHF到直接偏好优化.md
07-RLHF与PPO-奖励模型-策略优化-KL约束.md
08-GRPO-组内相对优势与可验证奖励.md
09-Agentic-RL-工具调用与长程任务训练.md
10-评估体系-从Benchmark到线上A-B实验.md
11-数据飞轮-从用户反馈到下一轮训练.md
12-大模型数据安全-数据清洗-去重-污染-隐私.md
13-训练管线知识索引与学习地图.md
14-开源模型案例-Olmo-3-从训练到上线.md
```

## 每篇关注点

### 01. 训练管线总览

建立生命周期主线：

```text
预训练 -> 中训练 -> 后训练 -> 评估 -> 数据飞轮
```

重点不是背阶段名，而是理解每个阶段使用什么数据、优化什么目标、改变模型哪部分行为。

### 02. 预训练

重点讲清楚 GPT 类 decoder-only Transformer 的训练数据流：

```text
文本 -> tokenizer -> token id -> embedding -> position -> Transformer -> LM head -> logits -> CE loss -> 反向传播
```

需要区分：

- tokenizer 词表和 embedding matrix。
- token embedding 和 contextual hidden state。
- input embedding 和 output LM head。
- next token loss 和语义空间涌现。

### 03. 中训练

说明 continued pretraining 如何在已有 base model 上补代码、数学、长上下文、多语言和领域分布。

重点讲：

- 中训练和 SFT 的区别。
- 中训练和 RAG 的区别。
- 数据混合、学习率、遗忘和评估。

### 04. 后训练总览

把后训练统一理解成行为塑形：

```text
SFT：模仿好答案
DPO：学习相对偏好
RLHF/PPO：用 reward model 优化偏好
GRPO/RLVR：用可验证奖励优化采样结果
Agentic RL：用环境反馈优化任务轨迹
Safety：建立边界
```

### 05. SFT

重点写 messages、chat template、label mask、assistant token loss、packing、截断、数据混合和训练副作用。

### 06. DPO

围绕 prompt、chosen、rejected、policy model、reference model、beta 和 log-prob gap 展开。

重点讲清楚：

```text
policy_gap = log pi(chosen) - log pi(rejected)
ref_gap = log pi_ref(chosen) - log pi_ref(rejected)
loss = -log sigmoid(beta * (policy_gap - ref_gap))
```

### 07. RLHF/PPO

重点讲 SFT、Reward Model、PPO 三阶段，以及 reward、value、advantage、KL、clip、rollout 的作用。

### 08. GRPO

围绕同题多采样和组内相对优势展开：

```text
A_i = (r_i - mean(group_rewards)) / std(group_rewards)
```

说明为什么可以省掉 critic，以及它和 DPO / PPO / RLVR 的关系。

### 09. Agentic RL

把 Agent 任务写成 RL 问题：

```text
state, action, observation, reward, episode
```

重点讲工具轨迹、环境反馈、成功/失败 reward、长程 credit assignment 和安全边界。

### 10. 评估体系

从 benchmark 扩展到完整评估矩阵：

- 通用能力。
- 领域能力。
- RAG。
- Agent。
- 安全。
- 人工评测。
- 线上 A/B。
- 回归集。

### 11. 数据飞轮

重点讲线上日志如何变成训练和评估数据：

```text
采集 -> 归因 -> 清洗 -> 脱敏 -> 标注 -> 分流 -> 训练/评估/安全回归
```

### 12. 数据安全

覆盖：

- PII 脱敏。
- 去重。
- 测试集污染。
- 数据投毒。
- 版权许可。
- 企业数据血缘和审计。

### 13. 知识索引

不做问答模板，只做学习地图，把前 12 篇从参数、数据、loss、评估和安全视角串起来。

### 14. 开源模型案例

以 AI2 的 Olmo 3 为例，把预训练、中训练、长上下文扩展、后训练、评估、发布和数据可追踪闭环串成一个完整案例。
