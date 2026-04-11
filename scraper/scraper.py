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
import html
from datetime import datetime
from pathlib import Path

import requests
from playwright.async_api import async_playwright
from bs4 import BeautifulSoup

BASE_URL = "https://www.broshura.bg"
CATEGORY_URL = f"{BASE_URL}/i/3"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
DATA_DIR = Path(__file__).parent.parent / "data"
OUTPUT_PATH = DATA_DIR / "offers.json"
ALL_PRODUCTS_PATH = DATA_DIR / "all_products.json"
BROCHURES_PATH = DATA_DIR / "brochures.json"
LEARNING_PATH = DATA_DIR / "scraper_learning.json"
CUSTOM_KEYWORDS_PATH = DATA_DIR / "custom_keywords.json"
SCRAPER_STATS_PATH = DATA_DIR / "scraper_stats.json"
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
    # Eggs & poultry
    "яйц", "пилешк", "пиле", "пуешк", "патешк", "гъшк",
    # Red meat & offal
    "говежд", "свинск", "агнешк", "телешк", "заешк", "дивечов",
    "месо", "мляно", "филе", "кайма", "бут", "стек", "пържол", "ребра",
    "шунка", "кренвирш", "наденица", "салам", "луканка", "бекон", "карначе",
    # Fish & seafood
    "риба тон", "сьомга", "скумрия", "сельодка", "херинга",
    "риба", "скарида", "калмар", "октопод", "миди", "хайвер", "треска",
    "ципура", "лаврак", "пъстърва",
    # Dairy
    "кисело мляко", "мляко", "yogurt", "извара", "скир", "сирене",
    "кашкавал", "масло", "маскарпоне", "бри", "кефир", "айран",
    "едам", "гауда", "моцарела", "пармезан", "рикота", "халуми",
    "извара", "крема сирене", "cottage",
    # Grains & legumes
    "овес", "овесен", "леща", "боб", "нахут", "фасул", "мунг",
    "ориз", "хляб", "брашно", "макарон", "спагети", "фузили", "пене",
    "царевица", "грах", "киноа", "елда", "просо", "ечемик",
    "питка", "багет", "земел",
    # Nuts, seeds & fats
    "орех", "бадем", "кашу", "ядки", "зехтин", "olive",
    "фъстък", "лешник", "слънчоглед", "тиквено семе", "чиа",
    "кокос", "макадамия", "пекан", "тахан", "фъстъчено масло",
    # Vegetables
    "картоф", "морков", "домат", "краставиц",
    "спанак", "броколи", "зеленчук", "салат", "лук", "чесн",
    "чушк", "тиквичк", "зеле", "цвекло", "авокадо",
    "патладжан", "тиква", "аспержи", "праз", "репичк",
    "целина", "копър", "магданоз", "рукол", "маруля",
    "артишок", "гъб", "печурк", "манатарк",
    # Fruits
    "банан", "ябълк",
    "портокал", "лимон", "мандарин", "грозде", "ягод", "диня",
    "кайсия", "праскова", "слива", "вишн", "череш",
    "боровинк", "малин", "къпин", "нар",
    "киви", "ананас", "манго", "папая", "смокин", "фурм",
    "пъпеш", "круш",
    # Canned & preserved
    "консерв", "пюре", "сок", "маслин", "туна",
    # Other healthy items
    "мед", "кафе", "чай", "хумус",
    "протеин", "колаген", "гранол", "мюсли",
    "зехтин", "ленено масло", "кокосово масло",
    # General food markers
    "храна", "хран",
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
                 "патешк", "гъшк", "заешк", "дивечов",
                 "месо", "мляно", "филе", "кайма", "бут", "стек", "пържол", "ребра",
                 "шунка", "кренвирш", "наденица", "салам", "луканка", "бекон", "карначе",
                 "риба", "скарида", "калмар", "октопод", "миди", "хайвер", "треска",
                 "ципура", "лаврак", "пъстърва", "сельодка", "херинга"],
    "canned": ["риба тон", "сьомга", "скумрия", "консерв", "туна"],
    "grain": ["овес", "овесен", "ориз", "брашно", "макарон", "паста", "спагети",
              "фузили", "пене", "киноа", "елда", "просо", "ечемик", "мюсли", "гранол"],
    "bread": ["хляб", "багет", "земел", "питка", "фокача"],
    "legume": ["леща", "боб", "нахут", "фасул", "царевица", "грах", "мунг"],
    "dairy": ["кисело мляко", "мляко", "yogurt", "извара", "скир", "сирене",
              "кашкавал", "масло", "едам", "гауда", "моцарела", "пармезан",
              "маскарпоне", "бри", "кефир", "айран", "рикота", "халуми", "cottage"],
    "nuts": ["орех", "бадем", "кашу", "ядки", "фъстък", "лешник", "слънчоглед",
             "тиквено семе", "чиа", "кокос", "макадамия", "пекан",
             "тахан", "фъстъчено масло"],
    "fat": ["зехтин", "olive", "маслин", "ленено масло", "кокосово масло"],
    "vegetable": ["картоф", "банан", "ябълк", "морков", "домат", "краставиц",
                   "спанак", "броколи", "зеленчук", "салат", "лук", "чесн",
                   "чушк", "тиквичк", "зеле", "цвекло", "авокадо",
                   "патладжан", "тиква", "аспержи", "праз", "репичк",
                   "целина", "копър", "магданоз", "рукол", "маруля",
                   "артишок", "гъб", "печурк", "манатарк",
                   "портокал", "лимон", "мандарин", "грозде", "ягод", "диня",
                   "кайсия", "праскова", "слива", "вишн", "череш",
                   "боровинк", "малин", "къпин", "нар",
                   "киви", "ананас", "манго", "папая", "смокин", "фурм",
                   "пъпеш", "круш"],
}

HEALTH_SCORES = {
    10: ["риба тон", "зехтин", "сьомга", "лаврак", "ципура", "пъстърва", "треска"],
    9: ["яйц", "пилешк", "пиле", "леща", "боб", "нахут", "ядки", "орех", "бадем",
        "авокадо", "спанак", "броколи", "скумрия", "херинга", "сельодка",
        "киноа", "елда", "тахан", "хумус", "гъб", "манатарк",
        "боровинк", "малин", "нар"],
    8: ["овес", "овесен", "скир", "извара", "скарида", "калмар",
        "патешк", "пуешк", "заешк", "телешк", "говежд",
        "аспержи", "тиквичк", "чушк", "целина",
        "кайсия", "праскова", "слива", "череш", "киви"],
    7: ["кисело мляко", "сирене", "банан", "картоф", "агнешк",
        "морков", "домат", "краставиц", "лук", "зеле",
        "ягод", "диня", "грозде", "ябълк", "портокал", "мандарин"],
    6: ["ориз", "хляб", "свинск", "фасул", "царевица", "грах", "ечемик"],
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
    # Additional vegetables & greens
    "авокадо": {"kcal": 160, "p": 2, "f": 15, "c": 9},
    "патладжан": {"kcal": 25, "p": 1, "f": 0.2, "c": 6},
    "тиква": {"kcal": 26, "p": 1, "f": 0.1, "c": 7},
    "аспержи": {"kcal": 20, "p": 2.2, "f": 0.1, "c": 3.9},
    "праз": {"kcal": 61, "p": 1.5, "f": 0.3, "c": 14},
    "гъб": {"kcal": 22, "p": 3.1, "f": 0.3, "c": 3.3},
    "печурк": {"kcal": 22, "p": 3.1, "f": 0.3, "c": 3.3},
    "манатарк": {"kcal": 22, "p": 3.6, "f": 0.5, "c": 3.1},
    "целина": {"kcal": 16, "p": 0.7, "f": 0.2, "c": 3},
    "маруля": {"kcal": 15, "p": 1.4, "f": 0.2, "c": 2.9},
    "рукол": {"kcal": 25, "p": 2.6, "f": 0.7, "c": 3.7},
    # Additional fruits
    "кайсия": {"kcal": 48, "p": 1.4, "f": 0.4, "c": 11},
    "праскова": {"kcal": 39, "p": 0.9, "f": 0.3, "c": 10},
    "слива": {"kcal": 46, "p": 0.7, "f": 0.3, "c": 11},
    "вишн": {"kcal": 63, "p": 1.1, "f": 0.3, "c": 16},
    "череш": {"kcal": 63, "p": 1.1, "f": 0.3, "c": 16},
    "боровинк": {"kcal": 57, "p": 0.7, "f": 0.3, "c": 14},
    "малин": {"kcal": 52, "p": 1.2, "f": 0.7, "c": 12},
    "нар": {"kcal": 83, "p": 1.7, "f": 1.2, "c": 19},
    "киви": {"kcal": 61, "p": 1.1, "f": 0.5, "c": 15},
    "ананас": {"kcal": 50, "p": 0.5, "f": 0.1, "c": 13},
    "манго": {"kcal": 60, "p": 0.8, "f": 0.4, "c": 15},
    "круш": {"kcal": 57, "p": 0.4, "f": 0.1, "c": 15},
    "пъпеш": {"kcal": 34, "p": 0.8, "f": 0.2, "c": 8},
    # Grains & pseudo-grains
    "киноа": {"kcal": 368, "p": 14, "f": 6, "c": 64},
    "елда": {"kcal": 343, "p": 13, "f": 3.4, "c": 71},
    "ечемик": {"kcal": 354, "p": 12, "f": 2.3, "c": 73},
    "мюсли": {"kcal": 370, "p": 10, "f": 7, "c": 67},
    "гранол": {"kcal": 471, "p": 10, "f": 20, "c": 64},
    # Seeds & butters
    "тиквено семе": {"kcal": 559, "p": 30, "f": 49, "c": 11},
    "чиа": {"kcal": 486, "p": 17, "f": 31, "c": 42},
    "тахан": {"kcal": 595, "p": 17, "f": 54, "c": 21},
    "хумус": {"kcal": 177, "p": 8, "f": 10, "c": 20},
    # Fish
    "треска": {"kcal": 82, "p": 18, "f": 0.7, "c": 0},
    "лаврак": {"kcal": 97, "p": 18, "f": 2, "c": 0},
    "ципура": {"kcal": 96, "p": 19, "f": 2, "c": 0},
    "пъстърва": {"kcal": 119, "p": 20, "f": 3.5, "c": 0},
    "октопод": {"kcal": 82, "p": 15, "f": 1, "c": 2},
    # Dairy extras
    "кефир": {"kcal": 52, "p": 3.6, "f": 2.5, "c": 4.8},
    "айран": {"kcal": 36, "p": 3.1, "f": 1.6, "c": 2.5},
    "рикота": {"kcal": 174, "p": 11, "f": 13, "c": 3},
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
    # Pet food
    "храна за кучета", "храна за котки", "храна за куче", "храна за котка",
    "храна за домашни", "храна за животни", "храна за птици",
    # Furniture / household items
    "термочаш", "бюро", "одеяло", "възглавниц", "чанта",
    "матрак", "стол", "маса", "рафт", "шкаф", "лампа", "покривка",
    "диспенсър", "гардероб", "хладилник", "чаршаф", "спален комплект",
    "моп", "четка за", "лопатка", "съдомиялна", "миялна",
    # Cleaning & hygiene
    "препарат", "перилен", "омекотител", "почистващ", "прах за пране",
    "дезодорант", "шампоан", "душ гел", "сапун", "паста за зъби",
    "четка за зъби", "превръзки", "тампони", "дамски", "бебешки пелени",
    "таблетки за съдомиялна", "капсули", "прани",
    # Electronics / tools
    "батерии", "колонка", "bluetooth", "слушалки", "апарат за кръвно",
    "ножица за трева", "акумулаторна ножица", "термометър",
    # Clothing / accessories
    "тениска", "поло", "раница", "обувки", "спортни",
    # Alcohol
    "уиски", "джин", "ром", "водка", "коняк", "текила", "ликьор",
    "бира ", "бирени", " вино", "вина ", "розе ", "совиньон", "шардоне",
    # Candy / junk sweets (specific — не блокираме шоколадови продукти с мляко)
    "сладолед", "бонбони черноморец", "торта лешник",
    # Baby food / non-relevant
    "пелени", "биопюре", "бебешки",
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


def load_custom_keywords():
    """Load user-confirmed custom keywords from data/custom_keywords.json.
    Also auto-promotes any MACROS_DB keys missing from FOOD_KEYWORDS."""
    auto_added = []
    # Auto-promote MACROS_DB keys not in FOOD_KEYWORDS
    for kw in MACROS_DB:
        if kw not in FOOD_KEYWORDS:
            FOOD_KEYWORDS.append(kw)
            auto_added.append(kw)

    if CUSTOM_KEYWORDS_PATH.exists():
        try:
            data = json.loads(CUSTOM_KEYWORDS_PATH.read_text(encoding="utf-8"))
            for kw in data.get("food_keywords", []):
                if kw and kw not in FOOD_KEYWORDS:
                    FOOD_KEYWORDS.append(kw)
                    auto_added.append(kw)
            for kw in data.get("not_food_keywords", []):
                if kw and kw not in NOT_FOOD_KEYWORDS:
                    NOT_FOOD_KEYWORDS.append(kw)
        except Exception as e:
            print(f"[!] Could not load custom_keywords.json: {e}")

    if auto_added:
        print(f"[*] Learning: auto-loaded {len(auto_added)} extra food keywords: {auto_added[:10]}{'...' if len(auto_added) > 10 else ''}")


def analyze_and_save_learning(all_store_results, run_stats):
    """After a run: find uncategorized/unrecognized food-like products,
    suggest new keywords, update learning history, auto-promote frequent candidates."""
    today = datetime.utcnow().isoformat() + "Z"

    # Collect all offer names and their categories
    uncategorized = {}  # name -> {stores, count}
    for result in all_store_results:
        if not result or "offers" not in result:
            continue
        store = result["store"]
        for offer in result["offers"]:
            name = offer.get("name", "")
            cat = offer.get("category", "other")
            if cat == "other" and offer.get("is_food"):
                key = name.lower().strip()
                if key not in uncategorized:
                    uncategorized[key] = {"name": name, "count": 0, "stores": []}
                uncategorized[key]["count"] += 1
                if store not in uncategorized[key]["stores"]:
                    uncategorized[key]["stores"].append(store)

    # Load existing learning data
    learning = {"version": 2, "runs": [], "candidates": {}, "auto_promoted": [], "suggested_keywords": []}
    if LEARNING_PATH.exists():
        try:
            learning = json.loads(LEARNING_PATH.read_text(encoding="utf-8"))
            # Migrate v1 to v2
            if "uncategorized_products" in learning:
                learning["candidates"] = learning.pop("uncategorized_products")
            learning.setdefault("version", 2)
            learning.setdefault("candidates", {})
            learning.setdefault("auto_promoted", [])
            learning.setdefault("suggested_keywords", [])
        except Exception:
            pass

    # Merge uncategorized products into candidates
    for key, info in uncategorized.items():
        if key not in learning["candidates"]:
            learning["candidates"][key] = {"name": info["name"], "count": 0, "stores": [], "last_seen": today}
        entry = learning["candidates"][key]
        entry["count"] += info["count"]
        entry["last_seen"] = today
        for s in info["stores"]:
            if s not in entry["stores"]:
                entry["stores"].append(s)

    # Auto-promote candidates seen in 2+ different stores or 3+ times
    new_auto = []
    custom = {"food_keywords": [], "not_food_keywords": []}
    if CUSTOM_KEYWORDS_PATH.exists():
        try:
            custom = json.loads(CUSTOM_KEYWORDS_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass
    all_known = set(FOOD_KEYWORDS) | set(learning["auto_promoted"]) | set(custom.get("food_keywords", []))

    for key, entry in learning["candidates"].items():
        # Only promote short single-word Bulgarian candidates (avoid garbage OCR)
        words = key.split()
        if len(words) > 3:
            continue
        # Must appear multiple times
        if entry["count"] >= 3 or len(entry["stores"]) >= 2:
            # Extract the shortest meaningful Bulgarian token
            for word in sorted(words, key=len, reverse=True):
                if len(word) >= 4 and re.match(r'^[а-яА-ЯёЁ]+$', word):
                    stem = word[:min(len(word), 6)]  # Use stem
                    if stem not in all_known and stem not in new_auto:
                        new_auto.append(stem)
                        all_known.add(stem)
                        break

    if new_auto:
        learning["auto_promoted"].extend(new_auto)
        custom["food_keywords"] = list(set(custom.get("food_keywords", []) + new_auto))
        try:
            CUSTOM_KEYWORDS_PATH.write_text(
                json.dumps(custom, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            print(f"[*] Learning: auto-promoted {len(new_auto)} new keywords -> custom_keywords.json: {new_auto}")
        except Exception as e:
            print(f"[!] Could not save custom_keywords.json: {e}")

    # Save run entry
    learning["runs"].append({
        "date": today,
        **run_stats,
        "uncategorized_new": len(uncategorized),
        "auto_promoted_this_run": new_auto,
    })
    # Keep only last 50 runs
    learning["runs"] = learning["runs"][-50:]

    try:
        LEARNING_PATH.write_text(json.dumps(learning, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"[*] Learning data saved -> {LEARNING_PATH.name} ({len(learning['candidates'])} candidates total)")
    except Exception as e:
        print(f"[!] Could not save learning data: {e}")


def save_run_stats(run_stats, all_offers):
    """Save detailed per-run progress report to data/scraper_stats.json."""
    history = []
    if SCRAPER_STATS_PATH.exists():
        try:
            history = json.loads(SCRAPER_STATS_PATH.read_text(encoding="utf-8"))
            if not isinstance(history, list):
                history = []
        except Exception:
            pass

    # Category breakdown
    cats = {}
    for o in all_offers:
        cat = o.get("category", "other")
        cats[cat] = cats.get(cat, 0) + 1

    entry = {
        **run_stats,
        "category_breakdown": cats,
        "top_healthy": [
            {"name": o["name"], "store": o["store"], "health_score": o.get("health_score")}
            for o in sorted(all_offers, key=lambda x: -(x.get("health_score") or 0))[:10]
            if o.get("is_healthy")
        ],
    }
    history.append(entry)
    history = history[-100:]  # Keep last 100 runs

    try:
        SCRAPER_STATS_PATH.write_text(json.dumps(history, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"[*] Run stats saved -> {SCRAPER_STATS_PATH.name}")
    except Exception as e:
        print(f"[!] Could not save run stats: {e}")


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


def run_pdf_scraper_for_kaufland(structured_offers):
    """
    Run the Kaufland PDF scraper and merge results with structured offers.
    Uses publicly available PDF brochures from kaufland.bg/broshuri.html.
    No rate limiting — PDFs are on public S3 storage.
    """
    import time as _time
    t0 = _time.perf_counter()
    try:
        sys.path.insert(0, str(Path(__file__).parent))
        from kaufland_pdf_scraper import scrape_kaufland_pdfs
        pdf_offers = scrape_kaufland_pdfs()
        elapsed = _time.perf_counter() - t0
        if not pdf_offers:
            print(f"  [*] Kaufland PDF: no offers extracted ({elapsed:.0f}s)", flush=True)
            return structured_offers

        food_count = sum(1 for o in pdf_offers if o.get("is_food"))
        healthy_count = sum(1 for o in pdf_offers if o.get("is_healthy"))
        print(f"  [*] Kaufland PDF done: {len(pdf_offers)} offers | "
              f"food={food_count} | healthy={healthy_count} | {elapsed:.0f}s", flush=True)

        # Merge: prefer structured offers, add PDF offers not already present
        seen_names = {o["name"].lower().strip() for o in structured_offers}
        added = 0
        for offer in pdf_offers:
            name_key = offer.get("name", "").lower().strip()
            if name_key and name_key not in seen_names:
                seen_names.add(name_key)
                structured_offers.append(offer)
                added += 1
        print(f"  [*] Kaufland PDF merge: +{added} new | {len(structured_offers)} total Kaufland offers", flush=True)
    except Exception as e:
        import traceback
        print(f"  [!] Kaufland PDF scraper failed: {e}", flush=True)
        traceback.print_exc()
    return structured_offers


def run_ocr_fallback(store_name, structured_offers, active_brochures):
    supported_stores = ["Kaufland", "Lidl", "Fantastico", "Billa"]
    if store_name not in supported_stores or not active_brochures:
        return structured_offers

    def brochure_page_count(brochure):
        brochure_url = brochure.get("url")
        if not brochure_url:
            return 0

        try:
            cache_dir = Path(__file__).parent.parent / "data" / "brochure_cache"
            cache_dir.mkdir(parents=True, exist_ok=True)
            url_hash = hashlib.md5(brochure_url.encode()).hexdigest()
            cache_path = cache_dir / f"{url_hash}.json"

            if cache_path.exists():
                with open(cache_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
            else:
                response = requests.get(
                    brochure_url,
                    headers={"User-Agent": USER_AGENT},
                    timeout=30,
                )
                response.raise_for_status()
                soup = BeautifulSoup(response.text, "html.parser")
                brochure_tag = soup.find(attrs={"data-brochure": True})
                if brochure_tag is None:
                    return 0
                data = json.loads(html.unescape(brochure_tag["data-brochure"]))
                with open(cache_path, "w", encoding="utf-8") as f:
                    json.dump(data, f, ensure_ascii=False)

            return int(data.get("pageResult", {}).get("total", 0))
        except Exception as e:
            print(f"  [!] Could not inspect brochure pages for OCR fallback: {brochure_url}: {e}", flush=True)
            return 0

    brochures_with_pages = []
    for brochure in active_brochures:
        page_count = brochure_page_count(brochure)
        brochures_with_pages.append((brochure, page_count))

    brochures_with_pages.sort(
        key=lambda item: (
            item[1],
            item[0].get("valid_until") or "",
            item[0].get("title") or "",
        ),
        reverse=True,
    )

    selected_brochure = brochures_with_pages[0][0]
    selected_page_count = brochures_with_pages[0][1]
    brochure_url = selected_brochure["url"]

    MAX_OCR_PAGES = 20
    last_page = min(selected_page_count, MAX_OCR_PAGES + 1)
    if last_page < 2:
        print(f"  [!] OCR fallback skipped for {store_name}: brochure has only {selected_page_count} page(s)", flush=True)
        return structured_offers

    pages = [str(i) for i in range(2, last_page + 1)]

    print(
        f"  [*] OCR fallback for {store_name} — selected brochure with {selected_page_count} pages: {brochure_url}",
        flush=True,
    )
    print(
        f"  [*] OCR fallback for {store_name} — pages 2-{last_page} ({len(pages)} pages)...",
        flush=True,
    )

    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir)
        offers_json = tmp_path / "structured_offers.json"
        ocr_json = tmp_path / "ocr_candidates.json"
        merged_json = tmp_path / "merged_output.json"

        with open(offers_json, "w", encoding="utf-8") as f:
            json.dump({"offers": structured_offers}, f, ensure_ascii=False, indent=2)

        merge_script = Path(__file__).parent / "hybrid_brochure_merge.py"
        try:
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

            if merged_json.exists():
                with open(merged_json, "r", encoding="utf-8") as f:
                    merged_data = json.load(f)
                    new_offers = merged_data.get("offers", [])
                    added = len(new_offers) - len(structured_offers)
                    print(f"  [*] OCR fallback done: {len(new_offers)} total offers (+{added} from OCR)", flush=True)
                    return new_offers
        except Exception as e:
            print(f"  [!] OCR fallback failed: {e}", flush=True)

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

        # Pre-load brochure URLs from cached brochures.json as fallback
        # (used if Playwright is blocked and active_brochures stays empty)
        cached_brochures_for_store = []
        if BROCHURES_PATH.exists():
            try:
                cached = json.loads(BROCHURES_PATH.read_text(encoding="utf-8"))
                store_name_early = detect_store(store_url)
                cached_brochures_for_store = [
                    b for b in cached.get("brochures", [])
                    if b.get("store") == store_name_early and b.get("is_active")
                ]
                if cached_brochures_for_store:
                    print(f"  [*] Pre-loaded {len(cached_brochures_for_store)} cached brochure URL(s) for {store_name_early}")
            except Exception:
                pass

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
        print(f"  [*] {store_name}: {len(all_offers)} total ({healthy_count} healthy)", flush=True)

    # --- Phase 6a: Kaufland PDF scraper (direct from kaufland.bg — no rate limiting) ---
    if store_name == "Kaufland":
        print(f"  [*] Kaufland PDF phase starting...", flush=True)
        all_offers = run_pdf_scraper_for_kaufland(all_offers)
        print(f"  [*] Kaufland after PDF: {len(all_offers)} total", flush=True)

    # --- Phase 6b: OCR fallback from broshura.bg brochure images ---
    # If Playwright was blocked and active_brochures is empty, use cached URLs as fallback
    supported_ocr_stores = ["Kaufland", "Lidl", "Fantastico", "Billa"]
    if not active_brochures and cached_brochures_for_store:
        print(f"  [*] Playwright blocked — using cached brochure URLs for OCR")
        active_brochures = cached_brochures_for_store
    if store_name in supported_ocr_stores and active_brochures:
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

    # Load learned + custom keywords before scraping
    load_custom_keywords()
    print(f"[*] Active food keywords: {len(FOOD_KEYWORDS)}")

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
        
        # Target all known stores (expanded from original 5)
        target_stores = [
            "Lidl", "Kaufland", "Billa", "T-Market", "Fantastico",
            "CBA", "Slaveks", "STOP4ETO", "Flora", "Life", "HIT", "Metro", "Penny", "Piccadilly",
        ]
        store_urls = [u for u in store_urls if detect_store(u) in target_stores]

        print(f"[*] Scraping {len(store_urls)} stores: {[detect_store(u) for u in store_urls]}")

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

    # Per-store breakdown
    by_store = {}
    ocr_by_store = {}
    for result in store_results:
        if not result:
            continue
        s = result["store"]
        offers_s = result.get("offers", [])
        by_store[s] = len(offers_s)
        # OCR adds are inferred — count offers with no image (typical for OCR-sourced)
        ocr_count = sum(1 for o in offers_s if o.get("source") == "ocr")
        if ocr_count:
            ocr_by_store[s] = ocr_count

    run_stats = {
        "date": datetime.utcnow().isoformat() + "Z",
        "elapsed_seconds": round(elapsed),
        "total_offers": len(all_offers),
        "food_offers": len(food),
        "healthy_offers": len(healthy),
        "stores_scraped": stores_found,
        "by_store": by_store,
        "ocr_by_store": ocr_by_store,
        "total_brochures": brochures_output["total_brochures"],
        "food_keywords_active": len(FOOD_KEYWORDS),
    }

    print(f"\n{'=' * 60}")
    print(f"ПРОГРЕС ДОКЛАД — NutriLife Scraper")
    print(f"{'=' * 60}")
    print(f"Готово за {elapsed:.0f}с | {len(all_offers)} оферти общо")
    print(f"  Храни: {len(food)} | Здравословни: {len(healthy)} | Некатегоризирани: {len(all_offers) - len(food)}")
    print(f"  Магазини: {', '.join(stores_found)}")
    print(f"\n  По магазин:")
    for store_name_k, count in sorted(by_store.items(), key=lambda x: -x[1]):
        ocr_note = f" (OCR: +{ocr_by_store[store_name_k]})" if store_name_k in ocr_by_store else ""
        print(f"    {store_name_k}: {count} оферти{ocr_note}")
    print(f"\n  Брошури: {brochures_output['total_brochures']} активни")
    print(f"  Активни ключови думи: {len(FOOD_KEYWORDS)}")
    print(f"\n  Записани файлове:")
    print(f"    {OUTPUT_PATH}")
    print(f"    {ALL_PRODUCTS_PATH}")
    print(f"    {BROCHURES_PATH}")
    print(f"    Backup: {backup_dir}")
    print(f"{'=' * 60}")

    # Save learning data and run statistics
    analyze_and_save_learning(store_results, run_stats)
    save_run_stats(run_stats, all_offers)


if __name__ == "__main__":
    asyncio.run(main())
