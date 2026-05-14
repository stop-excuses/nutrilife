"""
NutriLife supplement scraper.

Builds a price-per-active-dose dataset for common, measurable supplements.
This intentionally avoids medical recommendations; it only normalizes public
product price and label text into comparable units.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote, urljoin

import requests
from bs4 import BeautifulSoup


ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "data"
OUTPUT_PATH = DATA_DIR / "supplements.json"
BGN_TO_EUR = 1.95583
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
REQUEST_DELAY_SECONDS = 0.35
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except AttributeError:
    pass

CATEGORY_KEYWORDS = {
    "creatine": ("креатин", "creatine", "creapure"),
    "omega3": ("омега", "omega", "epa", "dha", "рибено-масло", "ribeno-maslo"),
    "magnesium": ("магнез", "magnesium"),
    "vitamin_d": ("витамин-d", "vitamin-d", "витамин-d3", "vitamin-d3", "d3-", "d-3", "1000-iu", "2000-iu"),
    "vitamin_c": ("витамин-c", "vitamin-c", "vitamin-c-", "vitamin-c1000", "c-1000", "c1000"),
    "vitamin_b": ("b-complex", "b комплекс", "vitamin-b", "витамин-b", "b12", "b-12", "b6", "b-6"),
    "multivitamin": ("multivitamin", "multi-vitamin", "мултивитамин", "мулти-витамин"),
    "zinc": ("zinc", "цинк", "cink"),
    "protein": ("протеин", "protein", "whey", "суроват", "isolate", "изолат"),
    "fiber": ("псилиум", "psyllium", "фибри", "fiber"),
}

CATEGORY_UNITS = {
    "creatine": {"key": "bgn_per_5g_creatine", "label": "лв / 5 g креатин"},
    "omega3": {"key": "bgn_per_1000mg_epa_dha", "label": "лв / 1000 mg EPA+DHA"},
    "magnesium": {"key": "bgn_per_100mg_magnesium", "label": "лв / 100 mg магнезий"},
    "vitamin_d": {"key": "bgn_per_1000iu_d3", "label": "лв / 1000 IU D3"},
    "vitamin_c": {"key": "bgn_per_1000mg_vitamin_c", "label": "лв / 1000 mg витамин C"},
    "vitamin_b": {"key": "bgn_per_b_complex_serving", "label": "лв / доза B-комплекс"},
    "multivitamin": {"key": "bgn_per_multivitamin_serving", "label": "лв / доза мултивитамин"},
    "zinc": {"key": "bgn_per_15mg_zinc", "label": "лв / 15 mg цинк"},
    "protein": {"key": "bgn_per_25g_protein", "label": "лв / 25 g протеин"},
    "fiber": {"key": "bgn_per_5g_fiber", "label": "лв / 5 g фибри"},
}


@dataclass(frozen=True)
class Source:
    name: str
    sitemap_urls: tuple[str, ...]
    include_hosts: tuple[str, ...]


SOURCES = (
    Source(
        "Fitness1",
        ("https://fitness1.bg/sitemap.xml",),
        ("fitness1.bg",),
    ),
    Source(
        "HealthStore",
        (
            "https://healthstore.bg/sitemap-products.xml?file=1",
            "https://healthstore.bg/sitemap-products.xml?file=2",
            "https://healthstore.bg/sitemap-products.xml?file=3",
            "https://healthstore.bg/sitemap-products.xml?file=4",
        ),
        ("healthstore.bg", "nowfoods.healthstore.bg"),
    ),
    Source(
        "Remedium",
        tuple(f"https://remedium.bg/media/sitemap/sitemap-1-{i}.xml" for i in range(1, 7)),
        ("remedium.bg",),
    ),
    Source(
        "Framar",
        (
            "https://apteka.framar.bg/apteka_produkti.xml",
            "https://apteka.framar.bg/apteka_produkti1.xml",
            "https://apteka.framar.bg/apteka_produkti2.xml",
        ),
        ("apteka.framar.bg",),
    ),
    Source(
        "SilaBG",
        ("https://www.silabg.com/sitemap.xml",),
        ("silabg.com", "www.silabg.com"),
    ),
    Source(
        "GymBeam",
        ("https://gymbeam.bg/media/sitemap/products_bg.xml",),
        ("gymbeam.bg",),
    ),
    Source(
        "MyPharmacy",
        ("https://mypharmacy.bg/sitemap.xml",),
        ("mypharmacy.bg",),
    ),
    Source(
        "Mirabel",
        tuple(f"https://mirabel.bg/sitemap-product-{i}.xml" for i in range(1, 11)),
        ("mirabel.bg",),
    ),
    Source(
        "Ozone",
        tuple(f"https://www.ozone.bg/media/sitemap-products-{i}.xml" for i in range(1, 11)),
        ("ozone.bg", "www.ozone.bg"),
    ),
)


def fetch(url: str, timeout: int = 25) -> str | None:
    try:
        response = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=timeout)
        if response.status_code != 200:
            print(f"[skip] {response.status_code} {url}")
            return None
        return response.text
    except requests.RequestException as exc:
        print(f"[skip] {type(exc).__name__}: {url}")
        return None


def parse_sitemap_urls(xml: str) -> list[str]:
    return [
        html_unescape(match.strip())
        for match in re.findall(r"<loc>\s*(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?\s*</loc>", xml, re.I | re.S)
    ]


def normalize_text(value: str) -> str:
    value = html_unescape(value)
    value = unicodedata.normalize("NFKC", value)
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def html_unescape(value: str) -> str:
    return (
        value.replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&quot;", '"')
        .replace("&#039;", "'")
    )


def detect_category(*parts: str) -> str | None:
    haystack = " ".join(unquote(p or "").lower() for p in parts)
    for category, keywords in CATEGORY_KEYWORDS.items():
        if any(keyword in haystack for keyword in keywords):
            return category
    return None


def discover_urls(source: Source, per_category: int) -> dict[str, list[str]]:
    discovered = {category: [] for category in CATEGORY_KEYWORDS}
    seen: set[str] = set()
    for sitemap_url in source.sitemap_urls:
        xml = fetch(sitemap_url)
        if not xml:
            continue
        for url in parse_sitemap_urls(xml):
            decoded = unquote(url).lower()
            if not any(host in decoded for host in source.include_hosts):
                continue
            if not is_product_url(source.name, decoded):
                continue
            category = detect_category(decoded)
            if not category or url in seen or len(discovered[category]) >= per_category:
                continue
            if any(blocked in decoded for blocked in ("/category/", "/brand/", "/blog/", "/media/")):
                continue
            discovered[category].append(url)
            seen.add(url)
        if all(len(urls) >= per_category for urls in discovered.values()):
            break
    return {category: urls for category, urls in discovered.items() if urls}


def is_product_url(source_name: str, decoded_url: str) -> bool:
    if source_name == "Fitness1":
        return bool(re.search(r"/\d{3,6}/?$", decoded_url)) and "/brand/" not in decoded_url
    if source_name == "HealthStore":
        return not any(part in decoded_url for part in ("/blog", "/category", "/sitemap", "/brand"))
    if source_name == "Remedium":
        return decoded_url.rstrip("/").endswith("/p")
    if source_name == "Framar":
        return bool(re.search(r"apteka\.framar\.bg/\d{6,}", decoded_url))
    if source_name == "SilaBG":
        return bool(re.search(r"/bg/\d+[-\w%]+\.html$", decoded_url))
    if source_name == "GymBeam":
        return decoded_url.endswith(".html")
    if source_name == "MyPharmacy":
        return decoded_url.endswith(".html") and "/hranitelni-dobavki/" in decoded_url
    if source_name == "Mirabel":
        return bool(re.search(r"/[^/]+\.html$", decoded_url))
    if source_name == "Ozone":
        return "/product/" in decoded_url
    return True


def load_json_ld(soup: BeautifulSoup) -> list[dict]:
    results = []
    for script in soup.select('script[type="application/ld+json"]'):
        raw = script.get_text(strip=True)
        if not raw:
            continue
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if isinstance(data, dict) and "@graph" in data and isinstance(data["@graph"], list):
            results.extend(x for x in data["@graph"] if isinstance(x, dict))
        elif isinstance(data, list):
            results.extend(x for x in data if isinstance(x, dict))
        elif isinstance(data, dict):
            results.append(data)
    return results


def find_product_json(json_ld: list[dict]) -> dict:
    for item in json_ld:
        item_type = item.get("@type")
        if item_type == "Product" or (isinstance(item_type, list) and "Product" in item_type):
            return item
    return {}


def parse_price(product: dict, text: str) -> tuple[float | None, float | None, str | None]:
    offers = product.get("offers") or {}
    if isinstance(offers, list):
        offers = offers[0] if offers else {}
    price = parse_number(str(offers.get("price", ""))) if isinstance(offers, dict) else None
    currency = offers.get("priceCurrency") if isinstance(offers, dict) else None
    if price is not None:
        if currency == "EUR":
            return round(price * BGN_TO_EUR, 2), price, "EUR"
        if currency == "BGN":
            return price, round(price / BGN_TO_EUR, 2), "BGN"

    bgn_patterns = (
        r"(\d+(?:[,.]\d{1,2})?)\s*лв",
        r"лв\.?\s*(\d+(?:[,.]\d{1,2})?)",
    )
    for pattern in bgn_patterns:
        match = re.search(pattern, text, re.I)
        if match:
            price_bgn = parse_number(match.group(1))
            return price_bgn, round(price_bgn / BGN_TO_EUR, 2), "BGN"
    return None, None, None


def parse_number(value: str) -> float | None:
    if not value:
        return None
    match = re.search(r"\d+(?:[,.]\d+)?", value.replace(" ", ""))
    if not match:
        return None
    return float(match.group(0).replace(",", "."))


def parse_int(value: str) -> int | None:
    number = parse_number(value)
    return int(number) if number is not None else None


def parse_weight_grams(text: str) -> float | None:
    patterns = (
        r"разфасовка:?\s*(\d+(?:[,.]\d+)?)\s*(кг|kg|гр|(?<!м)г|(?<!m)g)",
        r"(\d+(?:[,.]\d+)?)\s*(кг|kg|гр|(?<!м)г|(?<!m)g)\b",
        r"(\d+(?:[,.]\d+)?)\s*(?:x|х)\s*(\d+(?:[,.]\d+)?)\s*(гр|(?<!м)г|(?<!m)g)",
    )
    for pattern in patterns:
        match = re.search(pattern, text, re.I)
        if not match:
            continue
        if len(match.groups()) >= 3 and match.group(3):
            left = parse_number(match.group(1)) or 0
            right = parse_number(match.group(2)) or 0
            return round(left * right, 2) if left and right else None
        amount = parse_number(match.group(1))
        unit = match.group(2).lower()
        if amount is None:
            continue
        return round(amount * 1000, 2) if unit in {"кг", "kg"} else amount
    return None


def parse_count(text: str) -> int | None:
    patterns = (
        r"(?:х|\*)\s*(\d{1,4})\s*(?:капсули|таблетки|табл|caps|vcaps|softgels|дражета)",
        r"(\d{1,4})\s*(?:капсули|таблетки|табл|caps|vcaps|softgels|дражета)",
    )
    for pattern in patterns:
        match = re.search(pattern, text, re.I)
        if match:
            return parse_int(match.group(1))
    return None


def parse_servings(text: str) -> int | None:
    patterns = (
        r"(\d{1,4})\s*дози",
        r"дози\s+в\s+опаковка\s+(\d{1,4})",
        r"(\d{1,4})\s*servings",
    )
    for pattern in patterns:
        match = re.search(pattern, text, re.I)
        if match:
            return parse_int(match.group(1))
    return None


def extract_active(category: str, text: str, weight_grams: float | None, servings: int | None, count: int | None) -> tuple[dict, dict, str]:
    active: dict = {}
    price_units: dict = {}
    confidence = "low"

    if category == "creatine":
        total_from_pack = extract_total_mg_from_pack_text(text, ("креатин", "creatine"))
        if total_from_pack:
            active["creatine_total_mg"] = total_from_pack
            return active, price_units, "high"
        serving_g = parse_serving_grams(text)
        if serving_g:
            active["creatine_mg_per_serving"] = round(serving_g * 1000)
            confidence = "high"
        elif weight_grams and servings:
            active["creatine_mg_per_serving"] = round(weight_grams * 1000 / servings)
            confidence = "high"
        elif weight_grams and re.search(r"100\s*%|чист|pure|monohydrate|монохидрат", text, re.I):
            active["creatine_total_mg"] = round(weight_grams * 1000)
            confidence = "medium"
        return active, price_units, confidence

    if category == "omega3":
        epa = extract_named_mg(text, ("EPA", "ЕРА", "ейкозапентаенова"))
        dha = extract_named_mg(text, ("DHA", "ДХА", "докозахексаенова"))
        if epa:
            active["epa_mg"] = epa
        if dha:
            active["dha_mg"] = dha
        if epa and dha:
            active["epa_dha_mg"] = epa + dha
            confidence = "high"
        elif epa or dha:
            confidence = "medium"
        return active, price_units, confidence

    if category == "magnesium":
        mg = extract_named_mg(text, ("магнезий", "magnesium"))
        if mg:
            active["magnesium_mg"] = mg
            confidence = "high"
        return active, price_units, confidence

    if category == "vitamin_d":
        iu = extract_vitamin_d_iu(text)
        if iu:
            active["vitamin_d_iu"] = iu
            confidence = "high"
        return active, price_units, confidence

    if category == "vitamin_c":
        mg = extract_named_mg(text, ("vitamin c", "vitamin-c", "c-1000", "ascorbic"))
        if not mg:
            mg = extract_amount_near_category(text, "c")
        if mg:
            active["vitamin_c_mg"] = mg
            confidence = "high"
        return active, price_units, confidence

    if category == "vitamin_b":
        active["b_complex_serving"] = 1
        confidence = "medium"
        return active, price_units, confidence

    if category == "multivitamin":
        active["multivitamin_serving"] = 1
        confidence = "medium"
        return active, price_units, confidence

    if category == "zinc":
        mg = extract_named_mg(text, ("zinc",))
        if mg:
            active["zinc_mg"] = mg
            confidence = "high"
        return active, price_units, confidence

    if category == "protein":
        protein_g = extract_named_g(text, ("протеин", "protein", "белтъчини"))
        if protein_g and 5 <= protein_g <= 50:
            active["protein_g"] = protein_g
            confidence = "medium"
        elif weight_grams and weight_grams >= 300:
            ratio = estimate_protein_ratio(text)
            if ratio:
                active["estimated_total_protein_g"] = round(weight_grams * ratio, 1)
                active["estimated_protein_ratio_pct"] = round(ratio * 100)
                confidence = "low"
        return active, price_units, confidence

    if category == "fiber":
        fiber_g = extract_named_g(text, ("фибри", "fiber", "псилиум", "psyllium"))
        fiber_mg = extract_named_mg(text, ("фибри", "fiber", "псилиум", "psyllium"))
        if fiber_g and 1 <= fiber_g <= 20:
            active["fiber_g"] = fiber_g
            confidence = "medium"
        elif fiber_mg and 100 <= fiber_mg <= 10000:
            active["fiber_mg"] = fiber_mg
            confidence = "medium"
        return active, price_units, confidence

    return active, price_units, confidence


def parse_serving_grams(text: str) -> float | None:
    patterns = (
        r"(?:порция|доза|прием)[^\d]{0,30}(\d+(?:[,.]\d+)?)\s*(?:гр|(?<!m)g|(?<!м)г)",
        r"(\d+(?:[,.]\d+)?)\s*(?:гр|(?<!m)g|(?<!м)г)\s*(?:креатин|creatine)",
    )
    for pattern in patterns:
        match = re.search(pattern, text, re.I)
        if match:
            return parse_number(match.group(1))
    return None


def extract_total_mg_from_pack_text(text: str, names: tuple[str, ...]) -> int | None:
    prefix = text[:500]
    if not any(name.lower() in prefix.lower() for name in names):
        return None
    patterns = (
        r"(\d+(?:[,.]\d+)?)\s*(mg|мг|g|г|гр)\s*(?:\*|x|х)\s*(\d{1,4})",
        r"(?:\*|x|х)\s*(\d{1,4}).{0,40}?(\d+(?:[,.]\d+)?)\s*(mg|мг|g|г|гр)",
    )
    totals = []
    for pattern in patterns:
        for match in re.finditer(pattern, prefix, re.I):
            groups = match.groups()
            if groups[1].lower() in {"mg", "мг", "g", "г", "гр"}:
                amount = parse_number(groups[0])
                unit = groups[1].lower()
                count = parse_int(groups[2])
            else:
                count = parse_int(groups[0])
                amount = parse_number(groups[1])
                unit = groups[2].lower()
            if not amount or not count:
                continue
            if unit in {"g", "г", "гр"}:
                amount *= 1000
            totals.append(round(amount * count))
    return max(totals) if totals else None


def extract_named_mg(text: str, names: tuple[str, ...]) -> int | None:
    values = []
    for name in names:
        escaped = re.escape(name)
        patterns = (
            rf"(\d+(?:[,.]\d+)?)\s*(mg|мг|mcg|мкг|µg)\s+{escaped}",
            rf"{escaped}[^\d]{{0,40}}(\d+(?:[,.]\d+)?)\s*(mg|мг|mcg|мкг|µg)",
        )
        for pattern in patterns:
            for match in re.finditer(pattern, text, re.I):
                amount = parse_number(match.group(1))
                unit = match.group(2).lower()
                if amount is None:
                    continue
                if unit in {"mcg", "мкг", "µg"}:
                    amount = amount / 1000
                values.append(amount)
    if not values:
        return None
    return round(max(values))


def extract_named_g(text: str, names: tuple[str, ...]) -> float | None:
    values = []
    for name in names:
        escaped = re.escape(name)
        patterns = (
            rf"(\d+(?:[,.]\d+)?)\s*(гр|(?<!m)g|(?<!м)г)\s+{escaped}",
            rf"{escaped}[^\d]{{0,40}}(\d+(?:[,.]\d+)?)\s*(гр|(?<!m)g|(?<!м)г)",
        )
        for pattern in patterns:
            for match in re.finditer(pattern, text, re.I):
                amount = parse_number(match.group(1))
                if amount is not None:
                    values.append(amount)
    if not values:
        return None
    return round(max(values), 2)


def extract_amount_near_category(text: str, marker: str) -> int | None:
    patterns = (
        rf"{marker}[^\d]{{0,24}}(\d+(?:[,.]\d+)?)\s*(mg|мг)",
        rf"(\d+(?:[,.]\d+)?)\s*(mg|мг)[^\n]{{0,24}}{marker}",
    )
    values = []
    for pattern in patterns:
        for match in re.finditer(pattern, text, re.I):
            amount = parse_number(match.group(1))
            if amount:
                values.append(amount)
    return round(max(values)) if values else None


def estimate_protein_ratio(text: str) -> float | None:
    lowered = text.lower()
    if any(token in lowered for token in ("isolate", "изолат", "iso whey")):
        return 0.85
    if any(token in lowered for token in ("whey", "суроват", "protein", "протеин")):
        return 0.75
    if any(token in lowered for token in ("vegan protein", "растителен протеин", "pea protein")):
        return 0.65
    return None


def extract_vitamin_d_iu(text: str) -> int | None:
    patterns = (
        r"(?:витамин\s*d3?|vitamin\s*d3?)[^\d]{0,50}(\d{2,6})\s*(?:iu|ме|ui)",
        r"(\d{2,6})\s*(?:iu|ме|ui)[^\n]{0,50}(?:витамин\s*d3?|vitamin\s*d3?)",
        r"d-?3[^\d]{0,30}(\d{2,6})\s*(?:iu|ме|ui)",
    )
    values = []
    for pattern in patterns:
        for match in re.finditer(pattern, text, re.I):
            number = parse_int(match.group(1))
            if number:
                values.append(number)
    return max(values) if values else None


def calculate_price_units(category: str, price_bgn: float | None, active: dict, weight_grams: float | None, servings: int | None, count: int | None) -> dict:
    if not price_bgn:
        return {}
    units: dict = {}
    if category == "creatine":
        total_mg = active.get("creatine_total_mg")
        if not total_mg and active.get("creatine_mg_per_serving") and servings:
            total_mg = active["creatine_mg_per_serving"] * servings
        if not total_mg and weight_grams and weight_grams >= 50:
            total_mg = weight_grams * 1000
        if total_mg:
            units["bgn_per_5g_creatine"] = round(price_bgn / (total_mg / 5000), 2)
    elif category == "omega3":
        per_serving = active.get("epa_dha_mg")
        if per_serving:
            multiplier = servings or count
            total_mg = per_serving * multiplier if multiplier else None
            units["bgn_per_1000mg_epa_dha"] = round(price_bgn / (total_mg / 1000), 2) if total_mg else round(price_bgn / (per_serving / 1000), 2)
    elif category == "magnesium":
        per_serving = active.get("magnesium_mg")
        multiplier = servings or count
        if per_serving and multiplier:
            units["bgn_per_100mg_magnesium"] = round(price_bgn / ((per_serving * multiplier) / 100), 2)
    elif category == "vitamin_d":
        per_serving = active.get("vitamin_d_iu")
        multiplier = servings or count
        if per_serving and multiplier:
            units["bgn_per_1000iu_d3"] = round(price_bgn / ((per_serving * multiplier) / 1000), 2)
    elif category == "vitamin_c":
        per_serving = active.get("vitamin_c_mg")
        multiplier = servings or count
        if per_serving and multiplier:
            units["bgn_per_1000mg_vitamin_c"] = round(price_bgn / ((per_serving * multiplier) / 1000), 2)
    elif category == "vitamin_b":
        multiplier = servings or count
        if multiplier:
            units["bgn_per_b_complex_serving"] = round(price_bgn / multiplier, 2)
    elif category == "multivitamin":
        multiplier = servings or count
        if multiplier:
            units["bgn_per_multivitamin_serving"] = round(price_bgn / multiplier, 2)
    elif category == "zinc":
        per_serving = active.get("zinc_mg")
        multiplier = servings or count
        if per_serving and multiplier:
            units["bgn_per_15mg_zinc"] = round(price_bgn / ((per_serving * multiplier) / 15), 2)
    elif category == "protein":
        protein_g = active.get("protein_g")
        total_protein_g = active.get("estimated_total_protein_g")
        multiplier = servings or None
        if protein_g and multiplier:
            units["bgn_per_25g_protein"] = round(price_bgn / ((protein_g * multiplier) / 25), 2)
        elif total_protein_g:
            units["bgn_per_25g_protein"] = round(price_bgn / (total_protein_g / 25), 2)
    elif category == "fiber":
        fiber_g = active.get("fiber_g")
        fiber_mg = active.get("fiber_mg")
        multiplier = servings or None
        if fiber_g and multiplier:
            units["bgn_per_5g_fiber"] = round(price_bgn / ((fiber_g * multiplier) / 5), 2)
        elif fiber_mg and (servings or count):
            units["bgn_per_5g_fiber"] = round(price_bgn / (((fiber_mg * (servings or count)) / 1000) / 5), 2)
        elif weight_grams and not count:
            units["bgn_per_5g_fiber"] = round(price_bgn / (weight_grams / 5), 2)
    return units


def make_id(store: str, name: str, url: str) -> str:
    base = f"{store}-{name or url}".lower()
    norm = unicodedata.normalize("NFD", base)
    norm = "".join(c for c in norm if unicodedata.category(c) != "Mn")
    norm = re.sub(r"[^\w\s-]", " ", norm)
    norm = re.sub(r"\s+", "-", norm.strip())
    return norm[:96]


def parse_product(source: Source, url: str, forced_category: str | None = None) -> dict | None:
    html = fetch(url)
    if not html:
        return None
    soup = BeautifulSoup(html, "html.parser")
    product = find_product_json(load_json_ld(soup))
    text = normalize_text(soup.get_text(" ", strip=True))
    name = normalize_text(product.get("name") or (soup.title.get_text(" ", strip=True) if soup.title else ""))
    if not name:
        return None
    category = forced_category or detect_category(name, url, text)
    if not category:
        return None
    if not is_relevant_product(category, name, url):
        return None
    price_bgn, price_eur, currency_source = parse_price(product, text)
    if price_bgn is not None and price_bgn < 1:
        return None
    brand = product.get("brand")
    if isinstance(brand, dict):
        brand = brand.get("name")
    image = product.get("image")
    if isinstance(image, list):
        image = image[0] if image else None
    if isinstance(image, dict):
        image = image.get("url")

    weight_grams = parse_weight_grams(f"{name} {text}")
    servings = parse_servings(text)
    count = parse_count(name) or parse_count(f"{name} {text}")
    active, _, confidence = extract_active(category, text, weight_grams, servings, count)
    price_units = calculate_price_units(category, price_bgn, active, weight_grams, servings, count)

    if not price_bgn or not price_units:
        return None
    if any(value <= 0.01 for value in price_units.values()):
        return None

    return {
        "id": make_id(source.name, name, url),
        "store": source.name,
        "name": name,
        "brand": normalize_text(str(brand)) if brand else None,
        "category": category,
        "url": url,
        "image": urljoin(url, image) if image else None,
        "price_bgn": price_bgn,
        "price_eur": price_eur,
        "currency_source": currency_source,
        "weight_grams": weight_grams,
        "servings": servings,
        "count": count,
        "active": active,
        "price_per_active_unit": price_units,
        "unit_label": CATEGORY_UNITS[category]["label"],
        "confidence": confidence,
        "scraped_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }


def is_relevant_product(category: str, name: str, url: str) -> bool:
    haystack = unquote(f"{name} {url}").lower()
    product_name = unquote(name).lower()
    if "::" in name or any(bad in haystack for bad in ("brow fiber", "microfiber", "cloth", "mascara")):
        return False
    if category == "fiber" and "fiber" in haystack and not re.search(r"\bpsyllium\b|\bdaily-fiber\b", haystack, re.I):
        return False
    keywords = CATEGORY_KEYWORDS[category]
    if category == "fiber":
        return bool(re.search(r"\b(psyllium|fiber)\b|псилиум|фибри", haystack, re.I))
    if category == "vitamin_d":
        return bool(re.search(r"витамин\s*d3?|vitamin[-\s]?d3?|\bd3\b|\b\d{3,5}\s*(?:iu|ме)\b", haystack, re.I))
    if category == "vitamin_c":
        if "vitamin case" in product_name:
            return False
        return bool(re.search(r"vitamin[-\s]?c(?:\b|[-\s]?\d)|витамин[-\s]?c(?:\b|[-\s]?\d)|\bc[-\s]?1000\b|ascorbic", product_name, re.I))
    if category == "vitamin_b":
        return bool(re.search(r"b[-\s]?complex|vitamin[-\s]?b|витамин[-\s]?b|\bb12\b|\bb6\b", product_name, re.I))
    if category == "multivitamin":
        return bool(re.search(r"multivitamin|multi-vitamin|мултивитамин", product_name, re.I))
    if category == "zinc":
        return bool(re.search(r"\bzinc\b|цинк|cink", product_name, re.I))
    if category == "protein":
        if any(bad in haystack for bad in ("protein bar", "protein chips", "protein cookie", "протеинов бар", "чипс")):
            return False
        return bool(re.search(r"\bwhey\b|\bprotein\b|суроват|протеин|isolate|изолат", haystack, re.I))
    return any(keyword in haystack for keyword in keywords)


def scrape(per_category: int, sources: set[str] | None = None) -> list[dict]:
    products: list[dict] = []
    seen_ids: set[str] = set()
    for source in SOURCES:
        if sources and source.name.lower() not in sources:
            continue
        print(f"\n== {source.name} ==")
        discovered = discover_urls(source, per_category)
        for category, urls in discovered.items():
            print(f"  {category}: {len(urls)} candidates")
            for url in urls:
                time.sleep(REQUEST_DELAY_SECONDS)
                item = parse_product(source, url, category)
                if not item:
                    continue
                if item["id"] in seen_ids:
                    continue
                seen_ids.add(item["id"])
                products.append(item)
                unit_key = next(iter(item["price_per_active_unit"]))
                print(f"    + {item['name'][:70]} | {item['price_per_active_unit'][unit_key]} {unit_key}")
    return products


def write_output(products: list[dict]) -> None:
    DATA_DIR.mkdir(exist_ok=True)
    data = {
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "total_supplements": len(products),
        "sources": sorted({p["store"] for p in products}),
        "categories": sorted({p["category"] for p in products}),
        "disclaimer": "Данните сравняват цена и етикетна активна съставка. Не са медицински съвет.",
        "supplements": products,
    }
    tmp_path = OUTPUT_PATH.with_suffix(".json.tmp")
    tmp_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp_path.replace(OUTPUT_PATH)
    print(f"\nWrote {OUTPUT_PATH} ({len(products)} records)")


def main() -> None:
    parser = argparse.ArgumentParser(description="Scrape supplement price-per-active-dose data.")
    parser.add_argument("--per-category", type=int, default=8, help="Max candidate URLs per category per source.")
    parser.add_argument("--source", action="append", help="Limit to source name. Can be repeated.")
    args = parser.parse_args()

    selected_sources = {s.lower() for s in args.source} if args.source else None
    products = scrape(args.per_category, selected_sources)
    write_output(products)


if __name__ == "__main__":
    main()
