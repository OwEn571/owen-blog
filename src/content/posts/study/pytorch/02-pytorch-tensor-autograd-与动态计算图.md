---
title: PyTorch Tensor、Autograd 与动态计算图
published: 2026-03-30
description: 真正把 PyTorch 和 NumPy 区分开的，是 Tensor 和自动微分。把形状操作、requires_grad 和动态计算图一次理顺。
tags: [PyTorch, Tensor, Autograd]
category: Pytorch
draft: false
comment: true
---

> 这一篇主要整理自 `liuer_pytorch/3.ipynb`，以及 `pytorch_learning/pytorch_3.py`、`pytorch_learning/pytorch_4.py`。如果说上一节在解决“怎么训练一个模型”，这一节就在解决“PyTorch 为什么能训练模型”。

## 1. Tensor 不只是数组

课程笔记里有一句很关键的话：

> PyTorch 中的基本数据类型是 Tensor，Tensor 实际上是一个类，有两个重要成员：`data` 和 `grad`。

这句话虽然有点“老表述”，但核心意思没变：  
Tensor 在 PyTorch 里不只是存数值，它还能进入计算图，参与自动求导。

所以和 NumPy 比起来，Tensor 重要的不是“也能做矩阵运算”，而是：

- 它知道自己是否需要梯度
- 它知道自己是怎么被算出来的
- 它能沿着计算图反向传播

## 2. 先把最常用的形状操作记住

我自己的 `pytorch_3.py` 基本就是在熟悉这些操作：

```python3
import torch as t

b = t.arange(0, 6)
b = b.view(3, 2)

d = b.unsqueeze(1)
e = b.view(1, 1, 2, 1, 3)
e.squeeze_()
```

这里最常见的几个动作是：

- `view(...)`：重排形状，但不改变元素总数
- `unsqueeze(dim)`：插入一个长度为 `1` 的维度
- `squeeze(dim)`：压掉长度为 `1` 的维度

后面做 CNN、RNN、Transformer 时，很多 bug 本质上都不是模型错了，而是 shape 没对上。

## 3. Autograd 的核心：记录计算历史

我自己理解 Autograd，最有效的一句话是：

> 前向传播时，PyTorch 会一边算值，一边把这条计算链记录下来。

这就是所谓的动态计算图。

```python3
import torch as t

x = t.randn(3, 4, requires_grad=True)
y = x ** 2 * t.exp(x)
grad_y = t.ones_like(y)
y.backward(grad_y)
print(x.grad)
```

这里发生的事情是：

1. `x` 开启了梯度追踪
2. `y` 的每一步计算都被记录进图里
3. `backward()` 从输出往回推，把梯度传回 `x`

为什么 `y.backward(...)` 这里要传一个同形状的张量？  
因为 `y` 不是标量。标量可以默认把“最终损失对输出的梯度”看成 `1`，非标量则需要你显式说明。

## 4. 叶子节点、非叶子节点与梯度

这个点我一开始也很容易混：

- 叶子节点：通常是我们手动创建、真正想优化的变量
- 非叶子节点：中间计算结果

默认情况下，反向传播结束后，真正会保留梯度的是叶子节点。  
中间变量如果也想看梯度，需要额外处理，比如：

- `retain_grad()`
- `torch.autograd.grad(...)`
- `register_hook(...)`

这在调试网络时非常有用。

## 5. 动态计算图到底“动态”在哪

我很喜欢课程里用条件分支举例这一点。  
PyTorch 的动态图不是预先写死的，而是每次前向传播都重新搭一遍。

所以像下面这种逻辑是成立的：

```python3
def f(x):
    result = 1
    for i in x:
        if i.data > 0:
            result = i * result
    return result
```

不同输入会走不同分支，而计算图会在运行时按真实路径构建出来。  
这也是 PyTorch 在研究和实验里非常舒服的原因之一。

## 6. 哪些时候要关掉梯度

不是所有阶段都需要反向传播。

在这些场景里，`with torch.no_grad():` 非常重要：

- 验证集 / 测试集推理
- 纯预测
- 不希望保存计算图，节省内存

```python3
with torch.no_grad():
    predictions = model(inputs)
```

这不是语法洁癖，而是推理阶段的常规操作。

## 7. 这一阶段该记住什么

如果只保留最核心的认知，我会记这几句：

1. Tensor 的价值不只是存数据，而是能进入计算图。
2. `requires_grad=True` 才会开始追踪这条计算链。
3. 非标量做 `backward()` 时，需要明确提供梯度入口。
4. PyTorch 的计算图是运行时动态生成的，不是静态写死的。

把这一层吃透之后，再看 `nn.Module`、损失函数和优化器，会明显顺很多。
