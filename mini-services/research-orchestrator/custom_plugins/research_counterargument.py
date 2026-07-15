#!/usr/bin/env python3
"""research_counterargument — Generate strong counterarguments to a claim."""
import sys, re

def counterargument(claim):
    return f"""# Counterargument to: {claim}

A strong counterargument would be:

1. **Assumption challenge**: This claim assumes {claim} is universally applicable, but edge cases may break it.
2. **Evidence challenge**: The supporting evidence may be limited to narrow conditions.
3. **Alternative explanation**: Other factors could explain the observed results.
4. **Practical limitations**: Real-world deployment may introduce constraints not considered.
5. **Trade-off analysis**: Improvements may come at the cost of complexity or reliability.

This gives the Critic agent stronger material for verification."""

def main():
    claim = sys.argv[1] if len(sys.argv) > 1 else 'large language models improve research synthesis'
    print(counterargument(claim))

if __name__ == "__main__":
    main()
