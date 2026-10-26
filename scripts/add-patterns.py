#!/usr/bin/env python3
"""Add new patterns to the library and update every derived file.

Usage: python3 scripts/add-patterns.py new-entries.json [--date YYYY-MM-DD] [--note "one line for the changelog"]

new-entries.json is a JSON array of entries in the patterns.json schema. Fields `code`, `id`,
`version`, `added`, `updated`, `rel` and `detect` are filled in when missing (next free A code for
track "surface", B code for "behavioral"; detect defaults to "judgement" because a new entry has no
automated rule). The script bumps the library's minor version and updates patterns.json,
api/patterns.json, app.js, library.json, api/library.json, taxonomy.json, CHANGELOG.md and the
pattern count everywhere it appears in page copy.
"""
import json, os, re, sys, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = lambda f: os.path.join(ROOT, f)
args = sys.argv[1:]
if not args:
    sys.exit(__doc__)
src = args[0]
DATE = args[args.index('--date') + 1] if '--date' in args else datetime.date.today().isoformat()
NOTE = args[args.index('--note') + 1] if '--note' in args else ''

old = json.load(open(P('patterns.json')))
lib = json.load(open(P('library.json')))
OLDN, OLDVER = len(old), lib['version']
maj, mnr, _ = (int(x) for x in OLDVER.split('.'))
VER = f'{maj}.{mnr + 1}.0'

new = json.load(open(src))
ids = {p['id'] for p in old}; names = {p['name'].lower() for p in old}
amax = max(int(p['code'][1:]) for p in old if p['code'][0] == 'A')
bmax = max(int(p['code'][1:]) for p in old if p['code'][0] == 'B')
slug = lambda n: re.sub(r'-+', '-', re.sub(r'[^a-z0-9]+', '-', n.lower())).strip('-')
for p in new:
    if p['name'].lower() in names:
        sys.exit(f"Duplicate name: {p['name']}")
    if re.search('[–—]', ' '.join(str(p.get(k, '')) for k in ('name', 'oneLiner', 'looksLike', 'why', 'who', 'theFix', 'heur'))):
        sys.exit(f"Dash in entry text: {p['name']}")
    if not p.get('sources') and p.get('tier') != 'needed':
        sys.exit(f"No sources: {p['name']}")
    p.setdefault('id', slug(p['name']))
    while p['id'] in ids:
        p['id'] += '-2'
    if not p.get('code'):
        if p['track'] == 'surface':
            amax += 1; p['code'] = f'A{amax}'
        else:
            bmax += 1; p['code'] = f'B{bmax}'
    p.setdefault('detect', 'judgement'); p.setdefault('version', '1.0')
    p.setdefault('added', DATE); p.setdefault('updated', DATE)
    for k in ('sightings', 'observed'):
        p.setdefault(k, '')
    p.setdefault('tier', 'sourced')
    ids.add(p['id']); names.add(p['name'].lower())
allp = old + new
toks = lambda p: set(re.findall(r'[a-z]{4,}', (p['oneLiner'] + ' ' + p['name']).lower()))
for p in new:
    if not p.get('rel'):
        tp = toks(p)
        score = lambda q: (q['category'] == p['category']) * 2 + (q['group'] == p['group']) + len(tp & toks(q)) * 0.5
        p['rel'] = [q['id'] for q in sorted((q for q in allp if q['id'] != p['id']), key=score, reverse=True)[:3]]
order = ['id', 'name', 'track', 'group', 'category', 'harm', 'origin', 'oneLiner', 'looksLike', 'why', 'who', 'theFix', 'heur',
         'sightings', 'sources', 'code', 'rel', 'tier', 'observed', 'version', 'added', 'updated', 'detect']
new = [{k: p[k] for k in order if k in p} for p in new]
allp = old + new
N = len(allp)

txt = open(P('patterns.json')).read()
compact = json.dumps(allp, ensure_ascii=False, separators=(',', ':')) + ('\n' if txt.endswith('\n') else '')
for f in ('patterns.json', 'api/patterns.json'):
    open(P(f), 'w').write(compact)

s = open(P('app.js')).read()
i = s.index('const DATA=') + len('const DATA='); j = re.search(r'\n\];?\nvar ART', s).start()
s = s[:i] + json.dumps(allp, indent=1, ensure_ascii=False) + ';\nvar ART' + s[s.index('\nvar ART', j) + len('\nvar ART'):]
s = s.replace(f"const LIB_VERSION = '{OLDVER}';", f"const LIB_VERSION = '{VER}';")
open(P('app.js'), 'w').write(s)

det = {'code': 0, 'render': 0, 'judgement': 0}; tiers = {}
for p in allp:
    det[p['detect']] += 1; tiers[p['tier']] = tiers.get(p['tier'], 0) + 1
lib['version'] = VER; lib['released'] = DATE
lib['counts'] = {'patterns': N, 'detectableFromCode': det['code'], 'needsRenderedPage': det['render'], 'judgementOnly': det['judgement'],
                 'sourced': tiers.get('sourced', 0), 'practitionerObserved': tiers.get('practitioner-observed', 0),
                 'evidenceNeeded': tiers.get('needed', 0), 'sourceLinks': sum(len(p['sources']) for p in allp)}
entry = {'version': VER, 'date': DATE, 'added': [f"{p['code']} {p['name']}" for p in new],
         'changed': [f'Library grows from {OLDN} to {N} patterns.'], 'notes': NOTE}
lib['changelog'].insert(0, entry)
for f in ('library.json', 'api/library.json'):
    open(P(f), 'w').write(json.dumps(lib, indent=1, ensure_ascii=False) + '\n')

tt = open(P('taxonomy.json')).read(); tax = json.loads(tt)
for p in new:
    tax['patterns'].append({'code': p['code'], 'id': p['id'], 'name': p['name'], 'category': p['category'], 'track': p['track'],
        'harm': p['harm'], 'detection': 'needs a person' if p['detect'] == 'judgement' else 'automated',
        'url': 'https://sloppatterns.com/#' + p['id'], 'version': p['version'], 'added': p['added'], 'updated': p['updated'],
        'oneLiner': p['oneLiner'], 'fix': p['theFix'], 'sources': p['sources']})
tmaj, tmnr, _ = (int(x) for x in tax['version'].split('.'))
tax['count'] = N; tax['version'] = f'{tmaj}.{tmnr + 1}.0'; tax['released'] = DATE
open(P('taxonomy.json'), 'w').write(json.dumps(tax, indent=1, ensure_ascii=False) + ('\n' if tt.endswith('\n') else ''))

c = open(P('CHANGELOG.md')).read()
c = re.sub(r'Current: \*\*v[\d.]+\*\* \([\d-]+\)', f'Current: **v{VER}** ({DATE})', c)
sec = f'## v{VER} — {DATE}\n\n{entry["changed"][0]}' + (f'\n\n{NOTE}' if NOTE else '') + '\n\n**Added**\n\n' + '\n'.join('- ' + a for a in entry['added']) + '\n\n'
k = c.index('\n## v', c.index('## How versions work')) + 1
c = c[:k] + sec + c[k:]
open(P('CHANGELOG.md'), 'w').write(c)

cff = open(P('CITATION.cff')).read()
cff = re.sub(r'version: "(\d+)\.(\d+)\.\d+"', lambda m: f'version: "{m.group(1)}.{int(m.group(2)) + 1}.0"', cff, count=1)
cff = re.sub(r'date-released: "[\d-]+"', f'date-released: "{DATE}"', cff)
cff = cff.replace(f'  {OLDN} documented patterns', f'  {N} documented patterns')
open(P('CITATION.cff'), 'w').write(cff)
for f, a in [('offer.js', ' and {} documented patterns'), ('README.md', 'All {} patterns'), ('numbers.html', '<b>{}</b><span>Documented patterns'),
             ('api/confirm.js', 'against {} documented'), ('index.html', '{} documented')]:
    t = open(P(f)).read(); t2 = t.replace(a.format(OLDN), a.format(N))
    if t2 == t:
        print('note: count not found in', f)
    open(P(f), 'w').write(t2)
print(f'v{OLDVER} -> v{VER}: {OLDN} -> {N} patterns. Added: ' + ', '.join(entry['added']))
print('Remember: og.png shows the count in the image; regenerate it and bump og.png?v= in index.html.')
