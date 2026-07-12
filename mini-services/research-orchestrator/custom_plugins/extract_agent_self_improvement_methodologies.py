import sys
import re
import json
import urllib.request
import xml.etree.ElementTree as ET
from urllib.parse import quote

def main():
    try:
        query = sys.argv[1] if len(sys.argv) > 1 else "AI agent self-improvement"
        encoded_query = quote(query)
        url = f"http://export.arxiv.org/api/query?search_query=all:{encoded_query}&start=0&max_results=10"
        
        with urllib.request.urlopen(url) as response:
            xml_data = response.read().decode('utf-8')
        
        root = ET.fromstring(xml_data)
        methodologies = []
        
        for entry in root.findall('{http://www.w3.org/2005/Atom}entry'):
            title = entry.find('{http://www.w3.org/2005/Atom}title').text
            summary = entry.find('{http://www.w3.org/2005/Atom}summary').text
            
            # Extract potential self-improvement methodologies
            methods = re.findall(r'(self-improvement|self-reflection|learning|adaptation|optimization|enhancement)', summary, re.IGNORECASE)
            
            if methods:
                methodologies.append({
                    "title": title,
                    "methods": list(set(methods)),
                    "summary": summary
                })
        
        print(json.dumps(methodologies, indent=2))
        
    except Exception as e:
        print(json.dumps({"error": str(e)}))

if __name__ == "__main__":
    main()