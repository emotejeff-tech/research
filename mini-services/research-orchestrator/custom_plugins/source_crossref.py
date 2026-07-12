import re, sys

def cross_reference(claim, sources):
    tokens = set(re.findall(r"\w{4,}", claim.lower()))
    scored = []
    for s in sources:
        st = set(re.findall(r"\w{4,}", s.lower()))
        overlap = len(tokens & st) / max(len(tokens), 1)
        scored.append((overlap, s))
    scored.sort(reverse=True)
    return scored[:3]

if __name__ == "__main__":
    claim = sys.argv[1] if len(sys.argv) > 1 else "renewable energy reduces emissions"
    srcs = ["Solar and wind lower CO2 output.", "Fossil fuels remain dominant."]
    for score, s in cross_reference(claim, srcs):
        print(f"{score:.2f}  {s}")