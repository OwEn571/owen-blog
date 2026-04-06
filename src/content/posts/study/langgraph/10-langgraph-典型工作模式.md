---
title: LangGraph 应用思路 02：典型工作流与 Agent 模式
published: 2026-03-26
description: Prompt Chaining、Parallelization、Routing、Orchestrator-worker 与 Evaluator-optimizer 的结构化落地。
tags: [LangGraph, Workflow, Agent]
category: LangGraph
draft: false
comment: true
---

# 用LangGraph实现典型工作模式

这一章介绍常见的工作流和agent模式。

- 工作流具有预设的代码路径，设计上按特定顺序运行。
- 智能体则具备动态性，可自主定义执行流程与工具使用方式。

LangGraph 在构建智能体与工作流时具备多项优势，包括持久化、流式输出，同时支持调试以及部署功能。

![alt text](image-12.png)

## 1. Prompt Chaining

提示词链式调用是指每次大语言模型调用都会处理上一次调用的输出结果。它通常用于执行可拆解为更小、可验证步骤的明确任务。例如：
- 将文档翻译成不同语言
- 验证生成内容的一致性
- ...

![alt text](image-13.png)

```python
from typing_extensions import TypedDict
from langgraph.graph import StateGraph, START, END
from IPython.display import Image, display


# Graph state
class State(TypedDict):
    topic: str
    joke: str
    improved_joke: str
    final_joke: str


# Nodes
def generate_joke(state: State):
    """First LLM call to generate initial joke"""

    msg = llm.invoke(f"Write a short joke about {state['topic']}")
    return {"joke": msg.content}


def check_punchline(state: State):
    """Gate function to check if the joke has a punchline"""

    # Simple check - does the joke contain "?" or "!"
    if "?" in state["joke"] or "!" in state["joke"]:
        return "Pass"
    return "Fail"


def improve_joke(state: State):
    """Second LLM call to improve the joke"""

    msg = llm.invoke(f"Make this joke funnier by adding wordplay: {state['joke']}")
    return {"improved_joke": msg.content}


def polish_joke(state: State):
    """Third LLM call for final polish"""
    msg = llm.invoke(f"Add a surprising twist to this joke: {state['improved_joke']}")
    return {"final_joke": msg.content}


# Build workflow
workflow = StateGraph(State)

# Add nodes
workflow.add_node("generate_joke", generate_joke)
workflow.add_node("improve_joke", improve_joke)
workflow.add_node("polish_joke", polish_joke)

# Add edges to connect nodes
workflow.add_edge(START, "generate_joke")
workflow.add_conditional_edges(
    "generate_joke", check_punchline, {"Fail": "improve_joke", "Pass": END}
)
workflow.add_edge("improve_joke", "polish_joke")
workflow.add_edge("polish_joke", END)

# Compile
chain = workflow.compile()

# Show workflow
display(Image(chain.get_graph().draw_mermaid_png()))

# Invoke
state = chain.invoke({"topic": "cats"})
print("Initial joke:")
print(state["joke"])
print("\n--- --- ---\n")
if "improved_joke" in state:
    print("Improved joke:")
    print(state["improved_joke"])
    print("\n--- --- ---\n")

    print("Final joke:")
    print(state["final_joke"])
else:
    print("Final joke:")
    print(state["joke"])
```

```mermaid
flowchart TD
    A([START]) --> B[generate_joke<br/>根据 topic 生成初始 joke]

    B --> C{check_punchline<br/>joke 是否包含 ? 或 !}

    C -- Pass --> D([END<br/>直接输出 joke])
    C -- Fail --> E[improve_joke<br/>基于 joke 做改写]
    E --> F[polish_joke<br/>基于 improved_joke 再润色]
    F --> G([END<br/>输出 final_joke])

    B -.-> H[(state.joke)]
    E -.-> I[(state.improved_joke)]
    F -.-> J[(state.final_joke)]

```


## 2. Parallelization

借助并行化，大语言模型可同时处理一项任务。实现方式包括同时运行多个独立子任务，或多次运行同一任务以校验不同输出结果。并行化通常用于：
- 拆分子任务并并行执行，从而提升处理速度
- 多次运行任务以校验不同输出结果，从而提高结果可信度

相关示例包括：
- 运行一个子任务提取文档关键词，同时运行另一个子任务检查格式错误
- 多次运行任务，依据不同标准（如引用数量、使用来源数量及来源质量）对文档准确性进行评分

![alt text](image-14.png)

```python
# Graph state
class State(TypedDict):
    topic: str
    joke: str
    story: str
    poem: str
    combined_output: str


# Nodes
def call_llm_1(state: State):
    """First LLM call to generate initial joke"""

    msg = llm.invoke(f"Write a joke about {state['topic']}")
    return {"joke": msg.content}


def call_llm_2(state: State):
    """Second LLM call to generate story"""

    msg = llm.invoke(f"Write a story about {state['topic']}")
    return {"story": msg.content}


def call_llm_3(state: State):
    """Third LLM call to generate poem"""

    msg = llm.invoke(f"Write a poem about {state['topic']}")
    return {"poem": msg.content}


def aggregator(state: State):
    """Combine the joke, story and poem into a single output"""

    combined = f"Here's a story, joke, and poem about {state['topic']}!\n\n"
    combined += f"STORY:\n{state['story']}\n\n"
    combined += f"JOKE:\n{state['joke']}\n\n"
    combined += f"POEM:\n{state['poem']}"
    return {"combined_output": combined}


# Build workflow
parallel_builder = StateGraph(State)

# Add nodes
parallel_builder.add_node("call_llm_1", call_llm_1)
parallel_builder.add_node("call_llm_2", call_llm_2)
parallel_builder.add_node("call_llm_3", call_llm_3)
parallel_builder.add_node("aggregator", aggregator)

# Add edges to connect nodes
parallel_builder.add_edge(START, "call_llm_1")
parallel_builder.add_edge(START, "call_llm_2")
parallel_builder.add_edge(START, "call_llm_3")
parallel_builder.add_edge("call_llm_1", "aggregator")
parallel_builder.add_edge("call_llm_2", "aggregator")
parallel_builder.add_edge("call_llm_3", "aggregator")
parallel_builder.add_edge("aggregator", END)
parallel_workflow = parallel_builder.compile()

# Show workflow
display(Image(parallel_workflow.get_graph().draw_mermaid_png()))

# Invoke
state = parallel_workflow.invoke({"topic": "cats"})
print(state["combined_output"])
```

```mermaid
flowchart TD
    A([START<br/>输入 topic]) --> B[call_llm_1<br/>生成 joke]
    A --> C[call_llm_2<br/>生成 story]
    A --> D[call_llm_3<br/>生成 poem]

    B --> E[aggregator<br/>汇总 joke / story / poem]
    C --> E
    D --> E

    E --> F([END<br/>输出 combined_output])

    B -.-> G[(state.joke)]
    C -.-> H[(state.story)]
    D -.-> I[(state.poem)]
    E -.-> J[(state.combined_output)]

```

## 3. Routing
路由工作流会处理输入内容，然后将其导向对应上下文的特定任务。这使你能够为复杂任务定义专用流程。例如，一个用于解答产品相关问题的工作流，可先处理问题类型，再将请求路由至定价、退款、退换货等专属处理流程。

![alt text](image-15.png)

```python
from typing_extensions import Literal
from langchain.messages import HumanMessage, SystemMessage


# Schema for structured output to use as routing logic
class Route(BaseModel):
    step: Literal["poem", "story", "joke"] = Field(
        None, description="The next step in the routing process"
    )


# Augment the LLM with schema for structured output
router = llm.with_structured_output(Route)


# State
class State(TypedDict):
    input: str
    decision: str
    output: str


# Nodes
def llm_call_1(state: State):
    """Write a story"""

    result = llm.invoke(state["input"])
    return {"output": result.content}


def llm_call_2(state: State):
    """Write a joke"""

    result = llm.invoke(state["input"])
    return {"output": result.content}


def llm_call_3(state: State):
    """Write a poem"""

    result = llm.invoke(state["input"])
    return {"output": result.content}


def llm_call_router(state: State):
    """Route the input to the appropriate node"""

    # Run the augmented LLM with structured output to serve as routing logic
    decision = router.invoke(
        [
            SystemMessage(
                content="Route the input to story, joke, or poem based on the user's request."
            ),
            HumanMessage(content=state["input"]),
        ]
    )

    return {"decision": decision.step}


# Conditional edge function to route to the appropriate node
def route_decision(state: State):
    # Return the node name you want to visit next
    if state["decision"] == "story":
        return "llm_call_1"
    elif state["decision"] == "joke":
        return "llm_call_2"
    elif state["decision"] == "poem":
        return "llm_call_3"


# Build workflow
router_builder = StateGraph(State)

# Add nodes
router_builder.add_node("llm_call_1", llm_call_1)
router_builder.add_node("llm_call_2", llm_call_2)
router_builder.add_node("llm_call_3", llm_call_3)
router_builder.add_node("llm_call_router", llm_call_router)

# Add edges to connect nodes
router_builder.add_edge(START, "llm_call_router")
router_builder.add_conditional_edges(
    "llm_call_router",
    route_decision,
    {  # Name returned by route_decision : Name of next node to visit
        "llm_call_1": "llm_call_1",
        "llm_call_2": "llm_call_2",
        "llm_call_3": "llm_call_3",
    },
)
router_builder.add_edge("llm_call_1", END)
router_builder.add_edge("llm_call_2", END)
router_builder.add_edge("llm_call_3", END)

# Compile workflow
router_workflow = router_builder.compile()

# Show the workflow
display(Image(router_workflow.get_graph().draw_mermaid_png()))

# Invoke
state = router_workflow.invoke({"input": "Write me a joke about cats"})
print(state["output"])
```

```mermaid
flowchart TD
    A([START<br/>输入 input]) --> B[llm_call_router<br/>LLM 进行结构化路由判断]

    B --> C{route_decision<br/>decision = story / joke / poem}

    C -- story --> D[llm_call_1<br/>生成 story]
    C -- joke --> E[llm_call_2<br/>生成 joke]
    C -- poem --> F[llm_call_3<br/>生成 poem]

    D --> G([END<br/>输出 output])
    E --> G
    F --> G

    B -.-> H[(state.decision)]
    D -.-> I[(state.output)]
    E -.-> I
    F -.-> I

```

## 4. Orchestrator-worker

在协调器 - 工作节点架构中，协调器负责：
- 将任务拆解为子任务
- 将子任务分配给工作节点执行
- 整合各工作节点的输出结果形成最终成果

![alt text](image-16.png)

```python
from typing import Annotated, List
import operator


# Schema for structured output to use in planning
class Section(BaseModel):
    name: str = Field(
        description="Name for this section of the report.",
    )
    description: str = Field(
        description="Brief overview of the main topics and concepts to be covered in this section.",
    )


class Sections(BaseModel):
    sections: List[Section] = Field(
        description="Sections of the report.",
    )


# Augment the LLM with schema for structured output
planner = llm.with_structured_output(Sections)
```

协调器 - 工作流模式十分常见，LangGraph 已内置对该模式的支持。Send API 可动态创建工作节点并向其发送指定输入。每个工作节点拥有独立状态，所有工作节点的输出都会写入一个共享状态键，协调器图可访问该键。这使得协调器能够获取所有工作节点的输出，并将其整合为最终输出。下面的示例会遍历章节列表，并通过 Send API 将每个章节分发给对应工作节点。

```python
from langgraph.types import Send


# Graph state
class State(TypedDict):
    topic: str  # Report topic
    sections: list[Section]  # List of report sections
    completed_sections: Annotated[
        list, operator.add
    ]  # All workers write to this key in parallel
    final_report: str  # Final report


# Worker state
class WorkerState(TypedDict):
    section: Section
    completed_sections: Annotated[list, operator.add]


# Nodes
def orchestrator(state: State):
    """Orchestrator that generates a plan for the report"""

    # Generate queries
    report_sections = planner.invoke(
        [
            SystemMessage(content="Generate a plan for the report."),
            HumanMessage(content=f"Here is the report topic: {state['topic']}"),
        ]
    )

    return {"sections": report_sections.sections}


def llm_call(state: WorkerState):
    """Worker writes a section of the report"""

    # Generate section
    section = llm.invoke(
        [
            SystemMessage(
                content="Write a report section following the provided name and description. Include no preamble for each section. Use markdown formatting."
            ),
            HumanMessage(
                content=f"Here is the section name: {state['section'].name} and description: {state['section'].description}"
            ),
        ]
    )

    # Write the updated section to completed sections
    return {"completed_sections": [section.content]}


def synthesizer(state: State):
    """Synthesize full report from sections"""

    # List of completed sections
    completed_sections = state["completed_sections"]

    # Format completed section to str to use as context for final sections
    completed_report_sections = "\n\n---\n\n".join(completed_sections)

    return {"final_report": completed_report_sections}


# Conditional edge function to create llm_call workers that each write a section of the report
def assign_workers(state: State):
    """Assign a worker to each section in the plan"""

    # Kick off section writing in parallel via Send() API
    return [Send("llm_call", {"section": s}) for s in state["sections"]]


# Build workflow
orchestrator_worker_builder = StateGraph(State)

# Add the nodes
orchestrator_worker_builder.add_node("orchestrator", orchestrator)
orchestrator_worker_builder.add_node("llm_call", llm_call)
orchestrator_worker_builder.add_node("synthesizer", synthesizer)

# Add edges to connect nodes
orchestrator_worker_builder.add_edge(START, "orchestrator")
orchestrator_worker_builder.add_conditional_edges(
    "orchestrator", assign_workers, ["llm_call"]
)
orchestrator_worker_builder.add_edge("llm_call", "synthesizer")
orchestrator_worker_builder.add_edge("synthesizer", END)

# Compile the workflow
orchestrator_worker = orchestrator_worker_builder.compile()

# Show the workflow
display(Image(orchestrator_worker.get_graph().draw_mermaid_png()))

# Invoke
state = orchestrator_worker.invoke({"topic": "Create a report on LLM scaling laws"})

from IPython.display import Markdown
Markdown(state["final_report"])
```

```mermaid
flowchart TD
    A([START<br/>输入 topic]) --> B[orchestrator<br/>规划报告 sections]

    B --> C{assign_workers<br/>为每个 section 创建一个 worker}

    C --> D[llm_call Worker 1<br/>写 section 1]
    C --> E[llm_call Worker 2<br/>写 section 2]
    C --> F[llm_call Worker N<br/>写 section N]

    D --> G[synthesizer<br/>汇总 completed_sections]
    E --> G
    F --> G

    G --> H([END<br/>输出 final_report])

    B -.-> I[(state.sections)]
    D -.-> J[(state.completed_sections += section.content)]
    E -.-> J
    F -.-> J
    G -.-> K[(state.final_report)]

```


## 5. Evaluator-optimizer

在评估器 - 优化器工作流中，一个大语言模型生成响应，另一个则对该响应进行评估。若评估器或人工介入环节判定响应需要优化，系统会提供反馈并重新生成响应。该循环持续进行，直至生成符合要求的响应。

评估器 - 优化器工作流常用于任务存在明确成功标准、但需通过迭代才能达标的场景。例如，两种语言间的文本翻译往往难以一次完美匹配，可能需要多次迭代，才能生成语义一致的译文。

![alt text](image-17.png)

```python
# Graph state
class State(TypedDict):
    joke: str
    topic: str
    feedback: str
    funny_or_not: str


# Schema for structured output to use in evaluation
class Feedback(BaseModel):
    grade: Literal["funny", "not funny"] = Field(
        description="Decide if the joke is funny or not.",
    )
    feedback: str = Field(
        description="If the joke is not funny, provide feedback on how to improve it.",
    )


# Augment the LLM with schema for structured output
evaluator = llm.with_structured_output(Feedback)


# Nodes
def llm_call_generator(state: State):
    """LLM generates a joke"""

    if state.get("feedback"):
        msg = llm.invoke(
            f"Write a joke about {state['topic']} but take into account the feedback: {state['feedback']}"
        )
    else:
        msg = llm.invoke(f"Write a joke about {state['topic']}")
    return {"joke": msg.content}


def llm_call_evaluator(state: State):
    """LLM evaluates the joke"""

    grade = evaluator.invoke(f"Grade the joke {state['joke']}")
    return {"funny_or_not": grade.grade, "feedback": grade.feedback}


# Conditional edge function to route back to joke generator or end based upon feedback from the evaluator
def route_joke(state: State):
    """Route back to joke generator or end based upon feedback from the evaluator"""

    if state["funny_or_not"] == "funny":
        return "Accepted"
    elif state["funny_or_not"] == "not funny":
        return "Rejected + Feedback"


# Build workflow
optimizer_builder = StateGraph(State)

# Add the nodes
optimizer_builder.add_node("llm_call_generator", llm_call_generator)
optimizer_builder.add_node("llm_call_evaluator", llm_call_evaluator)

# Add edges to connect nodes
optimizer_builder.add_edge(START, "llm_call_generator")
optimizer_builder.add_edge("llm_call_generator", "llm_call_evaluator")
optimizer_builder.add_conditional_edges(
    "llm_call_evaluator",
    route_joke,
    {  # Name returned by route_joke : Name of next node to visit
        "Accepted": END,
        "Rejected + Feedback": "llm_call_generator",
    },
)

# Compile the workflow
optimizer_workflow = optimizer_builder.compile()

# Show the workflow
display(Image(optimizer_workflow.get_graph().draw_mermaid_png()))

# Invoke
state = optimizer_workflow.invoke({"topic": "Cats"})
print(state["joke"])
```

```mermaid
flowchart TD
    A([START<br/>输入 topic]) --> B[llm_call_generator<br/>生成 joke]

    B --> C[llm_call_evaluator<br/>评价 joke 并给出 feedback]

    C --> D{route_joke<br/>funny_or_not?}

    D -- Accepted --> E([END<br/>输出 joke])
    D -- Rejected + Feedback --> B

    B -.-> F[(state.joke)]
    C -.-> G[(state.funny_or_not)]
    C -.-> H[(state.feedback)]

```

## 6. Agents

智能体通常由大语言模型实现，通过工具执行操作。它们在持续的反馈循环中运行，适用于问题与解决方案均不可预测的场景。智能体比工作流具有更高的自主性，能够自主决定使用何种工具以及如何解决问题。你仍可定义可用的工具集及智能体的行为准则。

![alt text](image-18.png)

```python
from langgraph.graph import MessagesState
from langchain.messages import SystemMessage, HumanMessage, ToolMessage


# Nodes
def llm_call(state: MessagesState):
    """LLM decides whether to call a tool or not"""

    return {
        "messages": [
            llm_with_tools.invoke(
                [
                    SystemMessage(
                        content="You are a helpful assistant tasked with performing arithmetic on a set of inputs."
                    )
                ]
                + state["messages"]
            )
        ]
    }


def tool_node(state: dict):
    """Performs the tool call"""

    result = []
    for tool_call in state["messages"][-1].tool_calls:
        tool = tools_by_name[tool_call["name"]]
        observation = tool.invoke(tool_call["args"])
        result.append(ToolMessage(content=observation, tool_call_id=tool_call["id"]))
    return {"messages": result}


# Conditional edge function to route to the tool node or end based upon whether the LLM made a tool call
def should_continue(state: MessagesState) -> Literal["tool_node", END]:
    """Decide if we should continue the loop or stop based upon whether the LLM made a tool call"""

    messages = state["messages"]
    last_message = messages[-1]

    # If the LLM makes a tool call, then perform an action
    if last_message.tool_calls:
        return "tool_node"

    # Otherwise, we stop (reply to the user)
    return END


# Build workflow
agent_builder = StateGraph(MessagesState)

# Add nodes
agent_builder.add_node("llm_call", llm_call)
agent_builder.add_node("tool_node", tool_node)

# Add edges to connect nodes
agent_builder.add_edge(START, "llm_call")
agent_builder.add_conditional_edges(
    "llm_call",
    should_continue,
    ["tool_node", END]
)
agent_builder.add_edge("tool_node", "llm_call")

# Compile the agent
agent = agent_builder.compile()

# Show the agent
display(Image(agent.get_graph(xray=True).draw_mermaid_png()))

# Invoke
messages = [HumanMessage(content="Add 3 and 4.")]
messages = agent.invoke({"messages": messages})
for m in messages["messages"]:
    m.pretty_print()
```

```mermaid
flowchart TD
    A([START<br/>输入 messages]) --> B[llm_call<br/>LLM 决定直接回答还是调用工具]

    B --> C{should_continue<br/>last_message.tool_calls ?}

    C -- Yes --> D[tool_node<br/>执行工具并生成 ToolMessage]
    D --> B

    C -- No --> E([END<br/>输出最终 AIMessage])

    B -.-> F[(AIMessage<br/>可能包含 tool_calls)]
    D -.-> G[(ToolMessage<br/>工具执行结果)]
    E -.-> H[(messages 完整对话历史)]

```
