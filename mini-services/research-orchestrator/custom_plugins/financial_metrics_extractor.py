import sys
import json
import re
from urllib.request import urlopen
from urllib.error import URLError

def extract_financial_metrics(url):
    try:
        with urlopen(url) as response:
            content = response.read().decode('utf-8')
            
        # Extract reusable vehicle metrics
        reusable_cost = re.search(r'reusable.*cost.*\$([\d,]+)', content, re.IGNORECASE)
        reusable_reuse = re.search(r'reuse.*([\d]+).*times', content, re.IGNORECASE)
        
        # Extract traditional vehicle metrics
        traditional_cost = re.search(r'traditional.*cost.*\$([\d,]+)', content, re.IGNORECASE)
        traditional_single = re.search(r'single.*use.*([\d]+).*times', content, re.IGNORECASE)
        
        metrics = {
            'reusable': {
                'cost_per_launch': reusable_cost.group(1) if reusable_cost else 'N/A',
                'reuse_count': reusable_reuse.group(1) if reusable_reuse else 'N/A'
            },
            'traditional': {
                'cost_per_launch': traditional_cost.group(1) if traditional_cost else 'N/A',
                'use_count': traditional_single.group(1) if traditional_single else 'N/A'
            }
        }
        
        return metrics
    except (URLError, ValueError, AttributeError) as e:
        return {'error': f'Failed to extract metrics: {str(e)}'}

def main():
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'Please provide a URL as argument'}))
        return
    
    url = sys.argv[1]
    metrics = extract_financial_metrics(url)
    print(json.dumps(metrics))

if __name__ == "__main__":
    main()