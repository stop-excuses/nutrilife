#!/usr/bin/env python3
"""Scrape pharmacy product prices into the Smart Medicines schema.

Input is a JSON list of product targets. Each target should already contain the
medical identity fields that must not be guessed from pharmacy marketing text:
active_substance, active_substance_bg, atc, strength, form, form_bg, tablets,
prescription, pharmacy, and url.
"""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
from bs4 import BeautifulSoup


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = ROOT / "data" / "medicine_sources.json"
DEFAULT_JSON = ROOT / "data" / "medicines.json"
DEFAULT_JS = ROOT / "data" / "medicines.js"


def fetch_html(url: str, timeout: int = 20) -> str:
    response = requests.get(
        url,
        timeout=timeout,
        headers={
            "User-Agent": "NutriLife price transparency bot; contact: ivvmilev@gmail.com",
            "Accept": "text/html,application/xhtml+xml",
        },
    )
    response.raise_for_status()
    return response.text


def extract_json_ld(soup: BeautifulSoup) -> list[dict[str, Any]]:
    blocks: list[dict[str, Any]] = []
    for script in soup.select('script[type="application/ld+json"]'):
        text = script.string or script.get_text(strip=True)
        if not text:
            continue
        try:
            payload = json.loads(text)
        except json.JSONDecodeError:
            continue
        if isinstance(payload, list):
            blocks.extend(item for item in payload if isinstance(item, dict))
        elif isinstance(payload, dict):
            graph = payload.get("@graph")
            if isinstance(graph, list):
                blocks.extend(item for item in graph if isinstance(item, dict))
            blocks.append(payload)
    return blocks


def first_product(blocks: list[dict[str, Any]]) -> dict[str, Any] | None:
    for block in blocks:
        kind = block.get("@type")
        kinds = kind if isinstance(kind, list) else [kind]
        if "Product" in kinds:
            return block
    return None


def extract_price_from_json_ld(product: dict[str, Any] | None) -> float | None:
    if not product:
        return None
    offers = product.get("offers")
    if isinstance(offers, list):
        offers = offers[0] if offers else None
    if not isinstance(offers, dict):
        return None
    for key in ("price", "lowPrice"):
        value = offers.get(key)
        price = parse_price(value)
        if price is not None:
            return price
    return None


def extract_name(soup: BeautifulSoup, product: dict[str, Any] | None) -> str:
    if product and product.get("name"):
        return clean_text(str(product["name"]))
    heading = soup.select_one("h1")
    if heading:
        return clean_text(heading.get_text(" ", strip=True))
    title = soup.select_one("title")
    return clean_text(title.get_text(" ", strip=True)) if title else ""


def extract_price_fallback(soup: BeautifulSoup) -> float | None:
    selectors = [
        '[itemprop="price"]',
        ".price",
        ".product-price",
        ".regular-price",
        ".special-price",
    ]
    for selector in selectors:
        for node in soup.select(selector):
            price = parse_price(node.get("content") or node.get_text(" ", strip=True))
            if price is not None:
                return price
    return None


def scrape_target(target: dict[str, Any]) -> dict[str, Any] | None:
    url = target.get("url")
    if not url:
        return None

    soup = BeautifulSoup(fetch_html(url), "html.parser")
    product = first_product(extract_json_ld(soup))
    price = extract_price_from_json_ld(product) or extract_price_fallback(soup)
    if price is None:
        return None

    name = extract_name(soup, product) or target.get("name") or ""
    record = {
        **target,
        "id": target.get("id") or slugify(f"{target.get('pharmacy', '')}-{name}-{target.get('strength', '')}"),
        "name": name,
        "price_bgn": price,
        "confidence": "scraped",
    }
    return record


def parse_price(value: Any) -> float | None:
    if value is None:
        return None
    text = str(value).replace("\xa0", " ")
    match = re.search(r"(\d+(?:[.,]\d{1,2})?)", text)
    if not match:
        return None
    return float(match.group(1).replace(",", "."))


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9а-яА-Я]+", "-", value.lower()).strip("-")
    return slug[:90] or "medicine"


def load_targets(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if isinstance(payload, dict):
        return list(payload.get("targets", []))
    return list(payload)


def write_outputs(records: list[dict[str, Any]], json_path: Path, js_path: Path, sources: list[str]) -> None:
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "mode": "scraped",
        "sources": sorted(set(sources)),
        "medicines": records,
    }
    json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    js_path.write_text(
        "window.MEDICINES_DATA = " + json.dumps(payload, ensure_ascii=False, indent=2) + ";\n",
        encoding="utf-8",
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Scrape medicine price targets.")
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=DEFAULT_JSON)
    parser.add_argument("--js-output", type=Path, default=DEFAULT_JS)
    args = parser.parse_args()

    targets = load_targets(args.source)
    records: list[dict[str, Any]] = []
    for target in targets:
        try:
            record = scrape_target(target)
        except requests.RequestException as exc:
            print(f"skip {target.get('url')}: {exc}")
            continue
        if record:
            records.append(record)

    sources = [record.get("pharmacy", "") for record in records if record.get("pharmacy")]
    write_outputs(records, args.output, args.js_output, sources)
    print(f"Wrote {len(records)} medicine records to {args.output} and {args.js_output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
