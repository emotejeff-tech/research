import re
import json
import sys
from collections import defaultdict

def extract_architecture(paper_text):
    arch_specs = defaultdict(list)
    
    # Extract model architectures
    model_pattern = r'(?:model|architecture|network)\s*[:\-]?\s*([A-Za-z0-9\-]+)'
    models = re.findall(model_pattern, paper_text, re.IGNORECASE)
    arch_specs['models'] = list(set(models))
    
    # Extract inference methods
    inference_pattern = r'(?:inference|computation)\s*method\s*[:\-]?\s*([A-Za-z0-9\-]+)'
    inferences = re.findall(inference_pattern, paper_text, re.IGNORECASE)
    arch_specs['inference_methods'] = list(set(inferences))
    
    # Extract communication protocols
    protocol_pattern = r'(?:protocol|communication)\s*[:\-]?\s*([A-Za-z0-9\-]+)'
    protocols = re.findall(protocol_pattern, paper_text, re.IGNORECASE)
    arch_specs['protocols'] = list(set(protocols))
    
    # Extract consensus mechanisms
    consensus_pattern = r'(?:consensus|agreement)\s*[:\-]?\s*([A-Za-z0-9\-]+)'
    consensus = re.findall(consensus_pattern, paper_text, re.IGNORECASE)
    arch_specs['consensus'] = list(set(consensus))
    
    return dict(arch_specs)

def compare_architectures(arch1, arch2):
    comparison = {}
    for key in arch1.keys() | arch2.keys():
        set1 = set(arch1.get(key, []))
        set2 = set(arch2.get(key, []))
        comparison[key] = {
            'common': list(set1 & set2),
            'unique_to_paper1': list(set1 - set2),
            'unique_to_paper2': list(set2 - set1)
        }
    return comparison

def main():
    try:
        if len(sys.argv) < 3:
            print(json.dumps({'error': 'Usage: python extract_arch_specs.py paper1.txt paper2.txt'}, indent=2))
            return
        
        # Read papers
        with open(sys.argv[1], 'r') as f:
            paper1 = f.read()
        with open(sys.argv[2], 'r') as f:
            paper2 = f.read()
        
        # Extract architectures
        arch1 = extract_architecture(paper1)
        arch2 = extract_architecture(paper2)
        
        # Compare architectures
        comparison = compare_architectures(arch1, arch2)
        
        # Output results
        print(json.dumps({
            'paper1_architecture': arch1,
            'paper2_architecture': arch2,
            'comparison': comparison
        }, indent=2))
        
    except Exception as e:
        print(json.dumps({'error': str(e)}, indent=2))

if __name__ == "__main__":
    main()