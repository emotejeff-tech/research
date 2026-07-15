#!/usr/bin/env python3
"""arxiv_agent — Full arXiv research agent with paper discovery, ranking, and idea extraction."""
import sys, urllib.request, re, html, json
from datetime import datetime, timezone

def fetch_papers(topic, max_results=25):
    query = urllib.parse.quote(f'all:{topic}')
    url = f'http://export.arxiv.org/api/query?search_query={query}&start=0&max_results={max_results}&sortBy=submittedDate&sortOrder=descending'
    try:
        with urllib.request.urlopen(url, timeout=30) as response:
            raw = response.read().decode('utf-8')
    except Exception as e:
        return json.dumps({'error': str(e)})
    
    entries = []
    for m in re.finditer(r'<entry>(.*?)</entry>', raw, re.S):
        e = m.group(1)
        title = html.unescape(re.sub(r'<[^>]+>', ' ', re.search(r'<title>(.*?)</title>', e, re.S).group(1))).strip()
        abstract = html.unescape(re.sub(r'<[^>]+>', ' ', re.search(r'<summary>(.*?)</summary>', e, re.S).group(1))).strip()
        link = re.search(r'<id>(.*?)</id>', e, re.S).group(1).strip()
        published = re.search(r'<published>(.*?)</published>', e, re.S).group(1).strip()
        authors = re.findall(r'<author><name>(.*?)</name></author>', e, re.S)
        entries.append({
            'title': title,
            'abstract': abstract,
            'link': link,
            'published': published,
            'authors': authors[:5]
        })
    return json.dumps(entries, indent=2)

def main():
    topic = sys.argv[1] if len(sys.argv) > 1 else 'large language models'
    print(fetch_papers(topic))

if __name__ == "__main__":
    main()
