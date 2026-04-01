---
title: PyTorch 工具箱：Module、functional、optim 与初始化
published: 2026-03-28
description: 把容易散落在不同笔记里的 PyTorch 常用工具收成一篇：nn.Module、nn.functional、optim、初始化与常见工程辅助接口。
tags: [PyTorch, nn.Module, optim, 工具箱]
category: Pytorch
draft: false
comment: true
---

> 这一篇主要整理自 `pytorch_learning/pytorch_6.py` 到 `pytorch_learning/pytorch_10.py`，以及 `liuer_pytorch/9.ipynb` 里那部分对 PyTorch 包结构的速查总结。这些内容单看都不难，但最容易散，放到一起反而更适合复习。

## 1. `nn.Module` 是网络的基本壳

PyTorch 里最核心的对象，就是继承 `nn.Module` 的网络。

```python3
import torch as t
from torch import nn


class Perceptron(nn.Module):
    def __init__(self, in_features, hidden_features, out_features):
        super().__init__()
        self.layer1 = nn.Linear(in_features, hidden_features)
        self.layer2 = nn.Linear(hidden_features, out_features)

    def forward(self, x):
        x = self.layer1(x)
        x = t.sigmoid(x)
        return self.layer2(x)
```

这里的经验可以记成一句：

- 只要一个结构里有可学习参数，它大概率就应该放进 `nn.Module`

这样：

- 参数会被自动注册
- `model.parameters()` 才能收集到它们
- 优化器才能更新它们

## 2. `nn` 和 `nn.functional` 的区别

我之前很容易把这两个混着用。现在更清楚的理解是：

- `nn.*`：偏对象化，适合有参数或有状态的层
- `nn.functional.*`：偏无状态纯函数，适合直接在 `forward()` 里调用

比如：

- `nn.Linear`、`nn.Conv2d` 用 `nn`
- `F.relu`、`F.max_pool2d` 这种更适合用 `functional`

`pytorch_9.py` 里也有个很直观的小例子：

```python3
import torch as t
from torch import nn

inp = t.randn(2, 3)
model = nn.Linear(3, 4)
output1 = model(inp)
output2 = nn.functional.linear(inp, model.weight, model.bias)
print(output1 == output2)
```

本质是一样的，只是组织代码的方式不同。

## 3. 优化器：不是只有 `SGD`

在最开始的练习里，我几乎总是用：

```python3
optimizer = torch.optim.SGD(model.parameters(), lr=0.01)
```

但到了 `pytorch_8.py`，有两个很实用的工程技巧：

### 技巧一：不同层用不同学习率

```python3
optimizer = torch.optim.SGD(
    [
        {"params": net.features.parameters()},
        {"params": net.classifier.parameters(), "lr": 1e-2},
    ],
    lr=1e-5,
)
```

这个在迁移学习和微调时非常常见。

### 技巧二：动态调整学习率

虽然这里的代码只是做演示，但背后的工程直觉很重要：  
学习率不是“一次写死到训练结束”，而是常常需要按阶段调。

## 4. 参数初始化

大多数时候，`nn.Module` 已经带了合理默认初始化。  
但 `pytorch_9.py` 也提醒我，初始化并不是完全不用管。

比如：

```python3
from torch.nn import init

init.xavier_normal_(model.weight)
```

Xavier 初始化背后的目标，是让信号在网络中传播得更稳定，不容易一开始就炸掉或塌掉。

## 5. 其他容易散的小工具

`pytorch_10.py` 虽然比较像提纲，但它点出了真正做项目时经常绕不过去的方向：

- 自定义 `Dataset`
- `torchvision`
- 可视化工具
- GPU 加速
- 模型保存与加载

这些内容暂时还没有被我完全展开成独立文章，但它们其实构成了 PyTorch 从“写模型”到“做工程”的入口。

## 6. 把 PyTorch 的包结构记成一个简单地图

我后来比较喜欢的记法是：

- `torch.*`：张量和基础运算
- `torch.nn.*`：网络层、损失函数、模块
- `torch.nn.functional.*`：无状态操作
- `torch.optim.*`：参数更新

这样至少不会在代码里每次都把几个包的职责混掉。

## 7. 这一阶段该记住什么

如果把这篇压缩成最少几句话，我会记：

1. `nn.Module` 是网络的组织方式，不只是一个语法壳。
2. 有参数的层优先用 `nn.*`，无状态操作常用 `F.*`。
3. 优化器不是黑盒配置项，而是训练策略的一部分。
4. 初始化、学习率、数据集接口这些“边角 API”，其实很影响真实训练体验。

这篇看起来像杂项，但真正写 PyTorch 项目时，它往往是最常用的一层。
