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
        vitamin_b: 'B-комплекс',
        multivitamin: 'Мултивитамин',
        zinc: 'Цинк',
        protein: 'Протеин',
        fiber: 'Фибри'
    };
    const confidenceLabels = {
        high: 'висока',
        medium: 'средна',
        low: 'ниска'
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
            .filter(item => item.unitValue !== null && item.unitValue > 0);

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
                <span>сравними продукта</span>
            </div>
            <div class="supplements-summary-item">
                <strong>${stores}</strong>
                <span>магазина</span>
            </div>
            <div class="supplements-summary-item">
                <strong>${categories}</strong>
                <span>категории</span>
            </div>
            <div class="supplements-summary-item">
                <strong>${highConfidence}</strong>
                <span>с висока увереност</span>
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
            return a.unitValue - b.unitValue;
        });
    }

    function renderStatus(count) {
        const status = document.getElementById('supplements-status');
        if (!status) return;
        const generated = DATA.generated_at ? new Date(DATA.generated_at).toLocaleString('bg-BG') : 'неизвестно';
        status.innerHTML = `
            <span><strong>${count}</strong> продукта в текущия изглед</span>
            <span><strong>${items.length}</strong> общо</span>
            <span><strong>${DATA.sources.length}</strong> източника</span>
            <small>Последно генериране: ${escapeHtml(generated)}. Показват се само продукти, при които може да се сметне активна доза.</small>
        `;
    }

    function renderGrid(filtered) {
        const grid = document.getElementById('supplements-grid');
        const pagination = document.getElementById('supplements-pagination');
        if (!grid) return;

        if (!filtered.length) {
            grid.innerHTML = `
                <div class="offers-empty">
                    <p>Няма продукти за тези филтри.</p>
                    <button class="filter-btn" type="button" data-reset-supplements>Изчисти филтрите</button>
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
            .map(([key, value]) => `<span>${formatActiveKey(key)}: <strong>${escapeHtml(formatValue(value))}</strong></span>`)
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
                            <span>${escapeHtml(item.unit_label || '')}</span>
                        </div>
                        <div class="supplement-facts">
                            <span>Цена: <strong>${formatMoney(item.price_bgn)}</strong></span>
                            ${item.brand ? `<span>Марка: <strong>${escapeHtml(item.brand)}</strong></span>` : ''}
                            ${item.servings ? `<span>Дози: <strong>${item.servings}</strong></span>` : ''}
                            ${item.count ? `<span>Брой: <strong>${item.count}</strong></span>` : ''}
                        </div>
                        <div class="supplement-active">${activeRows}</div>
                        <div class="supplement-confidence ${escapeAttr(item.confidence)}">Увереност: ${escapeHtml(confidenceLabels[item.confidence] || item.confidence)}</div>
                    </div>
                </a>
            </article>
        `;
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
            if (!current || item.unitValue < current.unitValue) acc[item.category] = item;
            return acc;
        }, {})).sort((a, b) => a.category.localeCompare(b.category, 'bg'));

        container.innerHTML = best.map(item => `
            <a class="supplements-best-card" href="${escapeAttr(item.url)}" target="_blank" rel="noopener">
                <span>${escapeHtml(categoryLabels[item.category] || item.category)}</span>
                <strong>${formatMoney(item.unitValue)}</strong>
                <small>${escapeHtml(item.unit_label || '')}</small>
                <em>${escapeHtml(item.name)}</em>
            </a>
        `).join('');
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

    function formatValue(value) {
        return typeof value === 'number' ? String(value) : value;
    }

    function formatActiveKey(key) {
        return key
            .replaceAll('_mg_per_serving', ' mg/доза')
            .replaceAll('_total_mg', ' общо mg')
            .replaceAll('_mg', ' mg')
            .replaceAll('_iu', ' IU')
            .replaceAll('_g', ' g')
            .replaceAll('_', ' ')
            .toUpperCase();
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
