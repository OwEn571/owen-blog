# 主题、素材与前端文案修改说明

这份说明专门回答 3 类问题：

- 静态资源放哪里
- 前端显示出来的文字从哪里改
- 白天 / 夜间主题、背景视频和风格从哪里改

## 1. 静态资源目录

### 开屏 / 背景视频

- `public/assets/opening/`

当前已经在用的文件：

- `qidian-splash.mp4`：夜间模式视频
- `qidian-splash-poster.jpg`：夜间模式封面
- `sakura-field-day.mp4`：日间模式视频
- `sakura-field-day-poster.svg`：日间模式封面

如果你以后要换白天或夜间视频，最稳的做法是：

1. 直接替换 `public/assets/opening/` 下的同名文件
2. 或者放入新文件，再去下面两个文件里改路径：
   - `src/components/features/home/SplashSelector.astro`
   - `src/layouts/MainGridLayout.astro`

### 头像 / Logo / 通用图片

- `public/assets/common/`

适合放：

- 头像
- 顶栏 Logo
- 通用 SVG
- 站点标记图

### 字体

- `public/assets/font/`

### 独立静态脚本

- `public/scripts/`
  站内会直接加载的脚本，例如 `python-playground.js`
- `public/assets/js/`
  更偏传统静态资源形式保留的 JS

### 独立静态样式

- `public/assets/css/`

### 其他图片 / Demo / 图标

- `public/images/`：普通图片
- `public/demos/`：嵌入型 demo 页面
- `public/favicon/`：favicon 等站点图标

## 2. 前端文案从哪里改

### 全站基础信息

改这里：`src/config.ts`

常用项：

- `siteConfig.title`：站点标题
- `siteConfig.subtitle`：站点副标题
- `siteConfig.keywords`：SEO 关键词
- `siteConfig.navbarTitle`：导航左上角名称 / 图标
- `siteConfig.themeColor`：默认主题 hue

### 开屏页文字

改这里：`src/components/features/home/SplashSelector.astro`

常见项：

- `Select Module`
- `Opening Screen`
- 主标题
- 主描述

四个分区卡片本身的标题、说明、备注不在这里改，见下一条。

### 首页四个分区卡片文字

改这里：`src/data/module-blueprint.ts`

常见项：

- `moduleEntries`
  这里决定首页 / 开屏四个分区的：
  - `title`
  - `eyebrow`
  - `description`
  - `note`
  - `icon`
  - `accent`

### Study 页前端文案

改这里：`src/data/module-blueprint.ts` 里的 `studyPageContent`

常见项：

- `heroTitle`
- `heroDescription`
- `stageBadge`
- `filterTitle`
- `filterDescription`
- `currentLearning`

如果以后你再看到类似“Study 是我的学习博客分区”这种前端说明文字，优先来这里找。

### Study / Lab / Lounge / Archive 各自页面的 Hero 文案

分别改这里：

- `src/pages/study/[...page].astro`
- `src/pages/lab.astro`
- `src/pages/lounge.astro`
- `src/pages/archive.astro`

这些文件里主要控制：

- 页面 Hero 主标题
- 页面 Hero 描述
- 右侧舞台说明
- 模块内部的说明卡 / 路线图文案

### 目录卡标题 / 图标 / 颜色 / 描述

每个内容目录下面的 `meta.json`。

例如：

- `src/content/posts/study/算法题/meta.json`
- `src/content/posts/study/python-base/meta.json`

常用字段：

- `title`
- `eyebrow`
- `description`
- `icon`
- `accent`
- `size`
- `order`
- `hidden`

### 文章正文

直接改 `src/content/posts/` 下面的 Markdown。

例如：

- `src/content/posts/study/算法题/hot-100百题题解.md`
- `src/content/posts/study/算法题/acm模式.md`

## 3. 白天 / 夜间主题从哪里改

### 白天模式的开屏风格

主要改：

- `src/styles/splash.css`
- `src/components/features/home/SplashSelector.astro`

含义：

- `splash.css` 管首页开屏的全局背景、字体、基础色调
- `SplashSelector.astro` 管开屏视频切换、light/dark 对应的面板和卡片样式

### 内页沉浸式风格

主要改：

- `src/styles/main.css`
- `src/layouts/MainGridLayout.astro`

含义：

- `main.css` 负责四个分区和文章页的全局主题
- `MainGridLayout.astro` 负责内页背景视频、预载层、沉浸式壳层逻辑

### 日夜视频切换逻辑

两个地方一起控制：

- `src/components/features/home/SplashSelector.astro`
- `src/layouts/MainGridLayout.astro`

这两个文件里都用了：

- `data-src-dark`
- `data-src-light`
- `data-poster-dark`
- `data-poster-light`

如果你只是换视频路径，就改这些属性就够了。

## 4. 如果想继续精修白天模式，优先改哪里

最有用的顺序是：

1. `src/styles/splash.css`
   先把首页开屏气质定下来
2. `src/styles/main.css` 里 `:root:not(.dark)` 这一大段
   这里是日间模式的主色、玻璃、背景、强调色
3. `src/data/module-blueprint.ts`
   把页面文案从“说明型”继续收成“正式站点型”
4. 各模块页面本身
   只在某个分区要特殊表达时再改 `study/lab/lounge/archive` 对应页面

## 5. 字体层级与打字机特效从哪里改

### 全局字体变量

主要改这两个文件：

- `src/styles/main.css`
- `src/styles/splash.css`

现在全站主要有 3 个字体变量：

- `--owen-font-ui`：导航、标签、按钮、通用 UI
- `--owen-font-display`：大标题、模块 Hero、文章层级标题
- `--owen-font-reading`：段落正文、描述文字、阅读内容

如果你觉得“整体字味不对”，优先先改这 3 个变量，而不是到处单独改 `font-family`。

### 文章阅读排版

主要改：`src/styles/main.css`

重点看这些选择器：

- `.post-article-title`
- `.post-markdown-flow`
- `.post-markdown-flow .custom-md > h2/h3/h4`
- `.post-markdown-flow .custom-md a`
- `.post-markdown-flow .custom-md :not(pre) > code`

这几块决定文章页的：

- 主标题气质
- 正文字号、行距、字距
- 小标题层级
- 链接颜色
- 行内代码风格

### 模块 Hero 的字从哪里改

- `src/components/features/home/SplashSelector.astro`：开屏主标题
- `src/pages/study/[...page].astro`：Study Hero
- `src/pages/lab.astro`：Lab Hero
- `src/pages/lounge.astro`：Lounge Hero
- `src/pages/archive.astro`：Archive Hero

这些地方如果用了 `<TypewriterText />`，说明当前是“打字机呈现”的标题。

### 打字机组件本体

改这里：`src/components/atoms/typewriter-text/TypewriterText.astro`

常用参数：

- `text`：显示文本
- `speed`：打字速度
- `deleteSpeed`：删除速度
- `pauseTime`：停顿时间
- `showCaret`：是否显示光标
- `class`：附加类名

### 现在哪些地方用了打字机

默认比较关键的位置才建议保留：

- 开屏标题：保留光标
- Study Hero：保留光标
- Lab / Lounge / Archive Hero：只做打字，不显示光标
- 个人资料卡简介：由 `src/config.ts` 的 `profileConfig.typewriter` 控制

如果你以后觉得某一处动画太多，最简单的做法就是把对应页面里的 `<TypewriterText />` 换回普通文本。

## 6. 修改后如何验证

本地建议：

```bash
pnpm check
pnpm build
```

如果只是改内容：

```bash
git add src/content/posts/
git commit -m "docs: update blog content"
git push
```

如果是改主题 / 样式 / 素材：

```bash
git add src/styles/ src/layouts/ src/components/ public/assets/ docs/
git commit -m "style: refine day mode"
git push
```
