import ast

def solution(nums:list,k:int) -> int:
    left,right = 0,0
    count = 0
    total = 0
    while right<len(nums):
        c = nums[right]
        right += 1
        total += c
        while total > k:
            d = nums[left]
            left += 1
            total -= d
        if total == k:
            count += 1
    return count
    


if __name__ == "__main__":
    nums = ast.literal_eval(input().strip())
    k = int(input().strip())
    print(solution(nums,k))
