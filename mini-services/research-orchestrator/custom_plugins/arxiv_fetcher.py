import urllib.request, json, re

def fetch_arxiv(topic, max_results=5):
    url = f"http://export.arxiv.org/api/query?search_query=all:{topic}&max_results={max_results}"
    raw = urllib.request.urlopen(url, timeout=20).read().decode()
    titles = re.findall(r"<title>(.*?)</title>", raw, re.S)
    return titles[1:]

if __name__ == "__main__":
    import sys
    topic = sys.argv[1] if len(sys.argv) > 1 else "large language models"
    for t in fetch_arxiv(topic):
        print("-", t.strip())