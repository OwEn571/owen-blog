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

