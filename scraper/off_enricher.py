"""
Open Food Facts enricher — looks up nutritional values for scraped products.

Uses the Open Food Facts REST API (free, no API key required):
  https://world.openfoodfacts.org

Results are cached in data/off_cache.json so we never hit the API twice
for the same query. On API failure the function returns None gracefully.

Usage:
    from off_enricher import get_off_macros
    macros = get_off_macros("Olympus скир 400 г")
    # → {'p': 11.0, 'f': 0.2, 'c': 3.5, 'kcal': 60, 'source': 'openfoodfacts'}
"""

import json
import re
import time
from difflib import SequenceMatcher
from pathlib import Path

import requests

CACHE_FILE = Path(__file__).parent.parent / "data" / "off_cache.json"
OFF_SEARCH_URL = "https://world.openfoodfacts.org/cgi/search.pl"
HEADERS = {"User-Agent": "NutriLife/1.0 (https://stop-excuses.github.io/nutrilife/)"}

# Minimum name similarity to accept an OFF match (0–1 scale).
# 0.35 means roughly 35% character overlap — loose enough to handle
# language differences ("пиле" ↔ "Chicken") but tight enough to
# reject unrelated products.
MIN_SIMILARITY = 0.30

# Categories we want to enrich (don't bother with drinks, household, etc.)
ENRICHABLE_CATEGORIES = {"protein", "dairy", "canned", "legume", "nuts", "grain", "fat", "vegetable"}


# ---------------------------------------------------------------------------
# Cache helpers
# ---------------------------------------------------------------------------

def _load_cache() -> dict:
    if CACHE_FILE.exists():
        try:
            with open(CACHE_FILE, encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def _save_cache(cache: dict) -> None:
    try:
        with open(CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(cache, f, ensure_ascii=False, indent=2)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Name normalisation helpers
# ---------------------------------------------------------------------------

def _normalise(name: str) -> str:
    """Strip weight/brand clutter for better matching."""
    name = name.lower().strip()
    # Remove weights like "400 г", "1 кг", "500ml"
    name = re.sub(r"\b\d+\s*(?:г|кг|мл|л|ml|g|kg)\b", "", name)
    # Remove % and numbers-only tokens
    name = re.sub(r"\b\d+%?\b", "", name)
    # Collapse whitespace
    name = re.sub(r"\s+", " ", name).strip()
    return name


def _similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, _normalise(a), _normalise(b)).ratio()


# ---------------------------------------------------------------------------
# Bulgarian → English food-type hints (boosts match rate on OFF)
# ---------------------------------------------------------------------------

_BG_TO_EN_HINTS = {
    "пилешко": "chicken",
    "пиле": "chicken",
    "пуешко": "turkey",
    "говеждо": "beef",
    "телешко": "veal",
    "свинско": "pork",
    "агнешко": "lamb",
    "риба тон": "tuna",
    "сьомга": "salmon",
    "скумрия": "mackerel",
    "треска": "cod",
    "ципура": "sea bream",
    "пъстърва": "trout",
    "сельодка": "herring",
    "скир": "skyr",
    "извара": "cottage cheese",
    "кисело мляко": "yogurt",
    "сирене": "cheese",
    "моцарела": "mozzarella",
    "нахут": "chickpeas",
    "леща": "lentils",
    "боб": "beans",
    "фасул": "beans",
    "овес": "oats",
    "ориз": "rice",
    "бадем": "almonds",
    "орех": "walnuts",
    "кашу": "cashews",
    "лешник": "hazelnuts",
    "зехтин": "olive oil",
    "яйц": "eggs",
}


def _en_hint(name: str) -> str | None:
    name_low = name.lower()
    for bg, en in _BG_TO_EN_HINTS.items():
        if bg in name_low:
            return en
    return None


# ---------------------------------------------------------------------------
# OFF API search
# ---------------------------------------------------------------------------

def _search_off(query: str, lang: str = "bg", retries: int = 2) -> list[dict]:
    params = {
        "search_terms": query,
        "action": "process",
        "json": 1,
        "search_simple": 1,
        "fields": "product_name,nutriments",
        "lc": lang,
        "page_size": 5,
    }
    for attempt in range(retries):
        try:
            r = requests.get(OFF_SEARCH_URL, params=params,
                             headers=HEADERS, timeout=10)
            r.raise_for_status()
            return r.json().get("products", [])
        except Exception:
            if attempt < retries - 1:
                time.sleep(1)
    return []


def _extract_nutriments(product: dict) -> dict | None:
    n = product.get("nutriments", {})
    p = n.get("proteins_100g")
    if p is None:
        return None
    return {
        "p": round(float(p), 1),
        "f": round(float(n.get("fat_100g") or 0), 1),
        "c": round(float(n.get("carbohydrates_100g") or 0), 1),
        "kcal": round(float(n.get("energy-kcal_100g") or 0)),
        "source": "openfoodfacts",
    }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_off_macros(product_name: str, category: str = "other") -> dict | None:
    """
    Look up nutritional values for a product from Open Food Facts.

    Returns a macros dict {p, f, c, kcal, source} or None if not found.
    Results are cached in data/off_cache.json.
    """
    if category not in ENRICHABLE_CATEGORIES:
        return None

    cache = _load_cache()
    cache_key = _normalise(product_name)

    if cache_key in cache:
        return cache[cache_key]

    result = None

    # Try Bulgarian search first
    products = _search_off(product_name, lang="bg")

    # If no useful results, try English food-type hint
    if not products:
        hint = _en_hint(product_name)
        if hint:
            products = _search_off(hint, lang="en")

    for p in products:
        name_off = p.get("product_name", "")
        sim = _similarity(product_name, name_off)
        macros = _extract_nutriments(p)
        if macros and sim >= MIN_SIMILARITY:
            result = macros
            break

    # Cache even None results to avoid re-querying for known misses
    cache[cache_key] = result
    _save_cache(cache)
    return result
