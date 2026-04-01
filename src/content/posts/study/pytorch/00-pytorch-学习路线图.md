---
title: PyTorch 学习路线图：从张量到 Transformer
published: 2026-04-01
description: 把三套不同来源的 PyTorch 笔记和代码重新整理成一条循序渐进的学习路线，先建立训练心智，再进入 CNN、RNN 和手写 Transformer。
tags: [PyTorch, 学习路线, DeepLearning]
category: Pytorch
draft: false
pinned: true
priority: 1
comment: false
---

这组文章整理自我手头三份不同来源的 PyTorch 资料：

- `liuer_pytorch`：跟着一套完整课程从头做到尾，主线比较完整。
- `pytorch_learning`：我自己之前断断续续做过的练手笔记，更偏 API 和记忆点。
- `pytorch_using`：一份单独手写 Transformer 的实践代码。

如果直接按原文件夹去看，会有两个问题：

1. 同一个主题被分散在不同目录里，学习节奏容易断。
2. 有些内容偏“随手查 API”，有些内容偏“课程式推进”，混在一起不太像一条能连续读的路线。

所以我把它们重排成了下面这条主线：

1. `线性回归、梯度下降与训练四步`
先用最简单的回归任务把训练流程摸清楚：数据、模型、损失、优化器。

2. `Tensor、Autograd 与动态计算图`
把 PyTorch 和 NumPy 拉开差距的关键，就在 Tensor 和自动微分。

3. `分类任务、Dataset / DataLoader 与训练循环`
从二分类、多分类到小作业，真正把“如何喂数据、如何训练一个分类模型”串起来。

4. `Module、functional、optim 工具箱`
这一篇专门整理容易散落的 API：`nn.Module`、`nn.functional`、优化器、初始化和工程辅助工具。

5. `CNN：从 LeNet 到经典卷积网络`
把卷积、池化、LeNet、GoogLeNet、ResNet 这些卷积神经网络的核心脉络拉成一条线。

6. `RNN 与序列建模入门`
从 one-hot、embedding、RNN / LSTM 到名字-国家分类，把序列模型的最小心智先搭起来。

7. `手写 Transformer 实现拆解`
最后回到一个真正的 PyTorch 代码实践：不用 `nn.Transformer`，自己把位置编码、多头注意力、Encoder / Decoder 组起来。

这样整理之后，这组文章的阅读顺序就不是“看到什么学什么”，而是：

- 先明白训练一个模型到底在做什么
- 再理解 PyTorch 提供了哪些关键抽象
- 然后进入具体网络结构
- 最后用 Transformer 做一次综合收束

正文里我尽量保留了原始笔记的内容、写法和代码，只做了这几类整理：

- 合并重复主题
- 补上过渡说明，让章节之间更好衔接
- 把零散的 API 速记收成更适合复习的结构

如果你也是第一次系统整理 PyTorch，建议按这里的顺序往下读。
