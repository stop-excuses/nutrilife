"""
NutriLife Scraper — broshura.bg (Playwright Edition)
Scrapes weekly grocery offers from ALL stores.
Filters healthy foods, adds health scores, diet tags, weight parsing.
Exports to data/offers.json

Architecture (hybrid, fast):
  1. /i/3 category → discover /h/ store URLs
  2. Each store: /h/ page + /fl/ listing → collect products
  3. Two extraction modes per store:
     a) Listing parse: products with prices directly from HTML (ul.list-offer-minor)
     b) JSON-LD fallback: /p/ product pages for items missing price data
  4. Parallel stores (semaphore-limited), parallel /p/ pages
"""

import json
import os
import re
import asyncio
import hashlib
import random
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime
from pathlib import Path
from playwright.async_api import async_playwright
from bs4 import BeautifulSoup

BASE_URL = "https://www.broshura.bg"
CATEGORY_URL = f"{BASE_URL}/i/3"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
DATA_DIR = Path(__file__).parent.parent / "data"
OUTPUT_PATH = DATA_DIR / "offers.json"
ALL_PRODUCTS_PATH = DATA_DIR / "all_products.json"
BROCHURES_PATH = DATA_DIR / "brochures.json"
BGN_TO_EUR = 1.95583

# Conservative concurrency to avoid rate limiting
MAX_STORES_PARALLEL = 3       # INCREASED: Process multiple stores in parallel
MAX_PAGES_PARALLEL = 5        # INCREASED: More concurrent product page scrapes
MAX_FLR_REGIONS = 25          # Check up to 25 regions per store (most have ~20)
PAGE_TIMEOUT = 30000
MIN_DELAY = 1.0               # DECREASED: Faster requests (risky but requested)
MAX_DELAY = 3.0               # DECREASED: Faster requests
MAX_GOTO_RETRIES = 3
BACKOFF_BASE_SECONDS = 8
SOFIA_REGION_KEYWORDS = ("sofia", "sofija", "софия", "столична община")


async def polite_delay():
    """Random delay between requests to avoid rate limiting."""
    await asyncio.sleep(random.uniform(MIN_DELAY, MAX_DELAY))


async def goto_with_retry(page, url, wait_until="domcontentloaded", timeout=PAGE_TIMEOUT):
    last_error = None
    for attempt in range(1, MAX_GOTO_RETRIES + 1):
        try:
            await page.goto(url, wait_until=wait_until, timeout=timeout)
            content = await page.content()
            if "403 Forbidden" in content:
                raise RuntimeError("403 Forbidden")
            return content
        except Exception as e:
            last_error = e
            if attempt == MAX_GOTO_RETRIES:
                break
            backoff = BACKOFF_BASE_SECONDS * attempt + random.uniform(2.0, 6.0)
            print(f"    [!] Retry {attempt}/{MAX_GOTO_RETRIES} for {url} after {backoff:.1f}s: {e}")
            await asyncio.sleep(backoff)
    raise last_error

# --- Food Keywords ---
FOOD_KEYWORDS = [
    "яйц", "пилешк", "пиле", "риба тон", "сьомга", "скумрия",
    "говежд", "свинск", "агнешк", "пуешк", "телешк",
    "месо", "мляно", "филе", "кайма", "бут", "стек",
    "шунка", "кренвирш", "наденица", "салам", "луканка",
    "риба", "скарида", "калмар",
    "кисело мляко", "мляко", "yogurt", "извара", "скир", "сирене",
    "кашкавал", "масло", "маскарпоне", "бри",
    "овес", "овесен", "леща", "боб", "нахут", "фасул",
    "ориз", "хляб", "брашно", "макарон", "спагети",
    "царевица", "грах",
    "орех", "бадем", "кашу", "ядки", "зехтин", "olive",
    "фъстък", "лешник", "слънчоглед",
    "картоф", "банан", "ябълк", "морков", "домат", "краставиц",
    "спанак", "броколи", "зеленчук", "салат", "лук", "чесн",
    "чушк", "тиквичк", "зеле", "цвекло",
    "портокал", "лимон", "мандарин", "грозде", "ягод", "диня",
    "консерв", "пюре", "сок", "хайвер", "маслин", "мед", "кафе", "чай",
    "храна", "хран", "едам", "гауда", "моцарела", "пармезан",
    "сельодка", "херинга",
]

JUNK_KEYWORDS = [
    "кола", "cola", "pepsi", "фанта", "спрайт",
    "вафл", "шоколад", "бонбон", "гуми", "желе",
    "чипс", "снак", "крекер", "пуканки",
    "торта", "сладкиш", "кекс", "мъфин",
    "газирана", "енергийна напитка",
    "сладолед", "пудинг",
]

# Heavily processed meats — food but NOT healthy (high sodium, nitrites, fillers)
PROCESSED_MEAT_KEYWORDS = [
    "кренвирш", "наденица", "салам",
]

CATEGORY_MAP = {
    "protein": ["яйц", "пилешк", "пиле", "говежд", "свинск", "агнешк", "пуешк", "телешк",
                 "месо", "мляно", "филе", "кайма", "бут", "стек", "шунка", "кренвирш",
                 "наденица", "салам", "луканка", "риба", "скарида", "калмар",
                 "сельодка", "херинга", "хайвер"],
    "canned": ["риба тон", "сьомга", "скумрия", "консерв"],
    "grain": ["овес", "овесен", "ориз", "брашно", "макарон", "паста", "спагети"],
    "bread": ["хляб", "багета", "земел", "питка", "фокача"],
    "legume": ["леща", "боб", "нахут", "фасул", "царевица", "грах"],
    "dairy": ["кисело мляко", "мляко", "yogurt", "извара", "скир", "сирене",
              "кашкавал", "масло", "едам", "гауда", "моцарела", "пармезан",
              "маскарпоне", "бри"],
    "nuts": ["орех", "бадем", "кашу", "ядки", "фъстък", "лешник", "слънчоглед"],
    "fat": ["зехтин", "olive", "маслин"],
    "vegetable": ["картоф", "банан", "ябълк", "морков", "домат", "краставиц",
                   "спанак", "броколи", "зеленчук", "салат", "лук", "чесн",
                   "чушк", "тиквичк", "зеле", "цвекло", "портокал", "лимон",
                   "мандарин", "грозде", "ягод", "диня"],
}

HEALTH_SCORES = {
    10: ["риба тон", "зехтин", "сьомга"],
    9: ["яйц", "пилешк", "пиле", "леща", "боб", "нахут", "ядки", "орех", "бадем"],
    8: ["овес", "овесен", "скир", "извара", "спанак", "броколи", "скумрия"],
    7: ["кисело мляко", "сирене", "банан", "картоф", "говежд", "пуешк", "агнешк"],
    6: ["ориз", "хляб", "свинск", "морков", "ябълк", "фасул"],
}

DIET_TAG_RULES = {
    "high_protein": ["яйц", "пилешк", "пиле", "риба тон", "сьомга", "кисело мляко",
                     "извара", "скир", "говежд", "свинск", "пуешк", "леща", "нахут"],
    "keto": ["яйц", "пилешк", "пиле", "говежд", "свинск", "риба тон", "сьомга",
             "сирене", "ядки", "орех", "бадем", "зехтин", "извара"],
    "mediterranean": ["риба тон", "сьомга", "зехтин", "нахут", "леща", "зеленчук",
                      "ядки", "орех", "бадем", "спанак", "броколи", "морков"],
    "vegetarian": ["яйц", "боб", "леща", "нахут", "фасул", "кисело мляко",
                   "сирене", "зеленчук", "извара", "скир", "овес", "ориз",
                   "картоф", "банан", "спанак", "броколи"],
    "budget": [],
}

KETO_EXCLUDE = ["ориз", "картоф", "банан", "овес", "боб", "леща", "нахут", "хляб"]

SHELF_LIFE_MAP = {
    "grain": "1-2г", "legume": "1-2г", "canned": "2-3г",
    "nuts": "6м-1г", "fat": "1-2г",
    "dairy": "малотраен", "protein": "малотраен", "vegetable": "малотраен",
    "bread": "малотраен",
}

BULK_CATEGORIES = {"legume", "canned", "nuts", "fat"} # Removed grain (bread is not bulk worthy usually)

EMOJI_MAP = {
    "protein": "🍗", "canned": "🥫", "grain": "🌾", "legume": "🫘",
    "dairy": "🥛", "nuts": "🥜", "fat": "🫒", "vegetable": "🥦",
    "bread": "🍞",
}

STORE_KEYWORDS = {
    "Lidl": ["lidl", "лидл"],
    "Kaufland": ["kaufland"],
    "Billa": ["billa", "била"],
    "T-Market": ["t-market", "tmarket", "т-маркет"],
    "Fantastico": ["fantastico", "фантастико"],
    "CBA": ["cba"],
    "Metro": ["metro", "метро"],
    "Penny": ["penny", "пени"],
    "Piccadilly": ["piccadilly", "пикадили"],
    "Slaveks": ["slaveks", "славекс"],
    "STOP4ETO": ["stop4eto", "стопчето"],
    "Flora": ["flora", "флора"],
    "Life": ["life", "лайф"],
    "HIT": ["hit", "хит"],
}


# --- Macros Database (per 100g) ---
MACROS_DB = {
    # --- Eggs ---
    "яйц": {"kcal": 155, "p": 13, "f": 11, "c": 1.1},
    # --- Poultry ---
    "пилешк": {"kcal": 165, "p": 31, "f": 3.6, "c": 0},
    "пиле": {"kcal": 165, "p": 31, "f": 3.6, "c": 0},
    "пуешк": {"kcal": 189, "p": 29, "f": 7, "c": 0},
    # --- Red meat ---
    "говежд": {"kcal": 250, "p": 26, "f": 15, "c": 0},
    "свинск": {"kcal": 242, "p": 27, "f": 14, "c": 0},
    "агнешк": {"kcal": 294, "p": 25, "f": 21, "c": 0},
    "телешк": {"kcal": 172, "p": 24, "f": 8, "c": 0},
    "кайма": {"kcal": 250, "p": 18, "f": 20, "c": 0},
    "стек": {"kcal": 271, "p": 26, "f": 18, "c": 0},
    # --- Cuts ---
    "бут": {"kcal": 160, "p": 20, "f": 9, "c": 0},
    "филе": {"kcal": 110, "p": 23, "f": 2, "c": 0},
    "мляно": {"kcal": 250, "p": 18, "f": 20, "c": 0},
    # --- Deli / processed meat ---
    "шунка": {"kcal": 145, "p": 21, "f": 6, "c": 1.5},
    "кренвирш": {"kcal": 257, "p": 12, "f": 22, "c": 3},
    "наденица": {"kcal": 300, "p": 14, "f": 26, "c": 2},
    "салам": {"kcal": 336, "p": 13, "f": 30, "c": 3},
    "луканка": {"kcal": 410, "p": 22, "f": 35, "c": 1},
    # --- Fish & seafood ---
    "риба тон": {"kcal": 132, "p": 28, "f": 0.6, "c": 0},
    "сьомга": {"kcal": 208, "p": 20, "f": 13, "c": 0},
    "скумрия": {"kcal": 205, "p": 18, "f": 14, "c": 0},
    "риба": {"kcal": 136, "p": 20, "f": 6, "c": 0},
    "скарида": {"kcal": 99, "p": 24, "f": 0.3, "c": 0.2},
    "калмар": {"kcal": 92, "p": 15.6, "f": 1.4, "c": 3.1},
    "сельодка": {"kcal": 158, "p": 18, "f": 9, "c": 0},
    "херинга": {"kcal": 158, "p": 18, "f": 9, "c": 0},
    "хайвер": {"kcal": 264, "p": 25, "f": 18, "c": 0},
    # --- Dairy ---
    "кисело мляко": {"kcal": 61, "p": 3.5, "f": 3.3, "c": 4.7},
    "мляко": {"kcal": 60, "p": 3.2, "f": 3.2, "c": 4.8},
    "извара": {"kcal": 98, "p": 11, "f": 4, "c": 3.4},
    "скир": {"kcal": 66, "p": 11, "f": 0.2, "c": 4},
    "сирене": {"kcal": 264, "p": 14, "f": 22, "c": 2},
    "кашкавал": {"kcal": 350, "p": 25, "f": 27, "c": 1},
    "масло": {"kcal": 717, "p": 0.9, "f": 81, "c": 0.1},
    "маскарпоне": {"kcal": 429, "p": 4.8, "f": 44, "c": 3.5},
    "бри": {"kcal": 334, "p": 21, "f": 28, "c": 0.5},
    "едам": {"kcal": 357, "p": 25, "f": 28, "c": 1.4},
    "гауда": {"kcal": 356, "p": 25, "f": 27, "c": 2.2},
    "моцарела": {"kcal": 280, "p": 28, "f": 17, "c": 3.1},
    "пармезан": {"kcal": 431, "p": 38, "f": 29, "c": 4.1},
    # --- Grains ---
    "овес": {"kcal": 389, "p": 16.9, "f": 6.9, "c": 66},
    "овесен": {"kcal": 389, "p": 16.9, "f": 6.9, "c": 66},
    "ориз": {"kcal": 130, "p": 2.7, "f": 0.3, "c": 28},
    "хляб": {"kcal": 265, "p": 9, "f": 3.2, "c": 49},
    "брашно": {"kcal": 364, "p": 10, "f": 1, "c": 76},
    "макарон": {"kcal": 131, "p": 5, "f": 1.1, "c": 25},
    "спагети": {"kcal": 131, "p": 5, "f": 1.1, "c": 25},
    # --- Legumes ---
    "леща": {"kcal": 116, "p": 9, "f": 0.4, "c": 20},
    "боб": {"kcal": 139, "p": 9, "f": 0.5, "c": 25},
    "нахут": {"kcal": 164, "p": 8.9, "f": 2.6, "c": 27},
    "фасул": {"kcal": 127, "p": 8.7, "f": 0.5, "c": 22},
    "царевица": {"kcal": 86, "p": 3.3, "f": 1.4, "c": 19},
    "грах": {"kcal": 81, "p": 5.4, "f": 0.4, "c": 14},
    # --- Nuts & seeds ---
    "орех": {"kcal": 654, "p": 15, "f": 65, "c": 14},
    "бадем": {"kcal": 579, "p": 21, "f": 49, "c": 22},
    "кашу": {"kcal": 553, "p": 18, "f": 44, "c": 30},
    "фъстък": {"kcal": 567, "p": 25, "f": 49, "c": 16},
    "лешник": {"kcal": 628, "p": 15, "f": 61, "c": 17},
    "слънчоглед": {"kcal": 584, "p": 21, "f": 51, "c": 20},
    "ядки": {"kcal": 607, "p": 20, "f": 54, "c": 20},
    # --- Fats ---
    "зехтин": {"kcal": 884, "p": 0, "f": 100, "c": 0},
    "маслин": {"kcal": 115, "p": 0.8, "f": 11, "c": 6},
    # --- Vegetables ---
    "броколи": {"kcal": 34, "p": 2.8, "f": 0.4, "c": 7},
    "спанак": {"kcal": 23, "p": 2.9, "f": 0.4, "c": 3.6},
    "домат": {"kcal": 18, "p": 0.9, "f": 0.2, "c": 3.9},
    "краставиц": {"kcal": 15, "p": 0.7, "f": 0.1, "c": 3.6},
    "картоф": {"kcal": 77, "p": 2, "f": 0.1, "c": 17},
    "морков": {"kcal": 41, "p": 0.9, "f": 0.2, "c": 10},
    "лук": {"kcal": 40, "p": 1.1, "f": 0.1, "c": 9.3},
    "чесн": {"kcal": 149, "p": 6.4, "f": 0.5, "c": 33},
    "чушк": {"kcal": 31, "p": 1, "f": 0.3, "c": 6},
    "тиквичк": {"kcal": 17, "p": 1.2, "f": 0.3, "c": 3.1},
    "зеле": {"kcal": 25, "p": 1.3, "f": 0.1, "c": 6},
    "цвекло": {"kcal": 43, "p": 1.6, "f": 0.2, "c": 10},
    "салат": {"kcal": 15, "p": 1.4, "f": 0.2, "c": 2.9},
    "авокадо": {"kcal": 160, "p": 2, "f": 15, "c": 9},
    # --- Fruits ---
    "банан": {"kcal": 89, "p": 1.1, "f": 0.3, "c": 23},
    "ябълк": {"kcal": 52, "p": 0.3, "f": 0.2, "c": 14},
    "портокал": {"kcal": 47, "p": 0.9, "f": 0.1, "c": 12},
    "лимон": {"kcal": 29, "p": 1.1, "f": 0.3, "c": 9},
    "мандарин": {"kcal": 53, "p": 0.8, "f": 0.3, "c": 13},
    "грозде": {"kcal": 69, "p": 0.7, "f": 0.2, "c": 18},
    "ягод": {"kcal": 32, "p": 0.7, "f": 0.3, "c": 7.7},
    "диня": {"kcal": 30, "p": 0.6, "f": 0.2, "c": 7.6},
    # --- Other ---
    "мед": {"kcal": 304, "p": 0.3, "f": 0, "c": 82},
    "консерв": {"kcal": 100, "p": 15, "f": 3, "c": 2},
    "пюре": {"kcal": 82, "p": 1.8, "f": 4, "c": 11},
}


# --- Utils ---
def extract_bgn_price(text):
    if not text:
        return None
    match = re.search(r'(\d+[.,]\d+)\s*лв', text)
    if match:
        try:
            return round(float(match.group(1).replace(",", ".")), 2)
        except ValueError:
            return None
    return None


def bgn_to_eur(value):
    if value is None:
        return None
    return round(value / BGN_TO_EUR, 2)


def parse_bg_date(text):
    if not text:
        return None
    match = re.search(r'(\d{2})[.\-](\d{2})[.\-](\d{2,4})', text)
    if not match:
        return None
    day, month, year = match.groups()
    year = int(year)
    if year < 100:
        year += 2000
    try:
        return datetime(year, int(month), int(day)).date()
    except ValueError:
        return None


def extract_active_brochures(store_html, store_name, today=None):
    today = today or datetime.now().date()
    brochures = []
    seen_urls = set()
    pattern = re.compile(r"/b/\d+")
    soup = BeautifulSoup(store_html, "html.parser")

    for a_tag in soup.find_all("a", href=pattern):
        href = a_tag.get("href", "").split("#")[0]
        if not href or href in seen_urls:
            continue
        seen_urls.add(href)

        text = " ".join(a_tag.stripped_strings)
        title = (a_tag.get("title", "") or "").strip()
        combined = f"{title} {text}".strip()
        lower = combined.lower()

        valid_from = None
        valid_until = None

        from_match = re.search(r'валидн\w*\s+от[:\s]+(\d{2}[.\-]\d{2}[.\-]\d{2,4})', lower)
        until_match = re.search(r'валидн\w*\s+до[:\s]+(\d{2}[.\-]\d{2}[.\-]\d{2,4})', lower)
        if not from_match:
            from_match = re.search(r'важи\s+от[:\s]+(\d{2}[.\-]\d{2}[.\-]\d{2,4})', lower)
        if not until_match:
            until_match = re.search(r'важи\s+до[:\s]+(\d{2}[.\-]\d{2}[.\-]\d{2,4})', lower)

        if from_match:
            valid_from = parse_bg_date(from_match.group(1))
        if until_match:
            valid_until = parse_bg_date(until_match.group(1))

        is_active = True
        if valid_from and today < valid_from:
            is_active = False
        if valid_until and today > valid_until:
            is_active = False

        brochures.append({
            "store": store_name,
            "url": BASE_URL + href,
            "title": title or text.strip(),
            "valid_from": valid_from.isoformat() if valid_from else None,
            "valid_until": valid_until.isoformat() if valid_until else None,
            "is_active": is_active,
        })

    active = [b for b in brochures if b["is_active"]]
    # Fallback: if no valid_from/until found but it's a brochure link, assume it's active for now
    # especially for Billa where dates are sometimes missing in the title/text
    if not active and brochures:
        active = [brochures[0]] # Take at least one if we found any links
    
    active.sort(key=lambda b: (b["valid_until"] or "9999-12-31", b["title"]))
    return active


def parse_weight(name):
    name_lower = name.lower()
    # Skip "до" which usually indicates a maximum, not the actual weight
    clean_name = re.sub(r'до\s+\d+[.,]?\d*\s*(кг|г|л)', '', name_lower)
    
    match = re.search(r'(\d+[.,]?\d*)\s*кг', clean_name)
    if match:
        val = float(match.group(1).replace(',', '.'))
        return match.group(0).strip(), int(val * 1000)
    match = re.search(r'(\d+)\s*г(?!од)', clean_name)
    if match:
        return match.group(0).strip(), int(match.group(1))
    match = re.search(r'(\d+)\s*мл', clean_name)
    if match:
        return match.group(0).strip(), int(match.group(1))
    match = re.search(r'(\d+[.,]?\d*)\s*л(?!в)', clean_name)
    if match:
        val = float(match.group(1).replace(',', '.'))
        return match.group(0).strip(), int(val * 1000)
    return None, None


def detect_category(name):
    name_lower = name.lower()
    for cat, keywords in CATEGORY_MAP.items():
        if any(kw in name_lower for kw in keywords):
            return cat
    return "other"


def get_health_score(name):
    name_lower = name.lower()
    for score, keywords in sorted(HEALTH_SCORES.items(), reverse=True):
        if any(kw in name_lower for kw in keywords):
            return score
    return 5


def get_diet_tags(name):
    name_lower = name.lower()
    tags = []
    for tag, keywords in DIET_TAG_RULES.items():
        if tag == "budget":
            continue
        if tag == "keto":
            if any(kw in name_lower for kw in keywords) and not any(ex in name_lower for ex in KETO_EXCLUDE):
                tags.append(tag)
        elif any(kw in name_lower for kw in keywords):
            tags.append(tag)
    return tags


NOT_FOOD_KEYWORDS = [
    "храна за кучета", "храна за котки", "храна за куче", "храна за котка",
    "храна за домашни", "храна за животни", "храна за птици",
    "термочаш", "чаш", "бюро", "одеяло", "възглавниц", "чанта",
    "матрак", "стол", "маса", "рафт", "шкаф", "лампа",
    "препарат", "перилен", "омекотител",
]


def is_food(name):
    name_lower = name.lower()
    if any(kw in name_lower for kw in NOT_FOOD_KEYWORDS):
        return False
    return any(kw in name_lower for kw in FOOD_KEYWORDS)


def is_junk(name):
    return any(kw in name.lower() for kw in JUNK_KEYWORDS)


def is_processed_meat(name):
    return any(kw in name.lower() for kw in PROCESSED_MEAT_KEYWORDS)


def is_healthy(name):
    return is_food(name) and not is_junk(name) and not is_processed_meat(name)


def generate_id(store, name):
    slug = re.sub(r'[^a-z0-9а-яё]+', '-', name.lower()).strip('-')[:30]
    hash_suffix = hashlib.md5(f"{store}-{name}".encode()).hexdigest()[:6]
    return f"{store.lower()}-{slug}-{hash_suffix}"


def detect_store(url):
    for store, kws in STORE_KEYWORDS.items():
        if any(kw in url.lower() for kw in kws):
            return store
    return "Unknown"


def get_best_image(img_tag):
    if not img_tag:
        return None
    srcset = img_tag.get("srcset", "")
    if srcset:
        parts = [p.strip().split(" ")[0] for p in srcset.split(",") if p.strip()]
        if parts:
            return parts[-1]
    return img_tag.get("src")


def is_sofia_region(*values):
    for value in values:
        if not value:
            continue
        text = value.lower()
        if any(keyword in text for keyword in SOFIA_REGION_KEYWORDS):
            return True
    return False


def get_macros(name):
    name_lower = name.lower()
    # Longer keywords first for correct matching (e.g. "кисело мляко" before "мляко")
    sorted_db = sorted(MACROS_DB.items(), key=lambda x: len(x[0]), reverse=True)
    for kw, macros in sorted_db:
        if kw in name_lower:
            return macros
    return None


def extract_fl_urls(html):
    matches = re.findall(r'href="(/fl/[^"#]+)"', html)
    fl_urls = []
    seen = set()
    for match in matches:
        url = BASE_URL + match
        if url in seen:
            continue
        seen.add(url)
        fl_urls.append(url)
    return fl_urls


def build_offer(name, new_price, old_price, discount_pct, image_url, store_name, valid_until=None, address=None):
    if not name or not new_price: return None

    # Try to find weight in the name if not explicitly provided
    weight_raw, weight_grams = parse_weight(name)
    
    # Calculate old_price if missing but discount_pct exists
    if not old_price and discount_pct and 0 < discount_pct < 100:
        old_price = round(new_price / (1 - discount_pct / 100), 2)
    
    # Recalculate discount_pct if we have both prices
    if new_price and old_price and old_price > new_price:
        discount_pct = int(round((1 - new_price / old_price) * 100))

    category = detect_category(name)
    junk = is_junk(name)
    food = is_food(name)
    healthy = is_healthy(name)
    
    processed = is_processed_meat(name)

    # Precise Health Score (only for food)
    health_score = None
    if food:
        if junk:
            health_score = random.randint(1, 3)
        elif processed:
            health_score = random.randint(3, 4)
        else:
            health_score = get_health_score(name)
            name_low = name.lower()
            if "яйц" in name_low or "пиле" in name_low or "риба" in name_low:
                health_score = max(health_score, 9)
            elif "скир" in name_low or "извара" in name_low:
                health_score = max(health_score, 8)
            elif "пуешк" in name_low or "телешк" in name_low or "говежд" in name_low:
                health_score = max(health_score, 8)
    
    # Precise Macros only for core healthy foods
    macros = None
    if food and healthy:
        macros = get_macros(name)
    
    diet_tags = get_diet_tags(name) if healthy else []

    # price_per_kg calculation uses weight_grams parsed at the start
    price_per_kg = None
    if weight_grams and weight_grams > 0:
        price_per_kg = round(new_price / weight_grams * 1000, 2)

    if healthy and price_per_kg and price_per_kg <= 8 and "budget" not in diet_tags:
        diet_tags.append("budget")

    if discount_pct is None and old_price and old_price > new_price:
        discount_pct = round((1 - new_price / old_price) * 100)

    shelf_life = SHELF_LIFE_MAP.get(category)
    bulk_worthy = category in BULK_CATEGORIES and healthy
    is_long_lasting = shelf_life is not None and shelf_life != "малотраен"

    return {
        "id": generate_id(store_name, name),
        "store": store_name,
        "address": address,
        "name": name,
        "emoji": EMOJI_MAP.get(category, "🛒"),
        "category": category,
        "new_price": new_price,
        "new_price_eur": bgn_to_eur(new_price),
        "old_price": old_price,
        "old_price_eur": bgn_to_eur(old_price),
        "discount_pct": discount_pct,
        "valid_until": valid_until,
        "weight_raw": weight_raw,
        "weight_grams": weight_grams,
        "price_per_kg": price_per_kg,
        "price_per_kg_eur": bgn_to_eur(price_per_kg),
        "shelf_life": shelf_life,
        "is_food": food,
        "is_healthy": healthy,
        "is_bulk_worthy": bulk_worthy,
        "is_long_lasting": is_long_lasting,
        "health_score": health_score if food else None,
        "diet_tags": diet_tags,
        "macros": macros,
        "is_junk": junk,
        "image": image_url,
    }


def reclassify_offer(offer):
    name = offer["name"]
    category = detect_category(name)
    junk = is_junk(name)
    food = is_food(name)
    healthy = is_healthy(name)
    processed = is_processed_meat(name)

    health_score = None
    if food:
        if junk:
            health_score = random.randint(1, 3)
        elif processed:
            health_score = random.randint(3, 4)
        else:
            health_score = get_health_score(name)
            name_low = name.lower()
            if "яйц" in name_low or "пиле" in name_low or "риба" in name_low:
                health_score = max(health_score, 9)
            elif "скир" in name_low or "извара" in name_low:
                health_score = max(health_score, 8)
            elif "пуешк" in name_low or "телешк" in name_low or "говежд" in name_low:
                health_score = max(health_score, 8)

    macros = get_macros(name) if food and healthy else None
    diet_tags = get_diet_tags(name) if healthy else []

    # Already parsed if possible
    weight_raw, weight_grams = parse_weight(name)
    price_per_kg = None
    if weight_grams and weight_grams > 0 and offer.get("new_price") is not None:
        price_per_kg = round(offer["new_price"] / weight_grams * 1000, 2)

    if healthy and price_per_kg and price_per_kg <= 8 and "budget" not in diet_tags:
        diet_tags.append("budget")

    shelf_life = SHELF_LIFE_MAP.get(category)
    offer["emoji"] = EMOJI_MAP.get(category, "🛒")
    offer["category"] = category
    offer["weight_raw"] = weight_raw
    offer["weight_grams"] = weight_grams
    offer["price_per_kg"] = price_per_kg
    offer["new_price_eur"] = bgn_to_eur(offer.get("new_price"))
    offer["old_price_eur"] = bgn_to_eur(offer.get("old_price"))
    offer["price_per_kg_eur"] = bgn_to_eur(price_per_kg)
    offer["shelf_life"] = shelf_life
    offer["is_food"] = food
    offer["is_healthy"] = healthy
    offer["is_bulk_worthy"] = category in BULK_CATEGORIES and healthy
    offer["is_long_lasting"] = shelf_life is not None and shelf_life != "малотраен"
    offer["health_score"] = health_score if food else None
    offer["diet_tags"] = diet_tags
    offer["macros"] = macros
    offer["is_junk"] = junk
    offer.pop("macros_source", None)
    offer.pop("nutriscore", None)
    return offer


def postprocess_offers(store_results):
    best_by_name_store = {}
    for result in store_results:
        if not result or "offers" not in result:
            continue
        for offer in result["offers"]:
            key = (offer["name"].lower().strip(), offer["store"])
            existing = best_by_name_store.get(key)
            if existing is None or offer["new_price"] < existing["new_price"]:
                best_by_name_store[key] = offer

    best_by_name = {}
    available_by_name = {}
    for offer in best_by_name_store.values():
        normalized_name = offer["name"].lower().strip()
        available_by_name.setdefault(normalized_name, set()).add(offer["store"])

        existing = best_by_name.get(normalized_name)
        if existing is None or offer["new_price"] < existing["new_price"]:
            best_by_name[normalized_name] = offer

    all_offers = []
    for normalized_name, offer in best_by_name.items():
        offer["available_stores"] = sorted(available_by_name[normalized_name])
        all_offers.append(reclassify_offer(offer))

    all_offers.sort(key=lambda o: (-(o["health_score"] or 0), o["new_price"]))
    return all_offers


def build_all_products_export(store_results):
    best_by_name_store = {}
    for result in store_results:
        if not result or "offers" not in result:
            continue
        for offer in result["offers"]:
            key = (offer["name"].lower().strip(), offer["store"])
            existing = best_by_name_store.get(key)
            if existing is None or offer["new_price"] < existing["new_price"]:
                best_by_name_store[key] = offer

    all_products = [reclassify_offer(dict(offer)) for offer in best_by_name_store.values()]
    all_products.sort(key=lambda o: (o["store"], -(o["health_score"] or 0), o["new_price"], o["name"]))
    return all_products


def build_brochures_export(store_results):
    brochures = []
    for result in store_results:
        if result:
            brochures.extend(result.get("active_brochures", []))
    brochures.sort(key=lambda b: (b["store"], b["valid_until"] or "9999-12-31", b["title"]))
    return {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "total_brochures": len(brochures),
        "stores": sorted({b["store"] for b in brochures}),
        "brochures": brochures,
    }


def write_export(json_path, js_const_name, output):
    json_path.parent.mkdir(parents=True, exist_ok=True)
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    js_path = json_path.with_suffix(".js")
    with open(js_path, "w", encoding="utf-8") as f:
        f.write(f"const {js_const_name} = ")
        json.dump(output, f, ensure_ascii=False, indent=2)
        f.write(";")


def backup_existing_exports():
    timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    backup_dir = DATA_DIR / "backups" / timestamp
    backup_dir.mkdir(parents=True, exist_ok=True)
    for path in [OUTPUT_PATH, ALL_PRODUCTS_PATH, BROCHURES_PATH]:
        if path.exists():
            shutil.copy2(path, backup_dir / path.name)
        js_path = path.with_suffix(".js")
        if js_path.exists():
            shutil.copy2(js_path, backup_dir / js_path.name)
    return backup_dir


# --- Extraction from listing HTML ---
def parse_listing_items(soup, store_name):
    """Parse products from ul.list-offer-minor items (has prices in HTML)."""
    offers = []
    for li in soup.select("ul.list-offer-minor > li"):
        a_tag = li.find("a", href=re.compile(r"/p/"))
        if not a_tag:
            continue

        name = a_tag.get("title", "").strip()
        if not name:
            name_el = a_tag.select_one(".title-offer-minor")
            if name_el:
                name = name_el.get_text(strip=True)
        if not name:
            continue

        new_price = None
        ins_el = a_tag.select_one("ins.text-offer-price-actual")
        if ins_el:
            new_price = extract_bgn_price(ins_el.get_text(strip=True))
        if not new_price:
            continue

        old_price = None
        del_el = a_tag.select_one("del.text-offer-price-expired")
        if del_el:
            old_price = extract_bgn_price(del_el.get_text(strip=True))

        discount_pct = None
        disc_el = a_tag.select_one(".text-badge-discount span")
        if disc_el:
            disc_match = re.search(r'-?(\d+)%', disc_el.get_text(strip=True))
            if disc_match:
                discount_pct = int(disc_match.group(1))

        image_url = get_best_image(a_tag.find("img"))

        offers.append(build_offer(name, new_price, old_price, discount_pct, image_url, store_name, address=None))

    return offers


def collect_product_urls(soup):
    """Collect all unique /p/ URLs from a page."""
    urls = {}  # url -> {title, image}
    for a_tag in soup.find_all("a", href=re.compile(r"/p/")):
        href = a_tag.get("href", "")
        if href.startswith("/"):
            href = BASE_URL + href
        if href not in urls:
            title = a_tag.get("title", "").strip()
            img = get_best_image(a_tag.find("img"))
            urls[href] = {"title": title, "image": img}
    return urls


# --- JSON-LD extraction from /p/ pages ---
async def scrape_product_page(context, url, title_hint, image_hint, store_name, semaphore):
    """Scrape a single /p/ page for JSON-LD data."""
    async with semaphore:
        await polite_delay()
        page = await context.new_page()
        try:
            content = await goto_with_retry(page, url, wait_until="domcontentloaded", timeout=PAGE_TIMEOUT)
            soup = BeautifulSoup(content, "html.parser")

            # Name
            name = title_hint
            if not name:
                h1 = soup.select_one("h1")
                if h1:
                    name = h1.get_text(strip=True)
            if not name:
                return None

            new_price = None
            old_price = None
            image_url = image_hint
            valid_until = None

            # JSON-LD
            for s in soup.find_all('script', type='application/ld+json'):
                try:
                    data = json.loads(s.string)
                    if isinstance(data, dict) and data.get('@type') == 'Product':
                        offers = data.get('offers')
                        if isinstance(offers, dict):
                            new_price = offers.get('price')
                            valid_until = offers.get('priceValidUntil')
                        elif isinstance(offers, list) and offers:
                            new_price = offers[0].get('price')
                            valid_until = offers[0].get('priceValidUntil')

                        if not image_url:
                            img = data.get('image')
                            image_url = img[0] if isinstance(img, list) and img else img

                        if new_price:
                            break
                except Exception:
                    continue

            # Fallback image
            if not image_url:
                og = soup.find("meta", property="og:image")
                if og:
                    image_url = og.get("content")

            # Fallback price from HTML
            if not new_price:
                ins_el = soup.select_one("ins.text-offer-price-actual")
                if ins_el:
                    new_price = extract_bgn_price(ins_el.get_text(strip=True))
            if not new_price:
                price_box = soup.select_one(".list-product-price")
                if price_box:
                    dd = price_box.find("dd")
                    text = dd.get_text(strip=True) if dd else price_box.get_text(strip=True)
                    new_price = extract_bgn_price(text)

            if not new_price:
                return None

            try:
                new_price = round(float(str(new_price).replace(",", ".")), 2)
            except (ValueError, TypeError):
                return None

            # Old price
            del_el = soup.select_one("del.text-offer-price-expired")
            if del_el:
                old_price = extract_bgn_price(del_el.get_text(strip=True))

            # Discount
            discount_pct = None
            disc_el = soup.select_one(".text-badge-discount span")
            if disc_el:
                m = re.search(r'-?(\d+)%', disc_el.get_text(strip=True))
                if m:
                    discount_pct = int(m.group(1))

            # Format valid_until
            if valid_until:
                try:
                    dt = datetime.fromisoformat(valid_until.replace("Z", "+00:00"))
                    valid_until = dt.strftime("%Y-%m-%d")
                except Exception:
                    valid_until = str(valid_until)[:10]

            return build_offer(name, new_price, old_price, discount_pct, image_url, store_name, valid_until, address=None)

        except Exception as e:
            print(f"    [!] Error: {url}: {e}")
            return None
        finally:
            await page.close()


def run_ocr_fallback(store_name, structured_offers, active_brochures):
    """
    Run the OCR fallback for a store if it's supported.
    """
    supported_stores = ["Kaufland", "Lidl", "Fantastico", "Billa"]
    if store_name not in supported_stores or not active_brochures:
        return structured_offers

    print(f"  [*] Running AGGRESSIVE OCR fallback for {store_name} (Pages 2-40)...")
    
    # We take the first active brochure
    brochure_url = active_brochures[0]["url"]
    
    # Create temporary files for the merge process
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir)
        offers_json = tmp_path / "structured_offers.json"
        ocr_json = tmp_path / "ocr_candidates.json"
        merged_json = tmp_path / "merged_output.json"
        
        # Save current structured offers to a temporary JSON
        with open(offers_json, "w", encoding="utf-8") as f:
            json.dump({"offers": structured_offers}, f, ensure_ascii=False, indent=2)
            
        # Run hybrid_brochure_merge.py
        merge_script = Path(__file__).parent / "hybrid_brochure_merge.py"
        try:
            # AGGRESSIVE: Scan pages 2 to 40 (covers almost any brochure fully)
            pages = [str(i) for i in range(2, 41)]
            cmd = [
                sys.executable, str(merge_script),
                "--brochure-url", brochure_url,
                "--store", store_name,
                "--pages"
            ] + pages + [
                "--offers-json", str(offers_json),
                "--ocr-json-out", str(ocr_json),
                "--output-json", str(merged_json)
            ]
            subprocess.run(cmd, check=True)
            
            # Load merged results
            if merged_json.exists():
                with open(merged_json, "r", encoding="utf-8") as f:
                    merged_data = json.load(f)
                    new_offers = merged_data.get("offers", [])
                    print(f"  [*] OCR Fallback finished: {len(new_offers)} total offers (added {len(new_offers) - len(structured_offers)} candidates)")
                    return new_offers
        except Exception as e:
            print(f"  [!] OCR Fallback failed: {e}")
            
    return structured_offers


# --- Store scraping ---
async def scrape_store(browser, store_url, store_semaphore):
    """Scrape all products from a store using hybrid approach."""
    async with store_semaphore:
        store_name = detect_store(store_url)
        print(f"\n[*] === {store_name} === ({store_url})")

        context = await browser.new_context(
            user_agent=USER_AGENT,
            viewport={"width": 1920, "height": 1080},
            locale="bg-BG",
        )
        page_semaphore = asyncio.Semaphore(MAX_PAGES_PARALLEL)
        all_offers = []
        active_brochures = []
        seen_names = set()

        try:
            # --- Phase 1: Load store page, find /fl/ URLs, collect /p/ links ---
            page = await context.new_page()
            await page.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
            store_html = await goto_with_retry(page, store_url, wait_until="networkidle", timeout=PAGE_TIMEOUT)
            await polite_delay()

            # Scroll to reveal more products
            for _ in range(15):
                await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                await asyncio.sleep(1.0)
            store_html = await page.content()
            store_soup = BeautifulSoup(store_html, "html.parser")
            await page.close()

            active_brochures = extract_active_brochures(store_html, store_name)
            print(f"  [*] Active /b/ brochures: {len(active_brochures)}")

            # Find all /fl/ listing URLs
            fl_urls = extract_fl_urls(store_html)

            # Collect /p/ links from store page
            store_product_urls = collect_product_urls(store_soup)

            # --- Phase 2: Parse listing items from store page (if available) ---
            listing_offers = parse_listing_items(store_soup, store_name)
            for offer in listing_offers:
                if offer["name"] not in seen_names:
                    seen_names.add(offer["name"])
                    all_offers.append(offer)

            print(f"  [*] Store page: {len(store_product_urls)} /p/ links, {len(listing_offers)} listing items")

            # --- Phase 3: Load all /fl/ pages from all active brochures ---
            if fl_urls:
                brochure_count = 0
                brochure_pages = 0
                for fl_url in fl_urls:
                    await polite_delay()
                    page = await context.new_page()
                    try:
                        fl_html = await goto_with_retry(page, fl_url, wait_until="networkidle", timeout=PAGE_TIMEOUT)
                        await polite_delay()
                        fl_soup = BeautifulSoup(fl_html, "html.parser")
                    except Exception as e:
                        print(f"  [!] Brochure error: {fl_url}: {e}")
                        await page.close()
                        continue
                    finally:
                        if not page.is_closed():
                            await page.close()

                    brochure_count += 1
                    brochure_pages += 1

                    fl_listing = parse_listing_items(fl_soup, store_name)
                    for offer in fl_listing:
                        if offer["name"] not in seen_names:
                            seen_names.add(offer["name"])
                            all_offers.append(offer)

                    store_product_urls.update(collect_product_urls(fl_soup))

                    max_page = 1
                    page_matches = re.findall(r'page=(\d+)', fl_html)
                    if page_matches:
                        max_page = max(int(x) for x in page_matches)

                    for pg in range(2, max_page + 1):
                        await polite_delay()
                        page = await context.new_page()
                        try:
                            separator = "&" if "?" in fl_url else "?"
                            pg_html = await goto_with_retry(page, f"{fl_url}{separator}page={pg}", wait_until="domcontentloaded", timeout=PAGE_TIMEOUT)
                            await polite_delay()
                            pg_soup = BeautifulSoup(pg_html, "html.parser")

                            brochure_pages += 1
                            pg_listing = parse_listing_items(pg_soup, store_name)
                            for offer in pg_listing:
                                if offer["name"] not in seen_names:
                                    seen_names.add(offer["name"])
                                    all_offers.append(offer)

                            store_product_urls.update(collect_product_urls(pg_soup))
                        except Exception as e:
                            print(f"  [!] Brochure page {pg} error: {e}")
                        finally:
                            await page.close()

                print(f"  [*] /fl/ brochures: {brochure_count}, pages crawled: {brochure_pages}")

            # --- Phase 3b: Crawl Sofia regional pages for extra products ---
            flr_entries = []
            seen_flr_paths = set()
            for a_tag in store_soup.find_all("a", href=re.compile(r"/flr/")):
                href = a_tag.get("href", "")
                if not href or href in seen_flr_paths:
                    continue
                seen_flr_paths.add(href)
                flr_entries.append({
                    "href": href,
                    "text": " ".join(a_tag.stripped_strings),
                    "title": a_tag.get("title", "").strip(),
                })

            sofia_flr_entries = [
                entry for entry in flr_entries
                if is_sofia_region(entry["href"], entry["text"], entry["title"])
            ]
            flr_sample = sofia_flr_entries if sofia_flr_entries else flr_entries[:MAX_FLR_REGIONS]
            if flr_sample:
                if sofia_flr_entries:
                    print(f"  [*] Crawling {len(flr_sample)} Sofia regional page(s)...")
                else:
                    print(f"  [*] No Sofia regional page found; crawling {len(flr_sample)}/{len(flr_entries)} fallback regional pages...")
                for flr_entry in flr_sample:
                    await polite_delay()
                    flr_url = BASE_URL + flr_entry["href"]
                    page = await context.new_page()
                    try:
                        flr_html = await goto_with_retry(page, flr_url, wait_until="networkidle", timeout=PAGE_TIMEOUT)
                        await polite_delay()
                        flr_soup = BeautifulSoup(flr_html, "html.parser")

                        region_name = flr_entry.get("text") or flr_entry.get("title")

                        # Parse listing items
                        for li in flr_soup.select("ul.list-offer-minor > li"):
                            a_tag = li.find("a", href=re.compile(r"/p/"))
                            if not a_tag: continue
                            name = a_tag.get("title", "").strip() or a_tag.select_one(".title-offer-minor").get_text(strip=True)
                            if not name: continue
                            
                            new_price = None
                            ins_el = a_tag.select_one("ins.text-offer-price-actual")
                            if ins_el: new_price = extract_bgn_price(ins_el.get_text(strip=True))
                            if not new_price: continue

                            old_price = None
                            del_el = a_tag.select_one("del.text-offer-price-expired")
                            if del_el: old_price = extract_bgn_price(del_el.get_text(strip=True))

                            discount_pct = None
                            disc_el = a_tag.select_one(".text-badge-discount span")
                            if disc_el:
                                m = re.search(r'-?(\d+)%', disc_el.get_text(strip=True))
                                if m: discount_pct = int(m.group(1))

                            image_url = get_best_image(a_tag.find("img"))

                            if name not in seen_names:
                                seen_names.add(name)
                                all_offers.append(build_offer(name, new_price, old_price, discount_pct, image_url, store_name, address=region_name))

                        # Collect /p/ links
                        flr_urls = collect_product_urls(flr_soup)
                        store_product_urls.update(flr_urls)
                    except Exception:
                        pass
                    finally:
                        await page.close()

                print(f"  [*] After regional: {len(store_product_urls)} unique /p/ links")

            # --- Phase 4: Scrape /p/ pages for ALL products not yet extracted ---
            remaining_urls = []
            for url, meta in store_product_urls.items():
                title = meta["title"]
                if title and title not in seen_names:
                    remaining_urls.append((url, meta))

            if remaining_urls:
                print(f"  [*] Scraping {len(remaining_urls)} additional /p/ pages...")
                tasks = [
                    scrape_product_page(context, url, meta["title"], meta["image"], store_name, page_semaphore)
                    for url, meta in remaining_urls
                ]
                results = await asyncio.gather(*tasks)
                for offer in results:
                    if offer and offer["name"] not in seen_names:
                        seen_names.add(offer["name"])
                        all_offers.append(offer)

        except Exception as e:
            print(f"  [!] Fatal error for {store_name}: {e}")
        finally:
            await context.close()

        healthy_count = sum(1 for o in all_offers if o["is_healthy"])
        print(f"  [*] {store_name}: {len(all_offers)} total ({healthy_count} healthy)")

    # --- Phase 6: Run OCR fallback (if needed) ---
    supported_ocr_stores = ["Kaufland", "Lidl", "Fantastico", "Billa"]
    # Trigger OCR if we have very few offers, but for Billa/Lidl be even more aggressive
    ocr_threshold = 100
    if store_name in ["Billa", "Lidl", "Fantastico"]:
        ocr_threshold = 150 # Force OCR more often for these stores as they are trickier
        
    if store_name in supported_ocr_stores and len(all_offers) < ocr_threshold:
        all_offers = run_ocr_fallback(store_name, all_offers, active_brochures)

        return {
            "store": store_name,
            "offers": all_offers,
            "active_brochures": active_brochures,
        }


async def discover_store_urls(browser):
    context = await browser.new_context(user_agent=USER_AGENT)
    page = await context.new_page()
    store_urls = []
    try:
        print(f"[*] Discovering stores from {CATEGORY_URL}")
        content = await goto_with_retry(page, CATEGORY_URL, wait_until="domcontentloaded", timeout=PAGE_TIMEOUT)
        await asyncio.sleep(3)

        for match in re.findall(r'href="(/h/[^"#]+)"', content):
            url = BASE_URL + match
            if detect_store(url) != "Unknown" and url not in store_urls:
                store_urls.append(url)
    except Exception as e:
        print(f"[!] Discovery error: {e}")
    finally:
        await page.close()
        await context.close()
    return store_urls


FALLBACK_STORE_URLS = [
    f"{BASE_URL}/h/80669-lidl",
    f"{BASE_URL}/h/80550-kaufland",
    f"{BASE_URL}/h/80531-billa",
    f"{BASE_URL}/h/80524-fantastico",
    f"{BASE_URL}/h/80630-t-market",
    f"{BASE_URL}/h/94362-slaveks",
    f"{BASE_URL}/h/81345-stop4eto",
    f"{BASE_URL}/h/80701-cba-bolero",
    f"{BASE_URL}/h/80595-flora",
    f"{BASE_URL}/h/80698-life",
    f"{BASE_URL}/h/80711-hit",
]


async def main():
    started = datetime.utcnow()
    print("=" * 60)
    print("NutriLife Scraper (Playwright) — broshura.bg")
    print(f"Started at {started.strftime('%Y-%m-%d %H:%M:%S')} UTC")
    print("=" * 60)

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--disable-blink-features=AutomationControlled"],
        )

        # 1. Discover stores dynamically
        discovered_urls = await discover_store_urls(browser)
        
        # 2. Merge with fallback URLs to ensure we don't miss core stores
        store_urls = list(set(discovered_urls) | set(FALLBACK_STORE_URLS))
        
        # Filter: limit to known stores to avoid junk stores
        # store_urls = [u for u in store_urls if detect_store(u) != "Unknown"]
        
        # Target only the 5 main stores requested by the user
        target_stores = ["Lidl", "Kaufland", "Billa", "T-Market", "Fantastico"]
        store_urls = [u for u in store_urls if detect_store(u) in target_stores]

        print(f"[*] Scraping {len(store_urls)} target stores: {[detect_store(u) for u in store_urls]}")

        semaphore = asyncio.Semaphore(MAX_STORES_PARALLEL)
        tasks = [scrape_store(browser, url, semaphore) for url in store_urls]
        store_results = await asyncio.gather(*tasks)

        await browser.close()

    all_offers = postprocess_offers(store_results)
    all_products = build_all_products_export(store_results)
    brochures_output = build_brochures_export(store_results)

    if not all_offers and not all_products and not brochures_output["brochures"]:
        raise RuntimeError("Scrape produced no data; likely blocked by broshura.bg. Existing exports were not updated.")

    backup_dir = backup_existing_exports()

    output = {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "total_offers": len(all_offers),
        "stores": sorted({o["store"] for o in all_offers}),
        "offers": all_offers,
    }
    all_products_output = {
        "generated_at": output["generated_at"],
        "total_products": len(all_products),
        "stores": sorted({o["store"] for o in all_products}),
        "products": all_products,
    }

    write_export(OUTPUT_PATH, "OFFERS_DATA", output)
    write_export(ALL_PRODUCTS_PATH, "ALL_PRODUCTS_DATA", all_products_output)
    write_export(BROCHURES_PATH, "BROCHURES_DATA", brochures_output)

    elapsed = (datetime.utcnow() - started).total_seconds()
    healthy = [o for o in all_offers if o["is_healthy"]]
    food = [o for o in all_offers if o["is_food"]]
    stores_found = sorted({o["store"] for o in all_offers})

    print(f"\n{'=' * 60}")
    print(f"Done in {elapsed:.0f}s! {len(all_offers)} total offers")
    print(f"  Food: {len(food)} | Healthy: {len(healthy)} | Non-food: {len(all_offers) - len(food)}")
    print(f"  Stores: {', '.join(stores_found)}")
    print(f"  Saved to {OUTPUT_PATH}")
    print(f"  All products saved to {ALL_PRODUCTS_PATH}")
    print(f"  Active brochures saved to {BROCHURES_PATH}")
    print(f"  Backup saved to {backup_dir}")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    asyncio.run(main())
