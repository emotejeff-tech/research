#!/usr/bin/env python3
"""debate_matrix — Build a debate matrix comparing positions on an issue."""
import sys, re

def extract_positions(text):
    positions = []
    for p in re.split(r'\n\s*\n', text):
        lines = [l.strip() for l in p.splitlines() if l.strip()]
        if len(lines) >= 2:
            title = lines[0].replace('-', '').strip()
            body = ' '.join(lines[1:])[:500]
            positions.append((title, body))
    return positions

def main():
    text = sys.stdin.read() if len(sys.argv) == 1 else sys.argv[1]
    positions = extract_positions(text)
    if not positions:
        print('No positions found. Provide position arguments or paste text.')
        return
    print('# Debate Matrix')
    print('')
    print('| Position | Argument |')
    print('|----------|----------|')
    for title, body in positions:
        print(f"| {title} | {body.replace('|', '/')} |")

if __name__ == "__main__":
    main()
