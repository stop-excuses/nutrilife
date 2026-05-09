/* ========================================
   NutriLife — Offers Logic
   ======================================== */

let allOffers = [];
let fuseIndex = null;
let activeType = "all";
let activeCategory = "all";
let activeNutType = "all";
let activeBreadType = "all";
let activeGrainType = "all";
let activeStore = "all";
let activeSort = "recommended";
let searchQuery = "";
let currentPage = 1;
let filteredOffersCache = [];
let allCatalogProducts = [];
let favoriteItems = (() => {
    const raw = JSON.parse(localStorage.getItem('nutrilife-favorites') || '[]');
    if (raw.length && typeof raw[0] === 'string') return raw.map(kw => ({ kw, emoji: '🍽️' }));
    return raw;
})();
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
    "таблетки за съдомиялна", "веро", "белина",
    "нож за", "тиган", "тенджера", "купа за"
];

const JUNK_FOOD_KEYWORDS = ["кроасан", "баничк", "банич"];

const BABY_FOOD_BRANDS = [
    "bebelan", "bionino", "plasmon", "holle", "gerber", "nutrino lab",
    "frisolac", "aptamil", "topfer", "cremilac"
];

function isBabyFoodName(nameLower) {
    if (BABY_FOOD_BRANDS.some(b => nameLower.includes(b))) return true;
    // Слънчо baby brand — whole-word match to avoid "слънчогледово" false positive
    if (/(^| )слънчо( |$)/.test(nameLower)) return true;
    const hasAgeMarker = /\d+\s*[+]?\s*ме/.test(nameLower)
        || nameLower.includes("за кърмачета")
        || nameLower.includes("за деца");
    if (!hasAgeMarker) return false;
    return nameLower.includes("пюре") || nameLower.includes("каша") || nameLower.includes("мляко")
        || nameLower.includes("нектар") || nameLower.includes("сок");
}

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
    ["маслиново масло", "images/foods/olive-oil.svg"],
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
    ["пълнозърнест", "images/foods/rye-bread.svg"],
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
    ["шамфъстък", "images/foods/nuts.svg"],
    ["кашу", "images/foods/nuts.svg"],
    ["лешник", "images/foods/nuts.svg"],
    ["пекан", "images/foods/nuts.svg"],
    ["макадамия", "images/foods/nuts.svg"],
    ["орех", "images/foods/walnuts.svg"],
    ["фъст", "images/foods/peanuts.svg"],
    // Oils & fats
    ["зехтин", "images/foods/olive-oil.svg"],
    ["краве масло", "images/foods/butter.svg"],
    ["олио", "images/foods/olive-oil.svg"],
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
const FOOD_OVERRIDE_KEYWORDS = ["оцет", "балсамов", "балсамика", "сос", "хляб"];

function normalizeOfferCategory(offer) {
    const nameLower = getOfferNameLower(offer);
    if (EXACT_NON_FOOD_NAMES.has(nameLower.trim())) return "household";
    if (matchesCuredLeanMeat(offer)) return "protein";
    if (NON_HUMAN_FOOD_KEYWORDS.some(kw => nameLower.includes(kw))) return "pet";
    // Baby food — never show in adult food filters
    if (isBabyFoodName(nameLower)) return "other";
    // Coffee & tea misclassified as grain or vegetable → drinks
    if ((nameLower.includes("кафе") || nameLower.includes("coffee")) && offer.category === "grain") return "drinks";
    if ((nameLower.startsWith("чай ") || nameLower === "чай") && offer.category !== "drinks") return "drinks";
    const isClearlyFood = FOOD_OVERRIDE_KEYWORDS.some(kw => nameLower.includes(kw));
    if (!isClearlyFood && HOUSEHOLD_CATEGORY_KEYWORDS.some(kw => nameLower.includes(kw))) return "household";
    if (!isClearlyFood && HYGIENE_CATEGORY_KEYWORDS.some(kw => nameLower.includes(kw))) return "hygiene";
    if (JUNK_FOOD_KEYWORDS.some(kw => nameLower.includes(kw))) return "grain";
    // Smoothies/juices misclassified as nuts due to chia/coconut/etc keywords
    if (nameLower.includes("смути") || nameLower.includes("smoothie")) return "vegetable";
    // Spice mixes / seasonings → exclude from food categories
    if (nameLower.includes("подправка")) return "other";
    // Spices misclassified as nuts (nutmeg, cinnamon, cumin etc.)
    if (nameLower.includes("орехче") || nameLower.includes("канела") || nameLower.includes("кимион")
        || nameLower.includes("куркума") || nameLower.includes("джинджифил") || nameLower.includes("кардамон")
        || nameLower.includes("анасон") || nameLower.includes("кориандър")) return "other";
    // Canned/jarred legumes belong in legume, not canned (буркан боб, консерва нахут, etc.)
    if (offer.category === "canned" && (
        nameLower.includes("боб") || nameLower.includes("нахут") ||
        nameLower.includes("леща") || nameLower.includes("грах") ||
        nameLower.includes("фасул")
    )) return "legume";
    // Meat products misclassified as nuts because of the "Орехите" brand name
    if (offer.category === "nuts" && (
        nameLower.includes("сушеница") || nameLower.includes("бабек") ||
        nameLower.includes("луканк") || nameLower.includes("салам") ||
        nameLower.includes("суджук") || nameLower.includes("шунка") ||
        nameLower.includes("кренвирш") || nameLower.includes("наденица") ||
        nameLower.includes("деликатес пуешки") || nameLower.includes("деликатес пилешки")
    )) return "protein";
    // Bars, cookies, porridges misclassified as nuts because of ingredient keywords
    if (offer.category === "nuts" && (
        nameLower.includes("курабийк") || nameLower.includes("курабийниц") ||
        nameLower.includes("меденка") || nameLower.includes("ореховка") ||
        nameLower.includes("ечемичен") ||
        nameLower.includes(" бар ") || nameLower.endsWith(" бар") ||
        nameLower.includes("натурален бар") || nameLower.includes("суров бар") ||
        nameLower.includes("протеинов бар") || nameLower.includes("снак") ||
        nameLower.includes("каша") || nameLower.includes("мюсли") || nameLower.includes("гранол") ||
        nameLower.includes("вафла") || nameLower.includes("шоколад") || nameLower.includes("десерт") ||
        nameLower.includes("зърнени ядки") || nameLower.includes("ечемичени ядки") ||
        nameLower.includes("оризови ядки") || nameLower.includes("кокосов продукт") ||
        nameLower.includes("кокосов напитка") || nameLower.includes("заквасен кокос") ||
        nameLower.includes("зърнена закуска")
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
// Products that contain a protein/dairy keyword but are composite/baby/processed — exclude from comparison
const COMPARISON_DISQUALIFY_KEYWORDS = [
    "пюре", "спагети", "паста", "супа", "бебе", "детска", "детско", "бебешко",
    "нудли", "равиоли", "лазаня", "тестени", "консерва", "пастет"
];

function getComparisonKey(offer) {
    const nameLower = getOfferNameLower(offer);
    if (COMPARISON_DISQUALIFY_KEYWORDS.some(kw => nameLower.includes(kw))) return null;
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
    ["орех", "орехи", "walnut"],
    ["бадем", "бадеми", "almond"],
    ["кашу", "cashew"],
    ["шамфъстък", "шамфъстъци", "pistachio"],
    ["лешник", "лешници", "hazelnut"],
    ["олио", "слънчогледово олио", "рапично олио", "растително масло"],
    ["зехтин", "маслиново масло", "olive oil"],
];

// Keywords for bread sub-filter buttons
const BREAD_TYPE_KEYWORDS = {
    "пълнозърнест": ["пълнозърн"],
    "ръжен":        ["ръжен", "ръж"],
    "типов":        ["типов"],
    "тостер":       ["тостер", "тост"],
    "бял":          ["бял"],
    "здравословен": ["пълнозърн", "ръжен", "ръж"],
};

const GRAIN_TYPE_KEYWORDS = {
    "полезни": ["пълнозърн", "елда", "киноа", "булгур"],
};

// Keywords for nut sub-filter buttons — any match → show product
const NUT_TYPE_KEYWORDS = {
    "орех":      ["орех"],
    "бадем":     ["бадем"],
    "кашу":      ["кашу"],
    "фъстък":    ["фъстък"],
    "шамфъстък": ["шамфъстък"],
    "лешник":    ["лешник"],
    "микс":      ["микс", "mix", "коктейл", "парти"],
};

// Searching these terms jumps straight to the matching category (no name-substring ambiguity).
// Covers nut terms specifically because "орехите" is a meat brand and "овесени ядки" ≠ nuts.
const SEARCH_CATEGORY_SHORTCUTS = {
    "ядки": "nuts",
    "орехи": "nuts",
    "орех": "nuts",
    "бадем": "nuts",
    "бадеми": "nuts",
    "кашу": "nuts",
    "шамфъстък": "nuts",
    "шамфъстъци": "nuts",
    "лешник": "nuts",
    "лешници": "nuts",
    "фъстъци": "nuts",
    "пекани": "nuts",
    "макадамия": "nuts",
};

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
        // Cross-catalog image sharing: builds maps used by getLocalFallbackImage().
        if (typeof ALL_PRODUCTS_DATA !== 'undefined') {
            liveFallbackByKeyword = new Map();
            liveFallbackByCategory = new Map();

            const BG_STOP_WORDS = new Set(["за","от","с","без","и","или","в","на","при","до","по","над","под","пред","след"]);
            const getImgWords = name => (name || "").toLowerCase()
                .replace(/\d+([.,]\d+)?\s*(кг|г|гр|мл|л|бр|kg|g|ml|l|x|×)/g, " ")
                .split(/[\s,.\-/()]+/)
                .filter(w => w.length > 2 && !BG_STOP_WORDS.has(w));

            // Build inverted index: word → array of {image} for catalog products with real photos
            const wordIndex = new Map();
            for (const p of (ALL_PRODUCTS_DATA.products || [])) {
                if (!hasExternalImage(p.image)) continue;
                const nameLower = (p.name || "").toLowerCase();
                // Keyword-level fallback (kept for getLocalFallbackImage)
                for (const [keyword] of LOCAL_IMAGE_RULES) {
                    if (nameLower.includes(keyword) && !liveFallbackByKeyword.has(keyword)) {
                        liveFallbackByKeyword.set(keyword, p.image);
                        break;
                    }
                }
                // Category-level
                if (p.category && !liveFallbackByCategory.has(p.category)) {
                    liveFallbackByCategory.set(p.category, p.image);
                }
                // Word index
                for (const w of getImgWords(p.name)) {
                    if (!wordIndex.has(w)) wordIndex.set(w, []);
                    wordIndex.get(w).push(p.image);
                }
            }

            const assignLiveImage = (offer) => {
                if (hasExternalImage(offer.image)) return;
                const words = getImgWords(offer.name);
                const minMatch = words.length >= 2 ? 2 : 1;

                // Count how many query words each catalog image matches
                const scores = new Map();
                for (const w of words) {
                    for (const img of (wordIndex.get(w) || [])) {
                        scores.set(img, (scores.get(img) || 0) + 1);
                    }
                }
                let bestImg = null, bestScore = minMatch - 1;
                for (const [img, score] of scores) {
                    if (score > bestScore) { bestImg = img; bestScore = score; }
                }
                if (bestImg) { offer.image = bestImg; return; }

                // Keyword-level CDN fallback
                const nameLower = (offer.name || "").toLowerCase();
                for (const [keyword] of LOCAL_IMAGE_RULES) {
                    if (nameLower.includes(keyword) && liveFallbackByKeyword.has(keyword)) {
                        offer.image = liveFallbackByKeyword.get(keyword);
                        return;
                    }
                }
            };
            allOffers.forEach(assignLiveImage);
            allCatalogProducts.forEach(assignLiveImage);
        }
        applyFilters();
        renderFavoritesPanel();
        renderPriceComparison();
        initStaplesGrid();
        renderBulkRecommendations();
        renderProteinRanking();
        renderBaselineRecommendations();
        renderProfileRecommendations("all");
        initTypeFilters();
        initCategoryFilters();
        initNutTypeFilters();
        initBreadTypeFilters();
        initGrainTypeFilters();
        initStoreFilters();
        initProfileFilters();
        initSortButtons();
        initSearch();
        initGlobalOfferHandlers();
    } else {
        const grid = document.getElementById("offers-grid");
        if (grid) {
            grid.innerHTML = '<p style="text-align:center; color:var(--muted);">Проблем при зареждане на данните.</p>';
        }
    }
}

/* -----------------------------------------------------------------------
   GLOBAL OFFER HANDLERS (fav-btn + ph-toggle outside main grid)
   ----------------------------------------------------------------------- */
function initGlobalOfferHandlers() {
    document.addEventListener("click", (e) => {
        const phToggle = e.target.closest("[data-ph-toggle]");
        if (phToggle) {
            phToggle.closest(".price-history").classList.toggle("ph-open");
            return;
        }
        const favBtn = e.target.closest(".fav-btn");
        if (favBtn && favBtn.dataset.offerId) {
            toggleFavorite(favBtn.dataset.offerId);
        }
    });
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
            // Sort ascending by BGN per 100g protein. Only real protein sources
            // (isValidProteinValueOffer) get a finite score — everything else goes last.
            sorted.sort((a, b) => {
                const ma = isValidProteinValueOffer(a) ? getProteinMetrics(a, true) : null;
                const mb = isValidProteinValueOffer(b) ? getProteinMetrics(b, true) : null;
                const va = ma ? (100 / ma.rawProteinPerLev) : Infinity;
                const vb = mb ? (100 / mb.rawProteinPerLev) : Infinity;
                return va - vb;
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
   FAVORITES
   ----------------------------------------------------------------------- */
function saveFavorites() {
    localStorage.setItem('nutrilife-favorites', JSON.stringify(favoriteItems));
}

// User-friendly label and emoji for keywords from LOCAL_IMAGE_RULES
const KEYWORD_LABELS = {
    'яйц':           'Яйца',
    'кисело мляко':  'Кисело мляко',
    'риба тон':      'Риба тон',
    'скумрия':       'Скумрия',
    'сьомга':        'Сьомга',
    'сардини':       'Сардини',
    'херинга':       'Херинга',
    'пилешки гърди': 'Пилешко филе',
    'пилешко филе':  'Пилешко филе',
    'пилешки бут':   'Пилешко бутче',
    'пилешко бутче': 'Пилешко бутче',
    'кайма':         'Кайма',
    'телешко':       'Телешко',
    'говеждо':       'Говеждо',
    'свинско':       'Свинско',
    'пуешко':        'Пуешко',
    'извара':        'Извара',
    'скир':          'Скир',
    'сирене':        'Сирене',
    'маслин':        'Маслини',
    'нахут':         'Нахут',
    'боб':           'Боб',
    'леща':          'Леща',
    'зехтин':        'Зехтин',
    'овес':          'Овесена каша',
    'ориз':          'Ориз',
    'елда':          'Елда',
    'ядки':              'Ядки микс',
    'орех':              'Орехи',
    'бадем':             'Бадеми',
    'кашу':              'Кашу',
    'фъстък':            'Фъстъци',
    'шамфъстък':         'Шамфъстък',
    'лешник':            'Лешници',
    'макадамия':         'Макадамия',
    'пекан':             'Пекани',
    'олио':              'Олио',
    'краве масло':       'Краве масло',
    'пълнозърнест хляб': 'Пълнозърнест хляб',
    'ръжен хляб':        'Ръжен хляб',
    'хляб':              'Хляб',
};

const KEYWORD_EMOJI = {
    'яйц':           '🥚',
    'кисело мляко':  '🥛',
    'риба тон':      '🐟',
    'скумрия':       '🐠',
    'сьомга':        '🐟',
    'пилешки гърди': '🍗',
    'пилешко филе':  '🍗',
    'пилешки бут':   '🍗',
    'пилешко бутче': '🍗',
    'кайма':         '🥩',
    'телешко':       '🥩',
    'говеждо':       '🥩',
    'свинско':       '🥩',
    'извара':        '🧀',
    'скир':          '🍶',
    'сирене':        '🧀',
    'нахут':         '🫘',
    'боб':           '🫘',
    'леща':          '🟤',
    'зехтин':        '🫒',
    'овес':          '🌾',
    'ориз':          '🌾',
    'ядки':              '🥜',
    'орех':              '🌰',
    'бадем':             '🥜',
    'кашу':              '🥜',
    'фъстък':            '🥜',
    'шамфъстък':         '🟢',
    'лешник':            '🌰',
    'олио':              '🫙',
    'краве масло':       '🧈',
    'пълнозърнест хляб': '🌾',
    'ръжен хляб':        '🍞',
    'хляб':              '🍞',
};

function extractFavoriteKeyword(offer) {
    const nl = offer.name.toLowerCase();
    const cat = normalizeOfferCategory(offer);
    // Olive oil unification — зехтин and маслиново масло are the same product
    if (nl.includes("зехтин") || nl.includes("маслиново масло")) return "зехтин";
    // Vegetable oils grouped together
    if (nl.includes("олио")) return "олио";
    // Butter separate from generic масло catch-all
    if (nl.includes("краве масло") || nl.includes("животинско масло")) return "краве масло";
    // Specific nut types each get their own favorite; mixed nuts fall back to "ядки"
    if (cat === 'nuts') {
        const nutOrder = ["шамфъстък", "макадамия", "пекан", "кашу", "лешник", "бадем", "фъстък", "орех"];
        for (const k of nutOrder) { if (nl.includes(k)) return k; }
        return "ядки";
    }
    // Bread category: always return a bread keyword to avoid grain/oat mismatches
    if (cat === 'bread') {
        if (nl.includes("пълнозърн")) return "пълнозърнест хляб";
        if (nl.includes("ръжен") || nl.includes("ръж")) return "ръжен хляб";
        return "хляб";
    }
    for (const [keyword] of LOCAL_IMAGE_RULES) {
        if (nl.includes(keyword)) return keyword;
    }
    // Fallback: first 2 meaningful words, stripped of weight/size info
    const cleaned = nameLower
        .replace(/\s*\d+[\d.,]*\s*(кг|г|гр|мл|л|бр|x|×)\s*/gi, ' ')
        .replace(/\s+/g, ' ').trim();
    const words = cleaned.split(/\s+/).filter(w => w.length > 1).slice(0, 2);
    return words.join(' ') || cleaned || nameLower;
}

function getFavLabel(kw) {
    return KEYWORD_LABELS[kw] || (kw ? kw.charAt(0).toUpperCase() + kw.slice(1) : kw);
}

function getFavEmoji(kw, fallback) {
    return KEYWORD_EMOJI[kw] || fallback || '🍽️';
}

function isFavorited(offer) {
    const kw = extractFavoriteKeyword(offer);
    return favoriteItems.some(f => f.kw === kw);
}

function toggleFavorite(offerId) {
    const offer = allOffers.find(o => getOfferDomId(o) === offerId);
    if (!offer) return;
    const kw = extractFavoriteKeyword(offer);
    const idx = favoriteItems.findIndex(f => f.kw === kw);
    if (idx !== -1) {
        favoriteItems.splice(idx, 1);
    } else {
        favoriteItems.push({ kw, emoji: getFavEmoji(kw, offer.emoji), cat: offer.category || null });
    }
    saveFavorites();
    const active = isFavorited(offer);
    // Update every fav-btn for this keyword across all sections
    document.querySelectorAll('.fav-btn[data-offer-id]').forEach(btn => {
        const o = allOffers.find(x => getOfferDomId(x) === btn.dataset.offerId);
        if (!o || extractFavoriteKeyword(o) !== kw) return;
        btn.classList.toggle('active', active);
        btn.title = active ? 'Премахни от любими' : 'Следи този продукт';
    });
    renderFavoritesPanel();
}

function extractWeightFromName(offer) {
    if (offer.weight_raw && offer.weight_grams) return { raw: offer.weight_raw, grams: offer.weight_grams };
    const m = (offer.name || '').match(/(\d+(?:[.,]\d+)?)\s*(кг|г|гр|мл|л)\b/i);
    if (!m) return null;
    const val = parseFloat(m[1].replace(',', '.'));
    const unit = m[2].toLowerCase().replace('гр', 'г');
    let grams = unit === 'кг' ? val * 1000 : unit === 'л' ? val * 1000 : val;
    if (grams < 10 || grams > 50000) return null;
    return { raw: `${m[1]}${unit}`, grams };
}

function renderFavoritesPanel() {
    const panel = document.getElementById('fav-panel');
    const section = document.getElementById('fav-section');
    if (!panel) return;

    if (favoriteItems.length === 0) {
        if (section) section.style.display = 'none';
        panel.innerHTML = '';
        return;
    }
    if (section) section.style.removeProperty('display');

    const rows = favoriteItems.map(({ kw, emoji, cat }) => {
        const offers = allOffers
            .filter(o => {
                if (!o.name || o.new_price == null) return false;
                if (extractFavoriteKeyword(o) !== kw) return false;
                const nl = o.name.toLowerCase();
                if (isBabyFoodName(nl)) return false;
                if (isClearlyNonHumanFood(o)) return false;
                if (EXCLUDED_HEALTH_CATEGORIES.has(o.category)) return false;
                // Exclude products where kw is an ingredient, not the main product
                // e.g. "баница с извара", "бишкоти с 26% яйца", "тиквички с кисело мляко"
                const kwIdx = nl.indexOf(kw);
                if (kwIdx > 0) {
                    const before = nl.slice(0, kwIdx).trimEnd();
                    const lastChar = before[before.length - 1];
                    if ([',', ';', '%'].includes(lastChar)) return false;
                    // Check last 3 words for prepositions (catches "с 26% яйца" too)
                    const words = before.trim().split(/\s+/);
                    const lastFew = words.slice(-3);
                    if (lastFew.some(w => ['с', 'от', 'в', 'на', 'за', 'и', 'със', 'без'].includes(w))) return false;
                }
                // Category guards: group favorites match only their category
                if (cat === 'canned' && o.category && o.category !== 'canned') return false;
                // Any nut-type favorite (ядки, орех, бадем, etc.) only matches nuts products
                if (cat === 'nuts' && o.category && o.category !== 'nuts') return false;
                return true;
            })
            .sort((a, b) => a.new_price - b.new_price);
        const onSale = offers.filter(o => o.discount_pct);
        const statusHtml = onSale.length > 0
            ? `<span class="fav-status on-sale">🔥 ${onSale.length} намаления</span>`
            : offers.length > 0
            ? `<span class="fav-status">${offers.length} оферти</span>`
            : `<span class="fav-status none">Няма тази седмица</span>`;

        // Sort by normalized price (price_per_kg if available, else price/weight, else raw price last)
        const normPrice = o => {
            if (o.price_per_kg) return o.price_per_kg;
            if (o.weight_grams) return o.new_price * 1000 / o.weight_grams;
            return o.new_price; // яйца, бройни продукти — сортира по обща цена
        };
        const sorted = [...offers].sort((a, b) => normPrice(a) - normPrice(b));
        const FAV_LIMIT = 6;
        const shownOffers = sorted.slice(0, FAV_LIMIT);
        const hiddenCount = sorted.length - FAV_LIMIT;

        const buildOfferRow = (o) => {
            const validity = getOfferValidityText(o, 'short');
            const disc = o.discount_pct ? `<span class="fav-disc">−${o.discount_pct}%</span>` : '';
            const oldPrice = o.old_price ? `<span class="fav-old">${o.old_price.toFixed(2)} лв</span>` : '';
            const wi = extractWeightFromName(o);

            // Price per unit: per-piece for яйца/бр, else per kg
            let unitHtml = '';
            const eggMatch = o.name.match(/(\d+)\s*(?:бр|броя|яйц)/i);
            if (kw === 'яйц' && eggMatch) {
                const perEgg = (o.new_price / parseInt(eggMatch[1])).toFixed(2);
                unitHtml = `<span class="fav-pkg">${perEgg} лв/бр</span>`;
            } else {
                const ppkg = (wi?.grams && o.new_price) ? (o.new_price / wi.grams * 1000) : getReliablePricePerKg(o);
                if (ppkg) unitHtml = `<span class="fav-pkg">${ppkg.toFixed(2)} лв/кг</span>`;
            }

            const weightHtml = wi?.raw ? `<span class="fav-weight">${wi.raw}</span>` : '';
            // Shorten name: strip known brand noise, max 42 chars
            const cleanName = o.name.replace(/\s*\d+[\d.,]*\s*(кг|г|гр|мл|л|бр)\b.*/i, '').trim();
            const thumb = renderOfferThumb(o);
            return `<div class="fav-offer-row" data-offer-id="${getOfferDomId(o)}" title="Виж продукта">
                ${thumb ? `<div class="fav-offer-thumb">${thumb}</div>` : ''}
                <div class="fav-offer-main">
                    <div class="fav-offer-top">
                        <span class="fav-store">${o.store}</span>
                        <span class="fav-name">${cleanName}</span>
                    </div>
                    <div class="fav-offer-btm">
                        <strong class="fav-price">${o.new_price.toFixed(2)} лв</strong>
                        ${disc}${oldPrice}
                        ${weightHtml}${unitHtml}
                        ${validity ? `<span class="fav-validity">${validity}</span>` : ''}
                    </div>
                </div>
                <span class="fav-row-go">›</span>
            </div>`;
        };

        const shownHtml = shownOffers.map(buildOfferRow).join('');
        const hiddenHtml = hiddenCount > 0
            ? `<div class="fav-hidden-rows">${sorted.slice(FAV_LIMIT).map(buildOfferRow).join('')}</div>
               <button class="fav-show-more">+ ${hiddenCount} още</button>`
            : '';

        return `<div class="fav-item" data-kw="${kw}">
            <div class="fav-item-hd">
                <span class="fav-emoji">${getFavEmoji(kw, emoji)}</span>
                <span class="fav-kw">${getFavLabel(kw)}</span>
                ${statusHtml}
                <button class="fav-rm" data-kw="${kw}" title="Премахни">×</button>
                <span class="fav-arrow">▼</span>
            </div>
            <div class="fav-item-bd">
                ${shownHtml || '<div class="fav-none">Няма намаления тази седмица</div>'}
                ${hiddenHtml}
            </div>
        </div>`;
    }).join('');

    panel.innerHTML = `<div class="fav-panel-hd"><span>❤️ Моите любими</span><span class="fav-cnt">${favoriteItems.length}</span></div>
        <div class="fav-panel-bd">${rows}</div>`;

    panel.querySelectorAll('.fav-item-hd').forEach(hd => {
        hd.addEventListener('click', e => {
            if (e.target.closest('.fav-rm')) return;
            hd.closest('.fav-item').classList.toggle('expanded');
        });
    });

    panel.querySelectorAll('.fav-rm').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            const kw = btn.dataset.kw;
            favoriteItems = favoriteItems.filter(f => f.kw !== kw);
            saveFavorites();
            document.querySelectorAll('.fav-btn[data-offer-id]').forEach(b => {
                const o = allOffers.find(x => getOfferDomId(x) === b.dataset.offerId);
                if (!o || extractFavoriteKeyword(o) !== kw) return;
                b.classList.remove('active');
                b.title = 'Следи този продукт';
            });
            renderFavoritesPanel();
        });
    });

    panel.querySelectorAll('.fav-show-more').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            const hiddenRows = btn.previousElementSibling;
            if (hiddenRows && hiddenRows.classList.contains('fav-hidden-rows')) {
                hiddenRows.classList.toggle('fav-hidden-open');
                btn.textContent = hiddenRows.classList.contains('fav-hidden-open') ? '▲ Скрий' : btn.textContent;
            }
        });
    });

    panel.querySelectorAll('.fav-offer-row[data-offer-id]').forEach(row => {
        row.addEventListener('click', () => navigateToOfferCard(row.dataset.offerId));
    });
}

function navigateToOfferCard(offerId) {
    openOfferInGrid(offerId);
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
        const categoryShortcut = SEARCH_CATEGORY_SHORTCUTS[searchQuery];
        if (categoryShortcut) {
            // Exact category match — avoids false positives (e.g. "овесени ядки" ≠ nuts)
            filtered = filtered.filter(o => o.category === categoryShortcut);
        } else if (fuseIndex) {
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

    if (activeCategory === "nuts" && activeNutType !== "all") {
        const keys = NUT_TYPE_KEYWORDS[activeNutType] || [activeNutType];
        filtered = filtered.filter(o => {
            const nl = o.name.toLowerCase();
            return keys.some(k => nl.includes(k));
        });
    }

    if (activeCategory === "bread" && activeBreadType !== "all") {
        const keys = BREAD_TYPE_KEYWORDS[activeBreadType] || [activeBreadType];
        filtered = filtered.filter(o => {
            const nl = o.name.toLowerCase();
            return keys.some(k => nl.includes(k));
        });
    }

    if (activeCategory === "grain" && activeGrainType !== "all") {
        const keys = GRAIN_TYPE_KEYWORDS[activeGrainType] || [activeGrainType];
        filtered = filtered.filter(o => {
            const nl = o.name.toLowerCase();
            return keys.some(k => nl.includes(k));
        });
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
    const nutSubfilters = document.getElementById("nut-subfilters");
    const breadSubfilters = document.getElementById("bread-subfilters");
    const grainSubfilters = document.getElementById("grain-subfilters");
    document.querySelectorAll(".filter-btn[data-category]").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".filter-btn[data-category]").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            activeCategory = btn.dataset.category;
            currentPage = 1;
            if (nutSubfilters) nutSubfilters.classList.toggle("hidden", activeCategory !== "nuts");
            if (breadSubfilters) breadSubfilters.classList.toggle("hidden", activeCategory !== "bread");
            if (grainSubfilters) grainSubfilters.classList.toggle("hidden", activeCategory !== "grain");
            if (activeCategory !== "nuts") {
                activeNutType = "all";
                document.querySelectorAll(".filter-btn[data-nut]").forEach(b => b.classList.toggle("active", b.dataset.nut === "all"));
            }
            if (activeCategory !== "bread") {
                activeBreadType = "all";
                document.querySelectorAll(".filter-btn[data-bread]").forEach(b => b.classList.toggle("active", b.dataset.bread === "all"));
            }
            if (activeCategory !== "grain") {
                activeGrainType = "all";
                document.querySelectorAll(".filter-btn[data-grain]").forEach(b => b.classList.toggle("active", b.dataset.grain === "all"));
            }
            applyFilters();
        });
    });
}

function initNutTypeFilters() {
    document.querySelectorAll(".filter-btn[data-nut]").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".filter-btn[data-nut]").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            activeNutType = btn.dataset.nut;
            currentPage = 1;
            applyFilters();
        });
    });
}

function initBreadTypeFilters() {
    document.querySelectorAll(".filter-btn[data-bread]").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".filter-btn[data-bread]").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            activeBreadType = btn.dataset.bread;
            currentPage = 1;
            applyFilters();
        });
    });
}

function initGrainTypeFilters() {
    document.querySelectorAll(".filter-btn[data-grain]").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".filter-btn[data-grain]").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            activeGrainType = btn.dataset.grain;
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
    activeNutType = "all";
    activeBreadType = "all";
    activeGrainType = "all";
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
    document.querySelectorAll(".filter-btn[data-nut]").forEach(b => b.classList.toggle("active", b.dataset.nut === "all"));
    document.querySelectorAll(".filter-btn[data-bread]").forEach(b => b.classList.toggle("active", b.dataset.bread === "all"));
    document.querySelectorAll(".filter-btn[data-grain]").forEach(b => b.classList.toggle("active", b.dataset.grain === "all"));
    const nutSub = document.getElementById("nut-subfilters");
    const breadSub = document.getElementById("bread-subfilters");
    const grainSub = document.getElementById("grain-subfilters");
    if (nutSub) nutSub.classList.add("hidden");
    if (breadSub) breadSub.classList.add("hidden");
    if (grainSub) grainSub.classList.add("hidden");
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
                    <span>${item.new_price.toFixed(2)} лв${item.source_type === "promo" ? " · промо" : ""}</span>
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
            <div class="ph-header" data-ph-toggle>
                <span>📈 Ценова история · ${points.length} ${points.length === 1 ? "запис" : "записа"}</span>
                ${badge}
                <span class="ph-toggle-arrow">▼</span>
            </div>
            <div class="ph-body">
                <div class="ph-chart">${bars}</div>
                ${statsHtml}
            </div>
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
        if (o.is_junk) badges.push(`<span class="offer-tag junk-tag">⚠ Нездравословно</span>`);
        if (isProcessedMeat(o)) badges.push(`<span class="offer-tag junk-tag">⚠ Преработено месо</span>`);
        const trend = getPriceTrend(o);
        if (trend) badges.push(`<span class="offer-tag ${trend.cls}">${trend.label}</span>`);

        const displayPpk = o.price_per_kg || (o.weight_grams && o.new_price ? (o.new_price / o.weight_grams * 1000) : null);

        let metaParts = [];
        if (o.weight_raw) metaParts.push(o.weight_raw);
        if (o.price_per_kg) metaParts.push(`${o.price_per_kg.toFixed(2)} лв/кг`);

        const stores = o.available_stores && o.available_stores.length > 1
            ? o.available_stores.join(", ")
            : o.store;

        const imgSrc = getOfferImage(o);
        const detailFallbackSrc = hasRealImage(o.image) ? getLocalFallbackImage(o) : "";
        const imgTag = renderOfferThumb(o);

        const pm = getProteinMetrics(o);
        let proteinValueHtml = "";
        let proteinBadgeHtml = "";
        if (pm) {
            const bgnPer100g = (100 / pm.rawProteinPerLev).toFixed(2);
            proteinValueHtml = `<div class="details-row"><strong>Цена на протеина:</strong> <span class="green">${bgnPer100g} лв/100г протеин</span></div>`;
            if (activeSort === "protein_value" && isValidProteinValueOffer(o)) {
                proteinBadgeHtml = `<div class="offer-ppk green">${bgnPer100g} лв/100г протеин</div>`;
            }
        }

        return `
            <div class="offer-card" data-offer-id="${getOfferDomId(o)}">
                <div class="offer-header">
                    <div class="offer-img-cell">
                        ${imgTag}
                    </div>
                    <div class="offer-info-main">
                        <div class="offer-name">${o.name}</div>
                        <div class="offer-store">${stores}</div>
                        ${validityShort ? `<div class="offer-validity">${validityShort}</div>` : ""}
                        <div class="offer-badges">${badges.join("")}</div>
                    </div>
                    <div class="offer-prices">
                        ${o.discount_pct ? `<span class="discount-pct-badge">-${o.discount_pct}%</span>` : ""}
                        <span class="offer-new-price">${o.new_price.toFixed(2)} лв</span>
                        ${o.old_price ? `<div class="offer-old-price">${o.old_price.toFixed(2)} лв</div>` : ""}
                        ${displayPpk ? `<div class="offer-ppk">${displayPpk.toFixed(2)} лв/кг</div>` : ""}
                        ${proteinBadgeHtml}
                        ${renderSparkline(o)}
                    </div>
                    <button class="fav-btn${isFavorited(o) ? ' active' : ''}" data-offer-id="${getOfferDomId(o)}" title="${isFavorited(o) ? 'Премахни от любими' : 'Следи този продукт'}">❤️</button>
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
const STAPLES = [
    { label: 'Яйца',               img: 'images/foods/egg.svg',       match: ['яйц'],                              not: ['майонез', 'крем', 'торта', 'кекс', 'бисквит'] },
    { label: 'Кисело мляко',       img: 'images/foods/yogurt.svg',    match: ['кисело мляко'] },
    { label: 'Пилешко',            img: 'images/foods/chicken.svg',   match: ['пилешко филе', 'пилешки гър', 'пилешко бонл'] },
    { label: 'Скир / Извара',      img: 'images/foods/skyr.svg',      match: ['скир', 'извара'],                   not: ['кюфте', 'баниц', 'баничк', 'пюре', 'тарт', 'крем', 'десерт'] },
    { label: 'Риба тон',           img: 'images/foods/tuna.svg',      match: ['риба тон'],                         not: ['пюре', 'паста', 'бебе', 'детск'] },
    { label: 'Скумрия',            img: 'images/foods/mackerel.svg',  match: ['скумрия'] },
    { label: 'Зехтин',             img: 'images/foods/olive-oil.svg', match: ['зехтин'] },
    { label: 'Овесена каша',       img: 'images/foods/oats.svg',      match: ['овесен', 'овес'],                   not: ['бисквит', 'гранол', 'мюсли', 'бар', 'крем', 'торта', 'кекс'] },
    { label: 'Леща',               img: 'images/foods/lentils.svg',   match: ['леща'] },
    { label: 'Нахут',              img: 'images/foods/chickpeas.svg', match: ['нахут'] },
    { label: 'Орехи',              img: 'images/foods/walnuts.svg',   match: ['орех'],                             not: ['орехч', 'кокос', 'ореховк', 'бисквит', 'кекс', 'торта', 'баниц', 'десерт', 'мюсли', 'шокол'], cat: 'nuts' },
    { label: 'Пълнозърнест хляб',  img: 'images/foods/rye-bread.svg', match: ['пълнозърнест'],                     not: ['брашн', 'гриси', 'бисквит', 'макарон', 'паста', 'фусил', 'пене', 'спагет', 'вермишел'] },
];

function renderPriceComparison() {
    const container = document.getElementById("price-comparison");
    if (!container) return;

    const cards = STAPLES.map(staple => {
        const matching = allOffers.filter(o => {
            const nl = o.name.toLowerCase();
            return staple.match.some(kw => nl.includes(kw))
                && (!staple.not || staple.not.every(bw => !nl.includes(bw)))
                && (!staple.cat || o.category === staple.cat);
        });

        const byStore = {};
        matching.forEach(o => {
            const sortKey = o.price_per_kg || o.new_price;
            const prev = byStore[o.store];
            if (!prev || sortKey < (prev.price_per_kg || prev.new_price)) {
                byStore[o.store] = o;
            }
        });

        const storeList = Object.values(byStore).sort((a, b) =>
            (a.price_per_kg || a.new_price) - (b.price_per_kg || b.new_price)
        );

        // Use real product CDN photo when available; fall back to SVG icon
        const _bestForImg = storeList[0];
        const _isRealPhoto = _bestForImg && hasRealImage(_bestForImg.image);
        const _imgSrc = _isRealPhoto ? _bestForImg.image : (_bestForImg ? getOfferImage(_bestForImg) : staple.img);
        const imgTag = `<img src="${_imgSrc}" alt="${staple.label}" loading="lazy" class="${_isRealPhoto ? 'staple-real-img' : ''}" onerror="this.src='${staple.img}'"/>`;

        if (storeList.length === 0) {
            return `
                <div class="staple-card no-promo">
                    <div class="staple-img-area">${imgTag}</div>
                    <div class="staple-body">
                        <div class="staple-name">${staple.label}</div>
                        <div class="staple-store-badge">не е в промоция</div>
                    </div>
                </div>`; // no fav-btn when no offer exists
        }

        const best = storeList[0];
        const disc = best.discount_pct || 0;
        const dealClass = disc >= 15 ? 'deal-good' : disc >= 5 ? 'deal-ok' : '';
        const discTag = disc ? `<div class="staple-discount-tag">−${disc}%</div>` : '';
        const pkgHtml = best.price_per_kg
            ? `<div class="staple-pkg">${best.price_per_kg.toFixed(2)} лв/кг · ${best.weight_raw || ''}</div>`
            : '';
        const discStr = disc ? ` −${disc}%` : '';
        const othersHtml = storeList.slice(1, 4).map(o => `
            <div class="staple-other-row">
                <span class="s-store">${o.store}</span>
                <span class="s-price">${o.new_price.toFixed(2)} лв</span>
            </div>`).join('');
        const bestId = getOfferDomId(best);
        const favActive = isFavorited(best) ? ' active' : '';

        return `
            <div class="staple-card ${dealClass}" data-offer-link="${bestId}" style="cursor:pointer;">
                <div class="staple-img-area">
                    ${imgTag}
                    ${discTag}
                    <button class="fav-btn${favActive}" data-offer-id="${bestId}" title="${favActive ? 'Премахни от любими' : 'Следи този продукт'}" onclick="event.stopPropagation()">❤️</button>
                </div>
                <div class="staple-body">
                    <div class="staple-name">${staple.label}</div>
                    <div class="staple-best-price">${best.new_price.toFixed(2)} лв</div>
                    ${pkgHtml}
                    <div class="staple-store-badge">${best.store}${discStr}</div>
                    ${othersHtml ? `<div class="staple-others">${othersHtml}</div>` : ''}
                </div>
            </div>`;
    });

    container.innerHTML = `<div class="staples-grid">${cards.join('')}</div>`;
}

function initStaplesGrid() {
    const container = document.getElementById("price-comparison");
    if (!container) return;
    container.addEventListener("click", (e) => {
        const favBtn = e.target.closest(".fav-btn");
        if (favBtn) {
            e.stopPropagation();
            toggleFavorite(favBtn.dataset.offerId);
            return;
        }
        const card = e.target.closest(".staple-card[data-offer-link]");
        if (card) openOfferInGrid(card.dataset.offerLink);
    });
}

/* -----------------------------------------------------------------------
   BULK RECOMMENDATIONS
   ----------------------------------------------------------------------- */
const BULK_SHELF_STABLE_CATEGORIES = new Set(['canned', 'legume', 'grain', 'nuts', 'fat']);

const BULK_CATEGORY_LABELS = {
    canned: "🥫 Консерви",
    legume: "🫘 Бобови",
    grain:  "🌾 Зърнени",
    nuts:   "🥜 Ядки",
    fat:    "🫒 Мазнини",
};

const BULK_SHELF_LIFE_LABELS = {
    "3+г":  "Трае 3+ год.",
    "2-3г": "Трае 2-3 год.",
    "1-2г": "Трае 1-2 год.",
    "6-12м":"Трае 6-12 мес.",
};

function renderBulkRecommendations() {
    const container = document.getElementById("bulk-recommendations");
    if (!container) return;

    const bulkItems = allOffers
        .filter(o =>
            o.is_bulk_worthy &&
            isHealthyOffer(o) &&
            (o.health_score || 0) >= 6 &&
            BULK_SHELF_STABLE_CATEGORIES.has(o.category)
        )
        .sort((a, b) => {
            if ((b.discount_pct || 0) !== (a.discount_pct || 0)) return (b.discount_pct || 0) - (a.discount_pct || 0);
            if ((b.health_score || 0) !== (a.health_score || 0)) return (b.health_score || 0) - (a.health_score || 0);
            return (a.price_per_kg || 999) - (b.price_per_kg || 999);
        });

    if (bulkItems.length === 0) {
        container.innerHTML = '<p style="color:var(--muted);">Няма подходящи консерви или зърнени в промоция тази седмица.</p>';
        return;
    }

    container.innerHTML = `
        <div class="bulk-grid">
            ${bulkItems.slice(0, 12).map(item => {
                const disc = item.discount_pct || 0;
                const discTag = disc ? `<div class="bulk-disc-tag">−${disc}%</div>` : '';
                const shelfLabel = BULK_SHELF_LIFE_LABELS[item.shelf_life] || '';
                const shelfTag = shelfLabel ? `<div class="bulk-shelf-tag">${shelfLabel}</div>` : '';
                const thumb = renderOfferThumb(item);
                const catLabel = BULK_CATEGORY_LABELS[item.category] || '';
                const ppkg = item.price_per_kg
                    ? `<div class="bulk-ppkg">${item.price_per_kg.toFixed(2)} лв/кг · ${item.weight_raw || ''}</div>`
                    : '';
                const validityText = getOfferValidityText(item, "short");

                let savingsHtml = '';
                if (item.old_price && disc >= 10) {
                    const savedPer = (item.old_price - item.new_price).toFixed(2);
                    const saved5 = ((item.old_price - item.new_price) * 5).toFixed(2);
                    savingsHtml = `<div class="bulk-savings">Спести ${savedPer} лв на брой<br/>при 5 броя → ~${saved5} лв</div>`;
                } else {
                    savingsHtml = `<div class="bulk-savings">Дълъг срок на годност — купи повече и зареди</div>`;
                }

                return `
                    <div class="bulk-card" data-offer-link="${getOfferDomId(item)}">
                        <div class="bulk-card-img">
                            ${thumb}
                            ${discTag}
                            ${shelfTag}
                        </div>
                        <div class="bulk-body">
                            ${catLabel ? `<div class="bulk-cat-label">${catLabel}</div>` : ''}
                            <div class="bulk-name">${item.name}</div>
                            <div class="bulk-price-main">${item.new_price.toFixed(2)} лв</div>
                            ${ppkg}
                            <div class="bulk-store-row">${item.store}${disc ? ` · −${disc}%` : ''}</div>
                            ${savingsHtml}
                            ${validityText ? `<div class="bulk-validity">${validityText}</div>` : ''}
                        </div>
                    </div>
                `;
            }).join("")}
        </div>
    `;

    container.querySelectorAll('.bulk-card[data-offer-link]').forEach(card => {
        card.addEventListener('click', () => openOfferInGrid(card.dataset.offerLink));
    });
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
            <div class="protein-rank-item offer-card" data-offer-id="${getOfferDomId(o)}">
                <div class="protein-rank-header offer-header">
                    <div class="rank-medal">${medal}</div>
                    <div class="offer-img-cell">
                        ${renderOfferThumb(o)}
                        <button class="fav-btn${isFavorited(o) ? ' active' : ''}" data-offer-id="${getOfferDomId(o)}" title="${isFavorited(o) ? 'Премахни от любими' : 'Следи този продукт'}">❤️</button>
                    </div>
                    <div class="rank-info">
                        <div class="rank-name">${o.name}</div>
                        <div class="rank-meta">${m.p}г протеин/100г · ${m.f}г мазнини · ${m.c}г въгл. · ${o.new_price.toFixed(2)} лв · ${o.store}${getOfferValidityText(o, "short") ? ` · ${getOfferValidityText(o, "short")}` : ""}</div>
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
                            <div class="details-row"><strong>Цена:</strong> <span>${o.new_price.toFixed(2)} лв</span></div>
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
                                ${item.price_per_kg ? `<div class="bulk-meta">${item.price_per_kg.toFixed(2)} лв/кг</div>` : ""}
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
        <div class="offer-card" data-offer-id="${getOfferDomId(o)}" style="margin-bottom:8px;">
            <div class="offer-header">
                ${renderOfferThumb(o)}
                <div class="offer-info">
                    <div class="offer-name">${o.name}</div>
                    <div class="offer-store">${o.store} — <em class="green">${o.new_price.toFixed(2)} лв</em></div>
                    ${o.price_per_kg ? `<div style="font-size:0.8rem; color:var(--muted); margin-top:4px;">${o.price_per_kg.toFixed(2)} лв/кг</div>` : ""}
                </div>
                <button class="fav-btn${isFavorited(o) ? ' active' : ''}" data-offer-id="${getOfferDomId(o)}" title="${isFavorited(o) ? 'Премахни от любими' : 'Следи този продукт'}">❤️</button>
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
        const favBtn = e.target.closest(".fav-btn");
        if (favBtn && grid.contains(favBtn)) {
            e.stopPropagation();
            toggleFavorite(favBtn.dataset.offerId);
            return;
        }
        const phToggle = e.target.closest("[data-ph-toggle]");
        if (phToggle && grid.contains(phToggle)) {
            e.stopPropagation();
            phToggle.closest(".price-history").classList.toggle("ph-open");
            return;
        }
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
        const favBtn = e.target.closest(".fav-btn");
        if (favBtn) {
            e.stopPropagation();
            toggleFavorite(favBtn.dataset.offerId);
            return;
        }
        const phToggle = e.target.closest("[data-ph-toggle]");
        if (phToggle) {
            e.stopPropagation();
            phToggle.closest(".price-history").classList.toggle("ph-open");
            return;
        }
        const card = e.target.closest(".protein-rank-item");
        if (!card || !container.contains(card)) return;
        const wasExpanded = card.classList.contains("expanded");
        container.querySelectorAll(".protein-rank-item.expanded").forEach(c => { if (c !== card) c.classList.remove("expanded"); });
        card.classList.toggle("expanded", !wasExpanded);
    });
}
