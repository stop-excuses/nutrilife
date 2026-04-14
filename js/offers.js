/* ========================================
   NutriLife — Offers Logic
   ======================================== */

let allOffers = [];
let fuseIndex = null;
let activeType = "all";
let activeCategory = "all";
let activeSort = "recommended";
let searchQuery = "";
let currentPage = 1;
let filteredOffersCache = [];

const OFFERS_PER_PAGE = 24;

const PROCESSED_MEAT_KEYWORDS = [
    "шунка", "кренвирш", "наденица", "салам", "луканка", "бекон", "шпек", "карначе", "суджук"
];

const NON_HUMAN_FOOD_KEYWORDS = [
    "храна за кучета", "храна за куче", "храна за котки", "храна за котка",
    "консерва за кучета", "консерва за куче", "консерва за котки", "консерва за котка",
    "кучешка храна", "котешка храна", "pet food"
];

const PROTEIN_SOURCE_KEYWORDS = [
    "пилешки гърди", "пилешко филе", "пилешко", "пиле", "пуешко", "телешко", "говеждо",
    "яйц", "риба тон", "сьомга", "скумрия", "треска", "пъстърва", "ципура", "лаврак",
    "сельодка", "херинга", "скарида", "калмар", "извара", "скир", "cottage", "skyr",
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

function getComparisonKey(offer) {
    const nameLower = getOfferNameLower(offer);
    for (const [keyword, label] of COMPARISON_KEYWORDS) {
        if (nameLower.includes(keyword)) return label;
    }
    return null;
}

function buildSearchText(offer) {
    const macros = offer.macros || {};
    return [
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
}

function isProcessedMeat(offer) {
    const nameLower = getOfferNameLower(offer);
    return PROCESSED_MEAT_KEYWORDS.some(kw => nameLower.includes(kw));
}

function isClearlyNonHumanFood(offer) {
    const nameLower = getOfferNameLower(offer);
    return NON_HUMAN_FOOD_KEYWORDS.some(kw => nameLower.includes(kw));
}

function isHealthyOffer(offer) {
    if (!offer.is_food || offer.is_junk) return false;
    if (isClearlyNonHumanFood(offer)) return false;
    if (isProcessedMeat(offer)) return false;
    return true;
}

function isProteinSource(offer) {
    const nameLower = getOfferNameLower(offer);
    if (PROTEIN_SOURCE_KEYWORDS.some(kw => nameLower.includes(kw))) return true;
    return isStrictHighProtein(offer);
}

/**
 * Returns true only when the product name matches a known entry in CANONICAL_NUTRITION.
 * Used in the protein ranking to exclude products relying on unreliable scraped macros.
 */
function hasCanonicalNutrition(offer) {
    const nameLower = (offer.name || "").toLowerCase();
    if (NON_FOOD_MACRO_OVERRIDE.some(kw => nameLower.includes(kw))) return false;
    for (const [keyword] of CANONICAL_NUTRITION) {
        if (nameLower.includes(keyword)) return true;
    }
    return false;
}

/* -----------------------------------------------------------------------
   HIGH PROTEIN — strict nutritional criteria for training/muscle building.
   Requires:
   - protein >= 10g per 100g
   - protein comprises >= 35% of total macros (excludes high-fat nuts/oils
     and high-carb grains even if they have decent protein)
   ----------------------------------------------------------------------- */
function isStrictHighProtein(offer) {
    const macros = getMacros(offer);
    if (!macros) return false;
    const p = macros.p || 0;
    const f = macros.f || 0;
    const c = macros.c || 0;
    const total = p + f + c;
    return p >= 10 && (total === 0 || p / total >= 0.35);
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
    const macros = getMacros(offer);
    if (!macros || macros.p < 1) return null;

    let pricePerKg;
    if (strictWeight) {
        if (!offer.weight_grams || !offer.price_per_kg || offer.price_per_kg <= 0) return null;
        pricePerKg = offer.price_per_kg;
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

    return { rawProteinPerLev, rawProteinPerEur, cleanProteinPerLev, cleanProteinPerEur, purity };
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
        }

        allOffers = (OFFERS_DATA.offers || []).map(o => {
            const product = productMap.get(o.product_id || o.id);
            const merged = product ? { ...product, ...o } : o;
            return {
                ...merged,
                _searchText: buildSearchText(merged),
                _productKey: normalizeProductKey(merged.name),
                _comparisonKey: getComparisonKey(merged),
            };
        });
        applyFilters();
        renderPriceComparison();
        renderBulkRecommendations();
        renderProteinRanking();
        renderProfileRecommendations("all");
        initTypeFilters();
        initCategoryFilters();
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
            sorted.sort((a, b) => a.new_price - b.new_price);
            break;
        case "health":
            sorted.sort((a, b) => (b.health_score || 0) - (a.health_score || 0));
            break;
        case "protein_value":
            sorted.sort((a, b) => {
                const va = getProteinMetrics(a)?.cleanProteinPerEur || 0;
                const vb = getProteinMetrics(b)?.cleanProteinPerEur || 0;
                return vb - va;
            });
            break;
        default: // recommended: health desc, price asc
            sorted.sort((a, b) => {
                const ha = isHealthyOffer(a) ? (a.health_score || 0) : 0;
                const hb = isHealthyOffer(b) ? (b.health_score || 0) : 0;
                if (hb !== ha) return hb - ha;
                const pa = getProteinMetrics(a)?.cleanProteinPerEur || 0;
                const pb = getProteinMetrics(b)?.cleanProteinPerEur || 0;
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
            const matchedIds = new Set(results.map(r => r.item.id || r.item.name));
            filtered = filtered.filter(o => matchedIds.has(o.id || o.name));
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
        // "all" — real offers only, healthy ones sorted first
        filtered = filtered.filter(o => (o.is_food || o.category !== "other") && !isClearlyNonHumanFood(o));
    }

    if (activeCategory !== "all") {
        filtered = filtered.filter(o => o.category === activeCategory);
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

function resetOfferFiltersForNavigation() {
    activeType = "all";
    activeCategory = "all";
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
    document.querySelectorAll(".sort-btn[data-sort]").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.sort === "recommended");
    });
}

function openOfferInGrid(offerId) {
    if (!offerId) return;

    let offerIndex = filteredOffersCache.findIndex(o => o.id === offerId);
    if (offerIndex === -1) {
        resetOfferFiltersForNavigation();
        applyFilters();
        offerIndex = filteredOffersCache.findIndex(o => o.id === offerId);
    }
    if (offerIndex === -1) return;

    currentPage = Math.floor(offerIndex / OFFERS_PER_PAGE) + 1;
    renderOffers(filteredOffersCache);

    requestAnimationFrame(() => {
        const card = document.querySelector(`.offer-card[data-offer-id="${offerId}"]`);
        if (!card) return;
        card.classList.add("expanded");
        card.scrollIntoView({ behavior: "smooth", block: "center" });
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

function renderIngredientsBlock(offer) {
    const ingredients = (offer.macros || {}).ingredients;
    if (!ingredients) return "";
    const compact = ingredients.length > 280 ? `${ingredients.slice(0, 277)}...` : ingredients;
    return `<div class="details-note"><strong>Съставки:</strong> ${escapeHtml(compact)}</div>`;
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
        const hasHealthScore = o.is_food && !o.is_junk && o.health_score != null;
        const scoreCls = (o.health_score || 0) >= 8 ? "high" : (o.health_score || 0) >= 5 ? "medium" : "low";
        const isHP = healthyOffer && isStrictHighProtein(o);

        let badges = [];
        if (hasHealthScore) badges.push(`<span class="health-badge ${scoreCls}">★ ${o.health_score}/10</span>`);
        if (isHP) badges.push(`<span class="offer-tag protein-tag">💪 ПРОТЕИН</span>`);
        if (o.is_junk) badges.push(`<span class="offer-tag junk-tag">⚠ JUNK</span>`);
        if (isProcessedMeat(o)) badges.push(`<span class="offer-tag junk-tag">⚠ Преработено месо</span>`);
        if (o.source_type === "promo") badges.push(`<span class="offer-tag bulk-tag">🔥 Промо</span>`);
        if (o.source_type === "assortment") badges.push(`<span class="offer-tag long-lasting">📋 Асортимент</span>`);
        if (o.shelf_life && o.shelf_life !== "малотраен") badges.push(`<span class="offer-tag long-lasting">📦 ${o.shelf_life}</span>`);
        if (o.is_bulk_worthy && o.category !== "grain" && healthyOffer) badges.push(`<span class="offer-tag bulk-tag">🛒 Едро</span>`);

        let metaParts = [];
        if (o.valid_until) metaParts.push(`до ${o.valid_until}`);
        if (o.weight_raw) metaParts.push(o.weight_raw);
        if (o.price_per_kg) metaParts.push(formatPricePair(o.price_per_kg, o.price_per_kg_eur, "/кг"));

        const stores = o.available_stores && o.available_stores.length > 1
            ? o.available_stores.join(", ")
            : o.store;

        const imgSrc = o.image || "";
        const imgTag = imgSrc
            ? `<div class="offer-img-wrapper"><img src="${imgSrc}" alt="" class="offer-img" onerror="this.parentElement.style.display='none'"></div>`
            : `<div class="offer-img-wrapper" style="display:none"></div>`;

        let proteinValueHtml = "";
        const pm = getProteinMetrics(o);
        if (pm) {
            proteinValueHtml = `<div class="details-row"><strong>Чист протеин/евро:</strong> <span class="green">${pm.cleanProteinPerEur.toFixed(1)}г на €1</span></div>`;
        }

        return `
            <div class="offer-card" data-offer-id="${o.id}">
                <div class="offer-header">
                    ${imgTag}
                    <div class="offer-info-main">
                        <div class="offer-name">${o.name}</div>
                        <div class="offer-store">${stores}${o.discount_pct ? ` · <span style="color:var(--red);font-weight:700;">-${o.discount_pct}%</span>` : ""}</div>
                        <div class="offer-badges">${badges.join("")}</div>
                    </div>
                    <div class="offer-prices">
                        <span class="offer-new-price">${formatPricePair(o.new_price, o.new_price_eur)}</span>
                        ${o.old_price ? `<div class="offer-old-price">${formatPricePair(o.old_price, o.old_price_eur)}</div>` : ""}
                    </div>
                    <span class="offer-arrow">▼</span>
                </div>
                <div class="offer-details">
                    <div class="details-inner">
                        <div class="details-content">
                            ${imgSrc ? `<img src="${imgSrc}" class="offer-big-img" onerror="this.style.display='none'">` : ""}
                            ${hasHealthScore ? `<div class="details-row"><strong>Здравен рейтинг:</strong> <span>${o.health_score}/10</span></div>` : ""}
                            <div class="details-row"><strong>Магазин:</strong> <span>${stores}${o.address ? ' (' + o.address + ')' : ''}</span></div>
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
            return { best, items, worst, saving };
        })
        .filter(({ best, worst, saving }) => worst && best && worst.new_price > best.new_price && saving > 0)
        .sort((a, b) => {
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
                    <button class="comparison-open-btn" data-offer-link="${best.id}">Отвори продукта</button>
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

    container.querySelectorAll("[data-offer-link]").forEach(btn => {
        btn.addEventListener("click", () => openOfferInGrid(btn.dataset.offerLink));
    });
}

/* -----------------------------------------------------------------------
   BULK RECOMMENDATIONS
   ----------------------------------------------------------------------- */
function renderBulkRecommendations() {
    const container = document.getElementById("bulk-recommendations");
    if (!container) return;

    const bulkItems = allOffers.filter(o => o.is_bulk_worthy && isHealthyOffer(o) && (o.health_score || 0) >= 7);

    if (bulkItems.length === 0) {
        container.innerHTML = '<p style="color:var(--muted);">Няма bulk оферти тази седмица.</p>';
        return;
    }

    const groups = {};
    bulkItems.forEach(o => {
        if (!groups[o.category]) groups[o.category] = [];
        groups[o.category].push(o);
    });

    const categoryLabels = {
        grain:  "🌾 Зърнени (траят 1-2г)",
        legume: "🫘 Бобови (траят 1-2г)",
        canned: "🥫 Консерви (траят 2-3г)",
        nuts:   "🥜 Ядки (траят 6м-1г)",
        fat:    "🫒 Зехтин и масла (траят 1-2г)",
    };

    let html = "";
    for (const [cat, items] of Object.entries(groups)) {
        items.sort((a, b) => (a.price_per_kg || 999) - (b.price_per_kg || 999));
        const best = items[0];
        const savings = best.old_price ? ((best.old_price - best.new_price) * 5).toFixed(2) : null;
        html += `
            <div class="bulk-card">
                <div class="bulk-category">${categoryLabels[cat] || cat}</div>
                <div class="offer-name">${best.name} — <em class="green">${formatPricePair(best.new_price, best.new_price_eur)}</em></div>
                ${best.price_per_kg ? `<div style="font-size:0.85rem; color:var(--muted);">${formatPricePair(best.price_per_kg, best.price_per_kg_eur, "/кг")}</div>` : ""}
                ${savings ? `<div class="bulk-tip">Купи 5 броя и спести ~${savings} лв. Стига за 2-3 месеца.</div>` : ""}
            </div>`;
    }

    container.innerHTML = html;
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

    const items = allOffers.filter(o => {
        if (!isHealthyOffer(o)) return false;
        if ((o.health_score || 0) < 7) return false;
        if (o.category === "drinks") return false;
        // Require real weight + price (no fallback guessing)
        if (!o.weight_grams || !o.price_per_kg || o.price_per_kg <= 0) return false;
        const macros = getMacros(o);
        if (!macros || macros.p < 8) return false;
        // Only products with authoritative canonical nutrition — no scraped-macro distortion
        if (!hasCanonicalNutrition(o)) return false;
        return true;
    });

    if (items.length === 0) {
        container.innerHTML = '<p style="color:var(--muted);">Няма данни за протеинов анализ.</p>';
        return;
    }

    const ranked = items.map(o => {
        const metrics = getProteinMetrics(o, true); // strict: real weight only
        return metrics ? { ...o, _macros: getMacros(o), ...metrics } : null;
    }).filter(Boolean).sort((a, b) => b.cleanProteinPerEur - a.cleanProteinPerEur);

    const top = ranked.slice(0, 10);

    let html = top.map((o, i) => {
        const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
        const barWidth = Math.round((o.cleanProteinPerEur / top[0].cleanProteinPerEur) * 100);
        const m = o._macros;
        return `
            <div class="protein-rank-item offer-card">
                <div class="protein-rank-header offer-header">
                    <div class="rank-medal">${medal}</div>
                    <div class="rank-info">
                        <div class="rank-name">${o.name}</div>
                        <div class="rank-meta">${m.p}г протеин/100г · ${m.f}г мазнини · ${m.c}г въгл. · ${formatPricePair(o.new_price, o.new_price_eur)} · ${o.store}</div>
                        <div class="rank-bar-bg"><div class="rank-bar-fill" style="width:${barWidth}%"></div></div>
                    </div>
                    <div class="rank-value">${o.cleanProteinPerEur.toFixed(1)}г/€</div>
                    <span class="offer-arrow">▼</span>
                </div>
                <div class="offer-details">
                    <div class="details-inner">
                        <div class="details-content">
                            <div class="details-row"><strong>Чист протеин/евро:</strong> <span class="green">${o.cleanProteinPerEur.toFixed(1)}г</span></div>
                            <div class="details-row"><strong>Суров протеин/евро:</strong> <span>${o.rawProteinPerEur.toFixed(1)}г</span></div>
                            <div class="details-row"><strong>Чистота на протеина:</strong> <span>${(o.purity * 100).toFixed(0)}%</span></div>
                            <div class="details-row"><strong>Цена:</strong> <span>${formatPricePair(o.new_price, o.new_price_eur)}</span></div>
                            <div class="details-row"><strong>Макроси:</strong> <span>${m.p}г P · ${m.f}г F · ${m.c}г C</span></div>
                        </div>
                    </div>
                </div>
            </div>`;
    }).join("");

    container.innerHTML = html;
    initProteinRankingAccordion();
}

/* -----------------------------------------------------------------------
   PROFILE RECOMMENDATIONS
   ----------------------------------------------------------------------- */
function renderProfileRecommendations(profile) {
    const container = document.getElementById("profile-recommendations");
    if (!container) return;

    let filtered;
    if (profile === "all") {
        filtered = allOffers.filter(o => isHealthyOffer(o));
    } else {
        filtered = allOffers.filter(o => isHealthyOffer(o) && o.diet_tags && o.diet_tags.includes(profile));
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
            <div class="offer-emoji">${o.emoji || "🛒"}</div>
            <div class="offer-info">
                <div class="offer-name">${o.name}</div>
                <div class="offer-store">${o.store} — <em class="green">${formatPricePair(o.new_price, o.new_price_eur)}</em></div>
                <div class="health-badge high">★ ${o.health_score}/10</div>
                ${o.price_per_kg ? `<div style="font-size:0.8rem; color:var(--muted); margin-top:4px;">${formatPricePair(o.price_per_kg, o.price_per_kg_eur, "/кг")}</div>` : ""}
            </div>
        </div>`).join("");

    container.innerHTML = html;
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
