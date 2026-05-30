---
title: Agentic RL：工具调用与长程任务训练
published: 2026-05-27
description: 从工具调用轨迹、环境反馈、任务成功率和奖励设计出发，理解 Agentic RL 如何训练模型完成多步任务。
tags: [LLM, Agent, AgenticRL, ToolUse]
category: LLM Base
draft: false
comment: true
---

> Agentic RL 关注的不是模型能不能说出一个漂亮答案，而是它能不能在真实环境里通过多步行动把任务做完。对 coding agent、web agent、RAG agent 来说，这一点尤其关键。

# 一、Agentic RL 是什么

Agentic RL 可以先这样理解：

> 训练模型在一个可交互环境中，经过多步决策、工具调用、观察反馈和自我修正，最终完成任务。

普通聊天模型主要输出文本。

Agent 模型则会经历这样的循环：

```text
用户目标
-> 思考下一步
-> 调用工具
-> 观察工具结果
-> 决定下一步
-> 继续调用工具或给最终答案
```

比如一个 coding agent：

```text
用户：修复这个测试失败。
模型：读取报错日志
工具：cat / pytest
模型：定位相关文件
工具：rg / sed
模型：修改代码
工具：apply_patch
模型：运行测试
工具：pytest
模型：根据结果继续修复或总结
```

Agentic RL 要优化的是整个任务轨迹是否成功，而不是单条回答是否像人类写的。

<!-- TODO: 图片占位：可以补一张 Agent loop：Act -> Observe -> Think -> Act。 -->

# 二、把 Agent 任务写成 RL 问题

Agentic RL 可以对应到强化学习里的几个概念：

| RL 概念 | Agent 场景里的对应物 |
| --- | --- |
| State | 当前任务、上下文、工具返回、文件状态、网页状态 |
| Action | 调用工具、填写参数、输出答案、停止任务 |
| Observation | 工具执行结果、测试日志、搜索结果、页面内容 |
| Reward | 任务是否完成、过程是否安全、成本是否合理 |
| Policy | 决定下一步行动的语言模型 |
| Episode | 从用户提出任务到最终成功/失败的一整条轨迹 |

和普通文本生成相比，Agent 的输出会改变外部环境。比如 coding agent 修改了文件，再运行测试，下一步看到的状态就已经变了。

这也是为什么 Agentic RL 难度更高：模型不是一次性回答，而是在不断行动、观察、修正。

# 三、和普通 SFT Tool-use 的区别

SFT 可以教模型工具调用格式。

比如：

```json
{
  "tool": "search",
  "arguments": {
    "query": "DPO paper"
  }
}
```

这解决的是：

- 工具名写对。
- 参数 schema 写对。
- 调用结果能读懂。
- 最终回答格式正常。

但 Agent 任务的难点往往不在格式，而在决策：

- 现在该不该调用工具？
- 应该调用哪个工具？
- 参数怎么填才有效？
- 工具失败后要不要重试？
- 观察结果和原目标有什么关系？
- 多步任务什么时候应该停止？

SFT 学的是“像不像一条好轨迹”，Agentic RL 学的是“这条轨迹最后有没有把事情办成”。

可以这样对比：

| 对比项 | SFT Tool-use | Agentic RL |
| --- | --- | --- |
| 主要数据 | 人工/合成工具调用轨迹 | 环境交互轨迹 + 成功/失败反馈 |
| 学习目标 | 模仿正确格式和步骤 | 最大化任务成功率 |
| 反馈粒度 | 每步 token 级监督 | 轨迹级或步骤级 reward |
| 适合能力 | schema、格式、常规调用 | 规划、探索、纠错、长程任务 |

# 四、Agentic RL 的环境

Agentic RL 需要一个环境，模型的动作会改变环境状态。

常见环境包括：

## 1. Coding 环境

工具可能包括：

- 文件读取
- 搜索代码
- 编辑文件
- 运行测试
- 查看 git diff
- 执行命令

reward 可以来自：

- 测试是否通过。
- lint 是否通过。
- patch 是否最小。
- 是否引入新错误。

## 2. Web 环境

工具可能包括：

- 搜索
- 打开页面
- 点击
- 表单填写
- 信息抽取

reward 可以来自：

- 是否找到正确答案。
- 是否完成购买/预约/查询。
- 步数是否合理。
- 是否访问可信来源。

## 3. RAG 环境

工具可能包括：

- 向量检索
- 关键词检索
- rerank
- 读取文档
- 引用证据

reward 可以来自：

- 检索命中率。
- 答案是否有证据支撑。
- 引用是否正确。
- 幻觉是否减少。

## 4. Office / Data Analysis 环境

工具可能包括：

- 读取表格
- 写 SQL
- 生成图表
- 运行 Python
- 修改文档

reward 可以来自：

- 计算结果是否正确。
- 图表是否符合需求。
- 是否解释清楚。

# 五、数据从哪里来

Agentic RL 的数据通常来自几类来源。

## 1. 人工专家轨迹

比如让工程师操作一次修 bug，把每一步工具调用记录下来。

优点是质量高，缺点是成本高。

## 2. 模型自采样轨迹

让当前模型自己尝试完成任务，记录成功和失败轨迹。

成功轨迹可以强化，失败轨迹可以分析原因。

## 3. 用户真实日志

上线后，用户任务、模型动作、工具结果、用户反馈都是宝贵数据。

但必须做脱敏、权限控制和合规处理。

## 4. 合成任务

自动构造可验证任务，比如：

- 小型代码仓库 bug 修复。
- 网页问答。
- 数据表查询。
- JSON schema 修复。

这类任务适合规模化训练和评估。

# 六、轨迹数据长什么样

一条 Agent 训练样本不只是 prompt 和 answer，而是一串 event。

可以抽象成：

```json
{
  "task": "修复 failing test",
  "trajectory": [
    {"role": "user", "content": "请修复这个仓库里的失败测试"},
    {"role": "assistant", "action": "run_command", "arguments": {"cmd": "pytest"}},
    {"role": "environment", "observation": "test_x failed: expected 4 got 5"},
    {"role": "assistant", "action": "search", "arguments": {"query": "test_x"}},
    {"role": "environment", "observation": "found tests/test_math.py and src/math.py"},
    {"role": "assistant", "action": "edit_file", "arguments": {"path": "src/math.py", "patch": "..."}},
    {"role": "assistant", "action": "run_command", "arguments": {"cmd": "pytest"}},
    {"role": "environment", "observation": "all tests passed"}
  ],
  "reward": 1.0
}
```

如果做 SFT，可以让模型模仿这条成功轨迹；如果做 DPO，可以把成功轨迹和失败轨迹组成偏好对；如果做 GRPO/RL，可以让模型采样多条轨迹，用最终测试结果和过程约束打 reward。

# 七、Reward 怎么设计

Agentic RL 的 reward 很难，因为一个任务可能要很多步。

可以分几层：

## 1. 最终成功奖励

任务完成给正奖励，失败给零或负奖励。

比如：

```text
所有测试通过：+1
测试失败：0
引入安全问题：-1
```

## 2. 中间过程奖励

鼓励有效步骤：

- 找到相关文件。
- 正确调用工具。
- 参数合法。
- 检索到证据。
- 修复一个失败测试。

## 3. 成本惩罚

避免模型无限探索：

- 步数太多扣分。
- 工具调用太贵扣分。
- 重复无效调用扣分。
- 输出过长扣分。

## 4. 安全约束

某些行为直接禁止：

- 删除用户数据。
- 访问无权限资源。
- 泄露密钥。
- 执行危险命令。

一个好的 reward 不是只奖励结果，还要约束过程，否则 Agent 可能用不可接受的方式完成任务。

# 八、训练方法可以有哪些

Agentic RL 不是某一个固定算法，可以结合多种方法：

- SFT：先学基本工具调用轨迹。
- DPO：用成功轨迹和失败轨迹做偏好对。
- PPO/GRPO：用环境 reward 做策略优化。
- RLVR：当结果可验证时，用规则或测试提供奖励。
- Rejection Sampling：采样多条轨迹，只保留成功轨迹做训练。

一个常见路线是：

```text
收集专家轨迹
-> SFT 学格式和基础步骤
-> 让模型在环境中采样多条轨迹
-> 用测试/verifier 判断成功失败
-> 用 DPO/GRPO/RL 更新模型
-> 加入评估和安全约束
```

# 九、一个具体例子：修复单元测试

任务：

```text
仓库里有一个失败测试，请修复代码。
```

一条成功轨迹可能是：

1. 运行测试，看到失败信息。
2. 搜索报错函数。
3. 打开相关文件。
4. 分析边界条件。
5. 修改一行逻辑。
6. 再次运行测试。
7. 所有测试通过。
8. 总结修改。

reward 可以设计成：

```text
最终测试通过：+1
修改文件数量过多：-0.2
没有运行测试：-0.3
引入 lint 错误：-0.5
危险命令：-1
```

这个例子能看出，Agentic RL 不是只训练“回答怎么写”，而是训练“做事路径”。

# 十、Agentic RL 的评估指标

评估 Agent 不能只看答案文本。

常见指标：

- Task Success Rate：任务成功率。
- Tool Call Accuracy：工具选择和参数准确率。
- Step Efficiency：完成任务需要多少步。
- Cost：token、工具调用、时间成本。
- Recovery Rate：工具失败后能否恢复。
- Safety Violation Rate：是否触发危险行为。
- Human Intervention Rate：需要人类接管的比例。
- Regression Rate：新版本是否破坏旧任务。

对于 coding agent，还会看：

- 测试通过率。
- patch 是否最小。
- 是否引入无关修改。
- 是否遵守项目风格。

# 十一、风险和难点

## 1. 长程 credit assignment

任务最后失败了，究竟是哪一步错了？这是 RL 里很经典的问题。

## 2. 环境成本高

每次训练都要运行工具、测试、浏览器或代码环境，成本比纯文本训练高很多。

## 3. Reward 容易被钻空子

如果只奖励测试通过，模型可能写死测试。

如果只奖励步数少，模型可能跳过必要验证。

## 4. 安全边界复杂

Agent 能操作真实工具，所以安全风险比聊天模型更高。

## 5. 数据脱敏困难

真实日志很有价值，但里面可能包含用户隐私、代码密钥、业务数据。

# 十二、本篇小结

Agentic RL 的重点不是“模型会不会调用工具”，而是“模型能否通过工具把任务做完”。它把 LLM 从文本生成器推进到环境中的决策者。

核心链路是：

```text
任务目标
-> 当前状态
-> 选择动作 / 工具
-> 环境返回 observation
-> 更新上下文
-> 继续决策
-> 最终成功或失败
```

训练时可以先用 SFT 学轨迹格式，再用 DPO、GRPO、RLVR 或 PPO 引入成功/失败反馈。真正难的地方在 reward 设计、环境成本、长程 credit assignment、安全边界和日志数据治理。
