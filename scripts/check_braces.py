from pathlib import Path

text = Path('frontend/src/components/Chat.tsx').read_text()
stack = []
for idx, ch in enumerate(text):
    if ch == '{':
        stack.append(idx)
    elif ch == '}':
        if stack:
            stack.pop()
        else:
            print('Unmatched closing brace at index', idx)
            break
else:
    if stack:
        print('Unmatched opening brace at index', stack[-1])
    else:
        print('Braces balanced')
