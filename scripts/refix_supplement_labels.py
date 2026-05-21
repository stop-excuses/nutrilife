"""Re-fetch supplement pages and re-extract confidence/active labels for items
currently marked low or medium (where an upgrade is plausible).

Writes the updated supplements.json back. Uses requests; for Fitness1 (which
blocks Python) we fall back to Playwright.

Usage:
    python scripts/refix_supplement_labels.py [--dry-run] [--confidence low,medium] [--limit N] [--playwright]
"""
from __future__ import annotations
import argparse
import json
import sys
import time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import requests
from bs4 import BeautifulSoup

from scraper.supplement_scrapers import extract_active, normalize_text  # type: ignore


SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
    "Accept-Language": "bg-BG,bg;q=0.9,en;q=0.8",
})


def fetch_requests(url: str) -> str | None:
    try:
        r = SESSION.get(url, timeout=25)
        if r.status_code != 200:
            return None
        return r.text
    except Exception:
        return None


_playwright_browser = None


def fetch_playwright(url: str) -> str | None:
    global _playwright_browser
    try:
        from playwright.sync_api import sync_playwright  # type: ignore
    except Exception:
        return None
    if _playwright_browser is None:
        _pw = sync_playwright().start()
        _playwright_browser = _pw.chromium.launch(headless=True)
        sys.modules["_pw_handle"] = _pw  # keep alive
    ctx = _playwright_browser.new_context(user_agent=SESSION.headers["User-Agent"])
    page = ctx.new_page()
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(800)
        html = page.content()
        return html
    except Exception:
        return None
    finally:
        ctx.close()


def page_text(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()
    return normalize_text(soup.get_text(" ", strip=True))


CONF_RANK = {"low": 0, "medium": 1, "high": 2}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--confidence", default="low,medium")
    ap.add_argument("--limit", type=int, default=0, help="Limit number of items (0 = all)")
    ap.add_argument("--playwright", action="store_true", help="Use Playwright for stores that block requests")
    ap.add_argument("--workers", type=int, default=8)
    args = ap.parse_args()

    confs = set(args.confidence.split(","))
    path = ROOT / "data" / "supplements.json"
    data = json.loads(path.read_text(encoding="utf-8"))

    targets = []
    for idx, it in enumerate(data["supplements"]):
        if it.get("confidence") in confs and it.get("availability_status") != "out_of_stock" and it.get("url"):
            targets.append((idx, it))
    if args.limit:
        targets = targets[: args.limit]
    print(f"Targets: {len(targets)} (confidence in {confs})")

    pw_stores = {"Fitness1", "GymBeam", "SilaBG"}  # JS-rendered or blocking

    def work(idx_it):
        idx, it = idx_it
        url = it["url"]
        store = it.get("store", "")
        html = fetch_requests(url)
        used = "requests"
        if not html and args.playwright and store in pw_stores:
            html = fetch_playwright(url)
            used = "playwright"
        if not html:
            return idx, it, None, None, used, "fetch_failed"
        text = page_text(html)
        try:
            active, _pu, conf = extract_active(
                it["category"], text, it.get("weight_grams"), it.get("servings"), it.get("count")
            )
        except Exception as exc:
            return idx, it, None, None, used, f"extract_error:{exc}"
        return idx, it, active, conf, used, "ok"

    updated = 0
    upgraded = 0
    failed = 0
    rows_to_update = []

    # For Playwright items we must run serially (sync API not thread-safe)
    pw_targets = [t for t in targets if t[1].get("store") in pw_stores]
    req_targets = [t for t in targets if t[1].get("store") not in pw_stores]

    def consume(result):
        nonlocal updated, upgraded, failed
        idx, it, active, conf, used, status = result
        if status != "ok":
            failed += 1
            return
        stored_conf = it.get("confidence", "low")
        if conf != stored_conf and CONF_RANK.get(conf, 0) >= CONF_RANK.get(stored_conf, 0):
            # Only upgrade or sideways-update; never downgrade silently to low.
            print(f"  UPGRADE {stored_conf}->{conf} [{used}] {it['store']} | {it['name'][:70]}")
            print(f"    active: {it.get('active')} -> {active}")
            rows_to_update.append((idx, conf, active))
            upgraded += 1
        updated += 1

    if req_targets:
        with ThreadPoolExecutor(max_workers=args.workers) as ex:
            futures = [ex.submit(work, t) for t in req_targets]
            for fut in as_completed(futures):
                consume(fut.result())

    for t in pw_targets:
        consume(work(t))

    print(f"\nChecked: {updated} | Upgrades: {upgraded} | Failed fetch: {failed}")

    if not rows_to_update:
        print("Nothing to write.")
        return

    if args.dry_run:
        print("[dry-run] Skipping write.")
        return

    # Apply updates and recompute price_per_active_unit/unit_label
    from scraper.supplement_scrapers import calculate_price_units  # type: ignore
    for idx, conf, active in rows_to_update:
        it = data["supplements"][idx]
        it["confidence"] = conf
        if active:
            # Replace estimated_* keys with new clean keys when upgrading.
            new_active = {k: v for k, v in (it.get("active") or {}).items() if not k.startswith("estimated_")}
            new_active.update(active)
            it["active"] = new_active
            try:
                pu = calculate_price_units(
                    it["category"], it.get("price_bgn"), new_active,
                    it.get("weight_grams"), it.get("servings"), it.get("count"),
                )
                if pu:
                    it["price_per_active_unit"] = pu
            except Exception as exc:
                print(f"    ! recompute failed: {exc}")

    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {path}")


if __name__ == "__main__":
    main()
