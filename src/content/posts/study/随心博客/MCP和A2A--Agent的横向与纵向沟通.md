---
title: MCP和A2A--Agent的横向与纵向沟通
published: 2026-04-03
description: MCP与A2A协议的横向与纵向沟通机制对比分析
tags: [MCP, A2A, Agent, SKILL]
category: blog
draft: false
pinned: true
priority: 1
comment: false
---

如果你最近关注 AI Agent 生态，一定听过两个名字：**MCP**（Model Context Protocol）和 **A2A**（Agent-to-Agent）。它们常被放在一起讨论，但解决的问题根本不同——**MCP 是 Agent 与工具的纵向连线，A2A 是 Agent 与 Agent 的横向握手**。

更戏剧性的是，2026 年前后，一股"MCP 已死，SKILL 当立"的声音席卷社区：Perplexity CTO 宣布全面放弃 MCP，Y Combinator CEO 说 "MCP sucks"，Hacker News 热帖直言 "MCP is dead, long live the CLI"。连 Anthropic 自家的 Claude Code 也被发现核心架构更接近 CLI + SKILL 而非 MCP。

本文将从**协议原理、源码实现、通信流程**三个层面拆解 MCP，然后梳理 A2A 的设计与生态现状，最后对比 SKILL/CLI 的哲学，看看这场争论到底在争什么。

---

## 一、MCP：Agent 的"万能工具协议"

### 1.1 设计哲学：AI 界的 LSP

MCP 是 Anthropic 于 2024 年 11 月推出的开放协议，核心类比是 **LSP（Language Server Protocol）**。LSP 让任何编辑器都能与任何语言服务器对话——不必为每个编辑器写一个插件。MCP 想做同样的事：**让任何 AI 应用都能与任何数据源/工具服务器对话**，不必为每个 AI 应用写一个集成。

它的角色三分天下：

```
┌─────────────────────────────┐
│  Host（Claude Desktop / IDE）   │  ← AI 应用本体
│  ┌─────────────────────────┐ │
│  │  Client（协议连接器，1:1 到 Server）  │
│  └─────────────────────────┘ │
└──────────┬──────────────────┘
           │  JSON-RPC 2.0
┌──────────▼──────────────────┐
│  Server（工具/资源/提示词提供者）│  ← 数据源或外部服务
└─────────────────────────────┘
```

- **Host**：运行 AI 模型的应用（Claude Desktop、VS Code 插件、任意自建 App）
- **Client**：Host 内部的协议连接器，每个 Client 对应一个 Server
- **Server**：对外暴露 `tools`（可调用的函数）、`resources`（结构化数据）、`prompts`（提示词模板）

### 1.2 协议基础：JSON-RPC 2.0，但有规矩

MCP 运行在 **JSON-RPC 2.0** 之上，但做了几个关键约束：

- **Request 必须有 id**（必须是 string 或 integer，不能是 null）
- **id 不能在同一 session 内重用**
- **不允许批量请求**（2025-06-18 起，数组形式的批量请求被移除）
- **Notification 不能带 id**（fire-and-forget 语义）

一个典型的请求长这样：

```json
// Client → Server
{
  "jsonrpc": "2.0",
  "id": "1",
  "method": "tools/list",
  "params": {}
}

// Server → Client（响应）
{
  "jsonrpc": "2.0",
  "id": "1",
  "result": {
    "tools": [
      {
        "name": "calculate",
        "description": "执行数学运算",
        "inputSchema": {
          "type": "object",
          "properties": {
            "operation": { "type": "string", "enum": ["add", "multiply"] },
            "a": { "type": "number" },
            "b": { "type": "number" }
          }
        }
      }
    ]
  }
}
```

通知（不需要响应的事件）长这样：

```json
// Server → Client（工具列表变了，通知一声）
{
  "jsonrpc": "2.0",
  "method": "notifications/tools/list_changed"
}
```

### 1.3 生命周期：严格的三步握手

MCP 的启动过程像一个谨慎的谈判——双方先确认彼此的能力，再开始干活：

```
Client                              Server
  │                                    │
  │──── initialize ──────────────────→│  ① 客户端声明能力和协议版本
  │                                    │
  │←─── { capabilities, serverInfo } ─│  ② 服务器返回自己的能力集
  │                                    │
  │──── initialized (notification) ──→│  ③ 客户端确认"我准备好了"
  │                                    │
  │══════ 正常通信开始 ═══════════════│
  │←──→ ping（双向心跳）               │
  │←──→ tools/call, resources/read ... │
```

核心机制是 **能力协商**（Capability Negotiation）：Server 在 initialize 响应中声明自己支持 `tools` / `resources` / `prompts` / `logging` 等能力；Client 声明自己支持 `roots` / `sampling` / `elicitation`。**不声明就不能用**——这是一种 fail-fast 的设计，避免调了一个 server 根本不支持的方法。

### 1.4 三大原语：Tools、Resources、Prompts

**Tools（工具）** 是最核心的能力，让 AI 模型能执行外部函数：

- `tools/list` → 返回工具名、描述、inputSchema
- `tools/call` → 带着参数调用，返回 `{ content: [...], structuredContent: {...} }`
- 2025-06-18 后支持 `structuredContent`（JSON 结构化输出）+ `outputSchema` 声明

**Resources（资源）** 暴露结构化的上下文数据：

- `resources/list` → 列出所有可用资源（URI + mimeType）
- `resources/read` → 按 URI 读取内容
- `resources/subscribe` → 订阅资源变更通知
- `resources/templates/list` → 带参数的 URI 模板

**Prompts（提示词模板）** 提供可复用的对话模板：

- `prompts/list` → 列出模板名、描述、需要的参数
- `prompts/get` → 传入参数，获取完整提示词和消息列表

**实际调用中，AI 模型几乎只用到 Tools**。Resources 和 Prompts 更多是面向人类用户的快捷方式——比如 Claude Desktop 的 Prompt 菜单。这解释了为什么后来 SKILL 能崛起：大部分 MCP server 只暴露了一堆函数签名，而这些信息完全可以用更轻量的方式传递。

### 1.5 传输层：从 stdio 到 WebSocket

MCP 支持多种传输方式，从本地到远程：

| 传输方式 | 状态 | 适用场景 |
|---------|------|--------|
| **stdio** | 主流 | 本地子进程（最低延迟，零网络开销） |
| **Streamable HTTP** | 推荐（生产环境） | 远程部署，需认证 |
| **HTTP+SSE** | 已弃用 | 旧版兼容 |
| **WebSocket** | 支持 | 双向实时通信 |

### 1.6 源码视角：Claude Code 的 MCP 实现

我们直接看 Claude Code 的源码（路径：`/home/ubuntu/owen/claude-code/src/services/mcp/`），理解一个生产级 MCP 客户端是怎么工作的。

**配置层（config.ts）**：MCP 服务器的配置有 8 种类型——

```typescript
// 从 types.ts 可以看到完整的配置联合类型
export const McpServerConfigSchema = z.union([
  McpStdioServerConfigSchema(),      // 本地进程：command + args + env
  McpSSEServerConfigSchema(),        // 远程 SSE：url + headers + oauth
  McpSSEIDEServerConfigSchema(),     // IDE 内 SSE
  McpWebSocketIDEServerConfigSchema(),// IDE 内 WebSocket
  McpHTTPServerConfigSchema(),       // 远程 HTTP
  McpWebSocketServerConfigSchema(),  // 远程 WebSocket
  McpSdkServerConfigSchema(),        // 嵌入式 SDK
  McpClaudeAIProxyServerConfigSchema(),// Claude.ai 代理
])
```

配置来源也是多源的——`local` / `user` / `project` / `dynamic` / `enterprise` / `claudeai` / `managed`，不同 scope 按优先级叠加。

**连接层（client.ts 核心逻辑）**：连接流程是这样的——

1. 从配置中读取所有 MCP server 定义
2. 为每个 server 创建 `Client`（来自 `@modelcontextprotocol/sdk/client`）
3. 选择对应的 Transport：
   - `StdioClientTransport` — 启动子进程
   - `SSEClientTransport` / `StreamableHTTPClientTransport` — 远程 HTTP
   - `WebSocketTransport` — 双向实时通道
4. 执行 `client.connect(transport)` → 内部触发 initialize 握手
5. 握手成功后调用 `client.listTools()` 获取工具列表
6. 将 MCP 工具**包装为 Claude Code 的 `MCPTool`**，注入到工具池

```typescript
// 来自 client.ts — 导入的 SDK 客户端和传输层
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { WebSocketTransport } from '../../utils/mcpWebSocketTransport.js'
```

#### 传输层详解：从本地进程到远程服务器

上面提到了多种 Transport，但它们有什么区别、分别适合什么场景？下面从基础概念讲起，逐个梳理。

**（1）stdio —— 本地进程通信**

这是最"原始"的通信方式。stdio 就是"标准输入输出"——操作系统给每个进程分配的三个通道：stdin（输入）、stdout（输出）、stderr（错误）。当你打开终端执行 `ls`，它的输出就写在 stdout 上。

MCP 的 stdio transport 原理是：**Host 作为父进程启动 MCP Server 子进程，然后双方通过子进程的 stdin/stdout 互相发送 JSON-RPC 消息**。没有网络，没有端口，纯粹的操作系统管道。

```typescript
// Claude Code 的 stdio 传输创建
transport = new StdioClientTransport({
  command: 'npx',                      // 启动什么命令
  args: ['-y', '@anthropic/mcp-server-github'],  // 命令参数
  env: { ...subprocessEnv(), ...config.env },     // 环境变量
  stderr: 'pipe',                      // 错误输出走管道（不污染 UI）
})
```

优点：零网络开销、不需要认证、延迟极低。缺点：只能连本机、每个 server 独占一个子进程。**适合本地开发工具**，比如连本机的文件系统、数据库、Git。

**（2）HTTP+SSE（已弃用） —— MCP 的双通道困境**

首先要澄清一个容易混淆的点：**SSE 本身没有死**。你日常调用 OpenAI、Claude API 时看到的流式输出（token 一个接一个蹦出来），绝大多数就是 SSE——客户端发一个 POST，服务器用 `text/event-stream` 源源不断返回结果。这个模式干净、高效、天然适合 LLM 的逐 token 生成。

**但 MCP 的 SSE transport 不是这个用法**。

SSE（Server-Sent Events）的原理是：客户端发一个 GET 请求，服务器不关连接，持续单向推送数据。这就带来了 MCP 场景下的根本问题——**SSE 是单向的（Server → Client），而 MCP 需要双向通信**。

于是 MCP 的 SSE transport 被迫用了**两条通道**：

```
Client                              Server
  │──── GET /sse ──────────────────→│  长连接（收消息用）
  │←─── event: message ─────────────│
  │←─── event: message ─────────────│
  │──── POST /messages ────────────→│  短连接（发消息用）
  │←─── 200 OK ─────────────────────│
```

一条 GET 长连接专门收服务器的推送，一条 POST 短连接专门发客户端请求。这种双通道架构导致了几个实际麻烦：

- **会话管理脆弱**：GET 连接本身就是"会话凭证"——GET 一断，服务器就不知道你是谁了，即使 POST 还能发。恢复得重新走一遍初始化握手
- **负载均衡器不友好**：长连接让反向代理难以做请求级路由，一条连接长期粘在一台机器上
- **连接恢复复杂**：GET 连接断开后，需要重新建立长连接 + 重建会话状态，实现细节琐碎

因此 MCP 规范从 2025-06-18 起**弃用了这种 SSE 双通道模式**，推荐下面要讲的 Streamable HTTP——它在同一个端点上吸收 SSE 的流式能力，但没有双通道的包袱。Claude Code 中 `type: 'sse'` 仍然保留，纯粹是为了兼容旧版 MCP Server。

**（3）Streamable HTTP —— 现代推荐的远程方案**

Streamable HTTP 是 MCP 规范最新推荐的远程传输方式。它彻底解决了 SSE 的"双通道"问题——**用单一 HTTP 端点处理所有通信**。

核心设计：

- **所有请求都发往同一个 URL**，不再区分 GET (接收) 和 POST (发送)
- **支持两种模式自由切换**：
  - **无状态模式**：服务器不在请求之间保留任何会话状态。每个请求独立，负载均衡器随便分发——适合简单查询
  - **有状态模式**：服务器返回一个 `Mcp-Session-Id` 响应头，后续请求带上这个 ID，服务器就知道"这是同一个人"。适合需要上下文的长对话
- **流式响应**：当客户端需要流式输出时，服务器可以在响应中使用 SSE 格式（`text/event-stream`），这样**一个请求**就能收到持续推送——不再需要单独的 GET 长连接
- **可恢复性**：连接断了怎么办？如果是无状态模式，重发请求即可；如果是有状态模式，带上 `Mcp-Session-Id` 重连

用一句话总结：**Streamable HTTP = 普通 HTTP POST + 可选的会话状态 + 可选的流式响应**。它把之前 SSE 双通道要做的事统一到了一个模式里。

如果你熟悉 LLM API 的调用方式，可以这样理解：**Streamable HTTP 的流式模式，就是你调用 Claude API 时 `stream: true` 的那个 POST 请求**——一次 POST，服务器在同一个响应体里用 SSE 格式流式返回结果。区别只是 MCP 在这个基础上加了会话管理（`Mcp-Session-Id` 头）和无状态/有状态切换。

```typescript
// Claude Code 的 Streamable HTTP 传输创建
transport = new StreamableHTTPClientTransport(
  new URL('https://mcp-server.example.com/mcp'),  // 单一端点
  {
    authProvider,        // 认证（OAuth / API Key 等）
    requestInit: {
      headers: {
        'User-Agent': getMCPUserAgent(),
        ...combinedHeaders,
      },
    },
    // fetch 被包装：自动处理 60s 单次请求超时、OAuth 401 自动刷新
    fetch: wrapFetchWithTimeout(
      wrapFetchWithStepUpDetection(createFetchWithInit(), authProvider),
    ),
  },
)
```

**对比表格**：

| 特性 | stdio | SSE（弃用） | Streamable HTTP | WebSocket |
|------|-------|-----------|----------------|-----------|
| 通信方向 | 双向（双管道） | 半双工（收/发分用两个连接） | 双向（同一端点内） | 全双工 |
| 连接方式 | 本地子进程 | GET 长连接 + POST 短连接 | 一个 HTTP 端点 | 一个持久连接 |
| 会话管理 | N/A | 隐式（GET 连接即会话） | 可选（`Mcp-Session-Id`） | 隐式（连接即会话） |
| 适用场景 | 本地工具 | 旧版 MCP Server 兼容 | **推荐远程方案** | 实时双向通信 |
| 防火墙友好 | N/A（无网络） | 一般 | 好（标准 HTTP） | 差（常被拦截） |
| 负载均衡 | N/A | 困难 | 容易（无状态模式） | 困难 |

**（4）WebSocket —— 全双工长连接**

WebSocket 是独立的协议（`ws://` / `wss://`），它在一开始通过 HTTP **升级**握手后，转为一个持久的双向通道。和 HTTP 的区别：

- HTTP 是"一问一答"——客户端发请求，服务器返回响应，结束
- WebSocket 是"一直通话"——建立连接后，双方随时可以给对方发消息，直到任一方关闭

优点是真正的全双工、延迟极低、天生适合实时场景。缺点是部分企业防火墙会拦截 WebSocket 连接，而且长连接的状态管理对服务器有一定负担。

Claude Code 自己封装了一个 `WebSocketTransport`，同时适配 Node.js（`ws` 包）和 Bun（原生 `WebSocket`）：

```typescript
export class WebSocketTransport implements Transport {
  constructor(private ws: WebSocketLike) {
    this.opened = new Promise((resolve, reject) => {
      if (this.ws.readyState === WS_OPEN) {
        resolve()
      } else if (this.isBun) {
        nws.addEventListener('open', onOpen)    // Bun: 事件监听风格
      } else {
        nws.on('open', () => resolve())          // Node: 回调风格
      }
    })
  }
  async send(message: JSONRPCMessage): Promise<void> {
    const json = jsonStringify(message)
    if (this.isBun) {
      this.ws.send(json)                         // Bun: 同步 send
    } else {
      await new Promise<void>((resolve, reject) => {
        (this.ws as WsWebSocket).send(json, err => ...)  // Node: 异步 send
      })
    }
  }
}
```

**（5）InProcessTransport —— 同进程零开销**

Claude Code 还有两个特殊传输，不由用户直接配置，而是内部使用：

- **InProcessTransport**：在同一 Node 进程内创建一对"虚拟管道"，Client 和 Server 通过内存通信——完全没有序列化开销。Chrome MCP Server 和 Computer Use MCP Server 使用这种方式，避免启动 ~325MB 的子进程
- **SdkControlClientTransport**：用于 CLI 进程与 SDK 进程之间的跨进程通信——MCP 消息被包装为"控制请求"，通过 stdout/stdin 在进程间转发

**（6）选型速查**

| 场景 | 推荐 Transport | 配置 type |
|------|---------------|----------|
| 本地命令行工具（如 Git MCP Server） | stdio | `"type": "stdio"` |
| 远程生产级 MCP Server | Streamable HTTP | `"type": "http"` |
| IDE 内置 MCP | WebSocket / SSE-IDE | `"type": "ws-ide"` / `"sse-ide"` |
| 需要实时双向通知 | WebSocket | `"type": "ws"` |
| 旧版 MCP Server | SSE（兼容） | `"type": "sse"` |

连接后的 server 被建模为 5 种状态：

```typescript
type MCPServerConnection =
  | ConnectedMCPServer    // 已连接，持有 client、capabilities、serverInfo
  | FailedMCPServer       // 连接失败，记录 error
  | NeedsAuthMCPServer    // 需要认证（OAuth 流程未完成）
  | PendingMCPServer      // 等待重连（reconnectAttempt 计数）
  | DisabledMCPServer     // 用户主动禁用
```

**WebSocket 传输（mcpWebSocketTransport.ts）**：Claude Code 自己实现了一个 WebSocket Transport，同时支持 Node.js 的 `ws` 包和 Bun 的原生 `WebSocket`：

```typescript
export class WebSocketTransport implements Transport {
  private started = false
  private opened: Promise<void>
  private isBun = typeof Bun !== 'undefined'

  constructor(private ws: WebSocketLike) {
    this.opened = new Promise((resolve, reject) => {
      // 等待连接打开，分别处理 Bun 原生和 Node ws 包的事件
      if (this.isBun) {
        nws.addEventListener('open', onOpen)
        nws.addEventListener('error', onError)
      } else {
        nws.on('open', () => resolve())
        nws.on('error', error => reject(error))
      }
    })
  }
  // ... send() 方法也做了 Bun/Node 双适配
}
```

**工具包装（MCPTool.ts）**：MCP 工具被包装成标准的 `Tool` 对象，核心标志是 `isMcp: true`：

```typescript
export const MCPTool = buildTool({
  isMcp: true,
  name: 'mcp',  // 实际名称由 mcpClient.ts 动态覆盖
  maxResultSizeChars: 100_000,  // 大结果自动持久化到磁盘
  // call、description、prompt、inputSchema 全部由 mcpClient.ts 动态注入
  // ...
})
```

工具命名遵循 `mcp__<serverName>__<toolName>` 的规范（如 `mcp__github__search_repositories`），通过 `normalizeNameForMCP()` 做字符规范化。

**输出管理（mcpOutputStorage.ts）**：当 MCP 工具返回的结果超过 100,000 字符时，会自动持久化到磁盘，避免撑爆上下文窗口。这个机制对大结果（如 PDF、图片、Excel）特别重要——`isBinaryContentType()` 判断是否为二进制内容，`persistBinaryContent()` 将其写入文件系统，然后告诉模型去读文件。

### 1.7 MCP 的流程总结

```
用户说：帮我搜索 GitHub 上的 MCP 相关仓库

1. Claude Code 从配置加载 GitHub MCP Server 定义
2. 启动 stdio 子进程（或连接远程 HTTP endpoint）
3. Initialize 握手 → 拿到 Server 的 tools 列表
4. 将 tools 注入到 Claude 的上下文：mcp__github__search_repositories
5. 用户指令到来 → Claude 决定调用 mcp__github__search_repositories
6. MCPTool.call() → client.callTool({ name: "search_repositories", arguments: { query: "mcp" } })
7. MCP Server 执行 → 返回 JSON 结果
8. 结果如果太大 → 写磁盘 → 让模型用 Read 工具分段读取
```

这就是 MCP 的完整链路。它**标准化了工具发现→定义注入→远程调用的全流程**——这是它最大的价值。

### 1.8 实战：为 AIOS-NP 新闻系统搭建 MCP 服务

上面的流程是"消费者视角"——作为 MCP Client，Claude Code 如何连接和使用 MCP 工具。下面从"生产者视角"，看一个真实的 MCP Server 是如何从零搭建起来，并以系统服务的形式长期运行、对外开放的。

#### 背景：AIOS-NP 是什么

AIOS-NP 是一个基于 Workflow 的多 Agent 新闻生成流水线，每天自动运行 `hot_api → sort → search → generate → review → report` 六阶段流程，产出当日的分类新闻报告（JSON + HTML + Markdown + 纯文本）。项目获第二届中国研究生操作系统开源创新大赛国家三等奖。

运行结束后，报告静静地躺在服务器的 `output/` 目录里。问题是：**怎么让外部 AI Agent 方便地读到这些报告？** 让每个 Agent 去 SSH 到服务器上 `cat` 文件显然不现实。这正是 MCP 的用武之地。

#### 第一步：选 SDK，定义 Server

MCP 生态里，Python 端最常用的是官方 `mcp` 包提供的 **FastMCP**——一个高层的 Server 构建器，风格类似 FastAPI。核心代码在 [aios/tool/mcp_server.py](https://github.com/username/AIOS-NP/blob/main/aios/tool/mcp_server.py)（102 行）：

```python
from mcp.server.fastmcp import FastMCP

settings = get_news_mcp_settings()

mcp = FastMCP(
    name="AIOS Daily News MCP",
    instructions=(
        "Expose the latest AIOS daily news report so any MCP-capable agent "
        "can read today's news as a concise summary, structured payload, "
        "raw JSON, HTML, or text."
    ),
    host=settings["host"],           # 0.0.0.0
    port=settings["port"],           # 8011
    streamable_http_path=settings["path"],  # /
)
```

FastMCP 封装了 MCP 协议的 initialize 握手、JSON-RPC 消息路由、Streamable HTTP 传输等全部底层细节。你只需要指定名字、绑定地址、传输路径，然后往上面挂 Tools 和 Resources。

#### 第二步：挂载 Tools 和 Resources

这个 Server 暴露了 **2 个 Tools** 和 **5 个 Resources**。

**Tools**——给 AI 模型调用的函数：

```python
@mcp.tool(name="get_today_news_brief")
def get_today_news_brief(max_sections: int = 5, max_articles_per_section: int = 5) -> str:
    """返回最新一期 AIOS 日报的 Markdown 摘要，Agent 可直接阅读。"""
    return build_latest_news_markdown(max_sections, max_articles_per_section)

@mcp.tool(name="get_today_news_payload", structured_output=True)
def get_today_news_payload(
    max_sections: int = 5,
    max_articles_per_section: int = 5,
    include_content: bool = True,
    include_sources: bool = False,
) -> dict:
    """返回最新一期 AIOS 日报的结构化 JSON，包含概览、高亮、栏目、文章摘要。"""
    return build_latest_news_payload(...)
```

注意 `get_today_news_payload` 的 `structured_output=True`——这就是 MCP 2025-06-18 规范新增的特性：**Tool 可以返回结构化的 JSON 对象而不仅仅是纯文本**。调用这个 Tool 的 Agent 可以直接拿到 `dict`，不需要自己解析 Markdown。

**Resources**——Agent 可以按 URI 直接读取的数据：

```python
@mcp.resource("news://latest/summary", name="latest-news-summary",
              description="Markdown summary of the latest AIOS daily news report.")
def latest_news_summary_resource() -> str:
    return build_latest_news_markdown()

@mcp.resource("news://latest/report-json", ...)    # 完整 JSON
@mcp.resource("news://latest/report-html", ...)    # 完整 HTML
@mcp.resource("news://latest/report-text", ...)    # 纯文本
@mcp.resource("news://latest/snapshot", ...)       # 运行快照元数据
```

Resources 是 MCP 的"上下文注入"机制。Agent 在对话开始前可以通过 `resources/read` 拉取 `news://latest/summary`，把最新新闻注入上下文，在后续对话中作为背景信息使用。**Resources 不需要 Agent 主动调用工具函数**——它在对话开始时就静默注入，语义上更接近"读文件"而非"调函数"。

#### 第三步：选择传输并启动

这个 Server 用的是 **Streamable HTTP**（即前面 1.5.3 介绍的推荐远程方案）：

```python
# 来自 mcp_support.py 的默认配置
DEFAULT_NEWS_MCP_TRANSPORT = "streamable-http"
DEFAULT_NEWS_MCP_HOST = "0.0.0.0"
DEFAULT_NEWS_MCP_PORT = 8011

# 来自 mcp_server.py 的启动入口
def main() -> None:
    mcp.run(settings["transport"])  # → "streamable-http"
```

为什么选 Streamable HTTP 而不是 stdio？因为 stdio 是本地子进程通信——只有这台机器上的 Claude Code 能用。Streamable HTTP 把 Server 绑在 `0.0.0.0:8011`，同一内网的任何机器都能访问。

#### 第四步：挂在系统服务里长跑

MCP Server 不能只在终端里手动跑——机器重启它就挂了。所以用 **systemd** 把它注册为系统服务：

```ini
# deploy/systemd/aios-news-mcp.service
[Unit]
Description=AIOS Daily News MCP Service
After=network-online.target aios-news-ecosystem.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/owen/AIOS-NP
ExecStart=/bin/bash /home/ubuntu/owen/AIOS-NP/scripts/start_news_mcp.sh
Restart=always          # 挂了自动重启
RestartSec=5            # 5 秒冷却
TimeoutStartSec=120     # 启动最多等 2 分钟
```

`Restart=always` 是关键——哪怕进程崩溃、机器重启，systemd 都会把它拉起来。安装只需一行：

```bash
sudo cp deploy/systemd/aios-news-mcp.service /etc/systemd/system/
sudo systemctl enable --now aios-news-mcp
```

#### 第五步：开放公网访问

服务绑在 `0.0.0.0:8011`，本机和内网已经能访问了。这台服务器的公网 IP 是 `158.101.198.212`，所以在防火墙上放行 8011 端口后，外部 Agent 直接就能通过 `http://158.101.198.212:8011/` 连上。当前没有加反向代理和 TLS，生产化的话可以挂一个 Caddy 在前面自动处理 HTTPS。

#### 验证：实际调用一次

服务到底通不通？直接 curl 测一下完整的 Streamable HTTP 流程：

```bash
# 第一步：initialize 握手
$ curl -s -X POST http://127.0.0.1:8011/ \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":"1","method":"initialize",
       "params":{"protocolVersion":"2025-06-18","capabilities":{},
                 "clientInfo":{"name":"test","version":"1.0"}}}'

# 响应（event: message 后跟 data）：
# {"jsonrpc":"2.0","id":"1","result":{"protocolVersion":"2025-06-18",
#  "serverInfo":{"name":"AIOS Daily News MCP","version":"1.27.0"},
#  "instructions":"Expose the latest AIOS daily news report..."}}
# 响应头中返回: mcp-session-id: 3b8f731c3f3e41449007ad52f92e7867
```

握手成功，拿到了 `mcp-session-id`。第二步用这个 session 调 tool：

```bash
# 第二步：调用 get_today_news_brief
$ curl -s -X POST http://127.0.0.1:8011/ \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: 3b8f731c3f3e41449007ad52f92e7867" \
  -d '{"jsonrpc":"2.0","id":"4","method":"tools/call",
       "params":{"name":"get_today_news_brief",
                 "arguments":{"max_sections":2,"max_articles_per_section":2}}}'
```

返回了完整的当日新闻摘要——中俄贸易数据、芯片安全漏洞警示、新能源车"锁电"监管、五一消费观察……每个栏目下的文章有标题、摘要、信源数，结构清晰。

任何人只需在他的 MCP Client 配置里加上：

```json
{
  "mcpServers": {
    "aios-daily-news": {
      "type": "http",
      "url": "http://158.101.198.212:8011/"
    }
  }
}
```

就能在 Claude Code、Claude Desktop 或任何 MCP-Compatible Agent 中直接使用这两个工具。

#### 架构一览

这台服务器上实际运行着 **3 个 systemd 服务**，形成一条完整的自动化流水线：

```
┌──────────────────────────┐
│  aios-kernel.service     │  ← AIOS 内核（LLM 调度、Agent 工厂）
└────────────┬─────────────┘
             │ 提供计算能力
┌────────────▼─────────────┐
│  aios-news-ecosystem     │  ← 新闻流水线（每天 8:30 cron 触发）
│  .service                │     hot_api→sort→search→generate→review→report
│  监听 0.0.0.0:8010       │
└────────────┬─────────────┘
             │ 产出报告到 output/ 目录
┌────────────▼─────────────┐
│  aios-news-mcp.service   │  ← MCP 服务（本节的焦点）
│  FastMCP, Streamable HTTP │     读取 output/ 下的最新 JSON/HTML/MD/TXT
│  监听 0.0.0.0:8011       │     暴露 2 tools + 5 resources
│  Server: 1.27.0          │
│  Protocol: 2025-06-18    │
└────────────┬─────────────┘
             │ 公网 IP: 158.101.198.212:8011
             │ Streamable HTTP (无反向代理，直连)
┌────────────▼─────────────┐
│  外部 MCP Client          │
│  (Claude Code / Desktop) │
└──────────────────────────┘
```

`aios-news-mcp.service` 的 systemd 配置里写了 `After=aios-news-ecosystem.service` 和 `Restart=always`——确保新闻流水线先启动完毕、MCP 服务再上台，挂了 5 秒内自动拉起来。

这个实例从"写 100 行 Python"到"公网可访问的 MCP 服务"，完整展示了 MCP 的 **生产者视角**：用 FastMCP 声明 tools 和 resources，选 Streamable HTTP 传输，systemd 守护，防火墙放行端口，剩下的协议握手、JSON-RPC 路由、session 管理全部由 SDK 兜底。

---

## 二、A2A：Agent 之间的"外交协议"

### 2.1 另一个维度：Agent 如何与 Agent 通信

如果你的系统里有多个 Agent——一个负责搜资料，一个负责写报告，一个负责发邮件——它们之间怎么通信？MCP 解决不了这个问题，因为 MCP 是单向的"Agent 调工具"，而 Agent 之间需要**对等协商**——你分配任务给我，我可能接受也可能拒绝，做了一半可能问你"这个参数我不确定，你能澄清一下吗？"

这就是 Google 在 2025 年 4 月 9 日（Google Cloud Next）推出的 **Agent-to-Agent（A2A）协议**。

A2A 于 2025 年 6 月捐赠给 Linux Foundation，采用 Apache 2.0 许可证。**2026 年 3 月 12 日发布 v1.0 生产版本**，截至 2026 年 4 月已有 150+ 组织支持。

### 2.2 设计原则

| 原则 | 含义 |
|------|------|
| **Interoperability** | 跨框架、跨厂商——Google 的 Agent 可以调用微软的 Agent |
| **Agent-as-Agent** | 远程 Agent 是**自主的对等方**，不是被动工具——它可以拒绝任务 |
| **Standards-based** | 基于 HTTP、JSON-RPC 2.0、SSE、Protocol Buffers——不发明新传输层 |
| **Default-secure** | 企业级认证：OAuth 2.0 / API Key / OpenID Connect / mTLS |
| **Async-first** | 原生支持小时/天级长任务，通过流式推送和 Webhook 回调 |
| **Multi-modal** | 文本、JSON、文件、图片、音频、视频 |

最关键的差异是 **Agent-as-Agent** 这一条：在 MCP 中，Server 是被动的工具提供者；在 A2A 中，Agent 是**有自主权的对等实体**，可以评估任务、拒绝任务、中途打断请求澄清。

### 2.3 三层架构

A2A v1.0 采用严格的三层架构：

```
┌──────────────────────────────────────┐
│  Layer 3: Protocol Bindings          │
│  JSON-RPC 2.0 / gRPC / HTTP+JSON     │  ← 三种等效的传输绑定
├──────────────────────────────────────┤
│  Layer 2: Abstract Operations        │
│  SendMessage / GetTask / CancelTask  │  ← 11 个核心操作（传输无关）
├──────────────────────────────────────┤
│  Layer 1: Canonical Data Model       │
│  a2a.proto (Protocol Buffers)        │  ← 单一规范数据源
└──────────────────────────────────────┘
```

**Layer 1 — 规范数据模型**：`a2a.proto` 是唯一的真相源文件，定义了 `Task`、`Message`、`Part`、`Artifact`、`AgentCard` 等所有核心数据结构。Protocol Buffers 保证了跨语言的类型安全。

**Layer 2 — 抽象操作**：11 个核心操作与传输层无关——

| 操作 | 用途 |
|------|------|
| `SendMessage` / `SendStreamingMessage` | 创建或继续一个 Task |
| `GetTask` / `ListTasks` | 查询 Task 状态 / 列出 Task |
| `CancelTask` | 取消执行中的 Task |
| `SubscribeToTask` | 订阅 Task 的流式更新 |
| `CreateTaskPushNotificationConfig` 等 | 管理 Webhook 回调配置 |

**Layer 3 — 协议绑定**：三种等效绑定，选哪个取决于你的技术栈和性能需求——

| 绑定 | 传输 | 流式方式 | 适合场景 |
|------|------|---------|--------|
| JSON-RPC 2.0 | HTTP POST + SSE | `text/event-stream` | 简单、广泛兼容 |
| gRPC | HTTP/2 + Protobuf | Server Streaming RPC | 高性能、强类型 |
| HTTP+JSON/REST | REST 端点 | SSE | 现有 REST 基础设施 |

### 2.4 Agent Card：Agent 的"名片"

每个 A2A Agent 在 `https://{domain}/.well-known/agent-card.json` 发布一张"名片"，这是服务发现的核心机制：

```json
{
  "name": "research-agent",
  "description": "搜索学术论文并进行文献综述",
  "version": "1.0.0",
  "url": "https://research-agent.example.com/agent",
  "supportedInterfaces": [
    {
      "url": "https://research-agent.example.com/agent/jsonrpc",
      "protocolBinding": "JSONRPC",
      "version": "1.0"
    }
  ],
  "capabilities": {
    "streaming": true,
    "pushNotifications": true,
    "extensions": []
  },
  "skills": [
    {
      "id": "paper_search",
      "name": "论文搜索",
      "description": "在 arXiv、Semantic Scholar 中搜索指定主题的论文",
      "tags": ["research", "search", "academic"],
      "examples": [
        "帮我找 2025 年关于 LLM agent 的最新论文",
        "搜索 GraphRAG 的相关研究"
      ]
    },
    {
      "id": "literature_review",
      "name": "文献综述",
      "description": "对给定论文列表进行系统性综述",
      "tags": ["research", "writing"],
      "examples": ["帮我写一份这些论文的文献综述"]
    }
  ],
  "securitySchemes": {
    "apiKey": { "in": "header", "name": "X-API-Key" }
  },
  "defaultInputModes": ["text/plain", "application/json"],
  "defaultOutputModes": ["text/markdown", "application/json"]
}
```

关键字段解读：
- **skills[]**：Agent 暴露的不是单个函数，而是"技能"——每个 skill 有 id、描述、标签、示例问法。编排器（Orchestrator）可以用 LLM 根据 skill 描述做路由决策
- **capabilities**：声明是否支持流式、推送通知、扩展
- **securitySchemes**：支持 API Key、HTTP Bearer、OAuth 2.0、OpenID Connect、mTLS
- **defaultInputModes / defaultOutputModes**：声明 MIME 类型，支持文本、JSON、图片、音频、视频

### 2.5 Task 生命周期：9 状态状态机

A2A 把每个交互建模为一个 **Task**，具有明确的状态流转：

```
                     ┌──────────┐
                     │ SUBMITTED │
                     └────┬─────┘
                          │
              ┌───────────┼───────────┐
              ↓           ↓           ↓
        ┌─────────┐ ┌─────────┐ ┌──────────┐
        │ WORKING │ │REJECTED │ │ CANCELED  │ ← 拒绝/取消直接到终态
        └────┬────┘ └─────────┘ └──────────┘
             │
    ┌────────┼────────┬─────────┐
    ↓        ↓        ↓         ↓
┌───────┐ ┌──────┐ ┌──────┐ ┌──────────────┐
│COMPLET│ │FAILED│ │CANCEL│ │INPUT_REQUIRED│ ← 中断状态：Agent 需要你澄清
└───────┘ └──────┘ └──────┘ ├──────────────┤
 终态      终态      终态    │AUTH_REQUIRED │ ← 中断状态：需要升级权限
                            └──────────────┘
```

- **终态**（COMPLETED / FAILED / CANCELED / REJECTED）：不可逆转
- **中断态**（INPUT_REQUIRED / AUTH_REQUIRED）：暂停任务，等待客户端动作——这实现了**多轮协作**
- Agent 可以主动 **REJECTED**（拒绝任务）——这是 "Agent-as-Agent" 设计原则的直接体现

### 2.6 通信与流式

**同步调用**（适合简单查询）：

```json
// POST → /agent/jsonrpc
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tasks/sendMessage",
  "params": {
    "message": {
      "role": "user",
      "taskId": null,
      "parts": [{ "text": "帮我找 5 篇关于 MCP 协议的论文" }]
    }
  }
}
```

**流式调用**（适合生成式 AI 输出——SSE）：

```
event: task
data: {"taskId":"task-123","status":{"state":"submitted"}}

event: taskStatusUpdate
data: {"taskId":"task-123","status":{"state":"working"}}

event: taskArtifactUpdate
data: {"taskId":"task-123","artifact":{"parts":[{"text":"找到了 5 篇..."}],"append":true}}

event: taskArtifactUpdate
data: {"taskId":"task-123","artifact":{"parts":[{"text":"..."}],"append":true,"lastChunk":true}}

event: taskStatusUpdate
data: {"taskId":"task-123","status":{"state":"completed"}}
```

**异步推送**（适合小时级长任务）：通过 Webhook 回调通知客户端结果。

### 2.7 生态现状

A2A 的生态在 2026 年已经相当完整：

- **云平台**：Google Vertex AI、Microsoft Azure AI Foundry、AWS Bedrock AgentCore
- **企业 SaaS**：Salesforce Agentforce、SAP Joule、ServiceNow、Workday、Box、Zoom
- **开发框架**：LangChain、CrewAI、LlamaIndex、Google ADK、Microsoft Semantic Kernel、Spring AI
- **SDK**：Python、JavaScript/TypeScript、Java、Go、.NET

**但 Anthropic 和 OpenAI 不是首发合作伙伴**——这是理解 MCP vs A2A 关系的线索。Anthropic 押注 MCP（纵向），Google 押注 A2A（横向），而行业最终需要两者。

---

## 三、MCP vs A2A：互补而非竞争

把两个协议放在一起，差异一目了然：

| 维度 | MCP | A2A |
|------|-----|-----|
| **连接** | Agent ↔ Tool / Data Source | Agent ↔ Agent |
| **方向** | 纵向（Agent 向下调工具） | 横向（Agent 平等通信） |
| **发现** | tools/list → 返回函数列表 | Agent Card → 返回技能名片 |
| **粒度** | 函数级（每个 tool 有 inputSchema） | 服务级（每个 skill 有描述和示例） |
| **状态** | 大多无状态（单次调用） | 有状态（Task 生命周期） |
| **交互** | 请求-响应 | 多轮、可中断、可协商 |
| **自主权** | Server 被动响应 | Agent 可拒绝任务 |
| **认证** | OAuth 2.0（2025-06 加入） | OAuth 2.0 / API Key / mTLS（原生内置） |

**实践中两者是配合关系**：

```
┌──────────────────┐      A2A       ┌──────────────────┐
│  Orchestrator    │ ←-----------→  │  Specialist      │
│  Agent           │   横向委托      │  Agent            │
└──────────────────┘                └────────┬─────────┘
                                              │ MCP（纵向调工具）
                                    ┌─────────┼─────────┐
                                    ↓         ↓         ↓
                                  [数据库]  [API]    [文件系统]
```

编排 Agent 用 A2A 把子任务分发给专业 Agent；专业 Agent 用 MCP 调用具体的工具和数据源。一个管"谁来做"，一个管"怎么做"。

---

## 四、MCP vs SKILL：效率之争

### 4.1 争议的起点

到了 2026 年初，情况开始变得微妙。MCP 虽然生态迅速扩张，工程师们在实际使用中发现了几个痛点：

**1. Token 消耗巨大**

GitHub MCP Server 在初始化后，直接把 **55,000 token** 的工具定义塞进了上下文——还没开始干活，就已经烧掉了一笔可观的费用。按 Claude Sonnet 4 定价换算，**每月一万次调用仅工具定义就要消耗约 $55**。

**2. 可靠性堪忧**

ScaleKit 的基准测试显示 MCP 的超时失败率约 **28%**（可靠性仅 72%）。常见问题包括：MCP Server 没正常启动导致重启、多工具逐个认证卡住、权限模型过于粗粒度（非黑即白）。

**3. 调试地狱**

出问题时，你需要去翻 JSON-RPC 的日志，而不是像 CLI 命令那样直接复现。

### 4.2 SKILL 的哲学：少即是多

**SKILL** 是 Anthropic 在 2025 年 10 月推出的另一种范式，2025 年 12 月开源为跨平台标准（agentskills.io）。

一个 SKILL 的本质：**一个 Markdown 文件，带 YAML 头部，约 30 token 待命，触发时才加载完整指令**。

```markdown
---
name: code-review
description: 审查代码中的安全问题和最佳实践。当用户请求代码审查时使用。
---

# Code Review Skill

## 检查清单

1. 安全漏洞（SQL 注入、XSS、路径遍历）
2. 性能问题和代码异味
3. 代码风格一致性
4. 提供具体的改进建议和代码示例

## 输出格式

- **严重程度**：严重 / 高 / 中 / 低
- **位置**：filename:line
- **问题**：描述
- **修复方案**：建议代码
```

**SKILL 和 MCP 的核心差异**：

| 维度 | SKILL | MCP |
|------|-------|-----|
| **本质** | Markdown 文件 + YAML 元数据 | JSON-RPC Server + Transport |
| **注入内容** | 无（不注入工具定义） | 注入完整的 tool schema |
| **待机 token** | ~30 token | 可能数万 token |
| **触发方式** | 模型匹配描述 → 读取完整 Skill | 服务启动 → 全部注入 |
| **工具来源** | Agent 已有的工具（bash、Read 等） | MCP Server 暴露的新工具 |
| **上手成本** | 写个 Markdown | 构建/维护 Server |
| **适合场景** | 可重复的工作流、团队规范 | 实时数据、外部 API |

**Flask 作者 Armin Ronacher** 全面从 MCP 转向 SKILL，理由是："Skills don't inject any tool definitions into context. The tools remain what they always were: bash and what the agent already has."（Skill 不往上下文注入任何工具定义——工具始终是 Agent 已有的 bash 和标准工具。）

**Simon Willison** 的评价更直接："Skills are Markdown with a tiny bit of YAML metadata... They feel a lot closer to the spirit of LLMs — throw in some text and let the model figure it out. Maybe a bigger deal than MCP."

### 4.3 CLI：第三个选项

在 MCP vs SKILL 之外，还有一个更激进的立场：**只给 bash，什么都不装。**

Andrej Karpathy 称 CLI "super exciting precisely because they are legacy"——正因为 CLI 是几十年的老技术，LLM 的训练数据里有海量的 Unix 文档和 Shell 脚本，模型天然就会用。

**Arize 在 2026 年 5 月用 Claude Opus 4 跑了 500 次 GitHub 任务评测**，结果出人意料：

| 方案 | 正确率 | 成本（相对 CLI） | 延迟（相对 CLI） |
|------|--------|-----------------|-----------------|
| MCP | 0.834 | 6x | 5x |
| LobeHub SKILL | 0.826 | 低 | 低 |
| Vault SKILL | 0.833 | 最低 | 最低 |
| **裸 Claude（无 SKILL）** | **0.845** | — | — |

**裸 CLI 的正确率反而是最高的**——因为 `gh`（GitHub CLI）太出名了，Claude 的训/练数据里已经有了。你不需要告诉它 GitHub 有哪些子命令，它自己知道 `gh issue list`、`gh pr create`。

**但这有一个关键前提**：模型见过那个 CLI。如果你公司的内部 CLI 只有 3 个人用过，你仍然需要 SKILL 或 MCP 来教模型怎么用。

### 4.4 选型：不是"谁干掉谁"，是"谁适合什么"

| 场景 | 推荐方案 | 理由 |
|------|---------|------|
| 个人开发者，自动化日常工作 | CLI + SKILL | 最简单、最便宜、最可靠 |
| 远程服务、需要 OAuth、多租户 | MCP | 标准化的认证和远程连接 |
| 企业内编码组织知识、工作流 | SKILL | Markdown 即文档，零运维 |
| 既需要外部系统又需要按组织规范 | MCP + SKILL 组合 | 各取所长 |
| Agent 面向非技术消费者 | MCP | OAuth 体验好，不需要装 CLI |

**"MCP is dead"是情绪化标题**。准确的说法是：MCP 从"万能协议"的神坛跌落回它该在的位置——作为远程服务标准化的基建层。而日常开发效率的皇冠属于 CLI + SKILL。

### 4.5 Claude Code 自身的选择

有趣的是，**Anthropic 自家的 Claude Code 核心架构也更接近 CLI + SKILL 而非纯 MCP**。

看源码就知道：Claude Code 的工具池里，MCP 工具被标记 `isMcp: true` 作为一类特殊工具，而 bash、Read、Write、Edit、Glob、Grep 这些才是主角。SKILL 是通过 `SKILL_TOOL_NAME` 定义的标准工具，加载的是 Markdown 文件。MCP 工具虽然在工具池中占有一席之地，但它的设计让 MCP Server 的连接是**可选的**、**动态的**——配置中的 `mcpServers` 可以为空，Server 可以有 `disabled` 状态。

这种架构选择本身就在说：**MCP 是扩展机制，不是核心范式**。

---

## 五、总结

回到标题——MCP 和 A2A，一个是 Agent 的纵向沟通（调工具、读数据），一个是 Agent 的横向沟通（分配任务、协商协作）。它们在设计思路上互补，在实践中可以叠加。

而 MCP 与 SKILL/CLI 的所谓"之争"，本质上是在不同场景下的效率选择：

- **MCP** 的价值在**标准化**——当你需要接入 50 个外部平台时，不用每家用一套不同的认证和通信方式
- **SKILL** 的价值在**轻量**——用 Markdown 教模型"怎么做"，不注入任何工具定义，token 成本极低
- **CLI** 的价值在**原生**——模型已经会的，就不要重新教一遍

争论管道的材质不如关心水龙头能不能出水——决定 Agent 能力边界的不是协议选择，而是平台愿不愿意开放数据和接口。

> **"MCP connects agents to tools. A2A connects agents to agents. SKILL teaches agents what to do. CLI just lets them do it."**

---

*本文 MCP 源码分析基于 Claude Code 源码（`/home/ubuntu/owen/claude-code/src/services/mcp/`）；A2A 协议细节参考 [google/A2A](https://github.com/google/A2A) 规范（v1.0，2026-03-12）及 Linux Foundation 官方文档；评测数据来自 [Arize 2026 年评测报告](https://arize.com/blog/mcp-vs-cli-skills-for-agents-what-our-eval-found-and-which-you-should-use/)。*
