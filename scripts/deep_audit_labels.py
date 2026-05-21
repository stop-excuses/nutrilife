"""Deep audit: for each low/medium confidence supplement, fetch the actual product
page (Playwright for JS-rendered sites, requests otherwise), search for the
relevant nutrient pattern in the rendered text and print evidence so a human
can decide whether the page truly has a readable label.

Usage:
    python scripts/deep_audit_labels.py --confidence low --category protein
    python scripts/deep_audit_labels.py --confidence medium --category multivitamin --limit 10
"""
from __future__ import annotations
import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import requests
from bs4 import BeautifulSoup
from scraper.supplement_scrapers import normalize_text, extract_active  # type: ignore

SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    "Accept-Language": "bg-BG,bg;q=0.9,en;q=0.8",
})

PW_STORES = {"Fitness1", "GymBeam", "SilaBG"}

CATEGORY_PATTERNS = {
    "protein": [r"(\d{1,3}(?:[,.]\d+)?)\s*(?:гр|g|г)\s*(?:протеин|protein|белт)",
                r"(?:протеин|protein|белт[^\s]{0,8})[^\n]{0,50}(\d{1,3}(?:[,.]\d+)?)\s*(?:гр|g|г)"],
    "fiber": [r"(\d{1,3}(?:[,.]\d+)?)\s*(?:гр|g|г|mg|мг)\s*(?:фибри|fiber|psyllium|псилиум)",
              r"(?:фибри|fiber|psyllium|псилиум)[^\n]{0,50}(\d{1,3}(?:[,.]\d+)?)\s*(?:гр|g|г|mg|мг)"],
    "multivitamin": [r"(\d{1,4})\s*(?:mg|мг|iu|ме|μg|µg|mcg|мкг)"],
    "vitamin_b": [r"(?:b[\s-]?\d{1,2}|витамин[\s-]?b\d{0,2})[^\n]{0,60}(\d{1,4}(?:[,.]\d+)?)\s*(?:mg|мг|μg|µg|mcg|мкг)",
                  r"(\d{1,4}(?:[,.]\d+)?)\s*(?:mg|мг|μg|µg|mcg|мкг)[^\n]{0,30}(?:b[\s-]?\d|тиамин|рибофлавин|ниацин|кобаламин)"],
    "creatine": [r"креатин[^\n]{0,40}(\d{1,4}(?:[,.]\d+)?)\s*(?:гр|g|mg|мг)",
                 r"(\d{1,4}(?:[,.]\d+)?)\s*(?:гр|g|mg|мг)[^\n]{0,30}креатин"],
}


def fetch_requests(url: str) -> str | None:
    try:
        r = SESSION.get(url, timeout=20)
        if r.status_code != 200:
            return None
        return r.text
    except Exception:
        return None


_pw_handle = None
_pw_browser = None


def fetch_playwright(url: str) -> str | None:
    global _pw_handle, _pw_browser
    try:
        from playwright.sync_api import sync_playwright  # type: ignore
    except Exception:
        return None
    if _pw_browser is None:
        _pw_handle = sync_playwright().start()
        _pw_browser = _pw_handle.chromium.launch(headless=True)
    ctx = _pw_browser.new_context(user_agent=SESSION.headers["User-Agent"], locale="bg-BG")
    page = ctx.new_page()
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(1500)
        return page.content()
    except Exception:
        return None
    finally:
        ctx.close()


def page_text(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript", "header", "footer", "nav"]):
        tag.decompose()
    return normalize_text(soup.get_text(" ", strip=True))


def find_hits(category: str, text: str, max_hits: int = 6) -> list[str]:
    pats = CATEGORY_PATTERNS.get(category, [])
    hits = []
    for pat in pats:
        for m in re.finditer(pat, text, re.I):
            s = max(0, m.start() - 30)
            e = min(len(text), m.end() + 30)
            snippet = text[s:e].replace("\n", " ").strip()
            hits.append(snippet)
            if len(hits) >= max_hits:
                return hits
    return hits


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--confidence", default="low")
    ap.add_argument("--category", default=None)
    ap.add_argument("--store", default=None)
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    confs = set(args.confidence.split(","))
    data = json.loads((ROOT / "data" / "supplements.json").read_text(encoding="utf-8"))
    items = [i for i in data["supplements"]
             if i.get("confidence") in confs
             and i.get("availability_status") != "out_of_stock"
             and i.get("url")]
    if args.category:
        items = [i for i in items if i.get("category") == args.category]
    if args.store:
        items = [i for i in items if i.get("store") == args.store]
    if args.limit:
        items = items[: args.limit]

    print(f"Auditing {len(items)} items (confidence in {confs}, category={args.category}, store={args.store})\n")

    summary = {"has_label": 0, "no_label": 0, "fetch_fail": 0}
    has_label_items = []
    no_label_items = []
    fail_items = []

    for it in items:
        store = it.get("store", "")
        html = fetch_requests(it["url"])
        used = "requests"
        if not html and store in PW_STORES:
            html = fetch_playwright(it["url"])
            used = "playwright"
        if not html:
            print(f"[FAIL fetch] {store} | {it['name'][:60]}")
            summary["fetch_fail"] += 1
            fail_items.append(it)
            continue
        text = page_text(html)
        hits = find_hits(it["category"], text)
        active, _, conf = extract_active(it["category"], text, it.get("weight_grams"), it.get("servings"), it.get("count"))
        verdict = "LABEL" if hits else "no-label"
        print(f"[{verdict}] {store} | {it['category']} | conf_stored={it['confidence']} extractor={conf} | {it['name'][:60]} [{used}]")
        if hits:
            print(f"   hits: {hits[:3]}")
            summary["has_label"] += 1
            has_label_items.append((it, hits, active, conf))
        else:
            summary["no_label"] += 1
            no_label_items.append(it)

    print(f"\n=== Summary ===")
    print(f"Has readable label on page : {summary['has_label']}")
    print(f"No readable label on page  : {summary['no_label']}")
    print(f"Fetch failed                : {summary['fetch_fail']}")

    if has_label_items:
        print("\n=== Items where page HAS label but extractor didn't classify as high ===")
        for it, hits, active, conf in has_label_items:
            print(f"  - {it['store']} | {it['name'][:70]}")
            print(f"    extractor active={active} extractor_conf={conf}")
            print(f"    first hit: {hits[0]}")
            print(f"    url: {it['url']}")


if __name__ == "__main__":
    main()
