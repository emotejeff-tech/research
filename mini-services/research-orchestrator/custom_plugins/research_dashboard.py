#!/usr/bin/env python3
"""research_dashboard — Generate a summary dashboard from research notes."""
import sys, re

def summarize(text):
    words = re.findall(r'[a-zA-Z]{4,}', text.lower())
    counts = {}
    for w in words:
        counts[w] = counts.get(w, 0) + 1
    top = sorted(counts.items(), key=lambda x: x[1], reverse=True)[:15]
    return top

def main():
    text = sys.stdin.read() if len(sys.argv) == 1 else sys.argv[1]
    top = summarize(text)
    print('# Research Dashboard')
    print('')
    print('## Top Concepts')
    for word, count in top:
        print(f"- {word}: {count}x")
    print('')
    print('## Quick Summary')
    print(text[:800])

if __name__ == "__main__":
    main()
