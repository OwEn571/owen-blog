# 远程 Codex 接手说明

这份文档是给“下一位接手这个仓库的 Codex / 远程代理”看的，目标是让它尽快理解：

- 这个项目现在是什么状态
- 哪些地方已经整理过
- 哪些地方容易踩坑
- 接下来应该怎么继续做

---

## 1. 项目基本信息

- 仓库名：`owen-blog`
- 当前本地路径：`/Users/owen/owen-blog`
- 部署方式：`自托管服务器（Astro Node standalone）`
- 当前站点域名：`https://owen.top/`
- 站点框架：`Astro`
- 当前输出模式：`server`

这意味着：

- 博客已经切到 Node 侧可运行的服务端模式
- 文章主体仍可按页面维度保留预渲染，以兼顾性能和稳定性
- 搜索、喵喵代理、后续扩展 API 已经可以走站内真实服务端接口
- 如果后面还要接更重的业务后端：
  - 可以继续单独接 FastAPI
  - 也可以让 Astro 只负责前台与轻 API

---

## 2. 当前内容结构

博客最重要的内容区是 `Study`，目前已经整理了这些系列：

- `langchain`
- `rag`
- `fastapi`
- `pytorch`
- `reinforce-learning`
- `算法题`

内容目录都在：

- `src/content/posts/study/`

每个目录通常包含：

- `meta.json`
- 一组 Markdown 文章
- 有时还会带本地图片

已经整理过的文集，不要轻易打乱它们的顺序逻辑。当前文章前后章导航是按“同目录系列”优先算的，不再是全站发布时间乱跳。

相关逻辑在：

- `src/utils/content-utils.ts`

---

## 3. 当前 UI / 主题方向

这站已经不是模板默认风格，而是已经做过多轮精修，核心气质是：

- 夜间：黑蓝玻璃感
- 日间：白粉玻璃感

关键样式入口：

- `src/styles/main.css`
- `src/styles/splash.css`

背景视频：

- `public/assets/opening/qidian-splash.mp4`
- `public/assets/opening/sakura-field-day.mp4`

日夜切换、首页开屏、沉浸式内页都已经围绕这套主题做过适配。

不要轻易回退成模板默认配色。

---

## 4. 文案和配置主要从哪改

远程 Codex 如果要改文案，优先看这几处：

- `src/config.ts`
  - 站点基础配置
  - 导航、评论、主题色、站点级开关

- `src/data/module-blueprint.ts`
  - 首页四个分区文案
  - `Study` 页英雄区、筛选区文案
  - 模块级说明文字

- `src/content/posts/study/start-here.md`
  - Study 使用说明

更多入口参考：

- `docs/THEME_AND_COPY_EDIT_GUIDE.zh-CN.md`
- `docs/PROJECT_STRUCTURE.zh-CN.md`
- `docs/STUDY_WRITE_GUIDE.zh-CN.md`

---

## 5. 代码块 / Python Lab / Mermaid 的现状

### 5.1 代码块

现在的规则是：

- 普通带语言名的代码块会自动折叠
- 不满 `3` 行的不折叠
- 无语言名的代码块默认展开
- `python` / `python3` 会走自定义代码卡

相关文件：

- `src/scripts/code-collapse.js`
- `src/plugins/remark-python-playground.mjs`
- `src/styles/expressive-code.css`

### 5.2 Python Lab

`Python Lab` 之前走过很多版，最后稳定成了“轻量编辑器 + 逐步增强”的独立实现。

关键文件：

- `src/components/control/FloatingPythonLab.astro`
- `public/scripts/python-lab.js`

现在已经能用，但这块曾经是高频出问题区域。如果远程 Codex 要继续优化：

- 优先保留当前独立链路
- 不要再把它和全局浮层控制器硬绑一起

### 5.3 Mermaid

Mermaid 已经回退成“尽量接近默认 Mermaid”的稳定方案。

关键文件：

- `public/scripts/mermaid-runtime.js`
- `src/styles/markdown-extend.styl`

经验：

- 不要再随便给 Mermaid 叠复杂缩放/图片化预览逻辑
- 带 `%%{init}` 的图很容易引发主题或渲染异常
- 优先使用简单稳定写法

---

## 6. 喵喵 Dify Bot 的现状

用户创建了一个 Dify bot，叫“喵喵”，希望在博客里呼出聊天面板。

目前已经接上了一个独立链路：

- 左下角悬浮按钮与聊天面板：
  - `src/components/control/FloatingMiaoMiaoChat.astro`

- 前端运行时：
  - `public/scripts/miaomiao-chat.js`

- 构建时生成的站内知识索引：
  - `src/pages/api/miaomiao-knowledge.json.ts`

- Astro 服务端代理：
  - `src/pages/api/miaomiao-chat.ts`

这套设计的关键点：

- 站点主体仍以内容页为主，但现在运行在 server mode
- 喵喵会先读取“站内知识索引”
- 再把相关上下文交给 Dify
- 优先走服务端代理，避免把主密钥直接暴露到浏览器
- 本地开发时也预留了前端直连 fallback

### 重要边界

喵喵现在能读到的，主要是：

- 博客文章内容
- `docs/` 里的说明文档
- 仓库内一部分源码摘要

它**不能天然读到仓库外**的任意文件，例如：

- `/Users/owen/AI_learning/...`
- 远程服务器上的私有后端目录

如果后续要让它“读后端”：

1. 要么把后端代码同步进这个仓库的索引范围
2. 要么把后端文档 / 摘要灌进 Dify 知识库
3. 要么把站点改成真正有服务端读取能力的架构

### Dify 环境变量

不要把真实密钥写进提交。

应通过环境变量提供：

- `DIFY_API_BASE_URL`
- `DIFY_API_KEY`

可选前端 fallback：

- `PUBLIC_DIFY_API_BASE_URL`
- `PUBLIC_DIFY_API_KEY`

说明在：

- `.env.example`

---

## 7. 当前部署与环境变量

### 本地常用命令

```bash
pnpm check
pnpm build
pnpm start
```

### 服务器相关

当前部署文档在：

- `docs/SERVER_DYNAMIC_DEPLOY.zh-CN.md`

如果远程 Codex 在服务器上接手，需要知道：

- 项目现在运行在 `output: "server"` 下
- `src/pages/api/*.ts` 现在是站内真实 API
- 喵喵服务端代理现在走的是 `src/pages/api/miaomiao-chat.ts`
- 根目录 `api/miaomiao-chat.ts` 仅是旧 Vercel 方案遗留，可视情况清理

如果未来要把站迁到“真正动态”的服务器：

- 可以考虑单独接 FastAPI 后端
- 或者继续扩展 Astro 自己的服务端能力
- 不建议在当前大量前端逻辑都已成型的情况下，直接全站重写

---

## 8. 已知的工作区注意事项

当前工作区里，用户自己的这篇文章通常经常是未提交状态：

- `src/content/posts/study/算法题/hot-100百题题解.md`

接手时要注意：

- 不要默认 `git add .`
- 不要把用户正在写的文章混进功能提交

推荐只提交本次涉及文件。

---

## 9. 这位用户的明确偏好

远程 Codex 需要知道，这个用户很在意这些点：

- 不喜欢模板味
- 非常在意“成品感”和“精修”
- 希望页面像真正的产品，而不是技术 demo
- 很在意：
  - 标题字体
  - 玻璃层次
  - 日夜主题质感
  - 目录体验
  - 文集前后章导航
  - 代码块和 Python Lab 的交互感

做改动时应优先：

- 少解释，多落地
- 不要频繁引入半成品逻辑
- 不要为了炫技增加复杂但脆弱的链路
- 先稳，再做高级感

---

## 10. 建议远程 Codex 的接手顺序

如果下一位 Codex 要继续做，建议按这个顺序：

1. 先读：
   - `docs/PROJECT_STRUCTURE.zh-CN.md`
   - `docs/THEME_AND_COPY_EDIT_GUIDE.zh-CN.md`
   - 本文档

2. 再确认：
   - `src/config.ts`
   - `src/data/module-blueprint.ts`
   - `src/layouts/MainGridLayout.astro`
   - `src/layouts/Layout.astro`

3. 如果要改内容渲染：
   - 看 `src/plugins/`
   - 看 `src/scripts/`

4. 如果要改喵喵：
   - 先看 `FloatingMiaoMiaoChat.astro`
   - 再看 `miaomiao-chat.js`
   - 最后看 `api/miaomiao-chat.ts`

5. 如果要加真正后台能力：
   - 先做“独立后端”
   - 不要一开始就把 Astro 静态站彻底翻掉

---

## 11. 一句话交接摘要

这是一个已经高度定制过的 Astro 静态博客，重点是 `Study` 文集、日夜玻璃主题、代码块体验和喵喵聊天助手。接手时请优先维持现有视觉方向与内容结构，不要再走“临时补丁式”的复杂交互链；新增动态能力时，优先使用独立后端或 Vercel serverless，而不是直接把整站推倒重来。
