---
title: claude-code的源码拆解学习
published: 2026-04-03
description: 2026 年 3 月底，Claude Code 在一次 npm 发布中因打包配置错误，将一个 约 57MB 的 cli.js.map 文件意外公开，包含 1906 个 TypeScript/TSX 核心文件、总计 51.2 万行源码。这些内容涉及 Agent 循环引擎、工具系统、记忆与上下文压缩、安全机制等核心实现，以及部分未发布功能（如 AI 宠物、反蒸馏、多 Agent 协作等）。
tags: [harness,claude-code,agent]
category: blog
draft: false
pinned: true
priority: 1
comment: false
---

# 一、总介绍

Claude Code 的意外泄露，给了广大 AI 学习者一个非常好的借鉴蓝本。这里，我们按照项目 **learn-claude-code**（shareAI Lab, MIT 协议）的顺序，一步一步看怎么从简单到复杂，搭建一个 Claude Code 风格的 Agent。

这个项目的核心论点是：

> **智能来自模型（model），但让智能变成现实的是 harness（线束/运行环境）。**

模型能推理能编码，但它只能产出文本——碰不到文件系统、不能跑命令、不能读报错。**harness 负责把模型产出的文本变成真实世界的动作**，再把结果喂回去。二者配合，才是完整的 AI Agent。

项目把 Claude Code 拆成 12 个递进 session（s01 到 s12），每个 session 都是一个独立可运行的 Python 脚本，代码量从 ~4KB 增长到 ~36KB。

# 二、s01–s12

## 1. s01：最小 Agent 循环——"一个循环 + 一个 Bash，就是一个 Agent"

s01 是整个项目的起点。它演示了一个事实：**不到 30 行核心代码，就能跑起一个可以操作你文件的 AI Agent。**

### (1) 依赖与环境

```python
from anthropic import Anthropic
from dotenv import load_dotenv

load_dotenv(override=True)

if os.getenv("ANTHROPIC_BASE_URL"):
    os.environ.pop("ANTHROPIC_AUTH_TOKEN", None)

client = Anthropic(base_url=os.getenv("ANTHROPIC_BASE_URL"))
MODEL = os.environ["MODEL_ID"]
```

只需要 3 个第三方包：`anthropic`（调用 Claude API）、`python-dotenv`（加载 `.env` 里的 API key）、`pyyaml`（后续 session 用到）。

注意第 47 行的 `os.environ.pop("ANTHROPIC_AUTH_TOKEN", None)`：当设置了 `ANTHROPIC_BASE_URL`（使用第三方兼容 API）时，删除从环境继承的 auth token，避免认证冲突。

### (2) 系统提示词——赋予模型"身份"

```python
SYSTEM = f"You are a coding agent at {os.getcwd()}. Use bash to solve tasks. Act, don't explain."
```

这行是整个 harness 的入口。`os.getcwd()` 被**直接拼进字符串**——模型收到的不是函数调用，而是当前目录的真实路径（如 `/home/ubuntu/owen`）。模型不知道自己在哪台机器上，它只知道 prompt 里写了这个路径，然后基于此"推理"应该执行什么命令。

**权限从哪来？** 权限来自你运行 `python agents/s01_agent_loop.py` 时你自己的 shell。Python 进程继承了你的所有权限——能读写的文件、能执行的命令，和你在终端敲命令是一样的。

### (3) 工具定义——模型唯一能"调用"的东西

```python
TOOLS = [{
    "name": "bash",
    "description": "Run a shell command.",
    "input_schema": {
        "type": "object",
        "properties": {"command": {"type": "string"}},
        "required": ["command"],
    },
}]
```

工具定义不是 Python 函数，只是一段 **JSON Schema 描述**。发给模型后，模型会输出类似这样的 JSON：

```json
{
  "type": "tool_use",
  "name": "bash",
  "id": "toolu_01xxx",
  "input": {"command": "ls"}
}
```

**模型只负责"说要做什么"。真正执行的是 harness。** 模型产生意图，harness 赋予能力。

这里需要补充一下 claude 请求格式与  oepnai 的不同。先看一下相同点吧，底层通信都是基于 HTTP 的RESTful API；数据交换格式都是 JSON；都抽象了基于 role（角色）和 content（内容）的对话历史数组模式（而不是文本补全）；都支持SSE协议来最大程度降低TTFB；原生支持函数调用（Function Calling / Tool Use）和多模态（视觉）输入。

关键区别就在一下几个点：
- System Prompt（系统提示词）的位置：O将system放在对话的第一个位置作为一个特殊角色，而A将system剥离数组，当成了一个顶级参数，与model、message同级。
- A

### (4) 工具执行——`run_bash`

```python
def run_bash(command: str) -> str:
    dangerous = ["rm -rf /", "sudo", "shutdown", "reboot", "> /dev/"]
    if any(d in command for d in dangerous):
        return "Error: Dangerous command blocked"
    try:
        r = subprocess.run(
            command, shell=True, cwd=os.getcwd(),
            capture_output=True, text=True, timeout=120
        )
        out = (r.stdout + r.stderr).strip()
        return out[:50000] if out else "(no output)"
    except subprocess.TimeoutExpired:
        return "Error: Timeout (120s)"
    except (FileNotFoundError, OSError) as e:
        return f"Error: {e}"
```

关键点：

- **`subprocess.run(command, shell=True, cwd=os.getcwd())`** — 模型输出的字符串被直接交给 shell 执行。这就是为什么 AI 可以操作文件：本质上和你自己在终端敲命令一样。
- **危险命令拦截** — 硬编码了 5 条关键词，在命令到达 `subprocess` 之前做简单过滤。这非常粗糙（比如 `rm -rf ~/*` 就绕过去了），真实的 Claude Code 有完整的权限系统和 hooks 机制。
- **输出截断** — `out[:50000]` 防止大量输出撑爆 token 预算（后面 s06 会专门处理上下文压缩）。
- **超时保护** — `timeout=120`，防止命令卡死。

### (5) 核心循环——整个 s01 的灵魂

```python
def agent_loop(messages: list):
    while True:
        # 1. 将消息和工具定义一起发给 LLM
        response = client.messages.create(
            model=MODEL, system=SYSTEM, messages=messages,
            tools=TOOLS, max_tokens=8000,
        )

        # 2. 追加 assistant 消息
        messages.append({"role": "assistant", "content": response.content})

        # 3. 如果模型没有调用工具，结束循环
        if response.stop_reason != "tool_use":
            return

        # 4. 执行每个工具调用，收集结果
        results = []
        for block in response.content:
            if block.type == "tool_use":
                print(f"\033[33m$ {block.input['command']}\033[0m")
                output = run_bash(block.input["command"])
                print(output[:200])
                results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": output,
                })

        # 5. 把工具结果作为 user 消息追加，回到步骤 1
        messages.append({"role": "user", "content": results})
```

流程图：

```
+--------+      +-------+      +---------+
|  User  | ---> |  LLM  | ---> |  Tool   |
| prompt |      |       |      | execute |
+--------+      +---+---+      +----+----+
                    ^                |
                    |   tool_result  |
                    +----------------+
                    (loop until stop_reason != "tool_use")
```

**循环不变式**：模型只要还在返回 `stop_reason == "tool_use"`，就把工具结果塞回 `messages` 再问一次；一旦返回 `stop_reason == "end_turn"`，循环终止。

一个设计细节：工具执行结果用 `role: "user"` 而不是 `role: "tool"` 返回。这是 Anthropic 消息协议的约定——工具结果被追加为 user role 的消息（因为它是"外部输入"，不是模型自己生成的）。

### (6) 交互循环——REPL 外壳

```python
if __name__ == "__main__":
    history = []
    while True:
        try:
            query = input("\033[36ms01 >> \033[0m")
        except (EOFError, KeyboardInterrupt):
            break
        if query.strip().lower() in ("q", "exit", ""):
            break
        history.append({"role": "user", "content": query})
        agent_loop(history)
        # 打印最终响应
        response_content = history[-1]["content"]
        if isinstance(response_content, list):
            for block in response_content:
                if hasattr(block, "text"):
                    print(block.text)
```

外层是一个简单的 `while True` REPL（Read-Eval-Print Loop）。`history` 在所有轮次中持续增长——上一次问题和模型的回答（含所有工具调用）都在里面，所以模型能"记住"上下文。

### (7) macOS UTF-8 输入补丁

```python
try:
    import readline
    # #143 UTF-8 backspace fix for macOS libedit
    readline.parse_and_bind('set bind-tty-special-chars off')
    readline.parse_and_bind('set input-meta on')
    readline.parse_and_bind('set output-meta on')
    readline.parse_and_bind('set convert-meta off')
    readline.parse_and_bind('set enable-meta-keybindings on')
except ImportError:
    pass
```

macOS 默认用 `libedit`（而非 GNU readline），处理中文、日文等多字节字符时退格键可能只删半个字符导致乱码。这 6 行配置切换 libedit 的字符处理模式，让 UTF-8 输入正常。`#143` 引用对应的 GitHub issue/PR 编号。Linux 上 Python 自带 GNU readline，这段代码无害但不起作用。

### (8) 运行

```
cd learn-claude-code
python agents/s01_agent_loop.py
```

内置的测试 prompt：

- `Create a file called hello.py that prints "Hello, World!"`
- `List all Python files in this directory`
- `What is the current git branch?`
- `Create a directory called test_output and write 3 files in it`

---

## 关键洞察

s01 暴露了 AI Agent 的本质结构：

```
模型 = 产生意图（"我想执行 ls"）
harness = 赋予能力（Python 调用 subprocess.run）
权限 = 在 harness 层控制（危险命令拦截、用户确认）
```

模型完全不知道自己在哪台机器上，它只是收到了一段带有当前目录路径的 system prompt，然后基于这段文本进行"推理"。**它说的所有话都是文本——是 harness 把文本变成了真实世界的动作。**

这就是整个项目的核心论点：智能来自模型，但让智能变成现实的是 harness。后面 11 个章节都在这个循环上叠加机制（任务规划、子 Agent、技能系统、上下文压缩、后台任务、团队协作……），但 `while True` 这层循环本身始终不变。
