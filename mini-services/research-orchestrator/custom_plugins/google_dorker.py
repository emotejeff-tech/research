import sys, json

# OSINT dork templates — find publicly exposed data that appears private
DORK_TEMPLATES = {
    "exposed_files": [
        'site:{domain} filetype:pdf',
        'site:{domain} filetype:xls OR filetype:xlsx',
        'site:{domain} filetype:doc OR filetype:docx',
        'site:{domain} filetype:sql OR filetype:db OR filetype:csv',
        'site:{domain} filetype:env OR filetype:config OR filetype:ini',
    ],
    "credentials": [
        'site:{domain} "password" OR "passwd" OR "credentials"',
        'site:{domain} "api key" OR "apikey" OR "secret_key"',
        'site:{domain} "BEGIN RSA PRIVATE KEY"',
        'site:{domain} "authorization: bearer"',
        'intext:"index of" "parent directory" filetype:env',
    ],
    "user_data": [
        'site:{domain} intext:"email" OR intext:"phone" OR intext:"address"',
        'site:{domain} intitle:"index of" "backup"',
        'site:{domain} inurl:admin OR inurl:login OR inurl:dashboard',
        'site:{domain} inurl:wp-content/uploads/',
        'site:{domain} intext:"ssn" OR intext:"social security"',
    ],
    "exposed_dirs": [
        'site:{domain} intitle:"index of" /',
        'site:{domain} intitle:"index of /backup"',
        'site:{domain} intitle:"index of /admin"',
        'site:{domain} inurl:/uploads/ OR inurl:/files/',
        'site:{domain} intext:"directory listing"',
    ],
    "cached_versions": [
        'cache:{domain}',
        'site:{domain} inurl:wp-config.php',
        'site:{domain} inurl:.git OR inurl:.svn',
        'site:{domain} inurl:phpinfo.php',
        'site:{domain} inurl:server-status',
    ],
}

def build_dorks(query):
    """Build OSINT dork queries from a search term."""
    words = query.replace('http://', '').replace('https://', '').split()
    domain = ''
    for w in words:
        if '.' in w and ' ' not in w:
            domain = w.rstrip('/')
            break
    if not domain:
        domain = words[0] if words else 'example.com'

    dorks = []
    for category, templates in DORK_TEMPLATES.items():
        for t in templates[:2]:
            dorks.append({
                'category': category,
                'dork': t.format(domain=domain),
                'description': f'OSINT: {category} — finds publicly exposed {category.replace("_", " ")} for {domain}'
            })
    return dorks

if __name__ == "__main__":
    query = sys.argv[1] if len(sys.argv) > 1 else "example.com security"
    dorks = build_dorks(query)
    print(f"[OSINT] Generated {len(dorks)} dork queries for intelligence gathering")
    for d in dorks:
        print(f"\n[{d['category'].upper()}] {d['dork']}")
    print("\n---\nThese dorks find freely-public information that may appear private.")
    print("Use responsibly. Only search domains/data you own or have permission to investigate.")
