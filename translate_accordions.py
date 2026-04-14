#!/usr/bin/env python3
"""
translate_accordions.py
Finds accordion bodies without translations, translates BG→EN via Google Translate,
and injects keys into i18n.js + data-i18n-html attributes into HTML files.

Usage: python translate_accordions.py
Requires: pip install deep-translator beautifulsoup4
"""

import os
import re
import time
from bs4 import BeautifulSoup
from deep_translator import GoogleTranslator

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
I18N_JS  = os.path.join(BASE_DIR, "js", "i18n.js")

PAGES = {
    "i":    "index.html",
    "m":    "move.html",
    "e":    "eat.html",
    "c":    "cheap.html",
    "s":    "start.html",
    "sup":  "supplements.html",
    "men":  "mental.html",
}

translator = GoogleTranslator(source="bg", target="en")


# ── Helpers ───────────────────────────────────────────────────────────────────

def key_prefix_from_h3(item):
    """Return the i18n key prefix from the accordion h3, e.g. 'm.acc1'."""
    h3 = item.find("h3", attrs={"data-i18n": True})
    if h3:
        parts = h3["data-i18n"].split(".")
        return ".".join(parts[:-1])   # strip '.h3'
    return None


def translate_html(html: str) -> str:
    """
    Translate only the visible text inside an HTML snippet, preserving all tags.
    Splits into chunks ≤4500 chars to stay within Google Translate limits.
    """
    soup = BeautifulSoup(html, "html.parser")

    # Collect all text nodes
    text_nodes = [node for node in soup.descendants if isinstance(node, str) and node.strip()]

    # Build one big text block separated by a unique delimiter, then translate at once
    DELIM = " ||SPLIT|| "
    MAX_CHUNK = 4500

    chunks = []
    current_texts = []
    current_len = 0

    for node in text_nodes:
        t = node.string if hasattr(node, 'string') else str(node)
        if current_len + len(t) + len(DELIM) > MAX_CHUNK:
            chunks.append(current_texts)
            current_texts = [t]
            current_len = len(t)
        else:
            current_texts.append(t)
            current_len += len(t) + len(DELIM)
    if current_texts:
        chunks.append(current_texts)

    translated_texts = []
    for chunk in chunks:
        joined = DELIM.join(chunk)
        try:
            result = translator.translate(joined)
            parts = result.split("||SPLIT||")
            # Pad if Google collapsed some splits
            while len(parts) < len(chunk):
                parts.append("")
            translated_texts.extend([p.strip() for p in parts[:len(chunk)]])
        except Exception as e:
            print(f"    [warn] translation error: {e}")
            translated_texts.extend(chunk)   # fallback: keep original
        time.sleep(0.3)  # be polite to Google

    # Replace text nodes in the soup
    idx = 0
    for node in soup.descendants:
        if isinstance(node, str) and node.strip():
            if idx < len(translated_texts):
                node.replace_with(translated_texts[idx])
                idx += 1

    return soup.decode_contents().strip()


# ── Main processing ───────────────────────────────────────────────────────────

def collect_and_translate():
    new_bg  = {}
    new_en  = {}
    patches = []   # (filepath, key, soup, tag)
    soups   = {}   # filepath → soup

    # Load existing keys so we skip already-translated ones
    with open(I18N_JS, "r", encoding="utf-8") as f:
        i18n_src = f.read()
    existing_keys = set(re.findall(r"'([^']+)'\s*:", i18n_src))

    for slug, filename in PAGES.items():
        filepath = os.path.join(BASE_DIR, filename)
        print(f"\n  [{filename}]")
        with open(filepath, "r", encoding="utf-8") as f:
            src = f.read()

        soup = BeautifulSoup(src, "html.parser")
        soups[filepath] = soup
        counter = 1

        for item in soup.find_all(class_="accordion-item"):
            body = item.find(class_="accordion-body-inner")
            if not body:
                continue
            if body.get("data-i18n-html"):
                continue

            prefix = key_prefix_from_h3(item)
            key = f"{prefix}.body" if prefix else f"{slug}.body.{counter}"
            if not prefix:
                counter += 1

            if key in existing_keys:
                print(f"    {key} — already translated, skipping")
                patches.append((filepath, key, soup, body))
                continue

            bg_html = body.decode_contents().strip()
            print(f"    {key} … ", end="", flush=True)
            en_html = translate_html(bg_html)
            print("done")

            new_bg[key] = bg_html
            new_en[key] = en_html
            patches.append((filepath, key, soup, body))

    return new_bg, new_en, patches, soups


def inject_into_i18n(new_bg: dict, new_en: dict):
    if not new_bg and not new_en:
        return

    with open(I18N_JS, "r", encoding="utf-8") as f:
        src = f.read()

    def build_block(d: dict) -> str:
        lines = []
        for k, v in d.items():
            safe_v = (v
                .replace("\\", "\\\\")
                .replace("'", "\\'")
                .replace("\r\n", " ")
                .replace("\n", " ")
                .replace("\r", " "))
            lines.append(f"            '{k}': '{safe_v}',")
        return "\n".join(lines)

    if new_bg:
        block = build_block(new_bg)
        src = src.replace(
            "\n        },\n\n        en: {",
            f"\n\n            // ── Accordion bodies ─────────────────────────────────\n"
            f"{block}\n"
            f"        }},\n\n        en: {{",
            1
        )

    if new_en:
        block = build_block(new_en)
        src = src.replace(
            "\n        }\n    };",
            f"\n\n            // ── Accordion bodies ─────────────────────────────────\n"
            f"{block}\n"
            f"        }}\n    }};",
            1
        )

    with open(I18N_JS, "w", encoding="utf-8") as f:
        f.write(src)

    print(f"\n  i18n.js — {len(new_bg)} BG + {len(new_en)} EN keys added.")


def patch_html_files(patches, soups):
    changed = set()
    for filepath, key, soup, tag in patches:
        tag["data-i18n-html"] = key
        changed.add(filepath)

    for filepath in changed:
        html = str(soups[filepath])
        html = re.sub(r"^<!DOCTYPE html>", "<!DOCTYPE html>", html, flags=re.I)
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(html)
        print(f"  {os.path.basename(filepath)} saved.")


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=== NutriLife accordion translator (Google Translate) ===")

    print("\nStep 1 — translating accordion bodies...")
    new_bg, new_en, patches, soups = collect_and_translate()
    print(f"\n  Total: {len(new_bg)} new translations.")

    print("\nStep 2 — updating i18n.js...")
    inject_into_i18n(new_bg, new_en)

    print("\nStep 3 — patching HTML files...")
    patch_html_files(patches, soups)

    print("\nDone! Reload the page and test the EN/BG toggle.")
