"""Audit supplement confidence labels by re-fetching pages and re-extracting.

Usage:
    python scripts/audit_supplement_labels.py [--limit N] [--category cat]
"""
from __future__ import annotations
import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scraper.supplement_scrapers import extract_active, normalize_text  # type: ignore

import requests
from bs4 import BeautifulSoup


def fetch(url: str) -> str | None:
    try:
        r = requests.get(url, timeout=20, headers={"User-Agent": "Mozilla/5.0"})
        if r.status_code != 200:
            return None
        return r.text
    except Exception:
        return None


def page_text(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()
    return normalize_text(soup.get_text(" ", strip=True))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=30)
    ap.add_argument("--category")
    ap.add_argument("--confidence", default="low")
    args = ap.parse_args()

    data = json.loads((ROOT / "data" / "supplements.json").read_text(encoding="utf-8"))
    items = data["supplements"]
    if args.category:
        items = [i for i in items if i.get("category") == args.category]
    items = [i for i in items if i.get("confidence") == args.confidence and i.get("availability_status") != "out_of_stock"]
    print(f"Total {args.confidence} items (category={args.category}): {len(items)}")

    mismatches = []
    checked = 0
    for it in items[: args.limit]:
        url = it.get("url")
        if not url:
            continue
        html = fetch(url)
        if not html:
            print(f"  SKIP (fetch fail): {it['store']} | {it['name'][:60]}")
            continue
        text = page_text(html)
        active, _, conf = extract_active(
            it["category"], text, it.get("weight_grams"), it.get("servings"), it.get("count")
        )
        checked += 1
        if conf != it.get("confidence"):
            mismatches.append((it, conf, active))
            print(f"  MISMATCH: stored={it.get('confidence')} actual={conf} | {it['store']} | {it['name'][:70]}")
            print(f"     stored active={it.get('active')}")
            print(f"     new active   ={active}")
            print(f"     url={url}")
    print(f"\nChecked: {checked} | Mismatches: {len(mismatches)}")


if __name__ == "__main__":
    main()
