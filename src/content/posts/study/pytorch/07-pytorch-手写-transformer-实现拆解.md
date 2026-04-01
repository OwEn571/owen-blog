---
title: PyTorch 手写 Transformer：从模块拆解到 toy task
published: 2026-03-25
description: 不直接调用 nn.Transformer，而是手写位置编码、多头注意力、Encoder / Decoder，并用一个反转序列的 toy task 跑通训练与解码。
tags: [PyTorch, Transformer, Attention]
category: Pytorch
draft: false
comment: true
---

> 这一篇主要整理自 `pytorch_using/transformer.py`。这份代码的价值不在于“重新发明一个工业级 Transformer”，而在于把 Transformer 拆成可验证、可训练、可调试的模块。

## 1. 为什么要手写一版 Transformer

直接用 `nn.Transformer` 当然更快，但我自己一直觉得，想真的理解 Transformer，至少要完整看一遍这些模块是怎么拼起来的：

- 位置编码
- padding mask
- causal mask
- scaled dot-product attention
- multi-head attention
- feed-forward
- encoder / decoder layer

把这些都走通一遍之后，再回去看高级封装，心里会稳很多。

## 2. 这份实现统一采用 `batch_first`

代码一开头就明确了形状约定：

```text
token id: [B, S]
embedding 后: [B, S, D]
```

这个约定非常好，因为后面所有 shape 变化都能围绕它来理解。

## 3. 位置编码：让模型知道“顺序”

这份实现里的 `PositionalEncoding` 很标准：

```python3
class PositionalEncoding(nn.Module):
    def __init__(self, d_model, max_len=5000):
        super().__init__()
        pe = torch.zeros(max_len, d_model, dtype=torch.float32)
        position = torch.arange(max_len, dtype=torch.float32).unsqueeze(1)
        div_term = torch.exp(
            torch.arange(0, d_model, 2, dtype=torch.float32)
            * (-math.log(10000.0) / d_model)
        )
        pe[:, 0::2] = torch.sin(position * div_term)
        pe[:, 1::2] = torch.cos(position * div_term)
        pe = pe.unsqueeze(0)
        self.register_buffer("pe", pe)

    def forward(self, x):
        s = x.size(1)
        return x + self.pe[:, :s, :]
```

这段最关键的是：

- 输入输出都保持 `[B, S, D]`
- 位置向量不是参数，而是 buffer
- 它解决的是“Attention 本身不带顺序感”的问题

## 4. Mask：谁该被遮住

这份代码把两种最重要的 mask 都单独实现了：

### 4.1 Padding Mask

```python3
def make_padding_mask(seq, pad_id=0):
    mask = (seq == pad_id)
    return mask.unsqueeze(1).unsqueeze(2)
```

它解决的是：  
补齐出来的 `PAD` 不应该参与有效注意力。

### 4.2 Causal Mask

```python3
def make_causal_mask(seq_len, device=None):
    return (
        torch.triu(torch.ones(seq_len, seq_len, device=device), diagonal=1)
        .unsqueeze(0)
        .unsqueeze(0)
        == 1
    )
```

它解决的是：  
Decoder 在生成当前 token 时，不能偷看未来位置。

## 5. Attention 的核心主线

这一段我特别喜欢原代码里写的复习清单，因为它几乎就是最短背诵版：

```text
QK^T
/ sqrt(d_k)
masked_fill
softmax
@ V
```

真正实现就是：

```python3
def scaled_dot_product_attention(q, k, v, mask=None):
    d_k = k.size(-1)
    scores = q @ k.transpose(-2, -1) / math.sqrt(d_k)
    if mask is not None:
        scores = scores.masked_fill(mask, float("-inf"))
    attn = F.softmax(scores, dim=-1)
    return attn @ v
```

这一段如果 shape 能看懂，Transformer 就已经通了一半。

## 6. Multi-Head Attention 真正增加了什么

多头注意力的重点，不只是“多做几次 attention”，而是：

- 先把同一个表示投影到不同子空间
- 每个头学不同的关注模式
- 最后再拼回来

原代码里把这条 shape 变化写得很清楚：

```text
[B, S, D]
→ [B, S, H, Dh]
→ [B, H, S, Dh]
→ attention
→ [B, S, D]
```

这是理解多头机制最值得反复看的地方。

## 7. Encoder / Decoder 是怎么组起来的

这份实现保持了 Transformer 最经典的结构：

### EncoderLayer

- self-attention
- residual + layer norm
- FFN
- residual + layer norm

### DecoderLayer

- masked self-attention
- cross-attention
- FFN
- 每段后都有 residual + layer norm

这时候 Transformer 就不再神秘了，它就是把这些标准模块一层层堆起来。

## 8. 用 toy task 跑通：反转序列

我很喜欢这份代码没有直接上复杂任务，而是先做了一个最小的可验证任务：  
把输入序列反转。

数据构造函数也写得很清楚：

```python3
def generate_reverse_data(batch_size, content_len, vocab_size, pad_id=0, bos_id=1, eos_id=2):
    content = torch.randint(3, vocab_size, (batch_size, content_len))
    bos = torch.full((batch_size, 1), bos_id, dtype=torch.long)
    eos = torch.full((batch_size, 1), eos_id, dtype=torch.long)
    src = torch.concat((bos, content, eos), dim=1)
    reversed_content = torch.flip(content, dims=[1])
    tgt = torch.concat((bos, reversed_content, eos), dim=1)
    tgt_input = tgt[:, :-1]
    tgt_output = tgt[:, 1:]
    return src, tgt_input, tgt_output
```

这段非常适合理解 seq2seq 训练里的两个关键点：

- `tgt_input` 和 `tgt_output` 是错位的
- Decoder 训练时吃的是前一个位置的真实 token

## 9. 训练循环和 greedy decode

最后这段代码把完整流程跑通了：

- 训练时：
  - `src -> encoder`
  - `tgt_input -> decoder`
  - `logits -> CrossEntropyLoss`
- 推理时：
  - 从 `BOS` 开始
  - 每次取最后一个位置的 logits
  - 贪心生成下一个 token

这就是最小版的 seq2seq 生成闭环。

## 10. 这一阶段该记住什么

如果只保留最少几句话：

1. Transformer 不是黑盒，它是多个标准模块的组合。
2. 位置编码、mask、多头注意力是最关键的三个部件。
3. 理解 shape 变化，比死背公式更重要。
4. 一个 toy task 足够把整条训练与推理链跑通。

我觉得这份手写实现最有价值的地方，不是“性能”，而是它把 Transformer 变成了一套可以亲手拆开的积木。
