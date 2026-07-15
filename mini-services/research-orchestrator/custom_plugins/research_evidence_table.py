#!/usr/bin/env python3
"""research_evidence_table — Build an evidence table from claims and sources."""
import sys, re

def make_table(claims, sources):
    rows = []
    for claim in claims:
        words = set(re.findall(r'[a-zA-Z]{4,}', claim.lower()))
        matched = []
        for s in sources:
            sw = set(re.findall(r'[a-zA-Z]{4,}', s.lower()))
            if words & sw:
                matched.append(s[:80])
        rows.append((claim, matched))
    return rows

def main():
    text = sys.stdin.read() if len(sys.argv) == 1 else sys.argv[1]
    sources = text.split('||') if '||' in text else []
    if not sources:
        print('No sources found. Use || to separate sources.')
        return
    claims = re.findall(r'([A-Z][^.!?]{20,200}[.!?])', text)
    rows = make_table(claims, sources)
    print('# Evidence Table')
    print('')
    print('| Claim | Supporting Source |')
    print('|-------|-------------------|')
    for c, s in rows:
        print(f"| {c[:120]} | {s} |")

if __name__ == "__main__":
    main()
