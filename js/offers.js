/* ========================================
   NutriLife — Offers Logic
   ======================================== */

let allOffers = [];
let fuseIndex = null;
let activeType = "all";
let activeCategory = "all";
let activeStore = "all";
let activeSort = "recommended";
let searchQuery = "";
let currentPage = 1;
let filteredOffersCache = [];
let allCatalogProducts = [];
let liveFallbackByKeyword = new Map();  // keyword → real CDN image URL
let liveFallbackByCategory = new Map(); // category → real CDN image URL

const OFFERS_PER_PAGE = 36;
const PLACEHOLDER_IMAGE_MARKER = "No-Image-Placeholder.svg";

const PROCESSED_MEAT_KEYWORDS = [
    "шунка", "кренвирш", "наденица", "салам", "луканка", "бекон", "шпек", "карначе", "суджук",
    "пастърма", "сушено месо", "jerky", "колбас", "хамбурски", "камчия", "вакуум тандем"
];

const NON_HUMAN_FOOD_KEYWORDS = [
    "храна за кучета", "храна за куче", "храна за котки", "храна за котка",
    "консерва за кучета", "консерва за куче", "консерва за котки", "консерва за котка",
    "кучешка храна", "котешка храна", "pet food"
];

const NON_EDIBLE_PRODUCT_KEYWORDS = [
    "кърпи", "кърпички", "влажни кърпи", "влажни кърпички", "антибакт",
    "шампоан", "балсам", "сапун", "душ гел", "паста за зъби", "четка за зъби",
    "прах за пране", "омекотител", "препарат", "почистващ", "дезинфектант",
    "тоалетна хартия", "салфетки", "пелени", "дамски превръзки"
];

const ULTRA_PROCESSED_HEALTH_KEYWORDS = [
    "топено сирене"
];

const BASELINE_RECOMMENDATION_EXCLUDE_KEYWORDS = [
    "колбас", "хамбурски", "камчия", "салам", "кренвирш", "шпек", "луканка", "наденица"
];

const EXCLUDED_HEALTH_CATEGORIES = new Set(["pet", "hygiene", "household", "other"]);

const HYGIENE_CATEGORY_KEYWORDS = [
    "кърпи", "кърпички", "влажни", "сапун", "шампоан", "балсам", "душ гел",
    "паста за зъби", "четка за зъби", "дезодорант", "тоалетна хартия",
    "пелени", "дамски превръзки"
];

const HOUSEHOLD_CATEGORY_KEYWORDS = [
    "прах за пране", "омекотител", "препарат", "почистващ", "дезинфектант",
    "таблетки за съдомиялна", "веро", "белина"
];

const JUNK_FOOD_KEYWORDS = ["кроасан"];

const CURED_LEAN_MEAT_EXACT_NAMES = new Set(["елена"]);
const CURED_LEAN_MEAT_PHRASES = ["филе елена"];

const PROTEIN_VALUE_ALLOWED_CATEGORIES = new Set(["protein", "dairy", "legume", "canned"]);

const NON_PROTEIN_VALUE_KEYWORDS = [
    "брашно", "бутер", "ролца", "банич", "витрина", "кюфтет", "кебапчет",
    "кюфте", "панира", "хапки"
];

const EXACT_NON_FOOD_NAMES = new Set(["гъба"]);

const LOCAL_IMAGE_RULES = [
    // Meat & poultry (specific first)
    ["черен дроб", "images/foods/beef.svg"],
    ["агнешки дроб", "images/foods/beef.svg"],
    ["дроб комплект", "images/foods/beef.svg"],
    ["пилешки гърди", "images/foods/chicken.svg"],
    ["пилешко филе", "images/foods/chicken.svg"],
    ["пилешки бут", "images/foods/chicken-leg.svg"],
    ["пилешко бутче", "images/foods/chicken-leg.svg"],
    ["пуешко", "images/foods/turkey.svg"],
    ["кайма", "images/foods/mince.svg"],
    ["телешко", "images/foods/beef.svg"],
    ["говеждо", "images/foods/beef.svg"],
    ["свинско", "images/foods/pork.svg"],
    // Fish & seafood
    ["риба тон", "images/foods/tuna.svg"],
    ["сьомга", "images/foods/salmon.svg"],
    ["скумрия", "images/foods/mackerel.svg"],
    ["сардини", "images/foods/sardines.svg"],
    ["херинга", "images/foods/fatty-fish.svg"],
    ["сельодка", "images/foods/fatty-fish.svg"],
    ["пъстърва", "images/foods/fatty-fish.svg"],
    ["ципура", "images/foods/fatty-fish.svg"],
    ["лаврак", "images/foods/fatty-fish.svg"],
    // Eggs & dairy
    ["яйц", "images/foods/egg.svg"],
    ["извара", "images/foods/izvara.svg"],
    ["скир", "images/foods/skyr.svg"],
    ["skyr", "images/foods/skyr.svg"],
    ["cottage", "images/foods/cottage.svg"],
    ["тофу", "images/foods/tofu.svg"],
    ["кисело мляко", "images/foods/yogurt.svg"],
    ["сирене", "images/foods/cheese.svg"],
    ["маслин", "images/foods/olives.svg"],
    // Grains & pasta
    ["мюесли", "images/foods/muesli.svg"],
    ["мюсли", "images/foods/muesli.svg"],
    ["овесени ядки", "images/foods/oats.svg"],
    ["овес", "images/foods/oats.svg"],
    ["елда", "images/foods/buckwheat.svg"],
    ["булгур", "images/foods/bulgur.svg"],
    ["кускус", "images/foods/couscous.svg"],
    ["ориз", "images/foods/rice.svg"],
    ["спагет", "images/foods/pasta.svg"],
    ["паста", "images/foods/pasta.svg"],
    ["макарони", "images/foods/pasta.svg"],
    ["пене", "images/foods/pasta.svg"],
    ["фусили", "images/foods/pasta.svg"],
    ["ръжен хляб", "images/foods/rye-bread.svg"],
    ["хляб", "images/foods/bread.svg"],
    // Legumes
    ["леща", "images/foods/lentils.svg"],
    ["нахут", "images/foods/chickpeas.svg"],
    ["боб", "images/foods/beans.svg"],
    ["грах", "images/foods/peas.svg"],
    // Nuts, seeds & nut butters (specific first)
    ["фъстъчено масло", "images/foods/peanut-butter.svg"],
    ["тахан", "images/foods/tahini.svg"],
    ["ленено", "images/foods/flax.svg"],
    ["чиа", "images/foods/seeds.svg"],
    ["сусам", "images/foods/seeds.svg"],
    ["семена", "images/foods/seeds.svg"],
    ["бадем", "images/foods/almonds.svg"],
    ["орех", "images/foods/walnuts.svg"],
    ["фъст", "images/foods/peanuts.svg"],
    // Oils & fats
    ["зехтин", "images/foods/olive-oil.svg"],
    ["масло", "images/foods/butter.svg"],
    // Fruit & vegetables (specific first)
    ["авокад", "images/foods/avocado.svg"],
    ["банан", "images/foods/banana.svg"],
    ["ябъл", "images/foods/apple.svg"],
    ["сладк картоф", "images/foods/sweet-potato.svg"],
    ["картоф", "images/foods/potato.svg"],
    ["царевиц", "images/foods/corn.svg"],
    ["царевица", "images/foods/corn.svg"],
    // Generic fruit/veg fallback (anything else)
    ["домат", "images/foods/apple.svg"],
    ["краставиц", "images/foods/apple.svg"],
    ["чушк", "images/foods/apple.svg"],
    ["тиквичк", "images/foods/apple.svg"],
    ["патладж", "images/foods/apple.svg"],
    ["ягод", "images/foods/apple.svg"],
    ["праскова", "images/foods/apple.svg"],
    ["кайсия", "images/foods/apple.svg"],
    ["слива", "images/foods/apple.svg"],
    ["грозд", "images/foods/apple.svg"],
    ["диня", "images/foods/apple.svg"],
    ["пъпеш", "images/foods/apple.svg"],
    ["нар", "images/foods/apple.svg"],
    ["портокал", "images/foods/apple.svg"],
    ["лимон", "images/foods/apple.svg"],
    ["мандарин", "images/foods/apple.svg"],
    ["броколи", "images/foods/apple.svg"],
    ["карфиол", "images/foods/apple.svg"],
    ["спанак", "images/foods/apple.svg"],
    ["зел", "images/foods/apple.svg"],
    ["морков", "images/foods/apple.svg"],
];

const CATEGORY_FALLBACK_IMAGES = {
    protein: "images/foods/chicken.svg",
    dairy: "images/foods/yogurt.svg",
    grain: "images/foods/oats.svg",
    legume: "images/foods/lentils.svg",
    canned: "images/foods/tuna.svg",
    nuts: "images/foods/nuts.svg",
    fat: "images/foods/olive-oil.svg",
    bread: "images/foods/bread.svg",
    vegetable: "images/foods/apple.svg",
    drinks: "images/foods/drink.svg",
    other: "images/foods/drink.svg",
    household: "images/fallback-household.svg",
    hygiene: "images/fallback-hygiene.svg",
    pet: "images/fallback-pet.svg",
};

const EDIBLE_YIELD_RULES = [
    ["пилешки крила", 0.55],
    ["крила", 0.55],
    ["долен бут", 0.68],
    ["горен бут", 0.7],
    ["бутче", 0.68],
    ["бут ", 0.72],
    ["цялo пиле", 0.65],
    ["цяло пиле", 0.65],
    ["котлет", 0.82],
    ["пъстърва", 0.85],
    ["ципура", 0.82],
    ["лаврак", 0.82],
];

const PROTEIN_QUALITY_RULES = [
    ["риба тон", 1.12],
    ["сьомга", 1.12],
    ["пъстърва", 1.1],
    ["скумрия", 1.1],
    ["треска", 1.12],
    ["ципура", 1.08],
    ["лаврак", 1.08],
    ["херинга", 1.08],
    ["сельодка", 1.08],
    ["яйц", 1.12],
    ["пилешки гърди", 1.1],
    ["пилешко филе", 1.1],
    ["пилешко", 1.06],
    ["пуешко", 1.1],
    ["телешко", 1.04],
    ["говеждо", 1.04],
    ["извара", 1.07],
    ["cottage", 1.07],
    ["скир", 1.08],
    ["skyr", 1.08],
    ["кисело мляко", 1.03],
    ["йогурт", 1.03],
    ["сирене", 1.01],
    ["елена", 0.96],
    ["нахут", 0.94],
    ["леща", 0.95],
    ["фасул", 0.93],
    ["боб", 0.93],
    ["грах", 0.92],
    ["овесени ядки", 0.82],
    ["овес", 0.82],
    ["ориз", 0.78],
];

const PROTEIN_SOURCE_KEYWORDS = [
    "пилешки гърди", "пилешко филе", "пилешко", "пиле", "пуешко", "телешко", "говеждо",
    "яйц", "риба тон", "сьомга", "скумрия", "треска", "пъстърва", "ципура", "лаврак",
    "сельодка", "херинга", "скарида", "калмар", "черен дроб", "дроб", "елена", "извара", "скир", "cottage", "skyr",
    "кисело мляко", "йогурт", "леща", "нахут", "боб", "фасул"
];

const COMPARISON_KEYWORDS = [
    ["скир", "Скир"],
    ["извара", "Извара"],
    ["кисело мляко", "Кисело мляко"],
    ["яйц", "Яйца"],
    ["пилешки гърди", "Пилешки гърди"],
    ["пилешко филе", "Пилешко филе"],
    ["пилешко", "Пилешко"],
    ["пуешко", "Пуешко"],
    ["риба тон", "Риба тон"],
    ["сьомга", "Сьомга"],
    ["скумрия", "Скумрия"],
    ["овесени ядки", "Овесени ядки"],
    ["овес", "Овес"],
    ["ориз", "Ориз"],
    ["леща", "Леща"],
    ["нахут", "Нахут"],
    ["боб", "Боб"],
    ["зехтин", "Зехтин"],
    ["моцарела", "Моцарела"],
    ["сирене", "Сирене"],
    ["банан", "Банани"],
    ["домати", "Домати"],
    ["краставиц", "Краставици"],
];

document.addEventListener("DOMContentLoaded", () => {
    loadOffers();
});

function hasRealImage(image) {
    return !!image && !String(image).includes(PLACEHOLDER_IMAGE_MARKER);
}

function hasExternalImage(image) {
    return hasRealImage(image) && !String(image).startsWith("images/");
}

/* -----------------------------------------------------------------------
   CANONICAL NUTRITION — authoritative per-100g values.
   Used in place of (or to validate) scraped macros.
   Keys are lowercased Bulgarian substrings, ordered longest-first so that
   "пилешки гърди" matches before the bare "пиле" fallback.
   ----------------------------------------------------------------------- */
const CANONICAL_NUTRITION = [
    // --- Overrides for commonly misclassified items (checked FIRST) ---
    // Ground coffee: technically p=18 dry grounds but irrelevant — consumed as liquid
    ["кафе",              { p:  0.1, f:  0,   c:  0,   kcal:   2 }],
    ["coffee",            { p:  0.1, f:  0,   c:  0,   kcal:   2 }],
    // Instant noodles — contain "пиле/говеждо" as flavoring only
    ["инстантни спагет",  { p:  8,   f: 12,   c: 62,   kcal: 385 }],
    ["инстантни нудли",   { p:  8,   f: 12,   c: 62,   kcal: 385 }],
    ["рамен",             { p:  8,   f: 12,   c: 62,   kcal: 385 }],
    // Flour — high protein but wrong context for HP filter
    ["брашно",            { p: 10,   f:  1,   c: 76,   kcal: 364 }],
    // Tomatoes/tomato products
    ["доматен сос",       { p:  2,   f:  0.3, c:  7,   kcal:  40 }],
    ["домати",            { p:  0.9, f:  0.2, c:  3.9, kcal:  21 }],

    // --- Fish & seafood ---
    ["риба тон",          { p: 25, f:  1,   c:  0,   kcal: 116 }],
    ["сьомга",            { p: 20, f: 13,   c:  0,   kcal: 208 }],
    ["пъстърва",          { p: 20, f:  3.5, c:  0,   kcal: 110 }],
    ["скумрия",           { p: 19, f: 14,   c:  0,   kcal: 205 }],
    ["треска",            { p: 18, f:  0.9, c:  0,   kcal:  82 }],
    ["ципура",            { p: 19, f:  2.5, c:  0,   kcal:  96 }],
    ["лаврак",            { p: 19, f:  2.5, c:  0,   kcal:  97 }],
    ["сельодка",          { p: 18, f: 12,   c:  0,   kcal: 185 }],
    ["херинга",           { p: 18, f: 12,   c:  0,   kcal: 185 }],
    // --- Poultry (longer first to avoid "пиле" matching "пилешко аромат") ---
    ["пилешки гърди",     { p: 23, f:  5,   c:  0,   kcal: 165 }],
    ["пилешко гърди",     { p: 23, f:  5,   c:  0,   kcal: 165 }],
    ["пилешко филе",      { p: 23, f:  5,   c:  0,   kcal: 165 }],
    ["пилешко",           { p: 21, f:  8,   c:  0,   kcal: 165 }],
    ["пуешко",            { p: 24, f:  4,   c:  0,   kcal: 135 }],
    ["пиле",              { p: 21, f:  8,   c:  0,   kcal: 165 }],
    // --- Red meat ---
    ["говеждо",           { p: 26, f: 10,   c:  0,   kcal: 250 }],
    ["телешко",           { p: 21, f:  5,   c:  0,   kcal: 130 }],
    ["свинско",           { p: 21, f: 20,   c:  0,   kcal: 260 }],
    ["агнешко",           { p: 21, f: 17,   c:  0,   kcal: 234 }],
    ["черен дроб",        { p: 20, f:  4,   c:  4,   kcal: 135 }],
    ["агнешки дроб",      { p: 20, f:  5,   c:  2,   kcal: 140 }],
    ["дроб комплект",     { p: 20, f:  5,   c:  2,   kcal: 140 }],
    ["елена",             { p: 40, f:  3,   c:  1,   kcal: 195 }],
    // --- Dairy — high protein ---
    ["скир",              { p: 11, f:  0.2, c:  3.5, kcal:  60 }],
    ["skyr",              { p: 11, f:  0.2, c:  3.5, kcal:  60 }],
    ["извара",            { p: 11, f:  4.3, c:  3.4, kcal:  98 }],
    ["cottage",           { p: 11, f:  4.3, c:  3.4, kcal:  98 }],
    // --- Eggs ---
    ["яйц",               { p: 13, f: 11,   c:  1.1, kcal: 155 }],
    // --- Dairy — moderate ---
    ["кисело мляко",      { p:  3.5, f: 3.6, c: 4.7, kcal:  63 }],
    ["йогурт",            { p:  3.5, f: 3.6, c: 4.7, kcal:  63 }],
    ["мляко",             { p:  3.4, f: 3.6, c: 4.8, kcal:  64 }],
    ["сирене",            { p: 17,   f: 21,  c: 0.5, kcal: 260 }],
    ["моцарела",          { p: 22,   f: 22,  c: 2.2, kcal: 300 }],
    // --- Legumes ---
    ["нахут",             { p:  9,   f: 2.6, c: 27,  kcal: 164 }],
    ["леща",              { p:  9,   f: 0.4, c: 20,  kcal: 116 }],
    ["фасул",             { p:  8,   f: 0.5, c: 24,  kcal: 127 }],
    ["боб",               { p:  8,   f: 0.5, c: 24,  kcal: 127 }],
    ["грах",              { p:  5,   f: 0.4, c: 14,  kcal:  81 }],
    // --- Grains ---
    ["овесени ядки",      { p: 13,   f: 7,   c: 67,  kcal: 389 }],
    ["овес",              { p: 13,   f: 7,   c: 67,  kcal: 389 }],
    ["ориз",              { p:  7,   f: 0.6, c: 80,  kcal: 365 }],
    // --- Nuts & seeds ---
    ["бадем",             { p: 21,   f: 49,  c: 22,  kcal: 575 }],
    ["орех",              { p: 15,   f: 65,  c: 14,  kcal: 654 }],
    ["кашу",              { p: 18,   f: 44,  c: 30,  kcal: 553 }],
    ["лешник",            { p: 15,   f: 61,  c: 17,  kcal: 628 }],
    ["писташ",            { p: 20,   f: 45,  c: 28,  kcal: 562 }],
    // --- Oils & fats ---
    ["зехтин",            { p:  0,   f: 100, c:  0,  kcal: 884 }],
    ["масло краве",       { p:  0.6, f: 81,  c:  0.1,kcal: 717 }],
];

// Items whose names contain these substrings get null macros —
// they look like food but aren't (dyes, stickers, decorations, drinks).
const NON_FOOD_MACRO_OVERRIDE = [
    "боя за", "стикери за", "кристали за яйца", "фолио за яйца",
    "украса за", "разтворимо кафе", "капсули кафе", "чай ",
    "raffaello", "kinder", "великденски яйца", "шоколадов",
];

/**
 * Returns canonical nutrition for an offer if a known food type is matched.
 * Canonical table takes priority over scraped macros — prevents noisy
 * scraper values from distorting protein rankings and filters.
 * Returns null for known non-food items.
 */
function getMacros(offer) {
    const nameLower = (offer.name || "").toLowerCase();
    // Hard-block known non-food names
    if (NON_FOOD_MACRO_OVERRIDE.some(kw => nameLower.includes(kw))) return null;
    // Canonical lookup (longest/most specific entries are first in the array)
    for (const [keyword, nutrition] of CANONICAL_NUTRITION) {
        if (nameLower.includes(keyword)) return { ...(offer.macros || {}), ...nutrition };
    }
    return offer.macros || null;
}

function getOfferNameLower(offer) {
    return (offer.name || "").toLowerCase();
}

function matchesCuredLeanMeat(offer) {
    const nameLower = getOfferNameLower(offer).trim();
    if (CURED_LEAN_MEAT_EXACT_NAMES.has(nameLower)) return true;
    return CURED_LEAN_MEAT_PHRASES.some(phrase => nameLower.includes(phrase));
}

// Food keywords that must win over hygiene/household mismatches (e.g. "балсамов оцет" contains "балсам")
const FOOD_OVERRIDE_KEYWORDS = ["оцет", "балсамов", "балсамика", "подправка", "сос", "хляб"];

function normalizeOfferCategory(offer) {
    const nameLower = getOfferNameLower(offer);
    if (EXACT_NON_FOOD_NAMES.has(nameLower.trim())) return "household";
    if (matchesCuredLeanMeat(offer)) return "protein";
    if (NON_HUMAN_FOOD_KEYWORDS.some(kw => nameLower.includes(kw))) return "pet";
    const isClearlyFood = FOOD_OVERRIDE_KEYWORDS.some(kw => nameLower.includes(kw));
    if (!isClearlyFood && HOUSEHOLD_CATEGORY_KEYWORDS.some(kw => nameLower.includes(kw))) return "household";
    if (!isClearlyFood && HYGIENE_CATEGORY_KEYWORDS.some(kw => nameLower.includes(kw))) return "hygiene";
    if (JUNK_FOOD_KEYWORDS.some(kw => nameLower.includes(kw))) return "grain";
    // Smoothies/juices misclassified as nuts due to chia/coconut/etc keywords
    if (nameLower.includes("смути") || nameLower.includes("smoothie")) return "vegetable";
    // Spices misclassified as nuts (nutmeg, cinnamon, cumin etc.)
    if (nameLower.includes("орехче") || nameLower.includes("канела") || nameLower.includes("кимион")
        || nameLower.includes("куркума") || nameLower.includes("джинджифил") || nameLower.includes("кардамон")
        || nameLower.includes("анасон") || nameLower.includes("кориандър")) return "other";
    // Bars, cookies, porridges misclassified as nuts because of ingredient keywords
    if (offer.category === "nuts" && (
        nameLower.includes("курабийк") || nameLower.includes("ечемичен") ||
        nameLower.includes("барче") || nameLower.includes("протеинов бар") || nameLower.includes("снак") ||
        nameLower.includes("каша") || nameLower.includes("мюсли") || nameLower.includes("гранол") ||
        nameLower.includes("вафла") || nameLower.includes("шоколад") || nameLower.includes("десерт")
    )) return "grain";
    return offer.category;
}

function normalizeOfferForUi(offer) {
    const category = normalizeOfferCategory(offer);
    const nameLower = getOfferNameLower(offer);
    const isNonEdible = category === "pet" || category === "hygiene" || category === "household";
    const isJunkByName = JUNK_FOOD_KEYWORDS.some(kw => nameLower.includes(kw));
    const isCuredLeanMeat = matchesCuredLeanMeat(offer);
    const macros = getMacros({ ...offer, category });

    return {
        ...offer,
        category,
        is_food: isCuredLeanMeat ? true : (isNonEdible ? false : offer.is_food),
        is_junk: isNonEdible ? false : (offer.is_junk || isJunkByName),
        health_score: isCuredLeanMeat ? Math.max(offer.health_score || 0, 6) : (isNonEdible ? null : offer.health_score),
        diet_tags: isCuredLeanMeat
            ? [...new Set([...(offer.diet_tags || []), "high_protein", "keto"])]
            : (offer.diet_tags || []),
        macros: macros || offer.macros,
    };
}

function escapeHtml(value) {
    return String(value || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function normalizeProductKey(name) {
    return (name || "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .replace(/\b\d+([.,]\d+)?\s*(кг|kg|гр|г|g|мл|ml|л|бр|бр\.)\b/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function getOfferDomId(offer) {
    return offer?.id || offer?.product_id || "";
}

const PROTEIN_COMPARISON_KEYWORDS = new Set([
    "пилешки гърди", "пилешко филе", "пилешко", "пуешко", "риба тон", "сьомга", "скумрия", "яйц"
]);
const DAIRY_COMPARISON_KEYWORDS = new Set([
    "скир", "извара", "кисело мляко", "моцарела", "сирене"
]);

function getComparisonKey(offer) {
    const nameLower = getOfferNameLower(offer);
    for (const [keyword, label] of COMPARISON_KEYWORDS) {
        if (!nameLower.includes(keyword)) continue;
        if (PROTEIN_COMPARISON_KEYWORDS.has(keyword) && offer.category !== "protein") return null;
        if (DAIRY_COMPARISON_KEYWORDS.has(keyword) && offer.category !== "dairy") return null;
        return label;
    }
    return null;
}

const SEARCH_SYNONYMS = [
    ["зехтин", "маслиново масло", "olive oil", "олива"],
    ["риба тон", "туна", "tuna"],
    ["кисело мляко", "йогурт", "yogurt"],
    ["краве масло", "масло краве", "butter"],
    ["нахут", "chickpea"],
    ["леща", "lentil"],
    ["овесен", "овес", "oat"],
    ["пилешко", "пиле", "chicken"],
    ["говеждо", "телешко", "beef"],
    ["сьомга", "salmon"],
    ["извара", "cottage"],
    ["фъстъчено масло", "фъстък паста", "peanut butter"],
];

function buildSearchText(offer) {
    const macros = offer.macros || {};
    const base = [
        offer.name,
        offer.store,
        offer.category,
        offer.source_type,
        offer.weight_raw,
        offer.shelf_life,
        ...(offer.available_stores || []),
        ...(offer.diet_tags || []),
        macros.ingredients,
    ].filter(Boolean).join(" ").toLowerCase();

    // Expand synonyms: if any synonym term is in the base text, add all its siblings
    const extras = [];
    for (const group of SEARCH_SYNONYMS) {
        if (group.some(term => base.includes(term))) {
            extras.push(...group);
        }
    }
    return extras.length ? base + " " + extras.join(" ") : base;
}

function isProcessedMeat(offer) {
    return getOfferProfile(offer).is_processed_meat;
}

function isCuredLeanMeat(offer) {
    return getOfferProfile(offer).is_cured_lean_meat;
}

function isClearlyNonHumanFood(offer) {
    return getOfferProfile(offer).is_non_human_food;
}

function isClearlyNonEdibleProduct(offer) {
    return getOfferProfile(offer).is_non_edible_product;
}

function isHealthyOffer(offer) {
    return getOfferProfile(offer).is_healthy;
}

function isProteinSource(offer) {
    return getOfferProfile(offer).protein_source;
}

/**
 * Returns true only when the product name matches a known entry in CANONICAL_NUTRITION.
 * Used in the protein ranking to exclude products relying on unreliable scraped macros.
 */
function hasCanonicalNutrition(offer) {
    return getOfferProfile(offer).has_canonical_nutrition;
}

/* -----------------------------------------------------------------------
   HIGH PROTEIN — strict nutritional criteria for training/muscle building.
   Requires:
   - protein >= 10g per 100g
   - protein comprises >= 35% of total macros (excludes high-fat nuts/oils
     and high-carb grains even if they have decent protein)
   ----------------------------------------------------------------------- */
function isStrictHighProtein(offer) {
    return getOfferProfile(offer).strict_high_protein;
}

function isValidProteinValueOffer(offer) {
    return getOfferProfile(offer).valid_protein_value;
}

function getEdibleYieldFactor(offer) {
    return getOfferProfile(offer).edible_yield;
}

function getProteinQualityFactor(offer) {
    return getOfferProfile(offer).protein_quality;
}

/* -----------------------------------------------------------------------
   PRICE / PROTEIN METRICS
   ----------------------------------------------------------------------- */
function formatPricePair(bgn, eur, suffix = "") {
    if (bgn == null) return "";
    const bgnText = `${bgn.toFixed(2)} лв${suffix}`;
    if (eur == null) return bgnText;
    return `${bgnText} / €${eur.toFixed(2)}`;
}

function formatRoundedHalfLev(value) {
    if (value == null) return "";
    const rounded = Math.round(value * 2) / 2;
    return rounded.toFixed(1);
}

function formatOfferDate(dateString) {
    if (!dateString) return "";
    const match = String(dateString).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return String(dateString);
    return `${match[3]}.${match[2]}.${match[1]}`;
}

function getOfferValidityText(offer, mode = "short") {
    const validFrom = formatOfferDate(offer.valid_from);
    const validUntil = formatOfferDate(offer.valid_until);
    if (validFrom && validUntil) {
        return mode === "detail"
            ? `От ${validFrom} до ${validUntil}`
            : `Важи ${validFrom} – ${validUntil}`;
    }
    if (validUntil) {
        return mode === "detail"
            ? `До ${validUntil}`
            : `Важи до ${validUntil}`;
    }
    if (validFrom) {
        return mode === "detail"
            ? `От ${validFrom}`
            : `Важи от ${validFrom}`;
    }
    return "";
}

function getLocalFallbackImage(offer) {
    const nameLower = getOfferNameLower(offer);
    // Prefer live CDN photos (real product images) over local SVG icons
    for (const [keyword] of LOCAL_IMAGE_RULES) {
        if (nameLower.includes(keyword)) {
            if (liveFallbackByKeyword.has(keyword)) return liveFallbackByKeyword.get(keyword);
            break;
        }
    }
    if (liveFallbackByCategory.has(offer.category)) return liveFallbackByCategory.get(offer.category);
    // Last resort: local SVG icons
    for (const [keyword, imagePath] of LOCAL_IMAGE_RULES) {
        if (nameLower.includes(keyword)) return imagePath;
    }
    return CATEGORY_FALLBACK_IMAGES[offer.category] || "";
}

function getOfferImage(offer) {
    if (hasRealImage(offer.image)) return offer.image;
    return getLocalFallbackImage(offer);
}

function renderOfferThumb(offer, className = "offer-img") {
    const imgSrc = getOfferImage(offer);
    if (!imgSrc) return "";
    const isFallback = !hasRealImage(offer.image);
    const fallbackSrc = isFallback ? "" : getLocalFallbackImage(offer);
    const onError = fallbackSrc
        ? `if(this.dataset.fallbackSrc&&this.src!==this.dataset.fallbackSrc){this.src=this.dataset.fallbackSrc;this.parentElement.classList.add('fallback');}else{this.parentElement.style.display='none';}`
        : "this.parentElement.style.display='none'";
    return `<div class="offer-img-wrapper${isFallback ? " fallback" : ""}"><img src="${imgSrc}" alt="" class="${className}" ${fallbackSrc ? `data-fallback-src="${fallbackSrc}"` : ""} onerror="${onError}"></div>`;
}

function getReliablePricePerKg(offer) {
    if (offer.price_per_kg && offer.price_per_kg > 0) return offer.price_per_kg;
    if (offer.weight_grams && offer.weight_grams > 0 && offer.new_price != null && offer.new_price > 0) {
        return (offer.new_price / offer.weight_grams) * 1000;
    }
    return null;
}

function buildOfferProfile(offer) {
    const nameLower = getOfferNameLower(offer);
    const macros = getMacros(offer);
    const isFood = !!offer.is_food;
    const isJunk = !!offer.is_junk;
    const isCuredLeanMeatValue = matchesCuredLeanMeat(offer);
    const isProcessedMeatValue = PROCESSED_MEAT_KEYWORDS.some(kw => nameLower.includes(kw));
    const isNonHumanFood = NON_HUMAN_FOOD_KEYWORDS.some(kw => nameLower.includes(kw));
    const isNonEdibleProduct = EXCLUDED_HEALTH_CATEGORIES.has(offer.category)
        || NON_EDIBLE_PRODUCT_KEYWORDS.some(kw => nameLower.includes(kw));
    const isUltraProcessed = ULTRA_PROCESSED_HEALTH_KEYWORDS.some(kw => nameLower.includes(kw));
    const hasCanonicalNutritionValue = !NON_FOOD_MACRO_OVERRIDE.some(kw => nameLower.includes(kw))
        && CANONICAL_NUTRITION.some(([keyword]) => nameLower.includes(keyword));
    const strictHighProtein = !!macros && (() => {
        const p = macros.p || 0;
        const f = macros.f || 0;
        const c = macros.c || 0;
        const total = p + f + c;
        return p >= 10 && (total === 0 || p / total >= 0.35);
    })();
    const healthScore = offer.health_score || 0;
    const healthy = isFood && !isJunk && !isNonHumanFood && !isNonEdibleProduct && !isProcessedMeatValue && !isUltraProcessed;
    const proteinSource = PROTEIN_SOURCE_KEYWORDS.some(kw => nameLower.includes(kw)) || strictHighProtein;
    const reliablePricePerKg = getReliablePricePerKg(offer);
    const validProteinValue = healthy
        && healthScore >= 6
        && !!reliablePricePerKg
        && hasCanonicalNutritionValue
        && PROTEIN_VALUE_ALLOWED_CATEGORIES.has(offer.category)
        && proteinSource
        && !NON_PROTEIN_VALUE_KEYWORDS.some(kw => nameLower.includes(kw));

    let edibleYield = 1;
    for (const [keyword, factor] of EDIBLE_YIELD_RULES) {
        if (nameLower.includes(keyword)) {
            edibleYield = factor;
            break;
        }
    }

    let proteinQuality = 1;
    for (const [keyword, factor] of PROTEIN_QUALITY_RULES) {
        if (nameLower.includes(keyword)) {
            proteinQuality = factor;
            break;
        }
    }
    if (proteinQuality === 1 && (nameLower.includes("черен дроб") || nameLower.includes("дроб"))) {
        proteinQuality = 1.04;
    } else if (proteinQuality === 1) {
        if (offer.category === "protein") proteinQuality = 1.05;
        else if (offer.category === "dairy") proteinQuality = 1.03;
        else if (offer.category === "legume" || offer.category === "canned") proteinQuality = 0.94;
        else if (offer.category === "grain") proteinQuality = 0.8;
    }

    const everydayBase = healthy
        && healthScore >= 8
        && ["protein", "dairy", "legume", "canned"].includes(offer.category)
        && !isProcessedMeatValue
        && edibleYield >= 0.9;

    return {
        name_lower: nameLower,
        macros,
        health_score: healthScore,
        is_cured_lean_meat: isCuredLeanMeatValue,
        is_processed_meat: isProcessedMeatValue,
        is_non_human_food: isNonHumanFood,
        is_non_edible_product: isNonEdibleProduct,
        is_ultra_processed: isUltraProcessed,
        is_healthy: healthy,
        strict_high_protein: strictHighProtein,
        has_canonical_nutrition: hasCanonicalNutritionValue,
        protein_source: proteinSource,
        reliable_price_per_kg: reliablePricePerKg,
        valid_protein_value: validProteinValue,
        edible_yield: edibleYield,
        protein_quality: proteinQuality,
        everyday_base: everydayBase,
    };
}

function getOfferProfile(offer) {
    if (!offer._profile) offer._profile = buildOfferProfile(offer);
    return offer._profile;
}

function getPricePerKgEstimate(offer) {
    if (offer.price_per_kg && offer.price_per_kg > 0) return offer.price_per_kg;
    const estWeight = offer.weight_grams || 500;
    return (offer.new_price / estWeight) * 1000;
}

/**
 * @param {object} offer
 * @param {boolean} strictWeight — if true, returns null when weight/ppk is
 *   unknown (used for ranking so we don't distort scores with the 500g fallback)
 */
function getProteinMetrics(offer, strictWeight = false) {
    const profile = getOfferProfile(offer);
    const macros = profile.macros;
    if (!macros || macros.p < 1) return null;

    let pricePerKg;
    if (strictWeight) {
        pricePerKg = profile.reliable_price_per_kg;
        if (!pricePerKg) return null;
    } else {
        pricePerKg = getPricePerKgEstimate(offer);
    }
    if (!pricePerKg || pricePerKg <= 0) return null;

    // rawProteinPerLev: grams of protein you get per 1 лв
    // = (protein_per_100g × 10) / price_per_kg
    const rawProteinPerLev = (macros.p * 10) / pricePerKg;
    const rawProteinPerEur = rawProteinPerLev * 1.95583;
    const nonProteinLoad = (macros.f || 0) + (macros.c || 0);
    const total = macros.p + nonProteinLoad;
    const purity = total > 0 ? macros.p / total : 1;
    const cleanProteinPerLev = rawProteinPerLev * purity;
    const cleanProteinPerEur = cleanProteinPerLev * 1.95583;
    const edibleYield = strictWeight ? profile.edible_yield : 1;
    const proteinQuality = profile.protein_quality;
    const adjustedProteinPerLev = cleanProteinPerLev * edibleYield * proteinQuality;
    const adjustedProteinPerEur = cleanProteinPerEur * edibleYield * proteinQuality;

    return {
        rawProteinPerLev, rawProteinPerEur, cleanProteinPerLev, cleanProteinPerEur,
        adjustedProteinPerLev, adjustedProteinPerEur, purity, edibleYield, proteinQuality
    };
}

/* -----------------------------------------------------------------------
   LOAD
   ----------------------------------------------------------------------- */
async function loadOffers() {
    if (typeof OFFERS_DATA !== 'undefined') {
        // Build product lookup from all_products if available.
        // Offers are enriched with persistent product metadata (image, macros, etc.)
        // Offer-specific fields (price, discount, valid_until) always take precedence.
        const productMap = new Map();
        if (typeof ALL_PRODUCTS_DATA !== 'undefined') {
            for (const p of (ALL_PRODUCTS_DATA.products || [])) {
                if (p.product_id) productMap.set(p.product_id, p);
            }

            allCatalogProducts = (ALL_PRODUCTS_DATA.products || []).map(product => {
                const normalized = normalizeOfferForUi({
                    ...product,
                    new_price: product.avg_price ?? product.lowest_price ?? null,
                    new_price_eur: product.avg_price != null ? product.avg_price / 1.95583 : (product.lowest_price != null ? product.lowest_price / 1.95583 : null),
                    old_price: null,
                    old_price_eur: null,
                    discount_pct: null,
                    source_type: "catalog",
                    available_stores: product.available_stores || [],
                    store: (product.available_stores || [])[0] || null,
                    price_per_kg: product.weight_grams && (product.avg_price ?? product.lowest_price)
                        ? ((product.avg_price ?? product.lowest_price) / product.weight_grams) * 1000
                        : null,
                    price_per_kg_eur: product.weight_grams && (product.avg_price ?? product.lowest_price)
                        ? ((((product.avg_price ?? product.lowest_price) / product.weight_grams) * 1000) / 1.95583)
                        : null,
                });
                normalized._profile = buildOfferProfile(normalized);
                return normalized;
            });
        }

        allOffers = (OFFERS_DATA.offers || []).map(o => {
            const product = productMap.get(o.product_id || o.id);
            const merged = product ? { ...product, ...o } : o;
            if (product && !hasExternalImage(o.image) && hasExternalImage(product.image)) {
                merged.image = product.image;
            }
            const normalized = normalizeOfferForUi(merged);
            return {
                ...normalized,
                _profile: buildOfferProfile(normalized),
                _searchText: buildSearchText(normalized),
                _productKey: normalizeProductKey(normalized.name),
                _comparisonKey: getComparisonKey(normalized),
            };
        });
        // Cross-catalog image sharing: for offers without real images, find a
        // real photo of the same product type from the catalog.
        // Builds module-level maps used by getLocalFallbackImage() as well.
        if (typeof ALL_PRODUCTS_DATA !== 'undefined') {
            liveFallbackByKeyword = new Map();
            liveFallbackByCategory = new Map();
            for (const p of (ALL_PRODUCTS_DATA.products || [])) {
                if (!hasExternalImage(p.image)) continue;
                const nameLower = (p.name || "").toLowerCase();
                // Keyword-level: real photo for each food keyword
                for (const [keyword] of LOCAL_IMAGE_RULES) {
                    if (nameLower.includes(keyword) && !liveFallbackByKeyword.has(keyword)) {
                        liveFallbackByKeyword.set(keyword, p.image);
                        break;
                    }
                }
                // Category-level: first real photo per category
                const cat = p.category;
                if (cat && !liveFallbackByCategory.has(cat)) {
                    liveFallbackByCategory.set(cat, p.image);
                }
            }
            const assignLiveImage = (offer) => {
                if (hasExternalImage(offer.image)) return;
                const nameLower = (offer.name || "").toLowerCase();
                for (const [keyword] of LOCAL_IMAGE_RULES) {
                    if (nameLower.includes(keyword) && liveFallbackByKeyword.has(keyword)) {
                        offer.image = liveFallbackByKeyword.get(keyword);
                        return;
                    }
                }
                if (liveFallbackByCategory.has(offer.category)) {
                    offer.image = liveFallbackByCategory.get(offer.category);
                }
            };
            allOffers.forEach(assignLiveImage);
            allCatalogProducts.forEach(assignLiveImage);
        }
        applyFilters();
        renderPriceComparison();
        renderBulkRecommendations();
        renderProteinRanking();
        renderBaselineRecommendations();
        renderProfileRecommendations("all");
        initTypeFilters();
        initCategoryFilters();
        initStoreFilters();
        initProfileFilters();
        initSortButtons();
        initSearch();
    } else {
        const grid = document.getElementById("offers-grid");
        if (grid) {
            grid.innerHTML = '<p style="text-align:center; color:var(--muted);">Проблем при зареждане на данните.</p>';
        }
    }
}

/* -----------------------------------------------------------------------
   SORTING
   ----------------------------------------------------------------------- */
function sortOffers(offers) {
    const sorted = [...offers];
    switch (activeSort) {
        case "protein":
            sorted.sort((a, b) => {
                const pa = getMacros(a)?.p || 0;
                const pb = getMacros(b)?.p || 0;
                return pb - pa;
            });
            break;
        case "price_asc":
            sorted.sort((a, b) => {
                const ha = isHealthyOffer(a) ? 0 : 1;
                const hb = isHealthyOffer(b) ? 0 : 1;
                if (ha !== hb) return ha - hb;
                return a.new_price - b.new_price;
            });
            break;
        case "price_per_kg":
            sorted.sort((a, b) => {
                const ha = isHealthyOffer(a) ? 0 : 1;
                const hb = isHealthyOffer(b) ? 0 : 1;
                if (ha !== hb) return ha - hb;
                // products without price_per_kg go last
                const pa = a.price_per_kg || Infinity;
                const pb = b.price_per_kg || Infinity;
                return pa - pb;
            });
            break;
        case "health":
            sorted.sort((a, b) => {
                const ha = isHealthyOffer(a) ? getOfferProfile(a).health_score : 0;
                const hb = isHealthyOffer(b) ? getOfferProfile(b).health_score : 0;
                if (hb !== ha) return hb - ha;
                return a.new_price - b.new_price;
            });
            break;
        case "protein_value":
            sorted.sort((a, b) => {
                const va = isValidProteinValueOffer(a) ? (getProteinMetrics(a, true)?.adjustedProteinPerEur || 0) : 0;
                const vb = isValidProteinValueOffer(b) ? (getProteinMetrics(b, true)?.adjustedProteinPerEur || 0) : 0;
                return vb - va;
            });
            break;
        case "discount_desc":
            sorted.sort((a, b) => {
                const da = a.discount_pct || 0;
                const db = b.discount_pct || 0;
                if (db !== da) return db - da;
                return a.new_price - b.new_price;
            });
            break;
        case "store":
            sorted.sort((a, b) => {
                const sa = (a.store || (a.available_stores || [])[0] || "");
                const sb = (b.store || (b.available_stores || [])[0] || "");
                const cmp = sa.localeCompare(sb, "bg");
                if (cmp !== 0) return cmp;
                return (b.discount_pct || 0) - (a.discount_pct || 0);
            });
            break;
        case "history":
            sorted.sort((a, b) => {
                const ha = (a.price_history || []).length;
                const hb = (b.price_history || []).length;
                if (hb !== ha) return hb - ha;
                return (b.discount_pct || 0) - (a.discount_pct || 0);
            });
            break;
        default: // recommended: health desc, price asc
            sorted.sort((a, b) => {
                const ha = isHealthyOffer(a) ? getOfferProfile(a).health_score : 0;
                const hb = isHealthyOffer(b) ? getOfferProfile(b).health_score : 0;
                if (hb !== ha) return hb - ha;
                const pa = isValidProteinValueOffer(a) ? (getProteinMetrics(a, true)?.adjustedProteinPerEur || 0) : 0;
                const pb = isValidProteinValueOffer(b) ? (getProteinMetrics(b, true)?.adjustedProteinPerEur || 0) : 0;
                if (pb !== pa) return pb - pa;
                return a.new_price - b.new_price;
            });
    }
    return sorted;
}

function initSortButtons() {
    document.querySelectorAll(".sort-btn[data-sort]").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".sort-btn[data-sort]").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            activeSort = btn.dataset.sort;
            currentPage = 1;
            applyFilters();
        });
    });
}

/* -----------------------------------------------------------------------
   SEARCH — Fuse.js fuzzy search with Bulgarian plural/stem tolerance.
   Falls back to substring if Fuse is not loaded.
   ----------------------------------------------------------------------- */
function initSearch() {
    const input = document.getElementById("offers-search");
    if (!input) return;

    if (typeof Fuse !== 'undefined') {
        fuseIndex = new Fuse(allOffers, {
            keys: [
                { name: 'name', weight: 0.55 },
                { name: 'store', weight: 0.12 },
                { name: 'category', weight: 0.1 },
                { name: 'diet_tags', weight: 0.08 },
                { name: '_searchText', weight: 0.15 },
            ],
            threshold: 0.28,       // 0=exact, 1=match anything
            distance: 200,
            includeScore: true,
            minMatchCharLength: 2,
            ignoreLocation: true,  // match anywhere in string, not just front
        });
    }

    let debounce;
    input.addEventListener("input", () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
            searchQuery = input.value.trim().toLowerCase();
            currentPage = 1;
            applyFilters();
        }, 200);
    });
}

/* -----------------------------------------------------------------------
   FILTERING
   ----------------------------------------------------------------------- */
function applyFilters() {
    let filtered = allOffers.filter(o => {
        if (!o.name || o.new_price == null) return false;
        if (/^[^а-яА-Яa-zA-Z0-9]+/.test(o.name)) return false;
        return true;
    });

    // Search
    if (searchQuery) {
        if (fuseIndex) {
            const results = fuseIndex.search(searchQuery);
            const matchedIds = new Set(results.map(r => getOfferDomId(r.item) || r.item.name));
            filtered = filtered.filter(o => matchedIds.has(getOfferDomId(o) || o.name));
        } else {
            filtered = filtered.filter(o => o._searchText.includes(searchQuery));
        }
    }

    // Type filter
    if (activeType === "high_protein") {
        // Strict: must be real food AND pass nutritional thresholds
        filtered = filtered.filter(o => isHealthyOffer(o) && isStrictHighProtein(o));
    } else if (activeType === "bulk") {
        filtered = filtered.filter(o => o.is_bulk_worthy && isHealthyOffer(o));
    } else {
        // "all" — food only, explicitly exclude non-food categories
        filtered = filtered.filter(o =>
            !EXCLUDED_HEALTH_CATEGORIES.has(o.category) &&
            (o.is_food || o.category !== "other") &&
            !isClearlyNonHumanFood(o)
        );
    }

    if (activeCategory !== "all") {
        filtered = filtered.filter(o => o.category === activeCategory);
    }

    if (activeStore !== "all") {
        filtered = filtered.filter(o => (o.available_stores || [o.store]).includes(activeStore));
    }

    if (activeSort === "protein") {
        filtered = filtered.filter(o => isHealthyOffer(o) && isProteinSource(o));
    }
    if (activeSort === "health") {
        filtered = filtered.filter(o => isHealthyOffer(o) && (o.health_score || 0) >= 6);
    }

    filteredOffersCache = sortOffers(filtered);
    renderOffers(filteredOffersCache);
}

/* -----------------------------------------------------------------------
   TYPE / CATEGORY / PROFILE FILTER BUTTONS
   ----------------------------------------------------------------------- */
function initTypeFilters() {
    document.querySelectorAll(".filter-btn[data-type]").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".filter-btn[data-type]").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            activeType = btn.dataset.type;
            currentPage = 1;
            applyFilters();
        });
    });
}

function initCategoryFilters() {
    document.querySelectorAll(".filter-btn[data-category]").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".filter-btn[data-category]").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            activeCategory = btn.dataset.category;
            currentPage = 1;
            applyFilters();
        });
    });
}

function initStoreFilters() {
    document.querySelectorAll(".filter-btn[data-store]").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".filter-btn[data-store]").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            activeStore = btn.dataset.store;
            currentPage = 1;
            applyFilters();
        });
    });
}

function resetOfferFiltersForNavigation() {
    activeType = "all";
    activeCategory = "all";
    activeStore = "all";
    activeSort = "recommended";
    searchQuery = "";
    currentPage = 1;

    const searchInput = document.getElementById("offers-search");
    if (searchInput) searchInput.value = "";

    document.querySelectorAll(".filter-btn[data-type]").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.type === "all");
    });
    document.querySelectorAll(".filter-btn[data-category]").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.category === "all");
    });
    document.querySelectorAll(".filter-btn[data-store]").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.store === "all");
    });
    document.querySelectorAll(".sort-btn[data-sort]").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.sort === "recommended");
    });
}

function openOfferInGrid(offerId) {
    if (!offerId) return;

    let offerIndex = filteredOffersCache.findIndex(o => getOfferDomId(o) === offerId);
    if (offerIndex === -1) {
        resetOfferFiltersForNavigation();
        applyFilters();
        offerIndex = filteredOffersCache.findIndex(o => getOfferDomId(o) === offerId);
    }
    if (offerIndex === -1) return;

    currentPage = Math.floor(offerIndex / OFFERS_PER_PAGE) + 1;
    renderOffers(filteredOffersCache);

    requestAnimationFrame(() => {
        const card = document.querySelector(`.offer-card[data-offer-id="${offerId}"]`);
        if (!card) return;
        card.classList.add("expanded");
        const top = card.getBoundingClientRect().top + window.scrollY - 110;
        window.scrollTo({ top: Math.max(top, 0), behavior: "smooth" });
    });
}

function initProfileFilters() {
    document.querySelectorAll(".filter-btn[data-profile]").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".filter-btn[data-profile]").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            renderProfileRecommendations(btn.dataset.profile);
        });
    });
}

/* -----------------------------------------------------------------------
   RENDER OFFER CARDS
   ----------------------------------------------------------------------- */
function getComparableOffers(offer) {
    const bestPerStore = new Map();

    allOffers
        .filter(item => item._comparisonKey && item._comparisonKey === offer._comparisonKey && item.new_price != null && isHealthyOffer(item))
        .forEach(item => {
            const existing = bestPerStore.get(item.store);
            if (!existing || item.new_price < existing.new_price) {
                bestPerStore.set(item.store, item);
            }
        });

    return Array.from(bestPerStore.values())
        .sort((a, b) => a.new_price - b.new_price)
        .map((item, index) => ({ ...item, isBest: index === 0 }));
}

function getBestComparableOffersByStore(comparisonKey) {
    const bestPerStore = new Map();

    allOffers
        .filter(item => item._comparisonKey && item._comparisonKey === comparisonKey && item.new_price != null && isHealthyOffer(item))
        .forEach(item => {
            const existing = bestPerStore.get(item.store);
            if (!existing || item.new_price < existing.new_price) {
                bestPerStore.set(item.store, item);
            }
        });

    return Array.from(bestPerStore.values()).sort((a, b) => a.new_price - b.new_price);
}

function renderStoreComparisonList(offer) {
    const comparisons = getComparableOffers(offer).slice(0, 5);
    if (comparisons.length <= 1) return "";

    return `
        <div class="comparison-mini">
            <div class="comparison-mini-title">Сравнение по магазини</div>
            ${comparisons.map(item => `
                <div class="comparison-mini-row ${item.isBest ? "best" : ""}">
                    <span>${escapeHtml(item.store)}</span>
                    <span>${formatPricePair(item.new_price, item.new_price_eur)}${item.source_type === "promo" ? " · промо" : ""}</span>
                </div>
            `).join("")}
        </div>
    `;
}

function renderSparkline(offer) {
    const history = offer.price_history;
    if (!history || history.length < 2) return "";
    const prices = history.map(e => e.price).filter(p => p != null);
    if (prices.length < 2) return "";
    const maxP = Math.max(...prices);
    const minP = Math.min(...prices);
    const range = maxP - minP || 1;
    const bars = prices.map((p, i) => {
        const h = Math.round(((p - minP) / range) * 14) + 2;
        const isLast = i === prices.length - 1;
        const isDown = i > 0 && p < prices[i - 1];
        const isUp   = i > 0 && p > prices[i - 1];
        const cls = isLast ? (isDown ? "sp-down" : isUp ? "sp-up" : "sp-flat") : "";
        return `<span class="sp-bar ${cls}" style="height:${h}px"></span>`;
    }).join("");
    return `<span class="sparkline" title="Ценова история">${bars}</span>`;
}

function getPriceTrend(offer) {
    const history = offer.price_history;
    if (!history || history.length < 2) return null;
    const prices = history.map(e => e.price).filter(p => p != null);
    if (prices.length < 2) return null;
    const prev = prices[prices.length - 2];
    const curr = prices[prices.length - 1];
    if (prev === 0) return null;
    const pct = ((curr - prev) / prev) * 100;
    if (pct < -2) return { dir: "down", pct, label: `↓ ${Math.abs(pct).toFixed(0)}%`, cls: "trend-down" };
    if (pct >  2) return { dir: "up",   pct, label: `↑ ${Math.abs(pct).toFixed(0)}%`, cls: "trend-up" };
    return { dir: "flat", pct, label: "→ Стабилна", cls: "trend-flat" };
}

function renderPriceHistory(offer) {
    const history = offer.price_history;
    if (!history || history.length === 0) return "";

    const currentPrice = offer.new_price;
    const lowestPrice = offer.lowest_price;
    const avgPrice = offer.avg_price;

    // Build full point list: history entries + current price if not already the last entry
    const points = history.filter(e => e.price != null);
    if (points.length === 0) return "";

    const lastInHistory = points[points.length - 1];
    const today = new Date().toISOString().slice(0, 10);
    if (currentPrice != null && (lastInHistory.price !== currentPrice || lastInHistory.date !== today)) {
        points.push({ date: today, price: currentPrice, discount_pct: offer.discount_pct || 0, _current: true });
    }

    const prices = points.map(e => e.price);
    const maxP = Math.max(...prices);
    const minP = Math.min(...prices);
    const range = maxP - minP || 0.01;

    const trend = getPriceTrend(offer);
    const hasRealHistory = history.length >= 2;
    const isLowest = hasRealHistory && currentPrice != null && lowestPrice != null && currentPrice <= lowestPrice;
    const aboveAvg = hasRealHistory && avgPrice != null && currentPrice != null && currentPrice > avgPrice * 1.05;

    const badge = isLowest
        ? `<span class="ph-badge ph-lowest">📉 Историческо дъно</span>`
        : aboveAvg
        ? `<span class="ph-badge ph-above">↑ Над средната</span>`
        : trend
        ? `<span class="ph-badge ${trend.cls}">${trend.label}</span>`
        : `<span class="ph-badge ph-tracking">📊 Проследяване от ${history[0]?.date || "—"}</span>`;

    const bars = points.map((e, i) => {
        const h = Math.round(((e.price - minP) / range) * 36) + 6;
        const isCurrent = e._current;
        const isPromo = e.discount_pct > 0;
        const isLow = lowestPrice != null && e.price <= lowestPrice;
        const cls = [isCurrent ? "current" : "", isPromo ? "promo" : isLow ? "low" : ""].filter(Boolean).join(" ");
        const label = `${e.date}\n${e.price.toFixed(2)} лв${e.discount_pct ? ` · -${e.discount_pct}%` : ""}`;
        return `
            <div class="ph-col" title="${label}">
                <div class="ph-price-label">${e.price.toFixed(2)}</div>
                <div class="ph-bar ${cls}" style="height:${h}px"></div>
                <div class="ph-date-label">${e.date.slice(5)}</div>
            </div>`;
    }).join("");

    const statsHtml = hasRealHistory ? `
            <div class="ph-stats">
                <span>Дъно: <strong class="green">${lowestPrice != null ? lowestPrice.toFixed(2) + " лв" : "—"}</strong></span>
                <span>Средна: <strong>${avgPrice != null ? avgPrice.toFixed(2) + " лв" : "—"}</strong></span>
                <span>Сега: <strong>${currentPrice != null ? currentPrice.toFixed(2) + " лв" : "—"}</strong></span>
            </div>` : "";

    return `
        <div class="price-history">
            <div class="ph-header">
                <span>Ценова история · ${points.length} ${points.length === 1 ? "запис" : "записа"}</span>
                ${badge}
            </div>
            <div class="ph-chart">${bars}</div>
            ${statsHtml}
        </div>`;
}

function renderIngredientsFlags(offer) {
    const raw = offer.ingredients_raw;
    const flags = offer.ingredients_flags;
    if (!raw && (!flags || flags.length === 0)) return "";
    if (raw && raw.length < 20) return "";

    const lang = (window.I18N && window.I18N.getLang) ? window.I18N.getLang() : "bg";
    const localizedRaw = lang === "en"
        ? (offer.ingredients_en || offer.ingredients_bg || raw)
        : (offer.ingredients_bg || offer.ingredients_en || raw);

    const redCount = (flags || []).filter(f => f.level === "red").length;
    const amberCount = (flags || []).filter(f => f.level === "amber").length;
    const noFlags = !flags || flags.length === 0;

    const t = window.I18N && window.I18N.t ? window.I18N.t.bind(window.I18N) : k => k;

    const summary = noFlags
        ? `<span class="ing-clean">✓ ${t("offer.ing.clean")}</span>`
        : [
            redCount ? `<span class="ing-badge red">${redCount} ${t("offer.ing.harmful")}</span>` : "",
            amberCount ? `<span class="ing-badge amber">${amberCount} ${t("offer.ing.questionable")}</span>` : "",
          ].filter(Boolean).join(" ");

    const flagRows = (flags || []).map(f => `
        <div class="ing-flag ${f.level}">
            <span class="ing-dot"></span>
            <span class="ing-name">${escapeHtml(f.name)}</span>
            <span class="ing-reason">${escapeHtml(f.reason)}</span>
        </div>`).join("");

    const compact = localizedRaw.length > 300 ? localizedRaw.slice(0, 297) + "…" : localizedRaw;

    return `
        <div class="ingredients-block">
            <div class="ing-header">
                <span>${t("offer.ingredients")}</span>
                <div class="ing-summary">${summary}</div>
            </div>
            <div class="ing-raw">${escapeHtml(compact)}</div>
            ${flagRows ? `<div class="ing-flags">${flagRows}</div>` : ""}
        </div>`;
}

function renderIngredientsBlock(offer) {
    const lang = (window.I18N && window.I18N.getLang) ? window.I18N.getLang() : "bg";
    const ingredients = lang === "en"
        ? (offer.ingredients_en || offer.ingredients_bg || (offer.macros || {}).ingredients)
        : (offer.ingredients_bg || offer.ingredients_en || (offer.macros || {}).ingredients);
    if (!ingredients || ingredients.length < 20) return "";
    const t = window.I18N && window.I18N.t ? window.I18N.t.bind(window.I18N) : k => k;
    const compact = ingredients.length > 280 ? `${ingredients.slice(0, 277)}...` : ingredients;
    return `<div class="details-note"><strong>${t("offer.ingredients")}:</strong> ${escapeHtml(compact)}</div>`;
}

function renderPagination(totalCount, totalPages) {
    const pagination = document.getElementById("offers-pagination");
    if (!pagination) return;

    if (totalPages <= 1) {
        pagination.innerHTML = `<div class="pagination-summary">${totalCount} продукта</div>`;
        return;
    }

    const startItem = (currentPage - 1) * OFFERS_PER_PAGE + 1;
    const endItem = Math.min(currentPage * OFFERS_PER_PAGE, totalCount);
    const pages = [];
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, currentPage + 2);

    for (let page = startPage; page <= endPage; page += 1) {
        pages.push(`
            <button class="pagination-btn ${page === currentPage ? "active" : ""}" data-page="${page}">
                ${page}
            </button>
        `);
    }

    pagination.innerHTML = `
        <div class="pagination-summary">Показани ${startItem}-${endItem} от ${totalCount} продукта</div>
        <div class="pagination-controls">
            <button class="pagination-btn" data-page="${currentPage - 1}" ${currentPage === 1 ? "disabled" : ""}>Назад</button>
            ${pages.join("")}
            <button class="pagination-btn" data-page="${currentPage + 1}" ${currentPage === totalPages ? "disabled" : ""}>Напред</button>
        </div>
    `;

    pagination.querySelectorAll("[data-page]").forEach(btn => {
        btn.addEventListener("click", () => {
            const nextPage = Number(btn.dataset.page);
            if (!nextPage || nextPage === currentPage || nextPage < 1 || nextPage > totalPages) return;
            currentPage = nextPage;
            renderOffers(filteredOffersCache);
            window.scrollTo({ top: gridOffsetTop(), behavior: "smooth" });
        });
    });
}

function gridOffsetTop() {
    const grid = document.getElementById("offers-grid");
    return grid ? Math.max(grid.offsetTop - 90, 0) : 0;
}

function renderOffers(offers) {
    const grid = document.getElementById("offers-grid");
    const pagination = document.getElementById("offers-pagination");
    if (!grid) return;

    if (offers.length === 0) {
        grid.innerHTML = '<p style="text-align:center; color:var(--muted);">Няма намерени продукти.</p>';
        if (pagination) pagination.innerHTML = "";
        return;
    }

    const totalPages = Math.max(1, Math.ceil(offers.length / OFFERS_PER_PAGE));
    if (currentPage > totalPages) currentPage = totalPages;
    const start = (currentPage - 1) * OFFERS_PER_PAGE;
    const visibleOffers = offers.filter(o => o.name && o.new_price != null).slice(start, start + OFFERS_PER_PAGE);

    grid.innerHTML = visibleOffers.map(o => {
        const macros = getMacros(o);
        const healthyOffer = isHealthyOffer(o);
        const hasHealthScore = healthyOffer && o.health_score != null;
        const scoreCls = (o.health_score || 0) >= 8 ? "high" : (o.health_score || 0) >= 5 ? "medium" : "low";
        const isHP = healthyOffer && isStrictHighProtein(o);
        const validityShort = getOfferValidityText(o, "short");
        const validityDetail = getOfferValidityText(o, "detail");

        let badges = [];
        if (hasHealthScore) badges.push(`<span class="health-badge ${scoreCls}">★ ${o.health_score}/10</span>`);
        if (isHP) badges.push(`<span class="offer-tag protein-tag">💪 ПРОТЕИН</span>`);
        if (o.is_junk) badges.push(`<span class="offer-tag junk-tag">⚠ JUNK</span>`);
        if (isProcessedMeat(o)) badges.push(`<span class="offer-tag junk-tag">⚠ Преработено месо</span>`);
        if (isCuredLeanMeat(o)) badges.push(`<span class="offer-tag long-lasting">🧂 Солено / сушено</span>`);
        if (o.source_type === "promo") badges.push(`<span class="offer-tag bulk-tag">🔥 Промо</span>`);
        if (o.source_type === "assortment") badges.push(`<span class="offer-tag long-lasting">📋 Асортимент</span>`);
        if (o.shelf_life && o.shelf_life !== "малотраен") badges.push(`<span class="offer-tag long-lasting">📦 ${o.shelf_life}</span>`);
        if (o.is_bulk_worthy && o.category !== "grain" && healthyOffer) badges.push(`<span class="offer-tag bulk-tag">🛒 Едро</span>`);
        const trend = getPriceTrend(o);
        if (trend) badges.push(`<span class="offer-tag ${trend.cls}">${trend.label}</span>`);

        let metaParts = [];
        if (o.weight_raw) metaParts.push(o.weight_raw);
        if (o.price_per_kg) metaParts.push(formatPricePair(o.price_per_kg, o.price_per_kg_eur, "/кг"));

        const stores = o.available_stores && o.available_stores.length > 1
            ? o.available_stores.join(", ")
            : o.store;

        const imgSrc = getOfferImage(o);
        const detailFallbackSrc = hasRealImage(o.image) ? getLocalFallbackImage(o) : "";
        const imgTag = renderOfferThumb(o);

        let proteinValueHtml = "";
        const pm = getProteinMetrics(o);
        if (pm) {
            proteinValueHtml = `<div class="details-row"><strong>Ефективен протеин/евро:</strong> <span class="green">${pm.adjustedProteinPerEur.toFixed(1)}г на €1</span></div>`;
        }

        return `
            <div class="offer-card" data-offer-id="${getOfferDomId(o)}">
                <div class="offer-header">
                    ${imgTag}
                    <div class="offer-info-main">
                        <div class="offer-name">${o.name}</div>
                        <div class="offer-store">${stores}</div>
                        ${validityShort ? `<div class="offer-validity">${validityShort}</div>` : ""}
                        <div class="offer-badges">${badges.join("")}</div>
                    </div>
                    <div class="offer-prices">
                        ${o.discount_pct ? `<span class="discount-pct-badge">-${o.discount_pct}%</span>` : ""}
                        <span class="offer-new-price">${formatPricePair(o.new_price, o.new_price_eur)}</span>
                        ${o.old_price ? `<div class="offer-old-price">${formatPricePair(o.old_price, o.old_price_eur)}</div>` : ""}
                        ${renderSparkline(o)}
                    </div>
                    <span class="offer-arrow">▼</span>
                </div>
                <div class="offer-details">
                    <div class="details-inner">
                        <div class="details-content">
                            ${imgSrc ? `<img src="${imgSrc}" class="offer-big-img${!hasRealImage(o.image) ? " fallback" : ""}" ${detailFallbackSrc ? `data-fallback-src="${detailFallbackSrc}"` : ""} onerror="${detailFallbackSrc ? `if(this.dataset.fallbackSrc&&this.src!==this.dataset.fallbackSrc){this.src=this.dataset.fallbackSrc;this.classList.add('fallback');}else{this.style.display='none';}` : "this.style.display='none'"}">` : ""}
                            ${hasHealthScore ? `<div class="details-row"><strong>Здравен рейтинг:</strong> <span>${o.health_score}/10</span></div>` : ""}
                            ${isCuredLeanMeat(o) ? `<div class="details-row"><strong>Бележка:</strong> <span>Висок протеин, но лек penalty за сол и сушене.</span></div>` : ""}
                            <div class="details-row"><strong>Магазин:</strong> <span>${stores}${o.address ? ' (' + o.address + ')' : ''}</span></div>
                            ${validityDetail ? `<div class="details-row"><strong>Оферта:</strong> <span>${validityDetail}</span></div>` : ""}
                            ${metaParts.length ? `<div class="details-row"><strong>Детайли:</strong> <span>${metaParts.join(" · ")}</span></div>` : ""}
                            ${o.shelf_life && o.shelf_life !== "малотраен" ? `<div class="details-row"><strong>Годност:</strong> <span>${o.shelf_life}</span></div>` : ""}
                            ${proteinValueHtml}
                            ${renderStoreComparisonList(o)}
                            ${macros ? `
                            <div class="details-row macros-header">
                                <strong>Хранителни стойности (на 100г):</strong>
                                <span class="est-badge">стандартни</span>
                            </div>
                            <div class="macros-grid">
                                <div class="macro-item"><div class="macro-val">${macros.kcal}</div><div class="macro-label">ккал</div></div>
                                <div class="macro-item"><div class="macro-val">${macros.p}г</div><div class="macro-label">протеин</div></div>
                                <div class="macro-item"><div class="macro-val">${macros.f}г</div><div class="macro-label">мазнини</div></div>
                                <div class="macro-item"><div class="macro-val">${macros.c}г</div><div class="macro-label">въгл.</div></div>
                                ${macros.sugar != null ? `<div class="macro-item"><div class="macro-val">${macros.sugar}г</div><div class="macro-label">захар</div></div>` : ""}
                                ${macros.fiber != null ? `<div class="macro-item"><div class="macro-val">${macros.fiber}г</div><div class="macro-label">фибри</div></div>` : ""}
                            </div>` : ""}
                            ${renderIngredientsFlags(o)}
                            ${renderPriceHistory(o)}
                            ${renderIngredientsBlock(o)}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join("");

    renderPagination(offers.length, totalPages);
    initOfferAccordion();
}

/* -----------------------------------------------------------------------
   PRICE COMPARISON
   ----------------------------------------------------------------------- */
function renderPriceComparison() {
    const container = document.getElementById("price-comparison");
    if (!container) return;

    const comparisonKeys = [...new Set(
        allOffers
            .map(offer => offer._comparisonKey)
            .filter(Boolean)
    )];

    const comparisons = comparisonKeys
        .map(key => getBestComparableOffersByStore(key))
        .filter(items => items.length > 1)
        .map(items => {
            const best = items[0];
            const second = items[1];
            const worst = items[items.length - 1];
            const saving = second ? Math.max(0, second.new_price - best.new_price) : 0;
            const bestHealth = Math.max(...items.map(item => item.health_score || 0));
            return { best, items, worst, saving, bestHealth };
        })
        .filter(({ best, worst, saving }) => worst && best && worst.new_price > best.new_price && saving > 0)
        .sort((a, b) => {
            if (b.bestHealth !== a.bestHealth) return b.bestHealth - a.bestHealth;
            if (b.items.length !== a.items.length) return b.items.length - a.items.length;
            if (b.saving !== a.saving) return b.saving - a.saving;
            return a.best.new_price - b.best.new_price;
        })
        .slice(0, 12);

    if (!comparisons.length) {
        container.innerHTML = '<p style="color:var(--muted);">Още няма достатъчно припокриващи се продукти за сравнение.</p>';
        return;
    }

    container.innerHTML = comparisons.map(({ best, items, worst, saving }) => `
        <div class="comparison-card">
            <div class="comparison-card-head">
                <div>
                    <div class="comparison-name">${best.name}</div>
                    <div class="comparison-subtitle">${items.length} магазина · най-евтино в ${best.store}</div>
                </div>
                <div>
                    <div class="comparison-price">${formatPricePair(best.new_price, best.new_price_eur)}</div>
                    <button class="comparison-open-btn" data-offer-link="${getOfferDomId(best)}">Отвори продукта</button>
                </div>
            </div>
            <div class="comparison-list">
                ${items.slice(0, 5).map((item, index) => `
                    <div class="comparison-row ${index === 0 ? "best" : ""}">
                        <span>${item.store}</span>
                        <span>${formatPricePair(item.new_price, item.new_price_eur)}${item.source_type === "promo" ? " · промо" : ""}</span>
                    </div>
                `).join("")}
            </div>
            <div class="comparison-footer">
                ${saving > 0 ? `Спестяване спрямо следващата цена: <span class="green">${saving.toFixed(2)} лв</span>` : "Без голяма разлика между магазините"}
                ${worst && worst !== best ? ` · най-висока цена: ${formatPricePair(worst.new_price, worst.new_price_eur)} в ${worst.store}` : ""}
            </div>
        </div>
    `).join("");

    bindOfferLinkButtons(container);
}

/* -----------------------------------------------------------------------
   BULK RECOMMENDATIONS
   ----------------------------------------------------------------------- */
function renderBulkRecommendations() {
    const container = document.getElementById("bulk-recommendations");
    if (!container) return;

    const bulkItems = allOffers
        .filter(o => o.is_bulk_worthy && isHealthyOffer(o) && (o.health_score || 0) >= 7)
        .sort((a, b) => {
            if ((b.health_score || 0) !== (a.health_score || 0)) return (b.health_score || 0) - (a.health_score || 0);
            const ppkA = a.price_per_kg || 999;
            const ppkB = b.price_per_kg || 999;
            if (ppkA !== ppkB) return ppkA - ppkB;
            return (b.discount_pct || 0) - (a.discount_pct || 0);
        });

    if (bulkItems.length === 0) {
        container.innerHTML = '<p style="color:var(--muted);">Няма bulk оферти тази седмица.</p>';
        return;
    }

    const categoryLabels = {
        grain:  "🌾 Зърнени",
        legume: "🫘 Бобови",
        canned: "🥫 Консерви",
        nuts:   "🥜 Ядки",
        fat:    "🫒 Мазнини",
        dairy:  "🥛 Млечни",
    };

    container.innerHTML = `
        <div class="bulk-grid">
            ${bulkItems.slice(0, 12).map(item => {
                const savings = item.old_price ? ((item.old_price - item.new_price) * 5).toFixed(2) : null;
                const validityText = getOfferValidityText(item, "short");
                return `
                    <div class="bulk-card">
                        <div class="bulk-card-top">
                            ${renderOfferThumb(item)}
                            <div>
                                <div class="bulk-category">${categoryLabels[item.category] || item.category}</div>
                                <div class="offer-name">${item.name}</div>
                            </div>
                        </div>
                        <div class="bulk-price">${formatPricePair(item.new_price, item.new_price_eur)}</div>
                        ${validityText ? `<div class="bulk-meta">${validityText}</div>` : ""}
                        ${item.price_per_kg ? `<div class="bulk-meta">${formatPricePair(item.price_per_kg, item.price_per_kg_eur, "/кг")}</div>` : ""}
                        ${savings ? `<div class="bulk-tip">Купи 5 броя и спести ~${savings} лв.</div>` : `<div class="bulk-tip">Добра покупка за по-рядко зареждане.</div>`}
                        <button class="comparison-open-btn mt-16" data-offer-link="${getOfferDomId(item)}">Отвори продукта</button>
                    </div>
                `;
            }).join("")}
        </div>
    `;

    bindOfferLinkButtons(container);
}

/* -----------------------------------------------------------------------
   PROTEIN VALUE RANKING
   Only items with:
   - known weight AND price_per_kg (no 500g fallback distortion)
   - real food (not junk, not non-food)
   - belongs to a protein-relevant category OR passes strict HP test
   ----------------------------------------------------------------------- */
function renderProteinRanking() {
    const container = document.getElementById("protein-ranking");
    if (!container) return;

    const items = allOffers.filter(o => isValidProteinValueOffer(o));

    if (items.length === 0) {
        container.innerHTML = '<p style="color:var(--muted);">Няма данни за протеинов анализ.</p>';
        return;
    }

    const ranked = items.map(o => {
        const metrics = getProteinMetrics(o, true); // strict: real weight only
        return metrics ? { ...o, _macros: getMacros(o), ...metrics } : null;
    }).filter(Boolean).sort((a, b) => b.adjustedProteinPerEur - a.adjustedProteinPerEur);

    const top = ranked.slice(0, 10);

    let html = top.map((o, i) => {
        const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
        const barWidth = Math.round((o.adjustedProteinPerEur / top[0].adjustedProteinPerEur) * 100);
        const m = o._macros;
        return `
            <div class="protein-rank-item offer-card">
                <div class="protein-rank-header offer-header">
                    <div class="rank-medal">${medal}</div>
                    ${renderOfferThumb(o)}
                    <div class="rank-info">
                        <div class="rank-name">${o.name}</div>
                        <div class="rank-meta">${m.p}г протеин/100г · ${m.f}г мазнини · ${m.c}г въгл. · ${formatPricePair(o.new_price, o.new_price_eur)} · ${o.store}${getOfferValidityText(o, "short") ? ` · ${getOfferValidityText(o, "short")}` : ""}</div>
                        <div class="rank-bar-bg"><div class="rank-bar-fill" style="width:${barWidth}%"></div></div>
                    </div>
                    <div class="rank-value">${o.adjustedProteinPerEur.toFixed(1)}г/€</div>
                    <span class="offer-arrow">▼</span>
                </div>
                <div class="offer-details">
                    <div class="details-inner">
                        <div class="details-content">
                            <div class="details-row"><strong>Ефективен протеин/евро:</strong> <span class="green">${o.adjustedProteinPerEur.toFixed(1)}г</span></div>
                            <div class="details-row"><strong>Суров протеин/евро:</strong> <span>${o.rawProteinPerEur.toFixed(1)}г</span></div>
                            <div class="details-row"><strong>Чистота на протеина:</strong> <span>${(o.purity * 100).toFixed(0)}%</span></div>
                            ${isCuredLeanMeat(o) ? `<div class="details-row"><strong>Бележка:</strong> <span>Лек penalty за сол/сушене, но без penalty за готвене.</span></div>` : ""}
                            ${o.edibleYield < 1 ? `<div class="details-row"><strong>Корекция за ядлив добив:</strong> <span>${Math.round(o.edibleYield * 100)}%</span></div>` : ""}
                            ${o.proteinQuality !== 1 ? `<div class="details-row"><strong>Коефициент за качество:</strong> <span>${o.proteinQuality.toFixed(2)}x</span></div>` : ""}
                            <div class="details-row"><strong>Цена:</strong> <span>${formatPricePair(o.new_price, o.new_price_eur)}</span></div>
                            <div class="details-row"><strong>Макроси:</strong> <span>${m.p}г P · ${m.f}г F · ${m.c}г C</span></div>
                            ${renderIngredientsFlags(o)}
                            ${renderPriceHistory(o)}
                        </div>
                    </div>
                </div>
            </div>`;
    }).join("");

    container.innerHTML = html;
    initProteinRankingAccordion();
}

function renderBaselineRecommendations() {
    const container = document.getElementById("baseline-recommendations");
    if (!container) return;

    const categoryLabels = {
        protein: "🥩 Чист протеин",
        dairy: "🥛 Млечни",
        legume: "🫘 Бобови",
        canned: "🥫 Консерви",
        grain: "🌾 Зърнени",
        fat: "🫒 Мазнини",
    };

    const staples = allCatalogProducts
        .filter(product => {
            const profile = getOfferProfile(product);
            if (!product.name || !profile.is_healthy) return false;
            if (profile.health_score < 8) return false;
            if (!["protein", "dairy", "legume", "canned", "grain", "fat"].includes(product.category)) return false;
            if ((product.avg_price ?? product.lowest_price ?? product.new_price) == null) return false;
            if (BASELINE_RECOMMENDATION_EXCLUDE_KEYWORDS.some(kw => getOfferNameLower(product).includes(kw))) return false;
            return true;
        });

    const takeUnique = (items, limit) => {
        const unique = [];
        const seen = new Set();
        for (const item of items) {
            const key = normalizeProductKey(item.name);
            if (!key || seen.has(key)) continue;
            seen.add(key);
            unique.push(item);
            if (unique.length >= limit) break;
        }
        return unique;
    };

    const strongestBase = takeUnique(
        staples
            .filter(item => {
                const profile = getOfferProfile(item);
                if (!["protein", "dairy"].includes(item.category)) return false;
                return profile.everyday_base && profile.health_score >= 9;
            })
            .sort((a, b) => {
                const aMetrics = getProteinMetrics(a, true)?.adjustedProteinPerLev || 0;
                const bMetrics = getProteinMetrics(b, true)?.adjustedProteinPerLev || 0;
                if (bMetrics !== aMetrics) return bMetrics - aMetrics;
                return (b.health_score || 0) - (a.health_score || 0);
            }),
        4
    );

    const cheapestProtein = takeUnique(
        staples
            .filter(item => ["protein", "dairy", "legume", "canned"].includes(item.category))
            .sort((a, b) => {
                const aMetrics = getProteinMetrics(a, true)?.adjustedProteinPerLev || 0;
                const bMetrics = getProteinMetrics(b, true)?.adjustedProteinPerLev || 0;
                if (bMetrics !== aMetrics) return bMetrics - aMetrics;
                return (a.new_price || 999) - (b.new_price || 999);
            }),
        4
    );

    const durableStaples = takeUnique(
        staples
            .filter(item => item.is_long_lasting || ["canned", "legume", "grain", "fat"].includes(item.category))
            .sort((a, b) => {
                const aMetrics = getProteinMetrics(a, true)?.adjustedProteinPerLev || 0;
                const bMetrics = getProteinMetrics(b, true)?.adjustedProteinPerLev || 0;
                if (bMetrics !== aMetrics) return bMetrics - aMetrics;
                return (a.new_price || 999) - (b.new_price || 999);
            }),
        4
    );

    const groups = [
        {
            title: "Най-силна база",
            subtitle: "Продукти, около които можеш да строиш хранене всеки ден",
            items: strongestBase,
        },
        {
            title: "Най-евтин протеин",
            subtitle: "Най-много качествен протеин за парите",
            items: cheapestProtein,
        },
        {
            title: "Дълготрайни и удобни",
            subtitle: "Стават за шкаф, бърз запас и по-умно пазаруване",
            items: durableStaples,
        },
    ].filter(group => group.items.length);

    if (!groups.length) {
        container.innerHTML = '<p style="color:var(--muted);">Няма достатъчно базови продукти в каталога.</p>';
        return;
    }

    container.innerHTML = `
        ${groups.map(group => `
            <div class="baseline-group">
                <div class="section-title baseline-title">
                    <h3>${group.title}</h3>
                    <p class="section-subtitle">${group.subtitle}</p>
                </div>
                <div class="bulk-grid">
                    ${group.items.map(item => {
                        const typical = item.avg_price ?? item.new_price;
                        const lowest = item.lowest_price ?? null;
                        const metrics = getProteinMetrics(item, true);
                        return `
                            <div class="bulk-card">
                                <div class="bulk-card-top">
                                    ${renderOfferThumb(item)}
                                    <div>
                                        <div class="bulk-category">${categoryLabels[item.category] || item.category}</div>
                                        <div class="offer-name">${item.name}</div>
                                    </div>
                                </div>
                                <div class="bulk-price">Обичайна цена ~${formatRoundedHalfLev(typical)} лв</div>
                                ${lowest != null ? `<div class="bulk-meta">Най-ниска видяна: ${formatRoundedHalfLev(lowest)} лв</div>` : ""}
                                ${item.price_per_kg ? `<div class="bulk-meta">${formatPricePair(item.price_per_kg, item.price_per_kg_eur, "/кг")}</div>` : ""}
                                ${metrics ? `<div class="bulk-tip">Около ${metrics.adjustedProteinPerLev.toFixed(1)} г ефективен протеин на 1 лв.</div>` : `<div class="bulk-tip">Силен базов продукт дори когато не е на промоция.</div>`}
                            </div>
                        `;
                    }).join("")}
                </div>
            </div>
        `).join("")}
    `;
}

/* -----------------------------------------------------------------------
   PROFILE RECOMMENDATIONS
   ----------------------------------------------------------------------- */
function renderProfileRecommendations(profile) {
    const container = document.getElementById("profile-recommendations");
    if (!container) return;

    let filtered;
    if (profile === "all") {
        filtered = allOffers.filter(o => isHealthyOffer(o) && o.health_score != null);
    } else {
        filtered = allOffers.filter(o => isHealthyOffer(o) && o.health_score != null && o.diet_tags && o.diet_tags.includes(profile));
    }

    filtered.sort((a, b) => {
        if ((b.health_score || 0) !== (a.health_score || 0)) return (b.health_score || 0) - (a.health_score || 0);
        return (a.price_per_kg || 999) - (b.price_per_kg || 999);
    });

    const top5 = filtered.slice(0, 5);

    const profileLabels = {
        all: "всички", high_protein: "High Protein", keto: "Keto",
        mediterranean: "Mediterranean", vegetarian: "Vegetarian", budget: "Budget",
    };

    if (top5.length === 0) {
        container.innerHTML = '<p style="color:var(--muted);">Няма препоръки за този профил тази седмица.</p>';
        return;
    }

    let html = profile !== "all"
        ? `<p style="color:var(--green); font-weight:600; margin-bottom:16px;">Тази седмица за твоя ${profileLabels[profile]} профил:</p>`
        : "";

    html += top5.map(o => `
        <div class="offer-card" style="margin-bottom:8px;">
            <div class="offer-header">
                ${renderOfferThumb(o)}
                <div class="offer-info">
                    <div class="offer-name">${o.name}</div>
                    <div class="offer-store">${o.store} — <em class="green">${formatPricePair(o.new_price, o.new_price_eur)}</em></div>
                    <div class="health-badge high">★ ${o.health_score}/10</div>
                    ${o.price_per_kg ? `<div style="font-size:0.8rem; color:var(--muted); margin-top:4px;">${formatPricePair(o.price_per_kg, o.price_per_kg_eur, "/кг")}</div>` : ""}
                </div>
            </div>
        </div>`).join("");

    container.innerHTML = html;
}

function bindOfferLinkButtons(root) {
    if (!root) return;
    root.querySelectorAll("[data-offer-link]").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            openOfferInGrid(btn.dataset.offerLink);
        });
    });
}

/* -----------------------------------------------------------------------
   ACCORDIONS
   ----------------------------------------------------------------------- */
function initOfferAccordion() {
    const grid = document.getElementById("offers-grid");
    if (!grid || grid.dataset.accordionBound === "1") return;
    grid.dataset.accordionBound = "1";
    grid.addEventListener("click", (e) => {
        const card = e.target.closest(".offer-card");
        if (!card || !grid.contains(card)) return;
        const wasExpanded = card.classList.contains("expanded");
        grid.querySelectorAll(".offer-card.expanded").forEach(c => { if (c !== card) c.classList.remove("expanded"); });
        card.classList.toggle("expanded", !wasExpanded);
    });
}

function initProteinRankingAccordion() {
    const container = document.getElementById("protein-ranking");
    if (!container || container.dataset.accordionBound === "1") return;
    container.dataset.accordionBound = "1";
    container.addEventListener("click", (e) => {
        const card = e.target.closest(".protein-rank-item");
        if (!card || !container.contains(card)) return;
        const wasExpanded = card.classList.contains("expanded");
        container.querySelectorAll(".protein-rank-item.expanded").forEach(c => { if (c !== card) c.classList.remove("expanded"); });
        card.classList.toggle("expanded", !wasExpanded);
    });
}
