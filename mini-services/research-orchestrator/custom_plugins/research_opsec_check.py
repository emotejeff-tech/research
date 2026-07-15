#!/usr/bin/env python3
"""research_opsec_check — Check research output for sensitive info leaks."""
import sys, re

def scrub(text):
    patterns = [
        (r'[A-Za-z0-9_\-]{20,}', 'REDACTED'),
        (r'AKIA[0-9A-Z]{16}', 'REDACTED'),
        (r'AIza[0-9A-Za-z\-_]{35}', 'REDACTED'),
        (r'ghp_[0-9a-zA-Z]{36}', 'REDACTED'),
        (r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', 'REDACTED'),
        (r'/Users/[A-Za-z0-9._/-]+', 'REDACTED'),
        (r'/home/[A-Za-z0-9._/-]+', 'REDACTED'),
    ]
    for pat, repl in patterns:
        text = re.sub(pat, repl, text)
    return text

def main():
    text = sys.stdin.read() if len(sys.argv) == 1 else sys.argv[1]
    before = len(text)
    after = scrub(text)
    count = before - len(after)
    print(f"Scrubbed {count} character(s) of sensitive info.")
    print(after[:4000])

if __name__ == "__main__":
    main()
