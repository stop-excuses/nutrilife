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
            'tracker.date': 'Ден от дневника',
            'tracker.today': 'Днес',
            'tracker.export': 'Изтегли дневника',
            'tracker.import': 'Възстанови от файл',
            'tracker.backup_hint': 'Архивът съдържа само навиците. При възстановяване съвпадащите дни се обновяват. Пази файла на лично място.',
            'tracker.saved': 'Запазено на това устройство.',
            'tracker.temporary': 'Браузърът не позволява запазване. Данните са временни — изтегли дневника преди да затвориш страницата.',
            'tracker.exported': 'Архивът е готов за изтегляне.',
            'tracker.imported': 'Възстановени дни: {n}.',
            'tracker.invalid': 'Невалиден архив. Избери JSON дневник от NutriLife до 2 MB с реални дати до днес. Нищо не е променено.',
            'quiz.reset': 'Попълни отначало',
            'quiz.progress': 'Отговорени: {n} от {total}. Отговорите остават на това устройство.',
            'data.retry': 'Опитай отново',
            'catalog.error': 'Пълният каталог не се зареди. Показани са само наличните данни — резултатите може да са непълни.',
            'food.macros_estimate': 'Ориентировъчни стойности за 100 г от този тип храна. Не са проверен етикет на конкретния продукт; видът и приготвянето имат значение.',
            'health.enter': 'Въведи възраст, ръст и тегло, за да видиш своя ориентир.',
            'health.source': 'Източник за BMI и талия/ръст: NICE',
            'health.method': 'Това е ориентир за навици по условни точки, не валидиран медицински тест. Не изчислява вероятност от заболяване.',
            'data.error': 'Данните не се заредиха. Провери връзката и опитай отново.',
            'favorites.temporary': 'Списъкът е временен: браузърът не позволява запазване.',
            'nav.check': 'Проверка',
            'nav.move': 'Движение',
            'nav.eat': 'Хранене',
            'nav.start': 'Старт',
            'nav.supplements': 'Добавки',
            'nav.mental': 'Психично',
            'nav.smart_food': 'Умна храна',
            'nav.smart_supplements': 'Умни добавки',
            'title.index': 'NutriLife — Все още имаш контрол',
            'title.move': 'NutriLife — Движи се',
            'title.eat': 'NutriLife — Яж правилно',
            'title.start': 'NutriLife — Започни сега',
            'title.supplements': 'NutriLife — Добавки',
            'title.mental': 'NutriLife — Психично здраве',
            'title.smart-food': 'Умна храна — Храни се добре. Пазарувай разумно.',
            'title.health-check': 'NutriLife — Проверка',
            'title.privacy': 'Поверителност — NutriLife',
            'offer.ingredients': 'Съставки',
            'offer.ing.harmful': 'вредни',
            'offer.ing.questionable': 'спорни',
            'offer.ing.clean': 'Без открити добавки',
            'pwa.install.title': 'Инсталирай NutriLife',
            'pwa.install.text': 'Сложи сайта като приложение на телефона.',
            'pwa.install.button': 'Инсталирай',
            'pwa.install.dismiss': 'По-късно',
            'pwa.install.ios': 'На iPhone: Share → Add to Home Screen.',
            'pwa.install.ok': 'ОК',
            'privacy.kicker': 'ПОВЕРИТЕЛНОСТ',
            'privacy.h1': 'Какво събираме и какво не събираме',
            'privacy.intro': 'NutriLife е статичен сайт. Не създаваме потребителски акаунти, не събираме медицински досиета и не продаваме лични данни.',
            'privacy.analytics.h2': 'Аналитика',
            'privacy.analytics.p': 'Използваме Google Analytics, за да разбираме кои страници се ползват, какви грешки има и кои функции си струва да подобряваме. Данните се гледат агрегирано, не като персонален профил на конкретен човек.',
            'privacy.local.h2': 'Локално съхранение',
            'privacy.local.p': 'Някои функции пазят информация в браузъра ти: тема, чекнати навици, пазарен списък или предпочитания. Това остава на твоето устройство и можеш да го изчистиш от настройките на браузъра.',
            'privacy.prices.h2': 'Цени и външни линкове',
            'privacy.prices.p': 'Цените, наличностите и продуктовите данни идват от публично достъпни страници на магазини и могат да се променят. Когато отвориш външен магазин, важат неговите условия и политика за поверителност.',
            'privacy.contact.h2': 'Контакт',
            'privacy.contact.p': 'За въпрос, корекция или искане за премахване на информация: <a href="mailto:ivvmilev@gmail.com">ivvmilev@gmail.com</a>.',
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

        document.querySelectorAll('[data-i18n-alt]').forEach(el => {
            const key = el.dataset.i18nAlt;
            if (dict[key] !== undefined) el.alt = dict[key];
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
