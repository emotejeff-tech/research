#!/usr/bin/env python3
"""research_primer — Create a beginner-friendly primer on a topic."""
import sys

def primer(topic):
    return f"""# Beginner Primer: {topic}

## What It Is
{topic} is a research topic that has attracted significant attention because of its practical and theoretical importance.

## Why It Matters
- It affects how systems are built and deployed
- It has implications for future research directions
- It connects to multiple other fields

## Key Concepts to Learn
1. Core terminology
2. Main approaches
3. Common challenges
4. Recent breakthroughs

## Suggested First Papers
- Search arXiv for survey papers on {topic}
- Look for papers with high citation counts
- Start with the most recent survey articles
"""

def main():
    topic = sys.argv[1] if len(sys.argv) > 1 else 'large language models'
    print(primer(topic))

if __name__ == "__main__":
    main()
