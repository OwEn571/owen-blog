# MIZUKI 博客改造说明书

这份说明书是给你后续继续改造这个项目用的。

当前这一轮，我已经先把项目做了一次“去模板化”处理，目标是把它从“别人的演示站”收敛成“你的博客底座”。

## 0. 这轮已经帮你做了什么

- 把站点的默认身份信息改成更中性的博客占位配置。
- 关闭了默认演示页入口，只保留核心博客结构。
- 去掉了原作者的导航、头像、个人资料、公告、音乐播放器、看板娘等强模板痕迹。
- 关闭了默认横幅和首页打字机文案，避免一打开就是原模板风格。
- 把示例文章改成隐藏状态，并新增了一篇可直接替换的占位文章。
- 把 About 页改成可直接填写的个人介绍模板。
- 把项目页、技能页、时间线、友链、设备、日记、番剧等演示数据清空。
- 把 `robots.txt` 改成允许全站抓取，避免默认只放行首页和文章页。
- 生成了这份改造说明书，供你后续对照修改。

## 1. 建议你按这个顺序改

### 第一阶段：先把“身份信息”改成你自己的

优先编辑：

- `src/config.ts`
- `src/content/spec/about.md`
- `src/content/posts/welcome.md`

这一阶段只需要处理最核心的东西：

- 博客标题
- 副标题
- 站点地址
- 关键词
- 导航栏名称和结构
- 头像
- 你的名字
- 一句话简介
- 社交链接
- About 页面正文
- 第一篇真正的文章

### 第二阶段：决定哪些功能页你真的要

目前这些页面默认是关闭的：

- `anime`
- `diary`
- `friends`
- `projects`
- `skills`
- `timeline`
- `albums`
- `devices`

它们的开关都在 `src/config.ts` 里的 `featurePages`。

建议做法：

- 如果你只是做一个纯博客，先不要开。
- 如果你想做“博客 + 个人展示站”，再逐项打开。
- 每打开一个页面前，先把对应数据文件改成你自己的内容。

### 第三阶段：再处理视觉风格

等内容和结构稳定以后，再做：

- Logo / Favicon
- 首页横幅
- 字体
- 配色
- 页脚
- 特色页面布局

这样效率最高，也不容易反复返工。

## 2. `src/config.ts` 怎么改

这个文件是整站总开关。

### `siteConfig`

你最先应该改这些字段：

- `title`
- `subtitle`
- `siteURL`
- `keywords`
- `siteStartDate`
- `lang`
- `themeColor.hue`

说明：

- `siteURL` 必须改成你真实部署地址，结尾保留 `/`
- `keywords` 建议写 3 到 8 个
- `siteStartDate` 建议写你正式上线的日期

### `featurePages`

这一段控制特色页面开关。

建议：

- 纯博客：全部保持 `false`
- 想加作品集：打开 `projects`
- 想加技能树：打开 `skills`
- 想加时间线：打开 `timeline`
- 想加相册：打开 `albums`

### `navbarTitle`

这段控制导航栏左上角标题。

可改项：

- `mode`
- `text`
- `icon`
- `logo`

当前已经改成了中性图标：

- `public/assets/common/blog-mark.svg`

如果你以后有自己的 logo，直接替换路径即可。

### `navBarConfig`

当前导航只保留了：

- 首页
- 归档
- About

如果你以后想增加页面，按这个顺序做：

1. 先在 `featurePages` 打开页面
2. 再把页面链接加到 `navBarConfig`

### `profileConfig`

这段控制侧边栏个人资料卡片。

你要改：

- `avatar`
- `name`
- `bio`
- `links`

当前头像占位文件：

- `public/assets/common/avatar-placeholder.svg`

### `wallpaperMode` 和 `banner`

当前我已经把模板横幅关掉了。

如果你以后想重新启用首页横幅：

1. 把 `wallpaperMode.defaultMode` 改成 `banner`
2. 给 `banner.src` 配你自己的图片
3. 再决定要不要开 `homeText`
4. 最后再考虑 `waves`

不建议一开始就开，先把内容搭起来更重要。

### `commentConfig`

默认仍然关闭。

如果你要开评论：

1. 设置 `commentConfig.enable = true`
2. 配置 Twikoo 的 `envId`
3. 再决定哪些文章要不要单独关闭评论

### `musicPlayerConfig` 和 `pioConfig`

当前已经默认关闭。

建议在内容没整理完之前都不要启用。

### `sidebarLayoutConfig`

当前只保留了最基础的侧边栏组件：

- 左侧：`profile`
- 右侧：`site-stats`
- 抽屉：`profile`

如果你以后要恢复分类、标签、公告等组件，就改这里。

## 3. 内容文件怎么改

### About 页面

文件：

- `src/content/spec/about.md`

这里现在已经是一个可直接填写的占位模板。

建议你写这几部分：

- 你是谁
- 你写什么
- 你做过什么
- 如何联系你

### 文章

目录：

- `src/content/posts/`

当前可见文章是：

- `src/content/posts/welcome.md`

建议你这样做：

1. 直接把 `welcome.md` 改成你的第一篇文章
2. 或者删除它，自己新建真实文章

新建文章可以直接运行：

```bash
pnpm new-post your-post-name
```

### 关于示例文章

仓库里原来的示例文章我没有删，只是改成了 `draft: true`。

同时我还把文章列表逻辑改成了：

- `draft: true` 的文章在开发环境和生产环境里都会隐藏

这样做的好处是：

- 示例内容还能留在仓库里参考
- 但不会继续出现在首页和归档里

如果你想重新查看某篇示例文章，最简单的方法是把它的 `draft` 临时改成 `false`。

## 4. 各个特色页的数据文件

如果你将来要重新打开这些页面，就改对应文件。

### 友链页

- 页面说明：`src/content/spec/friends.md`
- 数据文件：`src/data/friends.ts`

### 项目页

- 数据文件：`src/data/projects.ts`

### 技能页

- 数据文件：`src/data/skills.ts`

### 时间线页

- 数据文件：`src/data/timeline.ts`

### 日记页

- 数据文件：`src/data/diary.ts`

### 设备页

- 数据文件：`src/data/devices.ts`

### 番剧页

- 数据文件：`src/data/anime.ts`
- 动态更新脚本：`scripts/update-anime.mjs`

说明：

- 我已经把这些文件都清空成“空白底座”了
- 你以后填进去的内容就是你自己的内容
- 现在即使重新开启页面，也不会冒出别人的示例数据

## 5. 相册功能怎么改

相册不是用 TS 数据文件，而是直接扫目录。

相关位置：

- 页面入口：`src/pages/albums.astro`
- 相册详情：`src/pages/albums/[id]/index.astro`
- 扫描逻辑：`src/utils/album-scanner.ts`
- 资源目录：`public/images/albums/`

每个相册目录都需要：

- 一个 `info.json`
- 一张 `cover.jpg`
- 若干图片文件

如果你以后启用相册页，建议先照着 `public/images/albums/` 里现有目录结构做一个你自己的相册样例，再逐步扩展。

## 6. 视觉资源怎么换

### 头像

当前占位头像：

- `public/assets/common/avatar-placeholder.svg`

替换后，把 `src/config.ts` 里的 `profileConfig.avatar` 改成你的路径。

### 导航图标 / Logo

当前占位图标：

- `public/assets/common/blog-mark.svg`

### Favicon

默认还是项目自带 favicon。

如果你要换：

1. 把新图标放到 `public/favicon/`
2. 在 `src/config.ts` 的 `favicon` 配置里填上

### 字体

当前我把字体配置改成了更中性的系统字体优先策略。

如果你想换成自己的字体：

1. 把字体文件放进 `public/assets/font/`
2. 在 `src/styles/main.css` 写 `@font-face`
3. 在 `src/config.ts` 的 `font` 配置里改 `fontFamily` 和 `localFonts`

## 7. SEO 和部署前必须检查的地方

### `robots.txt`

文件：

- `src/pages/robots.txt.ts`

我已经把它改成允许全站抓取。

### Head 信息

文件：

- `src/layouts/partials/HeadTags.astro`

这里会读取：

- `siteConfig.title`
- `siteConfig.keywords`
- `profileConfig.name`
- favicon 配置

### RSS / Atom

文件：

- `src/pages/rss.xml.ts`
- `src/pages/atom.xml.ts`

它们会跟着你的文章内容自动生成，所以你只需要保证：

- `siteURL` 正确
- 文章标题和描述写好
- 不想公开的内容保持 `draft: true`

## 8. 内容分离功能什么时候用

如果你后面想把“博客程序”和“博客内容”拆成两个仓库，可以再用这个能力。

相关文件：

- `.env.example`
- `scripts/sync-content.js`

建议现在先不要折腾。

先把单仓库版本改顺手，后面再拆，成本更低。

## 9. 我建议你下一步实际怎么做

你可以直接按下面清单推进：

- [ ] 改 `src/config.ts` 里的标题、URL、名字、简介、社交链接
- [ ] 改 `src/content/spec/about.md`
- [ ] 改 `src/content/posts/welcome.md` 或删除后写自己的第一篇文章
- [ ] 决定要不要保留项目页、技能页、时间线页
- [ ] 如果要保留，就开始填 `src/data/*.ts`
- [ ] 换头像、Logo、Favicon
- [ ] 最后再考虑首页横幅、字体和更深层的视觉改造

## 10. 关于“完全重做前端、保留引擎”

这条路是完全可行的，但你刚才说先按下不表，我也同意。

当前这个项目其实可以拆成两层来看：

- 内容与路由引擎：Astro Content、文章 schema、RSS、归档、SEO、工具脚本
- 展示层：布局、组件、配色、动画、侧边栏、横幅、交互样式

等你把这轮“去模板化 + 内容接管”做完以后，下一轮就可以专门做：

- 首页重构
- 文章页重构
- 导航与页脚重构
- 特色页视觉重做

到那时我们可以尽量保留内容引擎和数据结构，只重做前端表现层。
