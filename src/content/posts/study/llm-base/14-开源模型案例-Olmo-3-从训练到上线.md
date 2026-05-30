---
title: 开源模型案例：Olmo 3 如何从训练走到上线
published: 2026-05-28
description: 以 AI2 的 Olmo 3 为案例，把预训练、中训练、长上下文扩展、后训练、评估、发布和数据闭环串成一条真实的开源模型流水线。
tags: [LLM, Olmo, OpenModel, TrainingPipeline]
category: LLM Base
draft: false
comment: true
---

> 学完预训练、中训练、后训练、评估和数据飞轮之后，最容易缺的是一个真实案例。很多模型只开放权重，不开放训练数据和训练过程，很难用来学习完整管线。AI2 的 Olmo 3 是一个很适合拆解的例子：它公开的不只是最终模型，而是尽量公开从数据、代码、训练阶段、检查点到评估工具的整条 model flow。

# 一、为什么选 Olmo 3

Olmo 3 是 Allen Institute for AI（AI2）发布的 fully open language model family。它的重点不只是性能，而是开放程度。

这里要先区分两个概念：

| 类型 | 通常开放什么 | 学习价值 |
| --- | --- | --- |
| open-weight model | 最终权重、模型卡、少量技术报告 | 可以部署和微调，但很难复现训练过程 |
| fully open model | 权重、训练数据、训练代码、评估代码、中间检查点、数据处理工具 | 可以研究模型能力如何随数据和训练阶段形成 |

Olmo 3 的官方论文摘要明确说，它释放的是 entire model flow，也就是模型家族的完整生命周期：每个阶段、检查点、数据点和依赖。这个公开度非常适合拿来学习“一个模型到底怎么从训练走到上线”。

需要注意：Olmo 3 虽然公开度很高，但它也不是把企业内部线上用户日志、商业 A/B 决策、成本账本全部公开。它最适合学习的是研究型开放模型的训练、评估、发布和可追踪闭环。

# 二、总览：Olmo 3 的生命周期

把 Olmo 3 放进前面学过的训练管线，可以这样看：

```text
数据收集与清洗
-> Pretraining：大规模通用预训练
-> Mid-training：数学、代码、阅读理解等专项增强
-> Long-context extension：长上下文扩展
-> Post-training：SFT / DPO / RLVR
-> Evaluation：OLMES、OlmoBaseEval、decontamination
-> Release：Hugging Face、Ai2 Playground、OpenRouter
-> Trace / feedback：OlmoTrace、社区复现、数据和训练决策分析
```

这条线刚好对应我们前面学过的五个问题：

| 问题 | 在 Olmo 3 中的对应 |
| --- | --- |
| 预训练学什么 | 用 Dolma 3 Mix 做 next token prediction，建立基础语言、代码、知识和推理底座 |
| 为什么需要中训练 | 用更难、更高质量的数据强化数学、代码、阅读理解等专项能力 |
| 后训练有哪些阶段 | SFT 教指令行为，DPO 调整偏好，RLVR 强化可验证任务 |
| 评估体系怎么分层 | base model 有 OlmoBaseEval，post-training 有任务评估、安全/格式/推理评估，还要做数据污染检测 |
| 数据飞轮怎么闭环 | OlmoTrace 和开放工具让输出能回溯到训练数据，社区可以复现、审计、修改数据配方再训练 |

# 三、数据层：先把“吃什么”公开

Olmo 3 的数据不是一个单一文件，而是分阶段设计的数据课程。

## 1. Dolma 3：大规模原始语料池

Olmo 3 的预训练数据来自 Dolma 3。官方介绍里提到，Dolma 3 是约 9.3T token 的语料池，来源包括：

- web pages。
- science PDFs，经由 olmOCR 处理。
- codebases。
- math problems and solutions。
- encyclopedic text。

这些数据先经过清洗、去重、质量过滤和去污染，再被构造成真正用于训练的混合数据。

这里可以对应前面“数据安全”那篇：

```text
原始数据
-> 去重
-> 质量过滤
-> benchmark decontamination
-> 数据混合比例设计
-> tokenize
-> 进入训练
```

## 2. Dolma 3 Mix：预训练混合数据

从 Dolma 3 语料池中，AI2 构造了 Dolma 3 Mix，规模约 5.9T token，也就是接近 6T token 的预训练混合数据。

这一步的目标不是教模型“怎么聊天”，而是让模型广泛学习语言分布：

```text
给定前文 token
-> 预测下一个 token
-> 计算 Language Modeling loss
-> 更新 Transformer 参数
```

所以这一阶段学到的是 base model 的底层能力：语言、知识、代码、数学符号、文档结构、常见推理模式等。

## 3. Dolma 3 Dolmino：中训练数据

预训练之后，Olmo 3 还有 mid-training 阶段。官方博客提到，Dolma 3 Dolmino 是中训练混合数据：从约 2.2T token 的高质量池子里采样 100B training tokens。

这个数据更偏向：

- math。
- science。
- code。
- instruction-following。
- reading comprehension。
- reasoning traces。

这正好解释“为什么需要中训练”：预训练覆盖面广，但不一定在高难度能力上足够密集。中训练通过更聚焦的数据分布，让模型在后训练前先把专项底座补厚。

中训练仍然主要是 Language Modeling loss，不是 assistant token CE loss。它不是让模型模仿一个标准助手回答，而是继续学习某类语料分布。

## 4. Dolma 3 Longmino：长上下文扩展

Olmo 3 还单独做 long-context extension。官方介绍中，Dolma 3 Longmino 约 50B training tokens，来自一个 639B token 的长文档池，并混合中训练数据。

这一步的目标是让模型更擅长处理：

- 长报告。
- 多章节文档。
- 长日志。
- 长代码上下文。
- 需要跨远距离引用的信息。

它可以理解成一种专项能力训练：不是单纯扩大 context window 的配置，而是让模型在训练中真正见到长上下文任务。

# 四、模型层：从 base 到不同用途的分支

Olmo 3 的模型家族包含 7B 和 32B 等规模。官方论文摘要提到，Olmo 3 面向 long-context reasoning、function calling、coding、instruction following、general chat 和 knowledge recall 等目标。

从结构上看，它仍然是 decoder-only Transformer。对我们这套笔记来说，重点不是背具体每层参数，而是理解它的训练分支：

```text
Olmo 3 Base
-> Mid-trained checkpoint
-> Long-context checkpoint
-> Post-training branches
   -> Olmo 3 Instruct
   -> Olmo 3 Think
   -> Olmo 3 RL Zero
```

AI2 不只发布最后的一个权重，而是发布关键训练阶段的 checkpoint。这样研究者可以比较：

```text
只预训练后的模型会什么
中训练后哪些能力提升
长上下文扩展改变了什么
SFT 后行为如何变化
DPO / RLVR 后推理和偏好如何变化
```

这就是 model flow 对学习者最有价值的地方：它把“模型能力是怎么长出来的”拆成可观察的时间线。

# 五、后训练层：SFT、DPO、RLVR

Olmo 3 的 post-training 继承了 Tulu 3 系列的经验，核心是三段：

```text
SFT
-> DPO
-> RLVR
```

## 1. SFT：先教模型按指令回答

SFT 是 Supervised Fine-Tuning，监督微调。

在这个阶段，数据通常是：

```text
instruction / messages
-> assistant response
```

训练时会把 system、user、assistant 按 chat template 拼成 token 序列，然后通常只在 assistant answer token 上计算 cross-entropy loss。

它解决的是：

- 是否理解用户是在提需求。
- 是否按对话格式回答。
- 是否遵守输出格式。
- 是否能完成常见任务流程。

SFT 不是主要用来灌知识。知识和能力底座更多来自预训练、中训练和检索系统。

## 2. DPO：用偏好对调整相对概率

DPO 是 Direct Preference Optimization，直接偏好优化。

它的数据形态通常是：

```text
prompt
chosen response
rejected response
```

DPO 的目标不是“照抄 chosen”，而是让模型在同一个 prompt 下更偏向 chosen、远离 rejected。

在 Olmo 3/Tulu 这条线里，DPO 负责把模型从“能回答”进一步推向“回答更符合偏好”。

## 3. RLVR：用可验证奖励训练

RLVR 是 Reinforcement Learning with Verifiable Rewards，基于可验证奖励的强化学习。

它适合那些能自动判断结果对错的任务，例如：

- 数学题最终答案。
- 代码单元测试。
- 格式约束。
- 一部分工具调用任务。

和 RLHF 依赖 reward model 不同，RLVR 的奖励可以来自明确 verifier：

```text
生成答案
-> verifier 检查答案/测试/格式
-> 得到 reward
-> 更新策略模型
```

这能减少“奖励模型自己也判断不准”的问题，但也会带来新的风险：模型可能钻 verifier 的空子，所以仍然需要评估和安全检查。

# 六、评估层：不是只看一个榜单

Olmo 3 的评估有两个关键词：reproducible evals 和 decontamination。

AI2 公开了 OLMES 评估工具，并在 Olmo 3 中使用 OlmoBaseEval 做 base model development。Tulu 3 的评估设计也强调：

- 评估要可复现。
- 要看 unseen tasks，不能只看开发集。
- prompting 和模板要尽量公平。
- 训练数据要对评估集做 decontamination。

对应到我们前面的评估分层，可以这样映射：

| 评估层次 | Olmo 3 案例中的体现 |
| --- | --- |
| 通用能力评估 | base model 的知识、推理、数学、代码评估 |
| 领域/专项能力评估 | math、code、reading comprehension、long-context |
| 产品能力评估 | instruction following、function calling、tool use |
| 安全能力评估 | post-training 后的安全、越狱、过度拒答等检查 |
| 线上效果评估 | Playground / API 暴露后的真实使用反馈；但详细商业 A/B 不属于公开材料主体 |

一个重要细节是 decontamination。AI2 的工具链里有 `decon`，用于从训练数据中移除测试集相关内容。这样做的目的不是让分数更漂亮，而是让评估更可信。

# 七、发布与上线：从权重到可用入口

Olmo 3 的公开发布包括几个层次。

## 1. 模型和数据下载

模型权重、数据集和中间检查点发布在 Hugging Face 等平台。对研究者来说，这意味着可以：

- 直接加载最终模型。
- 从某个中间 checkpoint 继续实验。
- 复用数据配方。
- 检查训练和评估代码。

这和只发布一个 `model.safetensors` 的模型很不一样。后者只能告诉你“训练结果是什么”，而 Olmo 3 尽量告诉你“结果是怎么来的”。

## 2. Demo 和 API 入口

官方博客提供了几个使用入口：

- Ai2 Playground：可以直接体验模型。
- OpenRouter：可以通过统一 API 调用。
- Hugging Face：下载模型和数据。

从工程角度看，这对应的是：

```text
训练完成
-> 评估通过
-> 打包权重和 tokenizer
-> 发布模型卡和数据说明
-> 部署到 demo / API
-> 收集使用反馈和问题
```

这里的“上线”更像研究型开放发布，而不是某个商业产品的完整灰度、A/B 和营收指标公开。

# 八、数据闭环：OlmoTrace 带来的可追踪性

Olmo 3 很特别的一点是和 OlmoTrace 结合。官方博客举例说，在 Ai2 Playground 中，可以让 Olmo 3 Think 32B 回答问题，然后用 OlmoTrace 检查模型生成内容可能来自哪些训练数据。

这和普通数据飞轮不完全一样。

普通线上数据飞轮更像：

```text
用户使用
-> 收集 badcase
-> 归因
-> 清洗脱敏
-> 标注
-> 进入训练集或评估集
-> 新模型上线
```

OlmoTrace 更像研究型闭环：

```text
模型输出
-> 回溯相关训练数据
-> 判断输出是否受某类数据影响
-> 修改数据清洗、混合比例或训练阶段
-> 复现实验或训练新版本
```

它的价值在于让“模型为什么这么答”不再完全黑箱。对于学习者来说，这能帮助理解：

- 数据不是抽象概念，具体样本会影响模型行为。
- 评估 badcase 可以追到训练数据和训练阶段。
- 开放数据和中间检查点能让能力变化被研究，而不是只能猜。

# 九、把 Olmo 3 串回五个核心问题

## 1. 预训练学什么

Olmo 3 的预训练用 Dolma 3 Mix 做 Language Modeling。模型学到的是从上下文预测下一个 token 的能力。这种能力不是存在某一张“知识表”里，而是分散在 embedding、attention、FFN、norm 和 LM Head 等参数中。

## 2. 为什么需要中训练

Olmo 3 的 Dolmino 阶段说明：如果只靠通用预训练，数学、代码、阅读理解和复杂推理的密度可能不够。中训练用更聚焦的数据继续训练，让 base model 的专项能力更厚。

## 3. 后训练有哪些阶段

Olmo 3 的 post-training 可以记成：

```text
SFT：教行为格式
DPO：调偏好
RLVR：强化可验证任务
```

这比“微调一下”清楚得多：每个阶段的数据形态、优化信号和风险都不同。

## 4. 评估体系怎么分层

Olmo 3 不只是报一个榜单，而是配套评估工具和去污染工具。base、instruct、think、RL 分支都需要不同评估维度。离线 benchmark 是基础，指令跟随、工具调用、安全和真实使用反馈也都要看。

## 5. 数据飞轮怎么闭环

Olmo 3 的公开闭环重点是 traceability：用 OlmoTrace 把输出和训练数据联系起来。它没有完整公开商业线上 A/B 数据，但提供了一种更适合研究的闭环：看见输出、追溯数据、修改配方、复现实验。

# 十、这个案例给我们的启发

Olmo 3 这个案例最有学习价值的地方，不是“它某个分数超过谁”，而是它把模型开发拆成了可检查的阶段。

可以把它当成一条标准参照线：

```text
数据是否公开
训练代码是否公开
训练阶段是否清楚
是否有中间 checkpoint
后训练数据和方法是否说明
评估代码是否可复现
是否做 benchmark decontamination
是否有部署入口
是否能从 badcase 回到数据和训练决策
```

以后看别的模型，比如 Llama、Qwen、DeepSeek、Mistral、Gemma，可以用这张表反问：

```text
它开放的是权重，还是完整训练流？
它说了数据来源吗？
它说了预训练 token 数和中训练数据吗？
它说了 SFT / DPO / RL 的数据和方法吗？
它的评估是否去污染？
它是否公开中间检查点和训练日志？
它上线后的反馈如何进入下一轮？
```

如果这些问题大多没有答案，那就说明它是一个可用模型，但不一定是一个适合学习完整训练管线的案例。

# 资料来源

- [Olmo 3: Charting a path through the model flow to lead open-source AI](https://allenai.org/blog/olmo3)
- [Olmo 3 paper, arXiv:2512.13961](https://arxiv.org/abs/2512.13961)
- [OLMo 2 / Olmo models official page](https://allenai.org/olmo2)
- [Tülu 3: The next era in open post-training](https://allenai.org/blog/tulu-3-technical)
- [OLMo 2 32B release blog](https://allenai.org/blog/olmo2-32b)
