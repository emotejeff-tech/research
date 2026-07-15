#!/usr/bin/env python3
"""idea_generator — Generate research ideas from a topic and constraints."""
import sys, random

def generate_ideas(topic, n=5):
    ideas = []
    for i in range(n):
        ideas.append(f"- Explore how {topic} could be improved using a hybrid approach combining traditional methods with modern AI techniques. Focus on practical deployment, measurable gains, and failure modes.")
    return ideas

def main():
    topic = sys.argv[1] if len(sys.argv) > 1 else 'large language models'
    print('# Research Ideas')
    print('')
    for idea in generate_ideas(topic):
        print(idea)

if __name__ == "__main__":
    main()
