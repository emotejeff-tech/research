import urllib.request, re, sys

def outline(url):
    raw = urllib.request.urlopen(url, timeout=30).read()
    text = raw.decode("latin-1")
    headings = re.findall(r"\n([A-Z][A-Za-z0-9 ]{4,80})\n", text)
    seen, out = set(), []
    for h in headings:
        if h not in seen:
            seen.add(h); out.append(h.strip())
    return out[:20]

if __name__ == "__main__":
    url = sys.argv[1] if len(sys.argv) > 1 else "https://example.com/paper.pdf"
    for h in outline(url):
        print("-", h)