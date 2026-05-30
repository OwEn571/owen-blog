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

这里需要补充一下 claude 请求格式与  oepnai 的不同。先看一下相同点吧，底层通信都是基于 HTTP 的RESTful API；数据交换格式都是 JSON；都抽象了基于 role（角色）和 content（内容）的对话历史数组模式（而不是文本补全）；都支持SSE协议来最大程度降低TTFB；原生支持函数调用（Function Calling / Tool Use）和多模态（视觉）输入。

关键区别就在一下几个点：
- O将system放在对话的第一个位置作为一个特殊角色，而C将system剥离数组，当成了一个顶级参数，与model、message同级。
- C严格遵循user和assistant交替出现的规则，O则相对宽容允许连续出现。
- 比较重要的一点，O在有工具调用的时候在 assistant 消息中返回 tool_calls 数组，提交工具执行结果时，需要新增一条角色为 tool 的消息，并通过 tool_call_id 与之前的调用关联；C调用工具时，内容（content）会变成一个数组，其中包含类型为 tool_use 的对象，提交工具结果时，需要新增一条角色为 user（注意是 user，而不是单独的 tool 角色）的消息，其内容为类型为 tool_result 的对象，并附带 tool_use_id。
- 鉴权模式，O是Bearer Token，C是自定义的，强制要求声明 API 版本。

来看一下标准带工具调用情况下两者的JSON差距，前面为O后面为C。首先是工具声明，前者嵌套更深严格区分function，后者结构更扁平，参数叫 input_schema：

```json
"tools": [
  {
    "type": "function",
    "function": {
      "name": "get_weather",
      "description": "获取指定城市的天气",
      "parameters": {
        "type": "object",
        "properties": {
          "location": { "type": "string" }
        }
      }
    }
  }
]
```

```json
"tools": [
  {
    "name": "get_weather",
    "description": "获取指定城市的天气",
    "input_schema": {
      "type": "object",
      "properties": {
        "location": { "type": "string" }
      }
    }
  }
]
```

然后是模型决定工具，这里有巨大差异，OpenAI 传回的是字符串格式的 JSON，需要你自己 json.loads()；而 Claude 直接传回了解析好的 JSON 对象：

```json
{
  "role": "assistant",
  "content": null,
  "tool_calls": [
    {
      "id": "call_abc123",
      "type": "function",
      "function": {
        "name": "get_weather",
        "arguments": "{\"location\": \"Wuhan\"}" 
      }
    }
  ]
}
```

```json
{
  "role": "assistant",
  "content": [
    {
      "type": "text",
      "text": "好的，我来帮你查一下。"
    },
    {
      "type": "tool_use",
      "id": "toolu_xyz789",
      "name": "get_weather",
      "input": {
        "location": "Wuhan"
      }
    }
  ]
}
```

最终将工具执行结果返回模型的时候，前者必须新增一个专属的 role: "tool"，后者则是必须作为 role: "user" 消息发送，并在 content 数组里标记 tool_result（这也是两者要互相转化最麻烦的一点）：

```python
{
  "role": "tool",
  "tool_call_id": "call_abc123",
  "content": "{\"temperature\": 25, \"condition\": \"Sunny\"}"
}
```

```python
{
  "role": "user",
  "content": [
    {
      "type": "tool_result",
      "tool_use_id": "toolu_xyz789",
      "content": "{\"temperature\": 25, \"condition\": \"Sunny\"}"
    }
  ]
}
```

如果要在底层打通两套接口，路由层需要重点处理：OpenAI 的 role: "tool" 必须被强制映射为 Claude 的 role: "user" + type: "tool_result" 结构。

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

## 2. s02：工具分发——"加工具不改循环"

s02 的核心变化就一句话：**工具从 1 个变成 4 个，循环代码一行没动。**

```
+--------+      +-------+      +------------------+
|  User  | ---> |  LLM  | ---> | Tool Dispatch    |
| prompt |      |       |      | {                |
+--------+      +---+---+      |   bash: run_bash |
                    ^           |   read: run_read |
                    |           |   write: run_wr  |
                    +-----------+   edit: run_edit |
                    tool_result | }                |
                                +------------------+
```

### (1) 路径沙箱——`safe_path`

这是 s02 最重要的新增基础设施。s01 的 bash 对文件系统没有边界，`cat ~/.ssh/id_rsa` 也能执行。s02 给文件工具加了一道门：

```python
WORKDIR = Path.cwd()

def safe_path(p: str) -> Path:
    path = (WORKDIR / p).resolve()
    if not path.is_relative_to(WORKDIR):
        raise ValueError(f"Path escapes workspace: {p}")
    return path
```

三步检查：
1. `WORKDIR / p` — 把输入路径拼到工作目录下
2. `.resolve()` — 解析掉所有 `..` 和符号链接，得到绝对路径
3. `is_relative_to(WORKDIR)` — 检查解析后的路径是否还在工作目录内

`../../etc/passwd` → resolve 后变成 `/etc/passwd` → 不在 `/home/ubuntu/owen` 下 → 抛异常。

**但这个沙箱有一个大漏洞：它只保护了 read_file / write_file / edit_file，不保护 bash。** bash 工具直接走 `subprocess.run(command, shell=True)`，模型说 `cat ~/.ssh/id_rsa.pub` 就能读，说 `cat /etc/passwd` 也行。实际测试中，模型通过 bash 读到了 `~/.ssh/` 下的公钥——`safe_path` 在这里完全被绕过了。

这是故意留的设计张力：bash 给了模型最大灵活性，但也给了最大攻击面。后面 s06（权限系统）和 s12（worktree 隔离）会逐步解决这个问题。这里先记住一个原则：**只要有不受限的 bash，任何文件级沙箱都有后门。**

### (2) 三个新工具的函数实现

**read_file** — 读文件，支持行数限制：

```python
def run_read(path: str, limit: int = None) -> str:
    text = safe_path(path).read_text()
    lines = text.splitlines()
    if limit and limit < len(lines):
        lines = lines[:limit] + [f"... ({len(lines) - limit} more lines)"]
    return "\n".join(lines)[:50000]
```

比 `cat` 好在：可控行数、不会截断半个 UTF-8 字符、告知被截掉的行数。

**write_file** — 写文件，自动创建父目录：

```python
def run_write(path: str, content: str) -> str:
    fp = safe_path(path)
    fp.parent.mkdir(parents=True, exist_ok=True)
    fp.write_text(content)
    return f"Wrote {len(content)} bytes to {path}"
```

`mkdir(parents=True, exist_ok=True)` 省去了先 `mkdir -p` 再写的两步操作。返回值直接给 LLM 看写入结果，形成闭环。

**edit_file** — 精确文本替换（这是 Claude Code 实际使用的方式，而非 sed/awk）：

```python
def run_edit(path: str, old_text: str, new_text: str) -> str:
    fp = safe_path(path)
    content = fp.read_text()
    if old_text not in content:
        return f"Error: Text not found in {path}"
    fp.write_text(content.replace(old_text, new_text, 1))
    return f"Edited {path}"
```

注意 `replace(old_text, new_text, 1)` 中的 `1`——**只替换第一次出现**。因为如果 LLM 传了一个太短的 `old_text`（比如单个变量名），全量替换会改掉不该改的地方。真正的 Claude Code 的 Edit 工具也做单次替换，且要求 `old_string` 在文件中唯一，否则报错。

### (3) 分发映射——Dispatch Map

这是 s02 的架构亮点。工具名到处理函数的映射不用 `if/elif` 链，而用字典：

```python
TOOL_HANDLERS = {
    "bash":       lambda **kw: run_bash(kw["command"]),
    "read_file":  lambda **kw: run_read(kw["path"], kw.get("limit")),
    "write_file": lambda **kw: run_write(kw["path"], kw["content"]),
    "edit_file":  lambda **kw: run_edit(kw["path"], kw["old_text"], kw["new_text"]),
}
```

每个 lambda 做了同一件事：**从模型返回的 kwargs 中提取自己需要的参数，传给具体函数**。这是一种适配器模式——模型返回的是扁平的 `{"path": "x", "content": "y"}`，而每个函数要的参数名和数量不同。lambda 完成了"模型输出 → 函数签名"的映射。

后续 session 加新工具就是在这个字典里加一行，循环完全不用动。

**一个容易忽略的点：`TOOL_HANDLERS` 和 `TOOLS` 是两个不同的东西。**

```python
TOOL_HANDLERS = {          # 执行层 — 留在 harness 本地，Python dict
    "bash":  lambda **kw: run_bash(kw["command"]),
    ...
}

TOOLS = [{...}, {...}]     # 定义层 — 发给模型，JSON Schema 数组
```

| | TOOLS | TOOL_HANDLERS |
|------|-------|---------------|
| 是什么 | JSON Schema 数组 | Python dict |
| 发到哪里 | 发给模型（API 的 `tools` 参数） | 留在本地，模型永远看不到 |
| 作用 | 告诉模型"你可以调什么" | 告诉 Python"调了之后执行哪个函数" |
| 内容的性质 | 文本描述 + 参数 schema | lambda / 函数引用 |

s01 没有这个分离——只有一个 `TOOLS`，执行是硬编码的。s02 引入 dispatch map 时就把二者拆开了，s03 只是照惯例各加了一行。这个分离是 harness 设计的核心模式：**给模型看的和本地执行的是两套东西，用名字做桥接。**

### (4) 循环中的分发调用

对比 s01 和 s02 的循环体变化：

```python
# s01 — 硬编码只调 bash
for block in response.content:
    if block.type == "tool_use":
        output = run_bash(block.input["command"])

# s02 — 字典分发，任意工具
for block in response.content:
    if block.type == "tool_use":
        handler = TOOL_HANDLERS.get(block.name)
        output = handler(**block.input) if handler else f"Unknown tool: {block.name}"
```

`TOOL_HANDLERS.get(block.name)` 一次查找替代了 s01 的硬编码。如果模型幻觉了一个不存在的工具名，返回 `"Unknown tool"` 让模型自行纠正。

### (5) 工具定义——JSON Schema 数组

```python
TOOLS = [
    {"name": "bash", "description": "Run a shell command.",
     "input_schema": {...}},
    {"name": "read_file", "description": "Read file contents.",
     "input_schema": {"type": "object",
         "properties": {"path": {"type": "string"}, "limit": {"type": "integer"}},
         "required": ["path"]}},
    {"name": "write_file", "description": "Write content to file.",
     "input_schema": {"type": "object",
         "properties": {"path": {"type": "string"}, "content": {"type": "string"}},
         "required": ["path", "content"]}},
    {"name": "edit_file", "description": "Replace exact text in file.",
     "input_schema": {"type": "object",
         "properties": {"path": {"type": "string"}, "old_text": {"type": "string"}, "new_text": {"type": "string"}},
         "required": ["path", "old_text", "new_text"]}},
]
```

每个工具都是自描述的——模型看 `description` 知道什么时候用它，看 `input_schema` 知道它需要什么参数。这个数组就是模型和真实世界的**唯一接口**。

### (6) s01 → s02 变化总结

| 组件 | s01 | s02 |
|------|-----|-----|
| 工具数量 | 1 (bash) | 4 (bash + read/write/edit) |
| 工具调用方式 | 硬编码 `run_bash()` | `TOOL_HANDLERS` 字典分发 |
| 路径安全 | 无（bash 任意路径） | `safe_path()` 沙箱 |
| Agent loop | `while True` + `stop_reason` | **完全相同** |

### (7) 运行

```
python agents/s02_tool_use.py
```

推荐测试 prompt：
- `Read the file requirements.txt`
- `Create a file called greet.py with a greet(name) function`
- `Edit greet.py to add a docstring to the function`
- `Read greet.py to verify the edit worked`

---

## 关键洞察

s02 证明了 harness 设计中最重要的一条原则：**工具系统和循环是正交的。** 循环只负责"调 API → 看 stop_reason → 执行工具 → 塞回结果"，它不关心有多少工具、每个工具做什么。加工具 = 加 handler + 加 schema，别碰循环。

另外，`safe_path` 这种**工具层沙箱**比 bash 层的字符串过滤可靠得多——在代码层面精确控制边界，而不是靠关键词匹配去猜攻击。后续 session 的安全机制都遵循这个思路：权限控制在 harness 层，不在 prompt 里。

## 3. s03：TodoWrite——"没有计划的 Agent 走哪算哪"

s03 解决一个问题：GPT/Claude 做多步任务时，做到一半就忘了自己要干什么。对话越长越严重——前面列的计划被后续工具输出淹没了，模型开始即兴发挥。

解决方案：**让模型自己写待办清单，harness 负责两件事：(1) 记录状态 (2) 忘了就催。**

### (1) TodoManager——有状态的待办管理器

这是 s03 的核心数据结构。之前的工具函数都是无状态的（读就是读、写就是写），而 `TodoManager` 是一个 **Python 对象，在会话期间保持状态**：

```python
class TodoManager:
    def __init__(self):
        self.items = []           # 内存中的 todo 列表，整个会话存活

    def update(self, items: list) -> str:
        if len(items) > 20:
            raise ValueError("Max 20 todos allowed")
        validated = []
        in_progress_count = 0
        for i, item in enumerate(items):
            text = str(item.get("text", "")).strip()
            status = str(item.get("status", "pending")).lower()
            item_id = str(item.get("id", str(i + 1)))
            if not text:
                raise ValueError(f"Item {item_id}: text required")
            if status not in ("pending", "in_progress", "completed"):
                raise ValueError(f"Item {item_id}: invalid status '{status}'")
            if status == "in_progress":
                in_progress_count += 1
            validated.append({"id": item_id, "text": text, "status": status})
        if in_progress_count > 1:
            raise ValueError("Only one task can be in_progress at a time")
        self.items = validated
        return self.render()

    def render(self) -> str:
        if not self.items:
            return "No todos."
        lines = []
        for item in self.items:
            marker = {"pending": "[ ]", "in_progress": "[>]", "completed": "[x]"}[item["status"]]
            lines.append(f"{marker} #{item['id']}: {item['text']}")
        done = sum(1 for t in self.items if t["status"] == "completed")
        lines.append(f"\n({done}/{len(self.items)} completed)")
        return "\n".join(lines)
```

`update()` 做了严格的输入校验：

- **数量限制** — 最多 20 条，防止模型滥写
- **状态白名单** — 只能是 `pending` / `in_progress` / `completed` 三选一
- **唯一 `in_progress`** — 同时只能有一个任务在做。这条规则很关键——它强制模型保持**顺序聚焦**，不能同时开三个坑
- **必填 `text`** — 空任务没有意义

`render()` 把结构化数据转成模型能读懂的文本：

```
[ ] #1: Fix authentication bug
[>] #2: Add dark mode toggle        ← 当前正在做
[ ] #3: Write tests
[x] #4: Update README

(1/4 completed)
```

模型通过工具结果看到这段渲染文本，就跟自己写了一张便签一样。

### (2) todo 工具——模型自己写、自己更新

```python
TOOL_HANDLERS = {
    "bash":       lambda **kw: run_bash(kw["command"]),
    "read_file":  lambda **kw: run_read(kw["path"], kw.get("limit")),
    "write_file": lambda **kw: run_write(kw["path"], kw["content"]),
    "edit_file":  lambda **kw: run_edit(kw["path"], kw["old_text"], kw["new_text"]),
    "todo":       lambda **kw: TODO.update(kw["items"]),   # ← 新增
}
```

`todo` 工具的定义：

```python
{"name": "todo",
 "description": "Update task list. Track progress on multi-step tasks.",
 "input_schema": {
     "type": "object",
     "properties": {"items": {"type": "array", "items": {"type": "object",
         "properties": {
             "id": {"type": "string"},
             "text": {"type": "string"},
             "status": {"type": "string", "enum": ["pending", "in_progress", "completed"]}
         }, "required": ["id", "text", "status"]}}},
     "required": ["items"]}}
```

值得注意的是：这个工具 **没有读能力**。模型不能查询"我现在的 todos 是什么"，它只能写。那模型怎么知道当前状态？看上次 `todo` 工具返回的 render 结果。这引出了一个设计取舍——这里的 todo 状态在 harness（Python 内存），模型只能通过工具返回值"看到"它。真正的 Claude Code 会把状态持久化到文件（s07 会做）。

### (3) Nag Reminder——harness 的催促机制

模型有时会忘了更新 todo。s03 的解法很粗暴也很有效：数轮次，到阈值就催。

```python
def agent_loop(messages: list):
    rounds_since_todo = 0         # ← 新增计数器
    while True:
        response = client.messages.create(...)
        messages.append({"role": "assistant", "content": response.content})
        if response.stop_reason != "tool_use":
            return
        results = []
        used_todo = False
        for block in response.content:
            if block.type == "tool_use":
                handler = TOOL_HANDLERS.get(block.name)
                output = handler(**block.input) if handler else f"Unknown tool: {block.name}"
                results.append({"type": "tool_result", "tool_use_id": block.id, "content": str(output)})
                if block.name == "todo":
                    used_todo = True

        # 计数器更新
        rounds_since_todo = 0 if used_todo else rounds_since_todo + 1

        # 连续 3 轮没调 todo → 注入提醒
        if rounds_since_todo >= 3:
            results.append({
                "type": "text",
                "text": "<reminder>Update your todos.</reminder>"
            })

        messages.append({"role": "user", "content": results})
```

逻辑很清晰：

```
本轮调了 todo → rounds_since_todo = 0
本轮没调    → rounds_since_todo += 1
≥ 3         → 在 tool_results 中追加一条文本提醒
```

`<reminder>` 被作为 `type: "text"` 注入到 `user` 消息的 `content` 数组里。模型看到这条消息，就相当于 harness 拍了拍它的肩膀说"你该更新计划了"。

这和真实的 Claude Code 一致——你有时会看到系统注入的 `<system-reminder>` 标签，做的就是同样的事情。

### (4) 为什么这个设计有效

核心在于三点：

1. **状态在 harness，不在 prompt** — 如果让模型"在脑子里记"，对话一长就忘。而 todo 列表是 Python 对象，render 结果每次作为工具返回值重新注入，模型相当于不停地看便签。
2. **唯一 in_progress** — 物理上不可并行，模型一次只干一件事。
3. **Nag 是压力，不是命令** — harness 不规定模型做哪一步、怎么做，它只提醒"你该更新计划了"。**规划权还在模型手里。**

这也是 harness 哲学的体现：**harness 提供结构（todo 状态机），模型填充内容（具体做什么）。**

### (5) s02 → s03 变化总结

| 组件 | s02 | s03 |
|------|-----|-----|
| 工具数量 | 4 | 5 (+todo) |
| 规划 | 无 | TodoManager 有状态管理 |
| loop 变化 | 无 | + rounds_since_todo 计数器 |
| 模型催促 | 无 | 3 轮后注入 `<reminder>` |
| 约束 | 无 | 最多 20 条、唯一 in_progress |

### (6) 运行

```
python agents/s03_todo_write.py
```

推荐测试 prompt（故意给多步任务，观察它是否先列 todo 再动手）：

- `Refactor the file hello.py: add type hints, docstrings, and a main guard`
- `Create a Python package with __init__.py, utils.py, and tests/test_utils.py`
- `Review all Python files and fix any style issues`

---

## 关键洞察

s03 引入了一种新的 harness 能力：**不替模型做决定，但给模型提供"别忘事"的结构。** TodoManager 是一个最简单的状态机——只有 3 个状态、1 条约束（唯一 in_progress）——却大幅提升了多步任务的完成率。

这也回答了一个常见问题：要不要给 agent 写详细的 prompt 步骤？s03 的答案是 **不要——给结构就够了**。别在 prompt 里写"第一步做 X、第二步做 Y"，那是固定脚本。给一个 todo 工具 + nag 机制，让模型自己生成和更新计划，灵活得多。

## 4. s04：Subagent——"上下文隔离就是思维隔离"

s04 解决的是 LLM Agent 的核心瓶颈：**上下文膨胀**。

Agent 工作越久，messages 数组越臃肿。主对话里已经积压了 50 轮工具调用和结果，然后模型被问到"这个项目用了什么测试框架？"——它读了 5 个文件才找到答案，而这 5 个文件的内容永久污染了主上下文。其实你只需要一个词：`pytest`。

解决方案：**派"子 Agent"去查，只带回一句话摘要。**

```
Parent agent                     Subagent
+------------------+             +------------------+
| messages=[...]   |             | messages=[]      |  ← 空白上下文
|                  |  dispatch   |                  |
| tool: task       | ──────────→ | while tool_use:  |
|   prompt="..."   |             |   read files     |
|                  |  summary    |   search, grep   |
|   result="pytest"| ←────────── | return last text |
+------------------+             +------------------+
              |
Parent context stays clean.
Subagent context is discarded.
```

### (1) 两套工具、两套身份

s04 首次出现了工具的分级——父和子看到的工具不同：

```python
# 子 Agent 只有基础工具（没有 task，防止无限递归）
CHILD_TOOLS = [
    {"name": "bash", ...},
    {"name": "read_file", ...},
    {"name": "write_file", ...},
    {"name": "edit_file", ...},
]

# 父 Agent = 基础工具 + task 派遣工具
PARENT_TOOLS = CHILD_TOOLS + [
    {"name": "task",
     "description": "Spawn a subagent with fresh context. It shares the filesystem but not conversation history.",
     "input_schema": {
         "type": "object",
         "properties": {
             "prompt": {"type": "string"},
             "description": {"type": "string", "description": "Short description of the task"}
         },
         "required": ["prompt"]
     }},
]
```

系统提示词也分开了：

```python
SYSTEM = f"You are a coding agent at {WORKDIR}. Use the task tool to delegate exploration or subtasks."

SUBAGENT_SYSTEM = f"You are a coding subagent at {WORKDIR}. Complete the given task, then summarize your findings."
```

父是"主管"——会派活；子是"执行者"——只干事，汇报。

### (2) `run_subagent`——独立循环 + 上下文丢弃

```python
def run_subagent(prompt: str) -> str:
    sub_messages = [{"role": "user", "content": prompt}]  # 空白上下文！
    for _ in range(30):  # 安全限制：最多 30 轮
        response = client.messages.create(
            model=MODEL, system=SUBAGENT_SYSTEM, messages=sub_messages,
            tools=CHILD_TOOLS, max_tokens=8000,
        )
        sub_messages.append({"role": "assistant", "content": response.content})
        if response.stop_reason != "tool_use":
            break
        results = []
        for block in response.content:
            if block.type == "tool_use":
                handler = TOOL_HANDLERS.get(block.name)
                output = handler(**block.input) if handler else f"Unknown tool: {block.name}"
                results.append({
                    "type": "tool_result", "tool_use_id": block.id,
                    "content": str(output)[:50000]
                })
        sub_messages.append({"role": "user", "content": results})

    # 只返回最后一段文字摘要——整个 sub_messages 被丢弃
    return "".join(b.text for b in response.content if hasattr(b, "text")) or "(no summary)"
```

关键设计点：

- **`sub_messages` 从空开始** — 子 Agent 看不到父对话历史，就像一个新开的 session。它不是 fork，是 fresh。
- **`for _ in range(30)`** — 安全兜底，防止子 Agent 陷入死循环。最多 30 个 API 轮次，必须产出结论。
- **函数返回时 `sub_messages` 直接丢掉** — 这是 Python 的 GC 行为：函数退出，局部变量销毁。子 Agent 可能读了 10 个文件、跑了 20 个 bash 命令，但这些上下文**不会回到父级**。父收到的就是一段摘要文本。
- **共享文件系统，不共享聊天记录** — 子 Agent 对工作目录的修改会持久化（因为文件系统是共享的），但对话上下文完全隔离。

### (3) 父 loop 中的 task 调度

```python
for block in response.content:
    if block.type == "tool_use":
        if block.name == "task":                          # ← task 工具：同步阻塞
            desc = block.input.get("description", "subtask")
            prompt = block.input.get("prompt", "")
            print(f"> task ({desc}): {prompt[:80]}")
            output = run_subagent(prompt)                  # 阻塞等待子 Agent 完成
        else:
            handler = TOOL_HANDLERS.get(block.name)        # 其他工具走正常分发
            output = handler(**block.input) if handler else f"Unknown tool: {block.name}"
        results.append({"type": "tool_result", "tool_use_id": block.id, "content": str(output)})
```

注意这里是**同步执行**——父 Agent 派发 task 后会阻塞等待子 Agent 完成。它不是启动一个后台线程，也没有并发。`run_subagent(prompt)` 返回之前，父 loop 停在那。s08 会把这种模式升级为后台任务。

### (4) 为什么不允许递归生成

子 Agent 的 `CHILD_TOOLS` 里没有 `task` 工具。这是刻意的：

```
父 → task → 子 → task → 孙子 → task → ... 爆炸
```

没有 `task` 工具，子 Agent 就不知道"派子 Agent"这件事存在。它的 system prompt 只让它"完成给定的任务然后总结"，它的 JSON Schema 里没有 task。这就是**工具层面的权限分级**——不是你告诉子 Agent "别递归"，而是它物理上就没有这个能力。

### (5) 这个模式的应用场景

s04 的模式最适合两类子任务：

1. **探索/搜索类** — "找一下这个项目的测试框架是什么"、"列出所有用了 `requests` 库的文件"、"检查 auth 模块是怎么处理 token 的"。这类任务需要读很多文件但只需要一个简短结论。
2. **生成/创建类** — "创建一个 `utils.py`，包含 `safe_filename()` 和 `hash_cache_key()` 两个函数"、"写一个数据库迁移脚本"。子 Agent 写文件，父 Agent 看到结果。

不适合的场景：需要和用户持续交互的任务（子 Agent 没有 input，看不到外部对话）。

### (6) s03 → s04 变化总结

| 组件 | s03 | s04 |
|------|-----|-----|
| 工具分级 | 无（所有工具平等） | Parent 有 task，Child 没有 |
| 上下文模型 | 共享一个 `messages` | 父子隔离，子上下文即用即弃 |
| System prompt | 1 个 | 2 个（父 + 子） |
| 安全边界 | 无 | 子 Agent 有 30 轮限制，无 task 防递归 |
| 返回值 | — | 仅最后一段文本摘要 |

### (7) 运行

```
python agents/s04_subagent.py
```

推荐测试 prompt：

- `Use a subtask to find what testing framework this project uses`
- `Delegate: read all .py files and summarize what each one does`
- `Use a task to create a new module, then verify it from here`

启动后观察一个细节：父对话历史始终很短，而子 Agent 的内部循环你看不到（没有 print 它的每次工具调用）。你只收到子 Agent 的最终总结。

---

## 关键洞察

s04 的核心思想不是"多一个 Agent 干活更快"，而是**上下文隔离 = 思维清晰**。父对话历史保持干净，杂活交给子 Agent 在它自己的空间里做完，只带回答案。

这里有一个有趣的类比：**函数调用。** 在编程里，你不会把一个大函数的内部变量全暴露给调用者——你只返回一个值。s04 做的是同样的事：子 Agent = 函数，prompt = 参数，summary = 返回值，`sub_messages` = 函数内部的局部变量，退出即释放。

另一点值得注意：工具权限的分级从 s04 就开始了。不是给子 Agent 加"规则"让它别调 task——而是它根本**没有 task 的 schema**。这就是 harness 权限的本质：**控制能力，不控制意图。**

## 5. s05：Skill 加载——"用到什么知识，临时加载什么"

s05 解决的是 system prompt 膨胀问题。

你有 10 套领域知识想让 Agent 遵循——git 工作流规范、代码审查清单、测试最佳实践、PDF 处理流程……如果全塞进 system prompt，每次 API 调用都带着，10 个 skill × 2000 token = 20000 token 白白烧掉，而当前任务可能一个都用不上。

解决方案：**两层按需加载——第一层放便宜的名字列表，第二层只在模型请求时才取出完整内容。**

### (1) Skill 的文件格式——YAML frontmatter + Markdown 正文

每个 skill 是 `skills/<name>/SKILL.md` 目录结构：

```
skills/
  agent-builder/
    SKILL.md          # YAML 头部 + Markdown 指导内容
  code-review/
    SKILL.md
  mcp-builder/
    SKILL.md
  pdf/
    SKILL.md
```

SKILL.md 用前端常见的 frontmatter 格式分隔元数据和正文：

```markdown
---
name: pdf
description: Process PDF files - extract text, merge, split, and convert
tags: [document]
---

# PDF Processing

## Reading PDFs
Use `pdftotext` (from poppler-utils) to extract text...

## Creating PDFs
...
```

前面的 YAML 块是元数据（便宜，塞进 system prompt），后面是操作指南（贵，仅在加载时取出）。

### (2) SkillLoader——扫描、解析、两层供给

```python
class SkillLoader:
    def __init__(self, skills_dir: Path):
        self.skills_dir = skills_dir
        self.skills = {}
        self._load_all()

    def _load_all(self):
        if not self.skills_dir.exists():
            return
        for f in sorted(self.skills_dir.rglob("SKILL.md")):
            text = f.read_text()
            meta, body = self._parse_frontmatter(text)
            name = meta.get("name", f.parent.name)
            self.skills[name] = {"meta": meta, "body": body, "path": str(f)}

    def _parse_frontmatter(self, text: str) -> tuple:
        """用正则解析 --- YAML --- Markdown 结构"""
        match = re.match(r"^---\n(.*?)\n---\n(.*)", text, re.DOTALL)
        if not match:
            return {}, text
        try:
            meta = yaml.safe_load(match.group(1)) or {}
        except yaml.YAMLError:
            meta = {}
        return meta, match.group(2).strip()
```

`rglob("SKILL.md")` 递归扫描，你只需创建目录和文件，SkillLoader 自动发现。`_parse_frontmatter` 用正则 `^---\n(.*?)\n---\n(.*)` 拆出 YAML 头和后边的 Markdown。

两层供给方法：

```python
def get_descriptions(self) -> str:
    """Layer 1: 轻量描述列表 → 拼进 system prompt"""
    lines = []
    for name, skill in self.skills.items():
        desc = skill["meta"].get("description", "No description")
        tags = skill["meta"].get("tags", "")
        line = f"  - {name}: {desc}"
        if tags:
            line += f" [{tags}]"
        lines.append(line)
    return "\n".join(lines)

def get_content(self, name: str) -> str:
    """Layer 2: 完整内容 → 作为 tool_result 返回"""
    skill = self.skills.get(name)
    if not skill:
        return f"Error: Unknown skill '{name}'. Available: {', '.join(self.skills.keys())}"
    return f"<skill name=\"{name}\">\n{skill['body']}\n</skill>"
```

### (3) system prompt 中只放名字

```python
SYSTEM = f"""You are a coding agent at {WORKDIR}.
Use load_skill to access specialized knowledge before tackling unfamiliar topics.

Skills available:
{SKILL_LOADER.get_descriptions()}"""
```

最终生成的 system prompt 大概长这样：

```
You are a coding agent at /home/ubuntu/owen.
Use load_skill to access specialized knowledge before tackling unfamiliar topics.

Skills available:
  - agent-builder: Build custom AI agents using best practices [agent]
  - code-review: Review code for quality, security, and performance [code]
  - mcp-builder: Build MCP servers that integrate with Claude [mcp]
  - pdf: Process PDF files - extract text, merge, split, and convert
```

每个 skill 只占 ~100 token（名字 + 一句话描述），而不是完整 2000 token 的操作指南。

### (4) `load_skill` 工具——模型需要时自己调

```python
TOOL_HANDLERS = {
    "bash":       lambda **kw: run_bash(kw["command"]),
    "read_file":  lambda **kw: run_read(kw["path"], kw.get("limit")),
    "write_file": lambda **kw: run_write(kw["path"], kw["content"]),
    "edit_file":  lambda **kw: run_edit(kw["path"], kw["old_text"], kw["new_text"]),
    "load_skill": lambda **kw: SKILL_LOADER.get_content(kw["name"]),  # ← 新增
}
```

```python
{"name": "load_skill",
 "description": "Load specialized knowledge by name.",
 "input_schema": {
     "type": "object",
     "properties": {"name": {"type": "string", "description": "Skill name to load"}},
     "required": ["name"]}}
```

模型收到任务后，如果觉得需要某个领域的知识，会先调 `load_skill("code-review")`，harness 把完整的代码审查指南作为 tool_result 注入当前轮次。然后模型基于刚加载的操作指南工作。

### (5) 为什么走 tool_result 而不是 system prompt？

这是 s05 最重要的设计选择。

如果走 system prompt：
```
模型需要 skill → 修改 system → 重新发请求，翻倍 API 调用
```

如果走 tool_result：
```
模型调 load_skill → skill 内容作为 tool_result 进入 messages → 下一轮模型已看到
```

走 tool_result 的好处：
- **不打断循环** — 就是一次普通工具调用，和其他工具行为一致
- **只在需要时出现** — `pdf` skill 的 2000 行内容不会出现在一个纯代码任务里
- **和对话上下文一起在 messages 里** — 模型能自然引用，不会像 system prompt 那样离对话历史太远
- **和其他工具结果一样被压缩/截断** — 后续 s06 的上下文压缩对 skill 内容一视同仁

### (6) 和 prompt engineering 的区别

这个模式不是"写更好的 prompt"，而是**把知识变成可被 Agent 自己调用的资源**。

| | 传统 prompt engineering | s05 skill loading |
|------|-------------------------|-------------------|
| 知识位置 | system prompt 或 user prompt | 文件系统中独立的 SKILL.md |
| 触发方式 | 每次对话都带着 | 模型主动调用 load_skill |
| token 成本 | 全量，每轮都付 | 按需，只付一次 |
| 可维护性 | 改 prompt 模板 | 改文件，无需重写代码 |

skill 文件是**数据不是代码**——新增一个 skill 就是 `mkdir + touch SKILL.md + 写 YAML`，不用改 Python。

### (6.5) 一个常见误解：pdf skill 能"处理 PDF"吗？

初学者看到项目里有 `skills/pdf/SKILL.md`，直觉反应是"PDF 处理非常复杂（解析字体、渲染引擎、字符编码……），一个 skill 文件怎么可能搞定？"

实际上，看看 `skills/pdf/SKILL.md` 里写了什么：

```markdown
## Reading PDFs
# 推荐用 pdftotext 或 pymupdf
pdftotext input.pdf -
# 或者
python3 -c "import fitz; doc = fitz.open('input.pdf'); ..."

## Creating PDFs
# 推荐用 pandoc (从 Markdown 生成)
pandoc input.md -o output.pdf
# 或者用 reportlab 编程生成

## Key Libraries
| Task | Library | Install |
|------|---------|---------|
| Read/Write/Merge | PyMuPDF | pip install pymupdf |
| Create from scratch | ReportLab | pip install reportlab |
```

**skill 不是 PDF 处理引擎，它是一份操作指南/小抄。** 里面写了三样东西：

1. **bash 命令** — `pdftotext`、`pandoc`、`wkhtmltopdf`
2. **Python 代码片段** — 标准库/三方库的调用模板
3. **推荐库对照表** — 什么场景用什么库、怎么安装

模型收到这个 skill 后，和之前做的事情完全一样：**调 bash 工具去执行这些命令。** 如果 `pdftotext` 没装，模型会先 `pip install pymupdf` 再试 Python 方案。如果 `pandoc` 没装，模型会切到 `reportlab`。

所以 pdf skill 的本质是**领域知识注入**——不是给 Agent 新能力，而是告诉它"处理 PDF 用这些工具就够了，别绕远路"。模型本身已经会写代码、会调 bash、会读报错后修正，skill 只是把 PDF 场景的最佳路径预先告诉它。

可以这样理解：**skill 相当于一个资深同事给你留的便利贴**，上面写着"用 pymupdf 别用 pdfplumber，后者太慢"。便利贴没有给你新能力，但它让你做决策更快更准。

这个机制的好处是：新增领域支持的成本极低。你不需要写"PDF 解析器"、"PDF 渲染器"——你把 Python 生态里已有的工具（pymupdf、pdftotext、pandoc）组织成一份指南，模型自己会按指南去调用它们。**模型的通用能力 + skill 的领域路径 = 领域专家行为。**

### (7) s04 → s05 变化总结

| 组件 | s04 | s05 |
|------|-----|-----|
| 工具 | 5 (基础 + task) | 5 (基础 + load_skill) |
| 系统提示 | 静态 | 动态拼接 skill 列表 |
| 知识管理 | 无 | SkillLoader + SKILL.md 文件系统 |
| 注入策略 | — | 两层：名字在 system，内容在 tool_result |
| 循环变化 | — | 无（又是 dispatch map 加一行） |

### (8) 运行

```
python agents/s05_skill_loading.py
```

推荐测试 prompt：

- `What skills are available?`
- `Load the agent-builder skill and follow its instructions`
- `I need to do a code review -- load the relevant skill first`

---

## 关键洞察

s05 的 skill 机制和 s03 的 TodoWrite 在哲学上是一致的：**不要把所有东西塞进 prompt，让 harness 提供按需的结构。** s03 是按需给规划能力，s05 是按需给领域知识。

这个两层注入模式——便宜的名字在 system prompt，昂贵的内容在 tool_result——做到了"模型知道什么知识存在，但只在用到时才付 token 代价"。这就是 Claude Code 里你看到的 `/pdf` `/review` 等 slash command 以及内置 skill 的核心机制。

## 6. s06：上下文压缩——"Agent 可以策略性地遗忘"

s06 解决的是 LLM Agent 的终极瓶颈：**上下文窗口有天花板。**

读一个 1000 行的文件 ~4000 token。读 30 个文件、跑 20 条 bash 命令，10 万 token 打不住。不压缩，Agent 根本没法在大项目里工作——messages 数组不断胀大，最终超过 API 的上下文限制，直接报错。

s06 用三层压缩金字塔解决了这个问题。

### Layer 1：micro_compact——沉默的清扫工

每次 API 调用前自动运行，安静无感。策略很简单——**旧工具结果替换为占位符**：

```python
KEEP_RECENT = 3               # 保留最近 3 个工具结果
PRESERVE_RESULT_TOOLS = {"read_file"}  # read_file 结果永不压缩

def micro_compact(messages: list) -> list:
    # 收集所有 tool_result 的位置
    tool_results = []
    for msg_idx, msg in enumerate(messages):
        if msg["role"] == "user" and isinstance(msg.get("content"), list):
            for part_idx, part in enumerate(msg["content"]):
                if isinstance(part, dict) and part.get("type") == "tool_result":
                    tool_results.append((msg_idx, part_idx, part))

    if len(tool_results) <= KEEP_RECENT:
        return messages

    # 匹配 tool_use_id → 工具名
    tool_name_map = {}
    for msg in messages:
        if msg["role"] == "assistant":
            content = msg.get("content", [])
            if isinstance(content, list):
                for block in content:
                    if hasattr(block, "type") and block.type == "tool_use":
                        tool_name_map[block.id] = block.name

    # 清理旧的（保留最后 KEEP_RECENT 个），跳过 read_file
    to_clear = tool_results[:-KEEP_RECENT]
    for _, _, result in to_clear:
        if not isinstance(result.get("content"), str) or len(result["content"]) <= 100:
            continue  # 已经很短了，不处理
        tool_id = result.get("tool_use_id", "")
        tool_name = tool_name_map.get(tool_id, "unknown")
        if tool_name in PRESERVE_RESULT_TOOLS:
            continue  # read_file 结果保留，避免模型重读文件
        result["content"] = f"[Previous: used {tool_name}]"

    return messages
```

关键设计决策：

- **保留最近 3 个** — 当前在做的事需要完整上下文，不压缩
- **read_file 永久保留** — 文件内容是参考材料，压缩后模型会忘了文件内容然后重读，反而不划算
- **替换而不是删除** — 结构保留（`tool_result` 对象还在），只是内容变成占位符。模型能看到"我之前调过 bash"，但看不到 bash 的完整输出。这种"知道发生了什么但忘了细节"的状态，和人类记忆很像
- **长度 >100 的才压缩** — 短结果（比如 "Wrote 50 bytes"）不值得替换

### Layer 2：auto_compact——"我记不住了，帮我总结一下"

当 token 估算超过阈值（50000），触发自动压缩。**用 LLM 总结 LLM 的对话**：

```python
THRESHOLD = 50000
TRANSCRIPT_DIR = WORKDIR / ".transcripts"

def estimate_tokens(messages: list) -> int:
    """粗略 token 估算：~4 个字符 ≈ 1 token"""
    return len(str(messages)) // 4

def auto_compact(messages: list) -> list:
    # 1. 先存盘，不丢数据
    TRANSCRIPT_DIR.mkdir(exist_ok=True)
    transcript_path = TRANSCRIPT_DIR / f"transcript_{int(time.time())}.jsonl"
    with open(transcript_path, "w") as f:
        for msg in messages:
            f.write(json.dumps(msg, default=str) + "\n")

    # 2. 取最后 80000 字符（防止总结请求本身超限），发给 LLM
    conversation_text = json.dumps(messages, default=str)[-80000:]

    # 3. LLM 总结（不带工具，纯文本总结）
    response = client.messages.create(
        model=MODEL,
        messages=[{"role": "user", "content":
            "Summarize this conversation for continuity. Include: "
            "1) What was accomplished, 2) Current state, 3) Key decisions made. "
            "Be concise but preserve critical details.\n\n" + conversation_text}],
        max_tokens=2000,
    )

    summary = next((block.text for block in response.content if hasattr(block, "text")), "")

    # 4. 整个 messages 数组被替换为一条总结消息
    return [
        {"role": "user", "content": f"[Conversation compressed. Transcript: {transcript_path}]\n\n{summary}"},
    ]
```

几个细节值得注意：

- **`transcript_{timestamp}.jsonl`** — 完整对话存盘到 `.transcripts/`，以便后续 debug 或审查。信息没有丢失，只是移出了活跃上下文。
- **`[-80000:]`** — 取对话尾部分给 LLM 做总结。因为最近的对话最重要，旧的对话可能在之前的压缩中已经被总结过了。
- **不带 tools 的 API 调用** — 这是 s06 中唯一一次不带 `tools` 参数的调用。总结这件事不需要工具，模型只输出一段纯文本。

### Layer 3：compact 工具——模型主动请求压缩

```python
# 工具定义
{"name": "compact",
 "description": "Trigger manual conversation compression.",
 "input_schema": {
     "type": "object",
     "properties": {"focus": {"type": "string",
         "description": "What to preserve in the summary"}}}}

# dispatch map 中的 handler
"compact": lambda **kw: "Manual compression requested.",
```

模型调用 `compact` 工具后，循环中检测到 `manual_compact = True`，同样调用 `auto_compact()`。`focus` 参数目前只是定义中的占位，实际只返回字符串 `"Compressing..."`——真正的压缩逻辑和 Layer 2 共享同一个 `auto_compact` 函数。

### 三层在循环中的位置

```python
def agent_loop(messages: list):
    while True:
        # Layer 1: 每轮静默执行
        micro_compact(messages)

        # Layer 2: 超过阈值自动触发
        if estimate_tokens(messages) > THRESHOLD:
            print("[auto_compact triggered]")
            messages[:] = auto_compact(messages)

        response = client.messages.create(
            model=MODEL, system=SYSTEM, messages=messages,
            tools=TOOLS, max_tokens=8000,
        )
        messages.append({"role": "assistant", "content": response.content})
        if response.stop_reason != "tool_use":
            return

        results = []
        manual_compact = False
        for block in response.content:
            if block.type == "tool_use":
                if block.name == "compact":
                    manual_compact = True
                    output = "Compressing..."
                else:
                    handler = TOOL_HANDLERS.get(block.name)
                    output = handler(**block.input) if handler else f"Unknown tool: {block.name}"
                results.append({"type": "tool_result", "tool_use_id": block.id, "content": str(output)})

        messages.append({"role": "user", "content": results})

        # Layer 3: 模型调了 compact 后触发
        if manual_compact:
            print("[manual compact]")
            messages[:] = auto_compact(messages)
            return
```

### 三层金字塔的总结

```
层 1: micro_compact  ─  每轮、轻量、自动    ─  旧 tool_result → 占位符
层 2: auto_compact   ─  超 50000 token 触发  ─  全量对话 → LLM 总结
层 3: compact 工具   ─  模型主动调用        ─  同层 2，手动触发
```

三层是递进关系：层 1 是日常清理，拖慢膨胀速度；层 2 是安全阀，防止越过 API 限制；层 3 是给模型的自主权，它可以在任务阶段切换时主动清空上下文。

### s05 → s06 变化总结

| 组件 | s05 | s06 |
|------|-----|-----|
| 工具 | 5 (基础 + load_skill) | 5 (基础 + compact) |
| 上下文管理 | 无 | 三层压缩 |
| 循环变化 | dispatch 分发 | + 层 1 前置检查 + 层 2 阈值检查 + 层 3 后置检查 |
| 文件系统 | skills/ | + .transcripts/ 存档 |
| 模型可请求压缩 | 无 | compact 工具 |

### 运行

```
python agents/s06_context_compact.py
```

推荐测试 prompt（故意制造大量工具调用观察压缩）：

- `Read every Python file in the agents/ directory one by one` — 观察 micro-compact 逐步替换旧结果
- `Keep reading files until compression triggers automatically` — 触发 auto_compact
- `Use the compact tool to manually compress the conversation` — 手动触发

---

## 关键洞察

s06 的三层压缩机制本质上是给 Agent **可控的遗忘能力**。人类不会记住今天敲过的每一条命令的完整输出，只记住"我刚才在干 X，结果是 Y"。Agent 需要同样的能力。

这里有一个反直觉的设计决策：**read_file 的结果不压缩。** 原因用一句话说就是——"忘掉 bash 输出没关系（可以重跑），忘掉文件内容会导致重复读文件，反复读文件反而更费 token"。好的压缩策略不是无差别清理，而是知道什么值得保留。

另一点：`auto_compact` 里的总结请求是不带工具的 API 调用。这说明 **Agent 的压缩能力本身也在 harness 层面，不在对话循环里**——压缩时模型不开着 bash/edit 等工具，它只用纯文本能力做总结。如果让压缩迭代跑到一半模型突然调了个 bash，那就不是压缩了。这是一种"能力降级"——在特定的 harness 路径上，工具集可以临时收紧。

## 7. s07：任务系统——"比任何一次对话都长命的目标"

s07 解决的是 s03 TodoManager 的两个致命弱点：**内存态（压缩后丢失）** 和 **扁平无依赖**。

s03 的 todo 列表在 Python 内存里，s06 的 auto_compact 一跑，整个消息历史被一条总结替换——todo 状态消失了。而且 todo 就是 `[ ]` `[>]` `[x]` 三态，没有"任务 B 依赖任务 A"的能力。

s07 的解法：**把任务图持久化到磁盘上的 JSON 文件。** 每组文件构成一个带依赖关系的 DAG（有向无环图）。

### (1) 磁盘上的任务图

```
.tasks/
  task_1.json  {"id":1, "subject":"Set up project", "status":"completed"}
  task_2.json  {"id":2, "subject":"Write code", "blockedBy":[1], "status":"pending"}
  task_3.json  {"id":3, "subject":"Write tests", "blockedBy":[1], "status":"pending"}
  task_4.json  {"id":4, "subject":"Run CI", "blockedBy":[2,3], "status":"pending"}
```

对应的有向图：

```
               +----------+
          +--> | task 2   | --+
          |    | pending  |   |
+----------+  +----------+    +--> +----------+
| task 1   |                         | task 4   |
| completed| --> +----------+   +--> | blocked  |
+----------+     | task 3   | --+    +----------+
                 | pending  |
                 +----------+

顺序:  task 1 必须先完成, 才能开始 2 和 3
并行:  task 2 和 3 可以同时执行
依赖:  task 4 要等 2 和 3 都完成
```

这个语义非常清晰：**什么能做**（pending 且 blockedBy 为空）、**什么被卡住**（blockedBy 里还有未完成的 ID）、**什么做完了**（completed）。

### (2) TaskManager——CRUD + 依赖传播

```python
class TaskManager:
    def __init__(self, tasks_dir: Path):
        self.dir = tasks_dir
        self.dir.mkdir(exist_ok=True)
        self._next_id = self._max_id() + 1

    def _max_id(self) -> int:
        ids = [int(f.stem.split("_")[1]) for f in self.dir.glob("task_*.json")]
        return max(ids) if ids else 0

    def _load(self, task_id: int) -> dict:
        path = self.dir / f"task_{task_id}.json"
        return json.loads(path.read_text())

    def _save(self, task: dict):
        path = self.dir / f"task_{task['id']}.json"
        path.write_text(json.dumps(task, indent=2, ensure_ascii=False))
```

`s07` 是第二个用到文件系统持久化的 session（第一个是 s06 的 `.transcripts/`）。`_next_id` 从已有文件中读取最大值 +1——进程重启后 ID 不冲突。注意它不是靠全局计数器或者自增序列，而是 `glob("task_*.json")` 扫描磁盘，**文件系统本身就是状态存储**。

`create` 方法：

```python
def create(self, subject: str, description: str = "") -> str:
    task = {
        "id": self._next_id, "subject": subject, "description": description,
        "status": "pending", "blockedBy": [], "owner": "",
    }
    self._save(task)
    self._next_id += 1
    return json.dumps(task, indent=2, ensure_ascii=False)
```

owner 字段现在是空字符串——这将来在 s09-s11 的 Agent 团队中会用到，标记任务属于哪个 Agent。

### (3) 依赖传播——完成即解锁

这是 s07 最精巧的机制。当任务完成时，**自动**从所有其他任务的 `blockedBy` 中移除已完成的任务 ID：

```python
def _clear_dependency(self, completed_id: int):
    """Remove completed_id from ALL other tasks' blockedBy lists."""
    for f in self.dir.glob("task_*.json"):
        task = json.loads(f.read_text())
        if completed_id in task.get("blockedBy", []):
            task["blockedBy"].remove(completed_id)
            self._save(task)

def update(self, task_id: int, status: str = None,
           add_blocked_by: list = None, remove_blocked_by: list = None) -> str:
    task = self._load(task_id)
    if status:
        if status not in ("pending", "in_progress", "completed"):
            raise ValueError(f"Invalid status: {status}")
        task["status"] = status
        if status == "completed":
            self._clear_dependency(task_id)    # ← 关键：标记完成时级联解锁
    if add_blocked_by:
        task["blockedBy"] = list(set(task["blockedBy"] + add_blocked_by))
    if remove_blocked_by:
        task["blockedBy"] = [x for x in task["blockedBy"] if x not in remove_blocked_by]
    self._save(task)
    return json.dumps(task, indent=2, ensure_ascii=False)
```

这里有一个重要的设计：`_clear_dependency` 扫描**全部**任务文件，而不是被完成的那个任务自己反查。这样可以安全处理"任务 A 被任务 B、C、D 共同依赖"的情况——A 完成那一刻，B、C、D 的 blockedBy 都被清理。

此外，`add_blocked_by` 用 `list(set(...))` 去重，防止同一个依赖被加两次。

### (4) 四个 task 工具

```python
TOOL_HANDLERS = {
    "bash":        lambda **kw: run_bash(kw["command"]),
    "read_file":   lambda **kw: run_read(kw["path"], kw.get("limit")),
    "write_file":  lambda **kw: run_write(kw["path"], kw["content"]),
    "edit_file":   lambda **kw: run_edit(kw["path"], kw["old_text"], kw["new_text"]),
    "task_create": lambda **kw: TASKS.create(kw["subject"], kw.get("description", "")),
    "task_update": lambda **kw: TASKS.update(kw["task_id"], kw.get("status"),
                                              kw.get("addBlockedBy"), kw.get("removeBlockedBy")),
    "task_list":   lambda **kw: TASKS.list_all(),
    "task_get":    lambda **kw: TASKS.get(kw["task_id"]),
}
```

四个工具的职责很明确：增、改、列、查。注意没有删除——任务完成了就是标记为 completed，留下痕迹。

### (5) s03 TodoWrite vs s07 TaskManager 对比

| | s03 TodoWrite | s07 TaskManager |
|------|---------|-----------|
| 存储 | Python 内存 | `.tasks/` 磁盘 JSON |
| 持久性 | 进程内 | 跨进程重启 |
| 依赖关系 | 无 | `blockedBy` 有向图 |
| 压缩安全性 | 丢失（在 messages 里） | 存活（在文件系统里） |
| 字段 | id, text, status | id, subject, description, status, blockedBy, owner |
| 并发 | 无 | owner 字段（为 s09+ 准备） |

### (6) 为什么是"第二个关键枢纽"

s07 在整个 12 个 session 序列中处于中点位置（`s01-s06 | s07-s12`），文档特别用 `|` 分隔。这不是偶然的——**s07 是一切合作的骨架**：

- **s08** 的后台线程读取任务列表，自动认领 pending 任务
- **s09-s10** 的 Agent 团队通过 `owner` 字段协商任务分配
- **s12** 的 worktree 隔离用任务 ID 绑定工作目录

任务图是"被动的数据"，但它解耦了生产者和消费者——Agent A 创建任务，Agent B 执行任务，它们不需要直接通信，只需要读写同一个 `.tasks/` 目录。

### (7) s06 → s07 变化总结

| 组件 | s06 | s07 |
|------|-----|-----|
| 工具数 | 5 | 8 (+4 task) |
| 持久化 | .transcripts/（只存档） | .tasks/（活跃状态） |
| 规划引擎 | 无（s06 没带 todo） | TaskManager + DAG |
| 依赖关系 | 无 | blockedBy 自动传播 |
| 循环变化 | 三层压缩 | 回到简单 dispatch（压缩暂未整合） |

### (8) 运行

```
python agents/s07_task_system.py
```

推荐测试 prompt：

- `Create 3 tasks: "Setup project", "Write code", "Write tests". Make them depend on each other in order.`
- `List all tasks and show the dependency graph`
- `Complete task 1 and then list tasks to see task 2 unblocked`
- `Create a task board for refactoring: parse → transform → emit → test, where transform and emit can run in parallel after parse`

试试关掉进程再重开，调用 task_list——任务还在磁盘上。

---

## 关键洞察

s07 的核心思想一句话：**状态在对话之外。** s03 的 todo 在 messages 里（压缩后消失），s07 的 task 在文件系统里（压缩后还在）。这是从"对话级 Agent"迈向"项目级 Agent"的一道门槛——对话可以结束，任务可以继续。

从架构层面看，`_clear_dependency` 是一次**被动传播**：不是模型主动说"现在任务 B 的 blockedBy 可以移除了"，而是 harness 在任务 A 标记为 completed 那一刻自动做了级联更新。模型只需要知道"某件事做完了"，harness 负责把"做完"这件事的后果传到所有相关节点。这就是 harness 比 prompt 强的根本原因——harness 能做一致性的级联操作，prompt 只能做文本建议。

## 8. s08：后台任务——"慢操作丢后台，Agent 继续想下一步"

s08 解决的是 Agent 的 I/O 阻塞问题。

`npm install` 跑 3 分钟、`pytest` 跑 2 分钟、`docker build` 跑 5 分钟——s04 的 `run_subagent` 和普通的 bash 都是同步阻塞的，Agent 只能干等。用户说"装依赖 + 顺便建个配置文件"，Agent 得一个一个来。

s08 的解法：**后台线程 + 通知队列。模型 spawn 任务后立即拿到 task_id，继续干别的事；任务完成后结果注入下一轮对话。**

### (1) BackgroundManager——线程池的朴素版

```python
class BackgroundManager:
    def __init__(self):
        self.tasks = {}                   # task_id → {status, result, command}
        self._notification_queue = []     # 完成的任务结果
        self._lock = threading.Lock()     # 线程安全
```

不是线程池——就是 `threading.Thread` 每次新建一个线程。daemon 线程，主进程退出时自动终止。

### (2) `run()`——启动即返回

```python
def run(self, command: str) -> str:
    task_id = str(uuid.uuid4())[:8]       # 8 位随机 ID
    self.tasks[task_id] = {
        "status": "running", "result": None, "command": command
    }
    thread = threading.Thread(
        target=self._execute, args=(task_id, command), daemon=True
    )
    thread.start()
    return f"Background task {task_id} started: {command[:80]}"
```

关键：**函数立即返回**，模型看到一个 task_id，可以接着干别的事。和 s04 的 `run_subagent` 完全不同——那个是同步阻塞直到子 Agent 完成。

### (3) `_execute()`——线程内的 subprocess

```python
def _execute(self, task_id: str, command: str):
    try:
        r = subprocess.run(
            command, shell=True, cwd=WORKDIR,
            capture_output=True, text=True, timeout=300    # 5分钟超时
        )
        output = (r.stdout + r.stderr).strip()[:50000]
        status = "completed"
    except subprocess.TimeoutExpired:
        output = "Error: Timeout (300s)"
        status = "timeout"
    except Exception as e:
        output = f"Error: {e}"
        status = "error"

    self.tasks[task_id]["status"] = status
    self.tasks[task_id]["result"] = output or "(no output)"

    # 线程安全地推入通知队列
    with self._lock:
        self._notification_queue.append({
            "task_id": task_id, "status": status,
            "command": command[:80], "result": (output or "(no output)")[:500],
        })
```

和 `run_bash` 几乎一样——`subprocess.run` + 超时 + 截断。区别只有两个：

- **timeout 从 120s 变成 300s** — 后台任务预期是长任务，给了更长的超时
- **结果推入通知队列而不是直接返回** — 线程不能直接往 messages 里写，所以走队列

### (4) `drain_notifications()`——循环中唯一的线程交汇点

```python
def drain_notifications(self) -> list:
    with self._lock:
        notifs = list(self._notification_queue)
        self._notification_queue.clear()
    return notifs

def check(self, task_id: str = None) -> str:
    """查询单个任务状态或列出所有"""
    if task_id:
        t = self.tasks.get(task_id)
        if not t:
            return f"Error: Unknown task {task_id}"
        return f"[{t['status']}] {t['command'][:60]}\n{t.get('result') or '(running)'}"
    # 列出所有
    lines = []
    for tid, t in self.tasks.items():
        lines.append(f"{tid}: [{t['status']}] {t['command'][:60]}")
    return "\n".join(lines) if lines else "No background tasks."
```

`drain_notifications` 是一次性操作——取走所有待通知，清空队列。这保证了每条通知只被注入一次。

### (5) 循环注入——LLM 调用前的"收件箱检查"

```python
def agent_loop(messages: list):
    while True:
        # 每次 LLM 调用前，清空通知队列
        notifs = BG.drain_notifications()
        if notifs and messages:
            notif_text = "\n".join(
                f"[bg:{n['task_id']}] {n['status']}: {n['result']}"
                for n in notifs
            )
            messages.append({
                "role": "user",
                "content": f"<background-results>\n{notif_text}\n</background-results>"
            })

        response = client.messages.create(...)
```

模型的核心循环是单线程的——**只有 subprocess 在后台线程跑，agent loop 本身不并发**。流程是：

```
Round N:   模型调 background_run("npm install") → 拿到 task_id
Round N+1: 模型干别的事（比如 background_run("pip install") 或 read_file）
Round N+2: drain_notifications() 发现 npm 跑完了 → 作为 <background-results> 注入
           模型看到结果，决定下一步
```

这不叫 agent 并发思考，这叫 **I/O 并行 + Agent 顺序执行**。Agent 本身还是单线程地一轮轮走，只是等待 I/O 的时间被利用了。

### (6) 工具定义

```python
# 两个新工具
{"name": "background_run", "description": "Run command in background thread. Returns task_id immediately.",
 "input_schema": {"type": "object", "properties": {"command": {"type": "string"}}, "required": ["command"]}},

{"name": "check_background", "description": "Check background task status. Omit task_id to list all.",
 "input_schema": {"type": "object", "properties": {"task_id": {"type": "string"}}}},
```

注意 `check_background` 的 `task_id` 不是 required——省略时列出所有任务。模型可以不知道自己 spawn 了哪些任务，调一次 `check_background()` 就能看到全局。

### (7) s07 → s08 变化总结

| 组件 | s07 | s08 |
|------|-----|-----|
| 工具数 | 8 (4 task + 4 base) | 6 (2 bg + 4 base，task 工具暂未整合) |
| 执行方式 | 仅阻塞 | 阻塞 + 后台线程 |
| 通知机制 | 无 | 每轮排空通知队列 |
| 并发模型 | 纯串行 | I/O 并行、Agent 顺序 |
| 循环变化 | dispatch 分发 | + drain_notifications 前置注入 |

### (8) 运行

```
python agents/s08_background_tasks.py
```

推荐测试 prompt：

- `Run "sleep 5 && echo done" in the background, then create a file while it runs`
- `Start 3 background tasks: "sleep 2", "sleep 4", "sleep 6". Check their status.`

---

## 关键洞察

s08 引入了 harness 中第一个真正异步的组件，但保持了 Agent 循环的单线程心智模型。这其实是一个重要的架构选择：**模型不需要理解线程——它只知道"我上次 spawn 了一个东西，现在收到了它的结果"。** 后台线程是 harness 层的事，模型的思维还是线性的。

另外值得注意：s04 的 `run_subagent` 是同步的，为什么不用后台线程包装它？因为子 Agent 需要的是"上下文隔离"，不是"执行并行"——父 Agent 在等子 Agent 的结论才能继续。而后台任务 (`npm install`) 没有这种依赖关系，模型可以继续干别的事。这就是两种异步的不同：一个是"我不等你，我干别的"，一个是"我要你的结果才能继续"。

## 9. s09：Agent 团队——"多个模型，通过文件协调"

s09 是从单 Agent 到多 Agent 的一道门槛。在此之前的所有 session 都是"一个模型、一个 loop"，s04 的子 Agent 是一次性的生成-返回-销毁，s08 的后台任务只能跑 shell 不能做 LLM 决策。

s09 引入了三个新能力：

1. **持久化队友** — 有名字、有角色、有状态，跨多轮存活，不是一次性
2. **文件邮箱通信** — append-only JSONL 收件箱，Agent 之间发消息
3. **每个队友独立 agent loop** — 每个人在自己的线程里跑完整的 while-tool_use 循环

### (1) s04 Subagent vs s09 Teammate

```
Subagent (s04):   spawn → execute → return summary → destroyed
Teammate (s09):   spawn → working → idle → working → ... → shutdown
```

s04 的子 Agent 像函数调用——传参、执行、返回、清理。s09 的队友像**员工**——有名字 "alice"，有角色 "coder"，有生命周期 `working → idle → working → idle`，可以反复复派任务。

### (2) 目录结构

```
.team/
  config.json              # 团队名册 + 各成员状态
  inbox/
    alice.jsonl            # alice 的收件箱（append-only）
    bob.jsonl              # bob 的收件箱
    lead.jsonl             # 领导的收件箱
```

### (3) TeammateManager——队友生命周期

```python
class TeammateManager:
    def __init__(self, team_dir: Path):
        self.dir = team_dir
        self.dir.mkdir(exist_ok=True)
        self.config_path = self.dir / "config.json"
        self.config = self._load_config()   # 从磁盘恢复
        self.threads = {}                    # 名字 → 线程

    def _load_config(self) -> dict:
        if self.config_path.exists():
            return json.loads(self.config_path.read_text())
        return {"team_name": "default", "members": []}
```

`config.json` 每次更新都 `_save_config()` 写回磁盘。进程重启后队员名册还在。

`spawn()` 方法：

```python
def spawn(self, name: str, role: str, prompt: str) -> str:
    member = self._find_member(name)
    if member:
        if member["status"] not in ("idle", "shutdown"):
            return f"Error: '{name}' is currently {member['status']}"
        member["status"] = "working"
    else:
        member = {"name": name, "role": role, "status": "working"}
        self.config["members"].append(member)
    self._save_config()
    thread = threading.Thread(
        target=self._teammate_loop,
        args=(name, role, prompt),
        daemon=True,
    )
    self.threads[name] = thread
    thread.start()
    return f"Spawned '{name}' (role: {role})"
```

如果同名队友处于 `idle` 状态，就唤醒它并给新 prompt；如果是新名字，创建并启动线程。这实现了"队友复用"——不需要每次都创建新 Agent。

### (4) MessageBus——文件级通信协议

这是 s09 最核心的发明。JSONL 文件做邮箱：

```python
class MessageBus:
    def __init__(self, inbox_dir: Path):
        self.dir = inbox_dir
        self.dir.mkdir(parents=True, exist_ok=True)

    def send(self, sender: str, to: str, content: str,
             msg_type: str = "message", extra: dict = None) -> str:
        if msg_type not in VALID_MSG_TYPES:
            return f"Error: Invalid type '{msg_type}'"
        msg = {
            "type": msg_type, "from": sender,
            "content": content, "timestamp": time.time(),
        }
        if extra:
            msg.update(extra)
        inbox_path = self.dir / f"{to}.jsonl"
        with open(inbox_path, "a") as f:        # ← append-only
            f.write(json.dumps(msg) + "\n")
        return f"Sent {msg_type} to {to}"

    def read_inbox(self, name: str) -> list:
        inbox_path = self.dir / f"{name}.jsonl"
        if not inbox_path.exists():
            return []
        messages = []
        for line in inbox_path.read_text().strip().splitlines():
            if line:
                messages.append(json.loads(line))
        inbox_path.write_text("")               # ← drain after read
        return messages
```

关键设计：**读即清空**。`read_inbox` → 读所有行 → `write_text("")` 删文件。每条消息只被消费一次，不会重复处理。

5 种消息类型（定义了但 s09 只用到前 2 种，后 3 种留给 s10）：

```python
VALID_MSG_TYPES = {
    "message",              # 普通文本消息
    "broadcast",            # 发给所有人
    "shutdown_request",     # 请求关闭 (s10)
    "shutdown_response",    # 同意/拒绝关闭 (s10)
    "plan_approval_response", # 审批计划 (s10)
}
```

还有 `broadcast` 方法，遍历所有队友逐个发：

```python
def broadcast(self, sender: str, content: str, teammates: list) -> str:
    count = 0
    for name in teammates:
        if name != sender:
            self.send(sender, name, content, "broadcast")
            count += 1
    return f"Broadcast to {count} teammates"
```

### (5) 队友的 agent loop——缩水但完整的版本

每个队友在自己的线程里跑：

```python
def _teammate_loop(self, name: str, role: str, prompt: str):
    sys_prompt = (
        f"You are '{name}', role: {role}, at {WORKDIR}. "
        f"Use send_message to communicate. Complete your task."
    )
    messages = [{"role": "user", "content": prompt}]
    tools = self._teammate_tools()   # bash/read/write/edit/send_message/read_inbox
    for _ in range(50):              # 安全限制 50 轮
        # 每轮检查收件箱
        inbox = BUS.read_inbox(name)
        for msg in inbox:
            messages.append({"role": "user", "content": json.dumps(msg)})

        response = client.messages.create(
            model=MODEL, system=sys_prompt,
            messages=messages, tools=tools, max_tokens=8000,
        )
        messages.append({"role": "assistant", "content": response.content})
        if response.stop_reason != "tool_use":
            break
        # 执行工具（通过 _exec 分发）
        results = []
        for block in response.content:
            if block.type == "tool_use":
                output = self._exec(name, block.name, block.input)
                results.append({
                    "type": "tool_result", "tool_use_id": block.id,
                    "content": str(output),
                })
        messages.append({"role": "user", "content": results})

    # 完成后回到 idle 状态
    member = self._find_member(name)
    if member and member["status"] != "shutdown":
        member["status"] = "idle"
        self._save_config()
```

注意队友的 `sys_prompt` 和 Leader 不同——队友被告知自己的名字和角色，被要求"完成你的任务"，Leader 则被告知"你是团队领导，派发任务"。

### (6) 领导（Lead）的循环——收件箱注入

```python
def agent_loop(messages: list):
    while True:
        # 每轮先检查收件箱
        inbox = BUS.read_inbox("lead")
        if inbox:
            messages.append({
                "role": "user",
                "content": f"<inbox>{json.dumps(inbox, indent=2)}</inbox>",
            })
        # 正常 loop...
```

领导和队友的通信模式是对称的——都走 `BUS.read_inbox`，都通过 JSONL 文件交换消息。领导给 alice 发消息 → `alice.jsonl` 新增一行 → alice 下轮 `read_inbox` 读到 → 清空。

### (7) 九工具全貌

Leader 有 9 个工具：

```python
TOOL_HANDLERS = {
    "bash":            ...,  # 基础工具
    "read_file":       ...,
    "write_file":      ...,
    "edit_file":       ...,
    "spawn_teammate":  ...,  # 创建/唤醒队友
    "list_teammates":  ...,  # 列出团队状态
    "send_message":    ...,  # 点对点发消息
    "read_inbox":      ...,  # 读 lead 的收件箱
    "broadcast":       ...,  # 广播给全员
}
```

Leader 有 bash/edit 等完整能力（它可以亲自干活），也有团队管理能力。队友只有 6 个工具——没有 `spawn_teammate` / `list_teammates` / `broadcast`（防止递归管理）。

### (7.5) 什么时候用哪种模式？

到 s09 为止，我们已经有了三种 Agent 协作模式。怎么选？代码没有显式写决策逻辑，但从设计意图可以看出一个判断框架：

| | 单 Agent (s01-s02) | Subagent (s04) | Agent 团队 (s09) |
|------|-----------|------------|----------|
| 适用场景 | 简单任务，几步完成 | 探索/搜索，需要上下文隔离 | 复杂多步任务，可并行 |
| 任务特征 | 单一目标，线性执行 | 读多文件但只需结论 | 角色有分工 (coder/tester) |
| 生命周期 | 一次性对话 | spawn→执行→返回→销毁 | spawn→work→idle→work→... |
| 通信 | 无（用户↔Agent） | 单向：父→子 prompt，子→父 summary | 双向：JSONL 收件箱 |
| 上下文 | 父对话共享 | 子独立上下文（隔离） | 各自独立上下文 |
| 并发 | 串行 | 串行（父阻塞等子） | 并行（各自线程） |
| 典型 prompt | "列出所有 py 文件" | "找一下这个项目用什么测试框架" | "alice 写代码，bob 写测试" |

**决策逻辑模型（LLM 自己判断）：**

模型看到任务后，会基于自己的判断决定调哪个工具：
- 需要自己查文件但不想污染对话 → 调 `task` 工具 spawn 一个子 Agent
- 任务可以分给不同角色并行 → 调 `spawn_teammate` 创建队友
- 简单的读/写/改 → 直接用 bash / read_file / write_file / edit_file

harness 不替模型做这个决策。它只是**把三种工具都提供出来，让模型自己判断场景**。这和之前的原则一致——模型拥有判断权，harness 拥有执行权。

值得一提的是：这些模式不是互斥的。Leader 可以 spawn 一个 teammate（alice），alice 在处理任务时也可以在自己的 loop 里用 bash/read/write——团队模式是单 Agent 模式的超集，团队里的每个成员本质上还是一个独立 Agent。

### (8) s08 → s09 变化总结

| 组件 | s08 | s09 |
|------|-----|-----|
| Agent 数量 | 1 | 1 Lead + N 队友 |
| 工具数 | 6 | 9 (+spawn/send/read_inbox/broadcast，同时也有 check) |
| 持久化 | 无 | config.json + JSONL 收件箱 |
| 线程 | 跑 shell | 跑完整 agent loop |
| 通信 | 无（通知队列是单向） | 双向文件邮箱 |
| 生命周期 | 一次性守护线程 | idle ↔ working 循环 |

### (9) 运行

```
python agents/s09_agent_teams.py
```

内置命令（非 LLM 路径）：

- `/team` — 直接查看 `.team/config.json` 中的团队名册
- `/inbox` — 直接查看 lead 的收件箱

推荐测试 prompt：

- `Spawn alice (coder) and bob (tester). Have alice send bob a message.`
- `Broadcast "status update: phase 1 complete" to all teammates`

---

## 关键洞察

s09 用最简单的通信原语——**文件追加 + 读后清空**——实现了多 Agent 协作。没有消息队列、没有 RPC、没有 WebSocket。JSONL 收件箱就是一个单写者多读者、append-only 的日志。

这个设计有两个极简主义洞察：

1. **文件即协议** — 不需要定义通信协议格式，JSONL 每一行就是一条消息。没有握手、没有 ack、没有重试。读即清空 = 消息确认（如果进程在读后崩溃前没处理完，消息会丢——但对 Agent 来说，丢消息不是故障，它会在下一轮收到新消息时继续工作）。

2. **收件箱读清是幂等屏障** — `read_inbox` 返回后文件为空。这意味着一个队友同一时间只有一个线程在消费它的收件箱（因为只有一个 teammate loop）。没有锁竞争，没有重复消费。

对比 s04 的 subagent，s09 的队友和 subagent 有本质不同：subagent 共享文件系统但不共享通信通道；teammate 通过收件箱随时可以收到新任务。**通信通道是 Agent 从"工具"升级为"成员"的分界线。**

## 10. s10：团队协议——"模型之间的结构化握手"

s09 的队友能干活能通信，但缺少两样东西：**优雅关机**和**计划审批**。

直接杀线程会留下写了一半的文件、过期的 config.json。高风险变更（"重构认证模块"）队友拿到就开干，没有审批环节。s10 用一个统一的模式解决这两个问题：**request_id 关联 + 两态 FSM**。

### (1) 统一的 FSM——一个模式，两个场景

```
Shutdown Protocol                  Plan Approval Protocol
==================                 ======================
Lead             Teammate           Teammate           Lead
  |                 |                 |                 |
  |--shutdown_req-->|                 |--plan_req------>|
  | {req_id:"abc"}  |                 | {req_id:"xyz"}  |
  |                 |                 |                 |
  |<--shutdown_resp-|                 |<--plan_resp-----|
  | {req_id:"abc",  |                 | {req_id:"xyz",  |
  |  approve:true}  |                 |  approve:true}  |

共享状态机:  [pending] ──approve──> [approved]
            [pending] ──reject───> [rejected]
```

两个场景方向不同但结构完全一样：一方发带唯一 ID 的请求，另一方引用同一 ID 响应。

### (2) 请求追踪器——全局状态

```python
# 全局字典，用 request_id 做 key
shutdown_requests = {}   # {req_id: {target|from: name, status: "pending"|"approved"|"rejected"}}
plan_requests = {}        # {req_id: {from: name, plan: text, status: ...}}
_tracker_lock = threading.Lock()
```

这两个全局 dict 在 s09 的基础上加了一层**状态可观测性**——s09 发完消息就完了，不知道对方处理了没有。s10 通过 request_id 可以查到每笔请求的状态。

### (3) 关机协议——"请停下手里的活"

Leader 发起：

```python
def handle_shutdown_request(teammate: str) -> str:
    req_id = str(uuid.uuid4())[:8]
    with _tracker_lock:
        shutdown_requests[req_id] = {"target": teammate, "status": "pending"}
    BUS.send(
        "lead", teammate, "Please shut down gracefully.",
        "shutdown_request", {"request_id": req_id},
    )
    return f"Shutdown request {req_id} sent to '{teammate}' (status: pending)"
```

队友收到后，在 `_exec` 中处理：

```python
# 队友的 _exec 方法中
if tool_name == "shutdown_response":
    req_id = args["request_id"]
    approve = args["approve"]
    with _tracker_lock:
        if req_id in shutdown_requests:
            shutdown_requests[req_id]["status"] = "approved" if approve else "rejected"
    BUS.send(
        sender, "lead", args.get("reason", ""),
        "shutdown_response", {"request_id": req_id, "approve": approve},
    )
    return f"Shutdown {'approved' if approve else 'rejected'}"
```

队友的 loop 中检测自己的 shutdown_response 是否被批准：

```python
# 队友 _teammate_loop 的工具执行后
if block.name == "shutdown_response" and block.input.get("approve"):
    should_exit = True    # 批准 → 退出循环
# ...
# 循环结束时
member["status"] = "shutdown" if should_exit else "idle"
```

注意这里有一个微妙的设计：**队友不是被 Leader 直接关掉的。** Leader 发请求 → 队友自己决定 approve/reject → 如果 approve，队友自己的 loop 检测到并退出。是"请求退出"不是"强制终止"。

### (4) 计划审批——"干之前先让我看一眼"

方向上和关机相反——是队友向 Leader 提审批：

```python
# 队友 _exec 中
if tool_name == "plan_approval":
    plan_text = args.get("plan", "")
    req_id = str(uuid.uuid4())[:8]
    with _tracker_lock:
        plan_requests[req_id] = {"from": sender, "plan": plan_text, "status": "pending"}
    BUS.send(
        sender, "lead", plan_text, "plan_approval_response",
        {"request_id": req_id, "plan": plan_text},
    )
    return f"Plan submitted (request_id={req_id}). Waiting for lead approval."
```

Leader 审查：

```python
def handle_plan_review(request_id: str, approve: bool, feedback: str = "") -> str:
    with _tracker_lock:
        req = plan_requests.get(request_id)
    if not req:
        return f"Error: Unknown plan request_id '{request_id}'"
    with _tracker_lock:
        req["status"] = "approved" if approve else "rejected"
    BUS.send(
        "lead", req["from"], feedback, "plan_approval_response",
        {"request_id": request_id, "approve": approve, "feedback": feedback},
    )
    return f"Plan {req['status']} for '{req['from']}'"
```

这里的 `feedback` 参数允许 Leader 附加说明："计划可以，但别动数据库迁移部分"。

### (5) 工具膨胀——12 个工具

```python
TOOL_HANDLERS = {
    # 基础 (4):  bash, read_file, write_file, edit_file
    # 团队管理 (2): spawn_teammate, list_teammates
    # 通信 (3): send_message, read_inbox, broadcast
    # 协议 (3): shutdown_request, shutdown_response, plan_approval
}
```

从 s09 的 9 个涨到 12 个。注意 `shutdown_request` 和 `shutdown_response` Leader 和队友都有，但用途不同——Leader 用 `shutdown_request` 发请求，用 `shutdown_response` 查状态；队友用 `shutdown_request` 收请求，用 `shutdown_response` 回响应。同名工具在不同角色的 context 里含义不同。

### (6) s09 → s10 变化总结

| 组件 | s09 | s10 |
|------|-----|-----|
| 工具数 | 9 | 12 (+shutdown_req/resp +plan) |
| 关机 | 自然退出（线程结束） | 请求-响应握手 |
| 计划控制 | 无 | 队友提交 + Leader 审批 |
| 请求追踪 | 无 | request_id + 全局 dict |
| 状态机 | 仅 config.json 的 status | pending → approved/rejected FSM |

### (7) 运行

```
python agents/s10_team_protocols.py
```

推荐测试 prompt：

- `Spawn alice as a coder. Then request her shutdown.`
- `List teammates to see alice's status after shutdown approval`
- `Spawn bob with a risky refactoring task. Review and reject his plan.`

---

## 关键洞察

s10 引入了一个可复用的协议模式：**request_id + FSM + 收件箱**。关机协议和计划审批代码结构几乎一样，只有消息类型名不同。任何需要"请求→响应"的协作都可以套用这个模板——task assignment、resource lock、permission escalation——都是同一个 FSM。

另一个有趣的细节：关机是**协商不是命令**。Leader 不能强制 kill 队友的线程——它只能发 `shutdown_request`，队友自己决定是否 approve。这个设计和 Kubernetes 的 graceful shutdown 逻辑一致：发 SIGTERM 给进程，进程自己清理后退出。**harness 不替 Agent 做决定——这个原则跨了 10 个 session 从未改变。**

## 11. s11：自主 Agent——"模型自己找活干"

s09-s10 中队友只在被明确指派时才动。Leader 得给每个队友写 prompt——"alice 做 X，bob 做 Y"。任务看板上有 10 个未认领的任务，得手动分配。这不可扩展。

s11 的解法：**队友完成手头工作后，进入空闲轮询——自己扫描任务看板、自己认领、自己做。Leader 只是创建任务和 spawn 队友，bootstrap 之后就不需要持续分配了。**

### (1) WORK → IDLE → WORK 循环

s11 把队友的 loop 从线性改成了状态机：

```
+-------+
| spawn |
+---+---+
    |
    v
+-------+   tool_use     +-------+
| WORK  | <------------- |  LLM  |
+---+---+                +-------+
    |
    | stop_reason != tool_use 或调用了 idle 工具
    v
+--------+
|  IDLE  |  每 5 秒轮询，最多 60 秒
+---+----+
    |
    +---> check inbox → 有新消息? → 回到 WORK
    |
    +---> scan .tasks/ → 有未认领? → claim → 回到 WORK
    |
    +---> 60s 超时 → SHUTDOWN
```

```python
POLL_INTERVAL = 5   # 每 5 秒轮询一次
IDLE_TIMEOUT = 60   # 60 秒没活干就自动关机

def _loop(self, name: str, role: str, prompt: str):
    while True:
        # -- WORK PHASE: 标准 agent loop --
        for _ in range(50):
            inbox = BUS.read_inbox(name)
            for msg in inbox:
                if msg.get("type") == "shutdown_request":
                    self._set_status(name, "shutdown")
                    return
                messages.append(...)
            response = client.messages.create(...)
            # 执行工具...
            if idle_requested:
                break    # 模型说"我干完了"→ 进入 IDLE

        # -- IDLE PHASE: 轮询新工作 --
        self._set_status(name, "idle")
        resume = False
        polls = IDLE_TIMEOUT // max(POLL_INTERVAL, 1)   # 60//5 = 12 次
        for _ in range(polls):
            time.sleep(POLL_INTERVAL)
            # 检查 1: 收件箱有新消息?
            inbox = BUS.read_inbox(name)
            if inbox:
                for msg in inbox:
                    if msg.get("type") == "shutdown_request":
                        self._set_status(name, "shutdown")
                        return
                    messages.append(...)
                resume = True
                break
            # 检查 2: 任务看板有未认领任务?
            unclaimed = scan_unclaimed_tasks()
            if unclaimed:
                task = unclaimed[0]
                result = claim_task(task["id"], name)
                if result.startswith("Error:"):
                    continue    # 被别人抢了，继续看下一个
                # 注入身份（如果需要）和任务 prompt
                if len(messages) <= 3:
                    messages.insert(0, make_identity_block(name, role, team_name))
                messages.append({"role": "user", "content": task_prompt})
                resume = True
                break

        if not resume:
            self._set_status(name, "shutdown")
            return     # 超时，退出
        self._set_status(name, "working")
        # 回到 while True 顶部，重新进入 WORK PHASE
```

### (2) 任务看板扫描——`scan_unclaimed_tasks`

```python
def scan_unclaimed_tasks() -> list:
    TASKS_DIR.mkdir(exist_ok=True)
    unclaimed = []
    for f in sorted(TASKS_DIR.glob("task_*.json")):
        task = json.loads(f.read_text())
        if (task.get("status") == "pending"
                and not task.get("owner")         # ← 没人认领
                and not task.get("blockedBy")):   # ← 没有阻塞依赖
            unclaimed.append(task)
    return unclaimed
```

三个条件：pending 状态 + owner 为空 + blockedBy 为空。**被阻塞的任务不会被认领**——这保证了依赖顺序。

### (3) 任务认领——`claim_task`

```python
_claim_lock = threading.Lock()    # 全局锁，防止两个队友同时认领同一个任务

def claim_task(task_id: int, owner: str) -> str:
    with _claim_lock:
        path = TASKS_DIR / f"task_{task_id}.json"
        task = json.loads(path.read_text())
        if task.get("owner"):
            return f"Error: Task {task_id} has already been claimed by {task['owner']}"
        if task.get("status") != "pending":
            return f"Error: Task {task_id} cannot be claimed (status: {task['status']})"
        if task.get("blockedBy"):
            return f"Error: Task {task_id} is blocked"
        task["owner"] = owner
        task["status"] = "in_progress"
        path.write_text(json.dumps(task, indent=2))
    return f"Claimed task #{task_id} for {owner}"
```

`_claim_lock` 是关键——防止竞态条件。alice 和 bob 都在 IDLE 状态同时扫描，同时看到 task_3 未认领，同时尝试认领。`_claim_lock` 保证只有一个成功，另一个收到 `"Error: already claimed"`。

注意这里用的是锁 + 文件重读，而不是 compare-and-swap。这是安全的——因为 Python 线程虽然有 GIL，但文件 I/O 释放 GIL，`_claim_lock` 保证原子性。

### (4) 身份重注入——压缩后不忘自己是谁

s06 的 auto_compact 会把 messages 压缩成一条摘要。队友 loop 如果经历了一次压缩（messages 变得很短），就不知道自己是谁了——system prompt 被移到了 API 调用里，但压缩后的总结不会提及身份。

```python
def make_identity_block(name: str, role: str, team_name: str) -> dict:
    return {
        "role": "user",
        "content": f"<identity>You are '{name}', role: {role}, team: {team_name}. Continue your work.</identity>",
    }

# 在认领任务后，检查 messages 长度
if len(messages) <= 3:        # ← 3 条以下说明经历了压缩
    messages.insert(0, make_identity_block(name, role, team_name))
    messages.insert(1, {"role": "assistant", "content": f"I am {name}. Continuing."})
```

这是一个防御性设计：**system prompt 可能膨胀（不能被压缩），但身份信息可以以 user message 的形式存在于可压缩的上下文里。** 压缩后，harness 重新注入身份。

### (5) `idle` 工具——模型主动说"我干完了"

```python
{"name": "idle",
 "description": "Signal that you have no more work. Enters idle polling phase.",
 "input_schema": {"type": "object", "properties": {}}},
```

模型可以主动调 `idle` 表示当前任务完成，进入轮询等待新工作。Leader 的 handler：
```python
"idle": lambda **kw: "Lead does not idle.",   # Leader 不休眠
```

### (6) 新的斜杠命令

```python
if query.strip() == "/tasks":
    TASKS_DIR.mkdir(exist_ok=True)
    for f in sorted(TASKS_DIR.glob("task_*.json")):
        t = json.loads(f.read_text())
        marker = {"pending":"[ ]", "in_progress":"[>]", "completed":"[x]"}[t["status"]]
        owner = f" @{t['owner']}" if t.get("owner") else ""
        print(f"  {marker} #{t['id']}: {t['subject']}{owner}")
```

`/tasks` 命令直接查看任务看板，显示每个任务的状态和认领人。

### (7) s10 → s11 变化总结

| 组件 | s10 | s11 |
|------|-----|-----|
| 工具数 | 12 | 14 (+idle +claim_task) |
| 自治性 | 领导指派 | 自组织、自认领 |
| 队友 loop | 线性 50 轮后 idle | WORK/IDLE 状态机 |
| 任务认领 | 仅手动（通过 task_update） | 自动扫描 + 认领 |
| 竞态处理 | 无 | `_claim_lock` |
| 身份 | 仅 system prompt | + 压缩后重注入 |
| 空闲超时 | 无 | 60s → 自动关机 |

### (8) 运行

```
python agents/s11_autonomous_agents.py
```

推荐测试：
- `Create 3 tasks on the board, then spawn alice and bob. Watch them auto-claim.`
- `Spawn a coder teammate and let it find work from the task board itself`
- `/tasks` 查看带 owner 的任务看板
- `/team` 监控谁在工作、谁在空闲

---

## 关键洞察

s11 是团队协作模式的终态：**Leader 从"指挥官"退化为"创建者"——创建任务、spawn 队友，之后队友自组织。** 这个模式对应的是现实中的看板管理（Kanban）：PM 往 Backlog 里放任务，开发自己拉取。

`s07` 的 task DAG + s11 的自主认领 = 一个自驱动的项目引擎。任务之间的依赖（blockedBy）自动控制执行顺序，队友的空闲轮询自动分配工作，`_claim_lock` 防止重复认领。**唯一还需要 Leader 的是：创建任务、spawn 初始队友。** s12 将把最后这一步也自动化。

另外值得注意：`idle` 工具是模型主动声明"我没活了"的能力——它不是被动等待 stop_reason，而是主动告知 harness。这给 harness 提供了一个明确的信号"可以去找新工作了"，而不是猜测模型是否真的完成了。

## 12. s12：Worktree 任务隔离——"各干各的目录，永不碰撞"

s12 是整个 12 个 session 的终点，也是隔离机制的最高级。s09-s11 的 Agent 团队在**同一目录**下并行工作——alice 改 `config.py`，bob 也改 `config.py`，未提交的改动互相污染，谁也没法干净回滚。

s12 的解法：**给每个任务一个独立的 git worktree 目录。** 任务是控制面（做什么），worktree 是执行面（在哪做），二者用任务 ID 绑定。

### (1) 控制面 + 执行面

```
Control plane (.tasks/)            Execution plane (.worktrees/)
+------------------+               +------------------------+
| task_1.json      |               | auth-refactor/         |
|   status: in_progress  <------>  |   branch: wt/auth-refactor
|   worktree: "auth-refactor" |    |   task_id: 1           |
+------------------+               +------------------------+
| task_2.json      |               | ui-login/              |
|   status: pending     <------>   |   branch: wt/ui-login
|   worktree: "ui-login"      |    |   task_id: 2           |
+------------------+               +------------------------+
                                   |
                         .worktrees/
                           index.json    (worktree registry)
                           events.jsonl  (lifecycle audit log)
```

每个 worktree 是一个完整的 git checkout，有自己的分支（`wt/auth-refactor`），自己的文件系统副本。alice 在 `auth-refactor/` 里跑 pytest，bob 在 `ui-login/` 里跑，互不影响。

### (2) 仓库检测——s12 只在 git repo 里工作

```python
def detect_repo_root(cwd: Path) -> Path | None:
    try:
        r = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            cwd=cwd, capture_output=True, text=True, timeout=10,
        )
        if r.returncode != 0:
            return None
        root = Path(r.stdout.strip())
        return root if root.exists() else None
    except Exception:
        return None

REPO_ROOT = detect_repo_root(WORKDIR) or WORKDIR
```

如果当前目录不在 git repo 里，`REPO_ROOT` 回退到 `WORKDIR`（`git_available = False`），worktree 工具会返回错误。

### (3) WorktreeManager——目录隔离引擎

WorktreeManager 管理 git worktree 的完整生命周期：

```python
class WorktreeManager:
    def __init__(self, repo_root: Path, tasks: TaskManager, events: EventBus):
        self.repo_root = repo_root
        self.tasks = tasks
        self.events = events
        self.dir = repo_root / ".worktrees"
        self.index_path = self.dir / "index.json"
        self.git_available = self._is_git_repo()
```

**create**——创建隔离副本：

```python
def create(self, name: str, task_id: int = None, base_ref: str = "HEAD") -> str:
    self._validate_name(name)   # 1-40 字符，只允许字母数字 . _ -
    if self._find(name):
        raise ValueError(f"Worktree '{name}' already exists")
    if task_id is not None and not self.tasks.exists(task_id):
        raise ValueError(f"Task {task_id} not found")

    path = self.dir / name
    branch = f"wt/{name}"

    # 发事件
    self.events.emit("worktree.create.before", task={"id": task_id}, ...)

    # 实际执行 git worktree add
    self._run_git(["worktree", "add", "-b", branch, str(path), base_ref])

    # 写入 index
    entry = {"name": name, "path": str(path), "branch": branch,
             "task_id": task_id, "status": "active", "created_at": time.time()}
    idx["worktrees"].append(entry)
    self._save_index(idx)

    # 绑定到任务
    if task_id is not None:
        self.tasks.bind_worktree(task_id, name)   # ← 同时写两侧

    self.events.emit("worktree.create.after", ...)
```

`bind_worktree` 是双向操作——在 task JSON 里写上 `worktree: "auth-refactor"`，同时把任务状态从 pending 推进到 in_progress：

```python
def bind_worktree(self, task_id: int, worktree: str, owner: str = "") -> str:
    task = self._load(task_id)
    task["worktree"] = worktree
    if owner: task["owner"] = owner
    if task["status"] == "pending":
        task["status"] = "in_progress"
    self._save(task)
```

**run**——在隔离目录中执行命令：

```python
def run(self, name: str, command: str) -> str:
    wt = self._find(name)
    path = Path(wt["path"])
    r = subprocess.run(
        command, shell=True,
        cwd=path,            # ← 关键：cwd 指向 worktree 目录
        capture_output=True, text=True, timeout=300,
    )
    return (r.stdout + r.stderr).strip()[:50000]
```

这个 `cwd=path` 是 s12 区别于之前所有 session 的关键——命令运行在 isolatated 的目录副本中，改动不会污染主工作区。和 s01 `cwd=WORKDIR` 对照着看，能清楚看到隔离层级的一步步升级。

**remove**——拆除 worktree，同时可选完成绑定任务：

```python
def remove(self, name: str, force: bool = False, complete_task: bool = False) -> str:
    # 1. 先跑 git worktree remove
    self._run_git(["worktree", "remove", wt["path"]])

    # 2. 如果 complete_task=True，自动完成任务
    if complete_task and wt.get("task_id") is not None:
        task_id = wt["task_id"]
        self.tasks.update(task_id, status="completed")
        self.tasks.unbind_worktree(task_id)
        self.events.emit("task.completed", task={"id": task_id, ...}, ...)

    # 3. 更新 index（标记为 removed，不删除）
    for item in idx["worktrees"]:
        if item["name"] == name:
            item["status"] = "removed"
            item["removed_at"] = time.time()
```

一个调用完成"删除目录 + 完成任务 + 发事件 + 更新索引"。`force=True` 时即使有未提交改动也会强制删除。

**keep**——保留 worktree 但不删除：

```python
def keep(self, name: str) -> str:
    # 标记为 kept，不调 git worktree remove
    item["status"] = "kept"
    item["kept_at"] = time.time()
    self.events.emit("worktree.keep", ...)
```

两个收尾选项对应两种场景：改完了提交到主分支 → remove；想保留这个分支日后继续 → keep。

### (4) EventBus——生命周期可观测性

```python
class EventBus:
    def __init__(self, event_log_path: Path):
        self.path = event_log_path   # .worktrees/events.jsonl

    def emit(self, event: str, task: dict = None, worktree: dict = None, error: str = None):
        payload = {"event": event, "ts": time.time(),
                   "task": task or {}, "worktree": worktree or {}}
        if error: payload["error"] = error
        with self.path.open("a") as f:
            f.write(json.dumps(payload) + "\n")

    def list_recent(self, limit: int = 20) -> str:
        # 返回最近 N 条事件
```

8 种事件类型覆盖完整生命周期：
- `worktree.create.before` / `.after` / `.failed`
- `worktree.remove.before` / `.after` / `.failed`
- `worktree.keep`
- `task.completed`

每个事件的 JSON 行里都有 `ts` 时间戳、关联的 task 信息、worktree 状态。崩溃后可以用 `worktree_events` 工具查询事件流重建现场。

### (5) 状态机：两层联动

```
Task FSM:       pending  →  in_progress  →  completed
                     ↑          ↑               ↑
Worktree FSM:  absent   →   active     →  removed | kept
                     │          │               │
              bind_worktree  create      remove/keep
```

绑定的那一刻，任务从 pending 推进到 in_progress。拆除后，任务从 in_progress 推进到 completed（如果 `complete_task=True`）。

### (6) 工具全景——16 个工具

```python
# 基础 (4): bash, read_file, write_file, edit_file
# 任务 (5): task_create, task_list, task_get, task_update, task_bind_worktree
# Worktree (7): worktree_create, worktree_list, worktree_status,
#                worktree_run, worktree_keep, worktree_remove, worktree_events
```

16 个工具，是整个序列中的最大值。和 s01 的 1 个工具（bash）对比——12 个 session，从 1 到 16，工具的**数量增长就是 harness 能力的增长**。

### (7) s11 → s12 变化总结

| 组件 | s11 | s12 |
|------|-----|-----|
| 工具数 | 14 | **16** |
| 执行范围 | 共享目录 | 每任务独立 git worktree |
| 文件隔离 | 无（靠自觉） | 目录级硬隔离 |
| 恢复 | 仅 task JSON | task + worktree index + events |
| 收尾 | 任务完成 | 任务完成 + 显式 keep/remove |
| 可观测性 | 隐式 | EventBus + events.jsonl |

### (8) 运行

```
python agents/s12_worktree_task_isolation.py
```

（需要在一个 git repo 里运行）

推荐测试：
- `Create tasks for backend auth and frontend login page, then list tasks.`
- `Create worktree "auth-refactor" for task 1, then bind task 2 to "ui-login".`
- `Run "git status" in worktree "auth-refactor".`
- `Remove worktree "auth-refactor" with complete_task=true.`

---

## s12 关键洞察 & 全序列回顾

s12 是隔离的最后一级。从 s01 的"一个目录、一切共享"，到 s02 的路径沙箱，到 s04 的上下文隔离，到 s09 的线程隔离，到 s12 的**目录级隔离**——每个 Agent 在自己的 git worktree 目录里工作，文件互不干扰。

### 12 个 session 的全景图

```
Phase 1: The Loop           Phase 2: Planning & Knowledge
s01 ─ 核心循环              s03 ─ TodoWrite（内存规划）
s02 ─ 工具分发              s04 ─ Subagent（上下文隔离）
                            s05 ─ Skill 加载（按需知识）
                            s06 ─ 上下文压缩（策略遗忘）

Phase 3: Persistence        Phase 4: Teams
s07 ─ 任务系统（DAG+磁盘）   s09 ─ Agent 团队（收件箱通信）
s08 ─ 后台任务（线程异步）   s10 ─ 团队协议（请求-响应 FSM）
                            s11 ─ 自主 Agent（自组织认领）
                            s12 ─ Worktree 隔离（目录硬隔离）
```

### 三句贯穿始终的原则

1. **模型看管判断，harness 看管执行** — 模型决定"做什么"，harness 决定"能做什么"和"做完了怎么办"。从 s01 的 `run_bash` 到 s12 的 `worktree_remove`，这个原则没变过。

2. **加能力不加代码，改循环不碰核心** — 所有能力增量都是 `dispatch map 加一行 + TOOLS 数组加一个 schema`。核心循环从 s02 之后就稳定了，12 个 session 只是不断往同一条循环上叠机制。

3. **状态在对话之外** — s03 的 todo 在内存里会丢 → s07 的 task 在磁盘上持久 → s12 的 worktree index 和 events 提供完整的崩溃恢复。每一步都在把状态往外拉，拉到模型和对话之外的文件系统里。

# 三、s_full：全机制集成

`s_full.py` 不是第 13 个 session，它是 **s01-s11 的集成品**（s12 是独立教学，不包含在内）。源码注释写得很直白：

> *"Capstone implementation combining every mechanism from s01-s11. NOT a teaching session -- this is the 'put it all together' reference."*

独立 session 里，每个机制是**替换式演示**——s03 替换了 s02 的 todo 机制，s07 替换了 s03。s_full 是**同时运行所有机制**。36KB、740 行代码，用清晰的 `# === SECTION: xxx ===` 标签标注了每个模块的来源。

## 18 个 SECTION 标签——源码自带的映射表

```python
# === SECTION: base_tools ===              # s02 的基础工具函数
# === SECTION: todos (s03) ===             # s03 的 TodoManager
# === SECTION: subagent (s04) ===          # s04 的 run_subagent
# === SECTION: skills (s05) ===            # s05 的 SkillLoader
# === SECTION: compression (s06) ===       # s06 的 microcompact + auto_compact
# === SECTION: file_tasks (s07) ===        # s07 的 TaskManager（磁盘持久化）
# === SECTION: background (s08) ===        # s08 的 BackgroundManager
# === SECTION: messaging (s09) ===         # s09 的 MessageBus
# === SECTION: shutdown + plan tracking (s10) ===  # s10 协议追踪器
# === SECTION: team (s09/s11) ===          # s09+s11 融合的 TeammateManager（含自主认领）
# === SECTION: global_instances ===        # 所有模块实例化
# === SECTION: system_prompt ===           # 集成了 skill 列表的 system prompt
# === SECTION: tool_dispatch (s02) ===     # 23 个工具的 dispatch map
# === SECTION: agent_loop ===              # 集成循环——所有机制叠加
# === SECTION: repl ===                    # 外壳 + /compact /tasks /team /inbox 命令
```

## 全局实例化——一次性创建所有模块

```python
TODO = TodoManager()
SKILLS = SkillLoader(SKILLS_DIR)
TASK_MGR = TaskManager()
BG = BackgroundManager()
BUS = MessageBus()
TEAM = TeammateManager(BUS, TASK_MGR)
```

6 个全局实例，对应 6 个 session 的机制。注意 `TeammateManager` 的构造函数现在接受 `BUS` 和 `TASK_MGR`——s_full 里的 TeammateManager 不是 s09 的复制粘贴，它把自主认领（s11）和任务看板（s07）直接集成在一起了。队友在 idle 期间自动扫描 `TASK_MGR` 找未认领任务。

## 工具 dispatch map——23 个工具

```python
TOOL_HANDLERS = {
    # 基础 (4):  bash, read_file, write_file, edit_file
    # s03:       TodoWrite
    # s04:       task (subagent)
    # s05:       load_skill
    # s06:       compress
    # s08:       background_run, check_background
    # s07:       task_create, task_get, task_update, task_list
    # s09/s11:   spawn_teammate, list_teammates, send_message,
    #            read_inbox, broadcast, idle, claim_task
    # s10:       shutdown_request, plan_approval
}
```

23 个工具，是各独立 session 的并集。每个工具的 handler 写法完全一致——dispatch map 加一行。独立 session 的 handler 和 s_full 的 handler 几乎可以直接 diff 对比。

## 集成循环——所有机制叠加的时刻

这是 s_full 最核心的部分。每次 LLM 调用前，四条管线按序执行：

```python
def agent_loop(messages: list):
    rounds_without_todo = 0
    while True:
        # ── 管线 1: s06 压缩层 ──
        microcompact(messages)
        if estimate_tokens(messages) > TOKEN_THRESHOLD:
            print("[auto-compact triggered]")
            messages[:] = auto_compact(messages)

        # ── 管线 2: s08 后台任务通知 ──
        notifs = BG.drain()
        if notifs:
            txt = "\n".join(
                f"[bg:{n['task_id']}] {n['status']}: {n['result']}"
                for n in notifs
            )
            messages.append({
                "role": "user",
                "content": f"<background-results>\n{txt}\n</background-results>"
            })

        # ── 管线 3: s10 收件箱检查 ──
        inbox = BUS.read_inbox("lead")
        if inbox:
            messages.append({
                "role": "user",
                "content": f"<inbox>{json.dumps(inbox, indent=2)}</inbox>"
            })

        # ── LLM 调用（23 个工具）──
        response = client.messages.create(
            model=MODEL, system=SYSTEM, messages=messages,
            tools=TOOLS, max_tokens=8000,
        )
        messages.append({"role": "assistant", "content": response.content})
        if response.stop_reason != "tool_use":
            return

        # ── 工具执行 ──
        results = []
        used_todo = False
        manual_compress = False
        for block in response.content:
            if block.type == "tool_use":
                handler = TOOL_HANDLERS.get(block.name)
                output = handler(**block.input) if handler else f"Unknown tool: {block.name}"
                results.append({
                    "type": "tool_result", "tool_use_id": block.id,
                    "content": str(output)
                })
                if block.name == "TodoWrite":
                    used_todo = True

        # ── 管线 4: s03 nag 提醒（条件化：只在有未完成 todo 时才催）──
        rounds_without_todo = 0 if used_todo else rounds_without_todo + 1
        if TODO.has_open_items() and rounds_without_todo >= 3:
            results.append({
                "type": "text",
                "text": "<reminder>Update your todos.</reminder>"
            })

        messages.append({"role": "user", "content": results})
```

对比 s03 独立版的 nag 是**无条件注入**（每 3 轮必催），s_full 加了 `TODO.has_open_items()` 守卫——只有在 TodoWrite 里还有未完成任务时才催。这是一个集成时才暴露出来的优化：当用户没在用 todo 模式时，nag 是噪音。

## 独立 session vs s_full 对照

| 独立 session | 干什么 | s_full 中的位置 | 集成方式 |
|------|------|------|------|
| s01 loop | 核心 while True | `agent_loop()` 函数 | 外层容器，不变 |
| s02 dispatch | 工具映射 | `TOOL_HANDLERS` + `TOOLS` | 23 条目的大字典 |
| s03 TodoWrite | 内存规划 | `TodoManager` class | nag 条件化（有 open items 才催） |
| s04 subagent | 上下文隔离 | `run_subagent()` | 作为 `task` 工具，支持 `agent_type` 参数 |
| s05 skills | 按需知识 | `SkillLoader` class | 名字进 system prompt，`load_skill` 进 dispatch |
| s06 compact | 压缩 | `microcompact` + `auto_compact` | 每次 LLM 调用前置 |
| s07 tasks | 磁盘任务 | `TaskManager` class | 5 个 task 工具，`.tasks/` 目录 |
| s08 background | 后台线程 | `BackgroundManager` class | drain 通知 + 注入 |
| s09 teams | 多 Agent | `MessageBus` + `TeammateManager` | 收件箱注入 + spawn/msg/bcast |
| s10 protocols | 请求响应 | shutdown + plan 处理器 | request_id 追踪 + FSM |
| s11 autonomy | 自组织 | 集成在 `TeammateManager` 中 | idle cycle + auto-claim |

## 循环的不变结构

从 s01 到 s_full，骨架没变过：

```
s01 循环:   API 调用 → 执行工具 → 追加结果 → 重复

s_full 循环: microcompact → auto_compact(if needed)
              → drain bg → drain inbox
              → API 调用 → 执行工具
              → nag reminder → manual compact(if needed)
              → 重复
```

同一层 `while stop_reason == 'tool_use'` 循环，s01 只有 3 步，s_full 在前面挂了 4 个钩子（压缩 → 后台通知 → 收件箱 → LLM 调用），在后面挂了 2 个钩子（nag 提醒 → 手动压缩）。**骨架不变，只在入口和出口挂钩子。** 这就是整个项目最核心的架构美学——循环是平台，机制是插件。

## REPL 外壳

```python
if __name__ == "__main__":
    history = []
    while True:
        query = input("\033[36ms_full >> \033[0m")
        if query.strip().lower() in ("q", "exit", ""): break
        if query.strip() == "/compact": ...          # 手动压缩
        if query.strip() == "/tasks": ...            # 查看任务看板
        if query.strip() == "/team": ...             # 查看团队名册
        if query.strip() == "/inbox": ...            # 查看收件箱
        history.append({"role": "user", "content": query})
        agent_loop(history)
```

4 个 `/` 斜杠命令绕过 LLM 直接查询 harness 状态。和 s01 的 REPL 对比——s01 只有 `input()` + `agent_loop()`，s_full 多了 4 条本地控制通道。

## 关键洞察

s_full 展示的不是"如何写一个大 Agent"，而是**如何让 11 个小机制和平共处**。每个组件（TodoManager、SkillLoader、BackgroundManager、MessageBus、TaskManager、TeammateManager）是独立可测试的类，agent_loop 只是一条把它们串起来的装配线。

独立 session 就像乐高说明书——每一页只展示一个零件。s_full 是把所有零件拼在一起的结构图。你不需要从 s_full 开始学习——你会迷路。但当你理解了每个独立 session 后回看 s_full，740 行代码就像一本打开的手册，每一段都标注了出处。

# 四、真实 Claude Code vs s_full

s_full 是骨架，真实 Claude Code（以下简称 CC）是一头猛兽。先看一眼规模差距：

| | s_full.py | 真实 CC |
|------|------|------|
| 代码量 | 740 行 Python | 512,664 行 TypeScript |
| 文件数 | 1 | 1,884 个 .ts/.tsx |
| 语言/运行时 | Python | TypeScript / Bun |
| 工具数 | 23 | ~40+ |
| UI | `input()` + `print()` | React + Ink（终端渲染框架） |

## 架构骨架——完全一致

s_full 的核心循环和真实 CC 同源，只是 hooks 的数量不同：

```
s_full 循环:                    真实 CC 循环:
microcompact                     microcompact
auto_compact (if needed)         auto_compact (if needed)
drain background                 drain background
drain inbox                      drain inbox
                                 → run pre-tool hooks       ← 新增
                                 → check permissions        ← 新增
API call                         API call
tool dispatch                    tool dispatch (+ 并发控制)
                                 → run post-tool hooks      ← 新增
                                 → extract memories         ← 新增
nag reminder                     system-reminder 注入
manual compact                   /compact 命令
```

骨架没变——`while stop_reason == 'tool_use'` 还是那层循环。但 CC 在循环入口和出口各挂了更多钩子。

## 能力分层图

```
s_full (740 行)                    真实 CC (512K 行)
┌─────────────────┐          ┌──────────────────────────┐
│   Agent Loop    │          │     Agent Loop            │
│ + Tool Dispatch │          │   + Tool Dispatch         │
│ + TodoWrite     │          │   + TodoWrite             │
│ + Subagent      │          │   + Subagent (forkable)   │
│ + Skills        │          │   + Skills (17 bundled)   │
│ + Compact       │          │   + Compact (multi-level) │
│ + TaskManager   │          │   + Task System (6 types) │
│ + Background    │          │   + Background (remote)   │
│ + MessageBus    │          │   + Swarm (teammates)     │
│ + Team          │          │   + Coordinator Mode      │
│ + Protocols     │          │   + Protocols             │
├ ─ ─ ─ ─ ─ ─ ─ ─ ┤          ├──────────────────────────┤
│ (缺失)          │          │ + Permission Engine      │  ← 本章
│ (缺失)          │          │ + Memory System          │
│ (缺失)          │          │ + Hook System            │
│ (缺失)          │          │ + MCP Integration        │
│ (缺失)          │          │ + IDE Bridge             │
│ (缺失)          │          │ + Plugin System          │
│ (缺失)          │          │ + React/Ink UI           │
│ (缺失)          │          │ + OAuth / Enterprise     │
└─────────────────┘          └──────────────────────────┘
```

虚线以上：s_full 已覆盖。虚线以下：真实 CC 独有的系统。本章逐一拆解。

---

# 五、权限系统——从硬编码关键词到决策引擎

s_full 的"权限系统"只有 5 个硬编码关键词：

```python
dangerous = ["rm -rf /", "sudo", "shutdown", "reboot", "> /dev/"]
if any(d in command for d in dangerous):
    return "Error: Dangerous command blocked"
```

真实 CC 的权限系统是一个完整的**决策引擎**，核心文件近 10 个，超过 4000 行代码。它要回答的不是"这个命令危险吗"，而是"在当前上下文、当前权限模式、当前规则配置下，这个操作应该被允许、拒绝、还是询问用户？"

## 5.1 三级决策模型

每个工具调用需要经过三层裁决：

```
allow  ── 直接放行
deny   ── 直接拒绝（带理由）
ask    ── 弹出对话框问用户
```

不是二元的"危险/安全"，而是三元。`ask` 的存在意味着权限系统承认自己不知道——把决定权交给用户。

## 5.2 权限模式——用户主动选择的信任级别

```typescript
// 六种模式，从最严格到最宽松
type PermissionMode =
  | 'default'            // 正常询问
  | 'plan'               // 计划模式（只读，写操作需审批）
  | 'acceptEdits'        // 自动接受文件编辑
  | 'bypassPermissions'  // 跳过所有权限检查
  | 'dontAsk'            // 不问，直接拒绝（无头模式）
  | 'auto'               // AI 分类器自动决策（ant-only）
```

用户通过 `--permission-mode` 命令行参数或 `/permissions` 斜杠命令切换。不同模式对应不同信任场景——`bypassPermissions` 是你完全信任 Agent 时用的，`dontAsk` 是 CI/CD 无人值守时用的。

## 5.3 权限规则——用户可配置的精确控制

权限规则不是简单的关键词，而是结构化的匹配器。用户在 `settings.json` 里写：

```json
{
  "permissions": {
    "allow": [
      "Bash(npm run *)",      // 允许 npm run 开头的所有命令
      "Bash(git diff *)",     // 允许 git diff
      "WebFetch",             // 允许整个 WebFetch 工具
      "Read(MCP__github_*)", // 允许读取特定 MCP 服务器的资源
    ],
    "deny": [
      "Bash(npm publish *)",  // 永远禁止 npm publish
    ],
    "ask": [
      "Bash(curl *)",         // curl 任何地址都要先问
    ]
  }
}
```

规则解析支持三种匹配模式：

| 匹配模式 | 语法 | 示例 |
|------|------|------|
| 精确匹配 | `Bash(cd /tmp)` | 只匹配完全相同的命令（去除安全包装器后） |
| 前缀匹配 | `Bash(git *)` | 匹配 git 开头的所有命令 |
| 通配符 | `Bash(*install*)` | 匹配包含 install 的命令 |

**这不是正则，是 shell glob。** 规则格式是 `ToolName(content)`，括号内的 `*` 是 shell 风格的通配符。正则的 `.*` 在这里不适用。

解析逻辑在 `permissionRuleParser.ts` 中：先用括号匹配提取 `content` 体，然后判断 `content` 是否包含 `*` 来决定走前缀匹配还是精确匹配。`Bash(python3 -c ' *)` 能写是因为括号匹配先把 `python3 -c ' *'` 整段当作 content 提取出来，再在 bash 命令匹配时作为精确或通配符处理。

注意一个安全细节：**前缀匹配不会匹配复合命令。** `Bash(cd *)` 不会匹配 `cd /tmp && rm -rf /`。防止用户配置的 "允许 cd" 被串联命令绕过。

## 5.4 Bash 命令的语义安全分析

这是权限系统最精密的部分。不是简单的正则匹配，而是一层层剥离安全外壳。

**安全包装器剥离：**

用户在 `settings.json` 里配置了 `allow: ["Bash(cd *)"]`。但模型可能输出 `timeout 10 cd /tmp` 或 `nice -n 5 cd /tmp`。权限引擎需要先剥掉 `timeout`、`nice`、`nohup` 这些"无害包装器"，然后再做匹配：

```typescript
function stripSafeWrappers(command: string): string {
  // 剥掉 timeout, time, nice, stdbuf, nohup, env VAR=val ...
  // 确保 "timeout 10 cd /tmp" 被识别为 "cd /tmp"
}
```

**环境变量剥离：**

对于 deny 规则，权限引擎会**激进地**剥离所有前置环境变量：

```
DENY_VAR=malicious curl evil.com  →  被识别为 curl evil.com  ← 拒绝
```

但 allow 规则只剥离安全的环境变量，保留有意义的：

```
ALLOW: FOO=bar npm test  →  识别为 npm test  ← 允许
```

如果 allow 规则也激进剥离所有环境变量，攻击者可以通过设置 `PATH=~/malicious` 来绕过 allow 规则执行 `/tmp/malicious/npm test`。allow 保留环境变量意味着一层额外防御。

**复合命令检测：**

```typescript
// 包含 && || ; 的命令不会匹配前缀规则
if (containsCommandSeparators(command)) {
  // 跳过前缀匹配，只走精确匹配
}
```

`Bash(git add *)` 这条 allow 规则不会匹配 `git add . && rm -rf /`。

**路径安全约束：**

文件操作受工作目录限制。权限系统维护一个 `additionalWorkingDirectories` 列表，文件读写只能发生在这些目录内。即使模型绕过了工具层的 `safe_path`，权限层还有第二道防线。

**Sed 约束：**

特别处理 sed 命令的危险操作——sed 的 `-i` 参数可以原地修改任意文件，权限引擎单独拦截这类操作。

## 5.5 完整的决策流水线

```
useCanUseTool()  hook（React 层入口）
  │
  ▼
hasPermissionsToUseTool()  权限引擎入口
  │
  ├─ Step 1a: 有工具级 deny 规则？           → deny（直接拒绝）
  ├─ Step 1b: 有工具级 ask 规则？            → ask（但如果开了沙箱且命令可沙箱化，穿透）
  ├─ Step 1c: tool.checkPermissions()        → 工具自己的权限逻辑
  │    └─ bashPermissions.ts:                ← Bash 工具的 ~1350 行权限实现
  │         ├─ 精确匹配: deny > ask > allow
  │         ├─ 前缀匹配: 剥包装器 → deny > ask > allow
  │         ├─ 路径约束检查
  │         ├─ 精确 allow？→ allow
  │         ├─ 前缀 allow？→ allow
  │         ├─ Sed 约束检查
  │         ├─ 模式检查
  │         └─ 只读命令？→ 自动 allow
  ├─ Step 1d: 工具返回 deny？                → deny
  ├─ Step 1e: 工具要求用户交互？              → ask（不可绕过）
  ├─ Step 1f-g: 内容级规则 / 安全检查？       → 尊重规则结果
  │
  ├─ Step 2a: bypassPermissions 模式？        → allow（全跳过）
  ├─ Step 2b: 工具有全局 allow 规则？         → allow
  │
  └─ Step 3: 穿透 → ask                        → 弹对话框

  ↓ 后处理 ↓
  dontAsk 模式: ask → deny
  auto 模式:    acceptEdits 快速路径
                → 安全工具白名单
                → AI 分类器（YOLO）
                → 拒绝追踪（超限回退到询问）
  无头 Agent:   → PermissionRequest hooks → 无 hook 决定则 deny
```

## 5.6 安全路径检查——绕过免疫

有几种安全路径的 `ask` 决策是**不可绕过**的，即使开了 `bypassPermissions`：

```typescript
const SAFETY_PATHS = [
  '.git/',        // 修改 git 内部文件
  '.claude/',     // 修改 Claude 配置
  '.vscode/',     // 修改 IDE 配置
  'shell config', // 修改 .bashrc / .zshrc
]
```

这不是配置项，是硬编码在权限引擎里的。操作这些路径时，即使 `bypassPermissions` 模式也会降级为 `ask`。防止 Agent 被诱导修改自己的安全配置或版本控制系统。

## 5.7 Auto 模式的 AI 分类器——"让 AI 审 AI"

`auto` 模式（ant-only）引入了一个元层次：用一个 AI 查询来判断另一个 AI 的操作是否安全。

```
模型想执行 "git push origin main"
  │
  ▼
权限引擎 → auto 模式
  │
  ├─ acceptEdits 快速路径？（编辑操作 → 自动允许）
  ├─ 安全白名单？（bash read/grep/find → 自动允许）
  ├─ 都未命中 → AI 分类器
  │    │
  │    └─ 侧查询 Sonnet:
  │        "评估这个操作：git push origin main
  │         上下文：用户正在重构 auth 模块
  │         意图：将更改推送到远程"
  │         → { safe: true, confidence: 0.95 }
  │              │
  │              ▼
  │         allow（高置信度 → 自动允许）
  │
  └─ 分类器不可用？→ fail-closed 或 fail-open
       （用 GrowthBook 标志控制）
```

拒绝追踪：如果 AI 分类器拒绝了太多次，系统会回退到正常的 `ask` 模式弹对话框，不再替用户做决定。防止分类器误判导致 Agent 卡住。

## 5.8 权限规则来源优先级

规则不是只来自一个地方。权限引擎合并多个来源，按优先级排序：

```
CLI 参数 --permission-allow     最高优先级（用户当场明确指定）
session 规则                    会话级临时规则
local settings.json             .claude/settings.local.json（不提交 git）
project settings.json           .claude/settings.json（项目级，共享）
user settings.json              ~/.claude/settings.json（全局）
policy settings                 企业 IT 管理员推送的规则（不可覆盖）
```

`policySettings` 是一个特别的设计——企业管理员可以配置强制规则，用户不能在自己的 `settings.json` 里覆盖。比如强制 `deny: ["Bash(sudo *)", "Bash(rm *)"]`。

## 5.9 和 s_full 的对比

| 维度 | s_full | 真实 CC |
|------|------|------|
| 决策模型 | 二元（通过/拒绝） | 三元（allow/deny/ask） |
| 规则粒度 | 5 个硬编码字符串 | 工具级 + 内容级 + 前缀/通配符 |
| Bash 分析 | `'sudo' in command` | 包装器剥离 + 环境变量剥离 + 复合命令检测 + Sed 约束 + 路径约束 |
| 用户控制 | 无 | 6 种权限模式 + 自定义规则 + `/permissions` 命令 |
| 安全检查 | 无 | bypass-immune 安全路径 + 拒绝追踪 |
| 无头模式 | 不适用 | dontAsk 模式 + PermissionRequest hooks |
| 规则来源 | 1（代码） | 7 个来源，优先级排序 |
| 可扩展性 | 改 Python 代码 | 改 JSON 配置文件 |

---

## 核心洞察

权限系统不是"阻止危险命令"——那是最低层次的目标。真正的权限引擎是一个**策略框架**：你在定义的不是"什么不能做"（黑名单），而是"在不同信任级别下，谁可以决定什么操作被允许"。

s_full 的 `dangerous = ["rm -rf /"]` 把决策权给了代码作者。真实 CC 把决策权给了**用户 + 管理员 + AI 分类器 + 权限规则**四方协商。这就是从 "dangerous list" 到 "permission engine" 的跨越：**不是判断对错，是判断谁有资格判断对错。**

# 六、记忆系统——从"对话即忘"到"跨会话记忆"

s_full 不持久化任何对话记忆。进程退出，一切清零。真实 CC 有一套完整的**持久化记忆系统**——对话结束了，但关于你和项目的信息保留下来，下次对话自动加载。

## 6.1 四种记忆类型

CC 的记忆系统不是"记住一切"，而是精细分类：

| 类型 | 用途 | 示例 |
|------|------|------|
| **user** | 你是谁，怎么和你协作 | "用户是数据科学家，偏好 Python 而非 R" |
| **project** | 项目背景、目标、进度 | "周五之前冻结所有非关键合并" |
| **feedback** | 你给的纠正和确认 | "别 mock 数据库，上次因为 mock 生产事故" |
| **reference** | 外部系统指针 | "pipeline bug 在 Linear 项目 INGEST 里跟踪" |

每种类型有自己的一套**保存规则**和**何时加载**的策略。memory 不只是"存东西"，而是"知道什么该存、什么不该存"。

## 6.2 什么不该存

系统 prompt 明确列出了**不应保存**的内容：

```
- 代码模式、命名约定、架构 → 看当前代码就行
- git 历史、最近变更 → git log / git blame 才是权威
- 调试方案、修复 recipe → 修正在代码里，commit message 有上下文
- CLAUDE.md 里已有的内容 → 别重复
- 临时任务细节 → 进程中状态、当前对话上下文
```

这套排除规则保证记忆库是**信号**而不是**噪音**。没有这些规则，记忆库会变成一个不可维护的日志 dump。

## 6.3 记忆的存储模型——文件即数据库

```
~/.claude/projects/<sanitized-git-root>/memory/
  ├── MEMORY.md              ← 索引文件（总是加载）
  ├── user_role.md            ← 用户角色记忆
  ├── feedback_testing.md     ← 关于测试的反馈
  ├── project_deadline.md     ← 项目截止日期
  └── reference_linear.md     ← Linear 项目指针
```

不是 SQLite，不是 Redis，是 **Markdown 文件 + YAML frontmatter**。每个记忆是一个独立的 `.md` 文件：

```markdown
---
name: feedback-testing
description: 测试策略反馈
type: feedback
---

集成测试必须用真实数据库，别 mock。
**Why:** 上次 mock 导致生产迁移事故
**How to apply:** 任何涉及数据库的测试都要连真实 DB
```

`MEMORY.md` 是索引——每条一行，~150 字以内：

```markdown
- [Testing feedback](feedback_testing.md) — 集成测试必须用真实数据库
- [PR freeze](project_deadline.md) — 周五前冻结所有非关键合并
```

索引始终加载到上下文，正文按需加载。索引有硬上限：200 行、25KB——防止记忆过多撑爆 system prompt。

## 6.4 记忆的两种创建路径

**路径 A：模型主动写入（主 Agent）**

模型在对话中被触发（或自发）写记忆。两步操作：

1. 创建/更新 `user_role.md`（写 YAML frontmatter + 正文）
2. 在 `MEMORY.md` 里加一行索引

system prompt 里有完整的写入指南，模型知道什么时候该写、写什么格式。用户也可以说"记住这个"，模型照做。

**路径 B：后台自动提取（AutoMem Agent）**

每次对话结束后，一个**独立的 forked Agent**（共享父 Agent 的 prompt cache，但有自己的消息列表）被 fire-and-forget 启动。它的工作是：

1. 分析最近几轮对话
2. 判断是否有值得永久保存的信息
3. 如有，写/更新记忆文件
4. 更新 `MEMORY.md` 索引

关键设计：如果主 Agent **已经**在对话中手动写了记忆文件，自动提取会**跳过**——避免重复。通过 `hasMemoryWritesSince()` 检查文件修改时间戳实现。

```typescript
// 自动提取 Agent 的工具权限严格受限
// 只开放：只读 Bash + Read/Grep/Glob + 仅 memory 目录的 Edit/Write
function createAutoMemCanUseTool(memoryDir: string): CanUseToolFn {
  // Bash: 只读（不允许修改文件）
  // Write/Edit: 只允许 memoryDir 路径
}
```

自动提取 Agent 开了 5 轮的最大限制——不需要多轮，看一眼最近对话就能判断。

## 6.5 记忆检索——"什么时候该回忆"

每轮对话开始时，CC 做一次异步预取（prefetch）：

```
用户输入
  │
  ▼
startRelevantMemoryPrefetch()
  │
  ├─ 扫描 memory/ 下所有 .md 文件的前 30 行（frontmatter 范围）
  │    └─ 提取 description + type，生成"记忆清单"
  │
  ├─ 用 Sonnet 做侧查询（side query）：
  │    "用户问的是：'重构 auth 模块的 token 处理'
  │     可用记忆：
  │       1. [project] auth middleware rewrite 由合规要求驱动
  │       2. [feedback] 不要 mock 数据库
  │       3. [reference] 监控看板在 grafana.internal/d/api-latency
  │     选最多 5 条相关的"
  │
  ├─ Sonnet 返回：["1", "2"]  ← 选中的记忆
  │
  └─ 读取完整内容，作为 <system-reminder> 注入下一轮消息
```

Sonnet 侧查询是**非阻塞**的——和主模型并行运行。等主模型下一轮 API 调用时，记忆已经准备好插入了。

注入格式：

```
<system-reminder>
Memory (saved 3 days ago): feedback_testing.md:
集成测试必须用真实数据库，别 mock。
**Why:** 上次 mock 导致生产迁移事故
</system-reminder>
```

注意 `(saved 3 days ago)` 这个时间戳：如果记忆超过 1 天，系统还会追加一句话："记忆是 N 天前的观察，不是实时状态。如果和当前代码冲突，相信代码。"

## 6.6 去重——别重复加载

记忆系统在三个层面去重：

1. **本会话内已加载的不重复** — `collectSurfacedMemories()` 追踪哪些文件已被注入过
2. **模型自己刚读过的不重复** — `filterDuplicateMemoryAttachments()` 检查本轮 FileRead 操作，如果模型已经读了 `project_deadline.md`，就跳过
3. **和现有上下文冲突的不重复** — 记忆文件的内容和 messages 里已有的信息比较，太相似的不注入

## 6.7 安全约束

记忆系统有自己的安全防线：

- **路径验证** — `validateMemoryPath()` 拒绝 `..`、绝对路径、Windows 盘符、空字节。攻击者不能通过构造恶意项目路径让 CC 写到 `~/.ssh/`
- **设置来源限制** — 记忆目录路径的设置**不接受 project settings**。`.claude/settings.json`（项目级）不能重定向记忆写到恶意目录
- **写 carve-out** — 文件记录权限对记忆目录有写 carve-out，但只在非 Cowork 模式

## 6.8 和 s_full 的对比

| 维度 | s_full | 真实 CC |
|------|------|------|
| 记忆存储 | 无（进程退出即清零） | 文件系统持久化（`~/.claude/projects/`） |
| 记忆类型 | 无 | 四种：user/project/feedback/reference |
| 创建方式 | — | 主 Agent 手动 + AutoMem 自动提取 |
| 检索方式 | — | Sonnet 侧查询（最多选 5 条） |
| 注入位置 | — | `<system-reminder>` 包装的 user 消息 |
| 冲突处理 | — | 去重 + 时间戳 + "可能过时"警告 |
| 安全约束 | — | 路径验证 + 设置来源限制 |

---

## 核心洞察

记忆系统的设计哲学是：**不是"记住一切"，是"在正确的时刻回忆起正确的事"。** 四种类型的分类、严格的排除规则、Sonnet 侧查询的按需检索、去重和时间戳衰减——所有机制都在精确控制"多少记忆进入上下文"。

这里有一个巧妙的博弈：记忆系统为了让模型记住重要信息，**首先得让模型忘记不重要的事**（通过排除规则），然后才在每轮对话开始时**悄悄塞入相关信息**（`<system-reminder>` 不炸裂 prompt cache）。记忆不是"更大的 context window"的替代品——它是"更聪明的 context window"的构建方式。

# 七、Hook 系统——把 Agent 变成可编程平台

s_full 没有 hooks。真实 CC 的 hook 系统是整个架构中**最灵活、最危险的扩展点**——它允许外部代码在 Agent 循环的 28 个关键时刻介入、修改、甚至阻止操作。

## 7.1 28 个 Hook 事件——Agent 循环的"切口"

Hook 系统在 Agent 生命周期的每个节点都开了口：

| 类别 | 事件 | 触发时机 |
|------|------|------|
| **生命周期** | `SessionStart`, `Setup`, `SessionEnd` | 会话开始/设置/结束 |
| **工具执行** | `PreToolUse`, `PostToolUse`, `PostToolUseFailure` | 工具调前/调后/失败 |
| **对话** | `UserPromptSubmit`, `Stop`, `StopFailure` | 用户输入/Agent 停止/停止失败 |
| **权限** | `PermissionRequest`, `PermissionDenied` | 权限申请/拒绝 |
| **压缩** | `PreCompact`, `PostCompact` | 上下文压缩前后 |
| **Subagent** | `SubagentStart`, `SubagentStop` | 子 Agent 启动/停止 |
| **协作** | `TeammateIdle`, `TaskCreated`, `TaskCompleted` | 队友空闲/任务创建/任务完成 |
| **MCP** | `Elicitation`, `ElicitationResult` | MCP 询问/结果 |
| **通知** | `Notification` | 系统通知 |
| **配置** | `ConfigChange` | 配置变更 |
| **Worktree** | `WorktreeCreate`, `WorktreeRemove` | Worktree 创建/删除 |
| **文件** | `CwdChanged`, `FileChanged` | 目录切换/文件变更 |
| **指令** | `InstructionsLoaded` | 指令加载完成 |

不在代码里硬编码"遇到 X 就做 Y"——而是把 X 时刻暴露出来，让用户挂自己的逻辑。

## 7.2 四种 Hook 执行器——不同的"外部逻辑"

用户可以为每个 hook 事件配置四种类型的执行器：

| 类型 | 执行方式 | 适用场景 | 延迟 |
|------|------|------|------|
| **command** | 启动 shell 进程，JSON 走 stdin，结果读 stdout | 本地脚本、lint、格式化、通知 | 快（进程启动） |
| **prompt** | 单轮 LLM 查询（默认 Haiku） | 语义判断：这个命令危险吗？ | 中（API 调用） |
| **agent** | 多轮 LLM Agent（最多 50 轮，有完整工具） | 复杂决策：审查整个 PR 是否符合规范 | 慢（可能数轮） |
| **http** | POST JSON 到外部 URL | 触发 CI/CD、发 Slack、调 webhook | 取决于网络 |

### Command hook 示例

在 `.claude/settings.json` 里配置：

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash(git push *)",
        "command": "node scripts/check-branch-protection.js",
        "timeout": 5000
      }
    ]
  }
}
```

Agent 要执行 `git push origin main` 时，CC 先启动 `check-branch-protection.js`，把工具调用的 JSON 通过 stdin 传给它：

```json
{
  "hook_event_name": "PreToolUse",
  "tool_name": "Bash",
  "tool_input": {"command": "git push origin main"}
}
```

脚本 exit 0 → 放行。exit 2 → 阻止，stderr 给模型看原因。其他非零退出码 → 不阻止，stderr 只给用户看。

如果设置了 `"async": true`，进程启动后立即返回，不等待结果。适合发通知、写日志等不阻塞的场景。

### Prompt hook 示例

```json
{
  "matcher": "Bash",
  "prompt": "Is this bash command safe to execute in a production environment? Command: $ARGUMENTS",
  "model": "claude-haiku-4-5",
  "timeout": 10000
}
```

`$ARGUMENTS` 会被替换为完整的工具调用 JSON。模型返回 `{"ok": true}` 或 `{"ok": false, "reason": "会在生产环境重启服务"}`。默认用 Haiku——便宜、快、对二元判断足够用。

### Agent hook 示例（最强）

```json
{
  "matcher": "Write|Edit",
  "agent": "Review this file change for security issues, SQL injection, XSS vulnerabilities. The proposed change is: $ARGUMENTS",
  "timeout": 60000
}
```

Agent hook 有完整的工具访问权限——它能读文件、搜代码、跑 bash。一个合法的 50 轮 Agent 循环被启动，用 `SyntheticOutputTool` 强制输出结构化 JSON `{ok: boolean, reason?: string}`。

## 7.3 Hook 的权限和信任模型

不是任何 hook 都能在任何地方跑。CC 有多层信任控制：

**来源过滤：**

```typescript
// Hook 配置有多个来源，按优先级排序：
CLI 参数 > session > settings.local > settings.json > user settings > policy > plugin
```

**`allowManagedHooksOnly`：** 企业管理员可以设置此标志，禁止所有非 policy 来源的 hook。防止恶意 repo 通过 `.claude/settings.json` 注入恶意 hook。

**工作区信任检查：** 在交互模式下，所有 hook 要求工作区被信任。防止 `git clone` 一个项目后，项目自带的 hook 自动执行。

**HTTP hook 的 SSRF 保护：**

```typescript
// ssrfGuard.ts
function ssrfGuardedLookup(url: string) {
  const ip = await dns.resolve(hostname)
  // 阻止: 私有 IP + 链路本地地址
  // 允许: 公网 IP + localhost（本地开发用）
  if (isPrivateIP(ip) && !isLoopback(ip)) {
    throw new Error("SSRF blocked")
  }
}
```

HTTP hook 还有 URL 白名单机制——只有 `allowedHttpHookUrls` 中配置的 URL 模式才能接受 POST。

## 7.4 Hook JSON 输出协议——双向通信

Hook 不只是"允许或拒绝"——它可以通过 stdout 返回丰富的结构化输出：

```typescript
// PreToolUse 的 hook 输出可以：
{
  "continue": false,              // 阻止工具执行
  "stopReason": "Branch protected",  // 给模型的理由
  "decision": "block",            // 权限决定
  "systemMessage": "...",         // 给用户看的警告
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",   // 覆盖权限决定
    "updatedInput": {               // 修改工具输入！
      "command": "git push --force-with-lease origin main"
    },
    "additionalContext": "..."       // 注入额外上下文
  }
}

// PostToolUse 可以：
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "updatedMCPToolOutput": "..."    // 替换 MCP 工具输出
  }
}

// SessionStart 可以：
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "initialUserMessage": "今天的任务是...",  // 注入第一条用户消息
    "watchPaths": ["src/auth/**"]       // 动态添加文件监控
  }
}

// PermissionDenied 可以：
{
  "hookSpecificOutput": {
    "hookEventName": "PermissionDenied",
    "retry": true                      // 允许模型重试
  }
}
```

最强大的能力是 `updatedInput`——hook 可以**修改工具输入**。`git push origin main` 被 hook 改成 `git push --force-with-lease origin main`，模型不知道发生了替换。

## 7.5 异步 Hook 管理

有些 hook 需要长时间运行但不阻塞 Agent：

```json
{
  "command": "npm run long-running-check",
  "async": true,
  "asyncRewake": true,
  "asyncTimeout": 30000
}
```

- `async: true` — 启动后立即返回，不等待
- `asyncRewake: true` — hook 退出时如果是 exit 2（阻止），会注入一条任务通知唤醒 Agent
- `asyncTimeout: 30000` — 30 秒后强制清理

`AsyncHookRegistry` 跟踪所有后台 hook 进程，定期轮询检查完成状态。SessionEnd 时强制清理所有残留进程。

## 7.6 和 s_full 的对比

| 维度 | s_full | 真实 CC |
|------|------|------|
| Hook 系统 | 无 | 28 个事件 + 4 种执行器 |
| 扩展方式 | 改 Python 源码 | 写 JSON 配置 + 外部脚本 |
| 工具输入修改 | 不可 | `updatedInput`（hook 可改模型输出） |
| 异步执行 | s08 的 background_run | `async: true` + AsyncHookRegistry |
| 安全 | — | 来源过滤 + SSRF 保护 + 工作区信任 |
| 外部集成 | 无 | HTTP POST + shell + prompt + agent |

---

## 核心洞察

Hook 系统定义了"用户代码和 Agent 循环之间的界面"。它和之前各 session 的架构增量有本质区别：

- s01-s12 的机制是**内置的**——harness 作者决定 Agent 能做什么
- Hook 系统是**开放的**——用户决定 Agent 行为什么时候被拦截、修改、增强

Hook 不是调用外部工具——是**把 Agent 循环本身变成了可编程的框架**。`updatedInput` 的能力特别值得注意：hook 可以在模型不知道的情况下修改工具输入，这意味着**安全策略可以和 Agent 逻辑完全解耦**——模型的 prompt 不需要知道"生产环境禁止 force push"，hook 层的 `PreToolUse` 命令会拦截它。这条边界是整个架构中最锋利的一条线：一边是模型的世界（文本生成），一边是 harness 的世界（策略执行）。

# 八、MCP 集成——把外部工具变成 Agent 的原生能力

s_full 的工具全是 Python 函数。真实 CC 可以通过 MCP（Model Context Protocol）接入外部工具，包括第三方服务、数据库、API——不用写一行 TypeScript。

## 8.1 八种传输协议

MCP 服务器可以通过八种传输方式和 CC 通信：

| 传输 | 适用场景 | 特点 |
|------|------|------|
| `stdio` | 本地命令行工具 | 启动子进程，stdin/stdout 通信 |
| `sse` | 远程 HTTP 服务 | Server-Sent Events，可选 OAuth |
| `http` | 流式 HTTP API | `StreamableHTTP` 协议 |
| `ws` | 双向实时通信 | WebSocket |
| `sdk` | 进程内 SDK | 直接内存调用，无序列化开销 |
| `claudeai-proxy` | claude.ai 代理 | 通过 claude.ai OAuth 网关中继 |
| `sse-ide` / `ws-ide` | IDE 内部 | VS Code / JetBrains 内嵌 MCP 服务器 |

一个 MCP 服务器可以同时被多种传输接入。CC 根据 `mcpServers` 配置中的 `type` 选择传输。

## 8.2 连接生命周期

```
用户启动 CC / 修改 MCP 配置
  │
  ▼
MCPConnectionManager 读取配置
  │
  ├─ connectToServer(serverConfig)
  │    ├─ 创建 Transport（按 type）
  │    ├─ new Client("claude-code", { capabilities: [roots, elicitation] })
  │    ├─ client.connect(transport) ← 竞态 30s 超时
  │    └─ 成功后获取 server info + instructions
  │
  ├─ fetchToolsForClient() → tools/list
  │    └─ 每个 MCP 工具生成一个 CC Tool：
  │         name: "mcp__serverName__toolName"
  │         checkPermissions: 默认 passthrough
  │         annotations: { readOnlyHint, destructiveHint, openWorldHint }
  │
  ├─ fetchCommandsForClient() → prompts/list → 转成 slash commands
  └─ fetchResourcesForClient() → resources/list
```

连接断开时自动重连（指数退避 1s-30s，最多 5 次）。如果是会话过期（404 + JSON-RPC -32001），清理缓存后重连。

## 8.3 工具调用链路

```
模型: 调 mcp__github__search_repos({query: "claude code"})
  │
  ▼
CC Tool dispatch → MCPTool.call()
  │
  ├─ ensureConnectedClient()    ← 如果缓存过期，自动重连
  ├─ callMCPToolWithUrlElicitationRetry()
  │    └─ client.callTool(
  │         { name: "search_repos",
  │           arguments: {query: "claude code"},
  │           _meta: { progressToken }
  │         },
  │         CallToolResultSchema,
  │         { timeout: ~27.8h }
  │       )
  │
  ├─ 超时？→ MCP_TOOL_TIMEOUT 环境变量（默认几乎无限）
  ├─ URL Elicitation？→ 重试最多 3 次（每次让用户确认 URL）
  ├─ 401？→ McpAuthError → 提示用户重新认证
  └─ 会话过期？→ McpSessionExpiredError → 清缓存 + 重试一次
  │
  ▼
结果 → processMCPResult → transformMCPResult
  │
  ├─ text 内容 → 直接返回字符串
  ├─ image/audio → 作为 base64 content block 返回
  ├─ resource → 持久化到文件（大 output 走磁盘）
  └─ structuredContent → JSON 原样返回
```

## 8.4 权限处理

MCP 工具的权限模式是 `passthrough`——让主权限引擎处理：

```typescript
// MCPTool.checkPermissions() 基类实现
checkPermissions() {
  return { behavior: 'passthrough' }
  // 建议用户配置: allow: ["mcp__github__*"]
}
```

用户可配置：
```json
{
  "permissions": {
    "allow": [
      "mcp__filesystem__*",        // 允许整个 MCP 服务器的所有工具
      "mcp__github__search_*"      // 只允许 github 服务器的 search_ 开头工具
    ],
    "deny": [
      "mcp__database__drop_table"  // 禁止特定危险操作
    ]
  }
}
```

`annotations` 映射为 CC 的并发安全和破坏性标志：`readOnlyHint → isConcurrencySafe`、`destructiveHint → isDestructive`、`openWorldHint → isOpenWorld`。

## 8.5 和 s_full 的对比

| 维度 | s_full | 真实 CC |
|------|------|------|
| 工具来源 | 硬编码 Python 函数 | 硬编码 + MCP 动态发现 |
| 扩展工具 | 改 dispatch map + 加函数 | 配置 JSON + 启动外部服务器 |
| 传输层 | subprocess (bash) | 8 种协议（stdio/sse/http/ws/sdk/...） |
| 工具命名 | `"bash"`, `"read_file"` | `mcp__{server}__{tool}` 命名空间隔离 |
| 权限 | 无 | 服务器级 / 工具级 / 前缀通配符 |
| 重连 | 不适用 | 指数退避 + 会话过期检测 |

---

## 核心洞察

MCP 是 CC 工具系统的"USB 接口"——外部工具的接入协议。CC 本身写了 ~40 个核心工具（bash、read、write、edit……），但剩下的能力通过 MCP 让第三方提供。命名空间 `mcp__serverName__toolName` 的设计隔离了不同 MCP 服务器的工具，避免冲突。

MCP 在架构上把"工具发现"和"工具执行"解耦了——MCPConnectionManager 负责发现（启动时拉取工具列表），权限引擎负责裁决（每次调前检查），MCPTool.call() 负责传输（HTTP / stdio / WebSocket）。三层独立，和 s02 的 `TOOL_HANDLERS` + `TOOLS` 双数组模式在概念上同源。

# 九、任务系统——从 JSON 文件到 7 种任务类型

s07 的 TaskManager 是磁盘上的 JSON。真实 CC 的任务系统有 7 种具体类型，统一在同一个注册/更新/驱逐框架下管理。

## 9.1 7 种任务类型

| 类型 | 类 | 用途 |
|------|------|------|
| `local_bash` | LocalShellTask | 后台 shell 命令（s08 的 background_run 的真实版本） |
| `local_agent` | LocalAgentTask | AgentTool 创建的子 Agent（s04 subagent 的真实版本） |
| `remote_agent` | RemoteAgentTask | 远程主机上的 Agent |
| `in_process_teammate` | InProcessTeammateTask | 同进程内的队友（s09 teammate 的真实版本） |
| `local_workflow` | LocalWorkflowTask | 工作流编排 |
| `monitor_mcp` | MonitorMcpTask | MCP 监控任务 |
| `dream` | DreamTask | 后台记忆巩固（AutoMem 的"做梦"阶段） |

`s_full` 只有一种隐式任务（subagent 是一次性函数调用），真实 CC 把每类异步工作都建模为一种任务类型，统一管理。

## 9.2 统一的任务框架

所有 7 种类型共享同一套 API：

```typescript
// 注册
registerTask(task, setAppState)        // → 写入 AppState.tasks
// 更新
updateTaskState(taskId, setAppState, updater)  // 类型安全的部分更新
// 驱逐
evictTerminalTask(taskId, setAppState) // 终端态 + 已通知 + 超 grace period → 清除
```

任务状态变更通过 `task_started` SDK 事件广播。每个任务有独立的 `TASK_OUTPUT_DIR` 写入磁盘输出，支持增量交付（1s 轮询）。

## 9.3 InProcessTeammate——s09 teammate 的真实形态

s09 的 teammate 是一个 Python 线程 + JSONL 收件箱。真实 CC 的方案复杂得多：

```
spawnInProcessTeammate(config, context)
  │
  ├─ agentId = "name@teamName"         ← 全局唯一标识
  ├─ 创建 TeammateIdentity             ← 存在 AppState
  ├─ 创建 AbortController              ← 用于 kill
  ├─ 创建 TeammateContext              ← AsyncLocalStorage 隔离
  │    └─ 每个 teammate 的上下文完全隔离，不能互相访问
  │
  ├─ AppState 注册 InProcessTeammateTaskState
  │    { type: 'in_process_teammate',
  │      isIdle: false,
  │      pendingUserMessages: [],
  │      awaitingPlanApproval: false }
  │
  └─ 队友启动 agent loop
       │
       ├─ 与 lead 共享同一进程
       ├─ 有自己的 permissionMode
       ├─ 可以 idle（self-set）
       ├─ 可以收到 shutdown_request（类似 s10）
       └─ killInProcessTeammate() → abort controller + 清理 TeamFile
```

TeamFile 存在 `~/.claude/teams/{teamName}/config.json`——和 s09 的 `.team/config.json` 功能一样但结构更完整：

```typescript
interface TeamFile {
  name: string
  leadAgentId: string
  members: {
    agentId: string
    name: string
    cwd: string
    backendType: 'in-process' | 'remote'
    subscriptions: string[]     // 订阅的事件类型
    isActive: boolean
    mode: string
  }[]
  teamAllowedPaths: string[]
}
```

## 9.4 和 s_full 的对比

| 维度 | s_full | 真实 CC |
|------|------|------|
| 任务类型 | 1 (TaskManager JSON) | 7 (local_bash / local_agent / remote / teammate / workflow / dream / monitor) |
| 子 Agent | run_subagent() 函数调用 | LocalAgentTask（有 lifecycle、progress、权限） |
| Teammate | TeammateManager 线程 | InProcessTeammateTask（AsyncLocalStorage 隔离） |
| 任务框架 | 无 | registerTask / updateTaskState / evictTerminalTask |
| 磁盘输出 | .tasks/*.json | TASK_OUTPUT_DIR + 增量交付 |
| TeamFile | .team/config.json | ~/.claude/teams/{name}/config.json（更完整） |

---

## 核心洞察

任务系统的核心贡献是**把所有异步工作统一为一种抽象**。shell 命令、子 Agent、远程 Agent、队友、dream——它们都是"任务"，共享同一个注册/更新/驱逐生命周期。这和 s07 的 DAG 设计一脉相承——s07 用 JSON 文件和 blockedBy 做依赖管理，真实 CC 用 TypeScript 类型系统和 task 框架做统一管理。前者教会你"任务应该有状态"，后者告诉你"不同类型的工作应该共享同一个状态机"。

# 十、插件系统 + IDE Bridge——Agent 进入生态

真实 CC 的最后两个大系统：插件生态（让其他人写扩展）和 IDE 桥接（让 CC 嵌入编辑器）。

## 10.1 插件系统——Extension Points

插件通过 `.claude-plugin/` 目录中的声明文件扩展 CC：

| 文件 | 能力 | 对应 s_full |
|------|------|------|
| `commands/*.md` | 注册新的 `/` 斜杠命令 | s05 skill 的超集 |
| `agents/*.md` | 注册 Agent 定义（带工具白名单、system prompt、模型） | s04 subagent 的可配置版 |
| `hooks/hooks.json` | 注册 hook 回调 | s_full 完全没有 |
| `plugin.json` | 元数据 + 版本 + 用户配置 schema | s_full 完全没有 |

插件安装流程：

```
用户: /plugin install my-plugin@marketplace
  │
  ▼
resolveDependencyClosure()       ← 解析依赖图
  │
  ▼
settings.json: enabledPlugins += 整个闭包
  │
  ▼
cacheAndRegisterPlugin()         ← 下载/拷贝到 ~/.claude/plugins/cache/
  │
  ▼
assemblePluginLoadResult()       ← 合并 marketplace + session + built-in
  │
  ▼
loadPluginCommands()             ← 注册斜杠命令
loadPluginAgents()               ← 注册 Agent 类型
loadPluginHooks()                ← 注册 hook 回调
```

安全注意：插件 Agent 的安全敏感字段（`permissionMode`、`hooks`、`mcpServers`）被**强制忽略**——只有用户自己创建的本地 Agent 可以声明这些。防止恶意插件获得过高权限。

## 10.2 IDE Bridge——把 CC 嵌进编辑器

CC 通过两套协议和 VS Code / JetBrains 通信：

**REPL Bridge（WebSocket）：**

```
VS Code Extension ←→ WebSocket ←→ CC Session Ingress Server
  │                                                    │
  │  SDKMessage 帧:                                     │
  │  - user/assistant turns                             │
  │  - slash commands                                   │
  │  - control requests (initialize, interrupt, etc.)   │
  │                                                    │
  │  Permission 回调:                                    │
  │  sendRequest("allow this tool?") ──────────────────→│
  │  ←────────────────────────── onResponse(allow/deny) │
```

**Remote Bridge（HTTP 轮询）：**

```
CLI: claude remote-control
  │
  ├─ POST /v1/environments/bridge     ← 注册为 Bridge 环境
  ├─ GET  /v1/environments/{id}/work/poll   ← 轮询任务
  │    └─ 返回 WorkSecret: { ingressToken, apiBaseUrl, auths, env }
  │
  ├─ spawn 子进程 session              ← 用 WorkSecret 启动 CC 会话
  └─ POST heartbeat                    ← 续租
```

Bridge 支持三种 spawn 模式：单会话、worktree 隔离、同目录复用。

## 10.3 Skills vs Plugins——区别

| | Skill | Plugin |
|------|------|------|
| 格式 | Markdown + YAML frontmatter | `.claude-plugin/` 目录 |
| 能力 | prompt 模板 + 参考文件 | commands + agents + hooks |
| 分发 | 项目目录 `.claude/skills/` | 插件市场 |
| 版本 | 无 | plugin.json 版本管理 |
| 用户配置 | 无 | `userConfig` schema |
| 权限 | 和主 Agent 一致 | Agent 权限受限（不能声明 permissionMode） |

Skill 是 prompt，Plugin 是程序。s05 的 SkillLoader 对应真实 CC 的 Skill 系统（只是更简单）。插件是全新的——s_full 完全没有对应物。

## 10.4 和 s_full 的对比

| 维度 | s_full | 真实 CC |
|------|------|------|
| 扩展斜杠命令 | 改 REPL 代码 | commands/*.md + plugin.json |
| 自定义 Agent | 改 Python | agents/*.md + 工具白名单 |
| 生态分发 | 无 | marketplace + 版本管理 + 依赖解析 |
| IDE 集成 | 无 | WebSocket REPL + HTTP Remote Bridge |
| 权限边界 | 无 | 插件 Agent 不能声明 permissionMode |

---

## 核心洞察

插件系统和 IDE Bridge 代表了 Agent 从"工具"走向"平台"的最后一步。s_full 是一个你 fork 然后改源码的 Python 脚本。真实 CC 是一个你不需要 fork 的生态——通过插件扩展能力、通过 MCP 接入外部工具、通过 Bridge 嵌入编辑器。

这也解释了 512K 行代码从哪来：不是核心 Agent loop 变复杂了（它还是那个 while-tool_use），而是在这层循环周围长出了一个完整的平台——权限策略引擎、记忆持久化、hook 可编程接口、MCP 工具发现、7 种任务管理、插件市场、IDE 双向通信。**骨架不膨胀，生态在骨架上生长。**

# 十一、总结——从 s01 到 512K 行，我们学到了什么

12 个 session + s_full + 五大真实系统。最终的图景：

```
s01 — "一个循环+一个Bash"
  │
s02 — 工具分发（dispatch map）
  │
s03 — 内存规划（TodoWrite + nag）
s04 — 上下文隔离（Subagent）
s05 — 按需知识（Skills）
s06 — 策略遗忘（Compact）
  │
s07 — 磁盘任务图（DAG）    ← 第一个枢纽：状态在对话之外
s08 — 线程异步（Background）
  │
s09 — 多 Agent 邮箱（MessageBus）
s10 — 请求-响应 FSM（Protocols）
s11 — 自组织（Autonomous）   ← 第二个枢纽：Agent 自己找活干
s12 — 目录隔离（Worktree）
  │
s_full — 全机制集成（740行，骨架成型）
  │
真实 CC:
  权限引擎（allow/deny/ask + 6种模式 + AI 分类器）
  记忆系统（四种类型 + 自动提取 + Sonnet 侧查询）
  Hook 系统（28 事件 + 4 执行器 + updatedInput）
  MCP 集成（8 种传输 + 工具动态发现）
  任务系统（7 种类型 + 统一框架）
  插件生态 + IDE Bridge
  ─────────────────────────
  512,664 行 TypeScript
```

三条主线贯穿始终：

1. **模型看管判断，harness 看管执行和约束** — 从 `"dangerous" in command` 到完整的权限引擎，这个原则的粒度在变化，但方向没变。
2. **加能力不改循环** — dispatch map 加一行、TOOLS 加一个 schema、hook 加一条配置。核心 `while stop_reason == 'tool_use'` 从 s01 到真实 CC 骨架不变。
3. **状态在对话之外** — s03 内存 → s07 磁盘 → memory system 持久化 → task system 多类型。每一步都在把信息从模型上下文中拉出来，放到更持久的地方。

# 十二、社区热议——泄露源码中最令人惊喜的设计

Claude Code 源码在 2026 年 3 月 31 日因 npm 打包事故泄露后，社区花了数周逐行拆解这 1906 个文件、51.2 万行代码。以下是普遍认为写得最好、最出人意料、最值得学习的地方。

## 12.1 Prompt Cache 的三段式设计——静态/动态分离

这是被引用最多的设计亮点。CC 没有简单地把整个 system prompt 当成一个缓存块，而是精心设计了**静态段和动态段的边界**：

```
┌─────────────────────────────────────┐
│  静态段 (高缓存命中率)               │
│  模型身份 + 安全规则 + 代码风格限制    │  ← 每次对话都相同
├─────────────────────────────────────┤
│  SYSTEM_PROMPT_DYNAMIC_BOUNDARY      │  ← 硬编码分隔标记
├─────────────────────────────────────┤
│  动态段 (低缓存命中率)               │
│  工作目录 + Git 状态 + MCP 配置        │  ← 每次对话可能不同
└─────────────────────────────────────┘
```

Layer 1: System prompt / tool definitions / output style
Layer 2: Project context / CLAUDE.md / memory / rules
Layer 3: Conversation messages / tool results / latest user message

Anthropic 的 prompt cache 按前缀匹配。如果动态内容放在静态内容前面，每次对话变化都会导致整个缓存失效。CC 把**永不变化的内容放在最前面**（身份定义、安全规则），确保它们在 prompt cache 中始终命中。动态内容（当前目录、git 分支、MCP 服务器列表）放在后面。

还有两个细节：

- **工具描述按字母表排序** — 确保每次 `tools` 数组的 JSON 序列化结果一致，避免缓存因 key 顺序变化而失效
- **Agent 列表外置到消息附件** — 减少 ~10.2% 的 cache creation tokens。这是一个微优化，但在大规模使用时累积效果显著

## 12.2 自愈式记忆系统——"不信任内存，不断回到代码库验证"

社区的共识：这不是简单的"记住用户说过什么"，而是一套**仿生学设计**。

**AutoDream——模型睡觉时整理记忆：**

```
触发条件:
  • 时间门: 距上次 >24h
  • 会话门: 累计 5 次会话
  • 文件锁: 防止多进程冲突

四阶段:
  收集 → 提取 → 去重合并 → 写入结构化文件
```

"做梦"这个名字不是玩笑——它在概念上和人类睡眠中的记忆巩固过程一致：白天的经历（对话），夜间整理（压缩、去重、结构化），醒来后能更快检索。

**9 段式 Compact 摘要结构：**

```
会话目标 → 已完成任务 → 未完成任务 → 关键决策 →
代码变更 → 发现问题 → 待验证假设 → 用户偏好 → 上下文关键信息
```

不是把对话丢给模型让它"总结一下"，而是强制模型按 9 个维度结构化输出。这保证了压缩后的摘要**可检索**——"关键决策"栏位可以快速判断压缩内容是否和当前问题相关。

**"不信任内存"哲学：**

记忆文件里明确写着："如果记忆中的信息和当前代码冲突，**相信代码**。"这个原则贯穿整个系统——记忆是提示，不是权威。模型应该每次回到代码库验证，而不是依赖记忆中的快照。

## 12.3 ToolSearch——工具的按需加载

40+ 个工具全塞进 prompt，每次 API 调用都带着——大部分当前任务用不到。CC 的解法：

```
核心工具 (always loaded):  bash, read, write, edit, TodoWrite, task
非核心工具 (defer_loading):  NotebookEdit, WebSearch, SkillTool, CronCreate...
                              ↑
                              标记 defer_loading: true
                              模型需要时通过 ToolSearch 关键词动态加载
```

这相当于 Web 开发里的 **Code Splitting**。模型在对话中第一次需要某个工具时，ToolSearch 才注入该工具的完整 schema。不是所有 40 个工具的 JSON 都一直占着上下文窗口。

## 12.4 六级安全架构——层层剥洋葱

社区从源码中还原的安全层级：

```
Layer 1: 静态危险命令拦截    → "rm -rf /" 等硬编码模式
Layer 2: 用户自定义规则       → settings.json 的 allow/deny/ask
Layer 3: 工具自身安全检查     → BashTool.checkPermissions() 的 1350 行逻辑
Layer 4: Sidecar AI 分类器    → 小模型静默判断（auto 模式）
Layer 5: 交互式 UI            → 弹出对话框让人决定
Layer 6: 独立沙箱执行         → 命令在隔离环境中跑
```

社区最赞赏的设计是 Layer 4：**用一个小 LLM 去判断另一个 LLM 的操作是否安全。** 它比静态规则灵活（理解上下文），比人工审批快（毫秒级），而且有 Denial Tracking——如果小模型拒绝了太多次，系统自动降级到 Layer 5 让人类介入，防止误判卡住 Agent。

## 12.5 Coordinator + Fork Subagent——上下文污染的根治方案

s04 的 subagent 模式在真实 CC 中被放大为 Coordinator 架构：

```
Coordinator (规划层)
  ├── 只能用 3 个工具：SpawnAgent / SendMessage / TaskStop
  ├── 不直接操作文件 ← 关键约束
  │
  ├─→ Worker A (方案A探索) ──→ 结论回传 (XML task-notification)
  ├─→ Worker B (方案B探索) ──→ 结论回传
  └─→ Worker C (并行任务)  ──→ 结论回传
```

这里的精妙之处是 **Fork 继承缓存**。创建 Worker 时，它 fork 父 Agent 的 prompt cache 前缀——**不需要重新发送 system prompt**。创建一个子 Agent 的成本等同于发送一条 user message。这解释了为什么 CC 可以自由派发子 Agent 而不担心 token 成本爆炸。

Worker 之间也互相隔离——Worker A 探索方案 A 时读了 20 个文件，这些文件内容不会污染 Worker B 的上下文。Coordinator 只收到每个 Worker 的**结论**，不是完整探索日志。

## 12.6 泄露出的隐藏功能——最令人惊讶的部分

源码中还暴露了一些未发布或内部使用的功能：

| 代号 | 功能 | 状态 |
|------|------|------|
| **BUDDY** | 电子宠物系统（18 物种、5 稀有度、1% 闪光概率） | 愚人节彩蛋 |
| **KAIROS** | 7×24 常驻后台助手，支持 cron/webhook/远程控制 | 未发布 |
| **ULTRAPLAN** | 30 分钟深度规划模式（Opus 驱动） | 未发布 |
| **Undercover Mode** | 给开源仓库提 PR 时隐藏 Anthropic/AI 身份 | 内部使用 |
| **Capybara** | 新模型族代号（疑似 Claude 4.6），百万上下文 | 内部代号 |
| **Fennec** | Opus 线模型代号 | 内部代号 |

BUDDY（电子宠物）是最令人意外的一个——CC 终端里有一个完整的 Tamagotchi 式宠物系统，包含 18 种物种、5 个稀有度等级、1% 概率出现"闪光"变体。代码里有完整的"喂食"、"玩耍"、"进化"机制。社区普遍认为这是 Anthropic 工程师的"hackathon 项目溜进了生产版本"。

KAIROS 则代表了一个远更大的野心——不只让你在终端里调一个 Agent，而是有一个常驻的 7×24 助手，能定时执行任务、响应 webhook、远程控制。

## 12.7 社区争议——"vibe-coded garbage" vs "真实的复杂"

源码被曝光后，Hacker News 上出现两极反应。

**批评阵营：**
- `print.ts` 单函数超 3000 行，12 层嵌套
- 大量 feature flag + 补丁式代码
- 有工程师自嘲注释："memoization here increases complexity by a lot, and I'm not sure it really improves performance"

**辩护阵营：**
- "看起来很乱，恰恰因为它进入了真实的高强度开发环境，而不再是实验室 demo"
- 这 51.2 万行代码处理的是真实世界的混乱——多终端兼容、shell 差异、文件系统权限、OAuth 流程、MCP 协议变体、跨平台 CI/CD
- 一个开源社区成员一夜之间用 AI 工具从零重写了架构（`claw-code`），2 小时内获得了 5 万+ Star——这说明**架构好理解**，只是实现细节多

最出圈的讽刺来自一位匿名评论者：

> *"一家做 LLM 的公司居然用 regex 做情绪分析？就像卡车公司用马来运输零件。"*

回应：*"因为 regex 更快、更便宜，而且不会阻塞主流程。"* 这个对话完美概括了真实工程和学术理想的分野——最好的工具是刚好够用的工具。

## 12.8 这场"被迫开源"教会我们什么

CC 泄露事件的长期影响比源码本身更值得思考：

1. **护城河不在代码，在模型和数据** — Anthropic 在泄露后没有慌张，因为模型权重、训练数据和用户数据都没泄露。源码只是 harness——重要的，但不是不可替代的。

2. **"Open by accident" vs "Open by design"** — 同期 OpenAI 主动开源了 Codex CLI，而 Anthropic 是"被迫"暴露。两种策略折射出对竞争壁垒的不同理解。源码公开反而产生了社区认同——开发者 cleaner 用一晚上从零重写了同样的架构。

3. **架构的价值在于清晰** — 51.2 万行源码不是好东西因为它们"复杂"，是因为它们在复杂之上**保持了可读的架构**。18 个 SECTION 标签、清晰的模块边界、一致的设计模式（dispatch map + JSON Schema）——这些我们在 s01-s12 里学到的东西，在真实 CC 里原样存在。

---

## 核心洞察

这场泄露最出人意料的地方：Anthropic 用了最尴尬的方式，向全世界展示了他们真正在想什么。而社区普遍同意——**想法比代码更值钱**。架构设计（prompt cache 三段式、Coordinator fork、六级安全、AutoDream 记忆）才是 CC 真正的竞争优势，而它们恰好是 leak 中最容易被复制的部分。

这也是学习 harness engineering 的终极价值——你不需要 512K 行代码就能理解 CC。12 个 session、740 行 s_full，已经覆盖了它最核心的架构骨架。剩下的 511K 行是把这个骨架**投入真实世界的摩擦代价**——多平台兼容、错误恢复、边界处理、UI 细节、企业合规。这些东西重要，但不是 harness 设计的本质。

