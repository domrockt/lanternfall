import json
d = json.load(open('shots/perf-m3m8-780.json'))
print(json.dumps(d, indent=1)[:4000])
