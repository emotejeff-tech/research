#!/usr/bin/env python3
"""research_question_builder — Generate sharp research questions from a topic."""
import sys, re

def build_questions(topic):
    return [
        f"What is the strongest evidence that {topic} works?",
        f"What are the main failure modes of {topic}?",
        f"How does {topic} compare to traditional approaches?",
        f"What would make {topic} fail in real-world deployment?",
        f"What recent advances could change the outlook for {topic}?",
    ]

def main():
    topic = sys.argv[1] if len(sys.argv) > 1 else 'large language models'
    print('# Research Questions')
    print('')
    for q in build_questions(topic):
        print(f"- {q}")

if __name__ == "__main__":
    main()
