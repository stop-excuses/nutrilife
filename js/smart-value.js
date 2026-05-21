(function () {
    'use strict';

    const DATA = window.SUPPLEMENTS_DATA || (typeof SUPPLEMENTS_DATA !== 'undefined' ? SUPPLEMENTS_DATA : null);
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

    document.addEventListener('DOMContentLoaded', initSmartValue);

    function initSmartValue() {
        if (!DATA || !Array.isArray(DATA.supplements)) return;
        const items = DATA.supplements
            .map(normalizeItem)
            .filter(item => item.unitValue && item.unitValue > 0 && item.availability_status !== 'out_of_stock');

        renderSummary(items);
        renderBest(items);
        renderSeoCategory(items);
        bindCategoryCards();
    }

    function normalizeItem(item) {
        const unitKey = Object.keys(item.price_per_active_unit || {})[0] || '';
        const unitValue = unitKey ? Number(item.price_per_active_unit[unitKey]) : null;
        return {
            ...item,
            unitKey,
            unitValue: Number.isFinite(unitValue) ? unitValue : null
        };
    }

    function renderSummary(items) {
        const summary = document.getElementById('smart-value-summary');
        if (!summary) return;
        const stores = new Set(items.map(item => item.store)).size;
        const categories = new Set(items.map(item => item.category)).size;
        const clicks = getOutboundClicks().length;

        summary.innerHTML = `
            <div class="supplements-summary-item">
                <strong>${items.length}</strong>
                <span>продукта</span>
            </div>
            <div class="supplements-summary-item">
                <strong>${categories}</strong>
                <span>категории</span>
            </div>
            <div class="supplements-summary-item">
                <strong>${stores}</strong>
                <span>магазина</span>
            </div>
            <div class="supplements-summary-item">
                <strong>${clicks}</strong>
                <span>локални клика</span>
            </div>
        `;
    }

    function renderBest(items) {
        const container = document.getElementById('smart-value-best');
        if (!container) return;
        const best = Object.values(items.reduce((acc, item) => {
            const current = acc[item.category];
            if (!current || score(item) < score(current)) acc[item.category] = item;
            return acc;
        }, {})).sort((a, b) => score(a) - score(b)).slice(0, 8);

        container.innerHTML = best.map(item => `
            <a class="smart-value-card" href="${escapeAttr(buildOutboundUrl(item.url, item))}" target="_blank" rel="noopener" data-affiliate-out data-product-id="${escapeAttr(item.id)}" data-store="${escapeAttr(item.store)}" data-category="${escapeAttr(item.category)}">
                <span>${escapeHtml(categoryLabels[item.category] || item.category)} · ${escapeHtml(item.store)}</span>
                <strong>${formatMoney(item.unitValue)}</strong>
                <small>${escapeHtml(formatUnitLabel(item))}</small>
                <em>${escapeHtml(item.name)}</em>
            </a>
        `).join('');

        container.querySelectorAll('[data-affiliate-out]').forEach(link => {
            link.addEventListener('click', () => trackOutboundClick(link));
        });
    }

    function renderSeoCategory(items) {
        const container = document.getElementById('seo-category-best');
        if (!container) return;
        const category = container.dataset.category || '';
        const filtered = items
            .filter(item => item.category === category)
            .sort((a, b) => score(a) - score(b))
            .slice(0, 12);

        if (!filtered.length) {
            container.innerHTML = '<div class="smart-value-empty">Няма достатъчно данни за тази категория.</div>';
            return;
        }

        container.innerHTML = filtered.map((item, index) => `
            <a class="smart-value-card seo-product-card" href="${escapeAttr(buildOutboundUrl(item.url, item))}" target="_blank" rel="noopener" data-affiliate-out data-product-id="${escapeAttr(item.id)}" data-store="${escapeAttr(item.store)}" data-category="${escapeAttr(item.category)}">
                <span>#${index + 1} · ${escapeHtml(item.store)}</span>
                <strong>${formatMoney(item.unitValue)}</strong>
                <small>${escapeHtml(formatUnitLabel(item))}</small>
                <em>${escapeHtml(item.name)}</em>
            </a>
        `).join('');

        container.querySelectorAll('[data-affiliate-out]').forEach(link => {
            link.addEventListener('click', () => trackOutboundClick(link));
        });
    }

    function bindCategoryCards() {
        document.querySelectorAll('[data-smart-category]').forEach(link => {
            link.addEventListener('click', () => {
                try {
                    sessionStorage.setItem('nutrilife-smart-category', link.dataset.smartCategory);
                } catch (error) {
                    // sessionStorage may be disabled.
                }
            });
        });
    }

    function score(item) {
        const confidencePenalty = { high: 1, medium: 1.08, low: 1.18 };
        return item.unitValue * (confidencePenalty[item.confidence] || 1.25);
    }

    function getOutboundClicks() {
        try {
            return JSON.parse(localStorage.getItem('nutrilife-affiliate-clicks') || '[]');
        } catch (error) {
            return [];
        }
    }

    function buildOutboundUrl(url, item) {
        if (!url || url === '#') return '#';
        try {
            const parsed = new URL(url, window.location.href);
            parsed.searchParams.set('utm_source', 'nutrilife');
            parsed.searchParams.set('utm_medium', 'smart_value');
            parsed.searchParams.set('utm_campaign', 'smart_value_hub');
            parsed.searchParams.set('utm_content', `${item.category}_${item.store}`.toLowerCase().replace(/[^a-z0-9_]+/g, '_'));
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
            const clicks = getOutboundClicks();
            clicks.unshift(click);
            localStorage.setItem('nutrilife-affiliate-clicks', JSON.stringify(clicks.slice(0, 100)));
        } catch (error) {
            // Best-effort local analytics.
        }
        if (typeof window.gtag === 'function') {
            window.gtag('event', 'affiliate_click', {
                product_id: click.productId,
                store: click.store,
                category: click.category
            });
        }
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
