---
title: Python的ACM模式基础
published: 2026-03-21
description: 练习ACM模式的几种情况。
tags: [算法]
category: Hot 100
draft: false
comment: true
---

# 一、单行输入
对10个整数从小到大排序，处理10个整数，并打印出来

```python3 title="case1"
# 程序入口
# 输入
if __name__=="__main__":
    # 去掉输如字符串的前后空格，然后分割成数组
    # 输入元素：
    # 4 85 3 234 45 345 345 122 30 12
    # 下面这句也可以写成list(map(lambda x: int(x),input().strip().split()))
    data = list(map(int,input().strip().split()))
    data.sort()
    print(" ".join(map(str,data)))
```

# 二、多行输入，不确定行数
给定正整数A和B，计算A+B

```python3 title="case2"
if __name__ == "__main__":
    # 不确定函数，我们需要while循环
    # 输入元素：
    """
    1 1
    2 3
    """
    while True:
        # 这里的map是一个迭代器
        # 用try来接受文件结束错误
        try:
            a,b = map(int,input().strip().split())
            print(a+b)
        except EOFError:
            break
```
# 三、多行输入，确定行数
输入一个n，然后再输入n组数据样例，返回他们的和

```python3 title="case3"
if __name__ == "__main__":
    n = int(input().strip())
    for i in range(n):
        a, b = map(int,input().strip().split())
        print(a+b)
```

# 四、多行输入，指定结束符号
还是两数之和，指定0 0结束

```python3 title = "case4"
if __name__ == "__main__":
    n = int(input().strip())
    for i in range(n):
        a,b = map(int,input().strip().split())
        if a == 0 and b == 0:
            break
        print(a + b)
```

# 五、不确定行数，不确定个数
输入多组数据样例，每组数据占一行，每一行的输入划分为第一个数和其他数，第一个数代表后面多少数求和，返回和。

```python3 title="case5"
if __name__ == "__main__":
    while True:
        try:
            data = list(map(int,input().strip().split()))
            n,array = data[0],data[1:]
            print(sum(array))
        except EOFError:
            break
```

# 六、确定行数不确定个数
先输入n，然后给n行，每行个数不确定，返回和

```python3 title= "case6"
if __name__ == "__main__":
    n = int(input().strip())
    for _ in range(n):
        data = list(map(int,input().strip().split()))
        print(sum(data))
```

# 七、多行输入，不确定类型
给定 `n`，然后输入 `n` 行，每行包含成绩单信息。

输出三行，第一行语文最好的学生姓名学科分数，第二行数学成绩最好的学生姓名学科分数，第三行英语成绩最好的学生姓名学科分数。

```python3 title="case7"
def number_or_chars(x):
    if x.isdigit():
        return int(x)
    else:
        return x

if __name__ == "__main__":
    n = int(input().strip())
    info = []
    for _ in range(n):
        data = list(map(number_or_chars,input().strip().split()))
        info.append(data)

    max_c = 0
    max_c_id = 0
    max_m = 0
    max_m_id = 0
    max_e = 0
    max_e_id = 0

    for i, each in enumerate(info):
        if max_c < each[3]:
            max_c = each[3]
            max_c_id = i
        if max_m < each[5]:
            max_m = each[5]
            max_m_id = i
        if max_e < each[7]:
            max_e = each[7]
            max_e_id = i

    print(info[max_c_id][0],info[max_c_id][2],info[max_c_id][3])
    print(info[max_m_id][0],info[max_m_id][4],info[max_m_id][5])
    print(info[max_e_id][0],info[max_e_id][6],info[max_e_id][7])
```

# 八、`sys.stdin` 的几种常见写法
等价于不断读到 `EOF` 为止，一行一行读入，不用自己写 `while True + try/except`。一般有如下三种情况：

## 1. 逐行读到 EOF

```python3 title="case8"
import sys

for line in sys.stdin:
    nums = list(map(int, line.split()))
    print(sum(nums))
```

## 2. 一次性读完

```python3 title="case9"
import sys

data = sys.stdin.read().split()
nums = list(map(int, data))
print(sum(nums))
```

## 3. 代替 `input()` 提速

```python3 title="case10"
import sys

input = sys.stdin.readline

n = int(input().strip())
for _ in range(n):
    a, b = map(int, input().split())
    print(a + b)
```

# 九、`ast.literal_eval` 解析嵌套结构
有些题目的本地输入会直接写成 Python 风格的嵌套列表，比如：

```text
[[1,2],[3,4],[5,6]]
```

或者像随机链表那样：

```text
[[7,null],[13,0],[11,4],[10,2],[1,0]]
```

这时候如果手动 `split` 会很麻烦，用 `ast.literal_eval` 往往更省事。

它的作用是：安全地把“字符串形式的字面量”解析成真正的 Python 数据结构。

```python3 title="case11"
import ast

if __name__ == "__main__":
    line = input().strip()
    data = ast.literal_eval(line)
    print(data)
```

例如输入：

```text
[[1,2],[3,4],[5,6]]
```

输出就是：

```text
[[1, 2], [3, 4], [5, 6]]
```

如果输入里有 `null`，Python 不认识，需要先替换成 `None`：

```python3 title="case12"
import ast

if __name__ == "__main__":
    line = input().strip()
    data = ast.literal_eval(line.replace("null", "None"))
    print(data)
```

这个方法特别适合：

- 二维数组
- 嵌套列表
- 树、图、随机链表这类带结构的本地模拟输入

注意这里一般用的是 `ast.literal_eval`，而不是 `eval`，因为前者更安全，只会解析字面量，不会执行任意代码。
