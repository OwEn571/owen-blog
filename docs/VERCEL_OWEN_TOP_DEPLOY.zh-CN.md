# Vercel + owen.top 发布说明

这份说明面向当前这个博客仓库，目标是：

1. 先把站点挂到线上
2. 用 Vercel 托管自动部署
3. 绑定你已经买好的 `owen.top`
4. 后续只要 `git push` 就自动更新

---

## 当前项目已帮你处理好的部分

- 站点正式地址默认已经改成 `https://owen.top/`
- `vercel.json` 已就绪，Vercel 会按 `pnpm build -> dist` 这条链构建
- GitHub Pages 的自动发布工作流已经改成“手动触发”，避免和 Vercel 双重部署
- 如果后面你需要临时换域名，可以用环境变量 `PUBLIC_SITE_URL`

相关文件：

- `src/config.ts`
- `vercel.json`
- `.github/workflows/deploy.yml`
- `.env.example`

---

## 第 0 步：上线前最后检查

建议你在正式推送前看一下这几项：

1. `src/config.ts`
   - `title`
   - `subtitle`
   - `keywords`
   - `siteStartDate`

2. 确认不想启用的功能仍然是关闭状态
   - `commentConfig.enable`
   - 其余可选功能保持为默认关闭即可

3. 本地先过一次构建

```bash
pnpm check
pnpm build
```

---

## 第 1 步：推送到 GitHub

如果你还没有自己的 GitHub 仓库，先去 GitHub 新建一个空仓库，例如：

- 仓库名：`owen-blog`

然后在项目根目录执行：

```bash
git add .
git commit -m "chore: prepare initial launch"
git branch -M main
git remote add origin git@github.com:<你的用户名>/owen-blog.git
git push -u origin main
```

如果你已经有 `origin`，把上面的 `git remote add origin ...` 跳过即可。

如果你更习惯 HTTPS，也可以用：

```bash
git remote add origin https://github.com/<你的用户名>/owen-blog.git
```

---

## 第 2 步：在 Vercel 导入仓库

1. 打开 Vercel 控制台
2. 选择 `Add New... -> Project`
3. 连接 GitHub
4. 选择你的这个仓库
5. 导入后，Vercel 一般会自动识别 Astro

当前项目建议保持以下构建设置：

- Framework Preset: `Astro`
- Install Command: `pnpm install --frozen-lockfile`
- Build Command: `pnpm build`
- Output Directory: `dist`

建议顺手加一个环境变量：

- `PUBLIC_SITE_URL=https://owen.top/`

如果界面里已经自动识别对了，直接点 `Deploy` 即可。

---

## 第 3 步：第一次部署成功后做什么

第一次部署完成后，Vercel 会先给你一个临时域名，例如：

- `xxx.vercel.app`

先用它做两件事：

1. 打开首页确认能访问
2. 点开一篇文章、一个 Study 页面、一个代码练习区，确认线上功能可用

这一阶段如果你觉得线上访问比本地 `pnpm dev` 顺，这是正常的。  
但视频背景、毛玻璃、Monaco、Pyodide 这些仍然是前端负担，部署后不会凭空消失。

---

## 第 4 步：把 `owen.top` 绑到 Vercel

### 4.1 在 Vercel 里加域名

1. 打开你的项目
2. 进入 `Settings -> Domains`
3. 添加：
   - `owen.top`
4. Vercel 通常会建议你再补一个：
   - `www.owen.top`

Vercel 官方文档提到：添加 apex domain（根域）时，会推荐你把访问重定向到 `www` 子域，因为 `www` 记录通常更好管理。  
来源：

- Astro 文档：<https://docs.astro.build/en/guides/deploy/vercel/>
- Vercel Git 部署文档：<https://vercel.com/docs/git/vercel-for-github>
- Vercel 域名文档：<https://vercel.com/docs/domains/working-with-domains>

你可以采用这套推荐方式：

- 主访问域名：`www.owen.top`
- `owen.top` 自动 301 跳转到 `www.owen.top`

如果你更想直接裸域访问，也可以保留 `owen.top` 作为主域名。

### 4.2 去腾讯云 DNS 配记录

在腾讯云域名解析里，一般按下面加：

#### 方案 A：推荐方案

- `@` -> `A` -> `76.76.21.21`
- `www` -> `CNAME` -> 以 Vercel Domains 页面显示的目标值为准

在腾讯云控制台里通常就是：

- 主机记录：`@`
- 记录类型：`A`
- 记录值：`76.76.21.21`

以及：

- 主机记录：`www`
- 记录类型：`CNAME`
- 记录值：使用 Vercel 在 Domains 页面给你的那条目标值

说明：

- `@` 的 A 记录通常就是 `76.76.21.21`
- `www` 的 CNAME 目标值请优先以 Vercel 后台显示为准，不要死记固定字符串

TTL 保持默认即可。

如果你的域名之前在别的平台绑过，Vercel 可能还会要求你补一个 TXT 验证记录。  
这时不要猜，直接照 Vercel 域名页提示的那条 TXT 记录填。

### 4.3 等待校验

一般几分钟到几十分钟内会完成，偶尔会更久。  
当 Vercel 域名页显示：

- `Valid Configuration`
- HTTPS 已签发

就说明绑定成功了。

---

## 第 5 步：以后如何更新

以后你的日常流程会非常简单：

1. 本地改文章或页面
2. 提交并推送

```bash
git add .
git commit -m "docs: update study notes"
git push
```

3. Vercel 自动触发新构建
4. `main` 分支的新提交自动更新正式站

补充说明：

- Astro 官方文档说明：静态 Astro 项目不需要额外适配器即可部署到 Vercel
- Vercel 官方文档说明：导入 Git 仓库后，后续 push 会自动生成部署；生产分支的 push 会触发正式部署

---

## 建议的域名策略

如果你想用最稳的方式，我建议：

- 正式站：`www.owen.top`
- 根域：`owen.top` 跳到 `www.owen.top`

好处是：

- DNS 管理更清晰
- 后续加其他子域更方便
- 更符合 Vercel 的推荐方式

如果你更喜欢简洁，也可以直接只用：

- `owen.top`

---

## 如果部署成功但仍觉得卡

上线后如果你还觉得有点卡，优先怀疑这几类前端开销，而不是部署平台本身：

- 开屏和内页的视频背景
- 大面积毛玻璃和 blur
- Monaco 编辑器
- Pyodide 运行 Python

这时建议的优化顺序是：

1. 先只保留开屏视频，内页改静态背景
2. 适当降低 blur 和阴影层数
3. 让 Python 编辑器按需加载
4. 只在 Study 相关文章里启用运行环境

---

## 你现在最短的上线路径

1. 本地执行 `pnpm check`
2. 本地执行 `pnpm build`
3. 推到 GitHub
4. 在 Vercel 导入仓库
5. 先访问 `*.vercel.app`
6. 绑定 `owen.top`
7. 在腾讯云加 `A/CNAME` 记录
8. 等 HTTPS 生效
9. 之后只靠 `git push` 更新
