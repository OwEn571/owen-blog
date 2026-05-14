---
title: Docker Compose 编排实战：用你的项目拆解服务编排与健康检查
published: 2026-05-13
description: 从写 docker run 到写 compose.yaml，用你项目中真实的 Milvus + etcd + MinIO + Redis 编排案例，讲清楚多服务依赖、健康检查、数据卷持久化和启动顺序控制。
tags: [PythonWeb, Docker, Docker Compose, DevOps, 实战]
category: PythonWeb
weight: 15
draft: false
comment: true
---

你面经里 Docker 的问题回答偏浅。这一篇用你项目里真实在跑的 compose.yaml，把容器编排的核心概念串起来。

> **Java Web 对比**：Java 项目通常把中间件（MySQL、Redis、ES）作为外部依赖配置在 `application.yml` 里，服务本身打成单体 jar 跑。Docker Compose 在 Java 生态常用于本地开发环境——但 Python 生态更激进，经常 Compose 直接上生产（因为没有 Tomcat 这种"容器"概念，把所有东西都容器化更自然）。

## 1. 从 `docker run` 到 `compose.yaml`

先看单个容器怎么启动：

```bash
docker run -d \
  --name my-redis \
  -p 6379:6379 \
  -v redis_data:/data \
  redis:7.4-alpine redis-server --appendonly yes
```

当你有 4 个这样的容器，而且它们之间有启动顺序依赖时，手写命令就不行了。Compose 把它们写进一个文件：

```yaml
# docker-compose.yml
name: pdf-rag-agent

services:
  redis:
    image: redis:7.4-alpine
    command: ["redis-server", "--appendonly", "yes"]
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"

volumes:
  redis_data:
```

`docker compose up -d` 等价于上述 `docker run` 命令。优势是：配置在文件里、可版本控制、团队成员能复现。

## 2. 服务的启动顺序：`depends_on` + `healthcheck`

你的 Milvus 是这套编排里最复杂的服务——它依赖 etcd（元数据）和 MinIO（数据存储）：

```yaml
services:
  etcd:
    image: quay.io/coreos/etcd:v3.5.18
    healthcheck:
      test: ["CMD", "etcdctl", "endpoint", "health"]
      interval: 15s
      timeout: 10s
      retries: 10
    restart: unless-stopped

  minio:
    image: minio/minio:RELEASE.2024-12-18T13-15-44Z
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 15s
      timeout: 10s
      retries: 10
    restart: unless-stopped

  milvus:
    image: milvusdb/milvus:v2.4.13
    depends_on:
      etcd:
        condition: service_healthy   # 不是"启动了就行"，要健康检查通过
      minio:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9091/healthz"]
      interval: 20s
      timeout: 10s
      retries: 10
    restart: unless-stopped
```

**启动顺序链**：

```
docker compose up -d
  │
  ├→ etcd 启动 ──→ etcdctl endpoint health 通过
  │
  ├→ minio 启动 ──→ curl /minio/health/live 通过
  │
  └→ etcd healthy ✓ + minio healthy ✓ → milvus 启动
       └→ curl /healthz 通过 → 四个容器全部 healthy
```

`condition: service_healthy` 是关键。普通的 `depends_on` 只等容器启动（进程存在），不管服务是否真的可用。加上 healthcheck 条件后，Milvus 启动时 etcd 和 MinIO 一定已经能正常响应请求。

## 3. 数据卷：容器可以删，数据不能丢

```yaml
volumes:
  etcd_data:
  minio_data:
  milvus_data:
  redis_data:
```

Docker 的 named volume 独立于容器生命周期。容器删了、重建了、升级了，volume 还在。你的 Milvus 里 11K+ 个向量块全部存在 `milvus_data` 卷里：

```bash
docker compose down     # 删除容器 + 网络，不碰 volumes
docker compose up -d    # 重新创建容器，挂载同一个 volumes → 数据都在
```

这就是为什么"把 compose 文件丢了但容器还在跑"不危险——数据不在容器里，在 volumes 里。

## 4. 端口暴露策略：谁该暴露，谁不该

```yaml
milvus:
  ports:
    - "19530:19530"    # 暴露给宿主机，FastAPI 通过 localhost:19530 访问

redis:
  ports:
    - "6379:6379"      # 同上

etcd:
  # 没有 ports —— 只在内网被 milvus 访问

minio:
  # 没有 ports —— 只在内网被 milvus 访问
```

设计原则：只有应用层需要访问的服务才暴露端口。etcd 和 MinIO 是 Milvus 的内部依赖，只在 Docker 内网通信——不需要暴露到宿主机。

## 5. `restart: unless-stopped` — 自动恢复

服务器重启或容器意外退出时：

- `restart: unless-stopped` — Docker daemon 启动时自动拉起来，除非你手动 `docker stop`
- 配合 systemd 的 `Requires=docker.service`，服务器重启链路是：

```
服务器加电 → systemd 启动 → docker.service 启动
  → Docker daemon 自动拉起所有 restart: unless-stopped 容器
  → etcd → minio → milvus → redis 依次 healthy
  → systemd 启动 pdf-rag-agent-v4.service
  → FastAPI 连接到已 healthy 的 Milvus 和 Redis
```

## 6. Compose vs systemd：什么时候该用哪个

| 管理对象 | 适合的工具 | 原因 |
|---------|-----------|------|
| 数据库/中间件（Milvus, Redis） | Docker Compose | 固定镜像、启动顺序依赖、数据卷持久化 |
| 你自己的应用代码（FastAPI） | systemd | 频繁更新、不需要重建镜像、改完就重启 |
| 监控（Prometheus, Grafana） | Docker Compose | 固定镜像、配置驱动 |

这是混合部署策略——不追求"全容器化"，而是每种服务用最适合的管理方式。

## 7. Compose 也适合开发环境

你在 macOS 上开发时：

```bash
# 一行命令拉起来的开发环境
docker compose -f docker-compose.dev.yml up -d
# 包含: etcd, minio, milvus, redis —— 所有中间件
# FastAPI 在本地用 fastapi dev 跑，连 localhost:19530 和 localhost:6379
```

这套模式在团队里很有用：新人 clone 项目后 `docker compose up -d`，所有中间件就绪，不需要手动装 Milvus/Redis。
