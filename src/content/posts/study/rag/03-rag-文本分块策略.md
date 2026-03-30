---
title: RAG 文本分块：为什么切、怎么切、怎么权衡
published: 2026-03-27
description: 理解分块在 RAG 中的地位，以及固定大小、递归分块、语义分块和结构化分块各自适合什么场景。
tags: [RAG, 文本分块, Chunking]
category: RAG
draft: false
comment: true
---

> 分块是 RAG 里最容易“看起来简单、实际上很关键”的步骤。这里把块大小、重叠与几种典型分块策略整理到一起，方便后面搭索引时直接回看。

# RAG - 文本分块
## 一、理解文本分块
文本分块（Text Chunking）是构建 RAG 流程的关键步骤。它的原理是将加载后的长篇文档，切分成更小、更易于处理的单元。这些被切分出的文本块，是后续向量检索和模型处理的基本单位。

![alt text](image-5.png)

## 二、文本分块的重要性
### 1. 上下文限制
将文本分块的首要原因，是为了适应 RAG 系统中两个核心组件的硬性限制：

- 嵌入模型 (Embedding Model): 负责将文本块转换为向量。这类模型有严格的输入长度上限。例如，许多常用的嵌入模型（如 bge-base-zh-v1.5）的上下文窗口为512个token。任何超出此限制的文本块在输入时都会被截断，导致信息丢失，生成的向量也无法完整代表原文的语义。因此，文本块的大小必须小于等于嵌入模型的上下文窗口。

- 大语言模型 (LLM): 负责根据检索到的上下文生成答案。LLM同样有上下文窗口限制（尽管通常比嵌入模型大得多，从几千到上百万token不等）。检索到的所有文本块，连同用户问题和提示词，都必须能被放入这个窗口中。如果单个块过大，可能会导致只能容纳少数几个相关的块，限制了LLM回答问题时可参考的信息广度。

因此，分块是确保文本能够被两个模型完整、有效处理的基础。

### 2. 块大小的trade-off

| 块大小   | 优势                                                   | 劣势                                                                             | 对 RAG 的影响                                |
| -------- | ------------------------------------------------------ | -------------------------------------------------------------------------------- | -------------------------------------------- |
| 大块     | 上下文更完整，保留更多原文细节，适合需要整体语境的信息 | 嵌入时信息被压缩得更严重，主题容易稀释，检索不够精准；生成时也容易出现“大海捞针” | 召回可能不稳定，噪声较多，回答容易遗漏关键点 |
| 中等块   | 在上下文完整性和语义聚焦之间取得平衡                   | 仍可能混入少量无关信息，需要结合重叠策略优化                                     | 通常是实践中最常用、效果最稳妥的选择         |
| 小块     | 主题集中，语义清晰，检索匹配更精准，信噪比更高         | 上下文可能不足，容易丢失前后关联，回答时可能缺背景                               | 召回更精确，但可能需要检索多个块拼接上下文   |
| 过小的块 | 对单一知识点定位非常强                                 | 语义过于碎片化，信息不完整，容易失去独立表达能力                                 | 检索结果零散，增加后续整合和生成难度         |


## 三、基础分块策略
LangChain提供了丰富且易用的文本分割器 (Text Splitters)。
### 1. 固定大小分块 (CharacterTextSplitter)
这是最简单直接的分块方法。根据LangChain源码，这种方法的工作原理分为两个主要阶段：

（1）按段落分割：CharacterTextSplitter 采用默认分隔符 "\n\n"，使用正则表达式将文本按段落进行分割，通过 _split_text_with_regex 函数处理。

（2）智能合并：调用继承自父类的 _merge_splits 方法，将分割后的段落依次合并。该方法会监控累积长度，当超过 chunk_size 时形成新块，并通过重叠机制（chunk_overlap）保持上下文连续性，同时在必要时发出超长块的警告。

需要注意，CharacterTextSplitter 实际实现的并非严格的固定大小分块。根据 _merge_splits 源码逻辑，这种方法会：

- 优先保持段落完整性：只有当添加新段落会导致总长度超过 chunk_size 时，才会结束当前块
- 处理超长段落：如果单个段落超过 chunk_size，系统会发出警告但仍将其作为完整块保留
- 应用重叠机制：通过 chunk_overlap 参数在块之间保持内容重叠，确保上下文连续性

所以，LangChain 的实现更准确地应该称为"段落感知的自适应分块"，块大小会根据段落边界动态调整。

接下来我们配置一各固定大小分块器：
```python
from langchain.text_splitter import CharacterTextSplitter
from langchain_community.document_loaders import TextLoader

loader = TextLoader("../../data/C2/txt/蜂医.txt")
docs = loader.load()

text_splitter = CharacterTextSplitter(
    chunk_size=200,    # 每个块的目标大小为100个字符
    chunk_overlap=10   # 每个块之间重叠10个字符，以缓解语义割裂
)

chunks = text_splitter.split_documents(docs)

print(f"文本被切分为 {len(chunks)} 个块。\n")
print("--- 前5个块内容示例 ---")
for i, chunk in enumerate(chunks[:5]):
    print("=" * 60)
    # chunk 是一个 Document 对象，需要访问它的 .page_content 属性来获取文本
    print(f'块 {i+1} (长度: {len(chunk.page_content)}): "{chunk.page_content}"')
```

![alt text](image-6.png)

这种方法的主要优势在于实现简单、处理速度快且计算开销小。劣势在于可能会在语义边界处切断文本，影响内容的完整性和连贯性。实际的固定大小分块实现（如LangChain的 CharacterTextSplitter）通常会结合分隔符来减少这种问题，在段落边界处优先切分，只有在必要时才会强制按大小切断。因此，这种方法在日志分析、数据预处理等场景中仍有其应用价值。

### 2. 递归字符分块 (RecursiveCharacterTextSplitter)

这种分块器通过分隔符层级递归处理，相对与固定大小分块，改善了超长文本的处理效果。

算法流程：
1. 寻找有效分隔符: 从分隔符列表中从前到后遍历，找到第一个在当前文本中存在的分隔符。如果都不存在，使用最后一个分隔符（通常是空字符串 ""）。
2. 切分与分类处理: 使用选定的分隔符切分文本，然后遍历所有片段：
- 如果片段不超过块大小: 暂存到 _good_splits 中，准备合并
- 如果片段超过块大小:
    - 首先，将暂存的合格片段通过 _merge_splits 合并成块
    - 然后，检查是否还有剩余分隔符：
        - 有剩余分隔符: 递归调用 _split_text 继续分割
        - 无剩余分隔符: 直接保留为超长块

3. 最终处理: 将剩余的暂存片段合并成最后的块

实现细节：

- 批处理机制: 先收集所有合格片段（_good_splits），遇到超长片段时才触发合并操作。
- 递归终止条件: 关键在于 if not new_separators 判断。当分隔符用尽时（new_separators 为空），停止递归，直接保留超长片段。确保算法不会无限递归。

与固定大小分块的关键差异：

- 固定大小分块遇到超长段落时只能发出警告并保留。
- 递归分块会继续使用更细粒度的分隔符（句子→单词→字符）直到满足大小要求。

```python
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import TextLoader

loader = TextLoader("../../data/C2/txt/蜂医.txt")
docs = loader.load()

text_splitter = RecursiveCharacterTextSplitter(
    separators=["\n\n", "\n", "。", "，", " ", ""],  # 分隔符优先级
    chunk_size=200,
    chunk_overlap=10,
)

chunks = text_splitter.split_text(docs)
```
![alt text](image-7.png)

直觉上来看切的更碎了，总块数更多。这里默认的分隔符优先级也就是上文代码的`separators`，可以自己调整，默认是`["\n\n", "\n", " ", ""]`，对于无词边界语言可以添加：
```python
separators=[
    "\n\n", "\n", " ",
    ".", ",", "\u200b",      # 零宽空格(泰文、日文)
    "\uff0c", "\u3001",      # 全角逗号、表意逗号
    "\uff0e", "\u3002",      # 全角句号、表意句号
    ""
]
```

另外，还可以针对特定编程语言（如Python，Java等）使用预设的、更符合代码结构的分隔符。它们通常包含语言的顶级语法结构（如类、函数定义）和次级结构（如控制流语句），以实现更符合代码逻辑的分割。
```python
# 针对代码文档的优化分隔符
splitter = RecursiveCharacterTextSplitter.from_language(
    language=Language.PYTHON,  # 支持Python、Java、C++等
    chunk_size=500,
    chunk_overlap=50
)
```

递归字符分块的原理是采用一组有层次结构的分隔符（如段落、句子、单词）进行递归分割，旨在有效平衡语义完整性与块大小控制。在 RecursiveCharacterTextSplitter 的实现中，该分块器首先尝试使用最高优先级的分隔符（如段落标记）来切分文本。如果切分后的块仍然过大，会继续对这个大块应用下一优先级分隔符（如句号），如此循环往复，直到块满足大小限制。这种分层处理的机制，能够在尽可能保持高级语义结构完整性的同时，有效控制块大小。

### 3. 语义分块 (Semantic Chunking)
语义分块（Semantic Chunking）是一种更智能的方法，这种方法不依赖于固定的字符数或预设的分隔符，而是尝试根据文本的语义内涵来切分。其核心是：在语义主题发生显著变化的地方进行切分。这使得每个分块都具有高度的内部语义一致性。LangChain 提供了 `langchain_experimental.text_splitter.SemanticChunker` 来实现这一功能。

#### (1) 实现原理

SemanticChunker 的工作流程可以概括为以下几个步骤：

1. **句子分割 (Sentence Splitting)**：首先，使用标准的句子分割规则（例如，基于句号、问号、感叹号）将输入文本拆分成一个句子列表。

2. **上下文感知嵌入 (Context-Aware Embedding)**：这是 SemanticChunker 的一个关键设计。该分块器不是对每个句子独立进行嵌入，而是通过 buffer_size 参数（默认为1）来捕捉上下文信息。对于列表中的每一个句子，这种方法会将其与前后各 buffer_size 个句子组合起来，然后对这个临时的、更长的组合文本进行嵌入。这样，每个句子最终得到的嵌入向量就融入了其上下文的语义。

3. 计算语义距离 (Distance Calculation)：计算每对相邻句子的嵌入向量之间的余弦距离。这个距离值量化了两个句子之间的语义差异——距离越大，表示语义关联越弱，跳跃越明显。
4. **识别断点 (Breakpoint Identification)**：SemanticChunker 会分析所有计算出的距离值，并根据一个统计方法（默认为 percentile）来确定一个动态阈值。例如，它可能会将所有距离中第95百分位的值作为切分阈值。所有距离大于此阈值的点，都被识别为语义上的“断点”。

5. **合并成块 (Merging into Chunks)**：最后，根据识别出的所有断点位置，将原始的句子序列进行切分，并将每个切分后的部分内的所有句子合并起来，形成一个最终的、语义连贯的文本块。

#### (2) 断点识别方法 (breakpoint_threshold_type)

如何定义“显著的语义跳跃”是语义分块的关键。SemanticChunker 提供了几种基于统计的方法来识别断点：

- percentile (百分位法 - 默认方法):

    - 逻辑: 计算所有相邻句子的语义差异值，并将这些差异值进行排序。当一个差异值超过某个百分位阈值时，就认为该差异值是一个断点。
    - 参数: breakpoint_threshold_amount (默认为 95)，表示使用第95个百分位作为阈值。这意味着，只有最显著的5%的语义差异点会被选为切分点。
- standard_deviation (标准差法):

    - 逻辑: 计算所有差异值的平均值和标准差。当一个差异值超过“平均值 + N * 标准差”时，被视为异常高的跳跃，即断点。
    - 参数: breakpoint_threshold_amount (默认为 3)，表示使用3倍标准差作为阈值。
- interquartile (四分位距法):

    - 逻辑: 使用统计学中的四分位距（IQR）来识别异常值。当一个差异值超过 Q3 + N * IQR 时，被视为断点。
    - 参数: breakpoint_threshold_amount (默认为 1.5)，表示使用1.5倍的IQR。
- gradient (梯度法):

    - 逻辑: 这是一种更复杂的方法。它首先计算差异值的变化率（梯度），然后对梯度应用百分位法。对于那些句子间语义联系紧密、差异值普遍较低的文本（如法律、医疗文档）特别有效，因为这种方法能更好地捕捉到语义变化的“拐点”。
    - 参数: breakpoint_threshold_amount (默认为 95)。

稍微总结一下几个断点的优缺点，一般优先使用percentile就行了，默认切分效果不好时，再尝试gradient或更鲁棒的interquartile。
| 方法                 | 核心思路                                   | 优点                                         | 缺点                                           | 适用场景                                       |
| -------------------- | ------------------------------------------ | -------------------------------------------- | ---------------------------------------------- | ---------------------------------------------- |
| `percentile`         | 把句子间语义距离排序，超过某个百分位就切分 | 简单直观，默认方法，通用性强                 | 对不同文档分布适应性一般，阈值偏经验化         | 通用文本、入门默认选择                         |
| `standard_deviation` | 超过“均值 + N 倍标准差”视为断点            | 能识别明显异常的语义跳跃                     | 对分布敏感，若数据波动不稳定，切分效果可能不稳 | 语义跳跃较明显的普通文本                       |
| `interquartile`      | 用四分位距识别异常值，超过阈值就切分       | 比标准差法更抗极端值干扰，鲁棒性更好         | 理解门槛稍高，参数不如百分位法直观             | 噪声较多、分布不均匀的文本                     |
| `gradient`           | 关注语义距离变化率，在“变化拐点”处切分     | 更擅长捕捉细微主题转折，对语义连续文本更敏感 | 计算和理解都更复杂，调参成本更高               | 法律、医疗、学术等语义连续但局部变化重要的文本 |

```python
import os
## os.environ["HF_ENDPOINT"] = "https://hf-mirror.com"
from langchain_experimental.text_splitter import SemanticChunker
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.document_loaders import TextLoader

embeddings = HuggingFaceEmbeddings(
    model_name="BAAI/bge-small-zh-v1.5",
    model_kwargs={'device': 'cpu'},
    encode_kwargs={'normalize_embeddings': True}
)

# 初始化 SemanticChunker
text_splitter = SemanticChunker(
    embeddings,
    breakpoint_threshold_type="percentile" # 断点识别方法
)

loader = TextLoader("../../data/C2/txt/蜂医.txt")
documents = loader.load()

docs = text_splitter.split_documents(documents)
```
语义分块当然就都需要嵌入模型了，它是预训练之后的，知道将语义相近的句子嵌入后的高维向量拉进、不同的句子拉远。嵌入的过程大概就是分词、查表（查词表对应到id，然后查预训练好的嵌入表得初始向量）、加位置信息、Transformer编码、池化压缩成句子向量、归一。


```mermaid
flowchart LR
    subgraph T["训练嵌入模型"]
        direction TB
        T0["训练样本<br/>Query / Positive / Negative"]
        T1["Tokenizer / 词表<br/>文本 -> token ids"]
        T2["Embedding Table 查表<br/>token id -> 初始 token 向量"]
        T3["位置编码<br/>加入位置信息"]
        T4["Transformer Encoder<br/>让 token 融合上下文"]
        T5["Pooling / Projection<br/>token 向量 -> 句向量"]
        T6["得到句向量<br/>q / pos / neg"]
        T7["计算相似度<br/>sim(q,pos), sim(q,neg)"]
        T8["训练目标<br/>让 q 更接近 pos<br/>让 q 更远离 neg"]
        T9["Loss"]
        T10["反向传播"]
        T11["更新参数<br/>Embedding Table<br/>Encoder<br/>Projection"]

        T0 --> T1 --> T2 --> T3 --> T4 --> T5 --> T6 --> T7 --> T8 --> T9 --> T10 --> T11
    end

    M["训练好的嵌入模型参数<br/>Embedding Table + Encoder + Projection"]

    T11 --> M

    subgraph U["使用嵌入模型"]
        direction TB
        U0["新文本<br/>用户问题 / 文档块"]
        U1["同一个 Tokenizer / 词表"]
        U2["查训练好的 Embedding Table<br/>得到初始 token 向量"]
        U3["位置编码"]
        U4["经过训练好的 Encoder<br/>融合上下文"]
        U5["Pooling / Projection"]
        U6["最终句向量"]
        U7["相似度计算 / 向量检索 / 入库"]

        U0 --> U1 --> U2 --> U3 --> U4 --> U5 --> U6 --> U7
    end

    M -. 提供固定参数 .-> U2
    M -. 提供固定参数 .-> U4
    M -. 提供固定参数 .-> U5

```

### 4. 基于文档结构的分块
对于具有明确结构标记的文档格式（如Markdown、HTML、LaTex），可以利用这些标记来实现更智能、更符合逻辑的分割。

以 Markdown 结构分块为例
针对结构清晰的 Markdown 文档，利用其标题层级进行分块是一种高效且保留了丰富语义的方法。LangChain 提供了 MarkdownHeaderTextSplitter 来处理。

- 实现原理: 该分块器的主要逻辑是“先按标题分组，再按需细分”。

    1. 定义分割规则: 用户首先需要提供一个标题层级的映射关系，例如 [ ("#", "Header 1"), ("##", "Header 2") ]，告诉分块器 # 是一级标题，## 是二级标题。
    2. 内容聚合: 分块器会遍历整个文档，将每个标题下的所有内容（直到下一个同级或更高级别的标题出现前）聚合在一起。每个聚合后的内容块都会被赋予一个包含其完整标题路径的元数据。
- 元数据注入的优势: 这是此方法的主要特点。例如，对于一篇关于机器学习的文章，某个段落可能位于“第三章：模型评估”下的“3.2节：评估指标”中。经过分割后，这个段落形成的文本块，其元数据就会是 {"Header 1": "第三章：模型评估", "Header 2": "3.2节：评估指标"}。这种元数据为每个块提供了精确的“地址”，极大地增强了上下文的准确性，让大模型能更好地理解信息片段的来源和背景。

- 局限性与组合使用: 单纯按标题分割可能会导致一个问题：某个章节下的内容可能非常长，远超模型能处理的上下文窗口。为了解决这个问题，MarkdownHeaderTextSplitter 可以与其它分块器（如 RecursiveCharacterTextSplitter）组合使用。具体流程是：

    - 第一步，使用 MarkdownHeaderTextSplitter 将文档按标题分割成若干个大的、带有元数据的逻辑块。
    - 第二步，对这些逻辑块再应用 RecursiveCharacterTextSplitter，将其进一步切分为符合 chunk_size 要求的小块。由于这个过程是在第一步之后进行的，所有最终生成的小块都会继承来自第一步的标题元数据。
- RAG应用优势: 这种两阶段的分块方法，既保留了文档的宏观逻辑结构（通过元数据），又确保了每个块的大小适中，是处理结构化文档进行RAG的理想方案。

## 四、其他开源框架中的分块策略

这后面简单瞅一下，Unstructrured前面也用过了。

### 1. Unstructured：基于文档元素的智能分块
Unstructured是一个强大的文档处理工具，同样提供了实用的分块功能。

（1）分区 (Partitioning): 这是一个重要功能，负责将原始文档（如PDF、HTML）解析成一系列结构化的“元素”（Elements）。每个元素都带有语义标签，如 Title (标题)、NarrativeText (叙述文本)、ListItem (列表项) 等。这个过程本身就完成了对文档的深度理解和结构化。

（2）分块 (Chunking): 该功能建立在分区的结果之上。分块功能不是对纯文本进行操作，而是将分区产生的“元素”列表作为输入，进行智能组合。Unstructured 提供了两种主要的分块方法：

- basic: 这是默认方法。这种方法会连续地组合文档元素（如段落、列表项），直到达到 max_characters 上限，尽可能地填满每个块。如果单个元素超过上限，则会对其进行文本分割。
- by_title: 该方法在 basic 方法的基础上，增加了对“章节”的感知。该方法将 Title 元素视为一个新章节的开始，并强制在此处开始一个新的块，确保同一个块内不会包含来自不同章节的内容。这在处理报告、书籍等结构化文档时非常有用，效果类似于 LangChain 的 MarkdownHeaderTextSplitter，但适用范围更广。
Unstructured 允许将分块作为分区的一个参数在单次调用中完成，也支持在分区之后作为一个独立的步骤来执行分块。这种“先理解、后分割”的策略，使得 Unstructured 能在最大程度上保留文档的原始语义结构，特别是在处理版式复杂的文档时，优势尤为明显。

### 2. LlamaIndex：面向节点的解析与转换
LlamaIndex 将数据处理流程抽象为对“节点（Node）”的操作。文档被加载后，首先会被解析成一系列的“节点”，分块只是节点转换（Transformation）中的一环。

LlamaIndex 的分块体系有以下特点：

（1）丰富的节点解析器 (Node Parser): LlamaIndex 提供了大量针对特定数据格式和方法的节点解析器，可以大致分为几类：

- 结构感知型: 如 MarkdownNodeParser, JSONNodeParser, CodeSplitter 等，能理解并根据源文件的结构（如Markdown标题、代码函数）进行切分。
- 语义感知型:
    - SemanticSplitterNodeParser: 与 LangChain 的 SemanticChunker 类似，这种解析器使用嵌入模型来检测句子之间的语义“断点”，在语义连续性明显减弱的地方切开，从而让每个 chunk 内部尽量连贯。
    - SentenceWindowNodeParser: 这是一种巧妙的方法。该方法将文档切分成单个的句子，但在每个句子节点（Node）的元数据中，会存储其前后相邻的N个句子（即“窗口”）。这使得在检索时，可以先用单个句子的嵌入进行精确匹配，然后将包含上下文“窗口”的完整文本送给LLM，极大地提升了上下文的质量。
- 常规型: 如 TokenTextSplitter, SentenceSplitter 等，提供基于Token数量或句子边界的常规切分方法。

（2）灵活的转换流水线: 用户可以构建一个灵活的流水线，例如先用 MarkdownNodeParser 按章节切分文档，再对每个章节节点应用 SentenceSplitter 进行更细粒度的句子级切分。每个节点都携带丰富的元数据，记录着其来源和上下文关系。

（3）良好的互操作性: LlamaIndex 提供了 LangchainNodeParser，可以方便地将任何 LangChain 的 TextSplitter 封装成 LlamaIndex 的节点解析器，无缝集成到其处理流程中。

### 3. ChunkViz：简易的可视化分块工具
在本文开头部分展示的分块图就是通过 ChunkViz 生成的。可以将你的文档、分块配置作为输入，用不同的颜色块展示每个 chunk 的边界和重叠部分，方便快速理解分块逻辑。
