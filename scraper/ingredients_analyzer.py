"""
Ingredients analysis for NutriLife.
Detects harmful additives (E-numbers) and junk ingredients in product ingredient text.
"""

import re

# Known harmful/questionable additives keyed by lowercase E-number
# level: "red" = avoid, "amber" = questionable
HARMFUL_ADDITIVES = {
    # Azo dyes — linked to hyperactivity in children (UK "Southampton Six")
    "e102": ("Тартразин",                "red",   "Изкуствен оцветител — свързан с хиперактивност при деца"),
    "e104": ("Жълто хинолиново",         "amber", "Изкуствен оцветител"),
    "e110": ("Жълто залез FCF",          "red",   "Изкуствен оцветител — алергии, хиперактивност"),
    "e122": ("Азорубин/Кармоизин",       "red",   "Изкуствен оцветител"),
    "e123": ("Амарант",                  "red",   "Изкуствен оцветител — забранен в САЩ"),
    "e124": ("Понсо 4R",                 "red",   "Изкуствен оцветител — хиперактивност"),
    "e129": ("Алура червено AC",         "red",   "Изкуствен оцветител — хиперактивност при деца"),
    "e131": ("Патентно синьо V",         "amber", "Изкуствен оцветител"),
    "e133": ("Брилянтно синьо FCF",      "amber", "Изкуствен оцветител"),
    # Preservatives
    "e210": ("Бензоена киселина",        "red",   "Консервант — може да образува бензен с витамин C"),
    "e211": ("Натриев бензоат",          "red",   "Консервант — образува бензен с витамин C"),
    "e212": ("Калиев бензоат",           "red",   "Консервант — образува бензен с витамин C"),
    "e213": ("Калциев бензоат",          "red",   "Консервант — образува бензен с витамин C"),
    "e220": ("Серен диоксид",            "amber", "Консервант — дразнещ при астматици и алергични"),
    "e221": ("Натриев сулфит",           "amber", "Консервант — дразнещ при астматици"),
    "e250": ("Натриев нитрит",           "red",   "Консервант в месо — образува нитрозамини при готвене"),
    "e251": ("Натриев нитрат",           "amber", "Консервант в месо — превръща се в нитрит"),
    "e252": ("Калиев нитрат",            "amber", "Консервант в месо"),
    # Antioxidants
    "e320": ("BHA (Бутилхидроксианизол)","red",   "Антиоксидант — потенциален канцероген, ендокринен дисруптор"),
    "e321": ("BHT (Бутилхидрокситолуол)","amber", "Антиоксидант — спорен, ограничен в някои страни"),
    # Thickeners / stabilisers
    "e407": ("Карагенан",                "amber", "Стабилизатор — спорно въздействие върху чревната лигавица"),
    # Emulsifiers
    "e471": ("Моно- и диглицериди",      "amber", "Емулгатор — може да съдържа следи от трансмазнини"),
    "e472e": ("Диацетилтартарат",        "amber", "Емулгатор — промишлена добавка"),
    # Flavor enhancers
    "e621": ("Глутамат натрий (MSG)",    "amber", "Усилвател на вкус — спорен, чувствителност при някои хора"),
    "e627": ("Динатриев гуанилат",       "amber", "Усилвател на вкус — обикновено придружава MSG"),
    "e631": ("Динатриев инозинат",       "amber", "Усилвател на вкус — обикновено придружава MSG"),
    "e635": ("Динатриев рибонуклеотид",  "amber", "Усилвател на вкус"),
    # Artificial sweeteners
    "e950": ("Ацесулфам К",              "amber", "Изкуствен подсладител — спорни дългосрочни ефекти"),
    "e951": ("Аспартам",                 "amber", "Изкуствен подсладител — спорен, не се препоръчва при фенилкетонурия"),
    "e952": ("Цикламат",                 "red",   "Изкуствен подсладител — забранен в САЩ"),
    "e954": ("Захарин",                  "amber", "Изкуствен подсладител — исторически спорен"),
    "e955": ("Сукралоза",                "amber", "Изкуствен подсладител — влияе на чревната микробиота"),
    "e961": ("Неотам",                   "amber", "Изкуствен подсладител — производно на аспартам"),
}

# Non-E-number junk keywords: (Bulgarian/English substring, level, display_reason)
JUNK_KEYWORDS = [
    ("палмово масло",              "red",   "Палмово масло — наситени мазнини, влошава холестерола"),
    ("palm oil",                   "red",   "Палмово масло — наситени мазнини"),
    ("хидрогенирани мазнини",      "red",   "Трансмазнини — повишават LDL холестерола"),
    ("хидрогениран",               "red",   "Хидрогенирани мазнини — трансмазнини"),
    ("частично хидрогенирани",     "red",   "Трансмазнини — вредни за сърдечно-съдовата система"),
    ("partially hydrogenated",     "red",   "Трансмазнини"),
    ("глюкозо-фруктозен сироп",   "red",   "Добавена захар с висок гликемичен индекс"),
    ("high fructose corn syrup",   "red",   "Глюкозо-фруктозен сироп"),
    ("натриев глутамат",           "amber", "MSG — усилвател на вкус"),
    ("sodium glutamate",           "amber", "MSG — усилвател на вкус"),
    ("аспартам",                   "amber", "Изкуствен подсладител"),
    ("aspartame",                  "amber", "Изкуствен подсладител"),
    ("сукралоза",                  "amber", "Изкуствен подсладител"),
    ("sucralose",                  "amber", "Изкуствен подсладител"),
    ("ацесулфам",                  "amber", "Изкуствен подсладител"),
    ("acesulfame",                 "amber", "Изкуствен подсладител"),
]


def analyze_ingredients(raw_text: str) -> list[dict]:
    """
    Parse ingredient text and return a list of detected junk/additive flags.
    Each flag: {match, name, level, reason}
    level is "red" (avoid) or "amber" (questionable).
    Returns [] when raw_text is empty/None.
    """
    if not raw_text:
        return []

    text_lower = raw_text.lower()
    flags = []
    seen: set[str] = set()

    # Match E-numbers: E211, e 211, E-211, е211 (Cyrillic е is common typo)
    for m in re.finditer(r'\b[eеЕE][\s\-]?(\d{3,4}[a-z]?)\b', text_lower):
        key = f"e{m.group(1)}"
        if key in HARMFUL_ADDITIVES and key not in seen:
            seen.add(key)
            name, level, reason = HARMFUL_ADDITIVES[key]
            flags.append({"match": key.upper(), "name": name, "level": level, "reason": reason})

    # Match keyword junk
    for keyword, level, reason in JUNK_KEYWORDS:
        if keyword in text_lower and keyword not in seen:
            seen.add(keyword)
            display = keyword[0].upper() + keyword[1:]
            flags.append({"match": keyword, "name": display, "level": level, "reason": reason})

    # Sort: red first, then amber
    flags.sort(key=lambda f: 0 if f["level"] == "red" else 1)
    return flags
