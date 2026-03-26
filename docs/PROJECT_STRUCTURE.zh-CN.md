# owen-blog 项目目录说明

这份说明面向当前已经整理后的仓库结构，不再描述原模板里已经删除的演示页、示例脚本和无效数据。

## 1. 项目定位

当前仓库是 OwEn 的个人博客源码，核心分区为：

- `Study`：学习与技术笔记
- `Lab`：实验与 Demo
- `Lounge`：轻内容与生活记录
- `Archive`：归档与资源整理

## 2. 根目录结构

### `src/`

站点源码主目录。

- `src/pages/`
  路由页面。
- `src/layouts/`
  页面布局骨架，例如首页开屏布局、沉浸式内页布局、文章布局。
- `src/components/`
  可复用组件。
- `src/content/`
  Markdown 文章内容与内容集合定义。
- `src/data/`
  页面文案、模块元数据、分区说明等静态数据。
- `src/styles/`
  全局样式与主题样式。
- `src/scripts/`
  前端运行时脚本，例如返回顶部、代码折叠、主题与面板初始化。
- `src/plugins/`
  Markdown / Rehype / Remark 处理插件。
- `src/utils/`
  文章、模块、URL、内容聚合等工具函数。
- `src/types/`
  配置类型与组件类型定义。
- `src/constants/`
  站点常量、链接预设等。
- `src/i18n/`
  国际化文案与 key。

### `public/`

静态资源目录，构建时原样输出。

- `public/assets/`
  站点图片、头像、字体、开屏素材等。
- `public/demos/`
  独立 Demo 页面。
- `public/scripts/`
  浏览器端独立脚本，例如 `python-playground.js`。
- `public/js/`
  仍保留的通用前端脚本。

### `docs/`

项目内部维护文档。

- `PROJECT_STRUCTURE.zh-CN.md`
  当前这份目录说明。
- `STUDY_WRITE_GUIDE.zh-CN.md`
  Study 分区写作说明。
- `MODULE_DIRECTORY_AND_PYTHON_GUIDE.zh-CN.md`
  目录模块与 Python 代码卡说明。
- `VERCEL_OWEN_TOP_DEPLOY.zh-CN.md`
  Vercel + 域名部署记录。
- `THEME_AND_COPY_EDIT_GUIDE.zh-CN.md`
  静态资源、前端文案和主题风格的修改入口说明。

### `scripts/`

保留的 Node 脚本。

- `new-post.js`
  新建文章辅助脚本。
- `reset-astro-content-cache.mjs`
  清理 Astro 内容缓存。

### `.github/workflows/`

GitHub Actions 工作流。

- `build.yml`
  主构建与检查。
- `deploy.yml`
  手动触发的备用 Pages 部署。
- `biome.yml`
  手动触发的代码质量检查。

## 3. 当前有效页面

### 首页与主分区

- `src/pages/[...page].astro`
  首页开屏入口。
- `src/pages/study/[...page].astro`
  Study 分区首页与分页。
- `src/pages/lab.astro`
  Lab 分区。
- `src/pages/lounge.astro`
  Lounge 分区。
- `src/pages/archive.astro`
  Archive 分区。

### 文章与内容输出

- `src/pages/posts/[...slug].astro`
  单篇文章页。
- `src/pages/[permalink].astro`
  permalink 兼容入口。
- `src/pages/rss.astro`
- `src/pages/rss.xml.ts`
- `src/pages/atom.astro`
- `src/pages/atom.xml.ts`
- `src/pages/robots.txt.ts`
- `src/pages/og/[...slug].png.ts`

### 其他

- `src/pages/404.astro`
- `src/pages/api/calendar-data.json.ts`

## 4. 内容目录怎么用

### 主文章内容

- `src/content/posts/study/`
- `src/content/posts/lab/`
- `src/content/posts/lounge/`
- `src/content/posts/archive/`

其中 `study/` 下面已经按主题拆目录，例如：

- `python-base/`
- `llm-base/`
- `算法题/`
- `fine-tuning/`
- `fastapi/`
- `pytorch/`

每个子目录都可以有自己的 `meta.json`，用于控制：

- `title`
- `eyebrow`
- `description`
- `icon`
- `accent`
- `size`
- `order`
- `hidden`

## 5. 几个关键文件

- `src/config.ts`
  站点总配置，包含标题、域名、导航、侧边栏、评论、主题色等。
- `src/data/module-blueprint.ts`
  四个主分区的文案、筛选说明、Study 页面文案等。
- `src/styles/main.css`
  全局主样式。
- `src/styles/splash.css`
  首页开屏专属样式。
- `src/plugins/remark-python-playground.mjs`
  Python 代码块渲染规则。
- `public/scripts/python-playground.js`
  Python Lab 与前端编辑器逻辑。

## 6. 这次整理删除了什么

这轮已经删掉的内容主要包括：

- 原模板 README 多语言副本和展示素材
- 原作者的番剧、设备、友链、项目、技能、时间线、相册、旧日记页面
- 对应的组件、示例数据和样式
- 原来的内容同步、番剧更新、字体压缩、性能基线等废弃脚本
- 一批不再使用的 GitHub workflow

现在仓库只保留与当前博客实际结构直接相关的代码。

## 7. 本地目录已经改名完成

当前项目的本地目录已经是：`/Users/owen/owen-blog`。

这轮整理后，仓库名字、README、说明文档和目录结构都已经统一到 `owen-blog`。

## 8. 建议的推送方式

如果你只改博客内容：

```bash
git add src/content/posts/
git commit -m "docs: update blog content"
git push
```

如果你这次主要提交的是站点整理与去模板化代码：

```bash
git add -u .
git add README.md package.json docs/PROJECT_STRUCTURE.zh-CN.md docs/VERCEL_OWEN_TOP_DEPLOY.zh-CN.md
git commit -m "chore: clean template residue and reorganize owen-blog"
git push
```

如果工作区里混有你正在写的文章内容，先用 `git status` 看清楚，再只 stage 代码和文档文件，不要直接 `git add .`。
