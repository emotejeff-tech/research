import sys
import json
import time
import psutil
import os

def benchmark_system(model_size_gb, quantization_bits):
    try:
        # Get system info
        cpu_cores = psutil.cpu_count(logical=False)
        ram_gb = psutil.virtual_memory().total / (1024 ** 3)
        vram_gb = psutil.virtual_memory().total / (1024 ** 3)  # Simplified - should use GPU API in real implementation
        
        # Simulate memory requirements
        memory_needed = model_size_gb * 1.5  # 50% overhead
        vram_needed = model_size_gb * 0.8 if quantization_bits < 8 else model_size_gb * 0.4
        
        # Calculate estimated performance
        performance_score = min(100, (cpu_cores * 10 + ram_gb * 5) / model_size_gb)
        
        # Determine if system can handle the model
        can_run = (ram_gb >= memory_needed and vram_gb >= vram_needed)
        
        return {
            'model_size_gb': model_size_gb,
            'quantization_bits': quantization_bits,
            'cpu_cores': cpu_cores,
            'ram_gb': round(ram_gb, 2),
            'vram_gb': round(vram_gb, 2),
            'memory_needed_gb': round(memory_needed, 2),
            'vram_needed_gb': round(vram_needed, 2),
            'can_run': can_run,
            'performance_score': round(performance_score, 2),
            'recommendation': 'Recommended' if can_run and performance_score > 50 else 'Not recommended'
        }
    except Exception as e:
        return {'error': str(e)}

def main():
    try:
        if len(sys.argv) < 3:
            print(json.dumps({'error': 'Usage: python hardware_benchmark.py <model_size_gb> <quantization_bits>'}))
            return
        
        model_size = float(sys.argv[1])
        quant_bits = int(sys.argv[2])
        
        result = benchmark_system(model_size, quant_bits)
        print(json.dumps(result, indent=2))
    except Exception as e:
        print(json.dumps({'error': f'Invalid input: {str(e)}'}))

if __name__ == "__main__":
    main()