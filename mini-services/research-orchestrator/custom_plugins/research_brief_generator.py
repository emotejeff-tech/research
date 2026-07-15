#!/usr/bin/env python3
"""research_brief_generator — Generate a structured research brief from raw notes."""
import sys, re

def brief(topic):
    return f"""# Research Brief: {topic}

## Core Question
What is the current state of research on {topic}?

## Key Areas to Explore
1. What are the leading methods?
2. What evidence supports them?
3. What are the open problems?
4. What are the practical deployment risks?

## Suggested Sources
- arXiv papers from the last 2 years
- Survey papers and review articles
- Official documentation from leading labs
- Recent conference proceedings

## Output Format
- 1-2 page executive summary
- Evidence table with citations
- Open questions and next steps
"""

def main():
    topic = sys.argv[1] if len(sys.argv) > 1 else 'large language models'
    print(brief(topic))

if __name__ == "__main__":
    main()
