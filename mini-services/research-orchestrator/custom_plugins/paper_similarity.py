#!/usr/bin/env python3
"""paper_similarity — Compare papers by title/abstract similarity."""
import sys, re, math

def vectorize(text):
    words = re.findall(r'[a-zA-Z]{4,}', text.lower())
    return {w: words.count(w) for w in set(words)}

def cosine(v1, v2):
    common = set(v1) & set(v2)
    dot = sum(v1[k] * v2[k] for k in common)
    n1 = math.sqrt(sum(v * v for v in v1.values()))
    n2 = math.sqrt(sum(v * v for v in v2.values()))
    return dot / (n1 * n2) if n1 and n2 else 0

def main():
    if len(sys.argv) < 3:
        print('Usage: paper_similarity paper1.txt paper2.txt')
        return
    with open(sys.argv[1], 'r') as f: t1 = f.read()
    with open(sys.argv[2], 'r') as f: t2 = f.read()
    score = cosine(vectorize(t1), vectorize(t2))
    print(f"Similarity: {score:.3f}")

if __name__ == "__main__":
    main()
