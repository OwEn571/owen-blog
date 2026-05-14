---
title: Python Web 部署链路：systemd + Uvicorn + Caddy 反向代理
published: 2026-05-13
description: 把你的 FastAPI 应用从本地开发变成生产可用的服务：systemd 管理进程生命周期、Uvicorn 跑 ASGI、Caddy 做反向代理和 HTTPS。用你项目里真实跑的部署拓扑讲清楚每一层的职责。
tags: [PythonWeb, Deployment, systemd, Uvicorn, Caddy, 实战]
category: PythonWeb
weight: 14
draft: false
comment: true
---

你简历上写了 FastAPI 后端开发，面经里却说"只做了 RESTful 路由"。这篇用你项目里真实在跑的部署拓扑，把 Python Web 部署链路讲清楚：不只是"写接口"——从进程管理、ASGI 服务器、反向代理到 HTTPS，每一层都是工程化能力。

> **Java Web 对比**：Java 项目通常打成 jar/war 包扔进 Tomcat 容器，Tomcat 既是进程管理器又是 Servlet 容器又是 HTTP 服务器。Python 生态没有"容器"这个概念——你需要手工组合 systemd（进程管理）+ Uvicorn（ASGI 服务器）+ Caddy/Nginx（反向代理）来实现相同的职责。好处是每层可控、坏处是新手不知道这些层存在。

## 1. 部署拓扑总览

你的 pdf-rag-agent-v4 项目在服务器上是这样跑的：

```
互联网
  │
  ├── :443 (HTTPS) ──→ Caddy（反向代理 + 自动 TLS）
  │                      │
  │                      ├─ /api/v1/chat/stream → 127.0.0.1:8001
  │                      └─ / (静态文件)        → 本地目录
  │
  ├── 127.0.0.1:8001 ──→ Uvicorn（ASGI 服务器）
  │                        │
  │                        └─ app.main:app（FastAPI 实例）
  │
  ├── 127.0.0.1:9091 ──→ Prometheus（指标采集）
  ├── 127.0.0.1:3000 ──→ Grafana（监控面板）
  │
  └── systemd ──→ 管理 pdf-rag-agent-v4.service
                  同时 docker compose 管理基础设施容器
```

## 2. 第一层：systemd — 进程的守护者

systemd 是 Linux 的初始化系统，负责管理所有后台服务。你的 service 文件（`/etc/systemd/system/pdf-rag-agent-v4.service`）：

```ini
[Unit]
Description=PDF RAG Agent V4
Requires=docker.service
After=docker.service network-online.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/owen/pdf-rag-agent-v4
Environment=PYTHONUNBUFFERED=1
ExecStart=/home/ubuntu/miniconda3/envs/zotero-paper-rag/bin/python \
          -m uvicorn app.main:app --host 127.0.0.1 --port 8001
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

关键决策：

| 配置 | 为什么这样写 |
|------|-------------|
| `Requires=docker.service` | 强制 Docker 先启动，Milvus/Redis 容器先于 FastAPI |
| `After=docker.service network-online.target` | 网络和 Docker 都就绪后才启动应用 |
| `Restart=always` + `RestartSec=3` | 应用挂了 3 秒后自动重启 |
| `--host 127.0.0.1` | 只监听本地，不直接暴露公网——由 Caddy 反向代理出去 |
| `Environment=PYTHONUNBUFFERED=1` | 日志实时输出，不被 Python 缓冲 |

> **Java Web 对比**：Java 应用很少直接跟 systemd 打交道——Tomcat/Spring Boot 内嵌容器自带 daemon 化。但如果你用 `java -jar` 跑 Spring Boot jar，一样需要 systemd 管理进程生命周期。

## 3. 第二层：Uvicorn — ASGI 服务器

Uvicorn 的职责是把 Python 代码跑成真正的网络服务：

```bash
uvicorn app.main:app --host 127.0.0.1 --port 8001
```

- `app.main:app` → 从 `app/main.py` 导入 `app = FastAPI()` 对象
- `--host 127.0.0.1` → 只监听 loopback，不暴露公网
- `--port 8001` → 监听端口
- 底层使用 `uvloop`（基于 libuv）跑异步事件循环
- 每个请求到达时，Uvicorn 构造 ASGI 的 `scope/receive/send` 三要素，传给 FastAPI

**开发 vs 生产**：

| 场景 | 命令 | 特点 |
|------|------|------|
| 本地开发 | `fastapi dev` | 自动重载、详细错误页面 |
| 生产 | `uvicorn main:app` via systemd | 稳定、systemd 管理重启 |

## 4. 第三层：Caddy — 反向代理 + HTTPS

Caddy 是 Go 写的 Web 服务器，在你的项目里扮演反向代理角色。关键配置：

```caddy
owen571.top {
    # 静态文件
    handle /lab/zotero-paper-rag {
        root * /home/ubuntu/owen/pdf-rag-agent-v4/app/static
        file_server
    }

    # API 反向代理
    handle /api/v1/* {
        reverse_proxy 127.0.0.1:8001 {
            flush_interval -1    # SSE 流式响应不缓冲
        }
    }
}
```

三个职责：

**① HTTPS 终结**：Caddy 自动从 Let's Encrypt 申请和续期 TLS 证书。你的 FastAPI 不用管 HTTPS——它在 127.0.0.1 上跑纯 HTTP，Caddy 对外提供 HTTPS。

**② 反向代理**：所有 `/api/v1/*` 请求转发给后面 Uvicorn 的 8001 端口。客户端不知道 Uvicorn 的存在。

**③ SSE 流式支持**：`flush_interval -1` 是踩过的坑——默认 Caddy 会缓冲响应，导致 SSE 流式连接 ~33 秒处断开。这个参数告诉 Caddy"不要缓冲，数据一来就转发"。

> **Java Web 对比**：Java 项目前面的 Nginx/Caddy 做的事完全一样。但 Java 的 Tomcat 有时直接对外服务（省一层反向代理），Python 的 Uvicorn/Gunicorn 几乎总会前面挂 Nginx/Caddy。

## 5. 基础设施容器化：Docker Compose

你的数据库和中间件用 Docker Compose 管理：

```yaml
# docker-compose.yml (基础设施层)
services:
  etcd:       # Milvus 元数据存储
  minio:      # Milvus 向量数据存储 (S3 兼容)
  milvus:     # 向量数据库
  redis:      # 查询缓存
```

为什么数据库用 Compose 而不是 systemd？

- Milvus 依赖 etcd + MinIO，三者有严格的启动顺序（etcd healthy → minio healthy → milvus）
- Compose 的 `depends_on` + `healthcheck` 天然表达这种依赖关系
- 用 systemd 手写等价逻辑需要十几个 `After=` + `ExecStartPre=` 脚本

FastAPI 本身不用 Compose——改代码后 `systemctl restart` 即可更新，无需重新 `docker build`。

## 6. 部署检查清单

部署一个新版本时，你需要确认的：

```
[ ] systemd service 配置正确（user、路径、环境变量）
[ ] systemctl enable pdf-rag-agent-v4 （开机自启）
[ ] docker compose up -d（基础设施健康）
[ ] Caddy 反向代理配置正确（SSE 路径不走压缩）
[ ] 防火墙只开放 80/443，不暴露 8001/19530/6379
[ ] systemctl daemon-reload 后 service 正常启动
[ ] 日志可查：journalctl -u pdf-rag-agent-v4 -f
```

## 7. 为什么面试时要讲这条链路

面基础设施部门时，面试官问"你做过工程化吗"，不是说"你写过几行 Python"。你可以从 systemd 讲到 Caddy 的 SSE 压缩 Bug，从 docker compose healthcheck 讲到 127.0.0.1 的安全边界——这一整条部署链路上每一层你都做过决策。这才是工程化。
