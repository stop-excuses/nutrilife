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
        fiber: 'Фибри'
    };
    const confidenceLabels = {
        high: 'реален етикет',
        medium: 'частична сметка',
        low: 'само ориентир'
    };
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
        'psyllium': 'fiber'
    };

    let items = [];
    let filters = {
        category: 'all',
        store: 'all',
        confidence: 'all',
        sort: 'unit',
        query: '',
        page: 1,
        hideOutliers: true
    };
    let compareIds = [];

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
        applyFilters();
        renderBestByCategory();
        renderWatchPanel();
        renderComparePanel();
    }

    function normalizeItem(item) {
        const unitKey = Object.keys(item.price_per_active_unit || {})[0] || '';
        const unitValue = unitKey ? Number(item.price_per_active_unit[unitKey]) : null;
        return {
            ...item,
            unitKey,
            unitValue: Number.isFinite(unitValue) ? unitValue : null,
            searchText: [
                item.name,
                item.brand,
                item.store,
                item.category,
                item.unit_label,
                Object.values(item.active || {}).join(' ')
            ].filter(Boolean).join(' ').toLowerCase()
        };
    }

    function renderSummary() {
        const summary = document.getElementById('supplements-summary');
        if (!summary) return;

        const stores = new Set(items.map(item => item.store)).size;
        const categories = new Set(items.map(item => item.category)).size;
        const highConfidence = items.filter(item => item.confidence === 'high').length;

        summary.innerHTML = `
            <div class="supplements-summary-item">
                <strong>${items.length}</strong>
                <span>продукта с ясна сметка</span>
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
                <strong>${highConfidence}</strong>
                <span>с ясен етикет</span>
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
            search.addEventListener('input', () => {
                filters.query = search.value.trim().toLowerCase();
                filters.page = 1;
                applyFilters();
            });
        }

        document.querySelectorAll('button[data-category]').forEach(button => {
            button.addEventListener('click', () => {
                setActive(button, 'button[data-category]');
                filters.category = button.dataset.category;
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

        document.querySelectorAll('button[data-confidence]').forEach(button => {
            button.addEventListener('click', () => {
                setActive(button, 'button[data-confidence]');
                filters.confidence = button.dataset.confidence;
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

        const outlierToggle = document.getElementById('supplements-hide-outliers');
        if (outlierToggle) {
            outlierToggle.addEventListener('change', () => {
                filters.hideOutliers = outlierToggle.checked;
                filters.page = 1;
                applyFilters();
            });
        }

        document.addEventListener('click', event => {
            const watchButton = event.target.closest('[data-watch-supplement]');
            if (watchButton) {
                event.preventDefault();
                toggleWatchItem(watchButton.dataset.watchSupplement);
            }

            const outbound = event.target.closest('[data-affiliate-out]');
            if (outbound) {
                trackOutboundClick(outbound);
            }

            const removeWatch = event.target.closest('[data-remove-watch]');
            if (removeWatch) {
                event.preventDefault();
                removeWatchItem(removeWatch.dataset.removeWatch);
            }

            const compareButton = event.target.closest('[data-compare-supplement]');
            if (compareButton) {
                event.preventDefault();
                toggleCompareItem(compareButton.dataset.compareSupplement);
            }

            const removeCompare = event.target.closest('[data-remove-compare]');
            if (removeCompare) {
                event.preventDefault();
                removeCompareItem(removeCompare.dataset.removeCompare);
            }

            const clearCompare = event.target.closest('[data-clear-compare]');
            if (clearCompare) {
                event.preventDefault();
                compareIds = [];
                applyFilters();
                renderComparePanel();
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
        if (filters.store !== 'all') {
            filtered = filtered.filter(item => item.store === filters.store);
        }
        if (filters.confidence !== 'all') {
            filtered = filtered.filter(item => item.confidence === filters.confidence);
        }
        if (filters.hideOutliers) {
            filtered = filtered.filter(item => !isOutlierPrice(item));
        }
        if (filters.query) {
            filtered = filtered.filter(item => item.searchText.includes(filters.query));
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
            fiber: 8
        };
        const limit = limits[item.category];
        return Boolean(limit && item.unitValue > limit);
    }

    function sortItems(list) {
        const confidenceScore = { high: 3, medium: 2, low: 1 };
        return [...list].sort((a, b) => {
            if (filters.sort === 'price') return a.price_bgn - b.price_bgn;
            if (filters.sort === 'confidence') {
                return (confidenceScore[b.confidence] || 0) - (confidenceScore[a.confidence] || 0) || a.unitValue - b.unitValue;
            }
            if (filters.sort === 'store') {
                return a.store.localeCompare(b.store, 'bg') || a.category.localeCompare(b.category, 'bg') || a.unitValue - b.unitValue;
            }
            return valueSortScore(a) - valueSortScore(b) || (confidenceScore[b.confidence] || 0) - (confidenceScore[a.confidence] || 0);
        });
    }

    function valueSortScore(item) {
        const confidencePenalty = { high: 1, medium: 1.08, low: 1.18 };
        return item.unitValue * (confidencePenalty[item.confidence] || 1.25);
    }

    function renderStatus(count) {
        const status = document.getElementById('supplements-status');
        if (!status) return;
        const generated = DATA.generated_at ? new Date(DATA.generated_at).toLocaleString('bg-BG') : 'неизвестно';
        const hiddenOutliers = filters.hideOutliers ? items.filter(item => isOutlierPrice(item)).length : 0;
        status.innerHTML = `
            <span><strong>${count}</strong> показани продукта</span>
            <span>от <strong>${items.length}</strong> общо</span>
            <span><strong>${DATA.sources.length}</strong> магазина</span>
            <small>Обновено на ${escapeHtml(generated)}. ${filters.hideOutliers ? `Скрити са ${hiddenOutliers} очевидно съмнителни сметки.` : 'Показани са и съмнително скъпите сметки.'}</small>
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
        const image = item.image
            ? `<img src="${escapeAttr(item.image)}" alt="${escapeAttr(item.name)}" loading="lazy">`
            : `<span>${categoryLabels[item.category] || 'Добавка'}</span>`;
        const watched = isWatched(item.id);
        const compared = compareIds.includes(item.id);
        const outboundUrl = buildOutboundUrl(item.url, item);
        const valueBadge = getValueBadge(item);

        return `
            <article class="supplement-card">
                <a class="supplement-card-link" href="${escapeAttr(outboundUrl)}" target="_blank" rel="noopener" data-affiliate-out data-product-id="${escapeAttr(item.id)}" data-store="${escapeAttr(item.store)}" data-category="${escapeAttr(item.category)}">
                    <div class="supplement-image ${item.image ? '' : 'fallback'}">${image}</div>
                    <div class="supplement-body">
                        <div class="supplement-meta">
                            <span>${escapeHtml(categoryLabels[item.category] || item.category)}</span>
                            <span>${escapeHtml(item.store)}</span>
                        </div>
                        <h3>${escapeHtml(item.name)}</h3>
                        <div class="supplement-price-row">
                            <strong>${formatMoney(item.unitValue)}</strong>
                            <span>${escapeHtml(formatUnitLabel(item))}</span>
                        </div>
                        <div class="supplement-value-badge ${escapeAttr(valueBadge.tone)}">${escapeHtml(valueBadge.label)}</div>
                        <div class="supplement-facts">
                            <span>Цена: <strong>${formatMoney(item.price_bgn)}</strong></span>
                            ${item.brand ? `<span>Марка: <strong>${escapeHtml(item.brand)}</strong></span>` : ''}
                            ${item.servings ? `<span>Приеми: <strong>${item.servings}</strong></span>` : ''}
                            ${item.count ? `<span>Брой в опаковка: <strong>${item.count}</strong></span>` : ''}
                        </div>
                        <div class="supplement-active">${activeRows}</div>
                        <div class="supplement-confidence ${escapeAttr(item.confidence)}">Етикет: ${escapeHtml(confidenceLabels[item.confidence] || item.confidence)}</div>
                        ${renderProteinWarning(item)}
                    </div>
                </a>
                <div class="supplement-card-actions">
                    <button class="watch-price-btn ${watched ? 'active' : ''}" type="button" data-watch-supplement="${escapeAttr(item.id)}">${watched ? 'Следиш цената' : 'Следи цена'}</button>
                    <button class="compare-supplement-btn ${compared ? 'active' : ''}" type="button" data-compare-supplement="${escapeAttr(item.id)}">${compared ? 'В сравнение' : 'Сравни'}</button>
                </div>
            </article>
        `;
    }

    function renderProteinWarning(item) {
        if (item.category !== 'protein' || item.confidence !== 'low') return '';
        const active = item.active || {};
        const hasEstimate = active.estimated_total_protein_g != null || active.estimated_protein_ratio_pct != null;
        if (hasEstimate) {
            const pct = active.estimated_protein_ratio_pct || 85;
            return `<div class="supplement-warning">Ориентировъчна сметка: ${pct}% усреднено белтъчно съдържание (типично за whey/растителен изолат). Провери етикета за точните стойности.</div>`;
        }
        return '<div class="supplement-warning">На страницата на продукта не открихме ясни грамове белтъчини на доза. Сметката е ориентир — провери етикета.</div>';
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
            fiber: [0.8, 2.2]
        };
        const range = ranges[item.category];
        if (!range) return { tone: 'neutral', label: 'Сравнима цена' };
        if (item.unitValue <= range[0]) return { tone: 'good', label: 'Много добра стойност' };
        if (item.unitValue <= range[1]) return { tone: 'neutral', label: 'Нормална цена' };
        return { tone: 'high', label: 'По-скъпа сметка' };
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
        return valueSortScore(a) - valueSortScore(b);
    }

    function resetFilters() {
        filters = { category: 'all', store: 'all', confidence: 'all', sort: 'unit', query: '', page: 1, hideOutliers: true };
        const search = document.getElementById('supplements-search');
        if (search) search.value = '';
        const outlierToggle = document.getElementById('supplements-hide-outliers');
        if (outlierToggle) outlierToggle.checked = true;
        document.querySelectorAll('button[data-category]').forEach(btn => btn.classList.toggle('active', btn.dataset.category === 'all'));
        document.querySelectorAll('button[data-store]').forEach(btn => btn.classList.toggle('active', btn.dataset.store === 'all'));
        document.querySelectorAll('button[data-confidence]').forEach(btn => btn.classList.toggle('active', btn.dataset.confidence === 'all'));
        document.querySelectorAll('button[data-sort]').forEach(btn => btn.classList.toggle('active', btn.dataset.sort === 'unit'));
        applyFilters();
    }

    function toggleWatchItem(id) {
        const item = items.find(entry => entry.id === id);
        if (!item) return;
        const watch = getWatchList();
        const exists = watch.some(entry => entry.id === id);
        const next = exists
            ? watch.filter(entry => entry.id !== id)
            : [{
                id: item.id,
                name: item.name,
                store: item.store,
                category: item.category,
                unitValue: item.unitValue,
                unitLabel: formatUnitLabel(item),
                price: item.price_bgn,
                url: item.url,
                savedAt: new Date().toISOString()
            }, ...watch].slice(0, 30);
        setWatchList(next);
        applyFilters();
        renderWatchPanel();
    }

    function removeWatchItem(id) {
        setWatchList(getWatchList().filter(entry => entry.id !== id));
        applyFilters();
        renderWatchPanel();
    }

    function toggleCompareItem(id) {
        if (compareIds.includes(id)) {
            compareIds = compareIds.filter(entryId => entryId !== id);
        } else if (compareIds.length < 3) {
            compareIds = [...compareIds, id];
        }
        applyFilters();
        renderComparePanel();
    }

    function removeCompareItem(id) {
        compareIds = compareIds.filter(entryId => entryId !== id);
        applyFilters();
        renderComparePanel();
    }

    function renderComparePanel() {
        const panel = document.getElementById('supplement-compare-panel');
        if (!panel) return;
        const selected = compareIds
            .map(id => items.find(item => item.id === id))
            .filter(Boolean);

        if (!selected.length) {
            panel.innerHTML = `
                <div class="compare-empty">
                    <strong>Сравни до 3 продукта</strong>
                    <span>Избери “Сравни” на картите, за да видиш цена за доза, опаковка, етикет и магазин един до друг.</span>
                </div>
            `;
            return;
        }

        panel.innerHTML = `
            <div class="compare-head">
                        <span><strong>${selected.length}/3</strong> продукта за сравнение · ${selected.length < 3 ? 'избери още' : 'готово'}</span>
                <button class="filter-btn" type="button" data-clear-compare>Изчисти</button>
            </div>
            <div class="compare-table">
                ${selected.map(item => `
                    <article class="compare-product">
                        <button class="compare-remove" type="button" data-remove-compare="${escapeAttr(item.id)}" aria-label="Премахни от сравнение">×</button>
                        <span>${escapeHtml(categoryLabels[item.category] || item.category)} · ${escapeHtml(item.store)}</span>
                        <h3>${escapeHtml(item.name)}</h3>
                        <strong>${formatMoney(item.unitValue)}</strong>
                        <small>${escapeHtml(formatUnitLabel(item))}</small>
                        <div class="compare-facts">
                            <span>Цена: <b>${formatMoney(item.price_bgn)}</b></span>
                            ${item.servings ? `<span>Приеми: <b>${item.servings}</b></span>` : ''}
                            ${item.count ? `<span>Брой: <b>${item.count}</b></span>` : ''}
                            <span>Етикет: <b>${escapeHtml(confidenceLabels[item.confidence] || item.confidence)}</b></span>
                        </div>
                    </article>
                `).join('')}
            </div>
        `;
    }

    function renderWatchPanel() {
        const panel = document.getElementById('supplements-watch-panel');
        if (!panel) return;
        const watch = getWatchList();
        if (!watch.length) {
            panel.innerHTML = '';
            return;
        }
        panel.innerHTML = `
            <div class="section-title compact-section-top">
                <h2>Следене на цени</h2>
                <p class="section-subtitle">Твоят списък за продукти, които искаш да провериш пак по-късно.</p>
            </div>
            <div class="watch-list">
                ${watch.map(entry => `
                    <div class="watch-row">
                        <span>
                            <strong>${escapeHtml(entry.name)}</strong>
                            <small>${escapeHtml(entry.store)} · ${escapeHtml(categoryLabels[entry.category] || entry.category)}</small>
                        </span>
                        <span>
                            <strong>${formatMoney(entry.unitValue)}</strong>
                            <small>${escapeHtml(entry.unitLabel)}</small>
                        </span>
                        <button class="filter-btn" type="button" data-remove-watch="${escapeAttr(entry.id)}">Премахни</button>
                    </div>
                `).join('')}
            </div>
        `;
    }

    function isWatched(id) {
        return getWatchList().some(entry => entry.id === id);
    }

    function getWatchList() {
        try {
            return JSON.parse(localStorage.getItem('nutrilife-supplement-watch') || '[]');
        } catch (error) {
            return [];
        }
    }

    function setWatchList(list) {
        try {
            localStorage.setItem('nutrilife-supplement-watch', JSON.stringify(list));
        } catch (error) {
            // localStorage may be disabled.
        }
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
            bgn_per_5g_fiber: 'за 5 g фибри'
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
            package_weight_g: 'грамаж'
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
