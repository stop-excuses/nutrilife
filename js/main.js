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
    initTracker();
    initVisitorCounter();
});

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
    const langBtn = document.createElement("button");
    langBtn.className = "lang-toggle";
    langBtn.id = "lang-toggle";
    langBtn.setAttribute("aria-label", "Switch language");
    wrapper.appendChild(langBtn);

    langBtn.addEventListener("click", () => {
        if (!window.I18N) return;
        const next = window.I18N.getLang() === "bg" ? "en" : "bg";
        window.I18N.setLang(next);
        langBtn.textContent = next === "bg" ? "EN" : "BG";
        document.querySelectorAll("input[type='range']").forEach(slider => {
            const output = document.getElementById(slider.dataset.output);
            if (output && slider.dataset.fn && window[slider.dataset.fn]) {
                window[slider.dataset.fn](slider.value, output);
            }
        });
    });

    langBtn.textContent = (window.I18N ? window.I18N.getLang() : "bg") === "bg" ? "EN" : "BG";
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
