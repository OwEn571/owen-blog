---
title: PyTorch 分类任务、Dataset / DataLoader 与训练循环
published: 2026-03-29
description: 从逻辑回归、二分类、多分类一路串到 Dataset、DataLoader 和小作业，把真正训练一个分类模型需要的元素放到一条线上。
tags: [PyTorch, Dataset, DataLoader, Classification]
category: Pytorch
draft: false
comment: true
---

> 这一篇主要整理自 `liuer_pytorch/5-10.ipynb`。相比前两篇的“训练直觉”和“自动微分”，这里更像真正开始做任务：输入有了标签，输出不再是连续值，而是类别。

## 1. 分类和回归最大的不同是什么

在线性回归里，我们输出的是一个连续值。  
到了分类任务，输出就不再是“一个实数”，而更像“每个类别的概率分布”。

课程里对逻辑回归的总结很直接：

- 虽然叫“回归”，但它解决的是分类问题
- 输出要映射到 `0-1`
- loss 常常用交叉熵

这就是为什么二分类里经常会看到：

- `sigmoid`
- `BCELoss`
- `BCEWithLogitsLoss`

而多分类里经常会看到：

- `softmax`
- `CrossEntropyLoss`

## 2. 从二分类到多分类

这组笔记里，二分类和多分类的任务其实已经很典型了：

- 糖尿病数据集：二分类
- Titanic 作业：表格分类
- Otto 数据集：多分类

从学习角度看，它们最有价值的地方不是“数据集本身”，而是让我逐渐看到分类训练的完整链路：

1. 数据预处理
2. 定义模型
3. 定义损失函数
4. 划分 batch
5. 训练与评估

## 3. Dataset 和 DataLoader 为什么重要

课程在 `7.ipynb` 里专门整理了三个概念：

- `Epoch`：完整看完一遍全部样本
- `Batch Size`：一次前向与反向传播处理多少样本
- `Iteration`：一个 epoch 被切成多少次参数更新

然后真正把数据喂给模型的，是 `Dataset` 和 `DataLoader`。

`DataLoader` 至少解决了几件很烦但必须做的事：

- 按 batch 划分数据
- shuffle 打乱顺序
- 变成一个可迭代对象

也就是说，它让训练循环终于能写成：

```python3
for epoch in range(epochs):
    for x, y in train_loader:
        optimizer.zero_grad()
        pred = model(x)
        loss = criterion(pred, y)
        loss.backward()
        optimizer.step()
```

这就是从“玩具代码”进入“正常训练代码”的关键一步。

## 4. 表格数据任务里，数据清洗不能跳过

在 Titanic 那一节里，我觉得最有价值的不是模型本身，而是那份 Pandas 数据清洗速查表。  
因为表格数据任务很少能一上来就直接转 Tensor。

真正高频的动作包括：

- `df.info()`：看列类型和缺失值
- `df.isnull().sum()`：排查空值
- `fillna(...)`：填补缺失
- `map(...)`：把类别映射成数字
- `drop(...)`：删除无用列
- `astype(...)`：强制转换类型

这一步如果没做，后面 PyTorch 再熟也跑不顺。

## 5. PyTorch 多分类里最常见的误区

课程里讲多分类时提到一个很关键的直觉：

> 希望输出有竞争性，且大于等于 0，和为 1。

这就是 Softmax 的角色。  
但在真正写 PyTorch 时，一个很常见的坑是：

- 模型输出 logits
- 损失用 `CrossEntropyLoss`
- 不需要自己先手动做 softmax

因为 `CrossEntropyLoss` 内部已经帮你处理了。

## 6. 这一阶段真正应该掌握什么

如果只留最核心的能力，我觉得是下面这些：

1. 能分清回归、二分类、多分类对应的输出和损失函数。
2. 知道 `Dataset` / `DataLoader` 为什么是标准训练入口。
3. 知道 batch、epoch、iteration 分别在说什么。
4. 知道真实任务里，数据预处理和特征清洗本来就是训练流程的一部分。

到这一步，PyTorch 就不只是“会写一个最小例子”了，而是已经开始具备做小任务的基本骨架。
