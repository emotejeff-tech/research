#!/usr/bin/env python3
"""claim_evidence_checker — Check claims against source evidence."""
import sys, re

def extract_claims(text):
    claims = re.findall(r'([A-Z][^.!?]{20,200}[.!?])', text)
    return claims[:10]

def score_claim(claim, sources):
    words = set(re.findall(r'[a-zA-Z]{4,}', claim.lower()))
    if not words:
        return 0
    matches = 0
    for s in sources:
        sw = set(re.findall(r'[a-zA-Z]{4,}', s.lower()))
        matches += len(words & sw)
    return matches / max(1, len(words))

def main():
    sources = sys.argv[1] if len(sys.argv) > 1 else ""
    sources = sources.split('||') if sources else []
    text = sys.stdin.read() if len(sys.argv) == 1 else sys.argv[1]
    for claim in extract_claims(text):
        score = score_claim(claim, sources)
        verdict = 'weak' if score < 0.15 else 'moderate' if score < 0.3 else 'strong'
        print(f"- Claim: {claim[:120]} ... [support: {score:.2f}] {verdict}")

if __name__ == "__main__":
    main()
