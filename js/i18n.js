/* ========================================
   NutriLife — i18n core
   Shared keys: nav, title, offer, visits
   Page-specific keys are in js/i18n.<page>.js
   ======================================== */

(function () {
    'use strict';

    const translations = {
        bg: {
            'nav.excuses': 'Оправдания',
            'nav.check': 'Check',
            'nav.move': 'Движение',
            'nav.eat': 'Хранене',
            'nav.start': 'Старт',
            'nav.supplements': 'Добавки',
            'nav.mental': 'Психично',
            'nav.smart_food': 'Smart Food',
            'title.index': 'NutriLife — Все още имаш контрол',
            'title.move': 'NutriLife — Движи се',
            'title.eat': 'NutriLife — Яж правилно',
            'title.start': 'NutriLife — Започни сега',
            'title.supplements': 'NutriLife — Добавки',
            'title.mental': 'NutriLife — Психично здраве',
            'title.smart-food': 'Smart Food — Храни се добре. Пазарувай умно.',
            'title.health-check': 'NutriLife — Health Check',
            'offer.ingredients': 'Съставки',
            'offer.ing.harmful': 'вредни',
            'offer.ing.questionable': 'спорни',
            'offer.ing.clean': 'Без открити добавки',
            'visits.label': 'посещения',
            'visits.prefix': ''
        },
        en: {}
    };

    /* ── Core functions ─────────────────────────────────────────────────── */

    function getLang() {
        return 'bg';
    }

    function setLang(lang) {
        document.documentElement.lang = 'bg';
        applyTranslations('bg');
    }

    function t(key) {
        const dict = translations.bg;
        if (dict[key] !== undefined) return dict[key];
        return key;
    }

    function extend(obj) {
        Object.assign(translations.bg, obj);
    }

    function applyTranslations(lang) {
        const dict = translations.bg;

        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.dataset.i18n;
            if (dict[key] !== undefined) el.textContent = dict[key];
        });

        document.querySelectorAll('[data-i18n-html]').forEach(el => {
            const key = el.dataset.i18nHtml;
            if (dict[key] !== undefined) el.innerHTML = dict[key];
        });

        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.dataset.i18nPlaceholder;
            if (dict[key] !== undefined) el.placeholder = dict[key];
        });

        const slug = (window.location.pathname.split('/').pop() || 'index.html')
            .replace('.html', '') || 'index';
        const titleKey = 'title.' + slug;
        if (dict[titleKey]) document.title = dict[titleKey];
    }

    /* ── Auto-init ──────────────────────────────────────────────────────── */
    document.addEventListener('DOMContentLoaded', () => {
        document.documentElement.lang = 'bg';
        applyTranslations('bg');
    });

    /* ── Public API ─────────────────────────────────────────────────────── */
    window.I18N = { getLang, setLang, t, extend, applyTranslations };

})();
