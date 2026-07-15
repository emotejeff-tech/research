#!/usr/bin/env python3
"""source_quality_score — Score sources by credibility indicators."""
import sys, re

def score_source(url, text=''):
    score = 0
    if 'arxiv.org' in url: score += 3
    if 'nature.com' in url: score += 3
    if 'science.org' in url: score += 3
    if 'pubmed.ncbi.nlm.nih.gov' in url: score += 2
    if 'wikipedia.org' in url: score -= 1
    if 'reddit.com' in url: score -= 2
    if 'blog' in url: score -= 1
    return max(0, min(10, score))

def main():
    sources = sys.argv[1:] if len(sys.argv) > 1 else []
    if not sources:
        print('No sources provided.')
        return
    print('# Source Quality Scores')
    for s in sources:
        score = score_source(s)
        label = 'strong' if score >= 7 else 'medium' if score >= 4 else 'weak'
        print(f"- {s} [{score}/10] {label}")

if __name__ == "__main__":
    main()
