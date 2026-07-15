#!/usr/bin/env python3
"""citation_chronology — Build a timeline of research milestones from papers."""
import sys, re, json

def extract_papers(text):
    papers = []
    for block in re.split(r'\n{2,}', text):
        lines = [l.strip() for l in block.splitlines() if l.strip()]
        if len(lines) >= 2:
            title = lines[0].replace('-', '').strip()
            year_match = re.search(r'(20\d{2}|19\d{2})', ' '.join(lines[:3]))
            year = year_match.group(1) if year_match else 'unknown'
            summary = ' '.join(lines[1:3])[:300]
            papers.append({'year': year, 'title': title, 'summary': summary})
    return sorted(papers, key=lambda x: x['year'])

def main():
    text = sys.stdin.read() if len(sys.argv) == 1 else sys.argv[1]
    papers = extract_papers(text)
    if not papers:
        print('No papers found. Provide paper titles/dates.')
        return
    print('# Citation Chronology')
    print('')
    for p in papers:
        print(f"### {p['year']} — {p['title']}")
        print(f"{p['summary']}")
        print('')
    print(f"Total papers: {len(papers)}")

if __name__ == "__main__":
    main()
