import sys
import re

def main():
    try:
        if len(sys.argv) < 2:
            print("Usage: python extract_aha_moments_from_text.py 'your text here'")
            return
        
        text = sys.argv[1]
        aha_keywords = ["aha", "realized", "suddenly", "understood", "got it", "breakthrough", "epiphany", "clarity", "finally", "of course", "makes sense"]
        
        sentences = re.split(r'(?<!\w\.\w.)(?<![A-Z][a-z]\.)(?<=\.|\?|\!)\s', text)
        aha_moments = []
        
        for sentence in sentences:
            sentence_lower = sentence.lower()
            if any(keyword in sentence_lower for keyword in aha_keywords):
                aha_moments.append(sentence.strip())
        
        if not aha_moments:
            print("No aha moments found in the text.")
        else:
            print("Top 4 Aha Moments:")
            for i, moment in enumerate(aha_moments[:4], 1):
                print(f"{i}. {moment}")
    except Exception as e:
        print(f"Error: {str(e)}")

if __name__ == "__main__":
    main()