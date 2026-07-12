import sys
import json
from urllib.request import urlopen
from urllib.error import URLError

def main():
    if len(sys.argv) != 2:
        print(json.dumps({"error": "Usage: python inmate_record_extractor.py <inmate_name>"}))
        return
    
    inmate_name = sys.argv[1].lower()
    try:
        # In a real implementation, this would query official law enforcement databases
        # For this example, we'll simulate a response
        
        # Simulated database response
        if "georgia bennett" in inmate_name:
            result = {
                "name": "Georgia Bennett",
                "inmate_id": "GB2023001",
                "facility": "Georgia State Penitentiary",
                "status": "Incarcerated",
                "booking_date": "2023-05-15",
                "release_date": "2026-05-14",
                "charges": ["Theft", "Assault"]
            }
        else:
            result = {
                "name": inmate_name.title(),
                "status": "Not found in database"
            }
        
        print(json.dumps(result, indent=2))
        
    except Exception as e:
        print(json.dumps({"error": f"An error occurred: {str(e)}"}))

if __name__ == "__main__":
    main()