---
title: GRPO：组内相对优势与可验证奖励
published: 2026-05-27
description: 解释 GRPO 为什么可以不训练 critic/value model，以及它如何用同一 prompt 下多条回答的组内相对奖励优化模型。
tags: [LLM, GRPO, RLVR, 强化学习]
category: LLM Base
draft: false
comment: true
---

> GRPO 可以先理解成一种更轻量的策略优化方法：同一个问题多采样几条回答，在这一组里比较谁更好，然后用相对好坏来更新模型。

# 一、GRPO 是什么

GRPO 全称是 Group Relative Policy Optimization，组内相对策略优化。

它的核心思想是：

> 对同一个 prompt 采样多条回答，用 reward function 或 verifier 给每条回答打分，然后在组内计算相对优势，用这个相对优势更新 policy model。

和 PPO 相比，GRPO 一个重要特点是：不需要额外训练 value model / critic。

为什么能省掉 critic？

因为它用同一 prompt 下的一组回答作为比较基准。每条回答好不好，不是只看绝对 reward，而是看它相对于组内其他回答怎么样。

简单记：

```text
PPO：需要 value model 估计 baseline / advantage
GRPO：用同组多个回答的平均和方差来构造 relative advantage
```

# 二、为什么提出 GRPO

在 LLM 强化学习里，PPO 很经典，但成本比较高：

- 需要 policy model。
- 需要 reference model。
- 常常还需要 reward model。
- 还需要 value model / critic 来估计 advantage。
- 训练链路复杂，显存和调参成本都高。

对于数学、代码、规则验证这类任务，我们经常能直接得到 reward。

比如：

- 数学题最终答案是否正确。
- 代码是否通过单元测试。
- JSON 是否符合 schema。
- 工具调用参数是否合法。
- 检索答案是否命中标准证据。

既然 reward 可以直接给，能不能少一点模型组件？

GRPO 的思路就是：不训练 critic，而是让同一 prompt 的多条采样互相做参照。

<!-- TODO: 图片占位：可以补一张“同一 prompt 采样 G 个回答 -> reward -> 组内归一化 -> policy update”的示意图。 -->

# 三、训练流程

GRPO 的流程可以记成 5 步。

## 1. 采样一组回答

对同一个 prompt，当前 policy model 采样 G 个回答：

```text
prompt: 计算 17 * 23，并给出过程。

response 1: 17 * 23 = 391
response 2: 17 * 23 = 381
response 3: 17 * 20 = 340，17 * 3 = 51，所以结果 391
response 4: 17 * 23 = 392
```

G 是组大小，是 GRPO 里很重要的超参。

## 2. 给每条回答打 reward

可以用规则、测试、reward model 或 verifier。

比如只看最终答案：

```text
response 1: reward = 1
response 2: reward = 0
response 3: reward = 1
response 4: reward = 0
```

也可以更细：

```text
答案正确 +1
格式正确 +0.2
过程无明显错误 +0.3
```

## 3. 做组内归一化

计算这一组 reward 的均值和标准差，把每条回答转成相对优势。

直觉上：

```text
高于组平均 -> advantage 为正
低于组平均 -> advantage 为负
接近组平均 -> advantage 接近 0
```

这样就不需要一个单独的 critic 来估计 baseline。

如果写成一个很简化的形式，组内第 i 个回答的 advantage 可以理解为：

```text
A_i = (r_i - mean(r_1, ..., r_G)) / std(r_1, ..., r_G)
```

其中 G 是同一个 prompt 下采样的回答数量。这样 reward 的绝对大小不再是唯一重点，回答在组内的相对排名更重要。

## 4. 更新策略

用 policy gradient 的方式：

- advantage 为正的回答：提高生成概率。
- advantage 为负的回答：降低生成概率。

同时通常会加入 KL 或 clipping，防止模型更新过猛。

## 5. 重复迭代

不断采样、打分、组内比较、更新。

这就是一个强化学习过程，只是 advantage 的构造方式更轻量。

# 四、GRPO 里的关键超参

常见要关注：

| 超参 | 含义 |
| --- | --- |
| G | 每个 prompt 采样多少条回答 |
| beta | KL 惩罚强度 |
| clip range | 策略更新裁剪范围 |
| learning rate | 学习率 |
| temperature | 采样温度，影响回答多样性 |
| max completion length | 最大生成长度 |
| batch size | 批大小 |
| reward normalization | reward 是否归一化、如何归一化 |

几个直觉：

- G 太小，组内比较不稳定。
- G 太大，采样成本上升。
- temperature 太低，回答太像，比较不出差异。
- temperature 太高，噪声变多。
- KL 太弱，模型容易跑偏。
- KL 太强，模型学不动。

# 五、GRPO 和 PPO 的区别

| 对比项 | PPO | GRPO |
| --- | --- | --- |
| Advantage 来源 | 通常依赖 value model / critic | 同组 reward 相对归一化 |
| 模型组件 | policy、reference、reward、value | policy、reference、reward/verifier |
| 成本 | 更高 | 相对更低 |
| 适合场景 | 通用 RLHF、复杂奖励 | 可验证任务、组内比较 |
| 训练复杂度 | 高 | 相对低 |

可以这样说：

> GRPO 不是完全推翻 PPO，而是在 LLM 场景下用组内相对 reward 替代 critic 的 advantage 估计，从而降低训练复杂度。

# 六、GRPO 和 DPO 的区别

DPO 和 GRPO 都常出现在后训练里，但差别很大。

| 对比项 | DPO | GRPO |
| --- | --- | --- |
| 数据 | 静态偏好对 chosen/rejected | 当前策略采样的一组回答 |
| 奖励 | 偏好标签 | reward function / verifier / rule |
| 是否在线采样 | 通常不需要 | 需要 |
| 优化直觉 | 提高 chosen 相对 rejected 概率 | 提高组内高 reward 回答概率 |
| 适合任务 | 离线偏好优化 | 数学、代码、工具调用、可验证任务 |

一个简单判断：

- 如果手里是大量人类偏好对：DPO 很合适。
- 如果任务能自动判断对错，并且希望模型自己探索多种解法：GRPO 更自然。

# 七、GRPO 和 RLVR 的关系

RLVR 是 Reinforcement Learning with Verifiable Rewards，可验证奖励强化学习。

它强调 reward 可以由规则或验证器给出，而不是依赖主观人类打分。

GRPO 可以作为 RLVR 的一种优化方法。

比如数学题：

```text
prompt: 解方程 2x + 3 = 11
verifier: 检查最终答案 x = 4 是否正确
reward: 正确为 1，错误为 0
```

这类任务很适合 RLVR，因为奖励清楚、便宜、可重复。

但不是所有任务都适合。

开放式写作、审美、情感支持这类任务，很难用规则判断好坏，仍然需要人类偏好或更复杂的 reward model。

# 八、一个具体例子：代码任务

prompt：

```text
写一个 Python 函数，判断字符串是否是回文。
```

模型采样 4 个回答：

1. 能处理普通字符串，通过测试，reward = 1。
2. 忘记大小写处理，部分通过，reward = 0.5。
3. 语法错误，reward = 0。
4. 函数名不符合要求，reward = 0.2。

GRPO 会在这组回答里计算相对优势：

- 第 1 个明显高于平均，概率上升。
- 第 3 个低于平均，概率下降。
- 第 2 和第 4 个根据相对位置微调。

如果不断用单元测试作为 reward，模型就会更倾向生成能跑通测试的代码。

# 九、GRPO 的风险

## 1. Reward 设计决定方向

如果 reward 只看最终答案，模型可能过程胡写但答案对。

如果 reward 只看格式，模型可能格式漂亮但内容错。

## 2. Verifier 不可靠会误导训练

验证器漏判、误判都会直接影响模型更新。

## 3. 可能过拟合特定题型

如果训练题型单一，模型可能学会套路，而不是真正泛化。

## 4. 采样成本仍然存在

虽然省掉 critic，但每个 prompt 要采样多条回答，推理成本不低。

## 5. 组内 reward 全一样时学不到东西

如果 G 个回答 reward 都是 0，或者都一样，组内相对优势接近 0，训练信号会很弱。

这说明 GRPO 依赖“采样能产生差异”。采样温度、prompt 难度、reward 粒度都会影响训练是否有效。

# 十、GRPO 的适用边界

GRPO 特别适合下面这类任务：

- 最终答案能自动校验。
- 同一个 prompt 可以采样出多个不同质量的回答。
- reward 计算成本低于人工偏好标注。
- 希望模型自己探索解法，而不是只模仿离线数据。

但它不适合所有任务。

开放式写作、审美、情绪支持、复杂价值判断，很难靠规则 reward 准确判断好坏。对于这类任务，DPO、RLHF、人类评审和线上反馈仍然更重要。

# 十一、本篇小结

GRPO 的关键在“组内相对”。它把同一个 prompt 下的多条采样放在一起比较，用组内 reward 的均值和方差构造 advantage，从而省掉 PPO 中常见的 critic/value model。

可以把它记成：

```text
同题多答
-> verifier / reward 打分
-> 组内归一化
-> 高于平均的回答概率上升
-> 低于平均的回答概率下降
-> KL / clip 控制更新幅度
```

它和 DPO 的差别在于：DPO 学离线偏好对，GRPO 学当前策略采样后的可验证反馈。
