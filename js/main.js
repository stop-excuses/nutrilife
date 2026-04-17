/* ========================================
   NutriLife — Main JS
   Accordion, age selector, sliders, etc.
   ======================================== */

document.addEventListener("DOMContentLoaded", () => {
    initTopControls();
    initAccordions();
    initAgeSelector();
    initSliders();
    initProgressBars();
    initBmiCalculator();
    initTracker();
    initVisitorCounter();
    hydrateTierListImages();
});

const TIER_PRODUCT_IMAGES = {
    "яйца": "https://kaufland.media.schwarz/is/image/schwarz/00099137_Promo_358751?JGstbGVnYWN5LW9uc2l0ZS0zJA==",
    "пилешко": "images/foods/chicken.svg",
    "тон": "https://imgproxy-retcat.assets.schwarz/uPfYDrGNL6pq2CTe5f7Swzv_XVkTQnWEIYRAyNciqyY/sm:1/exar:1:ce/w:427/h:320/cz/M6Ly9wcm9kLWNhd/GFsb2ctbWVkaWEvYmcvMS9FNzhDQkUxQTg5QUZBNDkzNTE0NTFDRjZ/COUZBQ0Y5Qjg0MEExM0I2QTI5OTlFNjBCNkEzMEVCMDVCQzQyMjRFLnBuZw.png",
    "сардини": "images/foods/sardines.svg",
    "сьомга": "images/foods/salmon.svg",
    "скумрия": "images/foods/mackerel.svg",
    "извара": "images/foods/izvara.svg",
    "пуешко": "images/foods/turkey.svg",
    "свинско филе": "images/foods/pork.svg",
    "пилешки бут": "images/foods/chicken-leg.svg",
    "скир": "https://imgproxy-retcat.assets.schwarz/5WNVfXJ3LMjIMe3IKu6jXyBrIyGLvGg5ceNQ0SRJG6s/sm:1/exar:1:ce/w:427/h:320/cz/M6Ly9wcm9kLWNhd/GFsb2ctbWVkaWEvYmcvMS9BODczODA3N0ZGNEU3NTkwNzAyRjIwNjl/FOTNBMTI1QjU3RDRFNjNFRTk5MDU5MDlGNzA2QUU4RjRGMzlFNTFBLnBuZw.png",
    "бг кисело": "https://kaufland.media.schwarz/is/image/schwarz/3800231730076_BG_P?JGstbGVnYWN5LW9uc2l0ZS0zJA==",
    "котидж": "images/foods/cottage.svg",
    "леща": "https://imgproxy-retcat.assets.schwarz/Q4zvMD4m0Z8qNI1M3MTTHWtMc83nN_jC3k1eA5YyT5I/sm:1/exar:1:ce/w:427/h:320/cz/M6Ly9wcm9kLWNhd/GFsb2ctbWVkaWEvYmcvMS81NUQzRTMyRDExNjBBMUU5MEYyRjgzNDJ/CMzM3REQxQTJCMTg3REREM0VGMTYyMEQ0ODhCNjM1MDA4OUVDQUE5LnBuZw.png",
    "нахут": "images/foods/chickpeas.svg",
    "боб": "images/foods/beans.svg",
    "грах": "images/foods/peas.svg",
    "тофу": "images/foods/tofu.svg",
    "телешко": "images/foods/beef.svg",
    "кайма": "images/foods/mince.svg",
    "картофи": "https://kaufland.media.schwarz/is/image/schwarz/09700096_P-2?JGstbGVnYWN5LW9uc2l0ZS0zJA==",
    "ръжен хляб": "https://kaufland.media.schwarz/is/image/schwarz/8767_BG_P?JGstbGVnYWN5LW9uc2l0ZS0zJA==",
    "ориз": "https://imgproxy-retcat.assets.schwarz/kmHk-_YqMhUqUtFHMja8y8W7UIM_icXb8oVqC7Xc44Q/sm:1/exar:1:ce/w:427/h:320/cz/M6Ly9wcm9kLWNhd/GFsb2ctbWVkaWEvYmcvMS8xMDQwMzZFQTJGN0NCMDM2RjFBOUZBMEI/2MTA1QTA5Q0U5QjlFREJFMzMxOEY5RDg5RkI4NzE5RkQxQTExRDMzLnBuZw.png",
    "ябълки": "https://kaufland.media.schwarz/is/image/schwarz/2830700000000_BG_P?JGstbGVnYWN5LW9uc2l0ZS0zJA==",
    "банан": "https://kaufland.media.schwarz/is/image/schwarz/09700011_P?JGstbGVnYWN5LW9uc2l0ZS0zJA==",
    "орехи": "https://kaufland.media.schwarz/is/image/schwarz/00066346_P?JGstbGVnYWN5LW9uc2l0ZS0zJA==",
    "авокадо": "https://kaufland.media.schwarz/is/image/schwarz/4049726002086_BG_P?JGstbGVnYWN5LW9uc2l0ZS0zJA==",
    "маслини": "https://imgproxy-retcat.assets.schwarz/REX3062zwWPYWkk0Nvbj7-rTxgiYjSnQT_km4JBveug/sm:1/exar:1:ce/w:427/h:320/cz/M6Ly9wcm9kLWNhd/GFsb2ctbWVkaWEvYmcvMS9ERDQzRjJEOTY3MzQ5QzgyQjFCQTA1RDl/BRjA3RjM4QUZCMjQ0RjgwNUVERUU1MzEzNzY5MDVGMDE1REVENDhDLnBuZw.png",
    "масло": "https://imgproxy-retcat.assets.schwarz/_mTOvpuT8VWphUw8DX1sa5H60f2Q3MxWglvgtofSkjw/sm:1/exar:1:ce/w:427/h:320/cz/M6Ly9wcm9kLWNhd/GFsb2ctbWVkaWEvYmcvMS8yQ0Q0RERDMzE0N0JGNDNBODU0QTU5MUM/0NjIxRjRGRjM1NkI3QTA1MERFQUM2MUU1OUQ0RTYwQjgxNURDNDQwLnBuZw.png",
    "кашкавал": "https://imgproxy-retcat.assets.schwarz/oprP53x1VIQJa7ymF2aZJbkP7rZXk1Z881bZBfPUI54/sm:1/exar:1:ce/w:427/h:320/cz/M6Ly9wcm9kLWNhd/GFsb2ctbWVkaWEvYmcvMS80RTJEQkVERjk1RTRDMTlFQzU2OEVGMzk/5NjAxRDFCNjIxOUQ4NUJGOTk4Mjc2OTMxQjMxREEwRTJFQUIyOUNBLnBuZw.png"
};

function hydrateTierListImages() {
    const tierImages = document.querySelectorAll(".tier-card img");
    if (!tierImages.length) return;

    tierImages.forEach((img) => {
        const card = img.closest(".tier-card");
        const nameEl = card?.querySelector("strong");
        if (!nameEl) return;

        const rawName = nameEl.textContent || img.alt || "";
        const normalizedName = rawName.toLowerCase().replace(/\*/g, "").trim();
        const mappedSrc = TIER_PRODUCT_IMAGES[normalizedName];

        if (!mappedSrc) return;

        img.src = mappedSrc;
        img.classList.toggle("is-product-photo", /^https?:/i.test(mappedSrc));
        img.loading = "lazy";
    });
}

/* --- Top Controls (Theme + Language) --- */
function initTopControls() {
    // Wrapper
    const wrapper = document.createElement("div");
    wrapper.className = "top-controls";
    document.body.appendChild(wrapper);

    // Theme toggle
    const themeBtn = document.createElement("button");
    themeBtn.className = "theme-toggle";
    themeBtn.setAttribute("aria-label", "Toggle theme");
    wrapper.appendChild(themeBtn);

    // ── Theme logic ──────────────────────────────────────────────────────
    const savedTheme = localStorage.getItem("nutrilife-theme");
    if (savedTheme === "light") {
        document.documentElement.setAttribute("data-theme", "light");
    }
    updateThemeIcon();

    themeBtn.addEventListener("click", () => {
        const isLight = document.documentElement.getAttribute("data-theme") === "light";
        if (isLight) {
            document.documentElement.removeAttribute("data-theme");
            localStorage.setItem("nutrilife-theme", "dark");
        } else {
            document.documentElement.setAttribute("data-theme", "light");
            localStorage.setItem("nutrilife-theme", "light");
        }
        updateThemeIcon();
    });

    function updateThemeIcon() {
        const isLight = document.documentElement.getAttribute("data-theme") === "light";
        themeBtn.textContent = isLight ? "🌙" : "☀️";
    }

    // ── Language logic ───────────────────────────────────────────────────
    // BG-only mode for content editing. Re-enable the toggle when EN copy is finalized.
}

/* --- Visitor Counter --- */
async function initVisitorCounter() {
    const sessionCountKey = "nutrilife-visit-count";
    const sessionCountedKey = "nutrilife-visit-counted";
    const readUrl = "https://api.counterapi.dev/v1/nutrilife-bg/visits/";
    const incrementUrl = "https://api.counterapi.dev/v1/nutrilife-bg/visits/up";

    try {
        const shouldIncrement = sessionStorage.getItem(sessionCountedKey) !== "1";
        const res = await fetch(shouldIncrement ? incrementUrl : readUrl, {
            method: "GET",
            headers: { "Accept": "application/json" }
        });
        if (!res.ok) throw new Error("counter error");
        const data = await res.json();
        const count = data.count ?? data.value ?? null;
        if (count !== null) {
            const formattedCount = Number(count).toLocaleString();
            sessionStorage.setItem(sessionCountKey, formattedCount);
        }
        if (shouldIncrement) {
            sessionStorage.setItem(sessionCountedKey, "1");
        }
    } catch {
        return;
    }
}

/* --- Accordion --- */
function initAccordions() {
    document.querySelectorAll(".accordion-header").forEach(header => {
        header.addEventListener("click", () => {
            const item = header.parentElement;
            const body = item.querySelector(".accordion-body");
            const isOpen = item.classList.contains("open");

            // Close all in same accordion group
            const accordion = item.closest(".accordion");
            if (accordion) {
                accordion.querySelectorAll(".accordion-item.open").forEach(openItem => {
                    if (openItem !== item) {
                        openItem.classList.remove("open");
                        openItem.querySelector(".accordion-body").style.maxHeight = null;
                    }
                });
            }

            if (isOpen) {
                item.classList.remove("open");
                body.style.maxHeight = null;
            } else {
                item.classList.add("open");
                body.style.maxHeight = body.scrollHeight + "px";
            }
        });
    });
}

/* --- Age Selector --- */
function initAgeSelector() {
    const buttons = document.querySelectorAll(".age-btn");
    const contents = document.querySelectorAll(".age-content");

    buttons.forEach(btn => {
        btn.addEventListener("click", () => {
            const target = btn.dataset.age;

            buttons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");

            contents.forEach(c => {
                c.classList.remove("visible");
                if (c.dataset.age === target) {
                    c.classList.add("visible");
                    // Animate progress bars inside
                    animateProgressBars(c);
                }
            });
        });
    });
}

/* --- Sliders --- */
function initSliders() {
    document.querySelectorAll("input[type='range']").forEach(slider => {
        const output = document.getElementById(slider.dataset.output);
        if (output) {
            const updateFn = slider.dataset.fn;
            slider.addEventListener("input", () => {
                if (updateFn && window[updateFn]) {
                    window[updateFn](slider.value, output);
                }
            });
            // Initial
            if (updateFn && window[updateFn]) {
                window[updateFn](slider.value, output);
            }
        }
    });
}

/* --- Progress Bars (animate on scroll) --- */
function initProgressBars() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                animateProgressBars(entry.target);
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.3 });

    document.querySelectorAll(".progress-bar-wrapper").forEach(el => {
        observer.observe(el);
    });
}

function animateProgressBars(container) {
    container.querySelectorAll(".progress-bar .fill").forEach(bar => {
        const target = bar.dataset.width;
        if (target) {
            setTimeout(() => {
                bar.style.width = target + "%";
            }, 100);
        }
    });
}

function buildFieldLabel(label, info) {
    if (!info) {
        return `<span>${label}</span>`;
    }

    return `
        <div class="field-label-row">
            <span class="field-label-text">${label}</span>
            <button class="field-info-btn" type="button" aria-label="Повече информация за ${label}" aria-expanded="false">i</button>
        </div>
        <div class="field-info-popover" hidden>${info}</div>
    `;
}

function buildInfoButton(label, info) {
    return `<button class="field-info-btn" type="button" aria-label="Повече информация за ${label}" aria-expanded="false">i</button><div class="field-info-popover" hidden>${info}</div>`;
}

function initFieldInfoButtons(container) {
    if (!container || container.dataset.infoBound === "1") return;

    container.addEventListener("click", (event) => {
        const button = event.target.closest(".field-info-btn");

        if (!button) {
            container.querySelectorAll(".field-info-btn.is-open").forEach((openBtn) => {
                openBtn.classList.remove("is-open");
                openBtn.setAttribute("aria-expanded", "false");
            });
            container.querySelectorAll(".field-info-popover.visible").forEach((popover) => {
                popover.classList.remove("visible");
                popover.hidden = true;
            });
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        const field = button.closest(".bmi-field") || button.parentElement;
        const popover = field?.querySelector(".field-info-popover");
        if (!popover) return;

        const isOpen = popover.classList.contains("visible");

        container.querySelectorAll(".field-info-btn.is-open").forEach((openBtn) => {
            if (openBtn !== button) {
                openBtn.classList.remove("is-open");
                openBtn.setAttribute("aria-expanded", "false");
            }
        });
        container.querySelectorAll(".field-info-popover.visible").forEach((openPopover) => {
            if (openPopover !== popover) {
                openPopover.classList.remove("visible");
                openPopover.hidden = true;
            }
        });

        button.classList.toggle("is-open", !isOpen);
        button.setAttribute("aria-expanded", String(!isOpen));
        popover.classList.toggle("visible", !isOpen);
        popover.hidden = isOpen;
    });

    document.addEventListener("click", (event) => {
        if (container.contains(event.target)) return;
        container.querySelectorAll(".field-info-btn.is-open").forEach((button) => {
            button.classList.remove("is-open");
            button.setAttribute("aria-expanded", "false");
        });
        container.querySelectorAll(".field-info-popover.visible").forEach((popover) => {
            popover.classList.remove("visible");
            popover.hidden = true;
        });
    });

    container.dataset.infoBound = "1";
}

function initBmiCalculator() {
    const ageGroup = document.getElementById("bmi-age-group");
    const heightInput = document.getElementById("bmi-height");
    const weightInput = document.getElementById("bmi-weight");
    const waistInput = document.getElementById("bmi-waist");
    const trainingInput = document.getElementById("bmi-training");
    const output = document.getElementById("bmi-output");
    const calcGrid = document.querySelector(".bmi-calc-grid");

    if (!ageGroup || !heightInput || !weightInput || !waistInput || !trainingInput || !output || !calcGrid) return;

    if (!document.getElementById("bmi-age-years")) {
        const ageField = document.createElement("label");
        ageField.className = "bmi-field";
        ageField.innerHTML = `${buildFieldLabel("Години")}<input id="bmi-age-years" type="number" min="8" max="99" step="1" value="35"/>`;

        const sexField = document.createElement("label");
        sexField.className = "bmi-field";
        sexField.innerHTML = `${buildFieldLabel("Пол")}<select id="bmi-sex"><option value="male">Мъж</option><option value="female">Жена</option></select>`;

        const smokingField = document.createElement("label");
        smokingField.className = "bmi-field";
        smokingField.innerHTML = `${buildFieldLabel("Пушене")}<select id="bmi-smoking"><option value="none">Не</option><option value="sometimes">Понякога</option><option value="daily">Всеки ден</option></select>`;

        const alcoholField = document.createElement("label");
        alcoholField.className = "bmi-field";
        alcoholField.innerHTML = `${buildFieldLabel("Алкохол")}<select id="bmi-alcohol"><option value="low">Рядко / почти никога</option><option value="weekly">1-2 пъти седмично</option><option value="often">3+ пъти седмично</option><option value="binge">Често препиване</option></select>`;

        const sleepField = document.createElement("label");
        sleepField.className = "bmi-field";
        sleepField.innerHTML = `${buildFieldLabel("Сън")}<select id="bmi-sleep"><option value="good">Добър</option><option value="average">Среден</option><option value="bad">Лош / хъркам / будя се смазан</option></select>`;

        const activityField = document.createElement("label");
        activityField.className = "bmi-field";
        activityField.innerHTML = `${buildFieldLabel("Движение")}<select id="bmi-activity"><option value="high">Редовно ходя / тренирам</option><option value="medium">Имам някакво движение</option><option value="low">Основно седя</option></select>`;

        const junkField = document.createElement("label");
        junkField.className = "bmi-field";
        junkField.innerHTML = `${buildFieldLabel("Захари / junk")}<select id="bmi-junk"><option value="low">Рядко</option><option value="medium">Няколко пъти седмично</option><option value="high">Почти всеки ден</option></select>`;

        const stepsField = document.createElement("label");
        stepsField.className = "bmi-field";
        stepsField.innerHTML = `${buildFieldLabel("Крачки / ден", "Погледни телефона или часовника за средните крачки от последните 7 дни, а не за един случаен ден. Това оценява реалното ти ежедневно движение. Под 4000 значи много ниска база; 4000-6999 е средно; 7000-9000 е добра ежедневна база за повечето хора.")}<input id="bmi-steps" type="number" min="0" max="30000" step="100" value="4500"/>`;

        const pulseField = document.createElement("label");
        pulseField.className = "bmi-field";
        pulseField.innerHTML = `${buildFieldLabel("Пулс в покой")}<input id="bmi-resting-pulse" type="number" min="35" max="140" step="1" value="" placeholder="по желание"/>`;

        const pressureField = document.createElement("label");
        pressureField.className = "bmi-field";
        pressureField.innerHTML = `${buildFieldLabel("Кръвно")}<select id="bmi-pressure"><option value="unknown">Не знам</option><option value="normal">Под 120/80</option><option value="elevated">120-129 / под 80</option><option value="stage1">130-139 или 80-89</option><option value="stage2">140/90+</option></select>`;

        const chairField = document.createElement("label");
        chairField.className = "bmi-field";
        chairField.innerHTML = `${buildFieldLabel("30 сек стол тест", "Седни на стабилен стол до стена, стъпала на пода, ръце на гърди. За 30 секунди се изправяй напълно и сядай обратно, без да си помагаш с ръцете. Избери диапазона, в който попадаш.")}<select id="bmi-chair-test"><option value="skip">Не съм го правил</option><option value="poor">Под 10 повторения</option><option value="mid">10-14 повторения</option><option value="good">15+ повторения</option></select>`;

        const balanceField = document.createElement("label");
        balanceField.className = "bmi-field";
        balanceField.innerHTML = `${buildFieldLabel("Баланс", "Под 60: застани до стена или стол, вдигни единия крак и засечи колко секунди стоиш стабилно. 60+: сложи единия крак точно пред другия и виж дали държиш 10 секунди. Избери варианта, който е най-близо до резултата ти.")}<select id="bmi-balance"><option value="skip">Не съм го правил</option><option value="poor">Под 10 сек / нестабилно</option><option value="mid">10-19 сек / трудно</option><option value="good">20+ сек / стабилно</option></select>`;

        const stairsField = document.createElement("label");
        stairsField.className = "bmi-field";
        stairsField.innerHTML = `${buildFieldLabel("Стълби / brisk walk", "Направи кратък test с една стълба или 3-5 минути бързо ходене. Трябва да можеш да говориш, но не и да пееш. Ако не можеш да кажеш цяло изречение или те удря твърде много, аеробната ти база е слаба.")}<select id="bmi-stairs"><option value="easy">Ок съм</option><option value="winded">Задъхвам се</option><option value="hard">Много ме бие</option></select>`;

        const tugField = document.createElement("label");
        tugField.className = "bmi-field";
        tugField.innerHTML = `${buildFieldLabel("TUG тест", "Седни на стол, отбележи 3 метра пред себе си, пусни таймер, стани, отиди до маркера, обърни се, върни се и седни пак. Избери диапазона, в който попада времето ти.")}<select id="bmi-tug"><option value="skip">Не съм го правил</option><option value="good">Под 10 сек</option><option value="mid">10-12 сек</option><option value="poor">12+ сек / нестабилно</option></select>`;

        calcGrid.prepend(sexField);
        calcGrid.prepend(ageField);
        calcGrid.append(smokingField, alcoholField, sleepField, activityField, junkField, stepsField, pulseField, pressureField, chairField, balanceField, stairsField, tugField);
    }

    initFieldInfoButtons(calcGrid);

    const ageYearsInput = document.getElementById("bmi-age-years");
    const sexInput = document.getElementById("bmi-sex");
    const smokingInput = document.getElementById("bmi-smoking");
    const alcoholInput = document.getElementById("bmi-alcohol");
    const sleepInput = document.getElementById("bmi-sleep");
    const activityInput = document.getElementById("bmi-activity");
    const junkInput = document.getElementById("bmi-junk");
    const stepsInput = document.getElementById("bmi-steps");
    const pulseInput = document.getElementById("bmi-resting-pulse");
    const pressureInput = document.getElementById("bmi-pressure");
    const chairInput = document.getElementById("bmi-chair-test");
    const balanceInput = document.getElementById("bmi-balance");
    const stairsInput = document.getElementById("bmi-stairs");
    const tugInput = document.getElementById("bmi-tug");

    const ageGroupField = ageGroup.closest(".bmi-field");
    if (ageGroupField) ageGroupField.style.display = "none";

    const render = () => {
        const ageYears = Number(ageYearsInput.value);
        const age = ageYears < 18 ? "child" : "adult";
        const heightCm = Number(heightInput.value);
        const weightKg = Number(weightInput.value);
        const waistCm = waistInput.value === "" ? null : Number(waistInput.value);
        const training = trainingInput.value === "yes";
        const sex = sexInput.value;
        const smoking = smokingInput.value;
        const alcohol = alcoholInput.value;
        const sleep = sleepInput.value;
        const activity = activityInput.value;
        const junk = junkInput.value;
        const steps = Number(stepsInput.value);
        const restingPulse = pulseInput.value === "" ? null : Number(pulseInput.value);
        const pressure = pressureInput.value;
        const chair = chairInput.value;
        const balance = balanceInput.value;
        const stairs = stairsInput.value;
        const tug = tugInput.value;

        if (!ageYears || ageYears < 8 || ageYears > 99 || !heightCm || !weightKg || heightCm < 120 || heightCm > 230 || weightKg < 25 || weightKg > 250) {
            output.innerHTML = '<div class="stat-pills"><span class="stat-pill amber">Въведи реални стойности</span></div>';
            return;
        }

        if (waistCm !== null && (waistCm < 40 || waistCm > 200)) {
            output.innerHTML = '<div class="stat-pills"><span class="stat-pill amber">Провери талията в см</span></div>';
            return;
        }

        if (!stepsInput.value || steps < 0 || steps > 30000) {
            output.innerHTML = '<div class="stat-pills"><span class="stat-pill amber">Въведи ориентировъчни крачки на ден</span></div>';
            return;
        }

        if (restingPulse !== null && (restingPulse < 35 || restingPulse > 140)) {
            output.innerHTML = '<div class="stat-pills"><span class="stat-pill amber">Провери пулса в покой</span></div>';
            return;
        }

        const heightM = heightCm / 100;
        const bmi = weightKg / (heightM * heightM);
        const underweightMax = 18.5 * heightM * heightM;
        const normalMax = 24.9 * heightM * heightM;
        const overweightMax = 29.9 * heightM * heightM;
        const waistToHeight = waistCm === null ? null : waistCm / heightCm;

        const issues = [];
        const recommendations = [];
        const profiles = {
            metabolic: 0,
            fitness: 0,
            recovery: 0,
            cardio: 0,
            smoking: 0,
            alcohol: 0,
            underweight: 0,
        };

        const waistBorderline = waistCm === null ? null : (sex === "female" ? 80 : 94);
        const waistHigh = waistCm === null ? null : (sex === "female" ? 88 : 102);

        const ageAwareChair = (() => {
            if (ageYears < 40) return { good: "15+", mid: "11-14", poor: "10 или по-малко" };
            if (ageYears < 60) return { good: "13+", mid: "10-12", poor: "9 или по-малко" };
            return { good: sex === "female" ? "12+" : "14+", mid: sex === "female" ? "10-11" : "12-13", poor: sex === "female" ? "под 10" : "под 12" };
        })();

        const chairCategory = chair;
        const balanceCategory = balance;
        const tugCategory = tug;

        if (age === "child") {
            if (activity === "low") {
                profiles.fitness += 2;
                issues.push("движението е ниско още сега");
            }
            if (sleep === "bad") {
                profiles.recovery += 2;
                issues.push("сънят вече е слаб / има риск от хъркане");
            }
            if (stairs !== "easy") {
                profiles.fitness += stairs === "hard" ? 3 : 1;
                issues.push("има задух при елементарно усилие");
            }
            if (bmi >= 25 || (waistToHeight !== null && waistToHeight >= 0.5)) {
                profiles.metabolic += 3;
                issues.push("талията или килограмите вече вървят в грешна посока");
            }
            if (junk === "high") {
                profiles.metabolic += 2;
                issues.push("ежедневните захари усилват риска");
            }

            const childSignals = issues.slice(0, 3).map((x) => `<li>${x}</li>`).join("");
            output.innerHTML = `
                <div class="cards-grid" style="margin-top:0;">
                    <div class="stat-card purple">
                        <div class="stat-number">${ageYears}</div>
                        <div class="stat-label">години</div>
                    </div>
                    <div class="info-box purple" style="margin:0;">
                        <h3>Под 18: това вече е сигнал, не „ще го израсте“</h3>
                        <p style="margin-top:8px;">При деца и тийнейджъри това не е диагноза. Но ако има корем, задух, ниско движение и лош сън, проблемът вече започва рано.</p>
                        <ul style="margin-top:10px; padding-left:18px; line-height:1.7;">${childSignals || "<li>на този етап няма силни warning сигнали</li>"}</ul>
                    </div>
                </div>
                <div class="stat-pills mt-16">
                    <span class="stat-pill purple">Следи навиците, не само кантара</span>
                    <span class="stat-pill amber">При деца и тийнейджъри главният риск е пренасяне на проблема в зряла възраст</span>
                </div>
            `;
            return;
        }

        if (bmi < 18.5) {
            profiles.underweight += 4;
            issues.push("теглото е под базовата зона");
            recommendations.push("качвай храна и протеин, не просто боклук");
            recommendations.push("вкарай 2-3 силови сесии седмично");
        } else if (bmi >= 30) {
            profiles.metabolic += 4;
            issues.push("BMI вече е в зона затлъстяване");
            recommendations.push("свали 5-10% от теглото като първа цел");
        } else if (bmi >= 25) {
            profiles.metabolic += 2;
            issues.push("теглото вече е над базовата зона");
        }

        if (waistCm !== null) {
            if (waistToHeight >= 0.6 || waistCm >= waistHigh) {
                profiles.metabolic += 3;
                issues.push(`талия / ръст ${waistToHeight.toFixed(2)} = висок коремен риск`);
            } else if (waistToHeight >= 0.5 || waistCm >= waistBorderline) {
                profiles.metabolic += 2;
                issues.push(`талия / ръст ${waistToHeight.toFixed(2)} = warning`);
            }
        }

        if (!training) {
            profiles.fitness += 1;
            profiles.metabolic += 1;
            issues.push("нямаш силова тренировка в седмицата");
        }

        if (activity === "low") {
            profiles.fitness += 3;
            profiles.metabolic += 2;
            issues.push("основно седиш");
            recommendations.push("вдигни крачките постепенно, не чакай мотивация");
        } else if (activity === "medium") {
            profiles.fitness += 1;
        }

        if (steps < 4000) {
            profiles.fitness += 3;
            profiles.cardio += 2;
            issues.push(`крачките са много ниски: ${steps}`);
            recommendations.push("първата цел е +1000 до +1500 крачки над сегашното ниво");
        } else if (steps < 7000) {
            profiles.fitness += 2;
            profiles.cardio += 1;
            issues.push(`крачките са под добра база: ${steps}`);
            recommendations.push("вдигни се към 7000-9000 крачки за база");
        } else if (steps >= 9000) {
            profiles.cardio -= 1;
        }

        if (junk === "medium") {
            profiles.metabolic += 1;
        } else if (junk === "high") {
            profiles.metabolic += 3;
            profiles.recovery += 1;
            issues.push("захари / junk почти всеки ден");
            recommendations.push("спри течните калории и ежедневното сладко");
        }

        if (sleep === "average") {
            profiles.recovery += 1;
        } else if (sleep === "bad") {
            profiles.recovery += 3;
            profiles.metabolic += 1;
            issues.push("сънят не те възстановява");
            recommendations.push("оправи съня преди да търсиш мотивация");
        }

        if (smoking === "sometimes") {
            profiles.smoking += 2;
            profiles.recovery += 1;
            issues.push("пушенето вече ти дърпа здравето надолу");
            recommendations.push("свали пушенето до 0, не до „по-малко“");
        } else if (smoking === "daily") {
            profiles.smoking += 5;
            profiles.recovery += 2;
            profiles.metabolic += 1;
            issues.push("ежедневното пушене вече е силен риск");
            recommendations.push("спирането на цигарите е high priority, не странична цел");
        }

        if (alcohol === "weekly") {
            profiles.alcohol += 1;
            profiles.recovery += 1;
        } else if (alcohol === "often") {
            profiles.alcohol += 3;
            profiles.recovery += 2;
            issues.push("алкохолът вече удря сън и възстановяване");
            recommendations.push("свали алкохола до максимум 1-2 случая седмично");
        } else if (alcohol === "binge") {
            profiles.alcohol += 5;
            profiles.recovery += 3;
            profiles.metabolic += 1;
            issues.push("препиванията вече са реален риск, не „разпускане“");
            recommendations.push("спри препиванията първо, после мисли за друго");
        }

        if (chairCategory === "mid") {
            profiles.fitness += 2;
            issues.push("стол тестът е среден: 10-14 повторения");
        } else if (chairCategory === "poor") {
            profiles.fitness += 3;
            issues.push("стол тестът е слаб: под 10 повторения");
            recommendations.push("прави sit-to-stand, клек до стол и calf raises 2-3 пъти седмично");
        }

        if (balanceCategory === "mid") {
            profiles.fitness += 2;
            issues.push("балансът е среден: 10-19 сек");
        } else if (balanceCategory === "poor") {
            profiles.fitness += 3;
            issues.push("балансът е слаб: под 10 сек");
            recommendations.push("добави баланс на един крак или tandem stance всеки ден");
        }

        if (stairs === "winded") {
            profiles.fitness += 2;
            profiles.metabolic += 1;
            profiles.cardio += 1;
            issues.push("задъхваш се на елементарно усилие");
        } else if (stairs === "hard") {
            profiles.fitness += 3;
            profiles.metabolic += 2;
            profiles.cardio += 3;
            issues.push("кондицията вече е под базата");
            recommendations.push("вкарай 20-30 мин бързо ходене в 5 дни от седмицата");
        }

        if (tugCategory === "mid") {
            profiles.fitness += 2;
            profiles.cardio += 1;
            issues.push("TUG е среден: 10-12 сек");
        } else if (tugCategory === "poor") {
            profiles.fitness += 4;
            profiles.cardio += 1;
            issues.push("TUG е слаб: 12+ сек");
            recommendations.push("тренирай ставане от стол, ходене, step-up и баланс");
        }

        if (pressure === "elevated") {
            profiles.cardio += 1;
            issues.push("кръвното вече е над нормалното");
        } else if (pressure === "stage1") {
            profiles.cardio += 3;
            profiles.metabolic += 1;
            issues.push("кръвното вече е в хипертонична зона");
            recommendations.push("приоритизирай ходене, сън, талия и по-малко алкохол");
        } else if (pressure === "stage2") {
            profiles.cardio += 5;
            profiles.metabolic += 2;
            issues.push("кръвното вече е сериозен сигнал");
            recommendations.push("не го отлагай: провери кръвното системно и говори с лекар");
        }

        if (restingPulse !== null) {
            if (restingPulse >= 80) {
                profiles.cardio += 2;
                profiles.fitness += 1;
                issues.push(`пулсът в покой е висок: ${restingPulse}`);
            } else if (restingPulse <= 60 && activity !== "low") {
                profiles.cardio -= 1;
            }
        }

        if (ageYears >= 45) {
            profiles.metabolic += 1;
        }
        if (ageYears >= 55) {
            profiles.fitness += 1;
            profiles.recovery += 1;
        }

        const sortedProfiles = Object.entries(profiles).sort((a, b) => b[1] - a[1]);
        const [topKey, topScore] = sortedProfiles[0];

        let statusClass = "green";
        let statusTitle = "Нисък проблем засега";
        let message = "Нямаш силен warning профил в този скрининг. Това не значи „перфектно здраве“, а че още имаш база.";

        const profileMeta = {
            metabolic: {
                className: "red",
                title: "Коремен метаболитен риск",
                message: "Комбинацията от тегло, талия, ниско движение и задух подсказва, че рискът е по-скоро метаболитен, не само естетичен."
            },
            fitness: {
                className: "amber",
                title: "Ниска кондиция и слаб мускулен резерв",
                message: "Проблемът не е само кантарът. Тялото ти показва, че базовата сила и издръжливост вече изостават."
            },
            recovery: {
                className: "amber",
                title: "Лошо възстановяване",
                message: "Сънят, стресът и навиците пречат да се възстановяваш. Без това и доброто хранене, и движението работят по-слабо."
            },
            cardio: {
                className: "red",
                title: "Кардио и ежедневна функция изостават",
                message: "Ниските крачки, задухът, кръвното или слабият TUG подсказват, че капацитетът ти за ежедневно движение пада по-бързо, отколкото трябва."
            },
            smoking: {
                className: "red",
                title: "Пушенето вече е централният проблем",
                message: "Тук не говорим за „малък порок“. Пушенето вече ти дърпа сърце, съдове, кондиция и възстановяване надолу."
            },
            alcohol: {
                className: "red",
                title: "Алкохолът вече ти вреди",
                message: "Това не е само „разпускане“. Алкохолът вече удря съня, апетита, възстановяването и контрола."
            },
            underweight: {
                className: "amber",
                title: "Прекалено слаб = също проблем",
                message: "Ниското тегло не е автоматично добра форма. Често значи малко мускул, ниска сила и слаб резерв."
            }
        };

        if (topScore >= 3 && profileMeta[topKey]) {
            statusClass = profileMeta[topKey].className;
            statusTitle = profileMeta[topKey].title;
            message = profileMeta[topKey].message;
        }

        let futureText = "Ако не промениш нищо, следващите години най-често носят още по-малко движение, още повече корем и още по-трудно връщане назад.";
        if (topKey === "metabolic") {
            futureText = "Ако не промениш нищо, най-вероятно следват още корем, по-лоша захар, по-лошо кръвно, по-лош сън и повече умора.";
        } else if (topKey === "fitness") {
            futureText = "Ако този тест ти е труден още сега, има риск да влезеш в следващото десетилетие с по-слаби крака, повече болки и по-малка независимост в ежедневни неща като изправяне, стълби и дълго ходене.";
        } else if (topKey === "recovery") {
            futureText = "Ако не промениш нищо, ще ставаш все по-уморен, по-гладен, по-нервен и все по-труден за изваждане от лошия цикъл.";
        } else if (topKey === "cardio") {
            futureText = "Ако ходенето, стълбите и ставането от стол вече са трудни, това е знак за ускорено функционално стареене, не просто за \"липса на спорт\".";
        } else if (topKey === "smoking") {
            futureText = "Ако не промениш нищо, пушенето ще продължи да сваля кондицията, възстановяването и капацитета ти за движение.";
        } else if (topKey === "alcohol") {
            futureText = "Ако не промениш нищо, алкохолът ще продължи да дърпа надолу съня, апетита, талията и самоконтрола.";
        } else if (topKey === "underweight") {
            futureText = "Ако не промениш нищо, ниският мускулен резерв ще значи още по-слаба сила, по-лоша форма и по-трудно възстановяване.";
        }

        const issueList = issues.slice(0, 4).map((item) => `<li>${item}</li>`).join("");
        const recommendationList = [...new Set(recommendations)].slice(0, 4).map((item) => `<li>${item}</li>`).join("");
        const secondaryProfiles = sortedProfiles
            .slice(1, 3)
            .filter(([, score]) => score >= 2)
            .map(([key]) => `<span class="stat-pill">${profileMeta[key]?.title || key}</span>`)
            .join("");

        const waistNote = waistCm === null
            ? '<span class="stat-pill">Без талия: резултатът е по-груб</span>'
            : `<span class="stat-pill ${waistToHeight >= 0.6 || waistCm >= waistHigh ? "red" : waistToHeight >= 0.5 || waistCm >= waistBorderline ? "amber" : "green"}">Талия / ръст ${waistToHeight.toFixed(2)}</span>`;

        const trainingNote = training
            ? '<span class="stat-pill green">Тренираш: част от кг може да е мускул</span>'
            : '<span class="stat-pill amber">Не тренираш: това вдига риска</span>';

        const stepsNote = `<span class="stat-pill ${steps < 4000 ? "red" : steps < 7000 ? "amber" : "green"}">${steps} крачки / ден</span>`;
        const pulseNote = restingPulse === null ? "" : `<span class="stat-pill ${restingPulse >= 80 ? "amber" : "green"}">Пулс ${restingPulse}</span>`;

        let movementPlan = "Пази 150+ минути движение седмично и 2 силови дни.";
        if (profiles.fitness >= 4 || profiles.cardio >= 4) {
            movementPlan = "Първо: ходене 20-30 мин в 5 дни, sit-to-stand, step-up и баланс. После вкарай 2 силови дни.";
        } else if (profiles.metabolic >= 4) {
            movementPlan = "Първо: вдигни крачките, свали ежедневните захари и пази талията под 1/2 от ръста.";
        }

        const statusInfo = {
            metabolic: "Това е warning, защото комбинацията от талия, тегло, ниско движение и навици често върви с по-лоша захар, кръвно и сън. Тоест проблемът е метаболитен, не само визуален.",
            fitness: "Това е warning, защото слабите chair stand, баланс или TUG показват нисък мускулен резерв и по-слаба функция в ежедневни неща като ставане, стълби и дълго ходене.",
            recovery: "Това е warning, защото лошият сън и навици пречат на апетита, енергията, кръвната захар и възстановяването. Ако това падне, останалите навици също падат.",
            cardio: "Това е warning, защото ниските крачки, задухът и по-слабият TUG показват, че аеробната база и ежедневната функция вече изостават.",
            smoking: "Това е warning, защото тук пушенето е по-силният рисков фактор от почти всичко друго в скрининга и удря съдове, сърце и кондиция.",
            alcohol: "Това е warning, защото алкохолът вече се отразява на съня, апетита, възстановяването и контрола върху навиците.",
            underweight: "Това не е автоматично 'добре', защото ниското тегло често значи нисък мускулен резерв и по-слаба сила, особено ако не тренираш.",
            low: "Добре е, защото засега не се вижда силен warning профил. Това не значи идеално здраве, а че още имаш база и е по-лесно да пазиш нещата добри."
        };

        const issueInfo = "Това са главните сигнали, по които скринингът преценява, че вече има проблемна посока. Не са диагноза, а ориентир какво вече личи.";
        const actionInfo = "Това са първите неща, които дават най-голям ефект с най-малко сложност. Не идеалният план, а най-умният първи ход.";
        const futureInfo = "Това не е точна прогноза по възраст. Това е най-вероятната посока, ако оставиш нещата както са.";
        const testsInfo = "Тези тестове имат смисъл, защото могат да се направят самостоятелно у дома и дават по-полезен сигнал за ежедневна функция от кантара сам по себе си.";

        const chairGuide = ageYears >= 60
            ? `CDC ориентир за ${ageYears} г. ${sex === "female" ? "жена" : "мъж"}: под ${ageAwareChair.poor} = слаб резултат; около ${ageAwareChair.mid} = средно; ${ageAwareChair.good} = добра база.`
            : `Практичен ориентир под 60 г.: под ${ageAwareChair.poor} = слабо; ${ageAwareChair.mid} = средно; ${ageAwareChair.good} = добра база.`;

        const balanceGuide = ageYears >= 60
            ? "Баланс: застани с единия крак точно пред другия. Ако не можеш да стоиш 10 секунди без да мръднеш или да се хванеш, балансът е слаб."
            : "Баланс: стой на един крак до стена. Под 10 секунди е слаб резултат, 10-19 е средно, 20+ е добра база.";

        const tugGuide = "TUG: ставаш от стол, минаваш 3 метра, връщаш се и сядаш. Под 10 секунди е добра база, 10-12 е средно, 12+ или нестабилност е warning.";
        const stepsGuide = "Крачки: под 4000 = много ниска база; 4000-6999 = средно; 7000-9000 = добра база за повечето; 9000+ = много добре.";
        const chairResultText = chairCategory === "skip" ? "не е въведен" : chairCategory === "good" ? "15+ повторения (добре)" : chairCategory === "mid" ? "10-14 повторения (средно)" : "под 10 повторения (зле)";
        const balanceResultText = balanceCategory === "skip" ? "не е въведен" : balanceCategory === "good" ? "20+ сек / стабилно (добре)" : balanceCategory === "mid" ? "10-19 сек / трудно (средно)" : "под 10 сек / нестабилно (зле)";
        const tugResultText = tugCategory === "skip" ? "не е въведен" : tugCategory === "good" ? "под 10 сек (добре)" : tugCategory === "mid" ? "10-12 сек (средно)" : "12+ сек / нестабилно (зле)";

        output.innerHTML = `
            <div class="cards-grid" style="margin-top:0;">
                <div class="stat-card ${statusClass}">
                    <div class="stat-number">${waistToHeight === null ? bmi.toFixed(1) : waistToHeight.toFixed(2)}</div>
                    <div class="stat-label">${waistToHeight === null ? "BMI" : "Талия / ръст"}</div>
                </div>
                <div class="info-box ${statusClass}" style="margin:0;">
                    <div class="info-heading-row"><h3>${statusTitle}</h3>${buildInfoButton(statusTitle, statusInfo[topKey] || statusInfo.low)}</div>
                    <p style="margin-top:8px;">${message}</p>
                    <p style="margin-top:10px;"><strong>За твоя ръст:</strong> под <span class="amber">${underweightMax.toFixed(0)} кг</span> е underweight, <span class="green">${underweightMax.toFixed(0)}–${normalMax.toFixed(0)} кг</span> е базова зона, <span class="amber">${normalMax.toFixed(0)}–${overweightMax.toFixed(0)} кг</span> е warning, <span class="red">${overweightMax.toFixed(0)}+ кг</span> е затлъстяване.</p>
                </div>
            </div>
            <div class="info-box mt-16" style="margin-bottom:0;">
                <div class="info-heading-row"><h3>Какво показва</h3>${buildInfoButton("Какво показва", issueInfo)}</div>
                <ul style="margin-top:10px; padding-left:18px; line-height:1.7;">${issueList || "<li>Нямаш силни warning сигнали в този скрининг.</li>"}</ul>
            </div>
            <div class="info-box mt-16" style="margin-bottom:0;">
                <div class="info-heading-row"><h3>Какво да правиш първо</h3>${buildInfoButton("Какво да правиш първо", actionInfo)}</div>
                <ul style="margin-top:10px; padding-left:18px; line-height:1.7;">${recommendationList || "<li>Пази движението, съня и талията под контрол.</li><li>Не чакай проблемът да стане видим и в кръвните изследвания.</li>"}</ul>
                <p style="margin-top:10px;"><strong>Тренировъчен ориентир:</strong> ${movementPlan}</p>
            </div>
            <div class="info-box mt-16 ${statusClass}" style="margin-bottom:0;">
                <div class="info-heading-row"><h3>Какво ще стане, ако не направиш нищо</h3>${buildInfoButton("Какво ще стане, ако не направиш нищо", futureInfo)}</div>
                <p style="margin-top:8px;">${futureText}</p>
            </div>
            <div class="info-box mt-16" style="margin-bottom:0;">
                <div class="info-heading-row"><h3>Домашни тестове, които си струват</h3>${buildInfoButton("Домашни тестове", testsInfo)}</div>
                <p style="margin-top:8px;">Талия под половината от ръста. 30 сек chair stand. Баланс на 1 крак или tandem stance. Ходене/стълби без да се разбиваш. Това е по-полезно от кантара сам по себе си.</p>
                <p style="margin-top:10px;"><strong>Стол тест:</strong> ${chairGuide} Твоят резултат: ${chairResultText}.</p>
                <p style="margin-top:10px;"><strong>Баланс:</strong> ${balanceGuide} Твоят резултат: ${balanceResultText}.</p>
                <p style="margin-top:10px;"><strong>TUG:</strong> ${tugGuide} Твоят резултат: ${tugResultText}.</p>
                <p style="margin-top:10px;"><strong>Крачки:</strong> ${stepsGuide}</p>
            </div>
            <div class="stat-pills mt-16">
                <span class="stat-pill ${statusClass}">${statusTitle}</span>
                ${waistNote}
                ${stepsNote}
                ${pulseNote}
                ${trainingNote}
                ${secondaryProfiles}
            </div>
        `;
    };

    [ageYearsInput, sexInput, ageGroup, heightInput, weightInput, waistInput, trainingInput, smokingInput, alcoholInput, sleepInput, activityInput, junkInput, stepsInput, pulseInput, pressureInput, chairInput, balanceInput, stairsInput, tugInput].forEach((el) => {
        el.addEventListener("input", render);
        el.addEventListener("change", render);
    });

    render();
    initFieldInfoButtons(output);
}

/* --- Tracker (localStorage) --- */
function initTracker() {
    const trackerItems = document.querySelectorAll(".tracker-item");
    if (trackerItems.length === 0) return;

    const today = new Date().toISOString().slice(0, 10);
    const storageKey = "nutrilife-tracker-" + today;
    const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");

    trackerItems.forEach(item => {
        const checkbox = item.querySelector("input[type='checkbox']");
        const id = checkbox.dataset.habit;

        if (saved[id]) {
            checkbox.checked = true;
            item.classList.add("checked");
        }

        checkbox.addEventListener("change", () => {
            item.classList.toggle("checked", checkbox.checked);
            saved[id] = checkbox.checked;
            localStorage.setItem(storageKey, JSON.stringify(saved));
            updateTrackerProgress();
            updateWeekChart();
        });
    });

    updateTrackerProgress();
    updateWeekChart();
}

function updateTrackerProgress() {
    const total = document.querySelectorAll(".tracker-item").length;
    const checked = document.querySelectorAll(".tracker-item input:checked").length;
    const progressEl = document.getElementById("tracker-progress");
    const progressBar = document.getElementById("tracker-bar-fill");

    if (progressEl) {
        const tmpl = window.I18N
            ? window.I18N.t("s.tracker.tmpl")
            : "{n} от 6 завършени";
        progressEl.textContent = tmpl.replace("{n}", checked);
    }
    if (progressBar) {
        progressBar.style.width = (total > 0 ? (checked / total) * 100 : 0) + "%";
    }
}

function updateWeekChart() {
    const bars = document.querySelectorAll(".week-bar .bar");
    if (bars.length === 0) return;

    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=Sun
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

    bars.forEach((bar, i) => {
        const date = new Date(today);
        date.setDate(today.getDate() + mondayOffset + i);
        const key = "nutrilife-tracker-" + date.toISOString().slice(0, 10);
        const data = JSON.parse(localStorage.getItem(key) || "{}");

        const total = 6;
        const done = Object.values(data).filter(Boolean).length;
        const pct = (done / total) * 100;

        bar.style.height = Math.max(pct, 4) + "%";
        bar.classList.toggle("filled", done > 0 && done < total);
        bar.classList.toggle("full", done === total);
    });
}

/* --- Slider Calculator Functions --- */

// Steps slider (move.html)
window.updateSteps = function (value, output) {
    const steps = parseInt(value);
    const lang = window.I18N ? window.I18N.getLang() : "bg";
    const isEn = lang === "en";

    let risk;
    if (steps < 4000) {
        risk = isEn ? "High risk" : "Висок риск";
    } else if (steps < 7000) {
        risk = isEn ? "Moderate risk (−40%)" : "Умерен риск (−40%)";
    } else {
        risk = isEn ? "Low risk (−60%)" : "Нисък риск (−60%)";
    }
    const calories = Math.round(steps * 0.04);
    const minutes = Math.round(steps / 100);
    const stepsLabel = isEn ? "steps" : "крачки";
    const minLabel = isEn ? "min" : "мин";

    output.innerHTML =
        '<div class="stat-pills">' +
        '<span class="stat-pill green">' + steps.toLocaleString() + ' ' + stepsLabel + '</span>' +
        '<span class="stat-pill ' + (steps < 4000 ? '' : 'green') + '">' + risk + '</span>' +
        '<span class="stat-pill amber">~' + calories + ' kcal</span>' +
        '<span class="stat-pill green">~' + minutes + ' ' + minLabel + '</span>' +
        '</div>';
};

// Protein slider (eat.html)
window.updateProtein = function (value, output) {
    const weight = parseInt(value);
    const min = (weight * 1.6).toFixed(0);
    const max = (weight * 2.0).toFixed(0);
    const lang = window.I18N ? window.I18N.getLang() : "bg";
    const isEn = lang === "en";
    const label = isEn
        ? "protein per day for " + weight + "kg"
        : "протеин на ден за " + weight + "кг";

    output.innerHTML =
        '<div style="text-align:center; margin-top:12px;">' +
        '<div style="font-size:2rem; font-weight:800; color:#97C459;">' + min + '–' + max + 'г</div>' +
        '<div style="font-size:0.85rem; color:#888;">' + label + '</div>' +
        '</div>';
};
