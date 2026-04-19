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
            # Name
            name_el = card.select_one(".k-product-tile__title")
            if not name_el:
                continue
            name = name_el.get_text(strip=True)
            if not name or len(name) < 2:
                continue

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
        # Decode bytes directly to avoid requests mis-detecting charset
        decoded = resp.content.decode("utf-8", errors="replace")
        soup = BeautifulSoup(decoded, "html.parser")

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
                name, new_price, old_price, discount_pct, None, "Billa", "billa_text"
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


# ─── T-Market scraper (requests-based, no Playwright needed) ─────────────────

TMARKET_URL = "https://tmarketonline.bg/selection/produkti-v-akciya"
TMARKET_CHROME_PROFILE = r"C:\Users\JohnnyBravo\AppData\Local\Temp\pw_chrome_profile"
TMARKET_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept-Language": "bg-BG,bg;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}


def scrape_tmarket_text() -> list[dict]:
    """Scrape T-Market promotions via requests — no Playwright or Chrome profile needed.

    tmarketonline.bg uses CloudCart and serves full HTML server-side.
    """
    items = []
    try:
        resp = requests.get(TMARKET_URL, headers=TMARKET_HEADERS, timeout=20)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.content, "html.parser")

        for card in soup.select("div._product"):
            name_el = card.select_one(
                "h3._product-name-tag a, h3._product-name-tag, ._product-name-tag"
            )
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

            items.append(make_raw_item(
                name, new_price, old_price, discount_pct, image, "T-Market", "tmarket_text"
            ))

        print(f"  [T-Market] {len(items)} raw items from {TMARKET_URL}")
    except Exception as e:
        print(f"  [T-Market] Error: {e}")

    return items


async def scrape_tmarket_dom(browser) -> list[dict]:
    """Legacy Playwright wrapper — forwards to scrape_tmarket_text()."""
    return scrape_tmarket_text()


def setup_tmarket_profile() -> bool:
    """No longer needed — T-Market now scraped via requests."""
    return True
