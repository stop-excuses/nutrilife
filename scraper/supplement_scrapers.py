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
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote, urljoin, urlparse

import requests
from bs4 import BeautifulSoup


ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "data"
OUTPUT_PATH = DATA_DIR / "supplements.json"
CACHE_PATH = DATA_DIR / "supplement_scrape_cache.json"
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
    "electrolytes": ("електролит", "electrolyte", "electrolytes", "rehydration", "hydration", "натрий калий"),
    "collagen": ("колаген", "collagen", "collagen peptides", "hydrolyzed collagen"),
    "iron": ("желязо", "iron", "ferrous", "ferrum", "iron bisglycinate"),
    "l_carnitine": ("карнитин", "carnitine", "l-carnitine"),
    "melatonin": ("мелатонин", "melatonin"),
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
    "electrolytes": {"key": "bgn_per_electrolyte_serving", "label": "лв / доза електролити"},
    "collagen": {"key": "bgn_per_10g_collagen", "label": "лв / 10 g колаген"},
    "iron": {"key": "bgn_per_14mg_iron", "label": "лв / 14 mg желязо"},
    "l_carnitine": {"key": "bgn_per_1000mg_carnitine", "label": "лв / 1000 mg карнитин"},
    "melatonin": {"key": "bgn_per_3mg_melatonin", "label": "лв / 3 mg мелатонин"},
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
        "FHL",
        ("https://www.fhl.bg/sitemap.xml",),
        ("fhl.bg", "www.fhl.bg"),
    ),
    Source(
        "Stayfit",
        ("https://stayfit.bg/sitemap/product/1.txt",),
        ("stayfit.bg",),
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
    Source(
        "ProteinBG",
        tuple(f"https://protein.bg/sitemap-product-{i}.xml" for i in range(1, 15)),
        ("protein.bg",),
    ),
    Source(
        "WorkoutBG",
        ("https://workout.bg/sitemap.xml",),
        ("workout.bg",),
    ),
    Source(
        "MusclePower",
        ("https://musclepower.bg/product-sitemap1.xml", "https://musclepower.bg/product-sitemap2.xml"),
        ("musclepower.bg",),
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
    urls = [
        html_unescape(match.strip())
        for match in re.findall(r"<loc>\s*(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?\s*</loc>", xml, re.I | re.S)
    ]
    if urls:
        return urls
    return [line.strip() for line in xml.splitlines() if line.strip().startswith("http")]


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
        if any(category_keyword_matches(haystack, keyword) for keyword in keywords):
            return category
    return None


def category_keyword_matches(haystack: str, keyword: str) -> bool:
    if keyword in {"epa", "dha"}:
        return bool(re.search(rf"(?<![a-zа-я0-9]){re.escape(keyword)}(?![a-zа-я0-9])", haystack, re.I))
    return keyword in haystack


def discover_urls(source: Source, per_category: int, categories: set[str] | None = None) -> dict[str, list[str]]:
    allowed = categories or set(CATEGORY_KEYWORDS)
    if source.name == "FHL":
        return discover_fhl_urls(source, per_category, allowed)
    discovered = {category: [] for category in allowed}
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
            # Use path-only for category detection so domain names (e.g. "protein.bg") don't
            # falsely match keyword "protein" and pull in non-supplement products.
            path_decoded = unquote(urlparse(url).path).lower()
            category = detect_category(path_decoded)
            if not category or category not in allowed or url in seen or len(discovered[category]) >= per_category:
                continue
            if any(blocked in decoded for blocked in ("/category/", "/brand/", "/blog/", "/media/")):
                continue
            discovered[category].append(url)
            seen.add(url)
        if discovered and all(len(urls) >= per_category for urls in discovered.values()):
            break
    return {category: urls for category, urls in discovered.items() if urls}


def discover_fhl_urls(source: Source, per_category: int, allowed: set[str]) -> dict[str, list[str]]:
    discovered = {category: [] for category in allowed}
    seen: set[str] = set()
    listing_urls: list[tuple[str, str]] = []
    for sitemap_url in source.sitemap_urls:
        xml = fetch(sitemap_url)
        if not xml:
            continue
        for url in parse_sitemap_urls(xml):
            decoded = unquote(url).lower()
            if "/products/listing/" not in decoded:
                continue
            category = detect_category(decoded)
            if category and category in allowed:
                listing_urls.append((category, url))

    for category, listing_url in listing_urls:
        if len(discovered[category]) >= per_category:
            continue
        html = fetch(listing_url, timeout=20)
        if not html:
            continue
        soup = BeautifulSoup(html, "html.parser")
        for link in soup.select('.gall-products a[href*="/products/product/"]'):
            href = urljoin(listing_url, link.get("href") or "")
            decoded = unquote(href).lower()
            if "fhl.bg/products/product/" not in decoded or href in seen:
                continue
            discovered[category].append(href)
            seen.add(href)
            if len(discovered[category]) >= per_category:
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
    if source_name == "FHL":
        return "/products/product/" in decoded_url
    if source_name == "Stayfit":
        return "/product/" in decoded_url and "/cdn/" not in decoded_url
    if source_name == "Mirabel":
        return bool(re.search(r"/[^/]+\.html$", decoded_url))
    if source_name == "Ozone":
        return "/product/" in decoded_url
    if source_name == "ProteinBG":
        # Product URLs are single-slug at root: protein.bg/product-name
        # Category pages have extra path segments: protein.bg/sports/proteini/...
        path = decoded_url.split("protein.bg", 1)[-1].strip("/")
        return "/" not in path and bool(path)
    if source_name == "WorkoutBG":
        # Product URLs end with -cena, single slug at root
        path = decoded_url.split("workout.bg", 1)[-1].strip("/")
        return path.endswith("-cena") and "/" not in path
    if source_name == "MusclePower":
        return "/porachka/" in decoded_url and decoded_url.count("/") >= 5
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
            try:
                data = json.loads(raw, strict=False)
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


def flatten_offers(offers) -> list[dict]:
    if isinstance(offers, list):
        result = []
        for offer in offers:
            result.extend(flatten_offers(offer))
        return result
    if not isinstance(offers, dict):
        return []
    nested = offers.get("offers")
    if nested:
        return flatten_offers(nested)
    return [offers]


def is_offer_in_stock(offer: dict) -> bool:
    availability = str(offer.get("availability", "")).lower()
    if any(token in availability for token in ("outofstock", "soldout", "unavailable", "discontinued")):
        return False
    if any(token in availability for token in ("instock", "limitedavailability", "preorder", "presale")):
        return True
    return True


def offer_availability_status(offer: dict) -> str:
    availability = str(offer.get("availability", "")).lower()
    if any(token in availability for token in ("outofstock", "soldout", "unavailable", "discontinued")):
        return "out_of_stock"
    if "limitedavailability" in availability:
        return "limited"
    if any(token in availability for token in ("instock", "preorder", "presale")):
        return "in_stock"
    return "unknown"


def parse_structured_offer(product: dict) -> tuple[float | None, float | None, str | None, str | None, str | None]:
    offers = product.get("offers") or {}
    flat = flatten_offers(offers)
    candidates = [offer for offer in flat if is_offer_in_stock(offer)] or flat

    parsed = []
    for offer in candidates:
        price = parse_number(str(offer.get("price", "")))
        currency = offer.get("priceCurrency")
        if price is not None:
            parsed.append((price, currency, offer))

    if not parsed and isinstance(offers, dict):
        for key in ("lowPrice", "highPrice"):
            price = parse_number(str(offers.get(key, "")))
            currency = offers.get("priceCurrency")
            if price is not None:
                parsed.append((price, currency, offers))
                break

    if not parsed:
        return None, None, None, None, None

    price, currency, offer = min(parsed, key=lambda row: row[0])
    availability_status = offer_availability_status(offer)
    offer_name = normalize_text(str(offer.get("name", ""))) if offer.get("name") else None
    if currency == "EUR":
        return round(price * BGN_TO_EUR, 2), price, "EUR", availability_status, offer_name
    if currency == "BGN":
        return price, round(price / BGN_TO_EUR, 2), "BGN", availability_status, offer_name
    return price, round(price / BGN_TO_EUR, 2), currency or "structured", availability_status, offer_name


def detect_text_availability(text: str) -> str | None:
    lower = text.lower()
    if any(token in lower for token in ("няма наличност", "изчерпано количество", "в момента не е налично", "out of stock", "sold out")):
        return "out_of_stock"
    if any(token in lower for token in ("в наличност", "наличен", "in stock")):
        return "in_stock"
    return None


def parse_money_bgn_from_text(value: str) -> float | None:
    matches = re.findall(r"(\d+(?:[,.]\d{1,2})?)\s*(?:лв|BGN)", value, re.I)
    if matches:
        return parse_number(matches[-1])
    return None


def parse_source_price(source_name: str, soup: BeautifulSoup) -> tuple[float | None, float | None, str | None, str | None, str | None]:
    if source_name == "FHL":
        page_text = normalize_text(soup.get_text(" ", strip=True))
        main_match = re.search(r"Цена:\s*(?:\d+(?:[,.]\d{1,2})?\s*€\s*/\s*)?(\d+(?:[,.]\d{1,2})?)\s*лв", page_text, re.I)
        if main_match:
            price_bgn = parse_number(main_match.group(1))
            if price_bgn is not None:
                return price_bgn, round(price_bgn / BGN_TO_EUR, 2), "BGN", detect_text_availability(page_text), None
        candidates = []
        product_sections = [
            node for node in soup.select(".prod-sec")
            if "Продукт №:" in node.get_text(" ", strip=True) or "Цена:" in node.get_text(" ", strip=True)
        ]
        price_nodes = []
        for section in product_sections:
            price_nodes.extend(section.select(".price"))
        if not price_nodes:
            price_nodes = soup.select(".prod-sec .price, .price")
        for node in price_nodes:
            clone = BeautifulSoup(str(node), "html.parser")
            for old_node in clone.select(".old_value"):
                old_node.decompose()
            price = parse_money_bgn_from_text(clone.get_text(" ", strip=True))
            if price is not None:
                candidates.append(price)
        if candidates:
            price_bgn = candidates[0]
            return price_bgn, round(price_bgn / BGN_TO_EUR, 2), "BGN", detect_text_availability(soup.get_text(" ", strip=True)), None
    return None, None, None, None, None


def parse_price(product: dict, text: str) -> tuple[float | None, float | None, str | None, str | None, str | None]:
    structured = parse_structured_offer(product)
    if structured[0] is not None:
        return structured

    offers = product.get("offers") or {}
    if isinstance(offers, list):
        offers = offers[0] if offers else {}
    price = parse_number(str(offers.get("price", ""))) if isinstance(offers, dict) else None
    currency = offers.get("priceCurrency") if isinstance(offers, dict) else None
    if price is not None:
        if currency == "EUR":
            return round(price * BGN_TO_EUR, 2), price, "EUR", detect_text_availability(text), None
        if currency == "BGN":
            return price, round(price / BGN_TO_EUR, 2), "BGN", detect_text_availability(text), None

    bgn_patterns = (
        r"(\d+(?:[,.]\d{1,2})?)\s*лв",
        r"лв\.?\s*(\d+(?:[,.]\d{1,2})?)",
    )
    for pattern in bgn_patterns:
        match = re.search(pattern, text, re.I)
        if match:
            price_bgn = parse_number(match.group(1))
            return price_bgn, round(price_bgn / BGN_TO_EUR, 2), "BGN", detect_text_availability(text), None
    return None, None, None, detect_text_availability(text), None


def extract_promo_info(soup: BeautifulSoup, price_bgn: float | None, source_name: str | None = None) -> dict:
    if not price_bgn:
        return {}

    old_price = None
    if source_name == "FHL":
        first_price = soup.select_one(".prod-sec .price, .price")
        old_nodes = first_price.select(".old_value") if first_price else []
        for node in old_nodes:
            parsed = parse_money_bgn_from_text(node.get_text(" ", strip=True))
            if parsed and parsed > price_bgn:
                old_price = parsed if old_price is None else min(old_price, parsed)
        if old_price is None:
            text = normalize_text(soup.get_text(" ", strip=True))
            match = re.search(
                r"Цена:\s*\d+(?:[,.]\d{1,2})?\s*€\s*/\s*\d+(?:[,.]\d{1,2})?\s*лв\.?\s*"
                r"\d+(?:[,.]\d{1,2})?\s*€\s*/\s*(\d+(?:[,.]\d{1,2})?)\s*лв",
                text,
                re.I,
            )
            if match:
                parsed = parse_number(match.group(1))
                if parsed and parsed > price_bgn:
                    old_price = parsed
    else:
        for selector in (
            ".old_value",
            ".price-old-js",
            "._product-details-price-old",
            ".old-price",
            ".regular-price",
        ):
            for node in soup.select(selector):
                parsed = parse_money_bgn_from_text(node.get_text(" ", strip=True))
                if parsed and parsed > price_bgn:
                    old_price = parsed if old_price is None else min(old_price, parsed)

    text = normalize_text(soup.get_text(" ", strip=True))
    if old_price is None:
        for pattern in (
            r"(?:Стара цена|Old price|Regular price):?\s*[^.]{0,80}?(\d+(?:[,.]\d{1,2})?)\s*(?:лв|BGN)",
            r"(\d+(?:[,.]\d{1,2})?)\s*(?:лв|BGN)\s*(?:Стара цена|Old price|Regular price)",
        ):
            for match in re.finditer(pattern, text, re.I):
                parsed = parse_number(match.group(1))
                if parsed and parsed > price_bgn:
                    old_price = parsed if old_price is None else min(old_price, parsed)

    discount_pct = None
    for node in soup.select(".badge-discount, ._product-discount, .product-discount, .discount"):
        match = re.search(r"(\d{1,2})\s*%", node.get_text(" ", strip=True))
        if match:
            discount_pct = int(match.group(1))
            break

    if old_price is None:
        return {"promo_label": f"-{discount_pct}%"} if discount_pct else {}

    computed = round((old_price - price_bgn) / old_price * 100)
    if computed <= 0:
        return {}
    return {
        "old_price_bgn": round(old_price, 2),
        "discount_pct": discount_pct or computed,
        "promo_label": f"-{discount_pct or computed}%",
    }


def parse_number(value: str) -> float | None:
    if not value:
        return None
    match = re.search(r"\d+(?:[,.]\d+)?", value.replace(" ", ""))
    if not match:
        return None
    return float(match.group(0).replace(",", "."))


def image_value_to_list(value) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        url = value.get("url") or value.get("contentUrl")
        return [url] if url else []
    if isinstance(value, list):
        result = []
        for entry in value:
            result.extend(image_value_to_list(entry))
        return result
    return []


def is_product_image_url(image_url: str) -> bool:
    lower = image_url.lower()
    blocked = (
        "logo",
        "icon",
        "sprite",
        "banner",
        "payment",
        "paymethod",
        "facebook.com",
        "messenger",
        "whatsapp",
        "offers_",
        "clickhere",
    )
    if any(token in lower for token in blocked):
        return False
    return any(token in lower for token in ("/image", "/media", "/detailed", "/product", "thumbnail", ".jpg", ".jpeg", ".png", ".webp"))


def best_image(candidates: list[str], page_url: str) -> str | None:
    normalized = []
    seen = set()
    for candidate in candidates:
        if not candidate:
            continue
        image_url = urljoin(page_url, candidate.strip())
        if image_url.startswith("http://"):
            image_url = "https://" + image_url.removeprefix("http://")
        if image_url in seen or not is_product_image_url(image_url):
            continue
        seen.add(image_url)
        normalized.append(image_url)
    if not normalized:
        return None

    def score(image_url: str) -> int:
        lower = image_url.lower()
        points = 0
        if any(token in lower for token in ("detailed", "product", "/p/", "catalog/product")):
            points += 4
        if any(token in lower for token in ("350/350", "500", "600", "700", "800", "900", "1000")):
            points += 2
        if any(token in lower for token in ("label", "nutrition", "supplement-facts", "ingredients")):
            points -= 3
        if any(token in lower for token in ("80/60", "feature_variant", "brand")):
            points -= 4
        return points

    return max(normalized, key=score)


def extract_product_image(product: dict, soup: BeautifulSoup, page_url: str) -> str | None:
    candidates = image_value_to_list(product.get("image"))
    for selector, attr in (
        ('meta[property="og:image"]', "content"),
        ('meta[property="og:image:secure_url"]', "content"),
        ('meta[name="twitter:image"]', "content"),
        ('link[rel="image_src"]', "href"),
    ):
        candidates.extend(el.get(attr) for el in soup.select(selector) if el.get(attr))

    product_selectors = (
        ".ty-product-img img",
        ".ty-product-block img",
        ".product-essential img",
        ".product-info-main img",
        ".product.media img",
        ".gallery img",
        ".product-gallery img",
        ".product-image img",
        ".product__image img",
        "main img",
    )
    image_attrs = ("src", "data-src", "data-original", "data-lazy", "data-zoom-image", "data-large_image")
    for selector in product_selectors:
        for img in soup.select(selector):
            candidates.extend(img.get(attr) for attr in image_attrs if img.get(attr))
    for element in soup.select("[image-src]"):
        candidates.append(element.get("image-src"))
    for element in soup.select('[style*="background-image"]'):
        style = element.get("style") or ""
        candidates.extend(re.findall(r"background-image:\s*url\(['\"]?([^'\")]+)", style, re.I))

    return best_image([c for c in candidates if c], page_url)


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


def parse_largest_weight_grams(text: str) -> float | None:
    weights = []
    patterns = (
        r"(\d+(?:[,.]\d+)?)\s*(кг|kg|гр|(?<!м)г|(?<!m)g)\b",
        r"(\d+(?:[,.]\d+)?)\s*(?:x|х)\s*(\d+(?:[,.]\d+)?)\s*(гр|(?<!м)г|(?<!m)g)",
    )
    for pattern in patterns:
        for match in re.finditer(pattern, text, re.I):
            if len(match.groups()) >= 3 and match.group(3):
                left = parse_number(match.group(1)) or 0
                right = parse_number(match.group(2)) or 0
                if left and right:
                    weights.append(round(left * right, 2))
                continue
            amount = parse_number(match.group(1))
            unit = match.group(2).lower()
            if amount is not None:
                weights.append(round(amount * 1000, 2) if unit in {"кг", "kg"} else amount)
    return max(weights) if weights else None


def parse_count(text: str) -> int | None:
    patterns = (
        r"(?:х|x|\*)\s*(\d{1,4})\s*(?:капсули|таблетки|табл|caps|vcaps|softgels|дражета|sticks?|sachets?)",
        r"(\d{1,4})\s*(?:бр\.?\s*)?(?:х|x|\*)",
        r"(\d{1,4})\s*(?:капсули|таблетки|табл|caps|vcaps|softgels|дражета)",
        r"(\d{1,4})\s*(?:sticks?|sachets?)",
    )
    for pattern in patterns:
        match = re.search(pattern, text, re.I)
        if match:
            val = parse_int(match.group(1))
            # Skip copyright years and implausibly large counts
            if val and (2020 <= val <= 2030 or val > 500):
                continue
            return val
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


def extract_count_from_name(name: str) -> int | None:
    """Extract tablet/capsule count from product name, e.g. '* 30', '× 20', '/ 90 Tabs'."""
    patterns = (
        r"[*×х]\s*(\d+)(?:\s*\+\s*\d+)?\s*$",            # "* 30", "× 20+2" at name end
        r"(?<!\w)x\s+(\d+)(?:\s*\+\s*\d+)?\s*$",         # "x 30" — standalone x (space required, not "X8")
        r"/\s*(\d+)\s*(?:Effervescent\s+)?(?:Tabs?|Caps?|капс|табл)\b",  # "/ 20 Tabs"
        r"\b(\d+)\s*(?:Tabs?|Caps?)\s*$",                 # "90 Tabs" at name end
    )
    for pattern in patterns:
        m = re.search(pattern, name, re.I)
        if m:
            val = int(m.group(1))
            if 1 <= val <= 500:
                return val
    return None


def extract_product_detail_text(soup: BeautifulSoup) -> str:
    selectors = (
        ".product-information",
        ".product-description",
        ".product-specification",
        ".product-info",
        ".product-tabs",
        ".tab-content",
        "#description",
        "#section-1",
        "#section-2",
        "table",
        "article",
    )
    chunks = []
    seen = set()
    for selector in selectors:
        for node in soup.select(selector):
            text = normalize_text(node.get_text(" ", strip=True))
            if len(text) < 20 or text in seen:
                continue
            seen.add(text)
            chunks.append(text)
    return normalize_text(" ".join(chunks))


def extract_product_label_text(soup: BeautifulSoup, category: str) -> str | None:
    terms = set(CATEGORY_KEYWORDS.get(category, ()))
    terms.update((
        "supplement facts", "nutrition facts", "nutritional", "ingredients",
        "състав", "хранител", "актив", "доза", "прием", "serving",
        "epa", "dha", "protein", "протеин", "магнезий", "цинк", "желязо",
        "витамин", "колаген", "фибри", "натрий", "калий",
    ))
    selectors = (
        "table",
        ".product-specification",
        ".product-information",
        ".product-description",
        ".product-tabs",
        ".tab-content",
        "#description",
        "#section-1",
        "#section-2",
        "[class*='nutrition']",
        "[class*='ingredient']",
        "[class*='supplement']",
        "[class*='composition']",
    )
    chunks = []
    seen = set()
    for selector in selectors:
        for node in soup.select(selector):
            text = normalize_text(node.get_text(" | " if node.name == "table" else " ", strip=True))
            lower = text.lower()
            if len(text) < 30 or text in seen:
                continue
            if not any(term.lower() in lower for term in terms):
                continue
            seen.add(text)
            chunks.append(text)
            if len(" ".join(chunks)) > 1800:
                break
        if len(" ".join(chunks)) > 1800:
            break
    if not chunks:
        return None
    return normalize_text(" / ".join(chunks))[:1800]


def extract_product_label_image(soup: BeautifulSoup, page_url: str) -> str | None:
    candidates = []
    signals = ("label", "nutrition", "supplement", "facts", "ingredient", "composition", "back", "etiket", "sustav")
    for img in soup.select("img"):
        def _attr_str(v):
            return " ".join(v) if isinstance(v, list) else (v or "")
        descriptor = " ".join(
            _attr_str(img.get(attr, "")) for attr in ("src", "data-src", "data-original", "data-zoom-image", "alt", "title", "class")
        ).lower()
        if any(signal in descriptor for signal in signals):
            for attr in ("data-zoom-image", "data-large_image", "data-original", "data-src", "src"):
                if img.get(attr):
                    candidates.append(img.get(attr))
    return best_image([urljoin(page_url, c) for c in candidates if c], page_url)


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
        if serving_g and serving_g <= 10:
            active["creatine_mg_per_serving"] = round(serving_g * 1000)
            confidence = "high"
        elif weight_grams and servings:
            per_serving = weight_grams * 1000 / servings
            if per_serving <= 10000:
                active["creatine_mg_per_serving"] = round(per_serving)
                confidence = "high"
            elif re.search(r"100\s*%|чист|pure|monohydrate|монохидрат", text, re.I):
                active["creatine_total_mg"] = round(weight_grams * 1000)
                confidence = "medium"
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
        if mg and 20 <= mg <= 800:
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
        if mg and 3 <= mg <= 100:
            active["zinc_mg"] = mg
            confidence = "high"
        return active, price_units, confidence

    if category == "protein":
        protein_g = extract_protein_g_per_serving(text, parse_serving_grams(text))
        if protein_g and 5 <= protein_g <= 50:
            active["protein_g"] = protein_g
            confidence = "high"
        elif weight_grams and weight_grams >= 300:
            ratio = extract_protein_ratio_from_label_text(text)
            if ratio:
                active["estimated_total_protein_g"] = round(weight_grams * ratio, 1)
                active["estimated_protein_ratio_pct"] = round(ratio * 100)
                confidence = "medium"
                return active, price_units, confidence
            ratio = estimate_protein_ratio(text)
            if ratio:
                active["estimated_total_protein_g"] = round(weight_grams * ratio, 1)
                active["estimated_protein_ratio_pct"] = round(ratio * 100)
                confidence = "low"
        return active, price_units, confidence

    if category == "fiber":
        fiber_g = extract_fiber_g_per_serving(text)
        fiber_mg = extract_named_mg(text, ("фибри", "fiber", "псилиум", "psyllium"))
        if fiber_g and 1 <= fiber_g <= 20:
            active["fiber_g"] = fiber_g
            confidence = "high"
        elif fiber_mg and 100 <= fiber_mg <= 10000:
            active["fiber_mg"] = fiber_mg
            confidence = "medium"
        return active, price_units, confidence

    if category == "electrolytes":
        sodium_mg = extract_named_mg(text, ("натрий", "sodium"))
        potassium_mg = extract_named_mg(text, ("калий", "potassium"))
        magnesium_mg = extract_named_mg(text, ("магнезий", "magnesium"))
        if sodium_mg and 50 <= sodium_mg <= 3000:
            active["sodium_mg"] = sodium_mg
        if potassium_mg and 20 <= potassium_mg <= 2000:
            active["potassium_mg"] = potassium_mg
        if magnesium_mg and 10 <= magnesium_mg <= 800:
            active["magnesium_mg"] = magnesium_mg
        active["electrolyte_serving"] = 1
        confidence = "high" if active.get("sodium_mg") or active.get("potassium_mg") else "medium"
        return active, price_units, confidence

    if category == "collagen":
        collagen_g = extract_named_g(text, ("колаген", "collagen", "collagen peptides"))
        collagen_mg = extract_named_mg(text, ("колаген", "collagen", "collagen peptides"))
        if collagen_g and 1 <= collagen_g <= 30:
            active["collagen_g"] = collagen_g
            confidence = "high"
        elif collagen_mg and 1000 <= collagen_mg <= 30000:
            active["collagen_g"] = round(collagen_mg / 1000, 2)
            confidence = "high"
        elif weight_grams and weight_grams >= 50 and not re.search(r"капсул|caps|табл|tablet|liquid|ml|мл", text[:2000], re.I):
            active["collagen_total_g"] = weight_grams
            confidence = "medium"
        return active, price_units, confidence

    if category == "iron":
        mg = extract_named_mg(text, ("желязо", "iron", "ferrous", "ferrum"))
        if mg and 2 <= mg <= 100:
            active["iron_mg"] = mg
            confidence = "high"
        return active, price_units, confidence

    if category == "l_carnitine":
        mg = extract_named_mg(text, ("карнитин", "carnitine", "l-carnitine"))
        if mg and 100 <= mg <= 5000:
            active["carnitine_mg"] = mg
            confidence = "high"
        return active, price_units, confidence

    if category == "melatonin":
        mg = extract_named_mg(text, ("мелатонин", "melatonin"))
        if mg and 1 <= mg <= 20:
            active["melatonin_mg"] = mg
            confidence = "high"
        return active, price_units, confidence

    return active, price_units, confidence


def apply_label_overrides(url: str, category: str, active: dict, confidence: str) -> tuple[dict, str]:
    overrides = {
        # HealthStore exposes this table as the second product image; page text
        # only says "up to 80%", so keep the real visible label value here.
        "https://healthstore.bg/gym-beam-true-whey-2500-g": {
            "category": "protein",
            "active": {"protein_g": 22},
            "confidence": "high",
        },
        # Stayfit product page has no nutrition text; ON bag + official label: 25 g protein / serving.
        "https://stayfit.bg/product/optimum-nutrition-100-isolate-gold-standard": {
            "category": "protein",
            "active": {"protein_g": 25},
            "confidence": "high",
        },
    }
    override = overrides.get(url)
    if not override or override["category"] != category:
        return active, confidence
    return dict(override["active"]), override["confidence"]


def extract_fiber_g_per_serving(text: str) -> float | None:
    """Find grams of fiber/psyllium per serving from product page text.

    Strategy: only accept values in [1, 20] g range that appear close to a
    per-serving anchor (доза, прием, лъжичка, лъжица, сашé, capsule, на 1, per
    serving) or in a clear tabular "Фибри X g per serving" layout.
    """
    candidates: list[tuple[float, int]] = []  # (grams, priority)
    serving_anchors = (
        "доза", "прием", "лъжичка", "лъжица", "саше", "scoop", "мерителна",
        "мерителен", "чаена лъжич", "супена лъжич", "ч.л", "с.л",
        "една порция", "per serving", "на 1",
    )
    fiber_names = ("фибри", "fiber", "psyllium", "псилиум", "husk", "husks", "хуск")

    # 1) "X g <fibre name>" or "<fibre name> X g" within 0..80 chars of an anchor.
    name_pat = "(?:" + "|".join(re.escape(n) for n in fiber_names) + ")"
    g_unit = r"(?:гр|g|г)\b"
    val = r"(\d{1,2}(?:[,.]\d+)?)"
    near = 80

    # 1a) Pattern: "<anchor>...<value> g <name>" or "<anchor>...<name>...<value> g"
    for anchor in serving_anchors:
        for m in re.finditer(
            rf"{re.escape(anchor)}[^\n]{{0,{near}}}?{val}\s*{g_unit}\s*{name_pat}",
            text, re.I,
        ):
            v = parse_number(m.group(1))
            if v and 1 <= v <= 20:
                candidates.append((v, 3))
        for m in re.finditer(
            rf"{re.escape(anchor)}[^\n]{{0,{near}}}?{name_pat}[^\d\n]{{0,30}}{val}\s*{g_unit}",
            text, re.I,
        ):
            v = parse_number(m.group(1))
            if v and 1 <= v <= 20:
                candidates.append((v, 3))

    # 2) Tabular "Фибри X g" — but only accept the SMALLEST plausible value
    # (typical layout: "Фибри 64,3 g 4,5 g" → per-100g and per-serving).
    tab_values: list[float] = []
    for m in re.finditer(rf"(?:фибри|fiber)\s+{val}\s*{g_unit}(?:\s+{val}\s*{g_unit})?", text, re.I):
        for grp in m.groups():
            v = parse_number(grp)
            if v and 1 <= v <= 20:
                tab_values.append(v)
    if tab_values:
        candidates.append((min(tab_values), 2))

    # 3) Bare "X g psyllium/fiber" anywhere in the first half of text (lower priority).
    for m in re.finditer(rf"{val}\s*{g_unit}\s*{name_pat}", text[:8000], re.I):
        v = parse_number(m.group(1))
        if v and 1 <= v <= 20:
            candidates.append((v, 1))

    if not candidates:
        return None
    # Pick the highest-priority hit; among same priority pick the largest plausible per-serving value.
    candidates.sort(key=lambda x: (-x[1], -x[0]))
    return round(candidates[0][0], 2)


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


def extract_protein_g_per_serving(text: str, serving_grams: float | None) -> float | None:
    values = []
    names = ("протеин", "protein", "белтъчини", "белтъци")
    units = r"(?:гр|g|г)"
    for name in names:
        escaped = re.escape(name)
        patterns = (
            rf"{escaped}\s*(?:на\s+доза|per\s+serving|/\s*serving)?[^\d]{{0,35}}(\d{{1,2}}(?:[,.]\d+)?)\s*{units}\b",
            rf"(\d{{1,2}}(?:[,.]\d+)?)\s*{units}\s*(?:{escaped})\b",
        )
        for pattern in patterns:
            for match in re.finditer(pattern, text, re.I):
                amount = parse_number(match.group(1))
                context = match.group(0).lower()
                if (
                    amount
                    and 8 <= amount <= 45
                    and not is_serving_size_context(context, name, amount, serving_grams)
                ):
                    values.append(amount)

    per_100g = extract_protein_g_per_100g(text)
    if per_100g and serving_grams and 10 <= serving_grams <= 60:
        values.append(round(serving_grams * per_100g / 100, 2))

    if not values:
        return None
    return round(max(values), 2)


def extract_protein_ratio_from_label_text(text: str) -> float | None:
    patterns = (
        r"(?:до|up to)?\s*(\d{2}(?:[,.]\d+)?)\s*%\s*(?:чист\s+)?(?:протеин|белтъчини|protein)",
        r"(?:протеин|белтъчини|protein)[^\n]{0,60}?(?:до|up to)?\s*(\d{2}(?:[,.]\d+)?)\s*%",
    )
    values = []
    for pattern in patterns:
        for match in re.finditer(pattern, text, re.I):
            amount = parse_number(match.group(1))
            if amount and 45 <= amount <= 95:
                values.append(amount / 100)
    return max(values) if values else None


def is_serving_size_context(context: str, nutrient_name: str, amount: float, serving_grams: float | None) -> bool:
    if nutrient_name in {"белтъчини", "белтъци"}:
        return False
    if any(token in context for token in ("дозировка", "една доза", "serving size", "тип продукт")):
        return True
    if serving_grams and abs(amount - serving_grams) < 0.01 and not any(token in context for token in ("per serving", "на доза")):
        return True
    return False


def extract_protein_g_per_100g(text: str) -> float | None:
    values = []
    names = ("протеин", "protein", "белтъчини", "белтъци")
    units = r"(?:гр|g|г)"
    for name in names:
        escaped = re.escape(name)
        patterns = (
            rf"{escaped}[^\d]{{0,45}}(\d{{2}}(?:[,.]\d+)?)\s*{units}[^\n]{{0,80}}(?:100\s*{units}|на\s+100)",
            rf"(?:100\s*{units}|на\s+100)[^\n]{{0,80}}{escaped}[^\d]{{0,45}}(\d{{2}}(?:[,.]\d+)?)\s*{units}",
        )
        for pattern in patterns:
            for match in re.finditer(pattern, text, re.I):
                amount = parse_number(match.group(1))
                if amount and 45 <= amount <= 95:
                    values.append(amount)
    return round(max(values), 2) if values else None


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
    elif category == "electrolytes":
        multiplier = servings or count
        if multiplier:
            units["bgn_per_electrolyte_serving"] = round(price_bgn / multiplier, 2)
    elif category == "collagen":
        collagen_g = active.get("collagen_g")
        total_collagen_g = active.get("collagen_total_g")
        if collagen_g and (servings or count):
            units["bgn_per_10g_collagen"] = round(price_bgn / ((collagen_g * (servings or count)) / 10), 2)
        elif total_collagen_g:
            units["bgn_per_10g_collagen"] = round(price_bgn / (total_collagen_g / 10), 2)
    elif category == "iron":
        per_serving = active.get("iron_mg")
        multiplier = servings or count
        if per_serving and multiplier:
            units["bgn_per_14mg_iron"] = round(price_bgn / ((per_serving * multiplier) / 14), 2)
    elif category == "l_carnitine":
        per_serving = active.get("carnitine_mg")
        multiplier = servings or count
        if per_serving and multiplier:
            units["bgn_per_1000mg_carnitine"] = round(price_bgn / ((per_serving * multiplier) / 1000), 2)
        elif weight_grams and not count:
            units["bgn_per_1000mg_carnitine"] = round(price_bgn / (weight_grams), 2)
    elif category == "melatonin":
        per_serving = active.get("melatonin_mg")
        multiplier = servings or count
        if per_serving and multiplier:
            units["bgn_per_3mg_melatonin"] = round(price_bgn / ((per_serving * multiplier) / 3), 2)
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
    detail_text = extract_product_detail_text(soup)
    raw_name = product.get("name") or ""
    if not raw_name:
        h1 = soup.select_one("h1")
        raw_name = h1.get_text(" ", strip=True) if h1 else (soup.title.get_text(" ", strip=True) if soup.title else "")
        # Strip FHL/pharmacy page-title suffixes: "Name — Brand — цена, прием... | Site.bg"
        raw_name = re.sub(r"\s*—\s*цена[\w,\s]*\|.*$", "", raw_name, flags=re.I).strip()
        raw_name = re.sub(r"\s*\|\s*\S+\.bg\s*$", "", raw_name, flags=re.I).strip()
    name = normalize_text(raw_name)
    if not name:
        return None
    category = forced_category or detect_category(name, url, text)
    if not category:
        return None
    if not (forced_category and source.name == "FHL") and not is_relevant_product(category, name, url):
        return None
    price_bgn, price_eur, currency_source, availability_status, offer_name = parse_source_price(source.name, soup)
    if price_bgn is None:
        price_bgn, price_eur, currency_source, availability_status, offer_name = parse_price(product, text)
    if availability_status == "out_of_stock":
        return None
    if price_bgn is not None and price_bgn < 1:
        return None
    brand = product.get("brand")
    if isinstance(brand, dict):
        brand = brand.get("name")
    image = extract_product_image(product, soup, url)

    offer_weight_grams = parse_largest_weight_grams(offer_name or "") if offer_name else None
    weight_grams = offer_weight_grams or parse_weight_grams(f"{name} {text}")
    servings = parse_servings(text)
    serving_grams = parse_serving_grams(text)
    # Sanity-check: protein powder must have ≥10g/serving; cap impossible values
    # (catches "606 servings" scraped from a larger variant listed on the same page)
    if category == "protein" and servings and weight_grams and servings > weight_grams / 10:
        servings = None
    if category == "protein" and weight_grams and serving_grams and weight_grams > serving_grams:
        estimated_servings = max(1, int(weight_grams // serving_grams))
        if not servings or servings < max(10, estimated_servings // 3) or servings > estimated_servings * 3:
            servings = estimated_servings
    count = parse_count(name) or parse_count(f"{name} {text}")
    # Cross-check count against the product name (e.g. "* 20 tabs" in name wins over
    # page-scraped 120 from a different size variant, or wrong blistered-pack count)
    name_count = extract_count_from_name(name)
    if name_count and count and count != name_count:
        ratio = max(count, name_count) / min(count, name_count)
        if ratio >= 2:
            count = name_count
    elif name_count and not count:
        count = name_count
    # If servings was extracted from page (e.g. "90 дози" from "90-day supply" text)
    # but name clearly states a small count, trust the name count.
    if servings and name_count and servings != name_count and servings > name_count * 2:
        servings = None
        if not count:
            count = name_count
    # Single-dose samples ("1 Доза", "Sample") should have count=1 regardless of what
    # the product page says about the full box (e.g. "60 sachets" in product description)
    if re.search(r"\b1\s*Доза\b|(?<!\w)sample(?!\w)", name, re.I):
        count = 1
        servings = None
    active_text = normalize_text(f"{name} {detail_text or text} {text[:5000]}")
    active, _, confidence = extract_active(category, active_text, weight_grams, servings, count)
    active, confidence = apply_label_overrides(url, category, active, confidence)
    price_units = calculate_price_units(category, price_bgn, active, weight_grams, servings, count)
    label_text = extract_product_label_text(soup, category)
    label_image = extract_product_label_image(soup, url)

    if not price_bgn or not price_units:
        return None
    if any(value <= 0.01 for value in price_units.values()):
        return None

    item = {
        "id": make_id(source.name, name, url),
        "store": source.name,
        "name": name,
        "brand": normalize_text(str(brand)) if brand else None,
        "category": category,
        "url": url,
        "image": image,
        "price_bgn": price_bgn,
        "price_eur": price_eur,
        "currency_source": currency_source,
        "availability_status": availability_status or "unknown",
        "weight_grams": weight_grams,
        "servings": servings,
        "count": count,
        "active": active,
        "label_text": label_text,
        "label_image": label_image,
        "price_per_active_unit": price_units,
        "unit_label": CATEGORY_UNITS[category]["label"],
        "confidence": confidence,
        "scraped_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
    item.update(extract_promo_info(soup, price_bgn, source.name))
    return item


def is_relevant_product(category: str, name: str, url: str) -> bool:
    # Use path-only from URL so domain keywords (e.g. "protein.bg") don't create false positives
    path = urlparse(url).path
    haystack = unquote(f"{name} {path}").lower()
    product_name = unquote(name).lower()
    if "::" in name or any(bad in haystack for bad in ("brow fiber", "microfiber", "cloth", "mascara")):
        return False
    # Global: exclude pharmaceutical formulations (oral solutions, injections, IV infusions)
    if any(bad in haystack for bad in ("за перорален разтвор", "перорален разтвор", "oral solution", "solution for injection", "инфузионен разтвор", "инжекционен разтвор", "инфузия", "ампули за инжектиране")):
        return False
    if category == "fiber" and "fiber" in haystack and not re.search(r"\bpsyllium\b|\bdaily-fiber\b|\bfiber\s+\d|\d\s*g\s+fiber", haystack, re.I):
        return False
    if category == "fiber" and any(bad in haystack for bad in ("defibr", "дефибр", "electrode", "медицин", "medical device", "подложк")):
        return False
    keywords = CATEGORY_KEYWORDS[category]
    if category == "fiber":
        return bool(re.search(r"\b(psyllium|fiber)\b|псилиум|фибри", haystack, re.I))
    if category == "electrolytes":
        if any(bad in haystack for bad in ("battery", "акумулатор", "коса", "shampoo", "маска", "mask", "cream", "крем", "serum", "серум", "eye", "face", "facial", "moistur", "тоник", "toner")):
            return False
        if any(bad in haystack for bad in ("carbonated", "drink box", " drink /", "bcaa", "eaa", "amino", "vitargo", "carbo")):
            return False
        return bool(re.search(r"електролит|electrolytes?|rehydration|натрий.{0,25}калий|sodium.{0,25}potassium", haystack, re.I))
    if category == "collagen":
        if any(bad in haystack for bad in ("collagen cream", "крем", "serum", "серум", "mask", "маска")):
            return False
        return bool(re.search(r"колаген|collagen", haystack, re.I))
    if category == "iron":
        if any(bad in haystack for bad in ("iron gym", "ironmaxx", "barbell", "дъмбел", "уред")):
            return False
        return bool(re.search(r"\biron\b|желязо|ferrous|ferrum", haystack, re.I))
    if category == "magnesium":
        # Exclude magnesium sulfate oral solutions (laxatives, not supplements)
        if re.search(r"магнезиев\s*сулфат|magnesium\s*sulfate|magnesium\s*sulphate", haystack, re.I):
            return False
        return any(keyword in haystack for keyword in CATEGORY_KEYWORDS["magnesium"])
    if category == "vitamin_d":
        return bool(re.search(r"витамин\s*d3?|vitamin[-\s]?d3?|\bd3\b|\b\d{3,5}\s*(?:iu|ме)\b", haystack, re.I))
    if category == "vitamin_c":
        if "vitamin case" in product_name:
            return False
        # Exclude collagen products that mention vitamin C as a secondary ingredient
        if re.search(r"\bcollagen\b|колаген\b", product_name, re.I):
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
        # Exclude body care / cosmetic products that mention protein (silk protein, keratin, etc.)
        if re.search(r"душ.гел|гел.за.тяло|лосион.за.тяло|крем.за.тяло|body.lotion|shower.gel|body.wash|шампоан|shampoo|козметик|масло.за.тяло", haystack, re.I):
            return False
        # Exclude caffeine and standalone stimulant products
        if re.search(r"\bcaffeine\b|\bcafeine\b|кофеин(?!\w)", haystack, re.I) and not re.search(r"whey|протеин|protein|isolate", haystack, re.I):
            return False
        # Exclude maca, herbs, and adaptogens that are not protein supplements
        if re.search(r"\bmaca\b|\bginseng\b|\bashwagandha\b|\btribulus\b|\bfenugreek\b", haystack, re.I) and not re.search(r"whey|isolate|суроват", haystack, re.I):
            return False
        # Exclude sports accessories and equipment
        if re.search(r"ръкохватка|grip.trainer|exercise.equipment|resistance.band|training.band|foam.roller|yoga|нарукавник|бинт|\bwrap\b|\bband\b|\bgloves\b|\bracks?\b|дъмбел|барбел|barbell|dumbbell", haystack, re.I):
            return False
        # Exclude recovery/carbohydrate bars
        if re.search(r"\bcarborad\b|recovery.bar|carbo.bar|maltodextrin.*bar", haystack, re.I):
            return False
        # Exclude mass gainers — high-carb, not comparable to protein supplements
        if re.search(r"гейнър|gainer|gayn|mass.gainer|weight.gainer|масово.покачване|bad.ass.mass|lean.mass|mass.build|true.mass|animal.mass|mass.matrix|hurricane.xs", haystack, re.I):
            return False
        if re.search(r"\bmass\b", haystack, re.I) and re.search(r"\bgain\b|гейн|въглехидрат|carbo|carb\b", haystack, re.I):
            return False
        # Exclude recovery shakes and protein bars not meant as daily protein source
        if re.search(r"recovery.protein.shake|2.1.1.recovery|protein.break.bar", haystack, re.I):
            return False
        # Exclude pre-workouts and pump shots
        if re.search(r"pre.?workout|pump.shot|blood.and.guts|pre.?extreme|ice.pump|shaaboom|animal.fury|\bmypre\b", haystack, re.I):
            return False
        # Exclude BCAA, amino acids, glutamine, arginine, beta-alanine — separate categories
        if re.search(r"\bbcaa\b|branched.chain.amino|amino.acid|amino.9|cryo.beef.amino|myamino|myocell", haystack, re.I):
            return False
        if re.search(r"\bglutamin|l-glutamin|\bglutamine\b|\barginin|\bbeta.alan|beta-alan|animal.iso.whey", haystack, re.I):
            return False
        # Exclude oatmeal products
        if re.search(r"oat.meal.with.protein|инстант.овесени|instant.овесени|овесени.ядки", haystack, re.I):
            return False
        # Exclude medical/clinical nutrition and breastfeeding products
        if re.search(r"кърмене|след.раждане|fresubin|diben.drink|диабетик|диабетиц|pregnaco", haystack, re.I):
            return False
        # Exclude food products: granola, muesli, protein spreads/creams, pancake/waffle mixes, porridge, oatmeal, omelette, breakfast products
        if re.search(r"\bgranola\b|гранола|\bмюсли\b|мюесли|creametto|protein.spread|палачинки|\bpancake\b|\bwaffle\b|\bporridge\b|\boatmeal\b|овесен.*протеин|протеинов.омлет|\bomelette\b|\bbreakfast\b", haystack, re.I):
            return False
        # Exclude RTD (ready-to-drink) protein shakes with volume in mL
        if re.search(r"шейк.{0,20}(?:х|x)\s*\d{3,}\s*мл", haystack, re.I):
            return False
        # Exclude oatmeal and instant oats
        if re.search(r"инстант.овесени|instant.овесени|овесени.ядки", haystack, re.I):
            return False
        # Exclude ready-to-drink food beverages — ASCII and Cyrillic "x/х" before volume
        if re.search(r"(соева|соево|бадемово|оризово|овесено| овесена|almond|oat|soy|rice)\s*(напитка|мляко|drink)", haystack, re.I):
            return False
        if re.search(r"напитка.{0,40}[хx]\s*\d+\s*(литър|мл|л\b|l\b)", haystack, re.I):
            return False
        if re.search(r"напитка.{0,30}(мл|литър|л\b)", haystack, re.I):
            return False
        return bool(re.search(r"\bwhey\b|\bprotein\b|суроват|протеин|isolate|изолат|\bcasein\b|\bказеин\b|egg.white|яйчен.белт", haystack, re.I))
    if category == "l_carnitine":
        if any(bad in haystack for bad in ("acetyl", "ацетил", "cream", "крем", "shampoo")):
            return False
        return bool(re.search(r"карнитин|l-carnitine|\bcarnitine\b", haystack, re.I))
    if category == "melatonin":
        return bool(re.search(r"мелатонин|melatonin", haystack, re.I))
    return any(keyword in haystack for keyword in keywords)


def load_cache(use_cache: bool) -> dict:
    if not use_cache or not CACHE_PATH.exists():
        return {}
    try:
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def save_cache(cache: dict, use_cache: bool) -> None:
    if not use_cache:
        return
    DATA_DIR.mkdir(exist_ok=True)
    tmp_path = CACHE_PATH.with_suffix(".json.tmp")
    tmp_path.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp_path.replace(CACHE_PATH)


def parse_price_update(source: Source, url: str, existing: dict) -> dict | None:
    """Fetch only the current price for an existing product. Skip label/image extraction."""
    html = fetch(url)
    if not html:
        return None
    soup = BeautifulSoup(html, "html.parser")
    price_bgn, price_eur, currency_source, availability_status, offer_name = parse_source_price(source.name, soup)
    if price_bgn is None:
        product_json = find_product_json(load_json_ld(soup))
        text = normalize_text(soup.get_text(" ", strip=True))
        price_bgn, price_eur, currency_source, availability_status, offer_name = parse_price(product_json, text)
    if price_bgn is None or price_bgn < 1:
        return None
    if availability_status == "out_of_stock":
        return None
    active = existing.get("active") or {}
    weight_grams = existing.get("weight_grams")
    servings = existing.get("servings")
    count = existing.get("count")
    category = existing.get("category")
    price_units = calculate_price_units(category, price_bgn, active, weight_grams, servings, count)
    if not price_units:
        return None
    updated = dict(existing)
    updated["price_bgn"] = price_bgn
    updated["price_eur"] = price_eur or round(price_bgn / BGN_TO_EUR, 2)
    updated["currency_source"] = currency_source
    updated["availability_status"] = availability_status or "unknown"
    updated["price_per_active_unit"] = price_units
    updated["scraped_at"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    updated.update(extract_promo_info(soup, price_bgn, source.name))
    return updated


def needs_full_scrape(existing: dict, full_refresh_days: int) -> bool:
    """Return True if the product hasn't had a full scrape within full_refresh_days."""
    last_full = existing.get("last_full_scrape")
    if not last_full:
        return True
    try:
        age = (datetime.now(timezone.utc).date() - datetime.fromisoformat(last_full[:10]).date()).days
        return age >= full_refresh_days
    except (ValueError, TypeError):
        return True


def scrape_one(source: Source, category: str, url: str, cache: dict | None = None, use_cache: bool = False, existing_by_url: dict | None = None, full_refresh_days: int = 30) -> dict | None:
    if use_cache and cache is not None:
        cached = cache.get(url)
        if isinstance(cached, dict) and cached.get("item"):
            item = cached["item"]
            print(f"    = {item['name'][:70]} | cached")
            return item

    if existing_by_url and url in existing_by_url:
        existing = existing_by_url[url]
        if not needs_full_scrape(existing, full_refresh_days):
            item = parse_price_update(source, url, existing)
            if item:
                print(f"    ~ {item['name'][:70]} | price {item['price_bgn']} BGN")
                return item
            # Fall through to full parse if price-only fails

    item = parse_product(source, url, category)
    if item:
        item["last_full_scrape"] = datetime.now(timezone.utc).date().isoformat()
    if use_cache and cache is not None and item:
        cache[url] = {
            "cached_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "source": source.name,
            "category": category,
            "item": item,
        }
    return item


def scrape(
    per_category: int,
    sources: set[str] | None = None,
    categories: set[str] | None = None,
    urls: list[str] | None = None,
    concurrency: int = 1,
    use_cache: bool = False,
    existing_by_url: dict | None = None,
    full_refresh_days: int = 30,
) -> list[dict]:
    products: list[dict] = []
    seen_ids: set[str] = set()
    cache = load_cache(use_cache)
    concurrency = max(1, concurrency)

    if urls:
        def source_for_url(url: str) -> Source:
            decoded = unquote(url).lower()
            if sources:
                return next((s for s in SOURCES if s.name.lower() in sources), SOURCES[0])
            return next((s for s in SOURCES if any(host in decoded for host in s.include_hosts)), SOURCES[0])

        jobs = [(source_for_url(url), detect_category(url) or next(iter(categories or []), None), url) for url in urls]
        jobs = [(src, cat, url) for src, cat, url in jobs if cat]
        print(f"[*] Direct URL mode: {len(jobs)} product URLs")
        with ThreadPoolExecutor(max_workers=concurrency) as executor:
            futures = [executor.submit(scrape_one, src, cat, url, cache, use_cache, existing_by_url, full_refresh_days) for src, cat, url in jobs]
            for future in as_completed(futures):
                item = future.result()
                if not item or item["id"] in seen_ids:
                    continue
                seen_ids.add(item["id"])
                products.append(item)
        save_cache(cache, use_cache)
        return products

    # Phase 1: discover all URLs from all sources (sequential, fast)
    all_jobs: list[tuple[Source, str, str]] = []
    for source in SOURCES:
        if sources and source.name.lower() not in sources:
            continue
        print(f"\n== {source.name} — discovering URLs ==")
        discovered = discover_urls(source, per_category, categories)
        for category, cat_urls in discovered.items():
            print(f"  {category}: {len(cat_urls)} candidates")
            all_jobs.extend((source, category, url) for url in cat_urls)

    existing_count = sum(1 for _, _, url in all_jobs if existing_by_url and url in existing_by_url)
    new_count = len(all_jobs) - existing_count
    print(f"\n[*] Total jobs: {len(all_jobs)} — {existing_count} price-update, {new_count} full-parse — concurrency={concurrency}")

    # Phase 2: scrape all jobs in one flat pool across all sources/categories
    if concurrency <= 1:
        for source, category, url in all_jobs:
            time.sleep(REQUEST_DELAY_SECONDS)
            item = scrape_one(source, category, url, cache, use_cache, existing_by_url, full_refresh_days)
            if item and item["id"] not in seen_ids:
                seen_ids.add(item["id"])
                products.append(item)
                unit_key = next(iter(item["price_per_active_unit"]))
                print(f"  + {item['name'][:70]} | {item['price_per_active_unit'][unit_key]} {unit_key}")
    else:
        with ThreadPoolExecutor(max_workers=concurrency) as executor:
            future_to_job = {}
            for source, category, url in all_jobs:
                f = executor.submit(scrape_one, source, category, url, cache, use_cache, existing_by_url, full_refresh_days)
                future_to_job[f] = (source.name, category)
            done = 0
            for future in as_completed(future_to_job):
                done += 1
                item = future.result()
                if item and item["id"] not in seen_ids:
                    seen_ids.add(item["id"])
                    products.append(item)
                    unit_key = next(iter(item["price_per_active_unit"]))
                    src_name, cat = future_to_job[future]
                    print(f"  [{done}/{len(all_jobs)}] {src_name}/{cat} + {item['name'][:55]} | {item['price_per_active_unit'][unit_key]} {unit_key}")

    save_cache(cache, use_cache)
    return products


def merge_with_existing(products: list[dict], sources: set[str] | None, categories: set[str] | None, replace_scope: bool = False) -> list[dict]:
    if not OUTPUT_PATH.exists():
        return products
    existing = json.loads(OUTPUT_PATH.read_text(encoding="utf-8")).get("supplements", [])
    existing_by_key = {(p.get("store", "").lower(), p.get("category"), p.get("url")): p for p in existing}
    new_keys = {(p["store"].lower(), p["category"], p["url"]) for p in products}

    for product in products:
        key = (product["store"].lower(), product["category"], product["url"])
        previous = existing_by_key.get(key, {})
        product["price_history"] = build_price_history(previous, product)

    def replaced_by_scope(item: dict) -> bool:
        if (item.get("store", "").lower(), item.get("category"), item.get("url")) in new_keys:
            return True
        if not replace_scope:
            return False
        if sources and item.get("store", "").lower() not in sources:
            return False
        if categories and item.get("category") not in categories:
            return False
        return True

    kept = [item for item in existing if not replaced_by_scope(item)]
    return kept + products


def build_price_history(previous: dict, current: dict) -> list[dict]:
    today = datetime.now(timezone.utc).date().isoformat()
    history = list(previous.get("price_history") or [])
    entry = {
        "date": today,
        "price_bgn": current.get("price_bgn"),
        "price_eur": current.get("price_eur"),
        "unit_value": next(iter((current.get("price_per_active_unit") or {}).values()), None),
    }
    if not entry["price_bgn"]:
        return history
    if history and history[-1].get("date") == today:
        history[-1] = entry
    else:
        history.append(entry)
    return history[-12:]


def has_plausible_active_values(product: dict) -> bool:
    active = product.get("active") or {}
    if active.get("creatine_mg_per_serving", 0) > 10000:
        return False
    if active.get("magnesium_mg", 0) > 800:
        return False
    if active.get("zinc_mg", 0) > 100:
        return False
    if active.get("vitamin_d_iu", 0) > 10000:
        return False
    if active.get("protein_g", 0) > 60:
        return False
    if active.get("collagen_g", 0) > 40:
        return False
    if active.get("iron_mg", 0) > 120:
        return False
    if active.get("sodium_mg", 0) > 5000:
        return False
    return True


def write_output(
    products: list[dict],
    merge_existing: bool = False,
    sources: set[str] | None = None,
    categories: set[str] | None = None,
    replace_scope: bool = False,
) -> None:
    DATA_DIR.mkdir(exist_ok=True)
    if merge_existing:
        before = len(products)
        products = merge_with_existing(products, sources, categories, replace_scope)
        print(f"[*] Merged {before} refreshed records with existing dataset -> {len(products)} total")
    before_validation = len(products)
    products = [product for product in products if has_plausible_active_values(product)]
    if len(products) != before_validation:
        print(f"[*] Removed {before_validation - len(products)} records with implausible active-dose values")
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
    parser.add_argument("--per-category", type=int, default=9999, help="Max candidate URLs per category per source (default: unlimited).")
    parser.add_argument("--source", action="append", help="Limit to source name. Can be repeated.")
    parser.add_argument("--category", action="append", choices=sorted(CATEGORY_KEYWORDS), help="Limit to category. Can be repeated.")
    parser.add_argument("--url", action="append", help="Scrape a direct product URL. Can be repeated.")
    parser.add_argument("--concurrency", type=int, default=1, help="Product requests to run in parallel per category.")
    parser.add_argument("--cache", action="store_true", help="Reuse/write data/supplement_scrape_cache.json for faster repeated runs.")
    parser.add_argument("--merge-existing", action="store_true", help="Merge refreshed rows into existing supplements.json instead of replacing all rows.")
    parser.add_argument("--replace-scope", action="store_true", help="With --merge-existing, replace every existing row in the selected source/category scope.")
    parser.add_argument("--full-refresh-days", type=int, default=30, help="With --merge-existing, re-scrape full label/image data for products older than N days (default: 30).")
    args = parser.parse_args()

    selected_sources = {s.lower() for s in args.source} if args.source else None
    selected_categories = set(args.category) if args.category else None

    # Load existing products for price-only update (labels/images fetched once, not every run)
    existing_by_url: dict[str, dict] = {}
    if args.merge_existing and OUTPUT_PATH.exists():
        try:
            existing_data = json.loads(OUTPUT_PATH.read_text(encoding="utf-8"))
            for p in existing_data.get("supplements", []):
                if p.get("url") and p.get("price_per_active_unit"):
                    existing_by_url[p["url"]] = p
            print(f"[*] Loaded {len(existing_by_url)} existing products for price-update mode")
        except Exception as e:
            print(f"[!] Could not load existing products: {e}")

    products = scrape(
        args.per_category,
        selected_sources,
        selected_categories,
        args.url,
        args.concurrency,
        args.cache,
        existing_by_url or None,
        args.full_refresh_days,
    )
    write_output(products, args.merge_existing, selected_sources, selected_categories, args.replace_scope)


if __name__ == "__main__":
    main()
