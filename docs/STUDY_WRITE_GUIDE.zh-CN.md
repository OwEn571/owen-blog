# Study 写作位置说明

Study 模块现在只认这一层目录：

- `src/content/posts/study/`

当前常用目录如下：

- `Python Base` -> `src/content/posts/study/python-base/`
- `LLM Base` -> `src/content/posts/study/llm-base/`
- `算法题` -> `src/content/posts/study/算法题/`
- `Fine Tuning` -> `src/content/posts/study/fine-tuning/`
- `FastAPI` -> `src/content/posts/study/fastapi/`
- `Pytorch` -> `src/content/posts/study/pytorch/`

## 你应该怎么写

在对应目录里新建一个 `.md` 文件，例如：

- `src/content/posts/study/python-base/list-comprehension.md`
- `src/content/posts/study/llm-base/transformer-overview.md`
- `src/content/posts/study/算法题/two-sum.md`

最小 frontmatter 模板：

```md
---
title: 文章标题
published: 2026-03-21
description: 一句话摘要
tags: [Study]
category: 你希望展示的分类名
draft: false
---
```

建议分类这样写：

- `Python Base`
- `LLM Base`
- `算法题` 或 `Hot 100`
- `Fine Tuning`
- `FastAPI`
- `Pytorch`

## 模板文件

我已经在每个目录里放了一份隐藏模板文件：

- `src/content/posts/study/python-base/template.md`
- `src/content/posts/study/llm-base/template.md`
- `src/content/posts/study/算法题/template.md`
- `src/content/posts/study/fine-tuning/template.md`
- `src/content/posts/study/fastapi/template.md`
- `src/content/posts/study/pytorch/template.md`

这些模板都带了 `draft: true`，不会出现在页面上。你可以直接复制它们，或者把它们改名后再写。

## 上传方式

本地开发：

1. 在对应目录写 Markdown
2. 保存
3. `pnpm dev` 会自动刷新，Study 的知识星点、筛选器和文章列表会同步更新

线上发布：

1. 提交这些文件到仓库
2. 推送到远端
3. 部署完成后，`/study/` 会自动更新
