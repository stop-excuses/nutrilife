import argparse
import html
import json
import re
import sys
from io import BytesIO
from pathlib import Path

import requests
from bs4 import BeautifulSoup
from PIL import Image, ImageEnhance, ImageFilter, ImageOps
from rapidocr_onnxruntime import RapidOCR


USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
PRICE_RE = re.compile(r"\d+[.,]\d{2}")
PRICE_TOKEN_RE = re.compile(r"(?<!\d)(\d{1,2}[.,]\d{2})(?!\d)")
CYRILLIC_RE = re.compile(r"[А-Яа-я]")
LATIN_WORD_RE = re.compile(r"[A-Za-z]{3,}")
NOISE_RE = re.compile(r"(цена|лев|евро|лв|nb|nв|кg|kg|gr|ml|бр|%|дни|до)", re.IGNORECASE)
GENERIC_NAME_RE = re.compile(
    r"(клас\s*1|топ\s*цена|сертифициран|гарантиран|контролиран|произход|магазин|оферт|промо|купи|лева|акция|опаковка|цена|период|валидн)",
    re.IGNORECASE,
)
# NON_FOOD_RE is now only used as a soft tag — does NOT block extraction
NON_FOOD_SOFT_RE = re.compile(
    r"(букет|лалета|цветя|орхидея|саксия|декорац|светлина|лампа|великденска украса|lidl plus|растение|градин|тор|семена)",
    re.IGNORECASE,
)

# ---  Learning path ---
OCR_LEARNING_PATH = Path(__file__).parent.parent / "data" / "ocr_learning.json"

# --- Visual Latin→Cyrillic look-alike map (used for mixed-script word repair) ---
# These characters look identical in Latin and Cyrillic fonts
LATIN_TO_CYR = {
    'a': 'а', 'A': 'А', 'e': 'е', 'E': 'Е', 'o': 'о', 'O': 'О',
    'c': 'с', 'C': 'С', 'x': 'х', 'X': 'Х', 'p': 'р', 'P': 'Р',
    'B': 'В', 'H': 'Н', 'M': 'М', 'T': 'Т', 'y': 'у', 'K': 'К',
    'b': 'б',
}

OCR_REPLACEMENTS = [
    # --- Generic label noise ---
    (r"\bknac[: ]*1\b", "клас 1"),
    (r"\bceptnonlimpahn\b", "сертифициран"),
    (r"\bton leha\b", "топ цена"),
    # --- Vegetables ---
    (r"\b3eneh\b", "зелен"),
    (r"\b3eneh nyk\b", "зелен лук"),
    (r"\bnyk\b", "лук"),
    (r"\bpeceh\b", "зелен"),           # OCR variant of зелен
    (r"\bmopkobh\b", "моркови"),
    (r"\bkpa[ctx]ta?b[hyu]+\b", "краставици"),
    (r"\babokano\b", "авокадо"),
    (r"\bcnahak\b", "спанак"),
    (r"\bspанак\b", "спанак"),          # mixed-script variant
    (r"\bcbek[nhl]*\b", "цвекло"),
    (r"\bneuypku\b", "печурки"),
    (r"\bneuyp[kк]u\b", "печурки"),
    (r"\baomath\b", "домати"),
    (r"\b[dд]omath\b", "домати"),
    (r"\bkahachn[yu]+\b", "кориандър"),
    (r"\bnapnoh\b", "парион"),
    (r"\bcaaama\b", "салата"),
    (r"\bcanata\b", "салата"),
    (r"\bcapata\b", "салата"),
    (r"\bpykona\b", "рукола"),
    (r"\bmapy[нn][яa]\b", "маруля"),
    (r"\bnnюhen\b", "плюен"),
    (r"\bpatnaзhah\b", "патладжан"),
    (r"\bnatnaz[hн]ah\b", "патладжан"),
    (r"\bтhкba\b", "тиква"),
    (r"\bтhкbhчka\b", "тиквичка"),
    (r"\bpenkh\b", "репичка"),
    (r"\bpenuk[ah]+\b", "репичка"),
    (r"\bcennh[ah]+\b", "целина"),
    (r"\bkonh\b", "корен"),
    # --- Fruits ---
    (r"\boptokan[nhl]*\b", "портокали"),
    (r"\baumohu\b", "лимони"),
    (r"\ba6bnk[huy]*\b", "ябълки"),
    (r"\bkpyw[huy]*\b", "круши"),
    (r"\bbopobhhkh\b", "боровинки"),
    (r"\bbopobhhk[au]\b", "боровинка"),
    (r"\ba2ogu\b", "ягоди"),
    (r"\bagonu\b", "ягоди"),
    (r"\bahahac\b", "ананас"),
    (r"\brpoзne\b", "грозде"),
    (r"\bkahtanyne\b", "канталупе"),
    (r"\byhamc\b", "уилямс"),
    (r"\bnaneta\b", "лалета"),         # non-food - still capture for classification
    (r"\b6yket\b", "букет"),           # non-food
    (r"\bceamnlata\b", "семилата"),
    (r"\bkanhcna\b", "кайсия"),
    (r"\bkahcua\b", "кайсия"),
    (r"\bnpackoba\b", "праскова"),
    (r"\bcnhba\b", "слива"),
    (r"\bcnhb[au]\b", "слива"),
    (r"\bbnwha\b", "вишна"),
    (r"\bcepew[au]\b", "череша"),
    (r"\bkubu\b", "киви"),
    (r"\bnahro\b", "манго"),
    (r"\bnynew\b", "пъпеш"),
    (r"\bkpyw[au]\b", "круша"),
    # --- Dairy ---
    (r"\bmnako\b", "мляко"),
    (r"\bmaako\b", "мляко"),
    (r"\bnpacho мляко\b", "прясно мляко"),
    (r"\bnpacho\b", "прясно"),
    (r"\bmacaehocm\b", "масленост"),
    (r"\bmacnehoctз\b", "масленост"),
    (r"\bmacnehocт\b", "масленост"),
    (r"\bmacao\b", "масло"),
    (r"\bmacho\b", "масло"),
    (r"\bcupeнe\b", "сирене"),
    (r"\bkaukabaн\b", "кашкавал"),
    (r"\bkaukabaн\b", "кашкавал"),
    (r"\bнзbapa\b", "извара"),
    (r"\bkecup\b", "кефир"),
    (r"\bkecnp\b", "кефир"),
    # --- Meat & fish ---
    (r"\bpn[бб]a\b", "риба"),
    (r"\bpn6a\b", "риба"),
    (r"\bnnneшko\b", "пилешко"),
    (r"\bnnneшko\b", "пилешко"),
    (r"\btobn[ah]+\b", "говежди"),
    (r"\bcbnhck[aо]\b", "свинска"),
    (r"\barnewk[aо]\b", "агнешка"),
    (r"\banckon[ah]+\b", "хайвер"),
    (r"\bxahbep\b", "хайвер"),
    # --- Grain/legumes ---
    (r"\baewa\b", "леща"),
    (r"\bnaxyt\b", "нахут"),
    (r"\bnaxyt\b", "нахут"),
    (r"\bopuз\b", "ориз"),
    (r"\bopн3\b", "ориз"),
    (r"\bnwehuua\b", "пшеница"),
    (r"\b①y[зz]uau\b", "фузили"),
    (r"\bфyзhnu\b", "фузили"),
    (r"\bфy3hnu\b", "фузили"),
    (r"\bpaзhobhdhocth\b", "разновидности"),
    (r"\bkpynha\b", "крупа"),
    # --- Other food ---
    (r"\bgotobo30\b", "готово"),
    (r"\bkohcyma[ln]n?a\b", "консумация"),
    (r"\bxaaб\b", "хляб"),
    (r"\bxna6\b", "хляб"),
    (r"\bxna[бb]\b", "хляб"),
    (r"\bxne6\b", "хлеб"),
    (r"\beeby fpaer\b", "бейк фреш"),
    (r"\bbcby fpeml\b", "вкус ръжен"),
    (r"\bpokeho\b", "ръжено"),
    (r"\bтaxhh\b", "тахини"),
    (r"\bxyмyc\b", "хумус"),
    # --- Origin/label metadata (stripped later) ---
    (r"\bpou[з3]xog\b", "произход"),
    (r"\blpou[з3]xog\b", "произход"),
    (r"\bnponзxon\b", "произход"),
    (r"\bnponзxog\b", "произход"),
    (r"\bbbnrapna\b", ""),          # "българия" label → remove
    (r"\bbbnrаpna\b", ""),
    (r"\bbpbзka\b", "връзка"),
    (r"\b[вb]pea\b", "връзка"),
    (r"\b1bpbзka\b", "връзка"),
    (r"\bezunem\b", "египет"),
    (r"\btbpuua\b", "турция"),
    (r"\bkogpaba\b", "кодраба"),
    (r"\bebmuho\b", "евтино"),
    (r"\be6muho\b", "евтино"),
    # --- Brands (preserve as-is) ---
    (r"\bphiladelphia\b", "Philadelphia"),
    (r"\bmilka\b", "Milka"),
    (r"\bhass\b", "Hass"),
    (r"\bfrehona\b", "Freshona"),
    # --- Misc ---
    (r"\bonako[бb]ka\b", "опаковка"),
    (r"\bakuua\b", "акция"),
    (r"\bleha\b", "цена"),
    (r"\blleha\b", "цена"),
    (r"\byeha\b", "цена"),
    (r"\b4eha\b", "цена"),
    (r"\bcbetanha\b", "цветна"),
    (r"\bcbhyeba\b", "слънчева"),
    (r"\bpaзnnuhnlbetobe\b", "различни цветове"),
]


def load_brochure_data(brochure_url):
    cache_dir = Path(__file__).parent.parent / "data" / "brochure_cache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    
    # Use MD5 of URL as filename for safety
    import hashlib
    url_hash = hashlib.md5(brochure_url.encode()).hexdigest()
    cache_path = cache_dir / f"{url_hash}.json"
    
    if cache_path.exists():
        print(f"  [*] Loading brochure metadata from cache: {cache_path}")
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
        # print(f"  [*] Using cached image: {local_path}")
        with open(local_path, "rb") as f:
            return f.read()
            
    # print(f"  [*] Downloading image: {url}")
    response = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=30)
    response.raise_for_status()
    with open(local_path, "wb") as f:
        f.write(response.content)
    return response.content


def prepare_image(image_bytes, scale):
    import numpy as np
    image = Image.open(BytesIO(image_bytes)).convert("RGB")
    if scale > 1:
        image = image.resize((image.width * scale, image.height * scale), Image.Resampling.LANCZOS)
    grayscale = ImageOps.grayscale(image)
    grayscale = ImageOps.autocontrast(grayscale)
    grayscale = ImageEnhance.Contrast(grayscale).enhance(1.8)
    grayscale = ImageEnhance.Sharpness(grayscale).enhance(1.4)
    grayscale = grayscale.filter(ImageFilter.MedianFilter(size=3))
    # RapidOCR requires numpy array, not PIL Image
    return np.array(grayscale.convert("RGB"))


def polygon_bounds(points):
    xs = [point[0] for point in points]
    ys = [point[1] for point in points]
    return min(xs), min(ys), max(xs), max(ys)


def normalize_text(text):
    text = text.replace("|", "I").replace("€", "E")
    text = re.sub(r"\s+", " ", text).strip(" .,-")
    return text


def fix_mixed_script_word(word):
    """Fix a word that has Cyrillic characters mixed with Latin look-alikes.
    Converts visually identical Latin chars to their Cyrillic equivalents.
    Only applied to words that already contain at least one Cyrillic character."""
    has_cyrillic = bool(re.search(r'[а-яА-ЯёЁ]', word))
    if not has_cyrillic:
        return word  # Pure Latin → likely brand name, leave as-is
    return ''.join(LATIN_TO_CYR.get(ch, ch) for ch in word)


def repair_mixed_script(text):
    """Apply fix_mixed_script_word to every word in the text."""
    return ' '.join(fix_mixed_script_word(w) for w in text.split())


def normalize_ocr_name(text):
    text = text.lower()
    # Digit → Cyrillic look-alikes
    text = text.replace("0", "о").replace("3", "з").replace("6", "б")
    text = text.replace("几", "в").replace(":", " ").replace("/", " ")
    text = re.sub(r"[^\w\s.-]", " ", text, flags=re.UNICODE)
    text = re.sub(r"\s+", " ", text).strip()

    # Apply word-level replacements first
    for pattern, replacement in OCR_REPLACEMENTS:
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)

    # Character-level repair of mixed-script words
    text = repair_mixed_script(text)

    # Strip label metadata that appears on product labels but is not the product name
    LABEL_METADATA = (
        r"\b(клас 1|топ цена|сертифициран|продукт|гарантиран|контролиран|"
        r"произход|египет|турция|кодраба|готово|консумация|магазин|оферта|"
        r"купувай|wahda|yetkohn|акция|опаковка|цена|plus|"
        r"масленост|масл|българия|произхожда|произход|серия|"
        r"freshona|freshon|lidl|clidl|lidlplus|leha3akr|лева|бр|"
        r"nncta|mpexa|umohn|nonycahka|ymepeho|npoayktnctapahtnpah|"
        r"kohtponnpah|mponзxonotnoneto|kg)\b"
    )
    text = re.sub(LABEL_METADATA, " ", text, flags=re.IGNORECASE)

    # Remove short leftover tokens (1-2 chars)
    text = re.sub(r"\b[а-яa-z]{1,2}\b", " ", text, flags=re.IGNORECASE)
    # Remove standalone numbers
    text = re.sub(r"\b\d+[.,]?\d*\s*(г|кг|мл|л|бр)?\b", " ", text)
    text = re.sub(r"\s+", " ", text).strip(" .,-")
    return text


def save_ocr_learning(noisy_names, store_name, page_count, candidate_count):
    """After each OCR run, save mixed-script patterns to ocr_learning.json
    for future pattern mining and auto-correction."""
    learning = {"version": 1, "patterns": {}, "runs": []}
    if OCR_LEARNING_PATH.exists():
        try:
            learning = json.loads(OCR_LEARNING_PATH.read_text(encoding="utf-8"))
            learning.setdefault("patterns", {})
            learning.setdefault("runs", [])
        except Exception:
            pass

    # Extract mixed-script tokens from noisy names
    MIXED_RE = re.compile(r'(?:[a-zA-Z][а-яА-Я]|[а-яА-Я][a-zA-Z])')
    for name in noisy_names:
        for token in name.split():
            if MIXED_RE.search(token) and len(token) >= 3:
                key = token.lower()
                entry = learning["patterns"].setdefault(key, {"count": 0, "context": []})
                entry["count"] += 1
                ctx = name[:40]
                if ctx not in entry["context"]:
                    entry["context"] = entry["context"][-4:] + [ctx]

    # Auto-derive corrections for high-frequency mixed tokens
    from datetime import datetime
    auto_corrections = {}
    for token, info in learning["patterns"].items():
        if info["count"] >= 3:
            fixed = fix_mixed_script_word(token)
            if fixed != token and re.search(r'[а-яА-Я]{3,}', fixed):
                auto_corrections[token] = fixed

    learning["runs"].append({
        "date": datetime.utcnow().isoformat() + "Z",
        "store": store_name,
        "pages": page_count,
        "candidates": candidate_count,
        "noisy_names": len(noisy_names),
        "auto_corrections_available": len(auto_corrections),
    })
    learning["runs"] = learning["runs"][-100:]
    learning["auto_corrections"] = auto_corrections

    try:
        OCR_LEARNING_PATH.write_text(
            json.dumps(learning, ensure_ascii=False, indent=2), encoding="utf-8"
        )
    except Exception:
        pass

    return auto_corrections


def load_ocr_learned_corrections():
    """Load previously learned OCR corrections and add them to OCR_REPLACEMENTS."""
    if not OCR_LEARNING_PATH.exists():
        return
    try:
        data = json.loads(OCR_LEARNING_PATH.read_text(encoding="utf-8"))
        for token, correction in data.get("auto_corrections", {}).items():
            pattern = r'\b' + re.escape(token) + r'\b'
            # Avoid duplicates
            if not any(p == pattern for p, _ in OCR_REPLACEMENTS):
                OCR_REPLACEMENTS.append((pattern, correction))
    except Exception:
        pass


def extract_price_value(text):
    matches = PRICE_TOKEN_RE.findall(text.replace(" ", ""))
    values = []
    for match in matches:
        try:
            value = float(match.replace(",", "."))
        except ValueError:
            continue
        if 0.3 <= value <= 999:
            values.append(value)
    return values[0] if values else None


def build_ocr_entries(ocr_result, min_score):
    entries = []
    if not ocr_result:
        return entries

    for item in ocr_result:
        text = normalize_text(item[1])
        score = float(item[2])
        if not text or score < min_score:
            continue
        x1, y1, x2, y2 = polygon_bounds(item[0])
        entries.append({
            "text": text,
            "score": score,
            "bbox": (x1, y1, x2, y2),
            "cx": (x1 + x2) / 2,
            "cy": (y1 + y2) / 2,
            "width": x2 - x1,
            "height": y2 - y1,
        })
    return entries


def extract_price_lines(ocr_result, min_score):
    lines = []
    for item in build_ocr_entries(ocr_result, min_score):
        text = item["text"]
        if PRICE_RE.search(text):
            lines.append((item["score"], text))
    return lines


def score_name_text(text):
    score = 0
    if CYRILLIC_RE.search(text):
        score += 3
    if LATIN_WORD_RE.search(text):
        score += 2
    if len(text) >= 8:
        score += 1
    if NOISE_RE.search(text):
        score -= 2
    if PRICE_TOKEN_RE.search(text):
        score -= 4
    if text.isupper():
        score += 1
    return score


def is_viable_name(name):
    """Check if an OCR name is a viable product name (noise filtering only).
    Does NOT filter food vs non-food — that classification happens downstream."""
    if not name or len(name) < 5:
        return False
    if GENERIC_NAME_RE.search(name):
        return False
    # NON_FOOD_SOFT_RE no longer blocks — non-food items are allowed through,
    # they will be tagged is_food=False in the enrichment step
    if len(name) > 80:
        return False
    words = [word for word in name.split() if len(word) > 2]
    if not words or len(words) > 8:
        return False
    bad_words = {"lehnte", "neba", "npmpabhehn", "oφuuuanhua", "φukcupoh", "banyteh", "kypc", "ebpo"}
    if sum(1 for word in words if word in bad_words) >= 2:
        return False
    return True


def is_non_food_soft(name):
    """Soft non-food detection — used for tagging only, does not block extraction."""
    return bool(NON_FOOD_SOFT_RE.search(name))


def extract_product_candidates(ocr_result, min_score):
    entries = build_ocr_entries(ocr_result, min_score)
    price_entries = []
    text_entries = []

    for entry in entries:
        price_value = extract_price_value(entry["text"])
        if price_value is not None:
            enriched = dict(entry)
            enriched["price"] = price_value
            price_entries.append(enriched)
        else:
            text_entries.append(entry)

    candidates = []
    for price_entry in sorted(price_entries, key=lambda item: (item["cy"], item["cx"])):
        vertical_radius = max(340, price_entry["height"] * 4.5)
        horizontal_radius = max(700, price_entry["width"] * 3.5)
        nearby = []
        for text_entry in text_entries:
            dy = abs(text_entry["cy"] - price_entry["cy"])
            dx = abs(text_entry["cx"] - price_entry["cx"])
            if dy > vertical_radius or dx > horizontal_radius:
                continue
            if text_entry["cy"] > price_entry["cy"] + price_entry["height"] * 1.4:
                continue
            nearby.append(text_entry)

        nearby.sort(key=lambda item: (abs(item["cy"] - price_entry["cy"]), abs(item["cx"] - price_entry["cx"])))
        top_texts = [item for item in nearby if score_name_text(item["text"]) > 0][:6]
        name_parts = []
        seen_text = set()
        for item in sorted(top_texts, key=lambda entry: (entry["cy"], entry["cx"])):
            text = item["text"]
            if text in seen_text:
                continue
            seen_text.add(text)
            name_parts.append(text)

        if not name_parts:
            continue

        raw_name = " ".join(name_parts)
        raw_name = re.sub(r"\s{2,}", " ", raw_name).strip(" -")
        normalized_name = normalize_ocr_name(raw_name)
        if not is_viable_name(normalized_name):
            continue
        candidates.append({
            "price": price_entry["price"],
            "price_text": price_entry["text"],
            "name": normalized_name,
            "raw_name": raw_name,
            "score": round(price_entry["score"], 2),
            "position": (round(price_entry["cx"]), round(price_entry["cy"])),
        })

    deduped = []
    seen = set()
    for candidate in candidates:
        key = (candidate["price"], candidate["name"][:80])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(candidate)
    return deduped


def build_page_payload(page_number, image_url, product_candidates):
    return {
        "page": page_number,
        "image_url": image_url,
        "product_candidates": product_candidates,
    }


def run_ocr_on_pages(brochure_url, pages, scale, min_score, store_name="Unknown"):
    import time
    # Load learned corrections from previous runs
    load_ocr_learned_corrections()

    brochure_data = load_brochure_data(brochure_url)
    ocr = RapidOCR()
    extracted_pages = []
    all_noisy_names = []
    MIXED_RE = re.compile(r'(?:[a-zA-Z][а-яА-Я]|[а-яА-Я][a-zA-Z])')

    total_pages_in_brochure = brochure_data['pageResult']['total']
    print(f"Title: {brochure_data['title']}", flush=True)
    print(f"Store: {brochure_data['store']['address']['city']} | "
          f"productCount={brochure_data['store'].get('productCount')} | "
          f"brochure pages={total_pages_in_brochure}", flush=True)
    print(f"OCR: {len(pages)} pages to process (scale={scale}, min_score={min_score})", flush=True)

    run_t0 = time.perf_counter()
    total_candidates_all = 0

    brochure_pages = brochure_data["pageResult"]["pages"]
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
            prepared_img = prepare_image(image_bytes, scale=scale)
            result, _ = ocr(prepared_img)
        except Exception as e:
            print(f"  [OCR] page {page_number}/{len(pages)} ERROR: {e}", flush=True)
            continue

        price_lines = extract_price_lines(result, min_score=min_score)
        product_candidates = extract_product_candidates(result, min_score=min_score)
        elapsed = time.perf_counter() - t0

        # Tag non-food candidates (soft) and collect noisy names for learning
        for c in product_candidates:
            c["is_non_food_hint"] = is_non_food_soft(c["name"])
            if MIXED_RE.search(c["name"]):
                all_noisy_names.append(c["name"])

        total_candidates_all += len(product_candidates)
        run_elapsed = time.perf_counter() - run_t0
        print(
            f"  [OCR] page {page_number} ({idx}/{len(pages)}) | "
            f"{len(price_lines)} prices | {len(product_candidates)} candidates | "
            f"{elapsed:.1f}s | total so far: {total_candidates_all} | run: {run_elapsed:.0f}s",
            flush=True,
        )

        # Show top candidates compactly (max 5)
        for candidate in product_candidates[:5]:
            tag = "[!]" if candidate.get("is_non_food_hint") else "   "
            print(
                f"    {tag} {candidate['price']:.2f} lv | {candidate['name'][:50]} "
                f"[{candidate['score']:.2f}]",
                flush=True,
            )

        extracted_pages.append(build_page_payload(page_number, image_url, product_candidates))

    run_elapsed = time.perf_counter() - run_t0
    print(
        f"  [OCR] done — {len(extracted_pages)} pages | "
        f"{total_candidates_all} total candidates | {run_elapsed:.0f}s total",
        flush=True,
    )

    total_candidates = sum(len(p["product_candidates"]) for p in extracted_pages)
    # Save OCR learning data
    learned = save_ocr_learning(all_noisy_names, store_name, len(extracted_pages), total_candidates)
    if learned:
        print(f"[*] OCR Learning: {len(learned)} new auto-corrections saved → ocr_learning.json")

    return {
        "brochure_url": brochure_url,
        "title": brochure_data["title"],
        "store_city": brochure_data["store"]["address"]["city"],
        "page_count": brochure_data["pageResult"]["total"],
        "pages": extracted_pages,
    }


def parse_args():
    parser = argparse.ArgumentParser(description="OCR proof-of-concept for a Broshura brochure page.")
    parser.add_argument("--brochure-url", default="https://www.broshura.bg/b/5962247")
    parser.add_argument("--pages", nargs="+", type=int, default=[1, 3, 5])
    parser.add_argument("--all-pages", action="store_true")
    parser.add_argument("--scale", type=int, default=2)
    parser.add_argument("--min-score", type=float, default=0.55)
    parser.add_argument("--json-out")
    return parser.parse_args()


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    args = parse_args()
    pages = args.pages
    if args.all_pages:
        brochure_data = load_brochure_data(args.brochure_url)
        pages = list(range(1, brochure_data["pageResult"]["total"] + 1))

    result = run_ocr_on_pages(args.brochure_url, pages, args.scale, args.min_score)
    if args.json_out:
        out_path = Path(args.json_out)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        print(f"Saved OCR candidates to {out_path}")
