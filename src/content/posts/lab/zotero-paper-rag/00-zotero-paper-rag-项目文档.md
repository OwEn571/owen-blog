---
title: PDF-RAG-Agent V4 项目文档
published: 2026-05-02
description: PDF-RAG-Agent V4 完整项目文档——基于 Zotero 论文库的智能研究助手，从普通 RAG 演进为可追踪、可校验的论文 Agent。
tags: [RAG, Agent, Zotero, PDF, Milvus, BM25, FastAPI, SSE]
category: Zotero Paper Agent
draft: false
comment: true
---

> 项目主页：[owen571.top/lab/zotero-paper-rag/](/lab/zotero-paper-rag/) · 源码：[GitHub](https://github.com/owen571/pdf-rag-agent-v4) · 当前运行时版本 V5

## 1. 项目介绍

PDF-RAG-Agent V4 是一个面向 Zotero 个人论文库的智能论文研究助手。它基于 FastAPI、SSE 流式对话和可视化前端，将用户问题先解析为结构化意图，再通过会话记忆、本地 PDF 语料检索、必要的 Web 搜索、证据抽取、claim 生成与 grounding 校验，最终输出带引用来源的 Markdown 回答。

系统支持 PDF 文本、表格、图像/图注等多模态证据处理，结合 BM25 与 Milvus 向量索引实现双路召回，并在前端实时展示 Intent、Tool Loop、Evidence、Verification 和 PDF 预览，让论文问答从普通 RAG 升级为一个可追踪、可校验、支持多轮研究上下文的论文 Agent。

## 2. 系统架构

从代码组织看，`app/services/` 下有 16 个子包、140+ 个模块，按职责分为四组：

```
app/services/
├── 基础设施
│   └── infra/          model_clients, confidence, prompt_safety
├── 数据与检索
│   ├── library/        zotero_sqlite, metadata_sql, citation_ranking
│   ├── retrieval/      DualIndexRetriever, indexing, pdf_extractor, vector_index, web_search
│   └── memory/         session_store, learnings, artifacts, research
├── 领域逻辑
│   ├── intents/        LLMIntentRouter (10 模块)
│   ├── planning/       research plan, query_shaping, compound_tasks (7 模块)
│   ├── contracts/      session_context, normalization, contextual_resolver (8 模块)
│   ├── claims/         ★ 23 模块: solver_pipeline, 13 solvers, verifiers
│   ├── answers/        答案组合 (9 模块)
│   ├── entities/       实体定义 (4 模块)
│   ├── followup/       追问候选 (2 模块)
│   ├── clarification/  澄清机制 (3 模块)
│   ├── eval/           LLM-as-judge
│   └── tools/          动态工具提案
└── Agent 编排
    ├── agent/          ★ 26 模块: core, loop, planner, runtime, handlers
    └── agent_mixins/   5 个 Mixin (正交能力注入)
```

### 2.1 Agent 编排层

`ResearchAssistantAgentV4` 通过多重继承组合五个 Mixin 获得正交能力：

```
FollowupRoutingMixin   → 追问路由：识别纠正/延续/切换
AnswerComposerMixin    → 答案组合：按 relation 分发
EntityDefinitionMixin  → 实体定义：消歧 + 定义提取
SolverPipelineMixin    → Claim 求解：schema / deterministic / shadow 三路径
ClaimVerifierMixin     → Grounding 校验：三层验证
```

Agent 执行一条请求的完整流程：
1. `run_agent_chat_turn()` → 入口：解析 session → compress 历史 → 创建 run context → 尝试 compound → 走 standard turn
2. `run_standard_turn()` → `extract_agent_query_contract()` → `planner.plan_actions()` → `runtime.execute_*()` → solver → verifier → composer
3. `loop.py` 区分 `run_conversation_turn()` 和 `run_research_turn()` 两条路径

### 2.2 模型调用层

`ModelClients` 统一封装三个模型能力（均通过 OpenAI 兼容 API）：

| 能力 | 当前部署 | 默认值 | 用途 |
|------|---------|--------|------|
| Chat | `deepseek-v4-pro` | `gpt-4o-mini` | 意图识别、工具规划、claim 提取、验证、答案生成 |
| VLM | `gpt-4.1-mini` | 同 | 图表/页面截图理解 (temperature=0.0) |
| Embedding | `text-embedding-3-large` (3072维) | 同 | 向量索引 (走 Qihai 网关，fallback 到 3-small) |

Chat 和 VLM 共用 `OPENAI_API_KEY` + `OPENAI_BASE_URL`（指向 `api.deepseek.com/v1`），Embedding 使用独立的 `EMBEDDING_API_KEY` + `EMBEDDING_BASE_URL`（指向 `api.qhaigc.net/v1`）。

## 3. 核心链路详解

### 3.1 意图路由：LLMIntentRouter

使用 **tool-calling 模式** 而非传统文本分类。Chat Model 从 5 个 tool choice 中选择最合适的一个：

- `answer_directly` — 寒暄、自我介绍，不需要论文语料
- `need_conversation_tool` — 论文库状态查询、推荐、引用排名、历史记忆追问
- `need_corpus_search` — 本地 PDF 语料检索（多数研究问题入口）
- `need_web` — 外部 Web 搜索（需用户显式开启）
- `need_clarify` — 问题不明确或存在歧义

路由输出包含 `relation`（20+ 种：`formula_lookup`、`paper_summary_results`、`entity_definition`、`metric_value_lookup` 等）、`targets`、`requested_fields`、`confidence`、`continuation_mode`。

> **关于 QueryContract**：`QueryContract` 仍是意图解析后的核心数据结构，但它的构建不再是单一模块的责任。`extract_agent_query_contract()` 在 `contract_extraction.py` 中组合了 router 输出、target 抽取、followup 继承、pending clarification 处理等多个来源。

### 3.2 AgentPlanner

`AgentPlanner.plan_actions()` 使用三级降级策略：先尝试 tool-calling planner，失败则降级到 JSON planner，最终兜底用 `fallback_plan()`。

Planner 的工具清单来自 `agent_tool_manifest()`，合并了 20 个内置 `AgentToolSpec` 和动态注册的 custom tools。防呆逻辑包括 `defer_premature_research_clarification()`（检索前避免过早澄清）和 `research_contract_should_try_tools_before_human()`。

### 3.3 AgentRuntime 与 Tool Loop

区分两条路径，共享 `execute_tool_loop()` 机制：

- **Conversation 路径** — 12 工具：`read_memory`, `compose`(terminal), `query_library_metadata`, `web_search`, `ask_human`(terminal), `todo_write`, `remember`, `propose_tool`, `summarize`, `verify_claim`, `Task`, `fetch_url`
- **Research 路径** — 18 工具：`search_corpus`, `bm25_search`, `vector_search`, `hybrid_search`, `grep_corpus`, `read_pdf_page`, `rerank`, `query_rewrite`, `web_search`, `summarize`, `verify_claim`, `compose`(terminal), `ask_human`(terminal), `read_memory`, `todo_write`, `remember`, `Task`, `fetch_url`

Tool loop 运作：planner 决定 next action → executor 调用 handler → emit 产出事件 → stop_condition 检查 → 继续或终止。默认 `max_agent_steps=8`、`retry_budget=1`。

### 3.4 检索：两级索引 + 双路召回

`DualIndexRetriever` 使用 paper index 和 block index 两级结构。论文级检索四路加权融合：

**title anchor (1.6) > relation anchor (1.3) > BM25 (0.9) > dense (0.8)**

`V4IngestionService.rebuild()` 执行离线入库：Zotero SQLite → PDFExtractor (pypdf + PageSignals) → 文本切块 (chunk_size=1200, overlap=180) → JSONL + Milvus (batch_size=128)。

### 3.5 Claim Solver：13 种 Deterministic Solver

`_DETERMINISTIC_SOLVER_REGISTRY` 注册了 13 种 solver：

| key | 功能 | solver 函数 |
|-----|------|------------|
| `formula` | 公式提取 + 变量解释 | `solve_formula_claims` |
| `figure` | 图表理解 (VLM) | `solve_figure_claims` |
| `table` | 表格解析 | `solve_table_claims` |
| `metric_context` | 指标数值提取 | `solve_metric_context_claims` |
| `origin_lookup` | 概念起源论文 | `solve_origin_lookup_claims` |
| `paper_summary_results` | 论文摘要结果 | `solve_paper_summary_results_claims` |
| `entity_definition` | 实体定义 | `solve_entity_definition_claims` |
| `concept_definition` | 概念定义 | `solve_concept_definition_claims` |
| `followup_research` | 多轮追问 | `solve_followup_research_claims` |
| `paper_recommendation` | 论文推荐 | `solve_paper_recommendation_claims` |
| `topology_*` | 论文关系拓扑 | `solve_topology_*_claims` |
| `default_text` | 通用文本问答 | `solve_default_text_claims` |

三路径策略：schema solver 可用 → 直接用；否则走 deterministic；shadow mode 启用时两者并行并比较。

### 3.6 Claim Verifier：三层 Grounding 校验

1. **证据 ID 审计**：检查 claim 引用的 `evidence_ids` 是否真实存在于 evidence 列表中（防 LLM 幻觉）
2. **Type-specific 验证**：按 claim 类型做确定性校验（公式完整性、数值精确度、起源引用正确性）
3. **LLM 验证器**：复杂语义判断（如公式一致性对比）

`VerificationReport` 含 `status`（pass/retry/clarify）、`missing_fields`、`unsupported_claims`、`recommended_action`。

### 3.7 Answer Composer

`_COMPOSE_RELATION_STEPS` 按 relation 分发到不同 answer 策略：

| relation | 步骤 |
|----------|------|
| `library_status` | query_library_metadata → get_library_status |
| `library_recommendation` | get_library_recommendation |
| `memory_followup` | answer_from_memory |
| `memory_synthesis` | synthesize_previous_results |
| `library_citation_ranking` | recover_candidates → web_lookup → rank |

所有 composer 输出 `AssistantCitation` 结构（doc_id、paper_id、title、page、block_type、snippet），回答中用 Markdown 引用标记。

### 3.8 多轮记忆与澄清

`extract_agent_query_contract()` 多层加工流程：pending clarification 处理 → LLMIntentRouter 路由 → followup 上下文继承 → contextual resolve → normalize targets。

`FollowupRoutingMixin` 追问路由：`is_negative_correction_query()` 检测否定纠正；`inherit_followup_relationship_contract()` 延续上下文。

澄清机制：LLM-judge 消歧在 `disambiguation_runtime.py` 中。`auto_resolve` 阈值为 0.85（自动绑定），recommend 阈值为 0.65（推荐但不自动）。`force_best_effort_after_clarification_limit()` 防止无限循环（默认 max 2 次）。

## 4. 检索设计

### 4.1 PDF 抽取

`PDFExtractor` 基于 pypdf，对每页计算 `PageSignals`（caption_anchor_count, numeric_density, table_like_score, figure_like_score 等 13 个信号），分类为 `page_text`、`table`、`figure`、`caption` 块。`MAX_HI_RES_PAGES_PER_DOC = 6` 限制高分辨率抽取页数。

### 4.2 双路召回

论文级检索 `search_papers()` 四路加权 + RRF 融合：

```python
weighted_docs = []
if title_anchors:    weighted_docs.append((1.6, title_anchors))
if relation_anchors: weighted_docs.append((1.3, relation_anchors))
if bm25_docs:        weighted_docs.append((0.9, bm25_docs))
if dense_docs:       weighted_docs.append((0.8, dense_docs))
# RRF fusion → paper_match_boost → CandidatePaper list
```

`RETRIEVAL_FORMULA_TOKEN_WEIGHTS` 对公式场景做专门加权（π 1.8, β 1.8, sigma 2.5, surrogate objective 2.4, clipped surrogate 4.0 等）。

### 4.3 Zotero 集成

`ZoteroSQLiteReader` 读取本地 Zotero SQLite，通过 `ATTACHMENT_SQL` 查询 PDF 附件。`PaperRecord` 含 13 字段（parent_item_id, attachment_item_id, attachment_key, title, authors, year, tags, abstract_note, source_url, website_title, file_path, file_exists 等）。

## 5. 运行与部署

### 5.1 环境变量

```bash
CHAT_MODEL=deepseek-v4-pro
OPENAI_BASE_URL=https://api.deepseek.com/v1
VLM_MODEL=gpt-4.1-mini
EMBEDDING_MODEL=text-embedding-3-large
EMBEDDING_BASE_URL=https://api.qhaigc.net/v1
EMBEDDING_API_KEY=sk-xxx
MILVUS_URI=http://localhost:19530
TAVILY_API_KEY=tvly-xxx
```

### 5.2 快速开始

```bash
cp env.template .env && vim .env    # 配置 API key
pip install -r requirements.txt
python scripts/ingest_rebuild.py    # 离线入库
uvicorn app.main:app --host 127.0.0.1 --port 8001
# 访问 http://127.0.0.1:8001/v5
```

### 5.3 systemd 服务

```ini
[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/owen/pdf-rag-agent-v4
ExecStart=.../python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
Restart=always
RestartSec=3
```

## 6. 测试与评估

- 80+ 测试文件覆盖全部服务模块，使用 `StubModelClients` 替代真实调用
- Eval cases 在 `evals/cases_test_md.yaml` 中，`scripts/run_v4_eval.py` 通过 HTTP 调用自动评判
- 关键回归：DPO 公式查询、论文摘要、多轮追问、澄清场景、论文库状态

## 7. 前端交互

`app/static/v4.html` 单页工作台，四区域布局：

- **左侧**：Zotero 论文库侧栏，按 collection 分类
- **中间**：聊天区，支持 Markdown + LaTeX + 引用点击 + `thinking_delta` 思考展示
- **右侧**：Runtime Inspector，按时间线展示 18 种 SSE 事件（session → contract → agent_plan → plan → tool_call → evidence → solver_selection → claims → verification → reflection → confidence → final 等）
- **底部**：引用来源和 PDF 预览（PDF.js 渲染到指定页码）

## 8. 真实 Trace（DPO 公式查询）

2026-05-02 真实请求 `"帮我看看 DPO 这篇论文的核心公式"`：

- **60 个 SSE 事件**：answer_delta:21, observation:10, thinking_delta:6, tool_call:5, agent_step:3 等
- **15 个 execution steps**：contract → planner → build_research_plan → search_corpus (candidates=6, selected=1) → read_memory → compose (LLM-judge auto_resolve, confidence=0.95) → solver (deterministic) → verify_claim → pass
- **最终回答**：574 字符，含 DPO 核心公式 LaTeX，2 条 citation
- **消歧**：4 个候选 → LLM-judge 自动绑定到 paper S6H9FE28（《Direct Preference Optimization》原论文），confidence=0.95

## 9. 迭代历史

| 阶段 | 变化 |
|------|------|
| V1-V2 | 简单 RAG pipeline |
| V3 | 引入 Agent 概念，固定流水线 |
| V4 | Tool loop + LLM-judge 消歧 + 结构化意图 + Mixin 架构 |
| V5 (当前) | 16 服务子包分层、DeepSeek V4 Pro、Qihai embedding 网关 |

- 从单文件 agent.py (2000+ 行) → modules → Mixin → 16 子包分层
- 固定流水线 → Tool Loop
- 人工澄清 → LLM-judge 自动消歧 (threshold 0.85/0.65)
- 纯 RAG → 公式/图表/指标精确抽取 + grounding 校验
- Compound Query 复合查询分解（"比较 DPO 和 PPO" → 两个子任务并行执行后合并）

## 10. 后续方向

- Streaming 工具执行（减少首 token 延迟）
- 更智能的 retry 策略（按 missing_fields 类型决策）
- 论文库增量更新（代替全量 rebuild）
- VLM 调用策略优化（减少不必要的调度判断）
- Answer quality 自动化回归
- 跨论文深度对比能力增强
