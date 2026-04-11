/* ========================================
   NutriLife — Offers Logic
   Loads offers, filters, sorts, profiles, bulk, protein ranking
   ======================================== */

let allOffers = [];
let activeType = "all";
let activeCategory = "all";
let activeSort = "recommended";

document.addEventListener("DOMContentLoaded", () => {
    loadOffers();
});

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

function getProteinMetrics(offer) {
    if (!offer.macros || offer.macros.p < 1) return null;

    const pricePerKg = getPricePerKgEstimate(offer);
    if (!pricePerKg || pricePerKg <= 0) return null;

    const rawProteinPerLev = (offer.macros.p * 10) / pricePerKg;
    const rawProteinPerEur = rawProteinPerLev * 1.95583;
    const nonProteinLoad = (offer.macros.f || 0) + (offer.macros.c || 0);
    const purity = offer.macros.p / (offer.macros.p + nonProteinLoad || offer.macros.p);
    const cleanProteinPerLev = rawProteinPerLev * purity;
    const cleanProteinPerEur = cleanProteinPerLev * 1.95583;

    return {
        rawProteinPerLev,
        rawProteinPerEur,
        cleanProteinPerLev,
        cleanProteinPerEur,
        purity
    };
}

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
    } else {
        const grid = document.getElementById("offers-grid");
        if (grid) {
            grid.innerHTML = '<p style="text-align:center; color:var(--muted);">Проблем при зареждане на данните.</p>';
        }
    }
}

/* --- Sorting --- */
function sortOffers(offers) {
    const sorted = [...offers];
    switch (activeSort) {
        case "protein":
            sorted.sort((a, b) => {
                const pa = (a.macros && a.macros.p) || 0;
                const pb = (b.macros && b.macros.p) || 0;
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
            // Best clean protein per euro
            sorted.sort((a, b) => {
                const calcVal = (o) => getProteinMetrics(o)?.cleanProteinPerEur || 0;
                return calcVal(b) - calcVal(a);
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

/* --- Combined Filtering --- */
function applyFilters() {
    // Base filter: always exclude obvious non-food and zero-quality items
    let filtered = allOffers.filter(o => {
        if (o.is_food === false) return false;                          // scraper marked non-food
        if (o.category === "other" && !o.health_score) return false;   // uncategorised non-food
        if ((o.health_score || 0) < 3) return false;                   // candy, chips, junk
        if (o.name && /^[^а-яА-Яa-zA-Z0-9]+/.test(o.name)) return false; // name starts with garbage
        return true;
    });

    if (activeType === "food") {
        filtered = filtered.filter(o => o.is_food);
    } else if (activeType === "healthy") {
        filtered = filtered.filter(o => o.is_healthy);
    } else if (activeType === "long_lasting") {
        filtered = filtered.filter(o => o.is_long_lasting);
    } else if (activeType === "bulk") {
        filtered = filtered.filter(o => o.is_bulk_worthy);
    } else if (activeType === "high_protein") {
        filtered = filtered.filter(o => o.macros && o.macros.p >= 10);
    } else if (activeType === "non_food") {
        filtered = filtered.filter(o => !o.is_food);
    }

    if (activeCategory !== "all") {
        filtered = filtered.filter(o => o.category === activeCategory);
    }

    renderOffers(sortOffers(filtered));
}

/* --- Type Filters --- */
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

/* --- Category Filters --- */
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

/* --- Profile Filters --- */
function initProfileFilters() {
    document.querySelectorAll(".filter-btn[data-profile]").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".filter-btn[data-profile]").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            renderProfileRecommendations(btn.dataset.profile);
        });
    });
}

/* --- Render Offer Cards --- */
function renderOffers(offers) {
    const grid = document.getElementById("offers-grid");
    if (!grid) return;

    if (offers.length === 0) {
        grid.innerHTML = '<p style="text-align:center; color:var(--muted);">Няма намерени продукти.</p>';
        return;
    }

    grid.innerHTML = offers.filter(o => o.name && o.new_price != null).map(o => {
        const hasHealthScore = o.is_food && !o.is_junk && o.health_score != null;
        const scoreCls = (o.health_score || 0) >= 8 ? "high" : (o.health_score || 0) >= 5 ? "medium" : "low";

        let badges = [];
        if (hasHealthScore) {
            badges.push(`<span class="health-badge ${scoreCls}">★ ${o.health_score}/10</span>`);
        }
        if (o.is_food && o.diet_tags && o.diet_tags.includes("high_protein")) {
            badges.push(`<span class="offer-tag protein-tag">💪 ПРОТЕИН</span>`);
        }
        if (o.is_junk) {
            badges.push(`<span class="offer-tag junk-tag">⚠ JUNK</span>`);
        }
        if (o.shelf_life && o.shelf_life !== "малотраен") {
            badges.push(`<span class="offer-tag long-lasting">📦 ${o.shelf_life}</span>`);
        }
        if (o.is_bulk_worthy && o.category !== "grain") {
            badges.push(`<span class="offer-tag bulk-tag">🛒 Едро</span>`);
        }

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

        // Protein value per lev
        let proteinValueHtml = "";
        const proteinMetrics = getProteinMetrics(o);
        if (proteinMetrics) {
            proteinValueHtml = `<div class="details-row"><strong>Чист протеин/евро:</strong> <span class="green">${proteinMetrics.cleanProteinPerEur.toFixed(1)}г на €1</span></div>`;
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

                            ${o.macros ? `
                            <div class="details-row macros-header">
                                <strong>Хранителни стойности (на 100г):</strong>
                                <span class="est-badge">приблизителни</span>
                            </div>
                            <div class="macros-grid">
                                <div class="macro-item"><div class="macro-val">${o.macros.kcal}</div><div class="macro-label">ккал</div></div>
                                <div class="macro-item"><div class="macro-val">${o.macros.p}г</div><div class="macro-label">протеин</div></div>
                                <div class="macro-item"><div class="macro-val">${o.macros.f}г</div><div class="macro-label">мазнини</div></div>
                                <div class="macro-item"><div class="macro-val">${o.macros.c}г</div><div class="macro-label">въгл.</div></div>
                                ${o.macros.sugar != null ? `<div class="macro-item"><div class="macro-val">${o.macros.sugar}г</div><div class="macro-label">захар</div></div>` : ""}
                                ${o.macros.fiber != null ? `<div class="macro-item"><div class="macro-val">${o.macros.fiber}г</div><div class="macro-label">фибри</div></div>` : ""}
                                ${o.macros.salt != null ? `<div class="macro-item"><div class="macro-val">${o.macros.salt}г</div><div class="macro-label">сол</div></div>` : ""}
                            </div>
                            ` : ""}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join("");

    initOfferAccordion();
}

/* --- Bulk Recommendations (food only) --- */
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
        grain: "🌾 Зърнени (траят 1-2г)",
        legume: "🫘 Бобови (траят 1-2г)",
        canned: "🥫 Консерви (траят 2-3г)",
        nuts: "🥜 Ядки (траят 6м-1г)",
        fat: "🫒 Зехтин и масла (траят 1-2г)"
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
            </div>
        `;
    }

    container.innerHTML = html;
}

/* --- Protein Value Ranking --- */
function renderProteinRanking() {
    const container = document.getElementById("protein-ranking");
    if (!container) return;

    // Only healthy food items with enough protein.
    const items = allOffers.filter(o =>
        o.is_healthy && o.macros && o.macros.p >= 5
    );

    if (items.length === 0) {
        container.innerHTML = '<p style="color:var(--muted);">Няма данни за протеинов анализ.</p>';
        return;
    }

    const ranked = items.map(o => {
        const metrics = getProteinMetrics(o);
        return metrics ? { ...o, ...metrics } : null;
    }).filter(Boolean).sort((a, b) => b.cleanProteinPerEur - a.cleanProteinPerEur);

    const top = ranked.slice(0, 10);

    let html = top.map((o, i) => {
        const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
        const barWidth = Math.round((o.cleanProteinPerEur / top[0].cleanProteinPerEur) * 100);
        return `
            <div class="protein-rank-item offer-card">
                <div class="protein-rank-header offer-header">
                    <div class="rank-medal">${medal}</div>
                    <div class="rank-info">
                        <div class="rank-name">${o.name}</div>
                        <div class="rank-meta">${o.macros.p}г протеин/100г · ${o.macros.f}г мазнини · ${o.macros.c}г въгл. · ${formatPricePair(o.new_price, o.new_price_eur)} · ${o.store}</div>
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
                            <div class="details-row"><strong>Макроси:</strong> <span>${o.macros.p}г P · ${o.macros.f}г F · ${o.macros.c}г C</span></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join("");

    container.innerHTML = html;
    initProteinRankingAccordion();
}

/* --- Profile Recommendations --- */
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
        if (b.health_score !== a.health_score) return b.health_score - a.health_score;
        return (a.price_per_kg || 999) - (b.price_per_kg || 999);
    });

    const top5 = filtered.slice(0, 5);

    const profileLabels = {
        all: "всички",
        high_protein: "High Protein",
        keto: "Keto",
        mediterranean: "Mediterranean",
        vegetarian: "Vegetarian",
        budget: "Budget"
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
        </div>
    `).join("");

    container.innerHTML = html;
}

/* --- Offer Card Accordion (click to expand/collapse) --- */
function initOfferAccordion() {
    const grid = document.getElementById("offers-grid");
    if (!grid) return;

    grid.addEventListener("click", (e) => {
        const card = e.target.closest(".offer-card");
        if (!card || !grid.contains(card)) return;

        const wasExpanded = card.classList.contains("expanded");

        grid.querySelectorAll(".offer-card.expanded").forEach(c => {
            if (c !== card) c.classList.remove("expanded");
        });

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

        container.querySelectorAll(".protein-rank-item.expanded").forEach(c => {
            if (c !== card) c.classList.remove("expanded");
        });

        card.classList.toggle("expanded", !wasExpanded);
    });
}
