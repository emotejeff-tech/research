import re, sys

def sanitize_stream(raw_text):
    """OPSEC: detect and mask high-exposure data patterns."""
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
    return raw_text, count

if __name__ == "__main__":
    text = sys.argv[1] if len(sys.argv) > 1 else "test sk-1234567890abcdefghijklmnop123456 /home/user/secret"
    cleaned, n = sanitize_stream(text)
    print(f"[OPSEC] scrubbed {n} item(s)")
    print(cleaned)
