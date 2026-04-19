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
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/135.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json,text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "bg-BG,bg;q=0.9,en;q=0.8",
}
CACHE_PREFIX = "v2:"

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
    name = re.sub(r"\bсупер цена\b", "", name)
    name = re.sub(r"\bпродукт,\s*маркиран\s*със\s*синя\s*звезда\b", "", name)
    name = re.sub(r"\bпроизход\s*-\s*[а-яa-z]+\b", "", name)
    name = re.sub(r"\bза\s+\d+\s*кг\b", "", name)
    # Remove weights like "400 г", "1 кг", "500ml"
    name = re.sub(r"\b\d+\s*(?:г|кг|мл|л|ml|g|kg)\b", "", name)
    # Remove % and numbers-only tokens
    name = re.sub(r"\b\d+%?\b", "", name)
    # Collapse whitespace
    name = re.sub(r"\s+", " ", name).strip()
    return name


def _similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, _normalise(a), _normalise(b)).ratio()


def _tokenise(text: str) -> set[str]:
    return {token for token in re.split(r"\W+", _normalise(text)) if len(token) >= 3}


def _token_overlap(a: str, b: str) -> float:
    left = _tokenise(a)
    right = _tokenise(b)
    if not left or not right:
        return 0.0
    return len(left & right) / len(left | right)


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


def _query_candidates(product_name: str, category: str) -> list[tuple[str, str]]:
    candidates: list[tuple[str, str]] = []

    def add(query: str | None, lang: str) -> None:
        if not query:
            return
        pair = (query.strip(), lang)
        if pair[0] and pair not in candidates:
            candidates.append(pair)

    normalised = _normalise(product_name)
    hint = _en_hint(product_name)

    add(product_name, "bg")
    if normalised != product_name:
        add(normalised, "bg")
    add(hint, "en")

    if category == "dairy":
        add("skyr" if "скир" in normalised else None, "en")
        add("cottage cheese" if "извара" in normalised else None, "en")
        add("yogurt" if "кисело мляко" in normalised else None, "en")
    elif category == "protein":
        add("chicken breast" if "пилеш" in normalised else None, "en")
        add("tuna" if "риба тон" in normalised else None, "en")
        add("salmon" if "сьомга" in normalised else None, "en")
    elif category == "grain":
        add("oats" if "овес" in normalised else None, "en")
        add("rice" if "ориз" in normalised else None, "en")
    elif category == "legume":
        add("lentils" if "леща" in normalised else None, "en")
        add("chickpeas" if "нахут" in normalised else None, "en")
        add("beans" if "боб" in normalised or "фасул" in normalised else None, "en")

    return candidates


# ---------------------------------------------------------------------------
# OFF API search
# ---------------------------------------------------------------------------

def _search_off(query: str, lang: str = "bg", retries: int = 2) -> list[dict]:
    params = {
        "search_terms": query,
        "action": "process",
        "json": 1,
        "search_simple": 1,
        "fields": (
            "product_name,ingredients_text,ingredients_text_bg,ingredients_text_en,"
            "nutriments,image_url,image_front_url,image_front_small_url"
        ),
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
    ingredients = (
        product.get("ingredients_text_bg")
        or product.get("ingredients_text")
        or product.get("ingredients_text_en")
    )
    return {
        "p": round(float(p), 1),
        "f": round(float(n.get("fat_100g") or 0), 1),
        "c": round(float(n.get("carbohydrates_100g") or 0), 1),
        "kcal": round(float(n.get("energy-kcal_100g") or 0)),
        "ingredients": ingredients.strip() if isinstance(ingredients, str) and ingredients.strip() else None,
        "source": "openfoodfacts",
    }


def _extract_image(product: dict) -> str | None:
    for key in ("image_front_url", "image_url", "image_front_small_url"):
        value = product.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _best_product_match(product_name: str, category: str) -> dict | None:
    best_match = None
    best_score = 0.0

    for query, lang in _query_candidates(product_name, category):
        products = _search_off(query, lang=lang)

        for product in products:
            name_off = product.get("product_name", "")
            sim = _similarity(product_name, name_off)
            overlap = _token_overlap(product_name, name_off)
            score = max(sim, overlap)

            if lang == "en" and _en_hint(product_name) and _en_hint(product_name) in query.lower():
                score = max(score, 0.42)

            if score >= MIN_SIMILARITY and score > best_score:
                best_match = product
                best_score = score

        if best_match:
            break

    return best_match


def get_off_product_data(product_name: str, category: str = "other") -> dict | None:
    """
    Return the best OFF match with optional macros and image.

    Result keys:
      - image
      - matched_name
      - macros
    """
    if category not in ENRICHABLE_CATEGORIES:
        return None

    cache = _load_cache()
    cache_key = f"{CACHE_PREFIX}product:{category}:{_normalise(product_name)}"

    if cache_key in cache:
        return cache[cache_key]

    match = _best_product_match(product_name, category)
    result = None

    if match:
        result = {
            "image": _extract_image(match),
            "matched_name": match.get("product_name", ""),
            "macros": _extract_nutriments(match),
        }

    cache[cache_key] = result
    _save_cache(cache)
    return result


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_off_macros(product_name: str, category: str = "other") -> dict | None:
    """
    Look up nutritional values for a product from Open Food Facts.

    Returns a macros dict {p, f, c, kcal, ingredients, source} or None if not found.
    Results are cached in data/off_cache.json.
    """
    if category not in ENRICHABLE_CATEGORIES:
        return None

    product = get_off_product_data(product_name, category)
    return product.get("macros") if product else None


def get_off_image(product_name: str, category: str = "other") -> str | None:
    product = get_off_product_data(product_name, category)
    return product.get("image") if product else None


def get_off_image_match(product_name: str, category: str = "other") -> dict | None:
    """
    Return an image match for UI enrichment.

    First tries the normal OFF match. If that fails, falls back to the first
    query candidate that returns a product image, which is useful for generic
    but visually correct product photos.
    """
    product = get_off_product_data(product_name, category)
    if product and product.get("image"):
        return {"image": product["image"], "matched_name": product.get("matched_name", ""), "generic": False}

    if category not in ENRICHABLE_CATEGORIES:
        return None

    for query, lang in _query_candidates(product_name, category):
        products = _search_off(query, lang=lang)
        for item in products:
            image = _extract_image(item)
            if image:
                return {
                    "image": image,
                    "matched_name": item.get("product_name", ""),
                    "generic": True,
                }

    return None
