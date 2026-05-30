---
title: 偏好学习 DPO：从 RLHF 到直接偏好优化
published: 2026-05-27
description: 用 prompt、chosen、rejected、reference model 和 beta 这几个核心概念理解 DPO 为什么能绕过显式奖励模型，直接优化人类偏好。
tags: [LLM, DPO, RLHF, 偏好优化]
category: LLM Base
draft: false
comment: true
---

> DPO 的直觉不复杂：既然我们已经知道同一个 prompt 下哪个回答更好，那就直接提高好回答的相对概率、压低差回答的相对概率。它真正巧妙的地方，是把 RLHF 中的奖励模型和策略优化合并成了一个可以直接反向传播的偏好损失。

# 一、DPO 要解决什么问题

先从 RLHF 的经典流程说起：

```text
SFT 模型
-> 收集人类偏好数据
-> 训练 Reward Model
-> 用 PPO 优化策略模型
```

这条路线很完整，但工程上比较重：

- 要训练一个额外的 reward model。
- PPO 训练需要采样、打分、更新，流程复杂。
- 训练稳定性比较敏感。
- reward model 可能被策略模型钻空子。
- 显存、算力和调参成本都比较高。

DPO 的目标就是把这条链路简化：

> 不显式训练 reward model，也不跑 PPO，而是直接用偏好对训练策略模型。

它使用的数据很简单：

```text
prompt: 用户问题
chosen: 人类更喜欢的回答
rejected: 人类不喜欢的回答
```

比如：

```text
prompt:
解释什么是预训练。

chosen:
预训练是大模型训练的第一阶段，通常用大规模无标注语料做 next token prediction...

rejected:
预训练就是提前训练一下模型，让它比较聪明。
```

DPO 的训练目标就是让模型更倾向 chosen，而不是 rejected。

# 二、先建立直觉：一抬一踩

最朴素的理解是：

```text
对 chosen：提高模型生成它的概率
对 rejected：降低模型生成它的概率
```

但如果只是这样，会有一个问题：模型可能偏离原来的 SFT 模型太远，导致语言质量、格式和安全边界被破坏。

所以 DPO 不是单纯比较 policy model 自己的概率，而是比较：

```text
policy model 相对 reference model 的变化
```

也就是说，DPO 关心的是：

> 当前模型相比参考模型，是不是更偏向 chosen，而不是 rejected。

reference model 通常是冻结的 SFT 模型。它相当于一个锚点，提醒 policy model 不要乱飞。

<!-- TODO: 图片占位：可以补一张 DPO 中 policy/reference 同时计算 chosen/rejected log-prob 的流程图。 -->

# 三、核心概念

## 1. Policy Model

正在训练的模型。

它会对 chosen 和 rejected 都计算 log probability。

## 2. Reference Model

冻结不动的参考模型，通常是 SFT 后的模型。

它提供一个基准，防止 policy model 为了偏好数据过度偏移。

## 3. Chosen / Rejected

偏好数据里的好回答和差回答。

chosen 不一定是“绝对正确”，rejected 也不一定完全错误。它们表示的是相对偏好。

## 4. Log Probability

DPO 不需要模型重新生成回答，而是把已有回答喂进去，计算模型生成这段回答的对数概率。

## 5. Beta

beta 控制偏好优化强度，也可以理解成控制 policy model 偏离 reference model 的程度。

beta 太小，偏好学习可能不明显；beta 太大，模型可能过度追逐偏好数据，稳定性下降。

# 四、DPO 的数学直觉

不用死背公式，但要知道它在优化什么。

对同一个 prompt，有一对回答：

```text
y_w = chosen
y_l = rejected
```

DPO 会比较 policy model 和 reference model 对这两个回答的相对偏好差：

```text
policy_gap = log pi(y_w|x) - log pi(y_l|x)
ref_gap    = log pi_ref(y_w|x) - log pi_ref(y_l|x)
```

如果 policy_gap 比 ref_gap 更大，说明当前模型相比参考模型，更偏向 chosen，这是 DPO 希望看到的。

常见 DPO loss 的形式可以理解为：

```text
-log sigmoid(beta * (policy_gap - ref_gap))
```

> DPO 让 policy model 相对于 reference model，提高 chosen 和 rejected 之间的 log-prob 差距。这个过程等价于在隐式 KL 约束下做偏好优化。

这里的 log probability 通常是整段回答 token log-prob 的和：

```text
log pi(y|x) = sum_t log pi(y_t | x, y_<t)
```

因此，回答越长，log-prob 的绝对值通常越大。很多实现会关注长度归一化、数据长度分布和 beta 调节，否则模型可能受到回答长度的额外影响。

# 五、DPO 为什么能绕过 Reward Model

RLHF 里会先学一个 reward model：

```text
r(prompt, response) -> score
```

然后用 PPO 找高 reward 的策略。

DPO 的关键洞察是：在带 KL 约束的 reward maximization 问题里，最优策略和 reward 之间存在关系。换句话说，可以把 reward 反解成 policy 和 reference policy 的 log-ratio。

所以 DPO 不再显式训练 reward model，而是直接把偏好概率写成 policy 的优化目标。

> DPO 可以看作把 RLHF 里“先学奖励模型、再优化策略”的两步合并了。它利用 KL 约束下最优策略和奖励之间的解析关系，把偏好数据直接转成策略模型的损失函数。

# 六、DPO 和 RLHF/PPO 的区别

| 对比项 | RLHF/PPO | DPO |
| --- | --- | --- |
| 数据 | 偏好数据 + 采样回答 | 离线 chosen/rejected 偏好对 |
| Reward Model | 需要显式训练 | 不需要显式训练 |
| 优化方式 | 强化学习，通常 PPO | 监督式偏好优化 |
| Reference Model | 用 KL 约束防止偏移 | loss 中隐式约束 |
| 工程复杂度 | 高 | 低 |
| 稳定性 | 较敏感 | 通常更稳定 |
| 探索能力 | 更强 | 较弱 |
| 适合场景 | 需要在线优化、复杂奖励 | 已有高质量偏好数据 |

所以 DPO 不是“全面替代 PPO”，而是让偏好优化在很多离线数据场景下更简单。

# 七、DPO 数据怎么构造

DPO 的质量很依赖偏好对。

一条好的偏好数据应该满足：

1. prompt 真实、有代表性。
2. chosen 和 rejected 差异明确。
3. chosen 不是靠格式赢，而是内容、事实、推理、可用性真的更好。
4. rejected 覆盖真实错误，比如幻觉、啰嗦、格式错误、不安全。
5. 标注标准一致。

一个例子：

```json
{
  "prompt": "解释 DPO 和 RLHF 的区别。",
  "chosen": "可以从流程、模型组件和工程复杂度三点比较...",
  "rejected": "DPO 比 RLHF 好，因为它比较新，而且不用强化学习。"
}
```

chosen 更好不是因为它更长，而是因为它比较维度清楚、表达谨慎、没有绝对化。

# 八、DPO 的局限

DPO 简洁，但也有边界。

## 1. 依赖离线偏好数据

如果偏好数据覆盖不到真实用户需求，模型优化方向就会偏。

## 2. 探索能力弱

DPO 通常不让模型在环境里在线试错，它只学习已有 chosen/rejected。

对于代码执行、工具调用、长程 Agent 任务，单纯 DPO 可能不够。

## 3. 容易学到表面偏好

如果 chosen 总是更长，模型可能学成“越长越好”。

如果 chosen 总是更礼貌，模型可能过度客套。

## 4. 偏好对不是绝对真理

人类偏好有主观性，标注员标准不一致会影响训练。

# 九、一个具体例子：优化技术解释质量

prompt：

```text
为什么 DPO 不需要显式训练 reward model？
```

chosen：

```text
DPO 利用了 KL 约束下最优 policy 和 reward 之间的关系，把 reward 写成 policy 与 reference policy 的 log-ratio。因此它不需要先显式训练一个 reward model，而是直接用 chosen/rejected 偏好对构造 policy loss，让模型相对 reference 更偏向 chosen。
```

rejected：

```text
因为 DPO 更简单，所以不需要 reward model。
```

DPO 训练时会让模型更倾向生成 chosen 这种回答，因为它更准确、更有机制解释。

# 十、DPO 训练时实际在算什么

一条偏好样本进入训练时，大致会经过下面几步：

1. 把 `prompt + chosen` 喂给 policy model，得到 chosen 的 log-prob。
2. 把 `prompt + rejected` 喂给 policy model，得到 rejected 的 log-prob。
3. 用冻结的 reference model 重复同样两次计算。
4. 计算 policy gap 和 reference gap。
5. 把两者差值放进 `-log sigmoid(...)` 里得到 loss。
6. 只更新 policy model，reference model 不更新。

这和 SFT 很像，都是对已有文本算 log-prob 后反向传播；区别在于 SFT 只告诉模型“模仿这个答案”，而 DPO 告诉模型“在这两个答案之间，更偏向这个”。

可以把二者的学习信号对比成：

```text
SFT: prompt -> target answer
DPO: prompt -> chosen should beat rejected
```

# 十一、常见实现细节

## 1. Reference model 是否一定要单独加载

概念上需要 reference model。工程上可以单独加载一份冻结模型，也可以预先缓存 reference log-prob，减少训练时显存和计算开销。

## 2. Chosen/rejected 的差异不能太弱

如果两个回答质量差不多，偏好标签噪声会很大；如果差异总是停留在“一个长一个短”，模型又容易学到表面模式。好的偏好对应该让模型学习事实性、清晰度、推理质量、安全边界等真实差异。

## 3. DPO 不是越训越好

训练太久会过拟合偏好数据，表现为回答风格变窄、长度偏移、过度迎合标注偏好，甚至损伤原本能力。因此 DPO 也需要通用能力、安全和领域评估集一起监控。

# 十二、本篇小结

DPO 的核心不是“省掉 reward model”这句话本身，而是它把偏好优化改写成了一个直接作用在 policy log-prob 上的 loss。

```text
reference model 提供锚点
chosen/rejected 提供相对偏好
policy model 学会相对 reference 更偏向 chosen
beta 控制偏好强度和偏离程度
```

它适合高质量离线偏好数据充足的场景；如果任务需要在线探索、环境反馈或可验证奖励，GRPO、PPO、RLVR、Agentic RL 会更自然。
