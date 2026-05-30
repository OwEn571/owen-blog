---
title: RLHF 与 PPO：奖励模型、策略优化和 KL 约束
published: 2026-05-27
description: 梳理 RLHF 的三阶段流程：SFT、Reward Model 和 PPO，并解释为什么 KL 约束对大模型对齐训练很重要。
tags: [LLM, RLHF, PPO, RewardModel]
category: LLM Base
draft: false
comment: true
---

> RLHF 是把人类反馈引入大模型训练的经典路线。它的核心不是“让人类手写所有答案”，而是让人类表达偏好，再用奖励模型和强化学习把这种偏好传递给语言模型。

# 一、RLHF 是什么

RLHF 全称是 Reinforcement Learning from Human Feedback，人类反馈强化学习。

它解决的问题是：

> 当一个问题有多个可行回答时，如何让模型更倾向人类觉得有帮助、真实、安全、清晰的回答？

预训练让模型会续写，SFT 让模型会按指令回答，但仍然可能出现：

- 回答过长或过短。
- 事实不够准确。
- 语气不合适。
- 安全边界不稳定。
- 多个回答里选不到更好的那个。

RLHF 用人类偏好来训练模型，让模型更符合人类主观质量标准。

# 二、RLHF 的经典三阶段

经典 RLHF 可以分成三步：

```text
1. SFT：训练一个初始 assistant model
2. Reward Model：用人类偏好数据训练奖励模型
3. PPO：用奖励模型给生成结果打分，再优化策略模型
```

<!-- TODO: 图片占位：可以补一张 RLHF 三阶段流程图：SFT -> RM -> PPO。 -->

## 1. SFT 阶段

先用指令数据训练一个能正常对话的模型。

如果没有 SFT，直接让 base model 进入 RL，起点太差，训练会很不稳定。

SFT 阶段的目标是让模型先具备：

- 基础指令跟随。
- 对话格式。
- 基本安全边界。
- 可读回答风格。

## 2. Reward Model 阶段

收集偏好数据。

一条数据通常是：

```text
prompt: 用户问题
response A: 回答 A
response B: 回答 B
label: 人类更喜欢 A
```

训练 reward model 的目标是：

```text
r(prompt, chosen) > r(prompt, rejected)
```

也就是让它给 chosen 更高分。

reward model 本质上是一个打分器：

```text
输入：prompt + response
输出：一个标量 reward
```

## 3. PPO 阶段

有了 reward model 后，就可以让当前策略模型生成回答，再用 reward model 打分。

PPO 会更新策略模型，让它更容易生成高 reward 的回答。

但这里不能只追求 reward，还要限制模型不要偏离 SFT 模型太远，所以通常会加 KL 惩罚。

# 三、PPO 在这里做什么

PPO 全称 Proximal Policy Optimization。

在普通强化学习里，PPO 用来让策略在获得更高奖励的同时，不要每次更新太猛。

放到 LLM 里，可以这样理解：

- 状态：prompt 和已生成的上下文。
- 动作：下一个 token。
- 策略：语言模型的 token 分布。
- 奖励：reward model 对完整回答的打分。

模型生成一个回答后，reward model 给分。PPO 根据这个分数更新模型，让高分回答的 token 概率上升，低分回答的 token 概率下降。

但是语言模型的动作空间是整个词表，序列又很长，所以 RLHF/PPO 工程上比普通 SFT 复杂很多。

更完整一点，PPO 里通常还会引入 value model。reward model 给的是整段回答的最终质量分，但 PPO 需要估计“每个 token 动作对最终奖励的贡献”。value model 的作用是估计当前状态的价值，用来构造 advantage：

```text
advantage = 实际回报 - value 估计
```

advantage 为正，说明这个 token 选择比预期好；advantage 为负，说明比预期差。PPO 通过 advantage 来决定哪些 token 的概率该提高，哪些该压低。

# 四、为什么需要 KL 约束

KL 约束是 RLHF 里非常重要的概念。

如果只让模型最大化 reward model 分数，它可能会：

- 生成 reward model 喜欢但人类不喜欢的模板话。
- 变得异常啰嗦，因为 reward model 偏好详细回答。
- 重复安全声明，刷高安全分。
- 牺牲事实准确性，追求表面风格。
- 语言能力退化。

这就是 reward hacking：模型找到了奖励模型的漏洞。

所以 RLHF 通常会让策略模型不要偏离 reference model 太远：

```text
最终目标 = reward model 分数 - beta * KL(policy || reference)
```

reference model 通常是 SFT 模型。

KL 约束的直觉是：

> 模型可以变得更符合人类偏好，但不能为了刷分把原来的语言能力和行为边界破坏掉。

# 五、Reward Model 怎么训练

Reward model 通常使用 pairwise preference loss。

给定同一个 prompt 的 chosen 和 rejected，希望：

```text
reward(chosen) > reward(rejected)
```

直觉上就是一个排序问题。

比如：

```text
prompt: 请解释 Transformer 的自注意力机制。

chosen: 先解释 Q/K/V，再解释注意力权重，最后给例子。
rejected: Transformer 是一种很强的模型，注意力很重要。
```

reward model 要学会给 chosen 更高分。

它学到的不是标准答案，而是偏好标准：

- 是否有帮助。
- 是否真实。
- 是否清晰。
- 是否安全。
- 是否符合指令。

# 六、RLHF 的优势

RLHF 的价值在于，它能优化很多很难写成标准答案的目标。

比如：

- 回答是否有帮助。
- 语气是否自然。
- 解释是否清楚。
- 是否适合用户水平。
- 是否过度拒答。
- 是否符合安全政策。

这些目标很难用一个固定标签表示，但人类可以通过比较两个回答表达偏好。

RLHF 把这种偏好变成 reward，再用强化学习优化模型。

# 七、RLHF 的难点

## 1. 工程复杂

要维护 SFT model、reward model、policy model、reference model，有时还要 value model。

训练过程涉及采样、打分、优势估计、KL 控制、PPO 更新。

## 2. 训练不稳定

奖励尺度、KL 系数、学习率、采样温度、batch size 都会影响结果。

## 3. Reward hacking

策略模型可能学会利用 reward model 漏洞，而不是真的变好。

## 4. 标注成本高

偏好数据需要人类或高质量模型标注，标准还要统一。

## 5. 评估困难

reward 分数提高，不代表真实用户体验一定提高。必须配合离线评估、人工评测和线上 A/B。

# 八、RLHF 和 DPO 怎么放在一起理解

可以把它们都看成人类偏好优化，只是实现方式不同。

| 维度 | RLHF/PPO | DPO |
| --- | --- | --- |
| 偏好信号 | 先训练 reward model | 直接用 chosen/rejected |
| 策略优化 | PPO 强化学习 | 监督式 loss |
| 是否在线采样 | 通常需要 | 通常不需要 |
| 工程成本 | 高 | 低 |
| 稳定性 | 难调 | 相对稳定 |
| 适合任务 | 复杂奖励、在线优化、探索 | 离线偏好对齐 |

> DPO 是对 RLHF 目标的一种简化实现，它把 reward model 和 PPO 这条链路合并成直接偏好优化。但在需要在线探索、环境反馈或复杂奖励的场景，RLHF/PPO 或其他 RL 方法仍然有价值。

# 九、一个具体例子：客服模型对齐

假设要做客服助手，用户问：

```text
我的订单一直没发货，怎么办？
```

模型可能生成两个回答：

```text
A: 很抱歉给你带来不便。你可以先在订单页查看物流状态，如果超过承诺发货时间，建议联系客服申请催发或退款。我也可以帮你整理需要提供的信息。

B: 订单没发货可能是仓库问题，你等一下就行。
```

人类更喜欢 A。

Reward model 学到 A 分数更高。PPO 阶段，模型会更倾向生成类似 A 的回答：先安抚，再给步骤，再提供下一步帮助。

但如果 reward model 过度偏好“很抱歉”，模型可能每句话都道歉。所以还要有 KL 约束和人工评估。

# 十、RLHF 训练中的几个关键量

## 1. Policy model

正在被更新的语言模型。它负责根据 prompt 生成回答。

## 2. Reference model

通常是冻结的 SFT 模型。它提供 KL 约束的基准。

## 3. Reward model

给完整回答打分。它本身来自偏好数据训练，因此只是人类偏好的近似器，不是真理。

## 4. Value model / Critic

估计当前状态未来能获得多少 reward，用来降低策略梯度方差。

## 5. KL penalty

控制 policy model 不要偏离 reference 太远。KL 太小，模型可能 reward hacking；KL 太大，模型学不动。

## 6. Rollout

让当前 policy model 实际采样生成回答的过程。RLHF/PPO 的成本很大一部分来自 rollout，因为训练时不只是读静态数据，还要不断生成新样本。

# 十一、PPO 目标的直觉

PPO 名字里的 Proximal 表示“别一步迈太大”。

如果新策略和旧策略差异太大，训练会不稳定。PPO 用 ratio 来衡量新旧策略对同一个 token 的概率变化：

```text
ratio = pi_new(action | state) / pi_old(action | state)
```

然后用 clipping 把 ratio 限制在一个范围内，比如：

```text
[1 - epsilon, 1 + epsilon]
```

直觉是：

- 如果某个 token 方向是对的，可以提高概率。
- 但不能一下子提高太多。
- 如果方向是错的，可以降低概率。
- 但也不能一下子把策略打崩。

LLM 里的 PPO 还会额外加入 KL penalty，于是训练目标同时包含：

```text
提高 reward
控制 policy update 幅度
控制和 reference model 的距离
```

# 十二、本篇小结

RLHF/PPO 是一条完整但比较重的偏好优化路线。它先用人类偏好训练 reward model，再让 policy model 通过 rollout 生成回答，用 PPO 根据 reward、advantage、KL 和 clipping 更新参数。

它的优势是可以接入复杂偏好和在线采样，缺点是组件多、显存贵、训练难调、reward hacking 风险高。因此后来的 DPO、GRPO 等方法，本质上都在尝试保留偏好优化的收益，同时降低 RLHF/PPO 的工程复杂度。
