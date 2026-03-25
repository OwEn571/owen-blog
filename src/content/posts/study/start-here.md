---
title: Study 栏写作说明
published: 2026-03-21
description: Study 分区会自动扫描一级目录，并把它们接到知识星点与文章筛选里。
tags: [Study, 指南]
category: Study
draft: false
pinned: true
comment: false
---

Study 现在只读取 `src/content/posts/study/` 下的文章，并且会自动扫描它下面的一级目录生成主题入口与筛选项。

你之后写学习类内容时，只需要按主题新建目录，然后把文章放进去：

1. `Python Base` -> `src/content/posts/study/python-base/`
2. `LLM Base` -> `src/content/posts/study/llm-base/`
3. `算法题` -> `src/content/posts/study/算法题/`
4. `Fine Tuning` -> `src/content/posts/study/fine-tuning/`
5. `FastAPI` -> `src/content/posts/study/fastapi/`
6. `Pytorch` -> `src/content/posts/study/pytorch/`
7. `Reinforce Learning` -> `src/content/posts/study/reinforce-learning/`

如果你之后想新增别的主题，比如 `study/transformer-notes/`，只要新建这个目录，它就会自动出现在 Study 的知识星点和文章筛选里。

如果你想控制这个目录在 Study 里的标题、右上角小图标、颜色和排序，就在目录里放一个 `meta.json`。

例如：

```json
{
  "title": "Reinforce Learning",
  "eyebrow": "RL",
  "description": "放强化学习、DQN、PPO、策略梯度等内容。",
  "size": "medium",
  "accent": "138 168 255",
  "icon": "mdi:robot-outline",
  "order": 70
}
```

目前支持这些标识：

1. `title`
目录展示标题。

2. `eyebrow`
目录的小标签。

3. `description`
目录说明文案。

4. `icon`
目录图标，推荐用 `mdi:*`，例如 `mdi:robot-outline`、`mdi:brain`、`mdi:api`。

5. `accent`
目录主题色，格式是 `"118 166 255"` 这种 RGB 三元组字符串。

6. `size`
展示尺寸参数，可选：
`"wide"`、`"medium"`、`"default"`

7. `order`
目录排序，数字越小越靠前。

8. `hidden`
是否隐藏这个目录入口，填 `true` 后不会显示在 Study 里。

Study 现在会直接联动下方的 `Study 全部文章`：

1. 点击知识星点图里的主题节点，或者直接点筛选器
2. 页面会滚动到下面的总文章列表
3. 自动筛选出这个目录下的文章

写法还是普通 Markdown：

```md
---
title: 你的文章标题
published: 2026-03-21
description: 一句话摘要
tags: [Python, Study]
category: Python Base
draft: false
---
```

如果你想在文章里插入可运行的 Python 代码块，可以直接这样写：

```python3 title="Quick Demo"
total = sum(i * i for i in range(6))
print("sum =", total)
```

上面这种写法现在会在文章页渲染成可折叠的 Python 代码卡。
如果你想真正边写边跑，可以直接使用页面右侧悬浮的 `Python Lab` 小窗口。

写完保存后，本地开发环境会自动刷新；Study 的知识星点、筛选器和文章列表也会同步更新。提交并部署后，线上站点会一起更新。
