import json

with open('data/offers.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

with open('data/offers.js', 'w', encoding='utf-8') as f:
    f.write('const OFFERS_DATA = ')
    json.dump(data, f, ensure_ascii=False, indent=2)
    f.write(';')
