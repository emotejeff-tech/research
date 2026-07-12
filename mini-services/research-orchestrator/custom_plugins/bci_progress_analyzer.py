import sys
import re
import json
from collections import defaultdict

def extract_metrics(text):
    metrics = defaultdict(dict)
    
    # Extract common BCI metrics
    latency_match = re.search(r'latency[:\s]+([0-9.]+)\s*(ms|milliseconds)', text, re.IGNORECASE)
    if latency_match:
        metrics['latency'] = float(latency_match.group(1))
    
    accuracy_match = re.search(r'accuracy[:\s]+([0-9.]+)%?', text, re.IGNORECASE)
    if accuracy_match:
        metrics['accuracy'] = float(accuracy_match.group(1))
    
    bandwidth_match = re.search(r'bandwidth[:\s]+([0-9.]+)\s*(Mbps|bits per second)', text, re.IGNORECASE)
    if bandwidth_match:
        metrics['bandwidth'] = float(bandwidth_match.group(1))
    
    channels_match = re.search(r'channels[:\s]+([0-9]+)', text, re.IGNORECASE)
    if channels_match:
        metrics['channels'] = int(channels_match.group(1))
    
    return metrics

def compare_to_thresholds(metrics, thresholds):
    comparison = {}
    for metric, value in metrics.items():
        if metric in thresholds:
            comparison[metric] = {
                'value': value,
                'threshold': thresholds[metric],
                'achieved': value >= thresholds[metric] if metric != 'latency' else value <= thresholds[metric],
                'progress': min(100, (value / thresholds[metric]) * 100) if metric != 'latency' else min(100, (thresholds[metric] / value) * 100)
            }
    return comparison

def main():
    try:
        if len(sys.argv) < 2:
            print("Usage: python bci_progress_analyzer.py '<text from BCI paper>'")
            return
        
        # Consumer viability thresholds
        thresholds = {
            'latency': 100,  # ms
            'accuracy': 95,  # %
            'bandwidth': 10,  # Mbps
            'channels': 32
        }
        
        text = sys.argv[1]
        metrics = extract_metrics(text)
        comparison = compare_to_thresholds(metrics, thresholds)
        
        # Calculate overall progress
        if comparison:
            avg_progress = sum(c['progress'] for c in comparison.values()) / len(comparison)
            overall_status = "Approaching viability" if avg_progress > 70 else "Needs significant improvement"
        else:
            avg_progress = 0
            overall_status = "Insufficient data"
        
        result = {
            'extracted_metrics': metrics,
            'threshold_comparison': comparison,
            'average_progress': round(avg_progress, 1),
            'overall_status': overall_status
        }
        
        print(json.dumps(result, indent=2))
        
    except Exception as e:
        print(f"Error: {str(e)}")

if __name__ == "__main__":
    main()