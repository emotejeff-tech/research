#!/usr/bin/env python3
"""paper_to_markdown — Convert paper metadata/abstracts into markdown."""
import sys, re

def to_md(paper):
    title = re.sub(r'<[^>]+>', ' ', paper.get('title', '')).strip()
    abstract = re.sub(r'<[^>]+>', ' ', paper.get('abstract', '')).strip()
    link = paper.get('link', '')
    return f"# {title}\n\n{abstract}\n\nURL: {link}"

def main():
    text = sys.stdin.read() if len(sys.argv) == 1 else sys.argv[1]
    if text.startswith('{'):
        try:
            import json
            data = json.loads(text)
            if isinstance(data, list):
                for p in data:
                    print(to_md(p))
            else:
                print(to_md(data))
        except Exception as e:
            print(text)
    else:
        print(text)

if __name__ == "__main__":
    main()
