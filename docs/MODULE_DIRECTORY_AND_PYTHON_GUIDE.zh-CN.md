# 模块目录与 Python 代码块说明

## 1. 四个分区的写作根目录

- `Study` -> `src/content/posts/study/`
- `Lab` -> `src/content/posts/lab/`
- `Lounge` -> `src/content/posts/lounge/`
- `Archive` -> `src/content/posts/archive/`

页面现在会自动扫描这些根目录下面的一级文件夹，并为每个一级文件夹生成一张卡片。

## 2. 新建目录自动生成卡片

例如你想在 `Study` 里新增一个 `reinforce-learning` 卡片：

1. 新建目录：

```text
src/content/posts/study/reinforce-learning/
```

2. 在里面放文章：

```text
src/content/posts/study/reinforce-learning/dqn-notes.md
```

3. 保存后刷新页面：

- `/study/` 会自动出现 `reinforce-learning` 对应的新卡片
- 卡片会显示这个目录里的最近文章
- 文章列表也会一起更新

目录名支持短横线和下划线：

- `reinforce-learning`
- `reinforce_learning`

前端都会自动转成更自然的标题显示。

## 3. 推荐的目录组织方式

### Study

适合放学习型长文、专题整理、教程笔记。

示例：

```text
src/content/posts/study/python-base/
src/content/posts/study/llm-base/
src/content/posts/study/reinforce-learning/
```

### Lab

适合放项目日志、实验记录、Demo 说明。

示例：

```text
src/content/posts/lab/frontend-toys/
src/content/posts/lab/visual-novel/
src/content/posts/lab/deploy-recipes/
```

### Lounge

适合放游戏短评、漫评、日常随笔、照片记录。

示例：

```text
src/content/posts/lounge/game-notes/
src/content/posts/lounge/anime-review/
src/content/posts/lounge/photo-diary/
```

### Archive

适合放资源汇总、链接索引、下载说明、长期沉淀页。

示例：

```text
src/content/posts/archive/tools/
src/content/posts/archive/resource-kit/
src/content/posts/archive/downloads/
```

## 4. Markdown 文章写法

```md
---
title: 你的文章标题
published: 2026-03-21
description: 一句话摘要
tags: [Python, Study]
category: Python Base
draft: false
---

这里开始写正文。
```

## 5. 可运行 Python 代码块

现在支持在 Markdown 里直接写可运行的 Python 面板。

最简单的写法：

````md
```python run
print("Hello from Pyodide")
```
````

带标题：

````md
```python run title="Quick Demo"
total = sum(i * i for i in range(6))
print(total)
```
````

手动声明需要的包：

````md
```python run title="NumPy Demo" packages=numpy
import numpy as np
print(np.arange(5))
```
````

## 6. 当前这版 Python 运行能力的边界

- 运行发生在浏览器里，不是在你的服务器上执行
- 适合教程、小脚本、算法演示、轻量数值计算
- 首次运行会加载 Python 运行时，所以会稍慢一点
- 不适合超重任务，也不是完整 Jupyter Notebook
- `.ipynb` 目前还没有直接接入渲染链路
