#!/usr/bin/env python3
"""Add data-i18n attributes to all HTML pages."""

import os

BASE = os.path.dirname(os.path.abspath(__file__))

NAV_REPLACEMENTS = [
    ('<span class="dot-label">Оправдания</span>', '<span class="dot-label" data-i18n="nav.excuses">Оправдания</span>'),
    ('<span class="dot-label">Движение</span>',   '<span class="dot-label" data-i18n="nav.move">Движение</span>'),
    ('<span class="dot-label">Хранене</span>',    '<span class="dot-label" data-i18n="nav.eat">Хранене</span>'),
    ('<span class="dot-label">Цени</span>',        '<span class="dot-label" data-i18n="nav.prices">Цени</span>'),
    ('<span class="dot-label">Старт</span>',       '<span class="dot-label" data-i18n="nav.start">Старт</span>'),
    ('<span class="dot-label">Добавки</span>',     '<span class="dot-label" data-i18n="nav.supplements">Добавки</span>'),
    ('<span class="dot-label">Психично</span>',    '<span class="dot-label" data-i18n="nav.mental">Психично</span>'),
]

def patch(content, pairs):
    for old, new in pairs:
        content = content.replace(old, new)
    return content

def add_script(content):
    if 'i18n.js' in content:
        return content
    content = content.replace(
        '<link rel="stylesheet" href="css/style.css">',
        '<link rel="stylesheet" href="css/style.css">\n    <script src="js/i18n.js"></script>'
    )
    content = content.replace(
        '<link rel="stylesheet" href="css/style.css?v=3">',
        '<link rel="stylesheet" href="css/style.css?v=3">\n    <script src="js/i18n.js"></script>'
    )
    return content

def load(name):
    with open(os.path.join(BASE, name), encoding='utf-8') as f:
        return f.read()

def save(name, content):
    with open(os.path.join(BASE, name), 'w', encoding='utf-8') as f:
        f.write(content)
    print(f'  {name} saved')

# ── move.html ──────────────────────────────────────────────────────────────
c = load('move.html')
c = add_script(c)
c = patch(c, NAV_REPLACEMENTS)
c = patch(c, [
    ('<h1>Тялото е направено<br>да се <em class="green">движи</em>.</h1>',
     '<h1 data-i18n-html="m.hero.h1">Тялото е направено<br>да се <em class="green">движи</em>.</h1>'),
    ('<p>Не ти трябва фитнес. Не ти трябва инструктор. Трябват ти 21 минути на ден.</p>',
     '<p data-i18n="m.hero.p">Не ти трябва фитнес. Не ти трябва инструктор. Трябват ти 21 минути на ден.</p>'),
    ('<div class="stat-label">на седмица = −33% риск от ранна смърт = само 21 мин/ден</div>',
     '<div class="stat-label" data-i18n="m.hero.stat">на седмица = −33% риск от ранна смърт = само 21 мин/ден</div>'),
    ('<h2>Не е само за тялото</h2>',
     '<h2 data-i18n="m.s2.h2">Не е само за тялото</h2>'),
    ('<p class="section-subtitle">6 системи, които движението лекува</p>',
     '<p class="section-subtitle" data-i18n="m.s2.sub">6 системи, които движението лекува</p>'),
    ('<h3>🧠 Мозък и памет</h3>', '<h3 data-i18n="m.acc1.h3">🧠 Мозък и памет</h3>'),
    ('<h3>😊 Настроение и депресия</h3>', '<h3 data-i18n="m.acc2.h3">😊 Настроение и депресия</h3>'),
    ('<h3>😴 Сън</h3>', '<h3 data-i18n="m.acc3.h3">😴 Сън</h3>'),
    ('<h3>⚡ Хормони и енергия</h3>', '<h3 data-i18n="m.acc4.h3">⚡ Хормони и енергия</h3>'),
    ('<h3>❤️ Сърце и кръвоносна система</h3>', '<h3 data-i18n="m.acc5.h3">❤️ Сърце и кръвоносна система</h3>'),
    ('<h3>🦴 Стави и кости</h3>', '<h3 data-i18n="m.acc6.h3">🦴 Стави и кости</h3>'),
    ('<h3>🏋️ Тежести (силова тренировка)</h3>', '<h3 data-i18n="m.acc7.h3">🏋️ Тежести (силова тренировка)</h3>'),
    ('<h3>🏃 Кардио (аеробно)</h3>', '<h3 data-i18n="m.acc8.h3">🏃 Кардио (аеробно)</h3>'),
    ('<h2>Тежести или HIIT?</h2>', '<h2 data-i18n="m.s3.h2">Тежести или HIIT?</h2>'),
    ('<h2>Тежести или кардио?</h2>', '<h2 data-i18n="m.s3.h2">Тежести или кардио?</h2>'),
    ('<h2>Как да тренираш без фитнес</h2>', '<h2 data-i18n="m.s4.h2">Как да тренираш без фитнес</h2>'),
    ('<h2>Крачки</h2>', '<h2 data-i18n="m.s5.h2">Крачки</h2>'),
    ('<p class="section-subtitle">Простото ходене е по-силно от повечето тренировки</p>',
     '<p class="section-subtitle" data-i18n="m.s5.sub">Простото ходене е по-силно от повечето тренировки</p>'),
    ('<h2>Мускулите не са само за вид</h2>', '<h2 data-i18n="m.s6.h2">Мускулите не са само за вид</h2>'),
    ('<p class="section-subtitle">Защо силата е основа на дълго здраве</p>',
     '<p class="section-subtitle" data-i18n="m.s6.sub">Защо силата е основа на дълго здраве</p>'),
])
save('move.html', c)

# ── eat.html ───────────────────────────────────────────────────────────────
c = load('eat.html')
c = add_script(c)
c = patch(c, NAV_REPLACEMENTS)
c = patch(c, [
    ('<h1>Храненето<br>не е <em class="red">диета</em>.</h1>',
     '<h1 data-i18n-html="e.hero.h1">Храненето<br>не е <em class="red">диета</em>.</h1>'),
    ('<p>Не гладувай. Не брой калории. Яж правилните неща — тялото знае останалото.</p>',
     '<p data-i18n="e.hero.p">Не гладувай. Не брой калории. Яж правилните неща — тялото знае останалото.</p>'),
    ('<div class="stat-label">Протеин</div>', '<div class="stat-label" data-i18n="e.hero.c1">Протеин</div>'),
    ('<div class="stat-label">Реална храна</div>', '<div class="stat-label" data-i18n="e.hero.c2">Реална храна</div>'),
    ('<div class="stat-label">Без глад</div>', '<div class="stat-label" data-i18n="e.hero.c3">Без глад</div>'),
    ('<h2>4-те принципа</h2>', '<h2 data-i18n="e.s2.h2">4-те принципа</h2>'),
    ('<p class="section-subtitle">Всичко, което трябва да знаеш</p>',
     '<p class="section-subtitle" data-i18n="e.s2.sub">Всичко, което трябва да знаеш</p>'),
    ('<h3>🥩 Протеин: 1.6–2г на кг телесно тегло</h3>',
     '<h3 data-i18n="e.acc1.h3">🥩 Протеин: 1.6–2г на кг телесно тегло</h3>'),
    ('<h2>Топ 15 здравословни храни</h2>', '<h2 data-i18n="e.s3.h2">Топ 15 здравословни храни</h2>'),
    ('<p class="section-subtitle">Евтини, достъпни и доказани</p>',
     '<p class="section-subtitle" data-i18n="e.s3.sub">Евтини, достъпни и доказани</p>'),
    ('<h2>Протеинов калкулатор</h2>', '<h2 data-i18n="e.s4.h2">Протеинов калкулатор</h2>'),
    ('<p class="section-subtitle">Колко протеин ти трябва всеки ден</p>',
     '<p class="section-subtitle" data-i18n="e.s4.sub">Колко протеин ти трябва всеки ден</p>'),
    ('<h2>Примерен ден</h2>', '<h2 data-i18n="e.s5.h2">Примерен ден</h2>'),
    ('<p class="section-subtitle">132г протеин за ~6.80лв</p>',
     '<p class="section-subtitle" data-i18n="e.s5.sub">132г протеин за ~6.80лв</p>'),
    ('<span class="meal-label">Закуска</span>', '<span class="meal-label" data-i18n="e.meal1.label">Закуска</span>'),
    ('<span class="meal-label">Обяд</span>', '<span class="meal-label" data-i18n="e.meal2.label">Обяд</span>'),
    ('<span class="meal-label">Вечеря</span>', '<span class="meal-label" data-i18n="e.meal3.label">Вечеря</span>'),
])
save('eat.html', c)

# ── cheap.html ─────────────────────────────────────────────────────────────
c = load('cheap.html')
c = add_script(c)
c = patch(c, NAV_REPLACEMENTS)
c = patch(c, [
    ('<h1>Здравословен ден<br>за <em class="green">7 лева</em>.</h1>',
     '<h1 data-i18n-html="c.hero.h1">Здравословен ден<br>за <em class="green">7 лева</em>.</h1>'),
    ('<p>\u201eНямам пари\u201c е най-голямото оправдание. Ето числата.</p>',
     '<p data-i18n="c.hero.p">\u201eНямам пари\u201c е най-голямото оправдание. Ето числата.</p>'),
    ('<p style="color:#b0afa6; margin-bottom:8px;">Спестяваш на месец:</p>',
     '<p style="color:#b0afa6; margin-bottom:8px;" data-i18n="c.savings.label">Спестяваш на месец:</p>'),
    ('<h2>Сравнение ден по ден</h2>', '<h2 data-i18n="c.s2.h2">Сравнение ден по ден</h2>'),
    ('<p class="section-subtitle">Същите хранения, различен избор</p>',
     '<p class="section-subtitle" data-i18n="c.s2.sub">Същите хранения, различен избор</p>'),
    ('<h3>☕ Закуска</h3>', '<h3 data-i18n="c.acc1.h3">☕ Закуска</h3>'),
    ('<h3>🍽️ Обяд</h3>', '<h3 data-i18n="c.acc2.h3">🍽️ Обяд</h3>'),
    ('<h3>🌙 Вечеря</h3>', '<h3 data-i18n="c.acc3.h3">🌙 Вечеря</h3>'),
    ('<h2>Промоции тази седмица</h2>', '<h2 data-i18n="c.s3.h2">Промоции тази седмица</h2>'),
    ('<p class="section-subtitle">Реални цени и промоции от български магазини</p>',
     '<p class="section-subtitle" data-i18n="c.s3.sub">Реални цени и промоции от български магазини</p>'),
    ('<h2>Къде е най-евтино в момента</h2>', '<h2 data-i18n="c.s4.h2">Къде е най-евтино в момента</h2>'),
    ('<p class="section-subtitle">Най-добрата текуща цена и как стои същият тип продукт в другите магазини</p>',
     '<p class="section-subtitle" data-i18n="c.s4.sub">Най-добрата текуща цена и как стои същият тип продукт в другите магазини</p>'),
    ('<h2>Купи на едро — спести повече</h2>', '<h2 data-i18n="c.bulk.h2">Купи на едро — спести повече</h2>'),
    ('<p class="section-subtitle">Продукти с дълъг срок на годност, които си струва да купиш в количество</p>',
     '<p class="section-subtitle" data-i18n="c.bulk.sub">Продукти с дълъг срок на годност, които си струва да купиш в количество</p>'),
    ('<h2>Най-много чист протеин за 1 евро</h2>', '<h2 data-i18n="c.protein.h2">Най-много чист протеин за 1 евро</h2>'),
    ('<h2>Препоръки за теб</h2>', '<h2 data-i18n="c.profile.h2">Препоръки за теб</h2>'),
    ('<p class="section-subtitle">Избери диетен профил и виж топ 5 продукта тази седмица</p>',
     '<p class="section-subtitle" data-i18n="c.profile.sub">Избери диетен профил и виж топ 5 продукта тази седмица</p>'),
    ('<h2>Седмична пазарна листа</h2>', '<h2 data-i18n="c.shop.h2">Седмична пазарна листа</h2>'),
    ('<p class="section-subtitle">7 продукта за цяла седмица</p>',
     '<p class="section-subtitle" data-i18n="c.shop.sub">7 продукта за цяла седмица</p>'),
    ('<div class="label">Типичен ден</div>', '<div class="label" data-i18n="c.comp.bad">Типичен ден</div>'),
    ('<div class="label">Здравословен ден</div>', '<div class="label" data-i18n="c.comp.good">Здравословен ден</div>'),
    ('<div class="label">Типично</div>', '<div class="label" data-i18n="c.comp.typical">Типично</div>'),
    ('<div class="label">Здравословно</div>', '<div class="label" data-i18n="c.comp.healthy">Здравословно</div>'),
    ('<button class="filter-btn active" data-type="all">Всички</button>',
     '<button class="filter-btn active" data-type="all" data-i18n="c.filter.all.type">Всички</button>'),
    ('<button class="filter-btn" data-type="high_protein">💪 Висок протеин</button>',
     '<button class="filter-btn" data-type="high_protein" data-i18n="c.filter.protein">💪 Висок протеин</button>'),
    ('<button class="filter-btn" data-type="bulk">📦 За едро</button>',
     '<button class="filter-btn" data-type="bulk" data-i18n="c.filter.bulk">📦 За едро</button>'),
    ('<button class="filter-btn active" data-category="all">Всички</button>',
     '<button class="filter-btn active" data-category="all" data-i18n="c.cat.all">Всички</button>'),
    ('<button class="filter-btn" data-category="protein">🥩 Месо/Риба</button>',
     '<button class="filter-btn" data-category="protein" data-i18n="c.cat.meat">🥩 Месо/Риба</button>'),
    ('<button class="filter-btn" data-category="dairy">🥛 Млечни</button>',
     '<button class="filter-btn" data-category="dairy" data-i18n="c.cat.dairy">🥛 Млечни</button>'),
    ('<button class="filter-btn" data-category="grain">🌾 Зърнени</button>',
     '<button class="filter-btn" data-category="grain" data-i18n="c.cat.grain">🌾 Зърнени</button>'),
    ('<button class="filter-btn" data-category="legume">🫘 Бобови</button>',
     '<button class="filter-btn" data-category="legume" data-i18n="c.cat.legume">🫘 Бобови</button>'),
    ('<button class="filter-btn" data-category="canned">🥫 Консерви</button>',
     '<button class="filter-btn" data-category="canned" data-i18n="c.cat.canned">🥫 Консерви</button>'),
    ('<button class="filter-btn" data-category="nuts">🥜 Ядки</button>',
     '<button class="filter-btn" data-category="nuts" data-i18n="c.cat.nuts">🥜 Ядки</button>'),
    ('<button class="filter-btn" data-category="fat">🫒 Мазнини</button>',
     '<button class="filter-btn" data-category="fat" data-i18n="c.cat.fat">🫒 Мазнини</button>'),
    ('<button class="filter-btn" data-category="bread">🍞 Хляб</button>',
     '<button class="filter-btn" data-category="bread" data-i18n="c.cat.bread">🍞 Хляб</button>'),
    ('<button class="filter-btn" data-category="vegetable">🥦 Плод/Зеленчук</button>',
     '<button class="filter-btn" data-category="vegetable" data-i18n="c.cat.vegetable">🥦 Плод/Зеленчук</button>'),
    ('<button class="filter-btn" data-category="drinks">🍺 Напитки</button>',
     '<button class="filter-btn" data-category="drinks" data-i18n="c.cat.drinks">🍺 Напитки</button>'),
    ('<button class="filter-btn" data-category="pet">🐾 Домашни любимци</button>',
     '<button class="filter-btn" data-category="pet" data-i18n="c.cat.pet">🐾 Домашни любимци</button>'),
    ('<button class="filter-btn" data-category="hygiene">🧴 Хигиена</button>',
     '<button class="filter-btn" data-category="hygiene" data-i18n="c.cat.hygiene">🧴 Хигиена</button>'),
    ('<button class="filter-btn" data-category="household">🧹 Домакинство</button>',
     '<button class="filter-btn" data-category="household" data-i18n="c.cat.household">🧹 Домакинство</button>'),
    ('<button class="sort-btn active" data-sort="recommended">⭐ Препоръчани</button>',
     '<button class="sort-btn active" data-sort="recommended" data-i18n="c.sort.recommended">⭐ Препоръчани</button>'),
    ('<button class="sort-btn" data-sort="protein_value">💪 Чист протеин/€</button>',
     '<button class="sort-btn" data-sort="protein_value" data-i18n="c.sort.protein_value">💪 Чист протеин/€</button>'),
    ('<button class="sort-btn" data-sort="protein">🥩 Най-много протеин</button>',
     '<button class="sort-btn" data-sort="protein" data-i18n="c.sort.protein">🥩 Най-много протеин</button>'),
    ('<button class="sort-btn" data-sort="price_asc">💰 Най-евтини</button>',
     '<button class="sort-btn" data-sort="price_asc" data-i18n="c.sort.price">💰 Най-евтини</button>'),
    ('<button class="sort-btn" data-sort="health">❤️ Най-здравословни</button>',
     '<button class="sort-btn" data-sort="health" data-i18n="c.sort.health">❤️ Най-здравословни</button>'),
    ('<button class="filter-btn active" data-profile="all">Всички</button>',
     '<button class="filter-btn active" data-profile="all" data-i18n="c.prof.all">Всички</button>'),
])
save('cheap.html', c)

# ── start.html ─────────────────────────────────────────────────────────────
c = load('start.html')
c = add_script(c)
c = patch(c, NAV_REPLACEMENTS)
c = patch(c, [
    ('<h1>7 дни.<br><em class="purple">Промени навика.</em></h1>',
     '<h1 data-i18n-html="s.hero.h1">7 дни.<br><em class="purple">Промени навика.</em></h1>'),
    ('<p>Не ти трябва месечен абонамент. Не ти трябва фитнес. Трябват ти 7 дни дисциплина.</p>',
     '<p data-i18n="s.hero.p">Не ти трябва месечен абонамент. Не ти трябва фитнес. Трябват ти 7 дни дисциплина.</p>'),
    ('<div class="stat-label">движение/ден</div>', '<div class="stat-label" data-i18n="s.hero.c1">движение/ден</div>'),
    ('<div class="stat-label">хранене/ден</div>', '<div class="stat-label" data-i18n="s.hero.c2">хранене/ден</div>'),
    ('<div class="stat-label">фитнес</div>', '<div class="stat-label" data-i18n="s.hero.c3">фитнес</div>'),
    ('<p class="note mt-24">21 дни за нов навик — ти правиш само първите 7.</p>',
     '<p class="note mt-24" data-i18n="s.hero.note">21 дни за нов навик — ти правиш само първите 7.</p>'),
    ('<h2>7-дневен план</h2>', '<h2 data-i18n="s.plan.h2">7-дневен план</h2>'),
    ('<p class="section-subtitle">Всичко е решено. Просто следвай.</p>',
     '<p class="section-subtitle" data-i18n="s.plan.sub">Всичко е решено. Просто следвай.</p>'),
    ('<h3>Ден 1 — Първата стъпка</h3>', '<h3 data-i18n="s.day1.h3">Ден 1 — Първата стъпка</h3>'),
    ('<h3>Ден 2 — Протеинът</h3>', '<h3 data-i18n="s.day2.h3">Ден 2 — Протеинът</h3>'),
    ('<h3>Ден 3 — Движение</h3>', '<h3 data-i18n="s.day3.h3">Ден 3 — Движение</h3>'),
    ('<h3>Ден 4 — Навикът</h3>', '<h3 data-i18n="s.day4.h3">Ден 4 — Навикът</h3>'),
    ('<h3>Ден 5 — Водата</h3>', '<h3 data-i18n="s.day5.h3">Ден 5 — Водата</h3>'),
    ('<h3>Ден 6 — Без захар</h3>', '<h3 data-i18n="s.day6.h3">Ден 6 — Без захар</h3>'),
    ('<h3>Ден 7 — Прегледай</h3>', '<h3 data-i18n="s.day7.h3">Ден 7 — Прегледай</h3>'),
    ('<h2>Днешен прогрес</h2>', '<h2 data-i18n="s.tracker.h2">Днешен прогрес</h2>'),
    ('<p class="section-subtitle">Отбележи какво направи днес</p>',
     '<p class="section-subtitle" data-i18n="s.tracker.sub">Отбележи какво направи днес</p>'),
    ('<span class="tracker-label">🥩 130г+ протеин</span>',
     '<span class="tracker-label" data-i18n="s.habit.protein">🥩 130г+ протеин</span>'),
    ('<span class="tracker-label">💧 2л+ вода</span>',
     '<span class="tracker-label" data-i18n="s.habit.water">💧 2л+ вода</span>'),
    ('<span class="tracker-label">🏃 30 мин движение</span>',
     '<span class="tracker-label" data-i18n="s.habit.movement">🏃 30 мин движение</span>'),
    ('<span class="tracker-label">😴 7+ часа сън</span>',
     '<span class="tracker-label" data-i18n="s.habit.sleep">😴 7+ часа сън</span>'),
    ('<span class="tracker-label">🚫 Без добавена захар</span>',
     '<span class="tracker-label" data-i18n="s.habit.no_sugar">🚫 Без добавена захар</span>'),
    ('<span class="tracker-label">🚫 Без junk food</span>',
     '<span class="tracker-label" data-i18n="s.habit.no_junk">🚫 Без junk food</span>'),
    ('<h2>Седмичен прогрес</h2>', '<h2 data-i18n="s.week.h2">Седмичен прогрес</h2>'),
    ('<p class="section-subtitle">Твоята седмица — ден по ден</p>',
     '<p class="section-subtitle" data-i18n="s.week.sub">Твоята седмица — ден по ден</p>'),
    ('<div class="day-label">Пн</div>', '<div class="day-label" data-i18n="s.day.mon">Пн</div>'),
    ('<div class="day-label">Вт</div>', '<div class="day-label" data-i18n="s.day.tue">Вт</div>'),
    ('<div class="day-label">Ср</div>', '<div class="day-label" data-i18n="s.day.wed">Ср</div>'),
    ('<div class="day-label">Чт</div>', '<div class="day-label" data-i18n="s.day.thu">Чт</div>'),
    ('<div class="day-label">Пт</div>', '<div class="day-label" data-i18n="s.day.fri">Пт</div>'),
    ('<div class="day-label">Сб</div>', '<div class="day-label" data-i18n="s.day.sat">Сб</div>'),
    ('<div class="day-label">Нд</div>', '<div class="day-label" data-i18n="s.day.sun">Нд</div>'),
    ('<h2>След 7 дни</h2>', '<h2 data-i18n="s.after.h2">След 7 дни</h2>'),
    ('<p class="section-subtitle">Какво следва?</p>',
     '<p class="section-subtitle" data-i18n="s.after.sub">Какво следва?</p>'),
    ('<p style="margin-top:12px;"><strong>1. Повтори</strong> — направи същата седмица отново. Вече знаеш как.</p>',
     '<p style="margin-top:12px;" data-i18n-html="s.after.opt1"><strong>1. Повтори</strong> — направи същата седмица отново. Вече знаеш как.</p>'),
    ('<p><strong>2. Добави нещо</strong> — повече повторения, повече крачки, нов рецепт.</p>',
     '<p data-i18n-html="s.after.opt2"><strong>2. Добави нещо</strong> — повече повторения, повече крачки, нов рецепт.</p>'),
    ('<p><strong>3. Провери промоциите</strong> — <a href="cheap.html">виж какво е на намаление</a> и оптимизирай бюджета.</p>',
     '<p data-i18n-html="s.after.opt3"><strong>3. Провери промоциите</strong> — <a href="cheap.html">виж какво е на намаление</a> и оптимизирай бюджета.</p>'),
    ('<h2>Не от понеделник.<br><em class="purple">Днес.</em></h2>',
     '<h2 data-i18n-html="s.cta.h2">Не от понеделник.<br><em class="purple">Днес.</em></h2>'),
    ('Започни Ден 1 →', '<span data-i18n="s.cta.btn">Започни Ден 1 →</span>'),
])
save('start.html', c)

# ── supplements.html ───────────────────────────────────────────────────────
c = load('supplements.html')
c = add_script(c)
c = patch(c, NAV_REPLACEMENTS)
c = patch(c, [
    ('<h1>Добавки —<br>само ако <em class="green">основата е наред</em></h1>',
     '<h1 data-i18n-html="sup.hero.h1">Добавки —<br>само ако <em class="green">основата е наред</em></h1>'),
    ('<p>Добавките не заместват храненето и тренировките. Те усилват вече работещо.</p>',
     '<p data-i18n="sup.hero.p">Добавките не заместват храненето и тренировките. Те усилват вече работещо.</p>'),
    ('<h2>Добавките с доказана ефективност</h2>',
     '<h2 data-i18n="sup.s2.h2">Добавките с доказана ефективност</h2>'),
    ('<p class="section-subtitle">Само тези, които имат солидни научни доказателства</p>',
     '<p class="section-subtitle" data-i18n="sup.s2.sub">Само тези, които имат солидни научни доказателства</p>'),
    ('<h2>Кога да потърсиш специалист</h2>',
     '<h2 data-i18n="sup.s4.h2">Кога да потърсиш специалист</h2>'),
])
save('supplements.html', c)

# ── mental.html ────────────────────────────────────────────────────────────
c = load('mental.html')
c = add_script(c)
c = patch(c, NAV_REPLACEMENTS)
c = patch(c, [
    ('<h1>Умът<br>определя <em class="purple">всичко</em>.</h1>',
     '<h1 data-i18n-html="men.hero.h1">Умът<br>определя <em class="purple">всичко</em>.</h1>'),
    ('<p>Можеш да имаш перфектната диета и тренировки — и пак да се чувстваш зле. Психичното здраве не е бонус. То е основата.</p>',
     '<p data-i18n="men.hero.p">Можеш да имаш перфектната диета и тренировки — и пак да се чувстваш зле. Психичното здраве не е бонус. То е основата.</p>'),
    ('<h2>Тихите убийци на ума</h2>', '<h2 data-i18n="men.s2.h2">Тихите убийци на ума</h2>'),
    ('<h2>Природата лекува</h2>', '<h2 data-i18n="men.s3.h2">Природата лекува</h2>'),
    ('<h2>Добри практики</h2>', '<h2 data-i18n="men.s4.h2">Добри практики</h2>'),
    ('<h2>Спри да нормализираш</h2>', '<h2 data-i18n="men.s5.h2">Спри да нормализираш</h2>'),
    ('<h2>Без перфекционизъм</h2>', '<h2 data-i18n="men.s6.h2">Без перфекционизъм</h2>'),
    ('<h2>Кога да потърсиш помощ</h2>', '<h2 data-i18n="men.s7.h2">Кога да потърсиш помощ</h2>'),
    # Section nav buttons
    ('<a href="#silent-killers" class="filter-btn" style="text-decoration:none;">🧨 Тихите убийци</a>',
     '<a href="#silent-killers" class="filter-btn" style="text-decoration:none;" data-i18n="men.nav1">🧨 Тихите убийци</a>'),
    ('<a href="#nature" class="filter-btn" style="text-decoration:none;">🌿 Природата лекува</a>',
     '<a href="#nature" class="filter-btn" style="text-decoration:none;" data-i18n="men.nav2">🌿 Природата лекува</a>'),
    ('<a href="#practices" class="filter-btn" style="text-decoration:none;">✅ Добри практики</a>',
     '<a href="#practices" class="filter-btn" style="text-decoration:none;" data-i18n="men.nav3">✅ Добри практики</a>'),
    ('<a href="#normalize" class="filter-btn" style="text-decoration:none;">🚫 Спри да нормализираш</a>',
     '<a href="#normalize" class="filter-btn" style="text-decoration:none;" data-i18n="men.nav4">🚫 Спри да нормализираш</a>'),
    ('<a href="#balance" class="filter-btn" style="text-decoration:none;">⚖️ Без перфекционизъм</a>',
     '<a href="#balance" class="filter-btn" style="text-decoration:none;" data-i18n="men.nav5">⚖️ Без перфекционизъм</a>'),
    ('<a href="#help" class="filter-btn" style="text-decoration:none;">🆘 Кога да потърсиш помощ</a>',
     '<a href="#help" class="filter-btn" style="text-decoration:none;" data-i18n="men.nav6">🆘 Кога да потърсиш помощ</a>'),
])
save('mental.html', c)

print('\nAll pages updated!')
