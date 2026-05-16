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
        applyFilters();
        renderBestByCategory();
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

        document.querySelectorAll('[data-category]').forEach(button => {
            button.addEventListener('click', () => {
                setActive(button, '[data-category]');
                filters.category = button.dataset.category;
                filters.page = 1;
                applyFilters();
            });
        });

        document.querySelectorAll('[data-store]').forEach(button => {
            button.addEventListener('click', () => {
                setActive(button, '[data-store]');
                filters.store = button.dataset.store;
                filters.page = 1;
                applyFilters();
            });
        });

        document.querySelectorAll('[data-confidence]').forEach(button => {
            button.addEventListener('click', () => {
                setActive(button, '[data-confidence]');
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
    }

    function setActive(activeButton, selector) {
        document.querySelectorAll(selector).forEach(button => button.classList.remove('active'));
        activeButton.classList.add('active');
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
        if (filters.query) {
            filtered = filtered.filter(item => item.searchText.includes(filters.query));
            const intendedCategory = filters.category === 'all' ? searchCategoryIntents[filters.query] : null;
            if (intendedCategory) filtered = filtered.filter(item => item.category === intendedCategory);
        }

        filtered = sortItems(filtered);
        renderStatus(filtered.length);
        renderGrid(filtered);
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
        status.innerHTML = `
            <span><strong>${count}</strong> показани продукта</span>
            <span>от <strong>${items.length}</strong> общо</span>
            <span><strong>${DATA.sources.length}</strong> магазина</span>
            <small>Обновено на ${escapeHtml(generated)}. Показваме само продукти, при които етикетът позволява честно сравнение.</small>
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

        return `
            <article class="supplement-card">
                <a class="supplement-card-link" href="${escapeAttr(item.url)}" target="_blank" rel="noopener">
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
            </article>
        `;
    }

    function renderProteinWarning(item) {
        if (item.category !== 'protein' || item.confidence !== 'low') return '';
        return '<div class="supplement-warning">Не успяхме автоматично да прочетем ясни грамове белтъчини от етикета. Сметката е ориентир.</div>';
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
            <a class="supplements-best-card" href="${escapeAttr(item.url)}" target="_blank" rel="noopener">
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
        filters = { category: 'all', store: 'all', confidence: 'all', sort: 'unit', query: '', page: 1 };
        const search = document.getElementById('supplements-search');
        if (search) search.value = '';
        document.querySelectorAll('[data-category]').forEach(btn => btn.classList.toggle('active', btn.dataset.category === 'all'));
        document.querySelectorAll('[data-store]').forEach(btn => btn.classList.toggle('active', btn.dataset.store === 'all'));
        document.querySelectorAll('[data-confidence]').forEach(btn => btn.classList.toggle('active', btn.dataset.confidence === 'all'));
        document.querySelectorAll('[data-sort]').forEach(btn => btn.classList.toggle('active', btn.dataset.sort === 'unit'));
        applyFilters();
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
