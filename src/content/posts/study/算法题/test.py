def solution(s: str, p: str) -> list[int]:
    ans = []
    need = {}
    window = {}
    left, right = 0, 0
    valid = 0

    for c in p:
        need[c] = need.get(c, 0) + 1

    while right < len(s):
        c = s[right]
        right += 1
        # 只统计需要的
        if c in need:
            window[c] = window.get(c, 0) + 1
            if window[c] == need[c]:
                valid += 1

        # 固定窗口长度，超过 len(p) 就收缩
        while right - left > len(p):
            d = s[left]
            left += 1

            if d in need:
                if window[d] == need[d]:
                    valid -= 1
                window[d] -= 1

        # 长度刚好且所有字符频次都匹配，记录答案
        if right - left == len(p) and valid == len(need):
            ans.append(left)

    return ans


if __name__ == "__main__":
    s = input().strip()
    p = input().strip()
    print(solution(s, p))
