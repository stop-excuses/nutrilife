/**
 * Re-classify existing offers data with updated rules.
 * Run: node scripts/reclassify.js
 */
const fs = require("fs");
const path = require("path");
const BGN_TO_EUR = 1.95583;

const dataPath = path.join(__dirname, "..", "data", "offers.js");
let js = fs.readFileSync(dataPath, "utf8").replace("const OFFERS_DATA", "var OFFERS_DATA");
eval(js);

// --- Classification rules (mirror scraper.py) ---
const FOOD_KW = [
    "яйц", "пилешк", "пиле", "риба тон", "сьомга", "скумрия",
    "говежд", "свинск", "агнешк", "пуешк", "телешк",
    "месо", "мляно", "филе", "кайма", "бут", "стек",
    "шунка", "кренвирш", "наденица", "салам", "луканка",
    "риба", "скарида", "калмар", "сельодка", "херинга",
    "кисело мляко", "мляко", "извара", "скир", "сирене",
    "кашкавал", "масло", "маскарпоне", "бри", "едам", "гауда", "моцарела", "пармезан",
    "овес", "овесен", "леща", "боб", "нахут", "фасул",
    "ориз", "хляб", "брашно", "макарон", "спагети", "царевица", "грах",
    "орех", "бадем", "кашу", "ядки", "зехтин",
    "фъстък", "лешник", "слънчоглед",
    "картоф", "банан", "ябълк", "морков", "домат", "краставиц",
    "спанак", "броколи", "зеленчук", "салат", "лук", "чесн",
    "чушк", "тиквичк", "зеле", "цвекло",
    "портокал", "лимон", "мандарин", "грозде", "ягод", "диня",
    "консерв", "пюре", "сок", "хайвер", "маслин", "мед", "кафе", "чай",
    "храна", "хран",
];

const NOT_FOOD_KW = [
    "храна за кучета", "храна за котки", "храна за куче", "храна за котка",
    "храна за домашни", "храна за животни", "храна за птици",
    "термочаш", "чаш", "бюро", "одеяло", "възглавниц", "чанта",
    "матрак", "стол", "маса", "рафт", "шкаф", "лампа",
    "препарат", "перилен", "омекотител", "диван",
];

const JUNK_KW = [
    "кола", "cola", "pepsi", "фанта", "спрайт",
    "вафл", "шоколад", "бонбон", "гуми", "желе",
    "чипс", "снак", "крекер", "пуканки",
    "торта", "сладкиш", "кекс", "мъфин",
    "газирана", "енергийна напитка", "сладолед", "пудинг",
];

// Only truly bad processed: hot dogs, industrial sausage
const PROCESSED_KW = ["кренвирш", "наденица", "салам"];

const MACROS = {
    "яйц": {kcal:155,p:13,f:11,c:1.1}, "пилешк": {kcal:165,p:31,f:3.6,c:0},
    "пиле": {kcal:165,p:31,f:3.6,c:0}, "пуешк": {kcal:189,p:29,f:7,c:0},
    "говежд": {kcal:250,p:26,f:15,c:0}, "свинск": {kcal:242,p:27,f:14,c:0},
    "агнешк": {kcal:294,p:25,f:21,c:0}, "телешк": {kcal:172,p:24,f:8,c:0},
    "кайма": {kcal:250,p:18,f:20,c:0}, "стек": {kcal:271,p:26,f:18,c:0},
    "бут": {kcal:160,p:20,f:9,c:0}, "филе": {kcal:110,p:23,f:2,c:0},
    "мляно": {kcal:250,p:18,f:20,c:0},
    "шунка": {kcal:145,p:21,f:6,c:1.5}, "кренвирш": {kcal:257,p:12,f:22,c:3},
    "наденица": {kcal:300,p:14,f:26,c:2}, "салам": {kcal:336,p:13,f:30,c:3},
    "луканка": {kcal:410,p:22,f:35,c:1}, "шпек": {kcal:300,p:15,f:25,c:2},
    "риба тон": {kcal:132,p:28,f:0.6,c:0}, "сьомга": {kcal:208,p:20,f:13,c:0},
    "скумрия": {kcal:205,p:18,f:14,c:0}, "риба": {kcal:136,p:20,f:6,c:0},
    "скарида": {kcal:99,p:24,f:0.3,c:0.2}, "калмар": {kcal:92,p:15.6,f:1.4,c:3.1},
    "сельодка": {kcal:158,p:18,f:9,c:0}, "херинга": {kcal:158,p:18,f:9,c:0},
    "хайвер": {kcal:264,p:25,f:18,c:0},
    "кисело мляко": {kcal:61,p:3.5,f:3.3,c:4.7}, "мляко": {kcal:60,p:3.2,f:3.2,c:4.8},
    "извара": {kcal:98,p:11,f:4,c:3.4}, "скир": {kcal:66,p:11,f:0.2,c:4},
    "сирене": {kcal:264,p:14,f:22,c:2}, "кашкавал": {kcal:350,p:25,f:27,c:1},
    "масло": {kcal:717,p:0.9,f:81,c:0.1}, "маскарпоне": {kcal:429,p:4.8,f:44,c:3.5},
    "бри": {kcal:334,p:21,f:28,c:0.5}, "едам": {kcal:357,p:25,f:28,c:1.4},
    "гауда": {kcal:356,p:25,f:27,c:2.2}, "моцарела": {kcal:280,p:28,f:17,c:3.1},
    "пармезан": {kcal:431,p:38,f:29,c:4.1},
    "овес": {kcal:389,p:16.9,f:6.9,c:66}, "овесен": {kcal:389,p:16.9,f:6.9,c:66},
    "ориз": {kcal:130,p:2.7,f:0.3,c:28}, "хляб": {kcal:265,p:9,f:3.2,c:49},
    "брашно": {kcal:364,p:10,f:1,c:76}, "макарон": {kcal:131,p:5,f:1.1,c:25},
    "спагети": {kcal:131,p:5,f:1.1,c:25},
    "леща": {kcal:116,p:9,f:0.4,c:20}, "боб": {kcal:139,p:9,f:0.5,c:25},
    "нахут": {kcal:164,p:8.9,f:2.6,c:27}, "фасул": {kcal:127,p:8.7,f:0.5,c:22},
    "царевица": {kcal:86,p:3.3,f:1.4,c:19}, "грах": {kcal:81,p:5.4,f:0.4,c:14},
    "орех": {kcal:654,p:15,f:65,c:14}, "бадем": {kcal:579,p:21,f:49,c:22},
    "кашу": {kcal:553,p:18,f:44,c:30}, "фъстък": {kcal:567,p:25,f:49,c:16},
    "лешник": {kcal:628,p:15,f:61,c:17}, "слънчоглед": {kcal:584,p:21,f:51,c:20},
    "ядки": {kcal:607,p:20,f:54,c:20},
    "зехтин": {kcal:884,p:0,f:100,c:0}, "маслин": {kcal:115,p:0.8,f:11,c:6},
    "броколи": {kcal:34,p:2.8,f:0.4,c:7}, "спанак": {kcal:23,p:2.9,f:0.4,c:3.6},
    "домат": {kcal:18,p:0.9,f:0.2,c:3.9}, "краставиц": {kcal:15,p:0.7,f:0.1,c:3.6},
    "картоф": {kcal:77,p:2,f:0.1,c:17}, "морков": {kcal:41,p:0.9,f:0.2,c:10},
    "лук": {kcal:40,p:1.1,f:0.1,c:9.3}, "чесн": {kcal:149,p:6.4,f:0.5,c:33},
    "чушк": {kcal:31,p:1,f:0.3,c:6}, "тиквичк": {kcal:17,p:1.2,f:0.3,c:3.1},
    "зеле": {kcal:25,p:1.3,f:0.1,c:6}, "цвекло": {kcal:43,p:1.6,f:0.2,c:10},
    "салат": {kcal:15,p:1.4,f:0.2,c:2.9}, "авокадо": {kcal:160,p:2,f:15,c:9},
    "банан": {kcal:89,p:1.1,f:0.3,c:23}, "ябълк": {kcal:52,p:0.3,f:0.2,c:14},
    "портокал": {kcal:47,p:0.9,f:0.1,c:12}, "лимон": {kcal:29,p:1.1,f:0.3,c:9},
    "мандарин": {kcal:53,p:0.8,f:0.3,c:13}, "грозде": {kcal:69,p:0.7,f:0.2,c:18},
    "ягод": {kcal:32,p:0.7,f:0.3,c:7.7}, "диня": {kcal:30,p:0.6,f:0.2,c:7.6},
    "мед": {kcal:304,p:0.3,f:0,c:82}, "консерв": {kcal:100,p:15,f:3,c:2},
    "пюре": {kcal:82,p:1.8,f:4,c:11},
};

function match(name, list) {
    const n = name.toLowerCase();
    return list.some(kw => n.includes(kw));
}

function getMacros(name) {
    const n = name.toLowerCase();
    const sorted = Object.entries(MACROS).sort((a, b) => b[0].length - a[0].length);
    for (const [kw, m] of sorted) {
        if (n.includes(kw)) return m;
    }
    return null;
}

function bgnToEur(value) {
    if (value == null) return null;
    return Number((value / BGN_TO_EUR).toFixed(2));
}

// --- Reclassify ---
let fixed = 0;
OFFERS_DATA.offers.forEach(o => {
    const food = !match(o.name, NOT_FOOD_KW) && match(o.name, FOOD_KW);
    const junk = match(o.name, JUNK_KW);
    const processed = match(o.name, PROCESSED_KW);
    const healthy = food && !junk && !processed;

    if (o.is_food !== food || o.is_healthy !== healthy || o.is_junk !== junk) fixed++;

    o.is_food = food;
    o.is_junk = junk;
    o.is_healthy = healthy;

    // Fix health score
    if (!food) {
        o.health_score = null;
    } else if (junk) {
        o.health_score = Math.floor(Math.random() * 3) + 1;
    } else if (processed) {
        o.health_score = Math.floor(Math.random() * 2) + 3; // 3-4
    }

    o.macros = food && healthy ? getMacros(o.name) : null;
    o.new_price_eur = bgnToEur(o.new_price);
    o.old_price_eur = bgnToEur(o.old_price);
    o.price_per_kg_eur = bgnToEur(o.price_per_kg);
    delete o.macros_source;
    delete o.nutriscore;
});

const byNameStore = new Map();
for (const offer of OFFERS_DATA.offers) {
    const key = `${offer.name.trim().toLowerCase()}__${offer.store}`;
    const existing = byNameStore.get(key);
    if (!existing || offer.new_price < existing.new_price) {
        byNameStore.set(key, offer);
    }
}

const availableByName = new Map();
const bestByName = new Map();
for (const offer of byNameStore.values()) {
    const normalized = offer.name.trim().toLowerCase();
    if (!availableByName.has(normalized)) availableByName.set(normalized, new Set());
    availableByName.get(normalized).add(offer.store);

    const existing = bestByName.get(normalized);
    if (!existing || offer.new_price < existing.new_price) {
        bestByName.set(normalized, offer);
    }
}

OFFERS_DATA.offers = Array.from(bestByName.entries()).map(([normalized, offer]) => ({
    ...offer,
    available_stores: Array.from(availableByName.get(normalized)).sort()
})).sort((a, b) => {
    const ah = a.health_score || 0;
    const bh = b.health_score || 0;
    if (bh !== ah) return bh - ah;
    return a.new_price - b.new_price;
});
OFFERS_DATA.total_offers = OFFERS_DATA.offers.length;
OFFERS_DATA.stores = Array.from(new Set(OFFERS_DATA.offers.map(o => o.store))).sort();

// --- Write output ---
const jsonPath = path.join(__dirname, "..", "data", "offers.json");
const jsPath = path.join(__dirname, "..", "data", "offers.js");
const output = JSON.stringify(OFFERS_DATA, null, 2);

fs.writeFileSync(jsonPath, output, "utf8");
fs.writeFileSync(jsPath, "const OFFERS_DATA = " + output + ";", "utf8");

// --- Report ---
const offers = OFFERS_DATA.offers;
console.log(`Reclassified ${fixed} products`);
console.log(`Food: ${offers.filter(o => o.is_food).length}`);
console.log(`Healthy: ${offers.filter(o => o.is_healthy).length}`);
console.log(`Processed (not healthy): ${offers.filter(o => o.is_food && !o.is_healthy && !o.is_junk).length}`);
console.log(`Junk: ${offers.filter(o => o.is_junk).length}`);
console.log(`Non-food: ${offers.filter(o => !o.is_food).length}`);
console.log(`With macros: ${offers.filter(o => o.macros).length}`);

console.log("\n--- Healthy ---");
offers.filter(o => o.is_healthy).forEach(o =>
    console.log(`  [${o.health_score}/10] ${o.name.substring(0, 55)}`)
);

console.log("\n--- Processed (food, not healthy) ---");
offers.filter(o => o.is_food && !o.is_healthy && !o.is_junk).forEach(o =>
    console.log(`  [${o.health_score}/10] ${o.name.substring(0, 55)}`)
);

console.log("\n--- Non-food (excluded) ---");
offers.filter(o => !o.is_food).forEach(o =>
    console.log(`  ${o.name.substring(0, 55)}`)
);
