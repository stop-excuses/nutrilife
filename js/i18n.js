/* ========================================
   NutriLife — Internationalization (i18n)
   BG (default) + EN support
   ======================================== */

(function () {
    'use strict';

    const translations = {
        bg: {
            // ── Navigation ──────────────────────────────────────────────
            'nav.excuses': 'Оправдания',
            'nav.move': 'Движение',
            'nav.eat': 'Хранене',
            'nav.prices': 'Цени',
            'nav.start': 'Старт',
            'nav.supplements': 'Добавки',
            'nav.mental': 'Психично',

            // ── Page titles ─────────────────────────────────────────────
            'title.index': 'NutriLife — Спри да се оправдаваш',
            'title.move': 'NutriLife — Движи се',
            'title.eat': 'NutriLife — Яж правилно',
            'title.cheap': 'NutriLife — Не е скъпо',
            'title.start': 'NutriLife — Започни сега',
            'title.supplements': 'NutriLife — Добавки',
            'title.mental': 'NutriLife — Психично здраве',

            // ── INDEX ────────────────────────────────────────────────────
            'i.hero.h1': 'Спри да се <em class="red">оправдаваш</em>',
            'i.hero.p': 'Здравето не чака. Всеки ден, в който не правиш нищо, тялото ти плаща сметката.',
            'i.hero.stat': 'от българите над 40г имат поне един хроничен здравен проблем',

            'i.s2.h2': 'Огледалото',
            'i.s2.sub': 'Числата, които не искаш да видиш',
            'i.s2.c1': 'българи с наднормено тегло',
            'i.s2.c2': 'диабет от 1980г',
            'i.s2.c3': 'на ден сме в статично положение (седим, лежим, гледаме екран)',
            'i.s2.c4': 'сърдечни болести предотвратими',
            'i.s2.note': 'Бавно се е случило. Бавно се обръща.',

            'i.s3.h2': 'Колко те засяга?',
            'i.s3.sub': 'Избери възрастта си',

            'age.metabolic': 'Метаболитен синдром',
            'age.obesity': 'Затлъстяване',
            'age.anxiety': 'Тревожност и депресия',
            'age.testosterone': 'Нисък тестостерон',
            'age.overweight': 'Наднормено тегло',
            'age.bp': 'Високо кръвно налягане',
            'age.prediabetes': 'Преддиабет',
            'age.stress': 'Хроничен стрес',
            'age.cardio': 'Сърдечно-съдов риск',
            'age.diabetes2': 'Диабет тип 2',
            'age.muscle': 'Загуба на мускулна маса',
            'age.joints': 'Болки в гърба/ставите',
            'age.chronic': 'Хронично заболяване',
            'age.osteo': 'Остеопороза (жени)',
            'age.insulin': 'Инсулинова резистентност',
            'age.heartattack': 'Риск от инфаркт/инсулт',

            'i.s4.h2': 'Оправданията',
            'i.s4.sub': 'Всяко едно — мит',

            'i.e1.h3': '„Такъв съм си — не мога да се променя"',
            'i.e2.h3': '„Всичката храна е боклук, едно време не беше така"',
            'i.e3.h3': '„Скъпо е да се храниш здравословно"',
            'i.e4.h3': '„Нямам време"',
            'i.e5.h3': '„Ще започна от понеделник"',
            'i.e6.h3': '„Един бургер няма да ме убие — не ми вреди"',
            'i.e7.h3': '„Имам лоши гени — в семейството ни всички са пълни"',
            'i.e8.h3': '„Работя много, стресиран съм — заслужавам си"',
            'i.e9.h3': '„Опитвал съм — не работи за мен"',
            'i.e10.h3': '„Нямам условия — семейство, деца"',
            'i.e11.h3': '„Боли ме — имам контузия / лошо коляно / гръб"',
            'i.e12.h3': '„Като остарея ще се оправя"',
            'i.e13.h3': '„Вече е късно за мен — стар съм, свикнал съм"',
            'i.e14.h3': '„Още съм млад — мога да си го позволя"',
            'i.e15.h3': '„Здравословното не е вкусно"',
            'i.e16.h3': '„Здравословното се готви бавно — нямам време"',
            'i.e17.h3': '„Животът е кратък — да се наслаждавам"',

            'i.harmful.h2': 'Вредни навици',
            'i.harmful.sub': 'Две неща, за които не говорим достатъчно открито',
            'i.h1.h3': '🚬 Цигари — няма безопасна доза',
            'i.h2.h3': '🍺 Алкохол — редовното е различно от „за наздраве"',

            'i.s5.h2': 'Какво печелиш',
            'i.s5.sub': 'Реалните промени — не само на кантара',
            'i.gain.energy.h3': 'Енергия',
            'i.gain.energy.p': 'Буден до края на деня без кафе. Не се събуждаш уморен. +30% субективна енергия след 1 месец.',
            'i.gain.motivation.h3': 'Мотивация',
            'i.gain.motivation.p': 'Физическата активност повишава допамина. Поставяш цели и ги постигаш. Спираш да отлагаш.',
            'i.gain.focus.h3': 'Фокус',
            'i.gain.focus.p': 'Мозъкът спира да „замръзва" след обяд. Работиш остро до края на деня.',
            'i.gain.social.h3': 'Социалност',
            'i.gain.social.p': 'Излизаш повече. Играеш с децата без задъхване. Хората около теб питат какво правиш.',
            'i.gain.confidence.h3': 'Самочувствие',
            'i.gain.confidence.p': 'Огледалото е различно. Дрехите седят по-добре. Влизаш в стаята по-уверено.',
            'i.gain.sleep.h3': 'Сън',
            'i.gain.sleep.p': 'Будиш се преди будилника. По-дълбок REM. Заспиваш за минути, не за час.',
            'i.gain.mood.h3': 'Настроение',
            'i.gain.mood.p': 'Baseline-то е добро. Не зависиш от кафето за да функционираш. Тревожността пада.',
            'i.gain.health.h3': 'Здраве',
            'i.gain.health.p': 'Кръвната захар, холестеролът и налягането се нормализират. Лекарят те пита какво правиш.',
            'i.gain.money.h3': 'Пари',
            'i.gain.money.p': 'По-малко болнични. По-малко лекарства. По-малко загубени работни дни. Здравето е инвестиция.',

            'i.cta.h2': 'Утре сутринта.<br><em class="red">Или сега.</em>',
            'i.cta.p': 'Знаеш какво трябва да направиш. Единственото, което липсва — е решението.',
            'i.cta.btn': 'Движи се →',

            // ── MOVE ─────────────────────────────────────────────────────
            'm.hero.h1': 'Тялото е направено<br>да се <em class="green">движи</em>.',
            'm.hero.p': 'Не ти трябва фитнес. Не ти трябва инструктор. Трябват ти 21 минути на ден.',
            'm.hero.stat': 'на седмица = −33% риск от ранна смърт = само 21 мин/ден',

            'm.s2.h2': 'Не е само за тялото',
            'm.s2.sub': '6 системи, които движението лекува',
            'm.acc1.h3': '🧠 Мозък и памет',
            'm.acc2.h3': '😊 Настроение и депресия',
            'm.acc3.h3': '😴 Сън',
            'm.acc4.h3': '⚡ Хормони и енергия',
            'm.acc5.h3': '❤️ Сърце и кръвоносна система',
            'm.acc6.h3': '🦴 Стави и кости',

            'm.s3.h2': 'Тежести или кардио?',
            'm.s3.sub': 'Коя тренировка за кого',
            'm.acc7.h3': '🏋️ Тежести (силова тренировка)',
            'm.acc8.h3': '🏃 Кардио (аеробно)',

            'm.s4.h2': 'Как да тренираш без фитнес',
            'm.s4.sub': 'Минимален бюджет, максимален ефект',
            'm.acc9.h3': '🔑 Упражнения само с тегло на тялото',
            'm.acc10.h3': '🏠 Оборудване за вкъщи (препоръчително)',
            'm.s4.gear.h3': '💡 С тези 4 уреда покриваш:',

            'm.s5.h2': 'Крачки',
            'm.s5.sub': 'Простото ходене е по-силно от повечето тренировки',
            'm.steps.c1': 'Заседнал живот (ниска активност)',
            'm.steps.c2': 'Умерена активност — голяма разлика',
            'm.steps.c3': 'Оптимум — максимален здравен ефект',

            'm.s6.h2': 'Мускулите не са само за вид',
            'm.s6.sub': 'Защо силата е основа на дълго здраве',

            'm.cta.h2': '30 минути на ден.<br><em class="green">Поне.</em>',
            'm.cta.p': 'Не трябва да е идеално. Трябва да е редовно.',
            'm.cta.btn': 'Яж правилно →',

            // ── EAT ──────────────────────────────────────────────────────
            'e.hero.h1': 'Храненето<br>не е <em class="red">диета</em>.',
            'e.hero.p': 'Не гладувай. Не брой калории. Яж правилните неща — тялото знае останалото.',
            'e.hero.c1': 'Протеин',
            'e.hero.c2': 'Реална храна',
            'e.hero.c3': 'Без глад',

            'e.s2.h2': '4-те принципа',
            'e.s2.sub': 'Всичко, което трябва да знаеш',
            'e.acc1.h3': '🥩 Протеин: 1.6–2г на кг телесно тегло',
            'e.acc2.h3': '🥦 Реална храна: минимум преработена',
            'e.acc3.h3': '🚫 Захарта: невидимият враг',
            'e.acc4.h3': '💧 Хидратация: 2–3л вода на ден',

            'e.s3.h2': 'Топ 15 здравословни храни',
            'e.s3.sub': 'Евтини, достъпни и доказани',

            'e.s4.h2': 'Протеинов калкулатор',
            'e.s4.sub': 'Колко протеин ти трябва всеки ден',
            'e.calc.gender.m': '👨 Мъж',
            'e.calc.gender.f': '👩 Жена',
            'e.calc.act.yes': '🏋️ Тренирам',
            'e.calc.act.no': '🛋️ Не тренирам',
            'e.calc.weight.label': 'Тегло (кг):',
            'e.calc.th.weight': 'Тегло',
            'e.calc.th.min': 'Мин',
            'e.calc.th.max': 'Макс',

            'e.s5.h2': 'Примерен ден',
            'e.s5.sub': '132г протеин за ~6.80лв',
            'e.meal1.label': 'Закуска',
            'e.meal2.label': 'Обяд',
            'e.meal3.label': 'Вечеря',

            'e.cta.h2': 'Плати по-малко.<br><em class="green">Яж по-добре.</em>',
            'e.cta.p': 'Здравословното е по-евтино от боклука. Ще ти го докажем с цени.',
            'e.cta.btn': 'Виж промоциите →',

            // ── CHEAP ─────────────────────────────────────────────────────
            'c.hero.h1': 'Здравословен ден<br>за <em class="green">7 лева</em>.',
            'c.hero.p': '„Нямам пари" е най-голямото оправдание. Ето числата.',
            'c.comp.bad': 'Типичен ден',
            'c.comp.good': 'Здравословен ден',
            'c.savings.label': 'Спестяваш на месец:',

            'c.s2.h2': 'Сравнение ден по ден',
            'c.s2.sub': 'Същите хранения, различен избор',
            'c.acc1.h3': '☕ Закуска',
            'c.acc2.h3': '🍽️ Обяд',
            'c.acc3.h3': '🌙 Вечеря',
            'c.comp.typical': 'Типично',
            'c.comp.healthy': 'Здравословно',

            'c.s3.h2': 'Промоции тази седмица',
            'c.s3.sub': 'Реални цени и промоции от български магазини',
            'c.search.placeholder': '🔍 Търси продукт... (напр. пиле, ориз, сирене)',
            'c.filter.all.type': 'Всички',
            'c.filter.protein': '💪 Висок протеин',
            'c.filter.bulk': '📦 За едро',
            'c.sort.label': 'Подреди:',
            'c.sort.recommended': '⭐ Препоръчани',
            'c.sort.protein_value': '💪 Чист протеин/€',
            'c.sort.protein': '🥩 Най-много протеин',
            'c.sort.price': '💰 Най-евтини',
            'c.sort.health': '❤️ Най-здравословни',
            'c.cat.all': 'Всички',
            'c.cat.meat': '🥩 Месо/Риба',
            'c.cat.dairy': '🥛 Млечни',
            'c.cat.grain': '🌾 Зърнени',
            'c.cat.legume': '🫘 Бобови',
            'c.cat.canned': '🥫 Консерви',
            'c.cat.nuts': '🥜 Ядки',
            'c.cat.fat': '🫒 Мазнини',
            'c.cat.bread': '🍞 Хляб',
            'c.cat.vegetable': '🥦 Плод/Зеленчук',
            'c.cat.drinks': '🍺 Напитки',
            'c.cat.pet': '🐾 Домашни любимци',
            'c.cat.hygiene': '🧴 Хигиена',
            'c.cat.household': '🧹 Домакинство',
            'c.loading': 'Зареждане на промоции...',

            'c.s4.h2': 'Къде е най-евтино в момента',
            'c.s4.sub': 'Най-добрата текуща цена и как стои същият тип продукт в другите магазини',

            'c.bulk.h2': 'Купи на едро — спести повече',
            'c.bulk.sub': 'Продукти с дълъг срок на годност, които си струва да купиш в количество',

            'c.protein.h2': 'Най-много чист протеин за 1 евро',
            'c.protein.sub': 'Класация за здравословни източници: взима предвид протеин, наказва излишни мазнини и въглехидрати',

            'c.profile.h2': 'Препоръки за теб',
            'c.profile.sub': 'Избери диетен профил и виж топ 5 продукта тази седмица',
            'c.prof.all': 'Всички',

            'c.shop.h2': 'Седмична пазарна листа',
            'c.shop.sub': '7 продукта за цяла седмица',

            'c.cta.h2': 'Вземи плана.<br><em class="green">Не плащай повече.</em>',
            'c.cta.p': 'Имаш числата. Имаш плана. Единственото, което трябва да направиш — е да тръгнеш.',
            'c.cta.btn': 'Започни сега →',

            // ── START ─────────────────────────────────────────────────────
            's.hero.h1': '7 дни.<br><em class="purple">Промени навика.</em>',
            's.hero.p': 'Не ти трябва месечен абонамент. Не ти трябва фитнес. Трябват ти 7 дни дисциплина.',
            's.hero.c1': 'движение/ден',
            's.hero.c2': 'хранене/ден',
            's.hero.c3': 'фитнес',
            's.hero.note': '21 дни за нов навик — ти правиш само първите 7.',

            's.plan.h2': '7-дневен план',
            's.plan.sub': 'Всичко е решено. Просто следвай.',

            's.day1.h3': 'Ден 1 — Първата стъпка',
            's.day2.h3': 'Ден 2 — Протеинът',
            's.day3.h3': 'Ден 3 — Движение',
            's.day4.h3': 'Ден 4 — Навикът',
            's.day5.h3': 'Ден 5 — Водата',
            's.day6.h3': 'Ден 6 — Без захар',
            's.day7.h3': 'Ден 7 — Прегледай',

            's.tracker.h2': 'Днешен прогрес',
            's.tracker.sub': 'Отбележи какво направи днес',
            's.habit.protein': '🥩 130г+ протеин',
            's.habit.water': '💧 2л+ вода',
            's.habit.movement': '🏃 30 мин движение',
            's.habit.sleep': '😴 7+ часа сън',
            's.habit.no_sugar': '🚫 Без добавена захар',
            's.habit.no_junk': '🚫 Без junk food',
            's.tracker.tmpl': '{n} от 6 завършени',

            's.week.h2': 'Седмичен прогрес',
            's.week.sub': 'Твоята седмица — ден по ден',
            's.day.mon': 'Пн',
            's.day.tue': 'Вт',
            's.day.wed': 'Ср',
            's.day.thu': 'Чт',
            's.day.fri': 'Пт',
            's.day.sat': 'Сб',
            's.day.sun': 'Нд',

            's.after.h2': 'След 7 дни',
            's.after.sub': 'Какво следва?',
            's.after.opt1': '<strong>1. Повтори</strong> — направи същата седмица отново. Вече знаеш как.',
            's.after.opt2': '<strong>2. Добави нещо</strong> — повече повторения, повече крачки, нов рецепт.',
            's.after.opt3': '<strong>3. Провери промоциите</strong> — <a href="cheap.html">виж какво е на намаление</a> и оптимизирай бюджета.',

            's.cta.h2': 'Не от понеделник.<br><em class="purple">Днес.</em>',
            's.cta.p': 'Имаш знанието. Имаш плана. Имаш числата.<br>Единственото, което липсва — е <strong>решението</strong>.',
            's.cta.btn': 'Започни Ден 1 →',

            // ── SUPPLEMENTS ───────────────────────────────────────────────
            'sup.hero.h1': 'Добавки —<br>само ако <em class="green">основата е наред</em>',
            'sup.hero.p': 'Добавките не заместват храненето и тренировките. Те усилват вече работещо.',
            'sup.warning.h3': '⚠️ Преди добавки — провери дали:',
            'sup.s2.h2': 'Добавките с доказана ефективност',
            'sup.s2.sub': 'Само тези, които имат солидни научни доказателства',
            'sup.s3.h2': 'Добавките, за които се говори много — но доказателствата са слаби',
            'sup.s3.sub': 'Маркетинг ≠ наука',
            'sup.s4.h2': 'Кога да потърсиш специалист',
            'sup.cta.btn': 'Виж промоциите →',

            // ── MENTAL ────────────────────────────────────────────────────
            'men.hero.h1': 'Умът<br>определя <em class="purple">всичко</em>.',
            'men.hero.p': 'Можеш да имаш перфектната диета и тренировки — и пак да се чувстваш зле. Психичното здраве не е бонус. То е основата.',
            'men.c1': 'души ще има психично здравен проблем тази година',
            'men.c2': 'души живеят с тревожност или депресия (СЗО, 2023)',
            'men.c3': 'от случаите са свързани с начина на живот — не с биологията',

            'men.nav1': '🧨 Тихите убийци',
            'men.nav2': '🌿 Природата лекува',
            'men.nav3': '✅ Добри практики',
            'men.nav4': '🚫 Спри да нормализираш',
            'men.nav5': '⚖️ Без перфекционизъм',
            'men.nav6': '🆘 Кога да потърсиш помощ',

            'men.s2.h2': 'Тихите убийци на ума',
            'men.s3.h2': 'Природата лекува',
            'men.s4.h2': 'Добри практики',
            'men.s5.h2': 'Спри да нормализираш',
            'men.s6.h2': 'Без перфекционизъм',
            'men.s7.h2': 'Кога да потърсиш помощ',

            'men.cta.btn': 'Виж плана →',

            // ── Visitor counter ───────────────────────────────────────────
            'visits.label': 'посещения',
            'visits.prefix': '',
        },

        en: {
            // ── Navigation ──────────────────────────────────────────────
            'nav.excuses': 'Excuses',
            'nav.move': 'Movement',
            'nav.eat': 'Nutrition',
            'nav.prices': 'Prices',
            'nav.start': 'Start',
            'nav.supplements': 'Supplements',
            'nav.mental': 'Mental',

            // ── Page titles ─────────────────────────────────────────────
            'title.index': 'NutriLife — Stop Making Excuses',
            'title.move': 'NutriLife — Move',
            'title.eat': 'NutriLife — Eat Right',
            'title.cheap': 'NutriLife — It\'s Not Expensive',
            'title.start': 'NutriLife — Start Now',
            'title.supplements': 'NutriLife — Supplements',
            'title.mental': 'NutriLife — Mental Health',

            // ── INDEX ────────────────────────────────────────────────────
            'i.hero.h1': 'Stop <em class="red">Making Excuses</em>',
            'i.hero.p': 'Health won\'t wait. Every day you do nothing, your body pays the price.',
            'i.hero.stat': 'of Bulgarians over 40 have at least one chronic health condition',

            'i.s2.h2': 'The Mirror',
            'i.s2.sub': 'The numbers you don\'t want to see',
            'i.s2.c1': 'Bulgarians are overweight',
            'i.s2.c2': 'diabetes increase since 1980',
            'i.s2.c3': 'hours per day spent in a static position (sitting, lying, screen time)',
            'i.s2.c4': 'heart diseases are preventable',
            'i.s2.note': 'It happened slowly. It reverses slowly.',

            'i.s3.h2': 'How Does It Affect You?',
            'i.s3.sub': 'Choose your age group',

            'age.metabolic': 'Metabolic syndrome',
            'age.obesity': 'Obesity',
            'age.anxiety': 'Anxiety and depression',
            'age.testosterone': 'Low testosterone',
            'age.overweight': 'Overweight',
            'age.bp': 'High blood pressure',
            'age.prediabetes': 'Pre-diabetes',
            'age.stress': 'Chronic stress',
            'age.cardio': 'Cardiovascular risk',
            'age.diabetes2': 'Type 2 diabetes',
            'age.muscle': 'Muscle mass loss',
            'age.joints': 'Back/joint pain',
            'age.chronic': 'Chronic disease',
            'age.osteo': 'Osteoporosis (women)',
            'age.insulin': 'Insulin resistance',
            'age.heartattack': 'Heart attack/stroke risk',

            'i.s4.h2': 'The Excuses',
            'i.s4.sub': 'Every one — a myth',

            'i.e1.h3': '"That\'s just who I am — I can\'t change"',
            'i.e2.h3': '"All food is junk now, it wasn\'t like this before"',
            'i.e3.h3': '"Eating healthy is expensive"',
            'i.e4.h3': '"I don\'t have time"',
            'i.e5.h3': '"I\'ll start on Monday"',
            'i.e6.h3': '"One burger won\'t kill me — it doesn\'t hurt"',
            'i.e7.h3': '"I have bad genes — everyone in my family is overweight"',
            'i.e8.h3': '"I work a lot, I\'m stressed — I deserve a treat"',
            'i.e9.h3': '"I\'ve tried — it doesn\'t work for me"',
            'i.e10.h3': '"No time — family, kids"',
            'i.e11.h3': '"It hurts — I have an injury / bad knee / back"',
            'i.e12.h3': '"I\'ll sort it out when I\'m older"',
            'i.e13.h3': '"It\'s too late for me — I\'m set in my ways"',
            'i.e14.h3': '"I\'m still young — I can afford it"',
            'i.e15.h3': '"Healthy food doesn\'t taste good"',
            'i.e16.h3': '"Healthy cooking takes forever"',
            'i.e17.h3': '"Life is short — enjoy it"',

            'i.harmful.h2': 'Harmful Habits',
            'i.harmful.sub': 'Two things we don\'t talk about openly enough',
            'i.h1.h3': '🚬 Cigarettes — no safe dose',
            'i.h2.h3': '🍺 Alcohol — regular drinking is different from a "cheers"',

            'i.s5.h2': 'What You Gain',
            'i.s5.sub': 'Real changes — not just on the scale',
            'i.gain.energy.h3': 'Energy',
            'i.gain.energy.p': 'Alert until end of day without coffee. You don\'t wake up tired. +30% subjective energy after 1 month.',
            'i.gain.motivation.h3': 'Motivation',
            'i.gain.motivation.p': 'Physical activity boosts dopamine. You set goals and achieve them. You stop procrastinating.',
            'i.gain.focus.h3': 'Focus',
            'i.gain.focus.p': 'The brain stops "freezing" after lunch. You work sharply until end of day.',
            'i.gain.social.h3': 'Social Life',
            'i.gain.social.p': 'You go out more. You play with your kids without getting winded. People around you ask what you\'re doing.',
            'i.gain.confidence.h3': 'Confidence',
            'i.gain.confidence.p': 'The mirror looks different. Clothes fit better. You walk into a room more confidently.',
            'i.gain.sleep.h3': 'Sleep',
            'i.gain.sleep.p': 'You wake up before the alarm. Deeper REM sleep. You fall asleep in minutes, not an hour.',
            'i.gain.mood.h3': 'Mood',
            'i.gain.mood.p': 'The baseline is good. You don\'t depend on coffee to function. Anxiety drops.',
            'i.gain.health.h3': 'Health',
            'i.gain.health.p': 'Blood sugar, cholesterol and blood pressure normalize. Your doctor asks what you\'re doing.',
            'i.gain.money.h3': 'Money',
            'i.gain.money.p': 'Fewer sick days. Fewer medications. Fewer lost workdays. Health is an investment.',

            'i.cta.h2': 'Tomorrow morning.<br><em class="red">Or now.</em>',
            'i.cta.p': 'You know what needs to be done. The only thing missing — is the decision.',
            'i.cta.btn': 'Move →',

            // ── MOVE ─────────────────────────────────────────────────────
            'm.hero.h1': 'The body is built<br>to <em class="green">move</em>.',
            'm.hero.p': 'You don\'t need a gym. You don\'t need an instructor. You need 21 minutes a day.',
            'm.hero.stat': 'per week = −33% risk of early death = just 21 min/day',

            'm.s2.h2': 'Not Just About the Body',
            'm.s2.sub': '6 systems that movement heals',
            'm.acc1.h3': '🧠 Brain and memory',
            'm.acc2.h3': '😊 Mood and depression',
            'm.acc3.h3': '😴 Sleep',
            'm.acc4.h3': '⚡ Hormones and energy',
            'm.acc5.h3': '❤️ Heart and circulatory system',
            'm.acc6.h3': '🦴 Joints and bones',

            'm.s3.h2': 'Weights or Cardio?',
            'm.s3.sub': 'Which workout for whom',
            'm.acc7.h3': '🏋️ Weights (strength training)',
            'm.acc8.h3': '🏃 Cardio (aerobic)',

            'm.s4.h2': 'How to Train Without a Gym',
            'm.s4.sub': 'Minimum budget, maximum effect',
            'm.acc9.h3': '🔑 Bodyweight exercises only',
            'm.acc10.h3': '🏠 Home equipment (recommended)',
            'm.s4.gear.h3': '💡 With these 4 items you cover:',

            'm.s5.h2': 'Steps',
            'm.s5.sub': 'Simple walking is stronger than most workouts',
            'm.steps.c1': 'Sedentary lifestyle (low activity)',
            'm.steps.c2': 'Moderate activity — big difference',
            'm.steps.c3': 'Optimum — maximum health benefit',

            'm.s6.h2': 'Muscles Are Not Just for Looks',
            'm.s6.sub': 'Why strength is the foundation of long-term health',

            'm.cta.h2': '30 minutes a day.<br><em class="green">At least.</em>',
            'm.cta.p': 'It doesn\'t need to be perfect. It needs to be consistent.',
            'm.cta.btn': 'Eat Right →',

            // ── EAT ──────────────────────────────────────────────────────
            'e.hero.h1': 'Eating<br>is not a <em class="red">diet</em>.',
            'e.hero.p': 'Don\'t starve. Don\'t count calories. Eat the right things — your body knows the rest.',
            'e.hero.c1': 'Protein',
            'e.hero.c2': 'Real Food',
            'e.hero.c3': 'No Hunger',

            'e.s2.h2': 'The 4 Principles',
            'e.s2.sub': 'Everything you need to know',
            'e.acc1.h3': '🥩 Protein: 1.6–2g per kg of body weight',
            'e.acc2.h3': '🥦 Real Food: minimally processed',
            'e.acc3.h3': '🚫 Sugar: the invisible enemy',
            'e.acc4.h3': '💧 Hydration: 2–3L of water per day',

            'e.s3.h2': 'Top 15 Healthy Foods',
            'e.s3.sub': 'Cheap, accessible and proven',

            'e.s4.h2': 'Protein Calculator',
            'e.s4.sub': 'How much protein you need every day',
            'e.calc.gender.m': '👨 Male',
            'e.calc.gender.f': '👩 Female',
            'e.calc.act.yes': '🏋️ I train',
            'e.calc.act.no': '🛋️ I don\'t train',
            'e.calc.weight.label': 'Weight (kg):',
            'e.calc.th.weight': 'Weight',
            'e.calc.th.min': 'Min',
            'e.calc.th.max': 'Max',

            'e.s5.h2': 'Sample Day',
            'e.s5.sub': '132g protein for ~6.80 BGN',
            'e.meal1.label': 'Breakfast',
            'e.meal2.label': 'Lunch',
            'e.meal3.label': 'Dinner',

            'e.cta.h2': 'Pay less.<br><em class="green">Eat better.</em>',
            'e.cta.p': 'Healthy eating is cheaper than junk. We\'ll prove it with real prices.',
            'e.cta.btn': 'See promotions →',

            // ── CHEAP ─────────────────────────────────────────────────────
            'c.hero.h1': 'A healthy day<br>for <em class="green">7 BGN</em>.',
            'c.hero.p': '"I can\'t afford it" is the biggest excuse. Here are the numbers.',
            'c.comp.bad': 'Typical day',
            'c.comp.good': 'Healthy day',
            'c.savings.label': 'You save per month:',

            'c.s2.h2': 'Day-by-Day Comparison',
            'c.s2.sub': 'Same meals, different choices',
            'c.acc1.h3': '☕ Breakfast',
            'c.acc2.h3': '🍽️ Lunch',
            'c.acc3.h3': '🌙 Dinner',
            'c.comp.typical': 'Typical',
            'c.comp.healthy': 'Healthy',

            'c.s3.h2': 'This Week\'s Promotions',
            'c.s3.sub': 'Real prices and deals from Bulgarian stores',
            'c.search.placeholder': '🔍 Search product... (e.g. chicken, rice, cheese)',
            'c.filter.all.type': 'All',
            'c.filter.protein': '💪 High Protein',
            'c.filter.bulk': '📦 Bulk Buy',
            'c.sort.label': 'Sort by:',
            'c.sort.recommended': '⭐ Recommended',
            'c.sort.protein_value': '💪 Protein/€',
            'c.sort.protein': '🥩 Most Protein',
            'c.sort.price': '💰 Cheapest',
            'c.sort.health': '❤️ Healthiest',
            'c.cat.all': 'All',
            'c.cat.meat': '🥩 Meat/Fish',
            'c.cat.dairy': '🥛 Dairy',
            'c.cat.grain': '🌾 Grains',
            'c.cat.legume': '🫘 Legumes',
            'c.cat.canned': '🥫 Canned',
            'c.cat.nuts': '🥜 Nuts',
            'c.cat.fat': '🫒 Fats',
            'c.cat.bread': '🍞 Bread',
            'c.cat.vegetable': '🥦 Fruit/Veg',
            'c.cat.drinks': '🍺 Drinks',
            'c.cat.pet': '🐾 Pets',
            'c.cat.hygiene': '🧴 Hygiene',
            'c.cat.household': '🧹 Household',
            'c.loading': 'Loading promotions...',

            'c.s4.h2': 'Where Is It Cheapest Right Now',
            'c.s4.sub': 'Best current price and how the same product compares across stores',

            'c.bulk.h2': 'Buy in Bulk — Save More',
            'c.bulk.sub': 'Long shelf-life products worth buying in quantity',

            'c.protein.h2': 'Most Pure Protein per €1',
            'c.protein.sub': 'Ranking for healthy sources: accounts for protein content, penalizes excess fat and carbs',

            'c.profile.h2': 'Recommendations for You',
            'c.profile.sub': 'Choose a diet profile and see the top 5 products this week',
            'c.prof.all': 'All',

            'c.shop.h2': 'Weekly Shopping List',
            'c.shop.sub': '7 products for a whole week',

            'c.cta.h2': 'Get the plan.<br><em class="green">Stop overpaying.</em>',
            'c.cta.p': 'You have the numbers. You have the plan. The only thing left — is to start.',
            'c.cta.btn': 'Start now →',

            // ── START ─────────────────────────────────────────────────────
            's.hero.h1': '7 days.<br><em class="purple">Change the habit.</em>',
            's.hero.p': 'You don\'t need a monthly subscription. You don\'t need a gym. You need 7 days of discipline.',
            's.hero.c1': 'movement/day',
            's.hero.c2': 'food/day',
            's.hero.c3': 'gym cost',
            's.hero.note': '21 days to build a new habit — you only do the first 7.',

            's.plan.h2': '7-Day Plan',
            's.plan.sub': 'Everything is decided. Just follow.',

            's.day1.h3': 'Day 1 — The First Step',
            's.day2.h3': 'Day 2 — Protein',
            's.day3.h3': 'Day 3 — Movement',
            's.day4.h3': 'Day 4 — The Habit',
            's.day5.h3': 'Day 5 — Water',
            's.day6.h3': 'Day 6 — No Sugar',
            's.day7.h3': 'Day 7 — Review',

            's.tracker.h2': 'Today\'s Progress',
            's.tracker.sub': 'Check off what you did today',
            's.habit.protein': '🥩 130g+ protein',
            's.habit.water': '💧 2L+ water',
            's.habit.movement': '🏃 30 min movement',
            's.habit.sleep': '😴 7+ hours sleep',
            's.habit.no_sugar': '🚫 No added sugar',
            's.habit.no_junk': '🚫 No junk food',
            's.tracker.tmpl': '{n} of 6 completed',

            's.week.h2': 'Weekly Progress',
            's.week.sub': 'Your week — day by day',
            's.day.mon': 'Mon',
            's.day.tue': 'Tue',
            's.day.wed': 'Wed',
            's.day.thu': 'Thu',
            's.day.fri': 'Fri',
            's.day.sat': 'Sat',
            's.day.sun': 'Sun',

            's.after.h2': 'After 7 Days',
            's.after.sub': 'What\'s next?',
            's.after.opt1': '<strong>1. Repeat</strong> — do the same week again. You already know how.',
            's.after.opt2': '<strong>2. Add something</strong> — more reps, more steps, a new recipe.',
            's.after.opt3': '<strong>3. Check promotions</strong> — <a href="cheap.html">see what\'s on sale</a> and optimize your budget.',

            's.cta.h2': 'Not on Monday.<br><em class="purple">Today.</em>',
            's.cta.p': 'You have the knowledge. You have the plan. You have the numbers.<br>The only thing missing — is the <strong>decision</strong>.',
            's.cta.btn': 'Start Day 1 →',

            // ── SUPPLEMENTS ───────────────────────────────────────────────
            'sup.hero.h1': 'Supplements —<br>only if <em class="green">the foundation is solid</em>',
            'sup.hero.p': 'Supplements don\'t replace nutrition and training. They amplify what\'s already working.',
            'sup.warning.h3': '⚠️ Before supplements — check if:',
            'sup.s2.h2': 'Supplements with Proven Effectiveness',
            'sup.s2.sub': 'Only those with solid scientific evidence',
            'sup.s3.h2': 'Supplements Everyone Talks About — But Evidence Is Weak',
            'sup.s3.sub': 'Marketing ≠ science',
            'sup.s4.h2': 'When to See a Specialist',
            'sup.cta.btn': 'See promotions →',

            // ── MENTAL ────────────────────────────────────────────────────
            'men.hero.h1': 'The mind<br>determines <em class="purple">everything</em>.',
            'men.hero.p': 'You can have the perfect diet and workouts — and still feel terrible. Mental health is not a bonus. It\'s the foundation.',
            'men.c1': 'people will have a mental health issue this year',
            'men.c2': 'people live with anxiety or depression (WHO, 2023)',
            'men.c3': 'of cases are linked to lifestyle — not biology',

            'men.nav1': '🧨 Silent Killers',
            'men.nav2': '🌿 Nature Heals',
            'men.nav3': '✅ Good Practices',
            'men.nav4': '🚫 Stop Normalizing',
            'men.nav5': '⚖️ Without Perfectionism',
            'men.nav6': '🆘 When to Seek Help',

            'men.s2.h2': 'The Silent Mind Killers',
            'men.s3.h2': 'Nature Heals',
            'men.s4.h2': 'Good Practices',
            'men.s5.h2': 'Stop Normalizing',
            'men.s6.h2': 'Without Perfectionism',
            'men.s7.h2': 'When to Seek Help',

            'men.cta.btn': 'See the plan →',

            // ── Visitor counter ───────────────────────────────────────────
            'visits.label': 'visits',
            'visits.prefix': '',
        }
    };

    /* ── Core functions ─────────────────────────────────────────────────── */

    function normalizeLang(lang) {
        return lang === 'en' ? 'bg' : (lang || 'bg');
    }

    function getLang() {
        return normalizeLang(localStorage.getItem('nutrilife-lang'));
    }

    function setLang(lang) {
        const nextLang = normalizeLang(lang);
        localStorage.setItem('nutrilife-lang', nextLang);
        document.documentElement.lang = nextLang;
        applyTranslations(nextLang);
    }

    function t(key) {
        const lang = getLang();
        const dict = translations[lang] || translations.bg;
        if (dict[key] !== undefined) return dict[key];
        return translations.bg[key] !== undefined ? translations.bg[key] : key;
    }

    function applyTranslations(lang) {
        const dict = translations[lang] || translations.bg;

        // textContent replacements
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.dataset.i18n;
            if (dict[key] !== undefined) el.textContent = dict[key];
        });

        // innerHTML replacements (for elements with <em>, <br>, <strong>, <a>)
        document.querySelectorAll('[data-i18n-html]').forEach(el => {
            const key = el.dataset.i18nHtml;
            if (dict[key] !== undefined) el.innerHTML = dict[key];
        });

        // placeholder replacements
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.dataset.i18nPlaceholder;
            if (dict[key] !== undefined) el.placeholder = dict[key];
        });

        // Page title
        const slug = (window.location.pathname.split('/').pop() || 'index.html')
            .replace('.html', '') || 'index';
        const titleKey = 'title.' + slug;
        if (dict[titleKey]) document.title = dict[titleKey];
    }

    /* ── Auto-init ──────────────────────────────────────────────────────── */
    document.addEventListener('DOMContentLoaded', () => {
        const lang = getLang();
        document.documentElement.lang = lang;
        applyTranslations(lang);
    });

    /* ── Public API ─────────────────────────────────────────────────────── */
    window.I18N = { getLang, setLang, t, applyTranslations };

})();
