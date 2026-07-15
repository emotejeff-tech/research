#!/usr/bin/env python3
"""paper_search_web — Search arXiv and return clean Markdown links."""
import sys, urllib.request, urllib.parse, re, html

def search(topic, max_results=10):
    query = urllib.parse.quote(f'all:{topic}')
    url = f'http://export.arxiv.org/api/query?search_query={query}&start=0&max_results={max_results}&sortBy=submittedDate&sortOrder=descending'
    raw = urllib.request.urlopen(url, timeout=30).read().decode('utf-8')
    results = []
    for m in re.finditer(r'<entry>(.*?)</entry>', raw, re.S):
        e = m.group(1)
        title = html.unescape(re.sub(r'<[^>]+>', ' ', re.search(r'<title>(.*?)</title>', e, re.S).group(1))).strip()
        link = re.search(r'<id>(.*?)</id>', e, re.S).group(1).strip()
        results.append((title, link))
    return results

def main():
    topic = sys.argv[1] if len(sys.argv) > 1 else 'large language models'
    for i, (title, link) in enumerate(search(topic), 1):
        print(f"[{i}] {title}")
        print(f"   {link}")

if __name__ == "__main__":
    main()
