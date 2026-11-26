import json
d = json.load(open('shots/m8-display.json'))
print('passed', d.get('passed'))
print('checks', d.get('errors'))
print('checks', len(d.get('checks', [])))
for c in d.get('checks', [])[:40]:
    print(c)
print('--- keys', list(d['profiles'][0].keys()))
for p in d['profiles']:
    print({k: p.get(k) for k in p if k in ('name','label','dpr','view','css','scale')})
