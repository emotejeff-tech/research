#!/usr/bin/env python3
"""gap_finder — Identify research gaps from a literature review."""
import sys, re

def find_gaps(text):
    gaps = []
    for phrase in re.findall(r'\b(gap|limitation|future work|unresolved|unknown|lack of|not yet|still unknown)\b', text, re.I):
        start = max(0, text.lower().find(phrase.lower()) - 100)
        end = min(len(text), start + 300)
        gaps.append(text[start:end].strip())
    return gaps[:10]

def main():
    text = sys.stdin.read() if len(sys.argv) == 1 else sys.argv[1]
    gaps = find_gaps(text)
    if not gaps:
        print('No research gaps found. Provide a literature review or paper text.')
        return
    print('# Research Gaps')
    print('')
    for i, g in enumerate(gaps, 1):
        print(f"## Gap {i}")
        print(g)
        print('')

if __name__ == "__main__":
    main()
