import sys
import re
from collections import defaultdict

def extract_standardize_markers(text):
    markers = defaultdict(list)
    
    # Define common metabolic markers and their synonyms
    marker_synonyms = {
        'glucose': ['glucose', 'blood sugar', 'fasting glucose'],
        'insulin': ['insulin', 'fasting insulin'],
        'cholesterol': ['cholesterol', 'total cholesterol', 'ldl', 'hdl'],
        'triglycerides': ['triglycerides', 'tg'],
        'weight': ['weight', 'body weight'],
        'bmi': ['bmi', 'body mass index'],
        'waist': ['waist circumference', 'waist'],
        'blood_pressure': ['blood pressure', 'bp', 'systolic', 'diastolic']
    }
    
    # Extract numeric values with units
    pattern = r'(?:' + '|'.join([re.escape(s) for synonyms in marker_synonyms.values() for s in synonyms]) + r')\s*[:\-]?\s*(\d+\.?\d*)\s*(mg/dL|mmol/L|mg/dl|mmol/l|kg|cm|mmhg)'
    matches = re.findall(pattern, text, re.IGNORECASE)
    
    for match in matches:
        value, unit = match
        marker_found = False
        
        for marker, synonyms in marker_synonyms.items():
            for synonym in synonyms:
                if synonym.lower() in text[match.start()-50:match.start()].lower():
                    markers[marker].append((float(value), unit))
                    marker_found = True
                    break
            if marker_found:
                break
    
    return dict(markers)

def main():
    try:
        if len(sys.argv) < 2:
            print("Error: Please provide text input as argument")
            return
        
        input_text = sys.argv[1]
        standardized_markers = extract_standardize_markers(input_text)
        
        if not standardized_markers:
            print("No metabolic markers found in the input text")
        else:
            for marker, values in standardized_markers.items():
                print(f"{marker.title()}: {values}")
    except Exception as e:
        print(f"Error processing input: {str(e)}")

if __name__ == "__main__":
    main()