import sys
import re
from collections import defaultdict

def extract_battery_costs(text):
    """Extract battery lifecycle cost data from text."""
    cost_data = defaultdict(dict)
    
    # Patterns for different battery types
    patterns = {
        'lithium': r'\b(lithium-ion|li-ion)\b.*?cost.*?\$(\d+(?:\.\d+)?)\b',
        'sodium': r'\b(sodium-ion|na-ion)\b.*?cost.*?\$(\d+(?:\.\d+)?)\b',
        'cycle': r'cycle.*?cost.*?\$(\d+(?:\.\d+)?)\b',
        'lifetime': r'lifetime.*?cost.*?\$(\d+(?:\.\d+)?)\b'
    }
    
    for battery_type, pattern in patterns.items():
        matches = re.findall(pattern, text, re.IGNORECASE)
        if matches:
            if battery_type in ['lithium', 'sodium']:
                cost_data[battery_type]['cost_per_kwh'] = float(matches[0][1])
            else:
                cost_data[battery_type][battery_type + '_cost'] = float(matches[0][1])
    
    return cost_data

def analyze_cost_comparison(cost_data):
    """Analyze cost comparison between battery types."""
    if 'lithium' in cost_data and 'sodium' in cost_data:
        lithium_cost = cost_data['lithium'].get('cost_per_kwh', 0)
        sodium_cost = cost_data['sodium'].get('cost_per_kwh', 0)
        
        if lithium_cost and sodium_cost:
            cost_diff = ((lithium_cost - sodium_cost) / lithium_cost) * 100
            return f"Sodium-ion is {cost_diff:.1f}% cheaper per kWh than lithium-ion"
    return "Insufficient data for comparison"

def main():
    try:
        if len(sys.argv) < 2:
            print("Usage: python battery_lifecycle_cost_analysis_extractor.py <input_text>")
            return
        
        input_text = sys.argv[1]
        cost_data = extract_battery_costs(input_text)
        comparison = analyze_cost_comparison(cost_data)
        
        print("Extracted Cost Data:")
        for battery_type, data in cost_data.items():
            print(f"{battery_type.replace('_', '-').title()}: {data}")
        print(f"Analysis: {comparison}")
        
    except Exception as e:
        print(f"Error: {str(e)}")

if __name__ == "__main__":
    main()