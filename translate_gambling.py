from deep_translator import GoogleTranslator
from bs4 import BeautifulSoup, NavigableString

translator = GoogleTranslator(source='bg', target='en')

with open('index.html', 'r', encoding='utf-8') as f:
    soup = BeautifulSoup(f.read(), 'html.parser')

gambling = soup.find('div', {'data-i18n-html': 'i.h3.body'})
bg_html = gambling.decode_contents().strip()

nodes = [n for n in gambling.descendants if isinstance(n, NavigableString) and n.strip()]
DELIM = ' ||SPLIT|| '
texts = [str(n) for n in nodes]
joined = DELIM.join(texts)
translated = translator.translate(joined)
parts = translated.split('||SPLIT||')
while len(parts) < len(nodes):
    parts.append('')
for node, tr in zip(nodes, parts):
    node.replace_with(tr.strip())
en_html = gambling.decode_contents().strip()

def esc(v):
    return (v
        .replace('\\', '\\\\')
        .replace("'", "\\'")
        .replace('\r\n', ' ')
        .replace('\n', ' ')
        .replace('\r', ' '))

bg_safe = esc(bg_html)
en_safe = esc(en_html)

with open('js/i18n.js', 'r', encoding='utf-8') as f:
    src = f.read()

bg_marker = "'i.h3.h3': '\U0001f3b0 \u0425\u0430\u0437\u0430\u0440\u0442 \u2014 \u0437\u0430\u0432\u0438\u0441\u0438\u043c\u043e\u0441\u0442\u0442\u0430, \u043a\u043e\u044f\u0442\u043e \u043d\u0435 \u043c\u0438\u0440\u0438\u0448\u0435 \u0438 \u043d\u0435 \u0441\u0435 \u0432\u0438\u0436\u0434\u0430',"
en_marker = "'i.h3.h3': '\U0001f3b0 Gambling \u2014 the addiction that has no smell and can\\'t be seen',"

src = src.replace(bg_marker, bg_marker + "\n            'i.h3.body': '" + bg_safe + "',")
src = src.replace(en_marker, en_marker + "\n            'i.h3.body': '" + en_safe + "',")

with open('js/i18n.js', 'w', encoding='utf-8') as f:
    f.write(src)

print('Done - i.h3.body added to i18n.js')
