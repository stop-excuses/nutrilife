/* ========================================
   NutriLife — Offers Logic
   ======================================== */

let allOffers = [];
let fuseIndex = null;
let activeType = "all";
let activeCategory = "all";
let activeSort = "recommended";
let searchQuery = "";

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
    // Fish & seafood
    ["риба тон",      { p: 25, f:  1,   c:  0,   kcal: 116 }],
    ["сьомга",        { p: 20, f: 13,   c:  0,   kcal: 208 }],
    ["пъстърва",      { p: 20, f:  3.5, c:  0,   kcal: 110 }],
    ["скумрия",       { p: 19, f: 14,   c:  0,   kcal: 205 }],
    ["треска",        { p: 18, f:  0.9, c:  0,   kcal:  82 }],
    ["ципура",        { p: 19, f:  2.5, c:  0,   kcal:  96 }],
    ["лаврак",        { p: 19, f:  2.5, c:  0,   kcal:  97 }],
    ["сельодка",      { p: 18, f: 12,   c:  0,   kcal: 185 }],
    // Poultry
    ["пилешки гърди", { p: 23, f:  5,   c:  0,   kcal: 165 }],
    ["пилешко гърди", { p: 23, f:  5,   c:  0,   kcal: 165 }],
    ["пилешко филе",  { p: 23, f:  5,   c:  0,   kcal: 165 }],
    ["пилешко",       { p: 21, f:  8,   c:  0,   kcal: 165 }],
    ["пиле",          { p: 21, f:  8,   c:  0,   kcal: 165 }],
    ["пуешко",        { p: 24, f:  4,   c:  0,   kcal: 135 }],
    // Red meat
    ["говеждо",       { p: 26, f: 10,   c:  0,   kcal: 250 }],
    ["телешко",       { p: 21, f:  5,   c:  0,   kcal: 130 }],
    ["свинско",       { p: 21, f: 20,   c:  0,   kcal: 260 }],
    ["агнешко",       { p: 21, f: 17,   c:  0,   kcal: 234 }],
    // Dairy — high protein
    ["скир",          { p: 11, f:  0.2, c:  3.5, kcal:  60 }],
    ["skyr",          { p: 11, f:  0.2, c:  3.5, kcal:  60 }],
    ["извара",        { p: 11, f:  4.3, c:  3.4, kcal:  98 }],
    ["cottage",       { p: 11, f:  4.3, c:  3.4, kcal:  98 }],
    // Eggs
    ["яйц",           { p: 13, f: 11,   c:  1.1, kcal: 155 }],
    // Dairy — moderate protein
    ["кисело мляко",  { p:  3.5, f: 3.6, c: 4.7, kcal:  63 }],
    ["йогурт",        { p:  3.5, f: 3.6, c: 4.7, kcal:  63 }],
    ["мляко",         { p:  3.4, f: 3.6, c: 4.8, kcal:  64 }],
    ["сирене",        { p: 17,   f: 21,  c: 0.5, kcal: 260 }],
    // Legumes
    ["нахут",         { p:  9,   f: 2.6, c: 27,  kcal: 164 }],
    ["леща",          { p:  9,   f: 0.4, c: 20,  kcal: 116 }],
    ["боб",           { p:  8,   f: 0.5, c: 24,  kcal: 127 }],
    ["фасул",         { p:  8,   f: 0.5, c: 24,  kcal: 127 }],
    ["грах",          { p:  5,   f: 0.4, c: 14,  kcal:  81 }],
    // Grains
    ["овесени ядки",  { p: 13,   f: 7,   c: 67,  kcal: 389 }],
    ["овес",          { p: 13,   f: 7,   c: 67,  kcal: 389 }],
    ["ориз",          { p:  7,   f: 0.6, c: 80,  kcal: 365 }],
    // Nuts & seeds
    ["бадем",         { p: 21,   f: 49,  c: 22,  kcal: 575 }],
    ["орех",          { p: 15,   f: 65,  c: 14,  kcal: 654 }],
    ["кашу",          { p: 18,   f: 44,  c: 30,  kcal: 553 }],
    ["лешник",        { p: 15,   f: 61,  c: 17,  kcal: 628 }],
    ["писташ",        { p: 20,   f: 45,  c: 28,  kcal: 562 }],
    // Oils
    ["зехтин",        { p:  0,   f: 100, c:  0,  kcal: 884 }],
    ["масло краве",   { p:  0.6, f: 81,  c:  0.1,kcal: 717 }],
];

/**
 * Returns canonical nutrition for an offer if a known food type is matched.
 * Otherwise returns the scraped macros (or null).
 */
function getMacros(offer) {
    const nameLower = (offer.name || "").toLowerCase();
    for (const [keyword, nutrition] of CANONICAL_NUTRITION) {
        if (nameLower.includes(keyword)) return nutrition;
    }
    return offer.macros || null;
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
        allOffers = OFFERS_DATA.offers || [];
        applyFilters();
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
                const ha = a.health_score || 0, hb = b.health_score || 0;
                if (hb !== ha) return hb - ha;
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
            keys: ['name'],
            threshold: 0.35,       // 0=exact, 1=match anything
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
            filtered = filtered.filter(o => o.name.toLowerCase().includes(searchQuery));
        }
    }

    // Type filter
    if (activeType === "high_protein") {
        // Strict: must be real food AND pass nutritional thresholds
        filtered = filtered.filter(o => o.is_food && isStrictHighProtein(o));
    } else if (activeType === "bulk") {
        filtered = filtered.filter(o => o.is_bulk_worthy);
    } else {
        // "all" — food only, no garbage
        filtered = filtered.filter(o => o.is_food || o.category !== "other");
    }

    if (activeCategory !== "all") {
        filtered = filtered.filter(o => o.category === activeCategory);
    }

    renderOffers(sortOffers(filtered));
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
            applyFilters();
        });
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
function renderOffers(offers) {
    const grid = document.getElementById("offers-grid");
    if (!grid) return;

    if (offers.length === 0) {
        grid.innerHTML = '<p style="text-align:center; color:var(--muted);">Няма намерени продукти.</p>';
        return;
    }

    grid.innerHTML = offers.filter(o => o.name && o.new_price != null).map(o => {
        const macros = getMacros(o);
        const hasHealthScore = o.is_food && !o.is_junk && o.health_score != null;
        const scoreCls = (o.health_score || 0) >= 8 ? "high" : (o.health_score || 0) >= 5 ? "medium" : "low";
        const isHP = o.is_food && isStrictHighProtein(o);

        let badges = [];
        if (hasHealthScore) badges.push(`<span class="health-badge ${scoreCls}">★ ${o.health_score}/10</span>`);
        if (isHP) badges.push(`<span class="offer-tag protein-tag">💪 ПРОТЕИН</span>`);
        if (o.is_junk) badges.push(`<span class="offer-tag junk-tag">⚠ JUNK</span>`);
        if (o.shelf_life && o.shelf_life !== "малотраен") badges.push(`<span class="offer-tag long-lasting">📦 ${o.shelf_life}</span>`);
        if (o.is_bulk_worthy && o.category !== "grain") badges.push(`<span class="offer-tag bulk-tag">🛒 Едро</span>`);

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
            <div class="offer-card">
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
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join("");

    initOfferAccordion();
}

/* -----------------------------------------------------------------------
   BULK RECOMMENDATIONS
   ----------------------------------------------------------------------- */
function renderBulkRecommendations() {
    const container = document.getElementById("bulk-recommendations");
    if (!container) return;

    const bulkItems = allOffers.filter(o => o.is_bulk_worthy && o.is_food);

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

    const PROTEIN_CATS = new Set(["protein", "dairy", "canned", "legume", "nuts"]);

    const items = allOffers.filter(o => {
        if (!o.is_food || o.is_junk) return false;
        if (o.category === "drinks") return false;
        // Require real weight + price (no fallback guessing)
        if (!o.weight_grams || !o.price_per_kg || o.price_per_kg <= 0) return false;
        const macros = getMacros(o);
        if (!macros || macros.p < 5) return false;
        return PROTEIN_CATS.has(o.category) || isStrictHighProtein(o);
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
        filtered = allOffers.filter(o => o.is_healthy);
    } else {
        filtered = allOffers.filter(o => o.diet_tags && o.diet_tags.includes(profile));
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
    if (!grid) return;
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
    if (!container) return;
    container.addEventListener("click", (e) => {
        const card = e.target.closest(".protein-rank-item");
        if (!card || !container.contains(card)) return;
        const wasExpanded = card.classList.contains("expanded");
        container.querySelectorAll(".protein-rank-item.expanded").forEach(c => { if (c !== card) c.classList.remove("expanded"); });
        card.classList.toggle("expanded", !wasExpanded);
    });
}
