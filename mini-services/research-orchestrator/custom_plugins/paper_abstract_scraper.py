#!/usr/bin/env python3
"""paper_abstract_scraper — Fetch abstracts from arXiv and save to markdown."""
import sys, urllib.request, urllib.parse, re, html

def fetch(topic, max_results=20):
    query = urllib.parse.quote(f'all:{topic}')
    url = f'http://export.arxiv.org/api/query?search_query={query}&start=0&max_results={max_results}&sortBy=submittedDate&sortOrder=descending'
    raw = urllib.request.urlopen(url, timeout=30).read().decode('utf-8')
    out = ['# arXiv Papers', f'## {topic}', '']
    for m in re.finditer(r'<entry>(.*?)</entry>', raw, re.S):
        e = m.group(1)
        title = html.unescape(re.sub(r'<[^>]+>', ' ', re.search(r'<title>(.*?)</title>', e, re.S).group(1))).strip()
        abstract = html.unescape(re.sub(r'<[^>]+>', ' ', re.search(r'<summary>(.*?)</summary>', e, re.S).group(1))).strip()
        link = re.search(r'<id>(.*?)</id>', e, re.S).group(1).strip()
        out.extend([f'## {title}', abstract, f'[paper]({link})', ''])
    return '\n'.join(out)

def main():
    topic = sys.argv[1] if len(sys.argv) > 1 else 'large language models'
    print(fetch(topic))

if __name__ == "__main__":
    main()
