#!/usr/bin/env python3
"""claim_debunker — Flag weak, unsupported, or suspicious claims."""
import sys, re

WEAK_PATTERNS = [
    r'obviously', r'everyone knows', r'clearly', r'undoubtedly',
    r'proves that', r'guarantees', r'always', r'never'
]

def flag_claims(text):
    claims = re.findall(r'([A-Z][^.!?]{30,300}[.!?])', text)
    flagged = []
    for c in claims:
        low = c.lower()
        hits = [p for p in WEAK_PATTERNS if p in low]
        if hits:
            flagged.append((c[:150], ', '.join(hits)))
    return flagged

def main():
    text = sys.stdin.read() if len(sys.argv) == 1 else sys.argv[1]
    flagged = flag_claims(text)
    if not flagged:
        print('No weak claims detected.')
        return
    print('# Claims to Verify')
    for c, hits in flagged:
        print(f"- {c} ... [flags: {hits}]")

if __name__ == "__main__":
    main()
