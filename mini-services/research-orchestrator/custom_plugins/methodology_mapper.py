#!/usr/bin/env python3
"""methodology_mapper — Extract methods from a research paper text."""
import sys, re

def extract_methods(text):
    patterns = [
        r'we use\w+ (.{0,100})',
        r'our method\w+ (.{0,100})',
        r'we propose\w+ (.{0,100})',
        r'we evaluate (.{0,100})',
        r'we compare (.{0,100})',
    ]
    methods = []
    for pat in patterns:
        for m in re.finditer(pat, text, re.I):
            methods.append(m.group(1).strip())
    return list(dict.fromkeys(methods))[:10]

def main():
    text = sys.stdin.read() if len(sys.argv) == 1 else sys.argv[1]
    methods = extract_methods(text)
    if not methods:
        print('No methods found. Provide paper text.')
        return
    print('# Methods Extracted')
    for i, m in enumerate(methods, 1):
        print(f"{i}. {m}")

if __name__ == "__main__":
    main()
