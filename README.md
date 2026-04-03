# owen-blog

OwEn 的个人博客源码仓库，对应线上站点 [owen.top](https://owen.top/)。

这个仓库已经整理成面向实际写作和发布的版本，不再保留原模板的大量演示页、示例数据和无用脚本。当前内容结构围绕四个主分区：

- `Study`：学习记录、算法题解、Python / LLM / FastAPI / PyTorch 笔记
- `Lab`：实验、Demo、交互原型
- `Lounge`：轻内容、随笔、生活记录
- `Archive`：整理过的链接、资源、结构化归档

## 常用入口

- 项目结构说明：[docs/PROJECT_STRUCTURE.zh-CN.md](docs/PROJECT_STRUCTURE.zh-CN.md)
- Study 写作说明：[docs/STUDY_WRITE_GUIDE.zh-CN.md](docs/STUDY_WRITE_GUIDE.zh-CN.md)
- 目录模块与 Python 代码说明：[docs/MODULE_DIRECTORY_AND_PYTHON_GUIDE.zh-CN.md](docs/MODULE_DIRECTORY_AND_PYTHON_GUIDE.zh-CN.md)
- 服务器动态部署说明：[docs/SERVER_DYNAMIC_DEPLOY.zh-CN.md](docs/SERVER_DYNAMIC_DEPLOY.zh-CN.md)
- Vercel 旧部署说明（历史参考）：[docs/VERCEL_OWEN_TOP_DEPLOY.zh-CN.md](docs/VERCEL_OWEN_TOP_DEPLOY.zh-CN.md)

## 本地开发

```bash
pnpm install
pnpm dev
```

常用命令：

```bash
pnpm check
pnpm build
pnpm start
pnpm new-post
```

## 内容目录

主要文章内容位于：

- `src/content/posts/study/`
- `src/content/posts/lab/`
- `src/content/posts/lounge/`
- `src/content/posts/archive/`

## 发布方式

当前仓库已经支持 `Astro + Node adapter` 的服务器动态部署。博客主体保持现有内容结构和前端体验，搜索与喵喵代理则走真实服务端接口。

## 致谢

项目最初基于开源博客项目 [Mizuki](https://github.com/matsuzaka-yuki/mizuki)，现已按 OwEn 自己的写作和发布流程做了深度改造与裁剪。
