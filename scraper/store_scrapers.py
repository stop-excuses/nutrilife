"""
NutriLife — Structured Store Scrapers
======================================
Primary (non-OCR) sources for Kaufland, Billa, Lidl, Fantastico, Dar.
Each scraper returns raw items in unified format — NO early filtering.

Unified item format:
{
    "name": str,
    "new_price": float,
    "old_price": float | None,
    "discount_pct": int | None,
    "image": str | None,
    "store": str,
    "source": "kaufland_dom|billa_text|lidl_dom|fantastico_csv|dar_csv"
}

Source priority (for merge deduplication):
  3 = structured DOM/API (this file)
  2 = broshura.bg listing
  1 = OCR
"""

import re
import asyncio
import json
import html
from typing import Optional

import requests
from bs4 import BeautifulSoup

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)

FALLBACK_IMAGE = "https://upload.wikimedia.org/wikipedia/commons/thumb/6/65/No-Image-Placeholder.svg/200px-No-Image-Placeholder.svg.png"

HIGH_PROTEIN_KEYWORDS = [
    "скир", "skyr", "извара", "cottage",
    "яйц", "яйца",
    "пиле", "пилешко",
    "риба", "сьомга", "туна", "тон",
    "кисело мляко", "йогурт", "yogurt",
    "protein", "протеин",
]


def is_high_protein(name: str) -> bool:
    """True if the product name suggests high-protein content."""
    name_lower = name.lower()
    return any(kw in name_lower for kw in HIGH_PROTEIN_KEYWORDS)


_LATIN_TO_CYR = str.maketrans("ABCEHKMOPTXYabceopxy", "АВСЕНКМОРТХУавсеорху")

def fix_mixed_script(name: str) -> str:
    """Fix Latin look-alike characters inside Cyrillic words.

    Some retail sites (e.g. Kaufland) have stray Latin chars in otherwise
    Cyrillic product names (e.g. Latin 'M' in 'Mаслиново').  For each word
    that contains at least one Cyrillic character, replace look-alike Latin
    letters with their Cyrillic equivalents.
    """
    words = name.split()
    result = []
    for word in words:
        has_cyr = any('\u0400' <= c <= '\u04ff' for c in word)
        result.append(word.translate(_LATIN_TO_CYR) if has_cyr else word)
    return " ".join(result)


def clean_price(text: str) -> Optional[float]:
    """Extract float price from text like '3,49', '3.49', '3.49 лв'."""
    if not text:
        return None
    m = re.search(r'(\d+)[.,](\d{2})\b', text)
    if m:
        try:
            return round(float(f"{m.group(1)}.{m.group(2)}"), 2)
        except ValueError:
            return None
    return None


def clean_ocr_name(name: str) -> Optional[str]:
    """Return None if name is OCR garbage, otherwise return cleaned name.

    Garbage criteria:
    - More than 12 words
    - Contains symbols: + = @ # used 2+ consecutive times
    - Letter ratio < 40% (mostly numbers/symbols)
    """
    if not name:
        return None
    name = name.strip()
    if len(name.split()) > 12:
        return None
    if re.search(r'[+=@#]{2,}|\*{3,}', name):
        return None
    letters = sum(1 for c in name if c.isalpha())
    if len(name) > 5 and letters / len(name) < 0.4:
        return None
    return name


def make_raw_item(
    name: str,
    new_price: float,
    old_price: Optional[float] = None,
    discount_pct: Optional[int] = None,
    image: Optional[str] = None,
    store: str = "",
    source: str = "",
    **extra,
) -> dict:
    item = {
        "name": name.strip(),
        "new_price": new_price,
        "old_price": old_price,
        "discount_pct": discount_pct,
        "image": image or FALLBACK_IMAGE,
        "store": store,
        "source": source,
    }
    item.update(extra)
    return item


# ─── Kaufland DOM scraper ─────────────────────────────────────────────────────

KAUFLAND_OFFERS_URL = "https://www.kaufland.bg/aktualni-predlozheniya/oferti.html"


async def scrape_kaufland_dom(browser) -> list[dict]:
    """Scrape kaufland.bg/aktualni-predlozheniya/oferti.html using Playwright DOM.

    Kaufland BG DOM structure (confirmed):
      a.k-product-tile                → card
        .k-product-tile__title        → name
        img.k-product-tile__main-image → image (srcset)
        .k-price-tag__discount        → "-61%" (optional)
        .k-product-tile__pricetags    → contains two .k-price-tag (EUR + BGN)
          second .k-price-tag with "лв":
            .k-price-tag__price                  → new BGN price ("0,65 лв.")
            .k-price-tag__old-price-line-through  → old BGN price ("1,68 лв.")
    """
    items = []
    context = await browser.new_context(
        user_agent=USER_AGENT,
        viewport={"width": 1920, "height": 1080},
        locale="bg-BG",
    )
    page = await context.new_page()
    try:
        await page.goto(KAUFLAND_OFFERS_URL, wait_until="networkidle", timeout=45000)
        # Scroll to trigger lazy-load for all products
        for _ in range(6):
            await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            await asyncio.sleep(1.5)

        html = await page.content()
        soup = BeautifulSoup(html, "html.parser")

        for card in soup.select("a.k-product-tile"):
            # Name — title + subtitle (subtitle has the product type, e.g. "Маслиново масло екстра върджин")
            name_el = card.select_one(".k-product-tile__title")
            if not name_el:
                continue
            name = name_el.get_text(strip=True)
            if not name or len(name) < 2:
                continue
            subtitle_el = card.select_one(".k-product-tile__subtitle")
            if subtitle_el:
                subtitle = subtitle_el.get_text(separator=" ", strip=True)
                if subtitle:
                    name = f"{name} {subtitle}"
            name = fix_mixed_script(name)

            # Pick the BGN pricetag (contains "лв")
            bgn_tag = None
            for pt in card.select(".k-price-tag"):
                price_text = pt.get_text()
                if "лв" in price_text or "lv" in price_text.lower():
                    bgn_tag = pt
                    break
            if bgn_tag is None:
                # Fallback: use the last pricetag
                all_tags = card.select(".k-price-tag")
                bgn_tag = all_tags[-1] if all_tags else None
            if bgn_tag is None:
                continue

            new_price = clean_price(bgn_tag.select_one(".k-price-tag__price").get_text(strip=True) if bgn_tag.select_one(".k-price-tag__price") else "")
            if not new_price:
                continue

            old_price_el = bgn_tag.select_one(".k-price-tag__old-price-line-through, .k-price-tag__old-price")
            old_price = clean_price(old_price_el.get_text(strip=True)) if old_price_el else None

            # Discount (shared across both pricetags)
            discount_pct = None
            disc_el = card.select_one(".k-price-tag__discount")
            if disc_el:
                m = re.search(r"(\d+)\s*%", disc_el.get_text(strip=True))
                if m:
                    discount_pct = int(m.group(1))

            # Image — use srcset highest resolution
            image = None
            img_el = card.select_one("img.k-product-tile__main-image")
            if img_el:
                srcset = img_el.get("srcset", "")
                if srcset:
                    # Last entry in srcset = highest resolution
                    parts = [p.strip().split(" ")[0] for p in srcset.split(",") if p.strip()]
                    image = parts[-1] if parts else None
                if not image:
                    image = img_el.get("src")

            items.append(make_raw_item(
                name, new_price, old_price, discount_pct, image, "Kaufland", "kaufland_dom"
            ))

        print(f"  [Kaufland DOM] {len(items)} raw items from {KAUFLAND_OFFERS_URL}")
    except Exception as e:
        print(f"  [Kaufland DOM] Error: {e}")
    finally:
        await context.close()

    return items


# ─── Billa text scraper (ssbbilla.site) ──────────────────────────────────────

BILLA_URL = "https://ssbbilla.site/catalog/sedmichna-broshura"
BILLA_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept-Language": "bg-BG,bg;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

# Prefixes to strip from .actualProduct names on ssbbilla.site
_BILLA_NAME_PREFIXES = re.compile(
    r"^(?:нов[аo] цена\s*[-–]\s*|само с billa card\s*[-–]\s*|billa ready\s*[-–]\s*|"
    r"само с карта\s*[-–]\s*|billa\s*[-–]\s*)",
    re.IGNORECASE,
)


def _parse_date_iso(s: str):
    """Parse 'DD.MM.YYYY' or 'DD.MM' into ISO date string or None."""
    from datetime import date as _date
    m = re.match(r"(\d{1,2})[.\-](\d{2})(?:[.\-](\d{2,4}))?$", s.strip())
    if not m:
        return None
    day, month, year_str = m.groups()
    year = int(year_str) if year_str else _date.today().year
    if year < 100:
        year += 2000
    try:
        return _date(year, int(month), int(day)).isoformat()
    except ValueError:
        return None


def _extract_billa_dates(soup) -> tuple:
    """Return (valid_from_iso, valid_until_iso) from page text, or (None, None)."""
    text = soup.get_text(" ", strip=True)
    m = re.search(
        r"(\d{1,2}[.\-]\d{2}(?:[.\-]\d{2,4})?)\s*[-–]\s*(\d{1,2}[.\-]\d{2}[.\-]\d{2,4})",
        text,
    )
    if m:
        d1 = _parse_date_iso(m.group(1))
        d2 = _parse_date_iso(m.group(2))
        if d1 and d2:
            return d1, d2
    return None, None


def scrape_billa_text() -> list[dict]:
    """Scrape ssbbilla.site/catalog/sedmichna-broshura — structured Billa Bulgaria offers.

    HTML structure per product (div.product):
      .actualProduct      → product name (may have "Нова цена - " prefix)
      div (22% width)     → old/regular price: two .price spans (EUR, BGN)
      .discount           → "-28%" (optional — only if discounted)
      div (21% width)     → new/discounted price: two .price spans (EUR, BGN)
    When no discount, only the 22% div has prices; the 21% div is absent or empty.
    """
    items = []
    try:
        resp = requests.get(BILLA_URL, headers=BILLA_HEADERS, timeout=30)
        resp.raise_for_status()
        # Try UTF-8 strictly; fall back to cp1251 (common encoding for Bulgarian sites)
        try:
            decoded = resp.content.decode("utf-8")
        except UnicodeDecodeError:
            decoded = resp.content.decode("cp1251", errors="replace")
        soup = BeautifulSoup(decoded, "html.parser")
        valid_from, valid_until = _extract_billa_dates(soup)

        for card in soup.select("div.product"):
            # ── Name ──────────────────────────────────────────────────────────
            name_el = card.select_one(".actualProduct")
            if not name_el:
                continue
            name = name_el.get_text(strip=True)
            name = _BILLA_NAME_PREFIXES.sub("", name).strip()
            if not name or len(name) < 3:
                continue

            # ── Price spans ───────────────────────────────────────────────────
            # Collect all .price spans in document order
            price_spans = card.select("span.price")
            if not price_spans:
                continue

            # Prices come in pairs: (EUR, BGN). We want BGN (index 1 of each pair).
            # If discounted: 4 spans → [old_EUR, old_BGN, new_EUR, new_BGN]
            # If not discounted: 2 spans → [EUR, BGN]
            bgn_prices = [price_spans[i].get_text(strip=True) for i in range(1, len(price_spans), 2)]
            # bgn_prices[0] = old/regular BGN price
            # bgn_prices[1] = new/discounted BGN price (if exists)

            old_price_text = bgn_prices[0] if bgn_prices else ""
            new_price_text = bgn_prices[1] if len(bgn_prices) > 1 else old_price_text

            old_price = _parse_bgn(old_price_text)
            new_price = _parse_bgn(new_price_text)

            if not new_price:
                continue

            # If no discount, old_price == new_price — set old_price to None
            if old_price == new_price:
                old_price = None

            # ── Discount ──────────────────────────────────────────────────────
            discount_pct = None
            disc_el = card.select_one(".discount")
            if disc_el:
                m = re.search(r"(\d+)\s*%", disc_el.get_text(strip=True))
                if m:
                    discount_pct = int(m.group(1))
            if discount_pct is None and old_price and old_price > new_price:
                discount_pct = int(round((1 - new_price / old_price) * 100))

            items.append(make_raw_item(
                name, new_price, old_price, discount_pct, None, "Billa", "billa_text",
                valid_from=valid_from, valid_until=valid_until,
            ))

        print(f"  [Billa text] {len(items)} raw items from {BILLA_URL}")
    except Exception as e:
        print(f"  [Billa text] Error: {e}")

    return items


def _parse_bgn(text: str) -> Optional[float]:
    """Parse a BGN price string like '3.50' or '12,49'."""
    if not text:
        return None
    try:
        return round(float(text.replace(",", ".")), 2)
    except ValueError:
        return None


# ─── Lidl DOM scraper (data-gridbox-impression JSON) ─────────────────────────

LIDL_URL = "https://www.lidl.bg/c/aktsiya/a10091708"
LIDL_CATEGORY_URLS = [
    "https://www.lidl.bg/h/plodove-i-zelenchutsi/h10071012",
    "https://www.lidl.bg/h/osnovni-khrani/h10071045",
    "https://www.lidl.bg/h/mlyako-mlechni-produkti/h10071017",
    "https://www.lidl.bg/h/pryasno-meso/h10071016",
    "https://www.lidl.bg/h/okhladeni-produkti/h10071020",
    "https://www.lidl.bg/h/riba-i-morski-darove/h10071050",
    "https://www.lidl.bg/h/konservirani-khrani/h10071681",
    "https://www.lidl.bg/h/zamrazeni-produkti/h10071049",
    "https://www.lidl.bg/h/napitki/h10071022",
]
LIDL_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept-Language": "bg-BG,bg;q=0.9",
}


def _parse_lidl_grid_data(raw: str, source: str) -> dict | None:
    try:
        data = json.loads(html.unescape(raw))
    except Exception:
        return None

    name = (data.get("title") or data.get("fullTitle") or "").strip()
    if not name:
        return None

    price_info = data.get("price") or {}
    new_price = price_info.get("priceSecond") or price_info.get("price")
    if not new_price:
        return None
    try:
        new_price = round(float(new_price), 2)
    except Exception:
        return None

    old_price = price_info.get("oldPriceSecond") or price_info.get("oldPrice")
    try:
        old_price = round(float(old_price), 2) if old_price else None
    except Exception:
        old_price = None

    discount_pct = None
    discount = price_info.get("discount") or {}
    if isinstance(discount, dict):
        if discount.get("percentageDiscount"):
            discount_pct = int(abs(discount["percentageDiscount"]))
        elif old_price and old_price > new_price:
            discount_pct = int(round((1 - new_price / old_price) * 100))

    image = data.get("image")
    if not image and isinstance(data.get("imageList"), list) and data["imageList"]:
        image = data["imageList"][0]

    source_type = "promo" if old_price or discount_pct else "assortment"
    return make_raw_item(name, new_price, old_price, discount_pct, image, "Lidl", source, source_type=source_type)


def scrape_lidl_catalog() -> list[dict]:
    """Scrape Lidl category pages from embedded data-grid-data JSON."""
    items = []
    try:
        for url in LIDL_CATEGORY_URLS:
            resp = requests.get(url, headers=LIDL_HEADERS, timeout=30)
            resp.raise_for_status()
            soup = BeautifulSoup(resp.text, "html.parser")
            for el in soup.select("[data-grid-data]"):
                raw = el.get("data-grid-data")
                if not raw:
                    continue
                item = _parse_lidl_grid_data(raw, "lidl_catalog")
                if item:
                    items.append(item)

        dedup = {}
        for item in items:
            key = item["name"].lower().strip()
            existing = dedup.get(key)
            if existing is None:
                dedup[key] = item
                continue
            new_has_discount = item.get("old_price") is not None or item.get("discount_pct") is not None
            old_has_discount = existing.get("old_price") is not None or existing.get("discount_pct") is not None
            if new_has_discount and not old_has_discount:
                dedup[key] = item
            elif new_has_discount == old_has_discount and item["new_price"] < existing["new_price"]:
                dedup[key] = item

        result = list(dedup.values())
        print(f"  [Lidl catalog] {len(result)} unique items from category pages")
        return result
    except Exception as e:
        print(f"  [Lidl catalog] Error: {e}")
        return []


async def scrape_lidl_dom(browser) -> list[dict]:
    """Legacy entrypoint kept for compatibility; Lidl catalog now uses embedded grid data."""
    return scrape_lidl_catalog()


def _parse_lidl_gridbox(soup: BeautifulSoup) -> list[dict]:
    """Parse Lidl product cards from data-gridbox-impression URL-encoded JSON."""
    import urllib.parse
    import json as _json
    items = []

    for el in soup.select("[data-gridbox-impression]"):
        raw = el.get("data-gridbox-impression", "")
        if not raw:
            continue
        try:
            decoded = urllib.parse.unquote(raw)
            data = _json.loads(decoded)
        except Exception:
            continue

        name = (data.get("name") or data.get("title") or
                data.get("productName") or data.get("fullTitle") or "").strip()
        if not name:
            continue

        # New price — try several field names
        new_price = None
        for field in ("price", "currentPrice", "promotionalPrice", "discountedPrice"):
            val = data.get(field)
            if val is not None:
                new_price = _parse_bgn(str(val))
                if new_price:
                    break

        if not new_price:
            # Try extracting from nearby price element
            price_el = el.select_one("[class*='price'], .m-price__price")
            if price_el:
                new_price = clean_price(price_el.get_text(strip=True))
        if not new_price:
            continue

        # Old price from JSON or from <s>/<del> tag
        old_price = None
        for field in ("originalPrice", "normalPrice", "regularPrice", "recommendedRetailPrice"):
            val = data.get(field)
            if val is not None:
                old_price = _parse_bgn(str(val))
                if old_price:
                    break
        if not old_price:
            s_el = el.select_one("s, del, [class*='old'], [class*='regular']")
            if s_el:
                # Extract BGN portion — may have "лв" or just a number
                m = re.search(r'(\d+[,.]?\d*)\s*(?:лв|BGN)?', s_el.get_text(strip=True))
                if m:
                    old_price = _parse_bgn(m.group(1))

        # Discount %
        discount_pct = None
        disc = data.get("discount") or data.get("savingsPercentage") or data.get("promotionPercent")
        if isinstance(disc, (int, float)) and disc:
            discount_pct = int(abs(disc))
        if not discount_pct:
            disc_el = el.select_one("[class*='discount'], [class*='badge'], [class*='saving']")
            if disc_el:
                m = re.search(r'(\d+)\s*%', disc_el.get_text(strip=True))
                if m:
                    discount_pct = int(m.group(1))
        if not discount_pct and old_price and old_price > new_price:
            discount_pct = int(round((1 - new_price / old_price) * 100))

        # Image
        image = None
        img_data = data.get("image") or data.get("imageUrl") or data.get("thumbnail")
        if isinstance(img_data, str):
            image = img_data
        elif isinstance(img_data, dict):
            image = img_data.get("url") or img_data.get("src")
        if not image:
            img_el = el.select_one("img")
            if img_el:
                image = img_el.get("src") or img_el.get("data-src")

        items.append(make_raw_item(name, new_price, old_price, discount_pct, image, "Lidl", "lidl_dom"))

    # Deduplicate by name (keep first)
    seen = set()
    unique = []
    for it in items:
        key = it["name"].lower()
        if key not in seen:
            seen.add(key)
            unique.append(it)
    return unique


# ─── Fantastico CSV scraper ───────────────────────────────────────────────────

FANTASTICO_CSV_URL = "https://fantastico.bg/files/kzp/fantastico.csv"
DAR_CSV_URL = "https://www.fantastico.bg/files/kzp/dar.csv"


def _parse_kzp_csv(url: str, store_name: str, source_key: str, promos_only: bool = False) -> list[dict]:
    """Generic parser for Fantastico-group KZP CSV files.

    CSV columns (UTF-8-BOM, comma-delimited):
      0=StoreID, 1=StoreName, 2=ProductName, 3=Code,
      4=Category, 5=RegularPrice, 6=DiscountPrice
    Rows with non-empty col[6] are on discount.
    Deduplicate by product Code — keep discounted version if both exist.
    When promos_only=False, also includes regular-price items as assortment.
    """
    import csv
    import io

    items = []
    try:
        resp = requests.get(
            url,
            headers={"User-Agent": USER_AGENT, "Referer": "https://www.fantastico.bg/promotions"},
            timeout=20,
            stream=True,
        )
        resp.raise_for_status()
        raw = resp.content.decode("utf-8-sig", errors="replace")
        reader = csv.reader(io.StringIO(raw), delimiter=",")

        best_by_code: dict[str, dict] = {}

        for row in reader:
            if len(row) < 7:
                continue
            try:
                float(row[0].strip())
            except ValueError:
                continue  # header row

            name = row[2].strip()
            code = row[3].strip()
            reg_price_raw = row[5].strip()
            disc_price_raw = row[6].strip()

            if not name:
                continue

            is_promo = bool(disc_price_raw)
            if promos_only and not is_promo:
                continue

            try:
                new_price = round(float(disc_price_raw if is_promo else reg_price_raw), 2)
            except ValueError:
                continue
            if new_price <= 0:
                continue

            old_price = None
            discount_pct = None
            if is_promo:
                try:
                    op = round(float(reg_price_raw), 2)
                    if op > new_price:
                        old_price = op
                        discount_pct = int(round((1 - new_price / op) * 100))
                except ValueError:
                    pass

            source_type = "promo" if is_promo else "assortment"
            item = make_raw_item(
                name, new_price, old_price, discount_pct, None, store_name, source_key,
                source_type=source_type,
            )

            if code:
                existing = best_by_code.get(code)
                # Prefer discounted version; break ties by lower price
                if existing is None:
                    best_by_code[code] = item
                elif is_promo and not existing.get("old_price"):
                    best_by_code[code] = item
                elif not is_promo and not existing.get("old_price") and new_price < existing["new_price"]:
                    best_by_code[code] = item
            else:
                items.append(item)

        items.extend(best_by_code.values())
        promo_count = sum(1 for it in items if it.get("old_price"))
        print(f"  [{store_name} CSV] {len(items)} unique items ({promo_count} on promo)")

    except Exception as e:
        print(f"  [{store_name} CSV] Error: {e}")

    return items


def scrape_fantastico_csv() -> list[dict]:
    """Download Fantastico's KZP CSV — all products (promos + assortment)."""
    return _parse_kzp_csv(FANTASTICO_CSV_URL, "Fantastico", "fantastico_csv", promos_only=False)


def scrape_dar_csv() -> list[dict]:
    """Download Dar (ДАР) KZP CSV — all products (same group as Fantastico)."""
    return _parse_kzp_csv(DAR_CSV_URL, "Dar", "dar_csv", promos_only=False)


# ─── T-Market scraper (requests-based, full catalog via category pages) ───────

TMARKET_BASE = "https://tmarketonline.bg"
TMARKET_URL = f"{TMARKET_BASE}/selection/produkti-v-akciya"
TMARKET_CHROME_PROFILE = r"C:\Users\JohnnyBravo\AppData\Local\Temp\pw_chrome_profile"
TMARKET_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept-Language": "bg-BG,bg;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

# Major food/beverage/health categories — parent-level, covers all sub-categories.
# We scrape these and deduplicate; avoids scraping every leaf category separately.
TMARKET_CATALOG_SLUGS = [
    "plodove-zelenchuci-i-yadki",   # fruit, veg, nuts, olives
    "mlechni-produkti-i-yayca",     # dairy, eggs
    "meso",                          # all meat
    "riba-i-morski-darove",         # fish & seafood
    "kolbasi-i-shunki",             # deli meats
    "hlebni-i-testeni-izdeliya",    # bread & bakery
    "paketirani-hrani",             # grains, legumes, pasta, canned, oils, condiments, honey
    "zamrazeni-hrani",              # frozen foods
    "gotovi-yastiya",               # ready meals
    "bio-fitnes-i-specialni-hrani", # bio, sport, health foods
    "napitki",                      # all drinks (water, juices, beer, wine, spirits)
    "kafe-chay-i-zaharni-izdeliya", # coffee, tea, sweets
]


def _parse_tmarket_cards(soup: BeautifulSoup, source: str) -> list[dict]:
    items = []
    for card in soup.select("div._product"):
        name_el = card.select_one("h3._product-name-tag a, h3._product-name-tag, ._product-name-tag")
        if not name_el:
            continue
        name = name_el.get_text(strip=True)
        if not name:
            continue

        new_price = None
        for span in card.select("span.bgn2eur-secondary-currency"):
            if not span.find_parent("del"):
                new_price = clean_price(span.get_text(strip=True))
                if new_price:
                    break
        if not new_price:
            price_el = card.select_one("._product-price span, [class*='price-new']")
            if price_el:
                new_price = clean_price(price_el.get_text(strip=True))
        if not new_price:
            continue

        old_price = None
        old_el = card.select_one(
            "del._product-price-old span.bgn2eur-secondary-currency, "
            "del span.bgn2eur-secondary-currency"
        )
        if old_el:
            old_price = clean_price(old_el.get_text(strip=True))

        discount_pct = None
        disc_el = card.select_one("span._product-details-discount")
        if disc_el:
            m = re.search(r"(\d+)", disc_el.get_text(strip=True))
            if m:
                discount_pct = int(m.group(1))
        if not discount_pct and old_price and old_price > new_price:
            discount_pct = int(round((1 - new_price / old_price) * 100))

        image = None
        img_el = card.select_one("img")
        if img_el:
            image = img_el.get("data-first-src") or img_el.get("data-src") or img_el.get("src")

        source_type = "promo" if (old_price or discount_pct) else "assortment"
        items.append(make_raw_item(
            name, new_price, old_price, discount_pct, image, "T-Market", source,
            source_type=source_type,
        ))
    return items


def _get_tmarket_max_page(soup: BeautifulSoup) -> int:
    max_p = 1
    for a in soup.select("[class*='pagination'] a, ._pagination a"):
        href = a.get("href", "")
        m = re.search(r"page=(\d+)", href)
        if m:
            max_p = max(max_p, int(m.group(1)))
    return max_p


def _scrape_tmarket_category(slug: str) -> list[dict]:
    url_base = f"{TMARKET_BASE}/category/{slug}"
    items = []
    try:
        resp = requests.get(f"{url_base}?page=1", headers=TMARKET_HEADERS, timeout=20)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.content, "html.parser")
        items.extend(_parse_tmarket_cards(soup, "tmarket_catalog"))
        max_page = _get_tmarket_max_page(soup)
        for page in range(2, max_page + 1):
            r2 = requests.get(f"{url_base}?page={page}", headers=TMARKET_HEADERS, timeout=20)
            r2.raise_for_status()
            s2 = BeautifulSoup(r2.content, "html.parser")
            batch = _parse_tmarket_cards(s2, "tmarket_catalog")
            if not batch:
                break
            items.extend(batch)
    except Exception as e:
        print(f"  [T-Market catalog/{slug}] Error: {e}")
    return items


def scrape_tmarket_catalog() -> list[dict]:
    """Scrape T-Market full catalog via all major category pages with pagination.

    Uses ThreadPoolExecutor for parallel category fetching.
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed
    all_items = []
    print(f"  [T-Market catalog] Scraping {len(TMARKET_CATALOG_SLUGS)} categories...")
    with ThreadPoolExecutor(max_workers=4) as ex:
        futures = {ex.submit(_scrape_tmarket_category, slug): slug for slug in TMARKET_CATALOG_SLUGS}
        for future in as_completed(futures):
            slug = futures[future]
            batch = future.result()
            print(f"    /{slug}: {len(batch)} items")
            all_items.extend(batch)

    # Deduplicate: prefer promo version if both exist for same name
    seen: dict[str, dict] = {}
    for item in all_items:
        key = item["name"].lower().strip()
        existing = seen.get(key)
        if existing is None:
            seen[key] = item
        elif item.get("old_price") and not existing.get("old_price"):
            seen[key] = item
    result = list(seen.values())
    promo_count = sum(1 for it in result if it.get("old_price"))
    print(f"  [T-Market catalog] {len(result)} unique products ({promo_count} on promo)")
    return result


def scrape_tmarket_text() -> list[dict]:
    """Scrape T-Market — full catalog (category pages) + promo page merged."""
    catalog = scrape_tmarket_catalog()
    # Also grab promo page to catch any promos not in the category scrape
    promo_items = []
    try:
        resp = requests.get(TMARKET_URL, headers=TMARKET_HEADERS, timeout=20)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.content, "html.parser")
        promo_items = _parse_tmarket_cards(soup, "tmarket_text")
    except Exception as e:
        print(f"  [T-Market promo] Error: {e}")

    # Merge: catalog is primary; add promos not already in catalog
    seen = {item["name"].lower().strip(): item for item in catalog}
    for item in promo_items:
        key = item["name"].lower().strip()
        if key not in seen:
            seen[key] = item
        elif item.get("old_price") and not seen[key].get("old_price"):
            seen[key] = item

    result = list(seen.values())
    print(f"  [T-Market] {len(result)} total unique products")
    return result


async def scrape_tmarket_dom(browser) -> list[dict]:
    """Legacy Playwright wrapper — forwards to scrape_tmarket_text()."""
    return scrape_tmarket_text()


def setup_tmarket_profile() -> bool:
    """No longer needed — T-Market now scraped via requests."""
    return True
