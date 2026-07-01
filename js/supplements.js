(function () {
    'use strict';

    const DATA = window.SUPPLEMENTS_DATA || (typeof SUPPLEMENTS_DATA !== 'undefined' ? SUPPLEMENTS_DATA : null);
    const PAGE_SIZE = 24;
    const categoryLabels = {
        creatine: 'Креатин',
        omega3: 'Омега-3',
        magnesium: 'Магнезий',
        vitamin_d: 'Витамин D3',
        vitamin_c: 'Витамин C',
        vitamin_b: 'Витамини B',
        multivitamin: 'Мултивитамини',
        zinc: 'Цинк',
        protein: 'Протеин',
        fiber: 'Фибри',
        electrolytes: 'Електролити',
        collagen: 'Колаген',
        iron: 'Желязо',
        l_carnitine: 'Л-карнитин',
        melatonin: 'Мелатонин'
    };
    const availabilityLabels = {
        in_stock: 'наличен',
        limited: 'ограничена наличност',
        unknown: 'наличност непотвърдена'
    };
    const proteinSourceLabels = {
        animal: 'животински протеин',
        plant: 'растителен протеин'
    };
    const plantProteinSignals = [
        'plant', 'растител', 'vegan', 'веган', 'soy', 'соев', 'соя',
        'pea', 'грах', 'rice protein', 'оризов', 'hemp', 'коноп', 'vegetable',
        'sunwarrior', 'garden of life', 'orgain', 'nuzest', 'vega protein', 'iron vegan'
    ];
    const searchCategoryIntents = {
        'креатин': 'creatine',
        'creatine': 'creatine',
        'омега': 'omega3',
        'омега 3': 'omega3',
        'омега-3': 'omega3',
        'omega': 'omega3',
        'omega 3': 'omega3',
        'omega-3': 'omega3',
        'магнезий': 'magnesium',
        'magnesium': 'magnesium',
        'витамин d': 'vitamin_d',
        'витамин d3': 'vitamin_d',
        'd3': 'vitamin_d',
        'vitamin d': 'vitamin_d',
        'vitamin d3': 'vitamin_d',
        'витамин c': 'vitamin_c',
        'vitamin c': 'vitamin_c',
        'витамин b': 'vitamin_b',
        'витамини b': 'vitamin_b',
        'мултивитамини': 'multivitamin',
        'мултивитамин': 'multivitamin',
        'multivitamin': 'multivitamin',
        'цинк': 'zinc',
        'zinc': 'zinc',
        'протеин': 'protein',
        'whey': 'protein',
        'protein': 'protein',
        'фибри': 'fiber',
        'fiber': 'fiber',
        'psyllium': 'fiber',
        'електролити': 'electrolytes',
        'електролит': 'electrolytes',
        'electrolytes': 'electrolytes',
        'electrolyte': 'electrolytes',
        'колаген': 'collagen',
        'collagen': 'collagen',
        'желязо': 'iron',
        'iron': 'iron',
        'карнитин': 'l_carnitine',
        'л-карнитин': 'l_carnitine',
        'l-carnitine': 'l_carnitine',
        'carnitine': 'l_carnitine',
        'мелатонин': 'melatonin',
        'melatonin': 'melatonin'
    };
    const brokenImageMarkers = [
        'stayfit.bg/cdn/img/products/'
    ];

    let items = [];
    let selectedSupplementId = '';
    let filters = {
        category: 'all',
        proteinSource: 'all',
        store: 'all',
        sort: 'unit',
        query: '',
        page: 1
    };

    document.addEventListener('DOMContentLoaded', initSupplements);

    function initSupplements() {
        if (!DATA || !Array.isArray(DATA.supplements)) {
            renderError('Няма заредени данни за добавки. Пусни python scraper/supplement_scrapers.py и python sync_supplements.py.');
            return;
        }

        items = DATA.supplements
            .map(normalizeItem)
            .filter(item => item.unitValue !== null && item.unitValue > 0 && item.availability_status !== 'out_of_stock');

        renderSummary();
        renderStoreFilters();
        bindControls();
        applySmartValueCategoryIntent();
        updateProteinSourceVisibility();
        applyFilters();
        renderBestByCategory();
    }

    function detectProteinSource(item) {
        const text = `${item.name || ''} ${item.brand || ''}`.toLowerCase();
        if (plantProteinSignals.some(signal => text.includes(signal))) return 'plant';
        return 'animal';
    }

    function updateProteinSourceVisibility() {
        const panel = document.getElementById('protein-source-filters');
        if (!panel) return;
        const show = filters.category === 'protein';
        panel.hidden = !show;
        if (!show && filters.proteinSource !== 'all') {
            filters.proteinSource = 'all';
            document.querySelectorAll('button[data-protein-source]').forEach(btn =>
                btn.classList.toggle('active', btn.dataset.proteinSource === 'all'));
        }
    }

    function normalizeItem(item) {
        const unitKey = Object.keys(item.price_per_active_unit || {})[0] || '';
        const unitValue = unitKey ? Number(item.price_per_active_unit[unitKey]) : null;
        const formInfo = detectFormInfo(item);
        const oldPrice = Number(item.old_price_bgn);
        const discountPct = Number(item.discount_pct);
        const priceEur = Number(item.price_eur);
        const proteinSource = item.category === 'protein' ? detectProteinSource(item) : null;
        return {
            ...item,
            unitKey,
            proteinSource,
            unitValue: Number.isFinite(unitValue) ? unitValue : null,
            price_eur: Number.isFinite(priceEur) ? priceEur : null,
            old_price_bgn: Number.isFinite(oldPrice) && oldPrice > Number(item.price_bgn) ? oldPrice : null,
            discount_pct: Number.isFinite(discountPct) && discountPct > 0 ? Math.round(discountPct) : null,
            promo_label: item.promo_label || '',
            price_history: normalizePriceHistory(item.price_history),
            formInfo,
            availability_status: normalizeAvailability(item.availability_status),
            searchText: [
                item.name,
                item.brand,
                item.store,
                item.category,
                categoryLabels[item.category],
                item.unit_label,
                item.promo_label,
                formInfo.label,
                item.label_text,
                Object.keys(item.active || {}).map(formatActiveKey).join(' '),
                Object.values(item.active || {}).join(' ')
            ].filter(Boolean).join(' ').toLowerCase()
        };
    }

    function hasUsableImage(src) {
        return !!src && !brokenImageMarkers.some(marker => String(src).includes(marker));
    }

    function normalizePriceHistory(history) {
        if (!Array.isArray(history)) return [];
        return history.map(entry => ({
            date: entry.date || '',
            price_bgn: Number(entry.price_bgn),
            price_eur: Number(entry.price_eur),
            unit_value: Number(entry.unit_value)
        })).filter(entry => entry.date && Number.isFinite(entry.price_bgn));
    }

    function renderSummary() {
        const summary = document.getElementById('supplements-summary');
        if (!summary) return;

        const stores = new Set(items.map(item => item.store)).size;
        const categories = new Set(items.map(item => item.category)).size;
        const promoCount = items.filter(item => item.discount_pct || item.promo_label || item.old_price_bgn).length;

        summary.innerHTML = `
            <div class="supplements-summary-item">
                <strong>${items.length}</strong>
                <span>сравними продукта</span>
            </div>
            <div class="supplements-summary-item">
                <strong>${stores}</strong>
                <span>магазина</span>
            </div>
            <div class="supplements-summary-item">
                <strong>${categories}</strong>
                <span>вида добавки</span>
            </div>
            <div class="supplements-summary-item">
                <strong>${promoCount}</strong>
                <span>с промо цена</span>
            </div>
        `;
    }

    function renderStoreFilters() {
        const container = document.getElementById('supplements-store-filters');
        if (!container) return;
        const stores = [...new Set(items.map(item => item.store))].sort((a, b) => a.localeCompare(b, 'bg'));
        stores.forEach(store => {
            const button = document.createElement('button');
            button.className = 'filter-btn';
            button.type = 'button';
            button.dataset.store = store;
            button.textContent = store;
            container.appendChild(button);
        });
    }

    function bindControls() {
        const search = document.getElementById('supplements-search');
        if (search) {
            const submitSearch = () => {
                filters.query = search.value.trim().toLowerCase();
                filters.page = 1;
                applyFilters();
            };
            const searchButton = document.getElementById('supplements-search-submit');
            if (searchButton) searchButton.addEventListener('click', submitSearch);
            search.addEventListener('keydown', event => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                submitSearch();
            });
        }

        document.querySelectorAll('button[data-category]').forEach(button => {
            button.addEventListener('click', () => {
                setActive(button, 'button[data-category]');
                filters.category = button.dataset.category;
                filters.page = 1;
                updateProteinSourceVisibility();
                applyFilters();
            });
        });

        document.querySelectorAll('button[data-protein-source]').forEach(button => {
            button.addEventListener('click', () => {
                setActive(button, 'button[data-protein-source]');
                filters.proteinSource = button.dataset.proteinSource;
                filters.page = 1;
                applyFilters();
            });
        });

        document.querySelectorAll('button[data-store]').forEach(button => {
            button.addEventListener('click', () => {
                setActive(button, 'button[data-store]');
                filters.store = button.dataset.store;
                filters.page = 1;
                applyFilters();
            });
        });

        document.querySelectorAll('[data-sort]').forEach(button => {
            button.addEventListener('click', () => {
                setActive(button, '[data-sort]');
                filters.sort = button.dataset.sort;
                filters.page = 1;
                applyFilters();
            });
        });

        document.addEventListener('click', event => {
            const outbound = event.target.closest('[data-affiliate-out]');
            if (outbound) {
                trackOutboundClick(outbound);
                return;
            }

            const closeDialog = event.target.closest('[data-supplement-dialog-close]');
            if (closeDialog) {
                event.preventDefault();
                closeSupplementDialog();
                return;
            }

            const dialogScreen = event.target.closest('.supplement-dialog-screen');
            if (dialogScreen && event.target === dialogScreen) {
                closeSupplementDialog();
                return;
            }

            const card = event.target.closest('.supplement-card[data-supplement-id]');
            if (card && !event.target.closest('.supplement-card-actions, .supplement-label-details, a, button')) {
                event.preventDefault();
                openSupplementDialog(card.dataset.supplementId);
            }
        });

        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && selectedSupplementId) closeSupplementDialog();
            if ((event.key === 'Enter' || event.key === ' ') && event.target.closest?.('.supplement-card[data-supplement-id]')) {
                const card = event.target.closest('.supplement-card[data-supplement-id]');
                event.preventDefault();
                openSupplementDialog(card.dataset.supplementId);
            }
        });
    }

    function setActive(activeButton, selector) {
        document.querySelectorAll(selector).forEach(button => button.classList.remove('active'));
        activeButton.classList.add('active');
    }

    function applySmartValueCategoryIntent() {
        let category = '';
        try {
            category = sessionStorage.getItem('nutrilife-smart-category') || '';
            sessionStorage.removeItem('nutrilife-smart-category');
        } catch (error) {
            category = '';
        }
        if (!category || !categoryLabels[category]) return;
        const button = document.querySelector(`button[data-category="${category}"]`);
        if (!button) return;
        setActive(button, 'button[data-category]');
        filters.category = category;
        filters.page = 1;
    }

    function applyFilters() {
        let filtered = [...items];

        if (filters.category !== 'all') {
            filtered = filtered.filter(item => item.category === filters.category);
        }
        if (filters.category === 'protein' && filters.proteinSource !== 'all') {
            filtered = filtered.filter(item => item.proteinSource === filters.proteinSource);
        }
        if (filters.store !== 'all') {
            filtered = filtered.filter(item => item.store === filters.store);
        }
        filtered = filtered.filter(item => !isOutlierPrice(item));
        if (filters.query) {
            filtered = filtered.filter(item => matchesSearch(item, filters.query));
            const intendedCategory = filters.category === 'all' ? searchCategoryIntents[filters.query] : null;
            if (intendedCategory) filtered = filtered.filter(item => item.category === intendedCategory);
        }

        filtered = sortItems(filtered);
        renderStatus(filtered.length);
        renderGrid(filtered);
    }

    function isOutlierPrice(item) {
        const limits = {
            creatine: 8,
            omega3: 60,
            magnesium: 6,
            vitamin_d: 8,
            vitamin_c: 8,
            vitamin_b: 6,
            multivitamin: 8,
            zinc: 2,
            protein: 8,
            fiber: 8,
            electrolytes: 8,
            collagen: 8,
            iron: 3,
            l_carnitine: 15,
            melatonin: 8
        };
        const limit = limits[item.category];
        return Boolean(limit && item.unitValue > limit);
    }

    function sortItems(list) {
        const confidenceScore = { high: 3, medium: 2, low: 1 };
        return [...list].sort((a, b) => {
            if (filters.sort === 'price') return a.price_bgn - b.price_bgn;
            if (filters.sort === 'store') {
                return a.store.localeCompare(b.store, 'bg') || a.category.localeCompare(b.category, 'bg') || a.unitValue - b.unitValue;
            }
            return a.unitValue - b.unitValue
                || (confidenceScore[b.confidence] || 0) - (confidenceScore[a.confidence] || 0)
                || formScorePenalty(a) - formScorePenalty(b);
        });
    }

    function valueSortScore(item) {
        const confidencePenalty = { high: 1, medium: 1.08, low: 1.18 };
        return item.unitValue * (confidencePenalty[item.confidence] || 1.25) * formScorePenalty(item);
    }

    function renderStatus(count) {
        const status = document.getElementById('supplements-status');
        if (!status) return;
        const generated = DATA.generated_at ? new Date(DATA.generated_at).toLocaleString('bg-BG') : 'неизвестно';
        const confirmed = items.filter(item => item.availability_status === 'in_stock' || item.availability_status === 'limited').length;
        const unknown = items.filter(item => item.availability_status === 'unknown').length;
        status.innerHTML = `
            <span><strong>${count}</strong> показани продукта</span>
            <span>от <strong>${items.length}</strong> общо</span>
            <span><strong>${DATA.sources.length}</strong> магазина</span>
            <small>Обновено на ${escapeHtml(generated)}. Потвърдено налични: ${confirmed}; с непотвърдена наличност: ${unknown}.</small>
        `;
    }

    function renderGrid(filtered) {
        const grid = document.getElementById('supplements-grid');
        const pagination = document.getElementById('supplements-pagination');
        if (!grid) return;

        if (!filtered.length) {
            grid.innerHTML = `
                <div class="offers-empty">
                    <p>Няма резултати с тези избрани филтри.</p>
                    <button class="filter-btn" type="button" data-reset-supplements>Покажи всичко отначало</button>
                </div>
            `;
            const reset = grid.querySelector('[data-reset-supplements]');
            if (reset) reset.addEventListener('click', resetFilters);
            if (pagination) pagination.innerHTML = '';
            return;
        }

        const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
        filters.page = Math.min(filters.page, totalPages);
        const start = (filters.page - 1) * PAGE_SIZE;
        const visible = filtered.slice(start, start + PAGE_SIZE);

        grid.innerHTML = visible.map(renderCard).join('');
        renderPagination(filtered.length, totalPages);
    }

    function renderCard(item) {
        const activeRows = Object.entries(item.active || {})
            .map(([key, value]) => `<span>${formatActiveKey(key)}: <strong>${escapeHtml(formatValueWithUnit(key, value))}</strong></span>`)
            .join('');
        const fallbackLabel = escapeAttr(categoryLabels[item.category] || 'Добавка');
        const imageSrc = hasUsableImage(item.image) ? item.image : '';
        const image = imageSrc
            ? `<img src="${escapeAttr(imageSrc)}" alt="${escapeAttr(item.name)}" loading="lazy" decoding="async" onerror="this.parentElement.classList.add('fallback');this.outerHTML='<span>${fallbackLabel}</span>'">`
            : `<span>${categoryLabels[item.category] || 'Добавка'}</span>`;
        const outboundUrl = buildOutboundUrl(item.url, item);
        const valueBadge = getValueBadge(item);
        const tradeoffBadge = getTradeoffBadge(item, valueBadge);
        const promoBadge = renderPromoBadge(item);
        const oldPriceFact = item.old_price_bgn ? `<span>Стара цена: <strong>${formatMoney(item.old_price_bgn)}</strong></span>` : '';
        const availabilityPill = renderAvailabilityPill(item);

        return `
            <article class="supplement-card" data-supplement-id="${escapeAttr(item.id)}" tabindex="0" role="button" aria-label="Виж ${escapeAttr(item.name)}">
                <div class="supplement-card-link">
                    <div class="supplement-image ${imageSrc ? '' : 'fallback'}">${image}</div>
                    <div class="supplement-body">
                        <div class="supplement-meta">
                            <span>${escapeHtml(categoryLabels[item.category] || item.category)}</span>
                            <span>${escapeHtml(item.store)}</span>
                            ${promoBadge}
                        </div>
                        <h3>${escapeHtml(item.name)}</h3>
                        <div class="supplement-price-row">
                            <strong>${formatMoney(item.unitValue)}</strong>
                            <span>${escapeHtml(formatUnitLabel(item))}</span>
                        </div>
                        <div class="supplement-value-badge ${escapeAttr(valueBadge.tone)}">${escapeHtml(valueBadge.label)}</div>
                        <div class="supplement-form-row">
                            <span>Форма: <strong>${escapeHtml(item.formInfo.label)}</strong></span>
                            <span class="supplement-tradeoff ${escapeAttr(tradeoffBadge.tone)}">${escapeHtml(tradeoffBadge.label)}</span>
                        </div>
                        <div class="supplement-facts">
                            <span>Цена: <strong>${formatProductPrice(item)}</strong></span>
                            ${oldPriceFact}
                            ${availabilityPill}
                            ${item.brand ? `<span>Марка: <strong>${escapeHtml(item.brand)}</strong></span>` : ''}
                            ${item.servings ? `<span>Приеми: <strong>${item.servings}</strong></span>` : ''}
                            ${item.count ? `<span>Брой в опаковка: <strong>${item.count}</strong></span>` : ''}
                        </div>
                        <div class="supplement-active">${activeRows}</div>
                        ${renderSupplementPriceHistory(item)}
                    </div>
                </div>
                ${renderLabelDetails(item, valueBadge, tradeoffBadge)}
                <div class="supplement-card-actions">
                    <a class="supplement-store-link" href="${escapeAttr(outboundUrl)}" target="_blank" rel="noopener" data-affiliate-out data-product-id="${escapeAttr(item.id)}" data-store="${escapeAttr(item.store)}" data-category="${escapeAttr(item.category)}">Към магазина</a>
                </div>
            </article>
        `;
    }

    function renderLabelDetails(item, valueBadge, tradeoffBadge) {
        const activeRows = Object.entries(item.active || {})
            .map(([key, value]) => `
                <div>
                    <span>${escapeHtml(formatActiveKey(key))}</span>
                    <strong>${escapeHtml(formatValueWithUnit(key, value))}</strong>
                </div>
            `)
            .join('');
        const packageRows = [
            item.servings ? ['Приеми', item.servings] : null,
            item.count ? ['Брой в опаковка', item.count] : null,
            item.weight_grams ? ['Грамаж', `${item.weight_grams} g`] : null,
            item.price_bgn ? ['Цена продукт', formatProductPrice(item)] : null
        ].filter(Boolean).map(([label, value]) => `
            <div>
                <span>${escapeHtml(label)}</span>
                <strong>${escapeHtml(value)}</strong>
            </div>
        `).join('');
        const methodRows = [
            ['Категория', categoryLabels[item.category] || item.category],
            item.proteinSource ? ['Източник', proteinSourceLabels[item.proteinSource]] : null,
            ['Форма', item.formInfo.label],
            ['Оценка цена', valueBadge.label],
            ['Баланс', tradeoffBadge.label],
            ['Сметка', `${formatMoney(item.unitValue)} ${formatUnitLabel(item)}`]
        ].filter(Boolean).map(([label, value]) => `
            <div>
                <span>${escapeHtml(label)}</span>
                <strong>${escapeHtml(value)}</strong>
            </div>
        `).join('');
        const sourceLabel = (item.label_text || item.label_image) ? `
                    <div class="supplement-label-section">
                        <h4>Етикет от сайта</h4>
                        ${item.label_image ? `<img class="supplement-label-image" src="${escapeAttr(item.label_image)}" alt="Етикет на ${escapeAttr(item.name)}" loading="lazy" decoding="async">` : ''}
                        ${item.label_text ? `<p class="supplement-label-source">${escapeHtml(item.label_text)}</p>` : ''}
                    </div>
        ` : '';

        return `
            <details class="supplement-label-details">
                <summary>Етикет и сметка</summary>
                <div class="supplement-label-panel">
                    ${sourceLabel}
                    <div class="supplement-label-section">
                        <h4>Прочетено от етикета</h4>
                        <div class="supplement-label-grid">${activeRows || '<p>Няма достатъчно ясен активен етикет. Сметката е ориентировъчна.</p>'}</div>
                    </div>
                    <div class="supplement-label-section">
                        <h4>Опаковка</h4>
                        <div class="supplement-label-grid">${packageRows || '<p>Няма надеждно разчетена опаковка.</p>'}</div>
                    </div>
                    <div class="supplement-label-section">
                        <h4>Как е категоризирано</h4>
                        <div class="supplement-label-grid">${methodRows}</div>
                    </div>
                </div>
            </details>
        `;
    }

    function renderPromoBadge(item) {
        if (!item.old_price_bgn && !item.discount_pct && !item.promo_label) return '';
        const label = item.discount_pct ? `Промо -${item.discount_pct}%` : (item.promo_label ? `Промо ${item.promo_label}` : 'Промо');
        return `<span class="supplement-promo-badge">${escapeHtml(label)}</span>`;
    }

    function renderAvailabilityPill(item) {
        if (item.availability_status !== 'in_stock' && item.availability_status !== 'limited' && item.availability_status !== 'out_of_stock') return '';
        return `<span class="availability-pill ${escapeAttr(item.availability_status)}">Наличност: <strong>${escapeHtml(availabilityLabels[item.availability_status] || 'няма наличност')}</strong></span>`;
    }

    function findSupplementById(id) {
        return items.find(item => item.id === id);
    }

    function openSupplementDialog(id) {
        if (!findSupplementById(id)) return;
        selectedSupplementId = id;
        renderSupplementDialog();
    }

    function closeSupplementDialog() {
        selectedSupplementId = '';
        renderSupplementDialog();
    }

    function renderSupplementDialog() {
        let overlay = document.getElementById('supplement-product-overlay');
        if (!selectedSupplementId) {
            if (overlay) overlay.remove();
            document.body.classList.remove('fav-product-open');
            return;
        }
        const item = findSupplementById(selectedSupplementId);
        if (!item) {
            selectedSupplementId = '';
            if (overlay) overlay.remove();
            return;
        }
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'supplement-product-overlay';
            document.body.appendChild(overlay);
        }
        overlay.innerHTML = renderSupplementDialogMarkup(item);
        document.body.classList.add('fav-product-open');
    }

    function renderSupplementDialogMarkup(item) {
        const activeRows = Object.entries(item.active || {}).map(([key, value]) => `
            <div class="supplement-dialog-stat">
                <span>${escapeHtml(formatActiveKey(key))}</span>
                <strong>${escapeHtml(formatValueWithUnit(key, value))}</strong>
            </div>
        `).join('');
        const packageRows = [
            item.servings ? ['Приеми', item.servings] : null,
            item.count ? ['Брой в опаковка', item.count] : null,
            item.weight_grams ? ['Грамаж', `${item.weight_grams} g`] : null,
            item.price_bgn ? ['Цена продукт', formatProductPrice(item)] : null,
            item.old_price_bgn ? ['Стара цена', formatMoney(item.old_price_bgn)] : null
        ].filter(Boolean).map(([label, value]) => `
            <div class="supplement-dialog-stat">
                <span>${escapeHtml(label)}</span>
                <strong>${escapeHtml(value)}</strong>
            </div>
        `).join('');
        const outboundUrl = buildOutboundUrl(item.url, item, 'detail_dialog');
        const valueBadge = getValueBadge(item);
        const tradeoffBadge = getTradeoffBadge(item, valueBadge);
        const fallbackLabel = escapeAttr(categoryLabels[item.category] || 'Добавка');
        const imageSrc = hasUsableImage(item.image) ? item.image : '';
        const image = imageSrc
            ? `<img src="${escapeAttr(imageSrc)}" alt="${escapeAttr(item.name)}" decoding="async" onerror="this.parentElement.classList.add('fallback');this.outerHTML='<span>${fallbackLabel}</span>'">`
            : `<span>${escapeHtml(categoryLabels[item.category] || 'Добавка')}</span>`;

        return `
            <div class="supplement-dialog-screen" role="dialog" aria-modal="true">
                <div class="supplement-dialog">
                    <button class="fav-screen-close" type="button" title="Затвори" data-supplement-dialog-close>×</button>
                    <div class="supplement-dialog-hero">
                        <div class="supplement-dialog-image ${imageSrc ? '' : 'fallback'}">${image}</div>
                        <div class="supplement-dialog-summary">
                            <div class="fav-preview-store">${escapeHtml(item.store)} · ${escapeHtml(categoryLabels[item.category] || item.category)}</div>
                            <h3>${escapeHtml(item.name)}</h3>
                            <div class="supplement-dialog-price">
                                <strong>${formatMoney(item.unitValue)}</strong>
                                <span>${escapeHtml(formatUnitLabel(item))}</span>
                            </div>
                            <div class="fav-preview-price-row">
                                <strong>${formatProductPrice(item)}</strong>
                                ${item.old_price_bgn ? `<span class="fav-old">${formatMoney(item.old_price_bgn)}</span>` : ''}
                                ${item.discount_pct ? `<span class="fav-disc">−${item.discount_pct}%</span>` : ''}
                            </div>
                            <div class="fav-preview-facts">
                                <span>${escapeHtml(getValueBadge(item).label)}</span>
                                <span>Форма: ${escapeHtml(item.formInfo.label)}</span>
                                ${item.proteinSource ? `<span>Източник: ${escapeHtml(proteinSourceLabels[item.proteinSource])}</span>` : ''}
                                ${item.brand ? `<span>Марка: ${escapeHtml(item.brand)}</span>` : ''}
                            </div>
                            <div class="supplement-dialog-actions">
                                <a class="btn btn-green" href="${escapeAttr(outboundUrl)}" target="_blank" rel="noopener" data-affiliate-out data-product-id="${escapeAttr(item.id)}" data-store="${escapeAttr(item.store)}" data-category="${escapeAttr(item.category)}">Към магазина</a>
                            </div>
                        </div>
                    </div>
                    <div class="supplement-dialog-content">
                        ${renderSupplementPriceHistory(item, 'detail')}
                        <section class="supplement-dialog-section">
                            <h4>Активна доза и сметка</h4>
                            <div class="supplement-dialog-grid">
                                ${activeRows || '<p>Няма достатъчно ясен активен етикет. Сметката е ориентировъчна.</p>'}
                                <div class="supplement-dialog-stat"><span>Оценка цена</span><strong>${escapeHtml(valueBadge.label)}</strong></div>
                                <div class="supplement-dialog-stat"><span>Баланс</span><strong>${escapeHtml(tradeoffBadge.label)}</strong></div>
                            </div>
                        </section>
                        <section class="supplement-dialog-section">
                            <h4>Опаковка</h4>
                            <div class="supplement-dialog-grid">${packageRows || '<p>Няма надеждно разчетена опаковка.</p>'}</div>
                        </section>
                        ${(item.label_text || item.label_image) ? `
                            <section class="supplement-dialog-section">
                                <h4>Етикет от сайта</h4>
                                ${item.label_image ? `<img class="supplement-label-image" src="${escapeAttr(item.label_image)}" alt="Етикет на ${escapeAttr(item.name)}" loading="lazy" decoding="async">` : ''}
                                ${item.label_text ? `<p class="supplement-label-source">${escapeHtml(item.label_text)}</p>` : ''}
                            </section>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    function renderSupplementPriceHistory(item, mode = 'card') {
        const history = item.price_history || [];
        if (!history.length) {
            if (mode !== 'detail') return '';
            return `
                <section class="supplement-price-history supplement-price-history-detail">
                    <div class="supplement-history-head">
                        <span>История на цената</span>
                        <strong>${formatProductPrice(item)}</strong>
                        <small>Още няма достатъчно записи. Ще се попълни при следващи обновявания.</small>
                    </div>
                </section>
            `;
        }
        const prices = history.map(entry => entry.price_bgn).filter(Number.isFinite);
        const first = prices[0];
        const last = prices[prices.length - 1];
        const low = Math.min(...prices);
        const delta = prices.length > 1 ? last - first : 0;
        const currentEntry = history[history.length - 1];
        const rows = history.slice(-5).reverse().map(entry => `
            <div class="supplement-history-row${entry === currentEntry ? ' current' : ''}">
                <span>${escapeHtml(formatDate(entry.date))}</span>
                <strong>${formatMoney(entry.price_bgn)}</strong>
                ${Number.isFinite(entry.unit_value) ? `<small>${formatMoney(entry.unit_value)} ${escapeHtml(formatUnitLabel(item))}</small>` : '<small></small>'}
            </div>
        `).join('');
        const deltaText = prices.length > 1
            ? `${delta > 0 ? '+' : ''}${delta.toFixed(2)} лв от първото следене`
            : `Следим от ${history[0].date}`;
        if (mode === 'detail') {
            return `
                <section class="supplement-price-history supplement-price-history-detail">
                    <div class="supplement-history-head">
                        <span>История на цената</span>
                        <strong>${formatMoney(last)}</strong>
                        <small>${escapeHtml(deltaText)}</small>
                    </div>
                    <div class="supplement-history-stats">
                        <span><small>Сега</small><strong>${formatMoney(last)}</strong></span>
                        <span><small>Най-ниска</small><strong>${formatMoney(low)}</strong></span>
                        <span><small>Първа</small><strong>${formatMoney(first)}</strong></span>
                    </div>
                    <div class="supplement-history-rows">${rows}</div>
                </section>
            `;
        }
        return `
            <div class="supplement-price-history">
                <div class="supplement-history-head">
                    <span>История на цената</span>
                    <strong>${formatMoney(last)}</strong>
                    <small>Най-ниска: ${formatMoney(low)} · ${escapeHtml(deltaText)}</small>
                </div>
            </div>
        `;
    }

    function formatDate(dateString) {
        const match = String(dateString || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!match) return String(dateString || '');
        return `${match[3]}.${match[2]}.${match[1]}`;
    }

    function getValueBadge(item) {
        const ranges = {
            creatine: [0.6, 1.5],
            omega3: [1.5, 12],
            magnesium: [0.12, 0.6],
            vitamin_d: [0.15, 1.2],
            vitamin_c: [0.12, 1.2],
            vitamin_b: [0.12, 0.8],
            multivitamin: [0.25, 0.9],
            zinc: [0.08, 0.22],
            protein: [2.0, 3.2],
            fiber: [0.8, 2.2],
            electrolytes: [0.6, 1.8],
            collagen: [1.0, 2.5],
            iron: [0.18, 0.6]
        };
        const range = ranges[item.category];
        if (!range) return { tone: 'neutral', label: 'Сравнима цена' };
        if (item.unitValue <= range[0]) return { tone: 'good', label: 'Много добра стойност' };
        if (item.unitValue <= range[1]) return { tone: 'neutral', label: 'Нормална цена' };
        return { tone: 'high', label: 'По-скъпа сметка' };
    }

    function detectFormInfo(item) {
        const active = item.active || {};
        const text = [
            item.name,
            item.brand,
            item.unit_label,
            Object.keys(active).join(' '),
            Object.values(active).join(' ')
        ].filter(Boolean).join(' ').toLowerCase();

        if (item.category === 'magnesium') {
            if (hasAny(text, ['bisglycinate', 'бисглицинат', 'glycinate', 'глицинат'])) return form('Магнезий бисглицинат', 'preferred');
            if (hasAny(text, ['taurate', 'таурат'])) return form('Магнезий таурат', 'preferred');
            if (hasAny(text, ['malate', 'малат'])) return form('Магнезий малат', 'preferred');
            if (hasAny(text, ['citrate', 'цитрат', 'citramal'])) return form('Магнезий цитрат', 'good');
            if (hasAny(text, ['chelated', 'chelate', 'хелат'])) return form('Хелатиран магнезий', 'good');
            if (hasAny(text, ['oxide', 'оксид'])) return form('Магнезий оксид', 'basic');
            if (hasAny(text, ['complex', 'комплекс', 'calcium magnesium', 'zinc and magnesium'])) return form('Магнезиев комплекс', 'standard');
            if (active.magnesium_mg) return form('Магнезий по етикет', 'neutral');
            return form('Магнезий', 'neutral');
        }

        if (item.category === 'zinc') {
            if (hasAny(text, ['picolinate', 'пиколинат'])) return form('Цинк пиколинат', 'preferred');
            if (hasAny(text, ['bisglycinate', 'бисглицинат', 'glycinate', 'глицинат'])) return form('Цинк бисглицинат', 'preferred');
            if (hasAny(text, ['chelated', 'chelate', 'хелат'])) return form('Хелатиран цинк', 'good');
            if (hasAny(text, ['gluconate', 'глюконат'])) return form('Цинк глюконат', 'good');
            if (hasAny(text, ['citrate', 'цитрат'])) return form('Цинк цитрат', 'good');
            if (hasAny(text, ['oxide', 'оксид', 'sulfate', 'сулфат'])) return form('Базова форма цинк', 'basic');
            if (hasAny(text, ['complex', 'balance', 'duo', 'комплекс'])) return form('Цинков комплекс', 'standard');
            if (active.zinc_mg) return form('Цинк по етикет', 'neutral');
            return form('Цинк', 'neutral');
        }

        if (item.category === 'omega3') {
            if (hasAny(text, ['algae', 'водорасли', 'микроводорасли'])) return form('Омега-3 от водорасли', 'preferred');
            if (hasAny(text, ['high strength', 'high potency', 'extra strength', '500 epa', 'ultra', 'forte'])) return form('Висока концентрация омега-3', 'preferred');
            if (hasAny(text, ['krill', 'крил'])) return form('Крилово масло', 'good');
            if (hasAny(text, ['3-6-9', '3 6 9'])) return form('Омега 3-6-9 комплекс', 'basic');
            if (hasAny(text, ['fish oil', 'рибено масло', 'omega', 'омега'])) return form('Рибено масло', 'good');
            if (active.epa_dha_mg || active.epa_mg || active.dha_mg) return form('EPA+DHA омега-3', 'good');
            return form('Омега-3', 'neutral');
        }

        if (item.category === 'vitamin_d') {
            if (hasAny(text, ['k2', 'k-2', 'к2'])) return form('D3 + K2', 'preferred');
            if (hasAny(text, ['d3', 'd-3', 'д3', 'холекалциферол'])) return form('Витамин D3', 'good');
            if (hasAny(text, ['d2', 'ергокалциферол'])) return form('Витамин D2', 'basic');
            return form('Витамин D', 'neutral');
        }

        if (item.category === 'vitamin_c') {
            if (hasAny(text, ['liposomal', 'липозом'])) return form('Липозомен витамин C', 'preferred');
            if (hasAny(text, ['buffered', 'буфериран'])) return form('Буфериран витамин C', 'good');
            if (hasAny(text, ['acerola', 'ацерола', 'rose hips', 'шипка', 'bioflavonoids', 'биофлав'])) return form('Витамин C с кофактори', 'good');
            if (hasAny(text, ['ascorbic', 'аскорбинова', 'c-1000', '1000 mg', '500 mg'])) return form('Стандартен витамин C', 'standard');
            if (hasAny(text, ['collagen', 'колаген', 'zinc', 'цинк', 'complex', 'комплекс'])) return form('Витамин C комплекс', 'standard');
            if (active.vitamin_c_mg) return form('Витамин C по етикет', 'neutral');
            return form('Витамин C', 'neutral');
        }

        if (item.category === 'vitamin_b') {
            if (hasAny(text, ['methyl', 'метил', 'methylfolate', 'methylcobalamin'])) return form('Метилиран B-комплекс', 'good');
            if (hasAny(text, ['complex', 'комплекс', 'b-50', 'b50', 'b-100', 'b100'])) return form('B-комплекс', 'standard');
            return form('B-витамини', 'neutral');
        }

        if (item.category === 'multivitamin') {
            if (hasAny(text, ['daily', 'one a day', 'one daily', 'мулти', 'multi', 'complex', 'комплекс'])) return form('Мултивитамин', 'standard');
            return form('Мултивитамин', 'neutral');
        }

        if (item.category === 'creatine') {
            if (hasAny(text, ['creapure'])) return form('Creapure креатин', 'preferred');
            if (hasAny(text, ['monohydrate', 'mono', 'монохидрат'])) return form('Креатин монохидрат', 'good');
            if (hasAny(text, ['malate', 'малат'])) return form('Креатин малат', 'standard');
            if (hasAny(text, ['kre-alkalyn'])) return form('Kre-Alkalyn', 'standard');
            if (hasAny(text, ['blend', 'matrix', 'taurine', 'смес', 'матрица'])) return form('Креатинова смес', 'standard');
            if (active.creatine_mg_per_serving || active.creatine_total_mg) return form('Креатин по етикет', 'neutral');
            return form('Креатин', 'neutral');
        }

        if (item.category === 'protein') {
            if (hasAny(text, ['isolate', 'изолат', 'hydro', 'хидро'])) return form('Изолат/хидролизат', 'preferred');
            if (hasAny(text, ['whey', 'суроват'])) return form('Суроватъчен протеин', 'good');
            if (hasAny(text, ['plant', 'растител'])) return form('Растителен протеин', 'good');
            if (hasAny(text, ['blend', 'matrix', 'combat', 'source7', 'смес'])) return form('Протеинова смес', 'standard');
            if (active.protein_g) return form('Протеин по етикет', 'neutral');
            if (active.estimated_total_protein_g) return form('Протеинова оценка', 'neutral');
            return form('Протеин', 'neutral');
        }

        if (item.category === 'fiber') {
            if (hasAny(text, ['psyllium', 'псилиум', 'husk'])) return form('Псилиум хуск', 'good');
            if (hasAny(text, ['acacia', 'акациев'])) return form('Акациеви фибри', 'good');
            if (hasAny(text, ['pectin', 'guar', 'пектин'])) return form('Фибри комплекс', 'standard');
            if (active.fiber_g || active.fiber_mg) return form('Фибри по етикет', 'neutral');
            return form('Фибри', 'neutral');
        }

        if (item.category === 'electrolytes') {
            if (hasAny(text, ['sodium', 'натрий', 'potassium', 'калий', 'magnesium', 'магнезий'])) return form('Електролитен комплекс', 'good');
            if (active.electrolyte_serving) return form('Електролитна доза', 'neutral');
            return form('Електролити', 'neutral');
        }

        if (item.category === 'collagen') {
            if (hasAny(text, ['peptides', 'пептиди', 'hydrolyzed', 'хидролизиран'])) return form('Колагенови пептиди', 'good');
            if (hasAny(text, ['type ii', 'тип ii', 'uc-ii'])) return form('Колаген тип II', 'preferred');
            if (active.collagen_g || active.collagen_total_g) return form('Колаген по етикет', 'neutral');
            return form('Колаген', 'neutral');
        }

        if (item.category === 'iron') {
            if (hasAny(text, ['bisglycinate', 'бисглицинат'])) return form('Желязо бисглицинат', 'preferred');
            if (hasAny(text, ['fumarate', 'фумарат', 'gluconate', 'глюконат'])) return form('Органична форма желязо', 'good');
            if (hasAny(text, ['ferrous', 'sulfate', 'сулфат'])) return form('Желязна сол', 'standard');
            if (active.iron_mg) return form('Желязо по етикет', 'neutral');
            return form('Желязо', 'neutral');
        }

        if (item.category === 'l_carnitine') {
            if (hasAny(text, ['acetyl', 'ацетил', 'alcar'])) return form('Ацетил Л-карнитин', 'preferred');
            if (hasAny(text, ['tartrate', 'тартрат', 'lclt'])) return form('Л-карнитин тартрат', 'good');
            if (hasAny(text, ['fumarate', 'фумарат'])) return form('Л-карнитин фумарат', 'standard');
            if (hasAny(text, ['liquid', 'течн', 'shot', 'ampule'])) return form('Течен Л-карнитин', 'good');
            if (active.l_carnitine_mg) return form('Л-карнитин по етикет', 'neutral');
            return form('Л-карнитин', 'neutral');
        }

        if (item.category === 'melatonin') {
            if (hasAny(text, ['extended release', 'prolonged release', 'slow release', 'удължено освобождаване'])) return form('Мелатонин забавено действие', 'standard');
            if (hasAny(text, ['sublingual', 'drops', 'капки', 'liquid', 'течн'])) return form('Мелатонин капки', 'good');
            if (hasAny(text, ['fast', 'quick', 'rapid', 'мини', 'мелатонин 0.', 'мелатонин 1'])) return form('Мелатонин бързодействащ', 'good');
            if (active.melatonin_mg) return form('Мелатонин по етикет', 'neutral');
            return form('Мелатонин', 'neutral');
        }

        return form('—', 'neutral');
    }
    function form(label, tier) {
        return { label, tier };
    }

    function getTradeoffBadge(item, valueBadge) {
        const tier = item.formInfo ? item.formInfo.tier : 'unknown';
        if (tier === 'preferred' && valueBadge.tone === 'good') return { tone: 'good', label: 'добра форма, добра цена' };
        if (tier === 'preferred' && valueBadge.tone === 'neutral') return { tone: 'good', label: 'добра форма, разумна цена' };
        if (tier === 'preferred') return { tone: 'watch', label: 'добра форма, но скъпа' };
        if (tier === 'good' && valueBadge.tone === 'good') return { tone: 'good', label: 'добър баланс' };
        if (tier === 'good' && valueBadge.tone === 'high') return { tone: 'watch', label: 'добра форма, висок premium' };
        if (tier === 'basic' && valueBadge.tone === 'good') return { tone: 'neutral', label: 'евтино, но базова форма' };
        if (tier === 'basic') return { tone: 'watch', label: 'базова форма' };
        if (tier === 'unknown') return { tone: 'unknown', label: 'провери формата' };
        return { tone: 'neutral', label: 'стандартна сметка' };
    }

    function formScorePenalty(item) {
        const tier = item.formInfo ? item.formInfo.tier : 'unknown';
        const penalties = {
            preferred: 0.92,
            good: 1,
            standard: 1.03,
            neutral: 1,
            basic: 1.14,
            unknown: 1.10
        };
        return penalties[tier] || 1.10;
    }

    function hasAny(text, needles) {
        return needles.some(needle => text.includes(needle));
    }

    function matchesSearch(item, query) {
        if (item.searchText.includes(query)) return true;
        const tokens = query.split(/\s+/).filter(token => token.length > 1);
        if (!tokens.length) return true;
        return tokens.every(token => item.searchText.includes(token));
    }

    function renderPagination(total, totalPages) {
        const pagination = document.getElementById('supplements-pagination');
        if (!pagination) return;
        if (totalPages <= 1) {
            pagination.innerHTML = '';
            return;
        }

        pagination.innerHTML = `
            <div class="pagination-summary">Страница ${filters.page} от ${totalPages} · ${total} продукта</div>
            <div class="pagination-controls">
                <button class="pagination-btn" type="button" data-page="prev" ${filters.page === 1 ? 'disabled' : ''}>Назад</button>
                <button class="pagination-btn" type="button" data-page="next" ${filters.page === totalPages ? 'disabled' : ''}>Напред</button>
            </div>
        `;

        pagination.querySelectorAll('[data-page]').forEach(button => {
            button.addEventListener('click', () => {
                if (button.dataset.page === 'prev') filters.page -= 1;
                if (button.dataset.page === 'next') filters.page += 1;
                applyFilters();
                document.getElementById('supplements-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        });
    }

    function renderBestByCategory() {
        const container = document.getElementById('supplements-best');
        if (!container) return;
        const best = Object.values(items.reduce((acc, item) => {
            const current = acc[item.category];
            if (!current || compareBestCandidate(item, current) < 0) acc[item.category] = item;
            return acc;
        }, {})).sort((a, b) => a.category.localeCompare(b.category, 'bg'));

        container.innerHTML = best.map(item => `
            <a class="supplements-best-card" href="${escapeAttr(buildOutboundUrl(item.url, item, 'best_by_category'))}" target="_blank" rel="noopener" data-affiliate-out data-product-id="${escapeAttr(item.id)}" data-store="${escapeAttr(item.store)}" data-category="${escapeAttr(item.category)}">
                <span>${escapeHtml(categoryLabels[item.category] || item.category)}</span>
                <strong>${formatMoney(item.unitValue)}</strong>
                <small>${escapeHtml(formatUnitLabel(item))}</small>
                <em>${escapeHtml(item.name)}</em>
            </a>
        `).join('');
    }

    function compareBestCandidate(a, b) {
        const confidenceScore = { high: 3, medium: 2, low: 1 };
        const confDiff = (confidenceScore[b.confidence] || 0) - (confidenceScore[a.confidence] || 0);
        if (confDiff !== 0) return confDiff;
        return a.unitValue - b.unitValue || formScorePenalty(a) - formScorePenalty(b);
    }

    function resetFilters() {
        filters = { category: 'all', proteinSource: 'all', store: 'all', sort: 'unit', query: '', page: 1 };
        const search = document.getElementById('supplements-search');
        if (search) search.value = '';
        document.querySelectorAll('button[data-category]').forEach(btn => btn.classList.toggle('active', btn.dataset.category === 'all'));
        document.querySelectorAll('button[data-protein-source]').forEach(btn => btn.classList.toggle('active', btn.dataset.proteinSource === 'all'));
        document.querySelectorAll('button[data-store]').forEach(btn => btn.classList.toggle('active', btn.dataset.store === 'all'));
        document.querySelectorAll('button[data-sort]').forEach(btn => btn.classList.toggle('active', btn.dataset.sort === 'unit'));
        updateProteinSourceVisibility();
        applyFilters();
    }

    function buildOutboundUrl(url, item, placement = 'card') {
        if (!url || url === '#') return '#';
        try {
            const parsed = new URL(url, window.location.href);
            parsed.searchParams.set('utm_source', 'nutrilife');
            parsed.searchParams.set('utm_medium', 'smart_value');
            parsed.searchParams.set('utm_campaign', 'smart_supplements');
            parsed.searchParams.set('utm_content', `${placement}_${item.category}_${item.store}`.toLowerCase().replace(/[^a-z0-9_]+/g, '_'));
            return parsed.toString();
        } catch (error) {
            return url;
        }
    }

    function trackOutboundClick(link) {
        const click = {
            productId: link.dataset.productId || '',
            store: link.dataset.store || '',
            category: link.dataset.category || '',
            href: link.href,
            clickedAt: new Date().toISOString()
        };
        try {
            const clicks = JSON.parse(localStorage.getItem('nutrilife-affiliate-clicks') || '[]');
            clicks.unshift(click);
            localStorage.setItem('nutrilife-affiliate-clicks', JSON.stringify(clicks.slice(0, 100)));
        } catch (error) {
            // Best-effort analytics until a real endpoint is wired.
        }
        if (typeof window.gtag === 'function') {
            window.gtag('event', 'affiliate_click', {
                product_id: click.productId,
                store: click.store,
                category: click.category
            });
        }
    }

    function renderError(message) {
        const status = document.getElementById('supplements-status');
        if (status) status.innerHTML = `<span>${escapeHtml(message)}</span>`;
    }

    function formatMoney(value) {
        return `${Number(value).toFixed(2)} лв`;
    }

    function formatEuro(value) {
        return `${Number(value).toFixed(2)} €`;
    }

    function formatProductPrice(item) {
        const bgn = formatMoney(item.price_bgn);
        return item.price_eur ? `${bgn} / ${formatEuro(item.price_eur)}` : bgn;
    }

    function normalizeAvailability(value) {
        if (value === 'limited') return 'limited';
        if (value === 'in_stock') return 'in_stock';
        if (value === 'out_of_stock') return 'out_of_stock';
        return 'unknown';
    }

    function formatUnitLabel(item) {
        const labels = {
            bgn_per_5g_creatine: 'за 5 g креатин',
            bgn_per_1000mg_epa_dha: 'за 1000 mg омега-3',
            bgn_per_100mg_magnesium: 'за 100 mg магнезий',
            bgn_per_1000iu_d3: 'за 1000 IU витамин D3',
            bgn_per_1000mg_vitamin_c: 'за 1000 mg витамин C',
            bgn_per_b_complex_serving: 'за 1 прием витамини B',
            bgn_per_multivitamin_serving: 'за 1 прием мултивитамин',
            bgn_per_15mg_zinc: 'за 15 mg цинк',
            bgn_per_25g_protein: 'за 25 g протеин',
            bgn_per_5g_fiber: 'за 5 g фибри',
            bgn_per_electrolyte_serving: 'за 1 доза електролити',
            bgn_per_10g_collagen: 'за 10 g колаген',
            bgn_per_14mg_iron: 'за 14 mg желязо',
            bgn_per_1000mg_carnitine: 'за 1000 mg л-карнитин',
            bgn_per_3mg_melatonin: 'за 3 mg мелатонин'
        };
        return labels[item.unitKey] || item.unit_label || '';
    }

    function formatActiveKey(key) {
        const labels = {
            creatine_mg_per_serving: 'креатин в доза',
            creatine_total_mg: 'креатин общо',
            epa_mg: 'EPA (омега-3)',
            dha_mg: 'DHA (омега-3)',
            epa_dha_mg: 'общо омега-3 (EPA + DHA)',
            magnesium_mg: 'магнезий в доза',
            vitamin_d_iu: 'витамин D3',
            vitamin_c_mg: 'витамин C в доза',
            b_complex_serving: '1 прием',
            multivitamin_serving: '1 прием',
            zinc_mg: 'цинк в доза',
            protein_g: 'протеин в доза',
            estimated_total_protein_g: 'протеин общо (оценка)',
            estimated_protein_ratio_pct: 'приблизително протеин',
            fiber_g: 'фибри в доза',
            fiber_mg: 'фибри в доза',
            sodium_mg: 'натрий в доза',
            potassium_mg: 'калий в доза',
            collagen_g: 'колаген в доза',
            collagen_total_g: 'колаген общо',
            iron_mg: 'желязо в доза',
            electrolyte_serving: '1 прием',
            package_weight_g: 'грамаж',
            carnitine_mg: 'л-карнитин в доза',
            melatonin_mg: 'мелатонин в доза'
        };
        return labels[key] || key.replaceAll('_', ' ');
    }

    function formatValueWithUnit(key, value) {
        const number = typeof value === 'number' ? value : Number(value);
        const rendered = Number.isFinite(number) ? String(number) : String(value);
        if (key.includes('_mg')) return `${rendered} mg`;
        if (key.includes('_iu')) return `${rendered} IU`;
        if (key.endsWith('_g')) return `${rendered} g`;
        if (key.endsWith('_pct')) return `${rendered}%`;
        return rendered;
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, ch => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[ch]));
    }

    function escapeAttr(value) {
        return escapeHtml(value).replace(/`/g, '&#096;');
    }
})();
