# 服务器动态部署说明

这份说明对应当前仓库的主线部署方式：

1. 博客使用 `Astro + @astrojs/node`
2. 构建输出切到 `output: "server"`
3. 通过 Node standalone 方式在服务器上运行
4. 搜索与喵喵代理都走站内真实 API

## 1. 安装依赖

```bash
pnpm install
```

如果服务器没有全局 `pnpm`，可以用 `corepack` 或自行安装 `pnpm`。

## 2. 本地开发

```bash
pnpm dev
```

默认会监听 `0.0.0.0`，方便在远程主机上调试。

## 3. 构建

```bash
pnpm build
```

构建完成后会产出：

- `dist/server/entry.mjs`
- `dist/client/`

其中：

- `dist/server/entry.mjs` 是 Node 服务入口
- `dist/client/` 是静态资源

## 4. 启动生产服务

```bash
HOST=0.0.0.0 PORT=4321 pnpm start
```

等价于：

```bash
HOST=0.0.0.0 PORT=4321 node ./dist/server/entry.mjs
```

建议在前面接一层 Nginx / Caddy 反向代理，再处理 HTTPS。

## 5. 环境变量

至少关注这些：

- `PUBLIC_SITE_URL`
- `DIFY_API_BASE_URL`
- `DIFY_API_KEY`
- `PUBLIC_TWIKOO_ENV_ID`
- `PUBLIC_TWIKOO_REGION`
- `PUBLIC_UMAMI_SHARE_URL`

说明：

- `DIFY_API_KEY` 应放在服务器运行时环境里，不要提交到仓库
- `PUBLIC_DIFY_API_KEY` 只适合本地调试，不建议线上使用

## 6. 现在已经动态化的部分

- `src/pages/api/miaomiao-chat.ts`
  真实服务端聊天代理
- `src/pages/api/search.json.ts`
  真实服务端搜索接口
- `src/pages/api/miaomiao-knowledge.json.ts`
  站内知识索引接口

## 7. 说明

这次切换的目标不是全站重写，而是把博客从“纯静态站”推进到“可在服务器上运行真实 API 的混合动态博客”：

- 内容结构和前端视觉保持原样
- 内容页仍可保留预渲染能力
- 服务端能力先从搜索和喵喵开始接入
- 后续如果要接更重的业务，再单独接 FastAPI 更合适
