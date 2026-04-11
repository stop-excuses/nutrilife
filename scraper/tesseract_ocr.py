"""
Tesseract-based OCR backend for brochure pages.
Drop-in replacement for brochure_ocr_poc.py - same output format.

Tesseract supports Bulgarian natively (bul.traineddata).
Requires:
  - Tesseract installed at C:/Program Files/Tesseract-OCR/tesseract.exe
  - bul.traineddata in TESSDATA_PREFIX folder (~\\tessdata\\bul.traineddata)
  - pip install pytesseract pillow
"""

import argparse
import json
import os
import re
import sys
import time
from collections import defaultdict
from pathlib import Path

import pytesseract
import requests
from PIL import Image, ImageEnhance, ImageFilter, ImageOps
from bs4 import BeautifulSoup
import html

# --- Config ---
pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
TESSDATA_PREFIX = str(Path.home() / "tessdata")
os.environ.setdefault("TESSDATA_PREFIX", TESSDATA_PREFIX)

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/126.0.0.0 Safari/537.36"
)

# Price pattern: 1-3 digits, comma or dot, exactly 2 decimals
# Excludes dates (30.03), weights (500g), large numbers
PRICE_RE = re.compile(r"(?<!\d)(\d{1,3}[.,]\d{2})(?!\d)")

# Minimum confidence for a Tesseract word to be used (0-100)
MIN_CONF = 30

# --- Minimal normalization (Tesseract reads Bulgarian correctly — fewer fixes needed) ---
TESSERACT_FIXES = [
    # Common Tesseract Bulgarian confusions
    (r"\bgo\b", "до"),
    (r"\bGo\b", "До"),
    (r"\bga\b", "да"),
    (r"\b3a\b", "за"),
    (r"\bca\b", "са"),
    (r"\bce\b", "се"),
    (r"\bha\b", "на"),
    (r"\bHa\b", "На"),
    (r"\bom\b", "от"),
    (r"\bOm\b", "От"),
    (r"\bпpou3xog\b", "произход"),
    (r"\bпponзxog\b", "произход"),
    # Д → А confusion
    (r"\b[Aa]omamu\b", "Домати"),
    (r"\b[Dd]omati\b", "Домати"),
    # opakoBka variants
    (r"\b[oo]nako[Bb]ka\b", "опаковка"),
    (r"\bopako[Bb]ka\b", "опаковка"),
    # Mixed script: Latin look-alikes in Cyrillic words
    (r"\bHemck[oa]\b", "Немско"),
    (r"\bkpa[б6b]e\b", "краве"),
    (r"\bkocm\b", "кост"),
    (r"\bkocт\b", "кост"),
    (r"\bчepб[ао]\b", "черва"),
    (r"\bчерб[ао]\b", "черва"),
    # Noise prefixes from layout (codes, symbols)
    (r"^\s*\d{3,5}\s+", ""),
    (r"^\s*[a-z]{1,3}\.\s+", ""),
    (r"^\s*[-–—]+\s*", ""),
    # Doubled capitals from Tesseract (КК → К, etc.)
    (r"([А-Я])\1", r"\1"),
    (r"оп[аА][Кк]+овка", "опаковка"),
    (r"опа[Кк]+овка", "опаковка"),
    # Mixed script — page 6 style (свинско/бекон/кашкавал layout)
    (r"\bmeaewko\b", "пилешко"),
    (r"\b6ekon\b", "бекон"),
    (r"\bkawkaBan\b", "кашкавал"),
    (r"\bkoyka\b", "кълка"),
    (r"\bOnako8anu\b", "опаковани"),
    (r"\b8\s+защитна\b", "в защитна"),
    # Old price noise — задраскани цени от типа "2:29-АВ-"
    (r"\d+:\d+[-–]\s*[АAа][Вв]-?", ""),
    (r"\b[АAа][Вв]-\b", ""),
    # Brand noise
    (r"\bAkuua\b", ""),
    (r"\bauua\b", ""),
    (r"\bOVOTEK\b", ""),
    (r"\bMasiko\b", ""),
    (r"\bAGIPA\b", ""),
    (r"\bPome\b", ""),
    (r"\bFels\b", ""),
    (r"\bAMADORI\b", ""),
    (r"\bPlus\b", ""),
    # Weight/unit cleanup
    (r"(\d)\s*(лв|лb|ЛВ|ЛB)\b", r"\1 лв"),
    (r"\b(\d+)\s*[gG]/[бб][рp]\b", r"\1 г/бр"),
    (r"\b(\d+)\s*[gG]/опаковка\b", r"\1 г/оп"),
    # "по-евтино" е промо текст, не продукт
    (r"\bпо-евтино\b", ""),
    (r"\bСа:\b", ""),
    (r"\bEe\.?\b", ""),
]

# Standalone noise tokens to strip from final name
STRIP_TOKENS_RE = re.compile(
    r"\b(\d{3,6}|[a-zA-Z]{1,3}\.|cu|iy|oe|PE|om|[A-Z]{2,3})\b"
)

# Lines that are pure noise — discard completely
NOISE_WORDS = re.compile(
    r"(произход|валидн|търговск|артикул|изчерпан|Цена\s+за|Цена\s+3a|lv\.|евро|"
    r"Lidl\s+Plus|lidl\.bg|касов|бон|сканирай|изтегли|"
    r"обект|период|кампания|регистрирай|покупка|купон|изненад|"
    r"ГАРАНЦИЯ|световен|лидер|SGS|КОНТРОЛА|Качество\s+от|"
    r"по-евтино|заслужава|предложения|изненадващо|изгодни|"
    r"^\s*[-–%+×x]\s*\d+\s*%)",
    re.IGNORECASE,
)

# ЛВ price lines that also contain € are per-kg/per-unit lines — not retail price anchors
PER_UNIT_RE = re.compile(r"€.*[лЛ][вВ]|€.*[AА][BВ]|\d+[.,]\d{2}\s*€\s*/", re.IGNORECASE)

# Food whitelist — at least one of these must appear in a name to be kept
FOOD_KEYWORDS = re.compile(
    r"(картоф|домат|краставиц|морков|чушк|спанак|салат|лук|чесън|тиквич|патладжан|"
    r"ябълк|портокал|лимон|банан|ягод|грозд|праскова|кайсия|череш|вишн|киви|манго|"
    r"авокадо|нар|боровинк|малин|пъпеш|диня|"
    r"пиле|пилешк|говежд|свинск|агнешк|риба|сьомга|скумри|треска|хайвер|"
    r"яйц|мляко|сирен|кашкавал|масло|кефир|айран|йогурт|извара|скир|"
    r"леща|нахут|боб|фасул|соя|"
    r"ориз|овес|елда|киноа|паста|фузили|макарон|хляб|ръжен|"
    r"орех|бадем|лешник|кашу|фъстък|тахан|хумус|зехтин|зехти|"
    r"риган|магданоз|кориандър|куркума|джинджифил|"
    r"баниц|козунак|"
    r"кон|тон|сардин)",
    re.IGNORECASE,
)


# ---------- Reused from brochure_ocr_poc.py (no changes needed) ----------

def load_brochure_data(brochure_url):
    import hashlib
    cache_dir = Path(__file__).parent.parent / "data" / "brochure_cache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    url_hash = hashlib.md5(brochure_url.encode()).hexdigest()
    cache_path = cache_dir / f"{url_hash}.json"
    if cache_path.exists():
        with open(cache_path, "r", encoding="utf-8") as f:
            return json.load(f)
    response = requests.get(brochure_url, headers={"User-Agent": USER_AGENT}, timeout=30)
    response.raise_for_status()
    soup = BeautifulSoup(response.text, "html.parser")
    brochure_tag = soup.find(attrs={"data-brochure": True})
    if brochure_tag is None:
        raise RuntimeError("Could not find data-brochure payload on brochure page.")
    data = json.loads(html.unescape(brochure_tag["data-brochure"]))
    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    return data


def get_page_image_url(page_data):
    image = page_data["image"]
    return f"https://media.marktjagd.com/{image['id']}_{image['width']}x{image['height']}.webp"


def download_image(url, filename):
    cache_dir = Path(__file__).parent.parent / "data" / "image_cache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    local_path = cache_dir / filename
    if local_path.exists():
        with open(local_path, "rb") as f:
            return f.read()
    response = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=30)
    response.raise_for_status()
    with open(local_path, "wb") as f:
        f.write(response.content)
    return response.content


# ---------- Tesseract-specific logic ----------

def prepare_image_for_tesseract(image_bytes, scale=2):
    """Preprocess image for Tesseract — grayscale, contrast, sharpness."""
    from io import BytesIO
    image = Image.open(BytesIO(image_bytes)).convert("RGB")
    if scale > 1:
        image = image.resize(
            (image.width * scale, image.height * scale),
            Image.Resampling.LANCZOS,
        )
    gray = ImageOps.grayscale(image)
    gray = ImageOps.autocontrast(gray)
    gray = ImageEnhance.Contrast(gray).enhance(1.8)
    gray = ImageEnhance.Sharpness(gray).enhance(1.4)
    return gray


def apply_fixes(text):
    """Apply minimal post-OCR fixes for known Tesseract/Bulgarian confusions."""
    for pattern, replacement in TESSERACT_FIXES:
        text = re.sub(pattern, replacement, text)
    return text


def extract_price(text):
    """Return first valid price (0.30–999.99) found in text, or None."""
    for m in PRICE_RE.finditer(text.replace(" ", "")):
        try:
            value = float(m.group(1).replace(",", "."))
        except ValueError:
            continue
        if 0.30 <= value <= 999.99:
            return value
    return None


def is_lv_price_line(text):
    """True if this line contains a ЛВ/лв price — the retail Bulgarian price.
    Tesseract often misreads ЛВ as AB (Latin look-alikes: Л→A, В→B).
    """
    return bool(re.search(r"[лЛ][вВ]|\b[AА][BВ][.\-]?\b", text))


def get_lines_from_image(gray_image):
    """
    Run Tesseract on a grayscale PIL image.
    Returns list of line dicts: {text, conf, x, y, w, h, cy, cx}
    sorted by vertical position.
    """
    data = pytesseract.image_to_data(
        gray_image,
        lang="bul+eng",
        config="--oem 1 --psm 11",
        output_type=pytesseract.Output.DICT,
    )

    # Group words into lines
    line_words = defaultdict(list)
    for i, word in enumerate(data["text"]):
        if not word.strip():
            continue
        conf = int(data["conf"][i])
        if conf < MIN_CONF:
            continue
        key = (data["block_num"][i], data["par_num"][i], data["line_num"][i])
        line_words[key].append({
            "word": word,
            "conf": conf,
            "x": data["left"][i],
            "y": data["top"][i],
            "w": data["width"][i],
            "h": data["height"][i],
        })

    lines = []
    for words in line_words.values():
        if not words:
            continue
        text = apply_fixes(" ".join(w["word"] for w in words))
        xs = [w["x"] for w in words]
        ys = [w["y"] for w in words]
        ws = [w["w"] for w in words]
        hs = [w["h"] for w in words]
        x = min(xs)
        y = min(ys)
        w = max(x2 + w2 for x2, w2 in zip(xs, ws)) - x
        h = max(y2 + h2 for y2, h2 in zip(ys, hs)) - y
        avg_conf = sum(ww["conf"] for ww in words) / len(words)
        lines.append({
            "text": text,
            "conf": avg_conf,
            "x": x,
            "y": y,
            "w": w,
            "h": h,
            "cy": y + h / 2,
            "cx": x + w / 2,
        })

    lines.sort(key=lambda l: l["cy"])
    return lines, gray_image.width


def clean_name(name):
    """Strip noise tokens and normalize whitespace from a candidate name."""
    # Apply TESSERACT_FIXES on the assembled name
    for pattern, replacement in TESSERACT_FIXES:
        name = re.sub(pattern, replacement, name)
    # Fix mixed case doubled Cyrillic: кК → к, еЕ → е (Tesseract reads same glyph twice)
    name = re.sub(r"([а-я])([А-Я])", lambda m: m.group(1) if m.group(1).upper() == m.group(2) else m.group(0), name)
    # Remove leftover price-like fragments
    name = re.sub(r"\b\d{1,3}[.,]\d{2}\b", "", name)
    # Remove discount markers
    name = re.sub(r"-\d+%|\d+%", "", name)
    # Remove standalone noise tokens (codes, short Latin junk, symbols)
    name = re.sub(r'\b[A-Z]{2,6}\d*[®©™]?\b', " ", name)
    name = STRIP_TOKENS_RE.sub(" ", name)
    # Remove fragments with special chars (UI decoration)
    name = re.sub(r'[#&|®©™°\[\]{}()<>\'\"]+', " ", name)
    # Remove pure Latin word fragments (not brands — those were already preserved by fixes)
    name = re.sub(r'\b[a-zA-Z]{1,3}\b', " ", name)
    # Remove stray digits
    name = re.sub(r'\b\d+\b', " ", name)
    # Remove leading noise words that are not food
    name = re.sub(r'^\s*(предложения|изненадващо|изгодни|акция|еre|ere)\s*\.?\s*', "", name, flags=re.IGNORECASE)
    # Remove trailing weight/unit/packaging suffixes (common OCR leftovers)
    name = re.sub(r'\s*/\s*6[рp]\.?\s*$', "", name)          # /6p. /6р.
    name = re.sub(r'\s*[дд]/опак+овка\s*$', "", name)         # д/опаковка
    name = re.sub(r'\s*/опак+овка\s*$', "", name)              # /опаковка
    name = re.sub(r'\s*\d+\s*[gG]/опак+овка\s*$', "", name)   # 500g/опаковка
    name = re.sub(r'\s*onako[Bb][Bb]?ka\s*$', "", name, flags=re.IGNORECASE)  # onakoBka
    name = re.sub(r'\s*г/оп\.?\s*$', "", name)                 # г/оп
    name = re.sub(r'\s*6[рp]\./опак+овка\s*$', "", name)       # 6p./опаковка
    # Collapse whitespace
    name = re.sub(r"\s{2,}", " ", name).strip(" -.,/:")
    return name


def extract_weight_grams(text):
    """Extract weight in grams from OCR text fragments near the product."""
    text = text.lower()
    m = re.search(r"(\d+[.,]?\d*)\s*кг\b", text)
    if m:
        return int(float(m.group(1).replace(",", ".")) * 1000)
    m = re.search(r"(\d+)\s*[gG]\b", text)
    if m:
        return int(m.group(1))
    m = re.search(r"(\d+)\s*г\b", text)
    if m:
        return int(m.group(1))
    return None


def calc_price_per_kg(price_lv, weight_grams):
    """Return price per kg rounded to 2 decimals, or None."""
    if weight_grams and weight_grams > 0:
        return round(price_lv / weight_grams * 1000, 2)
    return None


def name_key(name):
    """Normalize name to a dedup key — remove weights, origins, extra words."""
    key = name.lower()
    # Remove weight/size/origin suffixes
    key = re.sub(r"\b\d+\s*(г|кг|г/оп|г/бр|ml|л)\b", "", key)
    key = re.sub(r"\b(египет|турция|гърция|българия|испания|израел|нидерландия)\b", "", key)
    key = re.sub(r"\b(прясно|пресни|пресен|замразени|замразен|опаковани)\b", "", key)
    key = re.sub(r"\b(бр|оп|опаковка|g|kg)\b", "", key)
    key = re.sub(r"\s+", " ", key).strip()
    # Keep only first 3 meaningful words
    words = [w for w in key.split() if len(w) > 2]
    return " ".join(words[:3])


def extract_product_candidates(lines, image_width=None):
    """
    For each ЛВ price line (retail Bulgarian price), find the product name above it.

    Visual layout (observed from brochure images):
    - ЛВ price = anchor (largest text, bottom of product card)
    - € price = just above ЛВ, same position — NOT a name, exclude it
    - Product name = 1-4 lines ABOVE the price, same horizontal column
    - Columns are ~30% of page width — use narrow horizontal radius
    - Weight info (500g, 20бр) sits between name and price — filter it
    """
    lv_price_lines = []
    eur_price_lines = []
    text_lines = []

    for line in lines:
        price = extract_price(line["text"])
        if price is not None:
            line["price"] = price
            if is_lv_price_line(line["text"]) and not PER_UNIT_RE.search(line["text"]):
                lv_price_lines.append(line)
            else:
                eur_price_lines.append(line)
        else:
            text_lines.append(line)

    # Narrow column radius: ~28% of image width at 2x scale
    col_radius = (image_width * 0.40) if image_width else 700

    # Y positions of € price lines — exclude from name search
    eur_ys = {round(l["cy"]) for l in eur_price_lines}

    WEIGHT_ONLY = re.compile(
        r"^\s*[\d.,]+\s*(г|кг|g|kg|мл|л|бр\.?|ml|бр)\s*$", re.IGNORECASE
    )

    candidates = []
    for pl in lv_price_lines:
        v_search = max(350, pl["h"] * 8)

        name_lines = []
        for tl in text_lines:
            # Must be ABOVE the price
            if tl["cy"] >= pl["cy"] + pl["h"] * 1.2:
                continue
            # Within column
            if abs(tl["cx"] - pl["cx"]) > col_radius:
                continue
            # Within vertical range
            if pl["cy"] - tl["cy"] > v_search:
                continue
            # Skip € price line (same Y as a € price)
            if round(tl["cy"]) in eur_ys:
                continue
            # Skip pure noise lines
            if NOISE_WORDS.search(tl["text"]):
                continue
            # Skip pure weight lines
            if WEIGHT_ONLY.match(tl["text"]):
                continue
            if len(tl["text"].strip()) < 3:
                continue
            name_lines.append(tl)

        if not name_lines:
            continue

        # Sort top-to-bottom and take up to 4 lines
        name_lines.sort(key=lambda l: l["cy"])
        raw_name = " ".join(l["text"].strip() for l in name_lines[:4])
        name = clean_name(raw_name)

        if len(name) < 4:
            continue
        if not FOOD_KEYWORDS.search(name):
            continue

        # Try to extract weight from nearby lines for price_per_kg
        weight_grams = None
        for l in name_lines:
            w = extract_weight_grams(l["text"])
            if w and 50 <= w <= 10000:
                weight_grams = w
                break
        if weight_grams is None:
            weight_grams = extract_weight_grams(raw_name)

        price_per_kg = calc_price_per_kg(pl["price"], weight_grams)

        candidates.append({
            "price": pl["price"],
            "price_text": pl["text"],
            "name": name,
            "raw_name": raw_name,
            "weight_grams": weight_grams,
            "price_per_kg": price_per_kg,
            "score": round(pl["conf"] / 100, 2),
            "position": (round(pl["cx"]), round(pl["cy"])),
        })

    # Deduplicate by product identity — keep lowest price per unique product
    groups = {}
    for c in candidates:
        nk = name_key(c["name"])
        if not nk or len(nk) < 4:
            continue
        if nk not in groups or c["price"] < groups[nk]["price"]:
            groups[nk] = c

    return list(groups.values())


# ---------- Main entry point (same signature as brochure_ocr_poc.py) ----------

def run_ocr_on_pages(brochure_url, pages, scale=2, min_score=0.55, store_name="Unknown"):
    """
    Run Tesseract OCR on specified pages of a brochure.
    Returns dict matching brochure_ocr_poc.py output format.
    """
    brochure_data = load_brochure_data(brochure_url)
    brochure_pages = brochure_data["pageResult"]["pages"]
    total_pages = brochure_data["pageResult"]["total"]

    print(f"Title: {brochure_data['title']}", flush=True)
    print(
        f"Store: {brochure_data['store']['address']['city']} | "
        f"brochure pages={total_pages}",
        flush=True,
    )
    print(
        f"Tesseract OCR: {len(pages)} pages to process (scale={scale})",
        flush=True,
    )

    extracted_pages = []
    total_candidates = 0
    run_t0 = time.perf_counter()

    for idx, page_number in enumerate(pages, 1):
        if page_number < 1 or page_number > len(brochure_pages):
            print(f"  [OCR] page {page_number}: out of range — skip", flush=True)
            continue

        page_data = brochure_pages[page_number - 1]
        image_url = get_page_image_url(page_data)
        image_filename = f"{page_data['image']['id']}.webp"

        t0 = time.perf_counter()
        try:
            image_bytes = download_image(image_url, image_filename)
            gray = prepare_image_for_tesseract(image_bytes, scale=scale)
            lines, img_width = get_lines_from_image(gray)
            candidates = extract_product_candidates(lines, image_width=img_width)
        except Exception as e:
            print(f"  [OCR] page {page_number} ERROR: {e}", flush=True)
            continue

        elapsed = time.perf_counter() - t0
        total_candidates += len(candidates)
        run_elapsed = time.perf_counter() - run_t0

        print(
            f"  [OCR] page {page_number} ({idx}/{len(pages)}) | "
            f"{len(lines)} lines | {len(candidates)} candidates | "
            f"{elapsed:.1f}s | total: {total_candidates} | run: {run_elapsed:.0f}s",
            flush=True,
        )
        for c in candidates[:6]:
            print(f"    {c['price']:.2f} лв | {c['name'][:55]} [{c['score']:.2f}]", flush=True)

        extracted_pages.append({
            "page": page_number,
            "image_url": image_url,
            "product_candidates": candidates,
        })

    run_elapsed = time.perf_counter() - run_t0
    print(
        f"  [OCR] done — {len(extracted_pages)} pages | "
        f"{total_candidates} total candidates | {run_elapsed:.0f}s",
        flush=True,
    )

    return {
        "brochure_url": brochure_url,
        "title": brochure_data["title"],
        "store_city": brochure_data["store"]["address"]["city"],
        "page_count": total_pages,
        "pages": extracted_pages,
    }


def parse_args():
    parser = argparse.ArgumentParser(description="Tesseract OCR for brochure pages.")
    parser.add_argument("--brochure-url", default="https://www.broshura.bg/b/5954966")
    parser.add_argument("--pages", nargs="+", type=int, default=[2, 3, 4])
    parser.add_argument("--all-pages", action="store_true")
    parser.add_argument("--scale", type=int, default=2)
    parser.add_argument("--min-score", type=float, default=0.55)  # compat with hybrid_brochure_merge
    parser.add_argument("--json-out")
    parser.add_argument("--store", default="Unknown")
    return parser.parse_args()


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    args = parse_args()
    pages = args.pages
    if args.all_pages:
        brochure_data = load_brochure_data(args.brochure_url)
        pages = list(range(1, brochure_data["pageResult"]["total"] + 1))

    result = run_ocr_on_pages(
        args.brochure_url, pages, scale=args.scale, store_name=args.store
    )

    if args.json_out:
        out_path = Path(args.json_out)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        print(f"Saved to {out_path}")
    else:
        total = sum(len(p["product_candidates"]) for p in result["pages"])
        print(f"\nTotal candidates: {total}")
        for page in result["pages"]:
            print(f"\n--- Page {page['page']} ---")
            for c in page["product_candidates"]:
                print(f"  {c['price']:.2f} | {c['name']}")
