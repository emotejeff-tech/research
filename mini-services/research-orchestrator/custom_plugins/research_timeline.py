#!/usr/bin/env python3
"""research_timeline — Build a timeline of major events in a topic."""
import sys, re

def build_timeline(text):
    events = []
    for m in re.finditer(r'(20\d{2})\s*-\s*(.+?)(?=\n|$)', text, re.I):
        year, event = m.group(1), m.group(2).strip()
        events.append((year, event[:150]))
    return sorted(events)

def main():
    text = sys.stdin.read() if len(sys.argv) == 1 else sys.argv[1]
    events = build_timeline(text)
    if not events:
        print('No timeline events found.')
        return
    print('# Research Timeline')
    for year, event in events:
        print(f"{year} — {event}")

if __name__ == "__main__":
    main()
