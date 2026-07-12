import sys
import json
import re
from datetime import datetime

def extract_aha_moments(text):
    """Extract aha moments with temporal context from text"""
    aha_moments = []
    
    # Pattern to match aha moments with temporal indicators
    patterns = [
        r'(?:latest|recent|new|breakthrough)\s+(?:ai|artificial intelligence)\s+(?:achievement|discovery|advancement|development)',
        r'(?:202[0-9]|202[0-9]\s+|twenty twenty\d{1,2})\s+(?:ai|artificial intelligence)\s+(?:breakthrough|milestone)',
        r'(?:gpt|claude|gemini|llama)\s+(?:\d+|version)\s+(?:released|announced|launched)',
        r'(?:major|significant)\s+(?:ai|artificial intelligence)\s+(?:leap|progress|advancement)\s+in\s+\d{4}'
    ]
    
    for pattern in patterns:
        matches = re.finditer(pattern, text, re.IGNORECASE)
        for match in matches:
            # Extract context around the match
            start = max(0, match.start() - 100)
            end = min(len(text), match.end() + 100)
            context = text[start:end].strip()
            
            # Extract year if available
            year_match = re.search(r'(202[0-9]|twenty twenty\d{1,2})', context, re.IGNORECASE)
            year = year_match.group(1) if year_match else 'unknown'
            
            aha_moments.append({
                'moment': match.group(),
                'context': context,
                'year': year,
                'timestamp': datetime.now().isoformat()
            })
    
    return sorted(aha_moments, key=lambda x: x['year'], reverse=True)[:10]

def main():
    try:
        if len(sys.argv) < 2:
            print(json.dumps({'error': 'Please provide input text'}))
            return
        
        input_text = sys.argv[1]
        moments = extract_aha_moments(input_text)
        
        if not moments:
            print(json.dumps({'message': 'No aha moments found'}))
        else:
            print(json.dumps(moments, indent=2))
            
    except Exception as e:
        print(json.dumps({'error': str(e)}))

if __name__ == "__main__":
    main()