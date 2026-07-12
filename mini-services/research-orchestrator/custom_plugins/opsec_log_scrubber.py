import re, sys, math

def shannon_entropy(data):
    """Calculate Shannon entropy of a string — high entropy = likely a key/hash."""
    if not data:
        return 0
    entropy = 0
    for char in set(data):
        p = data.count(char) / len(data)
        entropy -= p * math.log2(p)
    return entropy

def sanitize_stream(raw_text):
    """OPSEC: detect and mask high-exposure data patterns + high-entropy strings."""
    count = 0
    # API keys: OpenAI, GitHub, Google, Anthropic, HuggingFace
    key_pattern = r'(sk-[a-zA-Z0-9]{32,}|ghp_[a-zA-Z0-9]{36}|AIzaSy[a-zA-Z0-9-_]{33}|sk-ant-[a-zA-Z0-9-_]+|hf_[a-zA-Z0-9]{30,})'
    raw_text, n = re.subn(key_pattern, "[REDACTED_CREDENTIAL]", raw_text)
    count += n
    # Bearer tokens
    raw_text, n = re.subn(r'(Bearer\s+[a-zA-Z0-9._-]{20,})', "Bearer [REDACTED]", raw_text)
    count += n
    # Linux absolute paths
    raw_text, n = re.subn(r'/home/[a-zA-Z0-9_-]+', '/home/[REDACTED_USER]', raw_text)
    count += n
    raw_text, n = re.subn(r'/Users/[a-zA-Z0-9_-]+', '/Users/[REDACTED_USER]', raw_text)
    count += n
    # Windows paths
    raw_text, n = re.subn(r'C:\\Users\\[a-zA-Z0-9_-]+', r'C:\\Users\\[REDACTED_USER]', raw_text)
    count += n
    # Email addresses
    raw_text, n = re.subn(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', "[REDACTED_EMAIL]", raw_text)
    count += n
    # IP addresses (private ranges)
    raw_text, n = re.subn(r'\b(?:10|172|192)\.\d{1,3}\.\d{1,3}\.\d{1,3}\b', "[REDACTED_IP]", raw_text)
    count += n
    # SSN
    raw_text, n = re.subn(r'\b\d{3}-\d{2}-\d{4}\b', "[REDACTED_SSN]", raw_text)
    count += n
    # Credit card numbers
    raw_text, n = re.subn(r'\b(?:\d[ -]*?){13,16}\b', "[REDACTED_CC]", raw_text)
    count += n
    # ENTROPY-BASED PII DETECTION: find high-entropy strings (potential keys/passwords/hashes)
    # Look for long alphanumeric strings with entropy > 3.5 (typical for keys, not English text)
    for match in re.finditer(r'\b[a-zA-Z0-9+/=_-]{24,}\b', raw_text):
        token = match.group()
        ent = shannon_entropy(token)
        if ent > 3.5:
            raw_text = raw_text.replace(token, "[REDACTED_HIGH_ENTROPY]")
            count += 1
    return raw_text, count

if __name__ == "__main__":
    text = sys.argv[1] if len(sys.argv) > 1 else "test sk-1234567890abcdefghijklmnop123456 /home/user/secret"
    cleaned, n = sanitize_stream(text)
    print(f"[OPSEC] scrubbed {n} item(s)")
    print(cleaned)
