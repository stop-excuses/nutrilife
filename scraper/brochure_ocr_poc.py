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
NON_FOOD_RE = re.compile(
    r"(букет|лалета|цветя|орхидея|саксия|декорац|светлина|лампа|великденска украса|lidl plus|plus|растение|градин|тор|семена|henipaka)",
    re.IGNORECASE,
)

OCR_REPLACEMENTS = [
    (r"\bknac[: ]*1\b", "клас 1"),
    (r"\bceptnonlimpahn\b", "сертифициран"),
    (r"\bton leha\b", "топ цена"),
    (r"\b3eneh\b", "зелен"),
    (r"\b3eneh nyk\b", "зелен лук"),
    (r"\bnyk\b", "лук"),
    (r"\bmopkobh\b", "моркови"),
    (r"\bkpa[ctx]ta?b[hyu]+\b", "краставици"),
    (r"\babokano\b", "авокадо"),
    (r"\bcnahak\b", "спанак"),
    (r"\bcbek[nhl]*\b", "цвекло"),
    (r"\bgotobo30\b", "готово"),
    (r"\bkohcyma[ln]n?a\b", "консумация"),
    (r"\byhamc\b", "уилямс"),
    (r"\ba6bnk[huy]*\b", "ябълки"),
    (r"\bkpyw[huy]*\b", "круши"),
    (r"\b6yket\b", "букет"),
    (r"\bnaneta\b", "лалета"),
    (r"\bceamnlata\b", "семилата"),
    (r"\bbopobhhkh\b", "боровинки"),
    (r"\ba2ogu\b", "ягоди"),
    (r"\bahahac\b", "ананас"),
    (r"\brpoзne\b", "грозде"),
    (r"\bkahtanyne\b", "канталупе"),
    (r"\bpaзnnuhnlbetobe\b", "различни цветове"),
    (r"\bcbetanha\b", "цветна"),
    (r"\bcbhyeba\b", "слънчева"),
    (r"\bneuypku\b", "печурки"),
    (r"\baomath\b", "домати"),
    (r"\boptokan[nhl]*\b", "портокали"),
    (r"\baumohu\b", "лимони"),
    (r"\baewa\b", "леща"),
    (r"\bmnako\b", "мляко"),
    (r"\bpacho\b", "прясно"),
    (r"\bmacaehocm\b", "масленост"),
    (r"\bmacao\b", "масло"),
    (r"\bmaako\b", "мляко"),
    (r"\bmacho\b", "масло"),
    (r"\bonako[бb]ka\b", "опаковка"),
    (r"\bakuua\b", "акция"),
    (r"\bleha\b", "цена"),
    (r"\blleha\b", "цена"),
    (r"\byeha\b", "цена"),
    (r"\bnwehuua\b", "пшеница"),
    (r"\b①y[зz]uau\b", "фузили"),
    (r"\bphiladelphia\b", "Philadelphia"),
    (r"\bmilka\b", "Milka"),
    (r"\bhass\b", "Hass"),
    (r"\bpou[з3]xog\b", "произход"),
    (r"\blpou[з3]xog\b", "произход"),
    (r"\bezunem\b", "египет"),
    (r"\btbpuua\b", "турция"),
    (r"\bkogpaba\b", "кодраба"),
    (r"\bcaaama\b", "салата"),
    (r"\bebmuho\b", "евтино"),
    (r"\be6muho\b", "евтино"),
    (r"\bfrehona\b", "freshona"),
    (r"\bbcby fpeml\b", "вкус ръжен"),
    (r"\bpokeho\b", "ръжено"),
    (r"\bxaaб\b", "хляб"),
    (r"\beeby fpaer\b", "бейк фреш"),
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
    image = Image.open(BytesIO(image_bytes)).convert("RGB")
    if scale > 1:
        image = image.resize((image.width * scale, image.height * scale), Image.Resampling.LANCZOS)
    grayscale = ImageOps.grayscale(image)
    grayscale = ImageOps.autocontrast(grayscale)
    grayscale = ImageEnhance.Contrast(grayscale).enhance(1.8)
    grayscale = ImageEnhance.Sharpness(grayscale).enhance(1.4)
    grayscale = grayscale.filter(ImageFilter.MedianFilter(size=3))
    return grayscale.convert("RGB")


def polygon_bounds(points):
    xs = [point[0] for point in points]
    ys = [point[1] for point in points]
    return min(xs), min(ys), max(xs), max(ys)


def normalize_text(text):
    text = text.replace("|", "I").replace("€", "E")
    text = re.sub(r"\s+", " ", text).strip(" .,-")
    return text


def normalize_ocr_name(text):
    text = text.lower()
    text = text.replace("0", "о").replace("1", "1").replace("3", "з").replace("6", "б")
    text = text.replace("几", "в").replace(":", " ").replace("/", " ")
    text = text.replace("bpea", "връзка")
    text = text.replace("1bpbзka", "връзка")
    text = text.replace("rotoboзо", "готово за")
    text = text.replace("cok", "сок")
    text = re.sub(r"[^\w\s.-]", " ", text, flags=re.UNICODE)
    text = re.sub(r"\s+", " ", text).strip()
    for pattern, replacement in OCR_REPLACEMENTS:
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
    text = re.sub(r"\b(клас 1|топ цена)\b", " ", text, flags=re.IGNORECASE)
    text = re.sub(
        r"\b(сертифициран|продукт|гарантиран|контролиран|произход|египет|турция|кодраба|готово|консумация|магазин|оферта|купувай|wahda|rotoboзо|yetkohn|акция|опаковка|цена|plus)\b",
        " ",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(
        r"\b(nncta|mpexa|umohn|nonycahka|ymepeho|npoayktnctapahtnpah|kohtponnpah|mponзxonotnoneto|kg|freshon|freshona|lidl|clidl|clidlplus|leha3akr|лева|бр)\b",
        " ",
        text,
    )
    text = re.sub(r"\b[а-яa-z]{1,2}\b", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"\b\d+[.,]?\d*\b", " ", text)
    text = re.sub(r"\s+", " ", text).strip(" .,-")
    return text


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
        score = item[2]
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
    if not name or len(name) < 5:
        return False
    if GENERIC_NAME_RE.search(name):
        return False
    if NON_FOOD_RE.search(name):
        return False
    if len(name) > 60:
        return False
    words = [word for word in name.split() if len(word) > 2]
    if not words or len(words) > 6:
        return False
    bad_words = {"lehnte", "neba", "npmpabhehn", "oφuuuanhua", "φukcupoh", "banyteh", "kypc", "ebpo"}
    if sum(1 for word in words if word in bad_words) >= 2:
        return False
    return True


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


def run_ocr_on_pages(brochure_url, pages, scale, min_score):
    brochure_data = load_brochure_data(brochure_url)
    ocr = RapidOCR()
    extracted_pages = []

    print(f"Title: {brochure_data['title']}")
    print(f"Store city: {brochure_data['store']['address']['city']}")
    print(f"Store productCount: {brochure_data['store'].get('productCount')}")
    print(f"Brochure pages: {brochure_data['pageResult']['total']}")
    print()

    brochure_pages = brochure_data["pageResult"]["pages"]
    for page_number in pages:
        if page_number < 1 or page_number > len(brochure_pages):
            print(f"Page {page_number}: out of range")
            print("-" * 80)
            continue

        page_data = brochure_pages[page_number - 1]
        image_url = get_page_image_url(page_data)
        
        # Unique filename based on image ID
        image_filename = f"{page_data['image']['id']}.webp"
        
        try:
            image_bytes = download_image(image_url, image_filename)
            prepared_img = prepare_image(image_bytes, scale=scale)
            result, _ = ocr(prepared_img)
        except Exception as e:
            print(f"  [!] OCR Error on page {page_number}: {e}")
            continue

        price_lines = extract_price_lines(result, min_score=min_score)
        product_candidates = extract_product_candidates(result, min_score=min_score)

        print(f"Page {page_number}: {image_url}")
        print(f"Detected price-like lines: {len(price_lines)}")
        for score, text in price_lines[:60]:
            print(f"{score:.2f} | {text}")
        print()
        print(f"Product candidates: {len(product_candidates)}")
        for candidate in product_candidates[:15]:
            print(
                f"{candidate['price']:.2f} | {candidate['name']} "
                f"[ocr={candidate['score']:.2f} @ {candidate['position']}]"
            )
        extracted_pages.append(build_page_payload(page_number, image_url, product_candidates))
        print("-" * 80)

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
