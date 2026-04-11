"""
Kaufland PDF Brochure Scraper
==============================
Fetches weekly offer PDFs directly from kaufland.bg/broshuri.html (public S3 storage).
No Playwright, no rate limiting — pure requests + local PDF parsing.

Flow:
  1. Fetch kaufland.bg/broshuri.html → extract all PDF URLs + validity dates
  2. Download PDFs to data/pdf_cache/ (cached by filename hash)
  3. Extract text with pdfplumber (text-based PDFs)
  4. If no usable text → fall back to page images + RapidOCR
  5. Parse product name + price pairs from extracted content
  6. Enrich with categories, health scores, diet tags (same as main scraper)
  7. Return list of offers in the standard NutriLife schema

Usage:
  Standalone:  python scraper/kaufland_pdf_scraper.py
  Integration: from scraper.kaufland_pdf_scraper import scrape_kaufland_pdfs
"""

import hashlib
import json
import re
import sys
from io import BytesIO
from pathlib import Path
from datetime import datetime

import requests
from bs4 import BeautifulSoup
from PIL import Image, ImageEnhance, ImageFilter, ImageOps

# ── Paths ────────────────────────────────────────────────────────────────────
ROOT = Path(__file__).parent.parent
DATA_DIR = ROOT / "data"
PDF_CACHE_DIR = DATA_DIR / "pdf_cache"
PDF_OFFERS_PATH = DATA_DIR / "kaufland_pdf_offers.json"

# ── Constants ─────────────────────────────────────────────────────────────────
BROSHURI_URL = "https://www.kaufland.bg/broshuri.html"
STORE_NAME = "Kaufland"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)
HEADERS = {"User-Agent": USER_AGENT, "Accept-Language": "bg-BG,bg;q=0.9"}

PRICE_RE = re.compile(r"(\d+[.,]\d{2})\s*(?:лв\.?|BGN|lv\.?)?", re.IGNORECASE)
DATE_RE = re.compile(r"(\d{2})[.\-](\d{2})[.\-](\d{4})")


# ── PDF URL discovery ─────────────────────────────────────────────────────────

def fetch_pdf_urls() -> list[dict]:
    """Parse kaufland.bg/broshuri.html and return all PDF download URLs with dates."""
    resp = requests.get(BROSHURI_URL, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")
    raw_html = resp.text

    pdfs = []
    seen = set()

    # 1. PDF URLs anywhere in the raw HTML (script tags, JSON blobs, data attrs)
    for url in re.findall(r'https?://[^\s"\'<>]+\.pdf', raw_html):
        if url not in seen:
            seen.add(url)
            valid_from, valid_until = _dates_from_filename(url)
            pdfs.append({
                "url": url,
                "title": Path(url).stem,
                "valid_from": valid_from,
                "valid_until": valid_until,
            })

    # 2. Direct <a href> PDF links (may use relative paths)
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if ".pdf" not in href.lower():
            continue
        full = href if href.startswith("http") else f"https://www.kaufland.bg{href}"
        if full not in seen:
            seen.add(full)
            title = (a.get("title") or a.get_text(strip=True) or Path(href).stem)[:120]
            valid_from, valid_until = _dates_from_filename(href)
            pdfs.append({
                "url": full,
                "title": title,
                "valid_from": valid_from,
                "valid_until": valid_until,
            })

    # 3. data-href attributes
    for el in soup.find_all(attrs={"data-href": True}):
        href = el["data-href"]
        if ".pdf" not in href.lower():
            continue
        full = href if href.startswith("http") else f"https://www.kaufland.bg{href}"
        if full not in seen:
            seen.add(full)
            valid_from, valid_until = _dates_from_filename(href)
            pdfs.append({
                "url": full, "title": Path(href).stem,
                "valid_from": valid_from, "valid_until": valid_until,
            })

    # Filter to active/future brochures only
    today = datetime.now().date()
    active = []
    for p in pdfs:
        if p["valid_until"]:
            try:
                until = datetime.fromisoformat(p["valid_until"]).date()
                if until < today:
                    continue
            except ValueError:
                pass
        active.append(p)

    print(f"[Kaufland PDF] Found {len(active)} active PDF brochures (of {len(pdfs)} total)")
    return active or pdfs  # fallback: return all if none are 'active'


def _dates_from_filename(url: str):
    """Extract valid_from, valid_until from filename like Kaufland-06-04-2026-12-04-2026-08.pdf"""
    name = Path(url).stem  # e.g. "Kaufland-06-04-2026-12-04-2026-08"
    matches = DATE_RE.findall(name)
    valid_from = valid_until = None
    if len(matches) >= 1:
        d, m, y = matches[0]
        try:
            valid_from = f"{y}-{m}-{d}"
        except Exception:
            pass
    if len(matches) >= 2:
        d, m, y = matches[1]
        try:
            valid_until = f"{y}-{m}-{d}"
        except Exception:
            pass
    return valid_from, valid_until


# ── PDF download (cached) ─────────────────────────────────────────────────────

def download_pdf(url: str) -> Path | None:
    """Download PDF to pdf_cache/, return local path. Uses filename as cache key."""
    PDF_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    filename = Path(url).name
    if not filename.lower().endswith(".pdf"):
        filename = hashlib.md5(url.encode()).hexdigest() + ".pdf"
    local = PDF_CACHE_DIR / filename
    if local.exists() and local.stat().st_size > 10_000:
        print(f"  [cache] {filename}")
        return local
    print(f"  [download] {filename} ...")
    try:
        resp = requests.get(url, headers=HEADERS, timeout=120, stream=True)
        resp.raise_for_status()
        with open(local, "wb") as f:
            for chunk in resp.iter_content(chunk_size=65536):
                f.write(chunk)
        size_mb = local.stat().st_size / 1_048_576
        print(f"  [ok] {filename} ({size_mb:.1f} MB)")
        return local
    except Exception as e:
        print(f"  [!] Download failed: {url}: {e}")
        return None


# ── Text extraction ───────────────────────────────────────────────────────────

def extract_text_pdfplumber(pdf_path: Path) -> list[dict]:
    """
    Extract text blocks with positions using pdfplumber.
    Returns list of {text, x0, y0, x1, y1, page} dicts.
    """
    try:
        import pdfplumber
    except ImportError:
        return []

    blocks = []
    try:
        with pdfplumber.open(pdf_path) as pdf:
            total = len(pdf.pages)
            print(f"  [pdfplumber] {total} pages")
            for page_num, page in enumerate(pdf.pages, 1):
                words = page.extract_words(
                    x_tolerance=3, y_tolerance=3,
                    keep_blank_chars=False,
                    use_text_flow=False,
                )
                for w in words:
                    blocks.append({
                        "text": w["text"],
                        "x0": w["x0"], "y0": w["top"],
                        "x1": w["x1"], "y1": w["bottom"],
                        "page": page_num,
                        "cx": (w["x0"] + w["x1"]) / 2,
                        "cy": (w["top"] + w["bottom"]) / 2,
                    })
    except Exception as e:
        print(f"  [!] pdfplumber error: {e}")
    return blocks


def render_pdf_pages_pymupdf(pdf_path: Path, dpi: int = 200) -> list:
    """
    Render PDF pages to PIL Images using pymupdf (no poppler required).
    Returns list of (page_num, PIL.Image) tuples.
    """
    try:
        import fitz  # pymupdf
    except ImportError:
        return []
    pages = []
    try:
        doc = fitz.open(str(pdf_path))
        zoom = dpi / 72  # 72 dpi is PDF default
        mat = fitz.Matrix(zoom, zoom)
        for page_num, page in enumerate(doc, 1):
            pix = page.get_pixmap(matrix=mat, alpha=False)
            img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
            pages.append((page_num, img))
        doc.close()
    except Exception as e:
        print(f"  [!] pymupdf render error: {e}")
    return pages


def extract_text_ocr_fallback(pdf_path: Path) -> list[dict]:
    """
    Render PDF pages to images, run RapidOCR.
    Uses pymupdf for rendering (no poppler needed), falls back to pdf2image.
    Returns same block format as extract_text_pdfplumber().
    """
    from rapidocr_onnxruntime import RapidOCR
    ocr = RapidOCR()
    blocks = []

    # Try pymupdf rendering first (bundled, no extra deps)
    pages = render_pdf_pages_pymupdf(pdf_path)
    if pages:
        print(f"  [pymupdf+OCR] {len(pages)} pages")
    else:
        # Try pdf2image as fallback (needs poppler)
        try:
            from pdf2image import convert_from_path
            raw_pages = convert_from_path(pdf_path, dpi=200)
            pages = list(enumerate(raw_pages, 1))
            print(f"  [pdf2image+OCR] {len(pages)} pages")
        except ImportError:
            pass
        except Exception as e:
            print(f"  [!] pdf2image error: {e}")

    if not pages:
        print("  [!] No PDF rendering method available (install pymupdf or pdf2image+poppler)")
        return blocks

    for page_num, pil_img in pages:
        import numpy as np
        img = pil_img.convert("RGB")
        img = ImageOps.autocontrast(ImageOps.grayscale(img))
        img = ImageEnhance.Contrast(img).enhance(1.8)
        img = img.convert("RGB")
        result, _ = ocr(np.array(img))
        if not result:
            continue
        for item in result:
            pts, text, score = item
            if float(score) < 0.5 or not text.strip():
                continue
            xs = [p[0] for p in pts]
            ys = [p[1] for p in pts]
            x0, y0, x1, y1 = min(xs), min(ys), max(xs), max(ys)
            blocks.append({
                "text": text, "x0": x0, "y0": y0, "x1": x1, "y1": y1,
                "page": page_num, "cx": (x0+x1)/2, "cy": (y0+y1)/2,
            })

    return blocks


# ── Product parsing ───────────────────────────────────────────────────────────

def find_price_blocks(blocks: list[dict]) -> list[dict]:
    """Identify blocks that contain a price (e.g. '3.99 лв')."""
    price_blocks = []
    for b in blocks:
        m = PRICE_RE.search(b["text"])
        if m:
            val_str = m.group(1).replace(",", ".")
            try:
                val = float(val_str)
                if 0.3 <= val <= 500:
                    pb = dict(b)
                    pb["price"] = val
                    price_blocks.append(pb)
            except ValueError:
                pass
    return price_blocks


def find_nearby_text(price_block: dict, all_blocks: list[dict],
                     x_radius=400, y_radius=120) -> list[dict]:
    """Find text blocks spatially near a price block (same page)."""
    px, py, page = price_block["cx"], price_block["cy"], price_block["page"]
    nearby = []
    for b in all_blocks:
        if b is price_block or b.get("page") != page:
            continue
        if PRICE_RE.search(b["text"]):
            continue  # skip other price tokens
        dx = abs(b["cx"] - px)
        dy = abs(b["cy"] - py)
        # Name text is usually ABOVE the price
        if dy > y_radius or dx > x_radius:
            continue
        if b["cy"] > py + 30:   # text significantly below price → skip
            continue
        nearby.append(b)
    # Sort top-to-bottom, left-to-right
    nearby.sort(key=lambda b: (b["cy"], b["cx"]))
    return nearby


NOISE_WORDS = {
    "лв", "bgn", "лева", "цена", "оферта", "промо", "акция", "бр",
    "кг", "г", "мл", "л", "клас", "произход", "българия", "от",
    "до", "при", "за", "в", "с", "и", "на", "%", "kaufland",
    # section/promo headers that appear in PDF pages
    "витрина", "свежата", "месо", "колбаси", "орехите", "кфм",
    "самообслужване", "народен", "revolution", "meat", "novo",
    "ново", "само", "тази", "седмица", "всеки", "ден", "виж",
    "повече", "топ", "xxl", "xxxl", "xxxxxxlll", "top", "ново",
    "оферти", "велики", "ken", "ввееллииккддеенн",
}

# Pattern to strip doubled price strings like "44,,0088€€" or "77,,6699ЛЛВВ.."
_DOUBLED_PRICE_RE = re.compile(
    r'\d{1,3},,\d{2}(?:€€|ЛЛВВ\.\.|\*\*)?'
    r'|€€\*\*|ЛЛВВ\.\.'
    r'|\d{1,3},\d{2}€\*?',
    re.IGNORECASE
)
# Discount percentages and standalone numbers
_DISCOUNT_RE = re.compile(r'-\d+%|\+\d+%|\d+\+\d+|\d{1,3}%')


def _clean_pdf_name(text: str) -> str:
    """Remove price/discount noise from a PDF-extracted product name."""
    text = _DOUBLED_PRICE_RE.sub(" ", text)
    text = _DISCOUNT_RE.sub(" ", text)
    # Remove euro price remnants like "0,33€" or "3,47€**"
    text = re.sub(r'\d+[.,]\d+€\*{0,2}', " ", text)
    # Remove trailing/leading noise punctuation
    text = re.sub(r'\s+', " ", text).strip(" *.,/-")
    return text


def assemble_name(nearby: list[dict]) -> str:
    """Join nearby text blocks into a product name, filtering noise."""
    parts = []
    seen = set()
    for b in nearby[:10]:
        token = b["text"].strip()
        low = token.lower()
        if not token or low in NOISE_WORDS:
            continue
        if re.match(r'^\d+[.,]?\d*[%€]?$', token):  # pure number or price
            continue
        if re.match(r'^-?\d+%$', token):  # discount percent
            continue
        if len(token) < 2:
            continue
        if token in seen:
            continue
        seen.add(token)
        parts.append(token)
    raw = " ".join(parts)
    return _clean_pdf_name(raw)


def parse_products_from_blocks(blocks: list[dict], valid_until: str | None) -> list[dict]:
    """Main parsing: find price blocks, gather nearby text, build product list."""
    price_blocks = find_price_blocks(blocks)
    products = []
    seen_keys = set()

    for pb in price_blocks:
        nearby = find_nearby_text(pb, blocks)
        name = assemble_name(nearby)
        if not name or len(name) < 3:
            continue
        price = pb["price"]
        key = (name.lower()[:40], price)
        if key in seen_keys:
            continue
        seen_keys.add(key)
        products.append({
            "name": name,
            "new_price": price,
            "valid_until": valid_until,
            "page": pb["page"],
        })

    return products


# ── Schema enrichment (mirrors scraper.py logic) ─────────────────────────────
# Import from scraper.py if possible, else inline minimal version

def _enrich_offer(raw: dict) -> dict | None:
    """Add category, health_score, diet_tags etc. by importing from scraper.py."""
    try:
        sys.path.insert(0, str(Path(__file__).parent))
        from scraper import build_offer
        offer = build_offer(
            name=raw["name"],
            new_price=raw["new_price"],
            old_price=None,
            discount_pct=None,
            image_url=None,
            store_name=STORE_NAME,
            valid_until=raw.get("valid_until"),
            address=None,
        )
        if offer:
            offer["source"] = "pdf"
            offer["pdf_page"] = raw.get("page")
        return offer
    except Exception:
        # Minimal fallback if scraper import fails
        return {
            "id": f"pdf-kaufland-{hash(raw['name'] + str(raw['new_price'])) & 0xFFFFFF:06x}",
            "store": STORE_NAME,
            "name": raw["name"],
            "new_price": raw["new_price"],
            "valid_until": raw.get("valid_until"),
            "source": "pdf",
            "pdf_page": raw.get("page"),
        }


# ── Main scrape function ──────────────────────────────────────────────────────

def scrape_kaufland_pdfs() -> list[dict]:
    """
    Full pipeline: discover → download → extract → parse → enrich.
    Returns list of offers in NutriLife schema.
    """
    started = datetime.utcnow()
    print(f"\n{'='*60}")
    print(f"Kaufland PDF Scraper — {started.strftime('%Y-%m-%d %H:%M')} UTC")
    print(f"{'='*60}")

    pdf_infos = fetch_pdf_urls()
    if not pdf_infos:
        print("[!] No PDF URLs found on kaufland.bg/broshuri.html")
        return []

    all_offers = []
    seen_names: set[str] = set()

    for info in pdf_infos:
        url = info["url"]
        valid_until = info.get("valid_until")
        print(f"\n[PDF] {Path(url).name}  (until {valid_until})")

        pdf_path = download_pdf(url)
        if not pdf_path:
            continue

        # Try text extraction
        blocks = extract_text_pdfplumber(pdf_path)
        method = "pdfplumber"

        if len(blocks) < 20:
            print(f"  [*] pdfplumber found {len(blocks)} blocks — trying OCR fallback")
            blocks = extract_text_ocr_fallback(pdf_path)
            method = "ocr"

        print(f"  [*] {len(blocks)} text blocks via {method}")

        raw_products = parse_products_from_blocks(blocks, valid_until)
        print(f"  [*] {len(raw_products)} raw product candidates")

        for raw in raw_products:
            offer = _enrich_offer(raw)
            if not offer:
                continue
            name = offer.get("name", "")
            if name.lower() in seen_names:
                continue
            seen_names.add(name.lower())
            all_offers.append(offer)

        print(f"  [*] {len(all_offers)} unique offers so far")

    elapsed = (datetime.utcnow() - started).total_seconds()
    healthy = [o for o in all_offers if o.get("is_healthy")]
    food = [o for o in all_offers if o.get("is_food")]

    print(f"\n{'='*60}")
    print(f"Kaufland PDF — done in {elapsed:.0f}s")
    print(f"  Total offers: {len(all_offers)}")
    print(f"  Food: {len(food)} | Healthy: {len(healthy)}")
    print(f"{'='*60}")

    # Save to dedicated file
    output = {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "source": "kaufland_pdf",
        "store": STORE_NAME,
        "total_offers": len(all_offers),
        "offers": all_offers,
    }
    PDF_OFFERS_PATH.parent.mkdir(parents=True, exist_ok=True)
    PDF_OFFERS_PATH.write_text(
        json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"  Saved -> {PDF_OFFERS_PATH.name}")

    return all_offers


# ── CLI ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    offers = scrape_kaufland_pdfs()
    if "--list" in sys.argv:
        for o in offers[:30]:
            food_tag = "✓" if o.get("is_healthy") else ("·" if o.get("is_food") else "✗")
            print(f"  {food_tag} {o.get('new_price', '?'):>6.2f} лв  {o.get('name', '')}")
