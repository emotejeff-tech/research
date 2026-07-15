#!/usr/bin/env python3
"""research_knowledge_graph — Extract entities and relationships from text."""
import sys, re

def extract_entities(text):
    ents = re.findall(r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\b', text)
    return list(dict.fromkeys(ents))[:30]

def extract_rels(text):
    rels = []
    for m in re.finditer(r'([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\s+(?:is|uses|improves|compares|replaces)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})', text):
        rels.append((m.group(1), m.group(2)))
    return rels[:20]

def main():
    text = sys.stdin.read() if len(sys.argv) == 1 else sys.argv[1]
    ents = extract_entities(text)
    rels = extract_rels(text)
    print('# Knowledge Graph')
    print('')
    print('## Entities')
    for e in ents:
        print(f"- {e}")
    print('')
    print('## Relationships')
    for a, b in rels:
        print(f"- {a} → {b}")

if __name__ == "__main__":
    main()
