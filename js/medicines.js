(function () {
    'use strict';

    const DATA = window.MEDICINES_DATA || (typeof MEDICINES_DATA !== 'undefined' ? MEDICINES_DATA : null);
    const PAGE_SIZE = 12;

    let items = [];
    let filters = {
        query: '',
        prescription: 'all',
        sort: 'best',
        page: 1
    };

    document.addEventListener('DOMContentLoaded', initMedicines);

    function initMedicines() {
        if (!DATA || !Array.isArray(DATA.medicines)) {
            renderError('Няма заредени данни за лекарства.');
            return;
        }

        items = DATA.medicines.map(normalizeItem);
        bindControls();
        renderSummary();
        applyFilters();
    }

    function normalizeItem(item) {
        const unitPrice = item.tablets ? item.price_bgn / item.tablets : item.price_bgn;
        const equivalenceKey = [
            item.active_substance,
            item.strength,
            item.form
        ].filter(Boolean).join('|').toLowerCase();

        return {
            ...item,
            unitPrice,
            equivalenceKey,
            searchText: [
                item.name,
                item.brand,
                item.active_substance,
                item.active_substance_bg,
                item.atc,
                item.strength,
                item.form,
                item.form_bg,
                item.package,
                item.pharmacy
            ].filter(Boolean).join(' ').toLowerCase()
        };
    }

    function bindControls() {
        const search = document.getElementById('medicines-search');
        if (search) {
            search.addEventListener('input', () => {
                filters.query = normalizeSearch(search.value);
                filters.page = 1;
                applyFilters();
            });
        }

        document.querySelectorAll('[data-medicine-prescription]').forEach(button => {
            button.addEventListener('click', () => {
                setActive(button, '[data-medicine-prescription]');
                filters.prescription = button.dataset.medicinePrescription;
                filters.page = 1;
                applyFilters();
            });
        });

        document.querySelectorAll('[data-medicine-sort]').forEach(button => {
            button.addEventListener('click', () => {
                setActive(button, '[data-medicine-sort]');
                filters.sort = button.dataset.medicineSort;
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

        if (filters.prescription === 'otc') {
            filtered = filtered.filter(item => !item.prescription);
        }
        if (filters.prescription === 'rx') {
            filtered = filtered.filter(item => item.prescription);
        }
        if (filters.query) {
            filtered = filtered.filter(item => item.searchText.includes(filters.query));
        }

        const groups = sortGroups(groupComparable(filtered));
        renderStatus(filtered.length, groups.length);
        renderGroups(groups);
    }

    function groupComparable(list) {
        const grouped = list.reduce((acc, item) => {
            if (!acc[item.equivalenceKey]) {
                acc[item.equivalenceKey] = {
                    key: item.equivalenceKey,
                    active: item.active_substance_bg || item.active_substance,
                    atc: item.atc,
                    strength: item.strength,
                    form: item.form_bg || item.form,
                    prescription: item.prescription,
                    rows: []
                };
            }
            acc[item.equivalenceKey].rows.push(item);
            return acc;
        }, {});

        return Object.values(grouped).map(group => {
            const rows = group.rows.sort((a, b) => a.unitPrice - b.unitPrice || a.price_bgn - b.price_bgn);
            const prices = rows.map(row => row.price_bgn);
            return {
                ...group,
                rows,
                best: rows[0],
                min: Math.min(...prices),
                max: Math.max(...prices),
                pharmacyCount: new Set(rows.map(row => row.pharmacy)).size
            };
        });
    }

    function sortGroups(groups) {
        return [...groups].sort((a, b) => {
            if (filters.sort === 'name') return a.active.localeCompare(b.active, 'bg') || a.strength.localeCompare(b.strength, 'bg');
            if (filters.sort === 'pharmacy') return b.pharmacyCount - a.pharmacyCount || a.best.unitPrice - b.best.unitPrice;
            return a.best.unitPrice - b.best.unitPrice || a.active.localeCompare(b.active, 'bg');
        });
    }

    function renderSummary() {
        const summary = document.getElementById('medicines-summary');
        if (!summary) return;

        const substances = new Set(items.map(item => item.active_substance)).size;
        const pharmacies = new Set(items.map(item => item.pharmacy)).size;
        const rx = items.filter(item => item.prescription).length;

        summary.innerHTML = `
            <div class="supplements-summary-item">
                <strong>${items.length}</strong>
                <span>demo записи</span>
            </div>
            <div class="supplements-summary-item">
                <strong>${substances}</strong>
                <span>активни вещества</span>
            </div>
            <div class="supplements-summary-item">
                <strong>${pharmacies}</strong>
                <span>аптеки</span>
            </div>
            <div class="supplements-summary-item">
                <strong>${rx}</strong>
                <span>с рецепта</span>
            </div>
        `;
    }

    function renderStatus(productCount, groupCount) {
        const status = document.getElementById('medicines-status');
        if (!status) return;
        const generated = DATA.generated_at ? new Date(DATA.generated_at).toLocaleString('bg-BG') : 'неизвестно';
        const demo = DATA.mode === 'demo' ? ' Demo данни за UX прототип, не актуални аптечни цени.' : '';

        status.innerHTML = `
            <span><strong>${groupCount}</strong> сравними групи</span>
            <span><strong>${productCount}</strong> продукта</span>
            <span><strong>${DATA.sources.length}</strong> източника</span>
            <small>Обновено на ${escapeHtml(generated)}.${escapeHtml(demo)}</small>
        `;
    }

    function renderGroups(groups) {
        const grid = document.getElementById('medicines-grid');
        const pagination = document.getElementById('medicines-pagination');
        if (!grid) return;

        if (!groups.length) {
            grid.innerHTML = `
                <div class="offers-empty">
                    <p>Няма резултати с тези филтри.</p>
                    <button class="filter-btn" type="button" data-reset-medicines>Покажи всичко отначало</button>
                </div>
            `;
            const reset = grid.querySelector('[data-reset-medicines]');
            if (reset) reset.addEventListener('click', resetFilters);
            if (pagination) pagination.innerHTML = '';
            return;
        }

        const totalPages = Math.max(1, Math.ceil(groups.length / PAGE_SIZE));
        filters.page = Math.min(filters.page, totalPages);
        const start = (filters.page - 1) * PAGE_SIZE;
        const visible = groups.slice(start, start + PAGE_SIZE);

        grid.innerHTML = visible.map(renderGroup).join('');
        renderPagination(groups.length, totalPages);
    }

    function renderGroup(group) {
        const spread = group.max > group.min ? `${formatMoney(group.min)} - ${formatMoney(group.max)}` : formatMoney(group.min);
        return `
            <article class="medicine-card">
                <div class="medicine-card-head">
                    <div>
                        <span class="medicine-kicker">${escapeHtml(group.atc || 'ATC')}</span>
                        <h3>${escapeHtml(group.active)}</h3>
                        <p>${escapeHtml(group.strength)} · ${escapeHtml(group.form)} · ${group.prescription ? 'с рецепта' : 'без рецепта'}</p>
                    </div>
                    <div class="medicine-best-price">
                        <strong>${formatMoney(group.best.unitPrice)}</strong>
                        <span>за единица</span>
                    </div>
                </div>
                <div class="medicine-comparison-strip">
                    <span>Най-ниска: <strong>${formatMoney(group.best.price_bgn)}</strong></span>
                    <span>Диапазон: <strong>${escapeHtml(spread)}</strong></span>
                    <span>Аптеки: <strong>${group.pharmacyCount}</strong></span>
                </div>
                <div class="medicine-offers">
                    ${group.rows.map(renderOfferRow).join('')}
                </div>
                <div class="medicine-note">Сравнявай само същото активно вещество, сила и форма. Помощните вещества, освобождаването и личният контекст могат да имат значение.</div>
            </article>
        `;
    }

    function renderOfferRow(item, index) {
        const href = item.url && item.url !== '#' ? item.url : '';
        const linkAttrs = href ? `href="${escapeAttr(href)}" target="_blank" rel="noopener"` : 'href="#" aria-disabled="true"';
        return `
            <a class="medicine-offer-row ${index === 0 ? 'best' : ''}" ${linkAttrs}>
                <span>
                    <strong>${escapeHtml(item.name)}</strong>
                    <small>${escapeHtml(item.pharmacy)} · ${escapeHtml(item.package || '')}</small>
                </span>
                <span>
                    <strong>${formatMoney(item.price_bgn)}</strong>
                    <small>${formatMoney(item.unitPrice)} / единица</small>
                </span>
            </a>
        `;
    }

    function renderPagination(total, totalPages) {
        const pagination = document.getElementById('medicines-pagination');
        if (!pagination) return;
        if (totalPages <= 1) {
            pagination.innerHTML = '';
            return;
        }

        pagination.innerHTML = `
            <div class="pagination-summary">Страница ${filters.page} от ${totalPages} · ${total} групи</div>
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
                document.getElementById('medicines-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        });
    }

    function resetFilters() {
        filters = { query: '', prescription: 'all', sort: 'best', page: 1 };
        const search = document.getElementById('medicines-search');
        if (search) search.value = '';
        document.querySelectorAll('[data-medicine-prescription]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.medicinePrescription === 'all');
        });
        document.querySelectorAll('[data-medicine-sort]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.medicineSort === 'best');
        });
        applyFilters();
    }

    function renderError(message) {
        const status = document.getElementById('medicines-status');
        if (status) status.innerHTML = `<span>${escapeHtml(message)}</span>`;
    }

    function normalizeSearch(value) {
        return String(value || '').trim().toLowerCase();
    }

    function formatMoney(value) {
        return `${Number(value).toFixed(2)} лв`;
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
