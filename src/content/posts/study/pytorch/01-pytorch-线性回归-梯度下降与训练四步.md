---
title: PyTorch 线性回归：梯度下降与训练四步
published: 2026-03-31
description: 从最简单的线性回归开始，把 PyTorch 训练模型的四步走清楚：数据、模型、损失函数和优化器。
tags: [PyTorch, 线性回归, GradientDescent]
category: Pytorch
draft: false
comment: true
---

> 这一篇主要整理自 `liuer_pytorch/1-4.ipynb`，以及我自己写过的 `pytorch_learning/pytorch_1.py`、`pytorch_learning/pytorch_5.py`。它们共同在做一件事：用一个最简单的任务，把“训练神经网络”这件事拆开。

## 1. 为什么从线性回归开始

我越来越觉得，PyTorch 的入门最好不要一上来就卷 CNN 或 Transformer。  
线性回归虽然简单，但它几乎把训练流程里所有最基础的东西都露出来了：

- 数据长什么样
- 模型参数是什么
- 损失函数在优化什么
- 梯度下降到底怎么更新参数

很多后面更复杂的网络，其实都只是把这个流程换成了更复杂的函数。

## 2. 训练模型的四步

在课程笔记里，这条线很明确：

1. 准备数据集
2. 设计模型
3. 设计损失函数和优化器
4. 写训练循环

这四步几乎可以当成 PyTorch 的最小心智模型。后面不管做分类、卷积还是序列任务，都还是这四步。

## 3. 先用 NumPy 直觉理解梯度下降

在线性回归里，我们希望学到的关系是：

```text
y = wx + b
```

如果用均方误差：

```text
MSE = 1 / N * Σ (ŷ - y)^2
```

那么训练本质上就是不断调整 `w` 和 `b`，让误差越来越小。  
课程里也提到了梯度下降、随机梯度下降，以及 mini-batch 为什么是一个工程上的折中：

- 整批数据一起算，稳定但更新慢
- 单样本更新，噪声更大但更容易跳出局部坏区域
- mini-batch 在两者之间做 trade-off

这一层如果没想明白，后面 `optimizer.step()` 很容易变成一句纯咒语。

## 4. 用 PyTorch 写一个最小线性回归

下面这段代码基本就是我当时练手时的核心版本：

```python3
import numpy as np
import torch
import torch.nn as nn

x = np.arange(1, 12, dtype=np.float32).reshape(-1, 1)
y = 2 * x + 3


class LinearRegressionModel(nn.Module):
    def __init__(self, input_dim, output_dim):
        super().__init__()
        self.linear = nn.Linear(input_dim, output_dim)

    def forward(self, inp):
        return self.linear(inp)


model = LinearRegressionModel(1, 1)
optimizer = torch.optim.SGD(model.parameters(), lr=0.01)
criterion = nn.MSELoss()
```

这里最值得记住的是两点：

- `nn.Linear` 已经把 `wx + b` 封装好了
- `model.parameters()` 会把可学习参数交给优化器

真正的训练循环则是：

```python3
for epoch in range(1000):
    inputs = torch.from_numpy(x)
    labels = torch.from_numpy(y)

    optimizer.zero_grad()
    outputs = model(inputs)
    loss = criterion(outputs, labels)
    loss.backward()
    optimizer.step()
```

这里每一行都对应一个明确动作：

- `zero_grad()`：清空上一次的梯度
- `model(inputs)`：前向传播
- `criterion(...)`：得到损失
- `loss.backward()`：反向传播算梯度
- `optimizer.step()`：更新参数

## 5. 为什么这一套值得反复记

我自己后来再看 CNN、RNN、Transformer 时，会发现很多“新东西”其实只是：

- 数据形状变了
- 模型结构变复杂了
- 损失函数换了
- 优化器可能从 SGD 变成 Adam

但训练主线没有变。

所以在 PyTorch 入门阶段，最值钱的不是“背了多少层名字”，而是把下面这个模板吃透：

```python3
for batch in dataloader:
    optimizer.zero_grad()
    pred = model(batch_x)
    loss = criterion(pred, batch_y)
    loss.backward()
    optimizer.step()
```

## 6. 这一阶段该记住什么

如果只保留最少的几句话，我会记：

1. 线性回归不是为了学回归，而是为了学训练流程。
2. `nn.Module + loss + optimizer + loop` 是 PyTorch 最核心的训练骨架。
3. 梯度下降不是黑盒，它只是在沿着损失下降的方向调整参数。

有了这一层，后面看 Tensor、Autograd 和更复杂网络时，就不容易失去主线。
