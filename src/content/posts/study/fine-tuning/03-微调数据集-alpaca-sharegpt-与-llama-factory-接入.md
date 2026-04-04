---
title: 微调数据集：Alpaca、ShareGPT、多模态格式与 LLaMA-Factory 接入
published: 2026-04-01
description: 先把数据组织方式搞清楚：Alpaca 和 ShareGPT 有什么差别，多模态样本通常怎么写，以及 LLaMA-Factory 的 dataset_info 如何接入自己的数据。
tags: [Dataset, Alpaca, ShareGPT, LLaMAFactory, FineTuning]
category: Fine Tuning
draft: false
comment: true
---

> 真正开始微调时，最容易被低估的往往不是模型，而是数据格式。模型再强，如果数据结构和训练框架对不上，后面基本都会卡住。

# 一、常见数据格式：Alpaca 与 ShareGPT

## 1. Alpaca

Alpaca 最初来自斯坦福大学发布的 52k 指令微调数据集。后来“Alpaca 格式”逐渐被社区抽象成一类更通用的单轮任务数据结构，适合：

- 问答
- 翻译
- 摘要
- 结构化生成

它的核心特征是围绕下面几类字段组织：

- `instruction`
- `input`
- `output`
- 可选的 `system`
- 可选的 `history`

![Alpaca 示例 1](</images/study/fine-tuning/Pasted image 20250831011445.png>)

![Alpaca 示例 2](</images/study/fine-tuning/Pasted image 20250831011507.png>)

![Alpaca 示例 3](</images/study/fine-tuning/Pasted image 20250831011753.png>)

## 2. ShareGPT

ShareGPT 更适合多轮对话和复杂交互。它的核心不是单个 `instruction`，而是一串 `conversations`。

它常见的角色包括：

- `human`
- `gpt`
- `function_call`
- `observation`

因此它特别适合：

- 多轮聊天
- 工具调用
- 更接近真实助手场景的数据

![ShareGPT 示例 1](</images/study/fine-tuning/Pasted image 20250831012400.png>)

![ShareGPT 示例 2](</images/study/fine-tuning/Pasted image 20250831012916.png>)

![ShareGPT 示例 3](</images/study/fine-tuning/Pasted image 20250831012643.png>)

![ShareGPT 示例 4](</images/study/fine-tuning/Pasted image 20250831012955.png>)

## 3. 两种格式的差别

| 对比维度 | Alpaca | ShareGPT |
| --- | --- | --- |
| 核心目标 | 单轮指令驱动任务 | 多轮对话与工具调用 |
| 数据结构 | `instruction / input / output` 为主 | `conversations` 列表为主 |
| 多轮历史 | 通过 `history` 额外表示 | 自然体现在对话列表里 |
| 工具调用 | 不原生支持 | 原生支持 `function_call / observation` |
| 典型场景 | 指令微调、单轮生成 | 聊天助手、工具代理、复杂交互 |

如果只是做单轮任务，Alpaca 往往更直接；如果要训练对话助手或工具流，ShareGPT 更自然。

# 二、多模态数据通常怎么写

在多模态微调里，最常见的组织方式是：

```text
your_multimodal_data/
├── images/
├── conversations.json
└── metadata.json
```

其中真正关键的是：

- 文本对话内容
- 图像路径或图像标识
- 文本里 `<image>` 这类占位符

一个很典型的多模态样本大致会长这样：

```json
{
  "id": "unique_conversation_id_1",
  "image": "images/image1.jpg",
  "conversations": [
    {
      "from": "human",
      "value": "请详细描述这张图片。<image>"
    },
    {
      "from": "gpt",
      "value": "这张图片展示了一只可爱的金色寻回犬在草地上奔跑。"
    }
  ]
}
```

对于 Qwen2.5-VL 这类模型来说，重点不在于格式有多花，而在于：

- 图像路径要正确
- 占位符要符合模板
- 对话轮次要和任务一致

# 三、训练集、验证集、测试集该怎么分

微调时最常见的三类数据是：

1. 训练集：用于更新权重。
2. 验证集：用于观察训练过程和泛化情况，不参与权重更新。
3. 测试集：训练和调参全部结束后，最后做客观评估。

原笔记里对不同数据规模给了一条很实用的经验线：

- 大数据集：80/10/10 或 70/15/15
- 中等数据集：60/20/20 或 70/20/10
- 小数据集：优先考虑交叉验证，或者酌情增大验证 / 测试比例

到了多模态任务里，还要额外注意：

1. 绝对数量比比例更重要
2. 要尽量做分层抽样
3. 小数据集更需要认真留测试集

# 四、LLaMA-Factory 里的 `dataset_info`

LLaMA-Factory 会用一个统一的配置文件来登记数据集入口。这个设计很实用，因为它把“训练命令”与“数据来源描述”解耦了。

核心字段一般包括：

- `file_name`
- `formatting`
- `columns`
- `tags`

如果是这次笔记里的多模态 ShareGPT 格式数据集，一个典型配置可以写成：

```json
"blood_image": {
  "file_name": "/data/llm/blood_image/dataset.json",
  "formatting": "sharegpt",
  "columns": {
    "messages": "conversations",
    "images": "image"
  }
}
```

而对应的数据集样本可能是：

```json
{
  "id": "sample_24",
  "image": "/data/llm/img2npy/output/滴落/6.png",
  "conversations": [
    {
      "from": "human",
      "value": "<image>\n描述这张图片。"
    },
    {
      "from": "gpt",
      "value": "在木质背景上有一滴血液，下面摆放着一把尺子用于测量。"
    },
    {
      "from": "human",
      "value": "这是什么形态的血液？"
    },
    {
      "from": "gpt",
      "value": "这属于被动的/重力类血液中的滴落类型。"
    }
  ]
}
```

这组例子其实很能说明一个事实：

**微调数据集不是“随便凑成问答”就行，而是要和模型模板、训练框架、任务目标同时对齐。**

# 五、一组真正会影响训练结果的参数直觉

原笔记里还单独整理了几组训练时最常调的参数，这些内容后面会继续用到：

## 1. 训练轮数（Epochs）

- 数据少时往往需要更多轮
- 太多又容易过拟合
- 一般可以从 3 开始试

## 2. 学习率

- 一般微调任务：`5e-5`
- 更保守：`4e-5`
- 全参数微调：通常更小，比如 `1e-5`

## 3. 批量大小（Batch Size）

批量大小实际上由两件事共同决定：

- 每卡 batch size
- 梯度累积步数

大批量更稳但更吃资源，小批量更细但噪声更大。

## 4. 截断长度（Cutoff Length）

这个值直接影响：

- 上下文能装多少内容
- 显存占用有多大

最理想的做法通常是：

**先统计数据分布，再决定 cutoff，而不是先拍脑袋选一个值。**

## 5. 验证集比例

如果数据量太小，验证集比例设置得再标准也不一定有意义；但如果完全没有验证集，就只能靠训练 loss 猜状态。

![验证集曲线示意](</images/study/fine-tuning/Pasted image 20250904164230.png>)

所以这部分没有绝对标准，关键是：样本量要足够让验证集真的能“说明问题”。
