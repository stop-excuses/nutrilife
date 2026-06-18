#!/usr/bin/env python3
"""Pazarko.bg public API scraper.

Pazarko aggregates products from 8 BG supermarkets with normalized names,
sub-categories, and real CDN image URLs. Their API is public; the X-Web-Token
header is a date-rolling hash (10 min TTL) and is documented client-side.

Usage:
    python scraper/pazarko_scraper.py                  # full catalog
    python scraper/pazarko_scraper.py --store Kaufland # one store
    python scraper/pazarko_scraper.py --search пиле    # by query
    python scraper/pazarko_scraper.py --feed           # discounts+trending+expiring
"""

import argparse
import json
import os
import random
import sys
import time
from datetime import datetime, timezone

import requests

API_BASE = "https://pazarko.bg/api"
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "pazarko.json")
PER_PAGE = 200

# Low-profile request settings. Server-side hard-caps to 50/page anyway,
# so PER_PAGE just bounds our intent. Delays between pages randomized
# to avoid a fixed-cadence fingerprint.
SLEEP_MIN = 1.2
SLEEP_MAX = 3.5
SLEEP_BETWEEN_STORES = (4.0, 9.0)

# Realistic browser UA pool — single bot-like UA stands out in logs.
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:138.0) Gecko/20100101 Firefox/138.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36 Edg/136.0.0.0",
]
# One UA per process run — switching mid-session looks weirder than staying consistent.
SESSION_UA = random.choice(USER_AGENTS)


def web_token() -> str:
    """Mimic pazarko.bg/app.js webToken(): date prefix + salt -> JS-style hash."""
    iso = datetime.now(timezone.utc).isoformat().replace("+00:00", ".000Z")
    s = iso[:15] + "pzk-2026-web"
    h = 0
    for c in s:
        h = ((h << 5) - h) + ord(c)
        h &= 0xFFFFFFFF
        if h & 0x80000000:
            h -= 0x100000000

    n = abs(h)
    if n == 0:
        return "0"
    chars = "0123456789abcdefghijklmnopqrstuvwxyz"
    out = ""
    while n:
        out = chars[n % 36] + out
        n //= 36
    return out


def api_get(path: str, params: dict | None = None, retries: int = 3) -> dict | None:
    url = f"{API_BASE}{path}"
    last_err = None
    for attempt in range(retries):
        headers = {
            "X-Web-Token": web_token(),
            "User-Agent": SESSION_UA,
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "bg,en-US;q=0.7,en;q=0.3",
            "Referer": "https://pazarko.bg/",
            "Origin": "https://pazarko.bg",
        }
        try:
            r = requests.get(url, headers=headers, params=params, timeout=20)
            if r.status_code == 403:
                # token may have rolled over mid-batch — regenerate and retry
                time.sleep(random.uniform(1.0, 2.5))
                continue
            r.raise_for_status()
            return r.json()
        except Exception as e:
            last_err = e
            time.sleep(1.5 * (attempt + 1))
    print(f"  [error] {url} -> {last_err}", file=sys.stderr)
    return None


def fetch_paginated(store: str | None = None, search: str | None = None) -> list[dict]:
    """Walk through a paginated /products query until exhausted."""
    params = {"limit": PER_PAGE, "page": 1}
    if store:
        params["store"] = store
    if search:
        params["search"] = search

    out: list[dict] = []
    while True:
        data = api_get("/products", params)
        if not data or "products" not in data:
            break
        out.extend(data["products"])
        total_pages = data.get("totalPages", 1)
        print(f"  page {params['page']}/{total_pages} -> +{len(data['products'])} (total {len(out)})")
        if params["page"] >= total_pages:
            break
        params["page"] += 1
        time.sleep(random.uniform(SLEEP_MIN, SLEEP_MAX))
    return out


# Pazarko uses 8 supermarkets — we know these from /api/stats response
KNOWN_STORES = ["Kaufland", "Lidl", "Billa", "Fantastico", "TMarket", "Metro", "Dar", "CBA"]


def fetch_all_stores(stores: list[str] | None = None) -> list[dict]:
    targets = stores or KNOWN_STORES
    all_products: list[dict] = []
    for idx, store in enumerate(targets):
        print(f"\nFetching {store}...")
        rows = fetch_paginated(store=store)
        for r in rows:
            r["_pazarko_store"] = store
        all_products.extend(rows)
        if idx + 1 < len(targets):
            pause = random.uniform(*SLEEP_BETWEEN_STORES)
            print(f"  sleeping {pause:.1f}s before next store")
            time.sleep(pause)
    return all_products


def fetch_feed() -> dict:
    return api_get("/feed", {"limit": 50}) or {}


def fetch_stats() -> dict:
    return api_get("/stats") or {}


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--store", help="single store name (Kaufland, Lidl, Billa, Fantastico, TMarket, Metro, Dar, CBA)")
    p.add_argument("--stores", help="comma-separated list of stores (default: only ones we lack good direct scraping for)")
    p.add_argument("--search", help="search keyword (BG)")
    p.add_argument("--feed", action="store_true", help="fetch /feed (discounts+trending+expiring)")
    p.add_argument("--stats", action="store_true", help="just print /stats and exit")
    p.add_argument("--output", default=OUTPUT_PATH, help="output JSON path")
    args = p.parse_args()

    if args.stats:
        print(json.dumps(fetch_stats(), ensure_ascii=False, indent=2))
        return

    payload: dict = {"scraped_at": datetime.now(timezone.utc).isoformat()}

    if args.feed:
        print("Fetching /feed...")
        payload["feed"] = fetch_feed()
    elif args.store or args.search:
        print(f"Fetching store={args.store} search={args.search}...")
        payload["products"] = fetch_paginated(store=args.store, search=args.search)
    else:
        # Default to only stores where direct-magazine scraping leaves us thin —
        # no point hammering pazarko for Kaufland/Lidl when we already cover 99%.
        DEFAULT_TARGETS = ["Billa", "Fantastico", "Metro", "TMarket"]
        targets = [s.strip() for s in args.stores.split(",")] if args.stores else DEFAULT_TARGETS
        print(f"Fetching stores: {', '.join(targets)}")
        payload["products"] = fetch_all_stores(targets)
        payload["by_store_count"] = {}
        for prod in payload["products"]:
            s = prod.get("store") or prod.get("_pazarko_store") or "unknown"
            payload["by_store_count"][s] = payload["by_store_count"].get(s, 0) + 1

    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    count = len(payload.get("products", []))
    print(f"\nWrote {count} products to {args.output}")
    if "by_store_count" in payload:
        for store, n in sorted(payload["by_store_count"].items(), key=lambda x: -x[1]):
            print(f"  {store:12s} {n}")


if __name__ == "__main__":
    main()
