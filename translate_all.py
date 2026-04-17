#!/usr/bin/env python3
"""
translate_all.py
Translates ALL untranslated Bulgarian text outside accordion bodies.
Targets block-level containers: stat-card, info-box, stat-box, timeline,
cta-section, meal-card, shopping-list, tracker-item, standalone p/h3, etc.

Usage: python translate_all.py
"""

import os, re, time
from bs4 import BeautifulSoup, NavigableString, Tag
from deep_translator import GoogleTranslator

translator = GoogleTranslator(source='bg', target='en')

PAGES = {
    'i':   'index.html',
    'm':   'move.html',
    'e':   'eat.html',
    'c':   'smart-food.html',
    's':   'start.html',
    'sup': 'supplements.html',
    'men': 'mental.html',
}

I18N_JS = os.path.join('js', 'i18n.js')

# ── Block selectors to translate as a unit ────────────────────────────────────
# These are CSS classes whose entire innerHTML we translate as one key.
BLOCK_CLASSES = [
    'stat-card', 'stat-box', 'info-box', 'timeline',
    'meal-card', 'bulk-card', 'shopping-list', 'savings-box',
    'tracker-item', 'week-chart', 'comparison',
    'cta-section', 'research', 'section-note',
]

# Tags we never touch
SKIP_TAGS = {'script', 'style', 'meta', 'link', 'title', 'nav', 'head'}


def is_bulgarian(text):
    return any('\u0400' <= c <= '\u04ff' for c in text)


def has_bg_text(tag):
    """Return True if tag contains any untranslated Bulgarian text."""
    for node in tag.descendants:
        if isinstance(node, NavigableString) and is_bulgarian(str(node)):
            return True
    return False


def already_handled(tag):
    """Return True if tag or all its text-bearing descendants have i18n attrs."""
    return bool(tag.get('data-i18n') or tag.get('data-i18n-html'))


def inside_accordion_body(tag):
    return bool(tag.find_parent(class_='accordion-body-inner'))


# ── Translation helpers ───────────────────────────────────────────────────────

def translate_text_nodes(soup_fragment):
    """Translate every Bulgarian text node in-place. Returns modified fragment."""
    nodes = [n for n in soup_fragment.descendants
             if isinstance(n, NavigableString) and is_bulgarian(str(n))]
    if not nodes:
        return soup_fragment

    DELIM = ' ||S|| '
    MAX   = 4000

    chunks, cur, cur_len = [], [], 0
    for n in nodes:
        t = str(n)
        if cur_len + len(t) > MAX:
            chunks.append(cur); cur, cur_len = [t], len(t)
        else:
            cur.append(t); cur_len += len(t)
    if cur:
        chunks.append(cur)

    translated = []
    for chunk in chunks:
        joined = DELIM.join(chunk)
        try:
            result = translator.translate(joined)
            parts  = result.split('||S||')
            while len(parts) < len(chunk):
                parts.append('')
            translated.extend(p.strip() for p in parts[:len(chunk)])
        except Exception as ex:
            print(f'    [warn] {ex}')
            translated.extend(chunk)
        time.sleep(0.25)

    for node, tr in zip(nodes, translated):
        node.replace_with(tr)

    return soup_fragment


def esc(v):
    return (v
        .replace('\\', '\\\\')
        .replace("'", "\\'")
        .replace('\r\n', ' ')
        .replace('\n', ' ')
        .replace('\r', ' '))


# ── Key generation ────────────────────────────────────────────────────────────

_counters = {}

def make_key(slug, hint='blk'):
    k = f'{slug}.{hint}.{_counters.get((slug, hint), 1)}'
    _counters[(slug, hint)] = _counters.get((slug, hint), 1) + 1
    return k


# ── Find blocks to translate ──────────────────────────────────────────────────

def find_blocks(soup, slug):
    """
    Return list of Tag objects that should be translated as a unit.
    Priority: named block classes first, then standalone p/h3/h2/li with BG text.
    """
    seen   = set()
    blocks = []

    def add(tag):
        tid = id(tag)
        if tid in seen:
            return
        if already_handled(tag):
            return
        if inside_accordion_body(tag):
            return
        if not has_bg_text(tag):
            return
        seen.add(tid)
        # Mark all descendants as seen so we don't double-process
        for d in tag.descendants:
            if isinstance(d, Tag):
                seen.add(id(d))
        blocks.append(tag)

    # 1. Named block classes
    for cls in BLOCK_CLASSES:
        for tag in soup.find_all(class_=cls):
            add(tag)

    # 2. Standalone p / h2 / h3 / li / span with direct BG text, not yet covered
    for tag in soup.find_all(['p', 'h2', 'h3', 'li', 'td', 'th', 'span', 'strong', 'em', 'label']):
        if tag.name in SKIP_TAGS:
            continue
        if id(tag) in seen:
            continue
        if already_handled(tag):
            continue
        if inside_accordion_body(tag):
            continue
        direct = ''.join(str(c) for c in tag.children if isinstance(c, NavigableString)).strip()
        if is_bulgarian(direct) and len(direct) > 5:
            add(tag)

    return blocks


# ── Main ──────────────────────────────────────────────────────────────────────

def run():
    with open(I18N_JS, 'r', encoding='utf-8') as f:
        i18n_src = f.read()
    existing_keys = set(re.findall(r"'([^']+)'\s*:", i18n_src))

    new_bg, new_en = {}, {}
    html_patches   = []   # (filepath, key, tag, soup)
    soups          = {}

    for slug, filename in PAGES.items():
        soup = BeautifulSoup(open(filename, encoding='utf-8'), 'html.parser')
        soups[filename] = soup
        print(f'\n[{filename}]')

        blocks = find_blocks(soup, slug)
        print(f'  {len(blocks)} blocks to translate')

        for tag in blocks:
            # Determine hint from class
            cls_list = tag.get('class') or []
            hint = cls_list[0] if cls_list else tag.name
            hint = hint.replace('-', '_')[:12]
            key  = make_key(slug, hint)

            if key in existing_keys:
                print(f'  {key} — skip (exists)')
                html_patches.append((filename, key, tag, soup))
                continue

            bg_html = tag.decode_contents().strip()

            # Make a translated copy
            tag_copy = BeautifulSoup(bg_html, 'html.parser')
            print(f'  {key} [{tag.name}.{hint}] … ', end='', flush=True)
            translate_text_nodes(tag_copy)
            en_html = tag_copy.decode_contents().strip()
            print('done')

            new_bg[key] = bg_html
            new_en[key] = en_html
            html_patches.append((filename, key, tag, soup))

    # Inject into i18n.js
    if new_bg:
        print(f'\nInjecting {len(new_bg)} keys into i18n.js …')
        with open(I18N_JS, 'r', encoding='utf-8') as f:
            src = f.read()

        def build(d):
            return '\n'.join(f"            '{k}': '{esc(v)}'," for k, v in d.items())

        src = src.replace(
            "\n        },\n\n        en: {",
            f"\n\n            // ── Extra elements (auto) ────────────────────────────\n"
            f"{build(new_bg)}\n        }},\n\n        en: {{",
            1
        )
        src = src.replace(
            "\n        }\n    };",
            f"\n\n            // ── Extra elements (auto) ────────────────────────────\n"
            f"{build(new_en)}\n        }}\n    }};",
            1
        )
        with open(I18N_JS, 'w', encoding='utf-8') as f:
            f.write(src)
        print('  i18n.js updated.')

    # Patch HTML files
    changed = set()
    for filename, key, tag, soup in html_patches:
        tag['data-i18n-html'] = key
        changed.add(filename)

    for filename in changed:
        html = re.sub(r'^<!DOCTYPE html>', '<!DOCTYPE html>', str(soups[filename]), flags=re.I)
        with open(filename, 'w', encoding='utf-8') as f:
            f.write(html)
        print(f'  {filename} saved.')

    # Verify JS
    rc = os.system('node --check js/i18n.js')
    if rc == 0:
        print('\nSyntax OK. Done!')
    else:
        print('\nSYNTAX ERROR in i18n.js — check the file.')


if __name__ == '__main__':
    print('=== translate_all.py ===')
    run()
