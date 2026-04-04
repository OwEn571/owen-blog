---
title: RAG 混合检索：稀疏、密集与 Milvus 实现
published: 2026-03-21
description: 把混合检索拆成三层来理解：稀疏向量在做什么、密集向量在补什么，以及 Milvus 里怎样真正把两者并行召回并融合。
tags: [RAG, Hybrid Search, Milvus, BM25]
category: RAG
draft: false
comment: true
---

> 这一篇开始正式进入“检索优化”阶段。前面的重点是先把索引和基础检索链路搭起来，这一篇则开始回答一个更现实的问题：只靠单路 dense 检索，什么时候会不够。

# RAG - 检索优化
# 一、混合检索
混合检索（Hybrid Search）是一种结合了 稀疏向量（Sparse Vectors） 和 密集向量（Dense Vectors） 优势的先进搜索技术。旨在同时利用稀疏向量的关键词精确匹配能力和密集向量的语义理解能力，以克服单一向量检索的局限性，从而在各种搜索场景下提供更准确、更鲁棒的检索结果。

## 1. 稀疏向量
稀疏向量，也常被称为“词法向量”，是基于词频统计的传统信息检索方法的数学表示。它通常是一个维度极高（与词汇表大小相当）但绝大多数元素为零的向量。经典方法包括one-hot、Bag of words、TF、TF-IDF、BM25等。
- One-hot：先建一个词表，每个词对应固定位置，出现为1，不出现为2
- Bag of Words：把一段文本表示成“词出现次数”的向量，比one-hot更进一步，能表示词频
- TF（Term Frequency）：某个词在当前文档里出现得有多频繁。
- TF-IDF（Term Frequency * Inverse Document Frequency）：在TF的基础又加了一层全局分布度，思想是一个词在当前文档里出现很多次，说明它对这篇文档重要。相反如果它在所有文档里都很常见，那它区分度不高，应该降权。
- BM25：可以看成是对TF-IDF的进一步改进，是检索算法中非常经典的排序函数，它综合考虑“查询词是否出现在文档里”、“出现多少次”、“词本身是否稀有”、“文档长度是否过长”，我们可以看一下公式：
    $$
    Score(Q, D) = \sum_{i=1}^{n} IDF(q_i)\cdot
    \frac{f(q_i, D)(k_1+1)}
    {f(q_i, D) + k_1\left(1-b+b\cdot\frac{|D|}{avgdl}\right)}
    $$
  - $IDF(q_i)$：查询词 $q_i$ 的逆文档频率，用于衡量一个词的普遍程度。越常见的词，IDF 值越低。如果一个词很少见，比如某个专有术语、型号名、算法名，那它更能说明“这篇文档和查询强相关”，贡献就高。
  - $f(q_i, D)$：查询词 $q_i$ 在文档 $D$ 中的词频。但不是单纯越多越好，不是线性增长，会慢慢饱和。
  - $|D|$：文档 $D$ 的长度。这是归一化修正要用的，否则长文本天然包含更多词更占便宜。
  - $avgdl$：集合中所有文档的平均长度。
  - $k_1, b$：可调节的超参数。$k_1$ 用于控制词频饱和度（一个词在文档中出现 10 次和 100 次，其重要性增长并非线性），$b$ 用于控制文档长度归一化的程度。


## 2. 密集向量
密集向量，也常被称为“语义向量”，是通过深度学习模型学习到的数据（如文本、图像）的低维、稠密的浮点数表示。这些向量旨在将原始数据映射到一个连续的、充满意义的“语义空间”中来捕捉“语义”或“概念”。

其主要优点是能够理解同义词、近义词和上下文关系，泛化能力强，在语义搜索任务中表现卓越。但缺点也同样明显：可解释性差（向量中的每个维度通常没有具体的物理意义），需要大量数据和算力进行模型训练，且对于未登录词（OOV）的处理相对困难。

OOV（Out-of-Vocabulary）未登录词：指在模型训练时没有出现在词汇表中，但在实际使用时遇到的新词汇。例如，如果模型训练时词汇表中没有"ChatGPT"这个词，那么在实际应用中遇到它时就是OOV。传统的稀疏向量方法（如BM25）对OOV词汇会完全忽略，而现代的密集向量方法通过子词分割（如BPE、WordPiece）可以更好地处理OOV问题。

# 二、混合检索的方法

混合检索通常并行执行两种检索算法，然后将两组异构的结果集融合成一个统一的排序列表。以下是两种主流的融合策略。

## 1. 倒数排序融合 (Reciprocal Rank Fusion, RRF)
RRF 不关心不同检索系统的原始得分，只关心每个文档在各自结果集中的排名。其思想是：一个文档在不同检索系统中的排名越靠前，它的最终得分就越高。其计分公式为：
$$
RRF_{score}(d) = \sum_{i=1}^{k} \frac{1}{rank_i(d) + c}
$$

其中：

- $d$ 是待评分的文档。
- $k$ 是检索系统的数量（这里是 2，即稀疏和密集）。
- $rank_i(d)$ 是文档 $d$ 在第 $i$ 个检索系统中的排名。
- $c$ 是一个常数（通常设为 60），用于降低排名靠前文档的相对权重，实现更稳健的排名融合。

## 2. 加权线性组合
这种方法需要先将不同检索系统的得分进行归一化（例如，统一到 0-1 区间），然后通过一个权重参数 α 来进行线性组合。

$$
Hybrid_{score} = \alpha \cdot Dense_{score} + (1 - \alpha) \cdot Sparse_{score}
$$

通过调整 α 的值，可以灵活地控制语义相似性与关键词匹配在最终排序中的贡献比例。例如，在电商搜索中，可以调高关键词的权重；而在智能问答中，则可以侧重于语义。

## 3. 区别、优势与局限
线性加权融合的是 dense 和 sparse 的原始分数，因此要求不同检索器的分数具有一定可比性；RRF 融合的是各检索器中的排名，不依赖分数尺度，因此通常更稳健，也更常用于实际的多路检索融合。

两种方法的优势与局限如下：

| 优势                                                               | 局限                                                 |
| ------------------------------------------------------------------ | ---------------------------------------------------- |
| 召回率与准确率高：能同时捕获关键词和语义，显著优于单一检索。       | 计算资源消耗大：需要同时维护和查询两套索引。         |
| 灵活性强：可通过融合策略和权重调整，适应不同业务场景。             | 参数调试复杂：融合权重等超参数需要反复实验调优。     |
| 容错性好：关键词检索可部分弥补向量模型对拼写错误或罕见词的敏感性。 | 可解释性仍是挑战：融合后的结果排序理由难以直观分析。 |


# 三、用Milvus实现混合检索
下面直接阅读实例代码即可
## 1. 定义Collection
```python
import json
import os
os.environ["HF_ENDPOINT"] = "https://hf-mirror.com"
import numpy as np
from pymilvus import connections, MilvusClient, FieldSchema, CollectionSchema, DataType, Collection, AnnSearchRequest, RRFRanker
from pymilvus.model.hybrid import BGEM3EmbeddingFunction

# 1. 初始化设置
COLLECTION_NAME = "dragon_hybrid_demo"
MILVUS_URI = "http://localhost:19530"  # 服务器模式
DATA_PATH = "../../data/C4/metadata/dragon.json"  # 相对路径
BATCH_SIZE = 50

# 2. 连接 Milvus 并初始化嵌入模型
print(f"--> 正在连接到 Milvus: {MILVUS_URI}")
connections.connect(uri=MILVUS_URI)

print("--> 正在初始化 BGE-M3 嵌入模型...")
ef = BGEM3EmbeddingFunction(use_fp16=False, device="cpu")
print(f"--> 嵌入模型初始化完成。密集向量维度: {ef.dim['dense']}")

# 3. 创建 Collection
milvus_client = MilvusClient(uri=MILVUS_URI)
if milvus_client.has_collection(COLLECTION_NAME):
    print(f"--> 正在删除已存在的 Collection '{COLLECTION_NAME}'...")
    milvus_client.drop_collection(COLLECTION_NAME)

fields = [
    FieldSchema(name="pk", dtype=DataType.VARCHAR, is_primary=True, auto_id=True, max_length=100),
    FieldSchema(name="img_id", dtype=DataType.VARCHAR, max_length=100),
    FieldSchema(name="path", dtype=DataType.VARCHAR, max_length=256),
    FieldSchema(name="title", dtype=DataType.VARCHAR, max_length=256),
    FieldSchema(name="description", dtype=DataType.VARCHAR, max_length=4096),
    FieldSchema(name="category", dtype=DataType.VARCHAR, max_length=64),
    FieldSchema(name="location", dtype=DataType.VARCHAR, max_length=128),
    FieldSchema(name="environment", dtype=DataType.VARCHAR, max_length=64),
    FieldSchema(name="sparse_vector", dtype=DataType.SPARSE_FLOAT_VECTOR),
    FieldSchema(name="dense_vector", dtype=DataType.FLOAT_VECTOR, dim=ef.dim["dense"])
]

# 如果集合不存在，则创建它及索引
if not milvus_client.has_collection(COLLECTION_NAME):
    print(f"--> 正在创建 Collection '{COLLECTION_NAME}'...")
    schema = CollectionSchema(fields, description="关于龙的混合检索示例")
    # 创建集合
    collection = Collection(name=COLLECTION_NAME, schema=schema, consistency_level="Strong")
    print("--> Collection 创建成功。")

    # 创建索引
    print("--> 正在为新集合创建索引...")
    sparse_index = {"index_type": "SPARSE_INVERTED_INDEX", "metric_type": "IP"}
    collection.create_index("sparse_vector", sparse_index)
    print("稀疏向量索引创建成功。")

    dense_index = {"index_type": "AUTOINDEX", "metric_type": "IP"}
    collection.create_index("dense_vector", dense_index)
    print("密集向量索引创建成功。")

collection = Collection(COLLECTION_NAME)
collection.load()
print(f"--> Collection '{COLLECTION_NAME}' 已加载到内存。")
```

## 2. BGE-M3双向量生成

BGE-M3 作为向量生成器，它能够同时生成稀疏向量和密集向量。

首先加载数据：
```python
if collection.is_empty:
    print(f"--> Collection 为空，开始插入数据...")
    with open(DATA_PATH, 'r', encoding='utf-8') as f:
        dataset = json.load(f)

    docs, metadata = [], []
    for item in dataset:
        parts = [
            item.get('title', ''),
            item.get('description', ''),
            item.get('location', ''),
            item.get('environment', ''),
        ]
        docs.append(' '.join(filter(None, parts)))
        metadata.append(item)
```
然后，我们生成向量：
```python
print("--> 正在生成向量嵌入...")
embeddings = ef(docs)
print("--> 向量生成完成。")

# 获取两种向量
sparse_vectors = embeddings["sparse"]    # 稀疏向量：词频统计
dense_vectors = embeddings["dense"]      # 密集向量：语义编码
```
最后，我们在Collection中批量插入数据：
```python
# 为每个字段准备批量数据
img_ids = [doc["img_id"] for doc in metadata]
paths = [doc["path"] for doc in metadata]
titles = [doc["title"] for doc in metadata]
descriptions = [doc["description"] for doc in metadata]
categories = [doc["category"] for doc in metadata]
locations = [doc["location"] for doc in metadata]
environments = [doc["environment"] for doc in metadata]

# 插入数据
collection.insert([
    img_ids, paths, titles, descriptions, categories, locations, environments,
    sparse_vectors, dense_vectors
])
collection.flush()
```

前面实现过了Milvus，这里的代码阅读应该没什么困难，就是稍微麻烦了点。

## 3. 实现混合检索
milvus中已经封装好了RRF算法，首先，我们生成查询向量：
```python
# 6. 执行搜索
search_query = "悬崖上的巨龙"
search_filter = 'category in ["western_dragon", "chinese_dragon", "movie_character"]'
top_k = 5

print(f"\n{'='*20} 开始混合搜索 {'='*20}")
print(f"查询: '{search_query}'")
print(f"过滤器: '{search_filter}'")

# 生成查询向量
query_embeddings = ef([search_query])
dense_vec = query_embeddings["dense"][0]
sparse_vec = query_embeddings["sparse"]._getrow(0)
```
然后，使用 RRF 算法进行混合检索，通过 milvus 封装的 RRFRanker 实现。RRFRanker 的核心参数是 k 值（默认60），用于控制 RRF 算法中的排序平滑程度：
```python
# 定义搜索参数
search_params = {"metric_type": "IP", "params": {}}

# 先执行单独的搜索
print("\n--- [单独] 密集向量搜索结果 ---")
dense_results = collection.search(
    [dense_vec],
    anns_field="dense_vector",
    param=search_params,
    limit=top_k,
    expr=search_filter,
    output_fields=["title", "path", "description", "category", "location", "environment"]
)[0]

for i, hit in enumerate(dense_results):
    print(f"{i+1}. {hit.entity.get('title')} (Score: {hit.distance:.4f})")
    print(f"    路径: {hit.entity.get('path')}")
    print(f"    描述: {hit.entity.get('description')[:100]}...")

print("\n--- [单独] 稀疏向量搜索结果 ---")
sparse_results = collection.search(
    [sparse_vec],
    anns_field="sparse_vector",
    param=search_params,
    limit=top_k,
    expr=search_filter,
    output_fields=["title", "path", "description", "category", "location", "environment"]
)[0]

for i, hit in enumerate(sparse_results):
    print(f"{i+1}. {hit.entity.get('title')} (Score: {hit.distance:.4f})")
    print(f"    路径: {hit.entity.get('path')}")
    print(f"    描述: {hit.entity.get('description')[:100]}...")

print("\n--- [混合] 稀疏+密集向量搜索结果 ---")
# 创建 RRF 融合器
rerank = RRFRanker(k=60)

# 创建搜索请求
dense_req = AnnSearchRequest([dense_vec], "dense_vector", search_params, limit=top_k)
sparse_req = AnnSearchRequest([sparse_vec], "sparse_vector", search_params, limit=top_k)

# 执行混合搜索
results = collection.hybrid_search(
    [sparse_req, dense_req],
    rerank=rerank,
    limit=top_k,
    output_fields=["title", "path", "description", "category", "location", "environment"]
)[0]

# 打印最终结果
for i, hit in enumerate(results):
    print(f"{i+1}. {hit.entity.get('title')} (Score: {hit.distance:.4f})")
    print(f"    路径: {hit.entity.get('path')}")
    print(f"    描述: {hit.entity.get('description')[:100]}...")
```

最终输出结果如下：
```txt
--- [单独] 密集向量搜索结果 ---
1. 悬崖上的白龙 (Score: 0.7219)
    路径: ../../data/C3/dragon/dragon02.png
    描述: 一头雄伟的白色巨龙栖息在悬崖边缘，背景是金色的云霞和远方的海岸。它拥有巨大的翅膀和优雅的身姿，是典型的西方奇幻生物。...
2. 中华金龙 (Score: 0.5131)
    路径: ../../data/C3/dragon/dragon06.png
    描述: 一条金色的中华龙在祥云间盘旋，它身形矫健，龙须飘逸，展现了东方神话中龙的威严与神圣。...
3. 驯龙高手：无牙仔 (Score: 0.5119)
    路径: ../../data/C3/dragon/dragon05.png
    描述: 在电影《驯龙高手》中，主角小嗝嗝骑着他的龙伙伴无牙仔在高空飞翔。他们飞向灿烂的太阳，下方是岛屿和海洋，画面充满了冒险与友谊。...

--- [单独] 稀疏向量搜索结果 ---
1. 悬崖上的白龙 (Score: 0.2319)
    路径: ../../data/C3/dragon/dragon02.png
    描述: 一头雄伟的白色巨龙栖息在悬崖边缘，背景是金色的云霞和远方的海岸。它拥有巨大的翅膀和优雅的身姿，是典型的西方奇幻生物。...
2. 中华金龙 (Score: 0.0923)
    路径: ../../data/C3/dragon/dragon06.png
    描述: 一条金色的中华龙在祥云间盘旋，它身形矫健，龙须飘逸，展现了东方神话中龙的威严与神圣。...
3. 驯龙高手：无牙仔 (Score: 0.0691)
    路径: ../../data/C3/dragon/dragon05.png
    描述: 在电影《驯龙高手》中，主角小嗝嗝骑着他的龙伙伴无牙仔在高空飞翔。他们飞向灿烂的太阳，下方是岛屿和海洋，画面充满了冒险与友谊。...

--- [混合] 稀疏+密集向量搜索结果 ---
1. 悬崖上的白龙 (Score: 0.0328)
    路径: ../../data/C3/dragon/dragon02.png
    描述: 一头雄伟的白色巨龙栖息在悬崖边缘，背景是金色的云霞和远方的海岸。它拥有巨大的翅膀和优雅的身姿，是典型的西方奇幻生物。...
2. 中华金龙 (Score: 0.0320)
    路径: ../../data/C3/dragon/dragon06.png
    描述: 一条金色的中华龙在祥云间盘旋，它身形矫健，龙须飘逸，展现了东方神话中龙的威严与神圣。...
3. 霸王龙的怒吼 (Score: 0.0318)
    路径: ../../data/C3/dragon/dragon03.png
    描述: 史前时代的霸王龙张开血盆大口，发出震天的怒吼。在它身后，几只翼龙在阴沉的天空中盘旋，展现了白垩纪的原始力量。...
4. 奔跑的奶龙 (Score: 0.0313)
    路径: ../../data/C3/dragon/dragon04.png
    描述: 一只Q版的黄色小恐龙，有着大大的绿色眼睛和友善的微笑。是一部动画中的角色，非常可爱。...
5. 驯龙高手：无牙仔 (Score: 0.0310)
    路径: ../../data/C3/dragon/dragon05.png
    描述: 在电影《驯龙高手》中，主角小嗝嗝骑着他的龙伙伴无牙仔在高空飞翔。他们飞向灿烂的太阳，下方是岛屿和海洋，画面充满了冒险与友谊。...
```
