import argparse
import json
import re
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
ACCEPT_SCORE_THRESHOLD = 30  # candidates below this are rejected (0-100)
DEFAULT_OFFERS_PATH = ROOT / "data" / "offers.json"
DEFAULT_OCR_PATH = ROOT / "data" / "hybrid_ocr_candidates.json"
DEFAULT_OUTPUT_PATH = ROOT / "data" / "hybrid_kaufland_output.json"


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def extract_offer_list(payload):
    if isinstance(payload, dict):
        if "offers" in payload and isinstance(payload["offers"], list):
            return payload["offers"]
        if "products" in payload and isinstance(payload["products"], list):
            return payload["products"]
    if isinstance(payload, list):
        return payload
    return []


def save_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)


def slugify(text):
    text = text.lower()
    text = re.sub(r"[^a-z0-9а-я]+", "-", text)
    text = re.sub(r"-{2,}", "-", text).strip("-")
    return text


def normalize_name(text):
    text = text.lower()
    replacements = {
        "зeneh": "зелен",
        "зeneha": "зелена",
        "kpactabhun": "краставици",
        "mopkobh": "моркови",
        "neuypku": "печурки",
        "aomath": "домати",
        "rotoboзо": "готово за",
        "cok": "сок",
        "връзка връзка": "връзка",
        "maako": "мляко",
        "macho": "масло",
        "lpouзxog": "произход",
        "pouзxog": "произход",
        "tbpuua": "турция",
        "ezunem": "египет",
        "frehona": "freshona",
        "combino": "Combino",
        "bonzapcka": "българска",
        "koзyhak": "козунак",
        "koзyha4eha": "козуначена",
        "cypobh": "сурови",
        "cypobn": "сурови",
        "opexobn": "орехови",
        "aakn": "ядки",
        "nnutka": "плитка",
        "cбopobhhkh": "боровинки",
        "canatac": "салата с",
        "bapeho": "варено",
        "aiue": "яйце",
        "arhewka": "агнешка",
        "arhewko": "агнешко",
        "arhewkm": "агнешки",
        "arhewkw": "агнешки",
        "arhewku": "агнешки",
        "cbmhcko": "свинско",
        "cbmhckm": "свинско",
        "cbnhcko": "свинско",
        "cbmhcka": "свинска",
        "cocorico": "пилешко",
        "macnmhobo": "маслиново",
        "kозуhаk": "козунак",
        "kозyhaк": "козунак",
        "kебаn": "кебап",
        "ke6аn": "кебап",
        "kебаnуеtа": "кебапчета",
        "kotnet": "котлет",
        "cyna": "супа",
        "byprep": "бургер",
        "hanokynka": "половинка",
        "necho": "прясно",
        "apoб": "дроб",
        "capma": "сарма",
        "opuз": "ориз",
        "tpaha": "",
        "rbбn": "",
        "meka": "мека",
        "fussili": "",
        "nwehuyeh": "пшеничен",
        "hemcko": "",
        "kpabe": "краве",
        "aella": "",
        "eбmuho": "",
        "bcby": "вкус",
        "fpeml": "ръжен",
        "pokeho": "ръжено",
    }
    for source, target in replacements.items():
        text = text.replace(source, target)
    text = re.sub(r"\bcombino\b", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"\bfreshona\b", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def clean_merge_name(text):
    text = normalize_name(text)
    text = re.sub(r"\b\d+[гgлlкkоo]{0,2}\b", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"\b(произход|египет|турция|кодраба|опаковка|цена|клас|акция|plus|евтино|мастър|клас|арен)\b", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"\b(leha|лев|лв|kg|бр)\b", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"\b(komepc|detelina|freshona|combino)\b", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"\s+", " ", text).strip(" -")
    words = []
    for token in text.split():
        if words and words[-1] == token:
            continue
        words.append(token)
    text = " ".join(words)
    return text


def name_tokens(text):
    return {token for token in slugify(text).split("-") if len(token) >= 3}


FOOD_HINTS = {
    "авокадо", "лук", "зелен", "краставици", "моркови", "печурки", "домати",
    "портокали", "ябълки", "круши", "спанак", "цвекло", "пюре", "сок",
    "мляко", "сирене", "кашкавал", "хляб", "грах", "царевица", "нахут",
    "боб", "извара", "кисело", "пиле", "телешки", "свински", "риба",
    "хайвер", "гауда", "едам", "лимони", "ягоди", "салата", "масло",
    "леща", "фузили", "паста", "ядки", "орех", "козунак", "ананас",
    "боровинки", "яйце", "агнешка", "дроб", "сарма", "ориз",
    "грозде", "канталупе", "пъпеш", "череша", "праскова", "кайсия",
    "вишна", "слива", "киви", "манго", "черни", "прясно", "кефир",
    "агнешко", "агнешки", "агнешка", "свинско", "маслиново",
    "пилешко", "кебап", "кебапчета", "котлет", "супа", "бургер", "хамбургер",
}

NON_FOOD_HINTS = {
    "букет", "лалета", "цветна", "слънчева", "декорация", "играчка",
    "саксия", "подарък", "лампа", "украса",
}


def is_likely_food(name):
    tokens = name_tokens(clean_merge_name(name))
    if tokens & NON_FOOD_HINTS:
        return False
    return bool(tokens & FOOD_HINTS)


def is_high_noise_name(name):
    normalized = clean_merge_name(name)
    if not normalized or len(normalized) < 5:
        return True
    tokens = [token for token in re.split(r"\s+", normalized) if token]
    if not tokens:
        return True
    if len(tokens) > 6:
        return True
    bad_patterns = (
        "ceptnon", "v中", "boxen", "snhdk", "hah", "yeha", "leha", "ezunem",
        "tbpuua", "lpou", "pouз", "fpeml", "fpaer",
    )
    if any(pattern in normalized for pattern in bad_patterns):
        return True
    low_quality_tokens = 0
    for token in tokens:
        if len(token) <= 2:
            low_quality_tokens += 1
            continue
        has_cyrillic = bool(re.search(r"[а-я]", token))
        has_latin = bool(re.search(r"[a-z]", token))
        if has_latin and not has_cyrillic and token.lower() not in {"hass", "freshona", "combino"}:
            low_quality_tokens += 1
    return low_quality_tokens >= max(2, len(tokens) // 2 + 1)


FOOD_CLUSTERS = {
    "fruit": {"ягоди", "лимони", "ананас", "портокали", "авокадо", "ябълки", "круши"},
    "veg": {"лук", "краставици", "моркови", "печурки", "домати", "спанак", "салата"},
    "dairy": {"мляко", "масло", "сирене", "кашкавал"},
    "legume": {"леща", "боб", "нахут", "грах"},
    "bakery": {"хляб", "козунак", "плитка"},
    "pasta": {"фузили", "паста"},
    "nuts": {"ядки", "орехови"},
    "meat": {"агнешка", "агнешко", "агнешки", "свинско", "пилешко", "дроб", "сарма", "яйце", "кебап", "котлет"},
}


def has_conflicting_food_clusters(name):
    tokens = name_tokens(clean_merge_name(name))
    matched = {cluster for cluster, cluster_tokens in FOOD_CLUSTERS.items() if tokens & cluster_tokens}
    allowed_pairs = {
        frozenset({"bakery", "meat"}),
        frozenset({"nuts", "fruit"}),
        frozenset({"veg", "fruit"}),
    }
    if len(matched) <= 1:
        return False
    if len(matched) == 2 and frozenset(matched) in allowed_pairs:
        return False
    return True


def score_ocr_candidate(name, confidence, ocr_score):
    """Score an OCR candidate from 0–100. Returns (score: int, reasons: dict).

    Component breakdown (max ~100):
      ocr_engine      0–27  raw OCR engine confidence × 27
      confidence_tier 0/15/25  low / medium / high
      food_hint       +15  name contains a known food keyword
      high_noise      -25  name fails noise heuristics
      conflicting_cls -20  name mixes incompatible food clusters
      name_too_short  -10  fewer than 2 meaningful words
      non_food_hint   -15  name contains a non-food keyword

    Threshold: ACCEPT_SCORE_THRESHOLD (default 40).
    """
    score = 0
    reasons = {}

    # OCR engine confidence (0–27 points)
    eng_pts = int(float(ocr_score) * 27)
    score += eng_pts
    reasons["ocr_engine"] = eng_pts

    # Confidence tier (8/15/25 points) — low is 8 not 0: OCR_REPLACEMENTS cover many low-score cases
    tier_pts = {"high": 25, "medium": 15, "low": 8}[confidence]
    score += tier_pts
    reasons["confidence_tier"] = tier_pts

    # Food relevance (+15)
    clean = clean_merge_name(name)
    tokens = name_tokens(clean)
    if tokens & FOOD_HINTS:
        score += 15
        reasons["food_hint"] = 15

    # Noise penalty: -10 if food keyword present, -25 if pure noise
    if is_high_noise_name(name):
        noise_penalty = -10 if (tokens & FOOD_HINTS) else -25
        score += noise_penalty
        reasons["high_noise"] = noise_penalty

    # Conflicting clusters penalty (-20)
    if has_conflicting_food_clusters(name):
        score -= 20
        reasons["conflicting_clusters"] = -20

    # Short name penalty (-10)
    words = [w for w in clean.split() if len(w) > 2]
    if len(words) < 2:
        score -= 10
        reasons["name_too_short"] = -10

    # Non-food hint penalty (-15)
    if tokens & NON_FOOD_HINTS:
        score -= 15
        reasons["non_food_hint"] = -15

    score = max(0, min(100, score))
    return score, reasons


def is_structured_match(ocr_candidate, structured_offer):
    if abs(ocr_candidate["new_price"] - structured_offer["new_price"]) > 0.02:
        return False
    ocr_tokens = name_tokens(ocr_candidate["name"])
    structured_tokens = name_tokens(structured_offer["name"])
    overlap = ocr_tokens & structured_tokens
    return len(overlap) >= 1


_CATEGORY_MAP = [
    # (tokens_set, category, emoji, health_score, diet_tags)
    ({"агнешко", "агнешки", "агнешка", "котлет", "кебап", "кебапчета"}, "protein", "🥩", 8, ["high_protein", "mediterranean"]),
    ({"свинско", "свинска"}, "protein", "🥩", 7, ["high_protein"]),
    ({"пилешко"}, "protein", "🐔", 9, ["high_protein", "keto"]),
    ({"риба", "хайвер"}, "protein", "🐟", 10, ["high_protein", "keto", "mediterranean"]),
    ({"яйце"}, "protein", "🥚", 9, ["high_protein", "keto", "vegetarian"]),
    ({"козунак"}, "grain", "🍞", 4, ["vegetarian"]),
    ({"мляко"}, "dairy", "🥛", 7, ["vegetarian"]),
    ({"сирене", "кашкавал"}, "dairy", "🧀", 7, ["vegetarian", "high_protein"]),
    ({"маслиново", "зехтин"}, "fat", "🫒", 10, ["keto", "mediterranean"]),
    ({"авокадо"}, "fat", "🥑", 10, ["keto", "mediterranean", "vegetarian"]),
    ({"лук", "краставици", "домати", "спанак", "салата", "моркови", "печурки", "цвекло"}, "vegetable", "🥗", 8, ["vegetarian", "mediterranean"]),
    ({"ябълки", "круши", "ананас", "манго", "портокали", "лимони", "ягоди", "боровинки", "канталупе", "пъпеш", "грозде"}, "vegetable", "🍎", 8, ["vegetarian"]),
    ({"леща", "нахут", "боб"}, "legume", "🫘", 9, ["vegetarian", "high_protein", "budget"]),
    ({"ориз", "хляб", "паста", "фузили"}, "grain", "🌾", 6, ["vegetarian", "budget"]),
    ({"ядки", "орехови"}, "nuts", "🥜", 9, ["keto", "vegetarian"]),
    ({"сок"}, "canned", "🧃", 5, ["vegetarian"]),
]


def infer_category(name):
    tokens = name_tokens(clean_merge_name(name))
    for token_set, category, emoji, health_score, diet_tags in _CATEGORY_MAP:
        if tokens & token_set:
            return category, emoji, health_score, diet_tags
    return "other", "🛒", 5, []


def build_ocr_offer(page_number, candidate, store_name):
    normalized_name = clean_merge_name(candidate["name"])
    # Confidence is derived from OCR engine score only.
    # Word count is evaluated separately in score_ocr_candidate.
    confidence = "medium"
    if candidate["score"] >= 0.95:
        confidence = "high"
    elif candidate["score"] < 0.8:
        confidence = "low"

    category, emoji, health_score, diet_tags = infer_category(normalized_name)

    return {
        "id": f"ocr-{store_name.lower()}-{page_number}-{slugify(candidate['name'])[:40]}-{str(candidate['price']).replace('.', '-')}",
        "store": store_name,
        "name": normalized_name,
        "emoji": emoji,
        "category": category,
        "new_price": candidate["price"],
        "old_price": None,
        "discount_pct": None,
        "valid_until": None,
        "health_score": health_score,
        "diet_tags": diet_tags,
        "weight_raw": None,
        "weight_grams": 0,
        "price_per_kg": None,
        "shelf_life": "малотраен",
        "is_bulk_worthy": False,
        "image": candidate.get("image_url"),
        "source": "ocr",
        "confidence": confidence,
        "ocr_score": candidate["score"],
        "ocr_page": page_number,
        "ocr_raw_name": candidate.get("raw_name"),
        "ocr_price_text": candidate.get("price_text"),
    }


def run_ocr_extractor(brochure_url, pages, ocr_json_out):
    command = [
        sys.executable,
        str(Path(__file__).resolve().parent / "tesseract_ocr.py"),
        "--brochure-url",
        brochure_url,
        "--json-out",
        str(ocr_json_out),
        "--scale",
        "2",
        "--min-score",
        "0.55",
    ]
    if pages:
        command.extend(["--pages", *[str(page) for page in pages]])
    else:
        command.append("--all-pages")
    subprocess.run(command, check=True)


def merge_offers(structured_offers, ocr_payload, store_name):
    structured = [
        offer for offer in structured_offers
        if offer.get("store") == store_name and offer.get("source", "structured") == "structured"
    ]
    merged = []
    rejected_items = []
    matched_structured_ids = set()

    for offer in structured:
        merged_offer = dict(offer)
        merged_offer["source"] = "structured"
        merged_offer["confidence"] = "high"
        merged.append(merged_offer)

    total_ocr_candidates = 0
    accepted_ocr_candidates = 0

    for page in ocr_payload["pages"]:
        page_candidates = page.get("product_candidates", [])
        total_ocr_candidates += len(page_candidates)

        for candidate in page_candidates:
            ocr_offer = build_ocr_offer(page["page"], candidate, store_name)
            ocr_offer["is_non_food_hint"] = candidate.get("is_non_food_hint", False)

            cand_score, reasons = score_ocr_candidate(
                ocr_offer["name"],
                ocr_offer["confidence"],
                candidate["score"],
            )
            ocr_offer["candidate_score"] = cand_score
            ocr_offer["score_reasons"] = reasons

            _UNICODE_QUOTES = "\u201c\u201d\u201e\u00ab\u00bb\u2018\u2019"
            _BAD_OCR = re.compile(
                r'onako6bka|butpuha|подпрабвка|[а-я][' + _UNICODE_QUOTES + r']'
                r'|^[а-я]\s*\+\s|картофи от["\u201d]\s*$',
                re.IGNORECASE
            )
            if (cand_score < ACCEPT_SCORE_THRESHOLD
                    or (ocr_offer["name"] and ocr_offer["name"][0] in _UNICODE_QUOTES)
                    or (ocr_offer["name"] and _BAD_OCR.search(ocr_offer["name"]))):
                rejected_items.append({
                    "name": ocr_offer["name"],
                    "raw_name": candidate.get("raw_name"),
                    "price": ocr_offer["new_price"],
                    "page": page["page"],
                    "candidate_score": cand_score,
                    "score_reasons": reasons,
                    "ocr_score": candidate["score"],
                    "confidence": ocr_offer["confidence"],
                })
                continue

            accepted_ocr_candidates += 1

            matched = False
            for structured_offer in structured:
                if is_structured_match(ocr_offer, structured_offer):
                    matched_structured_ids.add(structured_offer["id"])
                    matched = True
                    break

            if not matched:
                merged.append(ocr_offer)

    print(f"[merge_offers] total_ocr_candidates={total_ocr_candidates}", flush=True)
    print(f"[merge_offers] accepted_after_scoring={accepted_ocr_candidates}", flush=True)
    print(f"[merge_offers] rejected_after_scoring={len(rejected_items)}", flush=True)
    print(f"[merge_offers] structured_matches={len(matched_structured_ids)}", flush=True)
    print(f"[merge_offers] merged_before_dedup={len(merged)}", flush=True)

    def merge_tokens(name):
        return {t for t in re.split(r"[\s\-]+", clean_merge_name(name)) if len(t) >= 3}

    def should_merge_offers(existing, incoming):
        if existing.get("store") != incoming.get("store"):
            return False

        try:
            price_existing = float(existing.get("new_price", 0))
            price_incoming = float(incoming.get("new_price", 0))
        except (TypeError, ValueError):
            return False

        if abs(price_existing - price_incoming) > 1.50:
            return False

        name_existing = clean_merge_name(existing.get("name", ""))
        name_incoming = clean_merge_name(incoming.get("name", ""))

        if not name_existing or not name_incoming:
            return False

        tokens_existing = merge_tokens(existing.get("name", ""))
        tokens_incoming = merge_tokens(incoming.get("name", ""))

        if not tokens_existing or not tokens_incoming:
            return False

        if len(tokens_existing) == 1 and len(tokens_incoming) == 1:
            return tokens_existing == tokens_incoming

        shared = tokens_existing & tokens_incoming
        if len(shared) < 2:
            return False

        overlap_existing = len(shared) / max(1, len(tokens_existing))
        overlap_incoming = len(shared) / max(1, len(tokens_incoming))

        return overlap_existing >= 0.6 and overlap_incoming >= 0.6

    deduped = []
    for offer in merged:
        replaced = False

        for i, current in enumerate(deduped):
            if not should_merge_offers(current, offer):
                continue

            if offer.get("source") == "structured" and current.get("source") != "structured":
                deduped[i] = offer
            elif offer.get("source") != "structured" and current.get("source") == "structured":
                pass
            elif float(offer.get("ocr_score", 0)) > float(current.get("ocr_score", 0)):
                deduped[i] = offer

            replaced = True
            break

        if not replaced:
            deduped.append(offer)

    print(f"[merge_offers] merged_after_dedup={len(deduped)}", flush=True)

    deduped.sort(key=lambda item: (item["source"] != "structured", item["new_price"], item["name"]))
    return deduped, matched_structured_ids, rejected_items


def parse_args():
    parser = argparse.ArgumentParser(description="Merge structured offers with brochure OCR candidates.")
    parser.add_argument("--brochure-url", required=True)
    parser.add_argument("--store", default="Kaufland")
    parser.add_argument("--pages", nargs="*", type=int)
    parser.add_argument("--offers-json", default=str(DEFAULT_OFFERS_PATH))
    parser.add_argument("--ocr-json-out", default=str(DEFAULT_OCR_PATH))
    parser.add_argument("--ocr-input", default=None, help="Skip OCR, load candidates from this JSON file")
    parser.add_argument("--output-json", default=str(DEFAULT_OUTPUT_PATH))
    return parser.parse_args()


def main():
    args = parse_args()
    offers_path = Path(args.offers_json)
    ocr_json_out = Path(args.ocr_json_out)
    output_json = Path(args.output_json)

    offers_payload = load_json(offers_path)
    structured_offers = extract_offer_list(offers_payload)
    if args.ocr_input:
        ocr_payload = load_json(Path(args.ocr_input))
    else:
        run_ocr_extractor(args.brochure_url, args.pages, ocr_json_out)
        ocr_payload = load_json(ocr_json_out)
    merged_offers, matched_structured_ids, rejected_items = merge_offers(
        structured_offers, ocr_payload, args.store
    )

    ocr_added = [o for o in merged_offers if o.get("source") == "ocr"]
    payload = {
        "generated_from": {
            "brochure_url": args.brochure_url,
            "store": args.store,
            "pages": args.pages or "all",
            "accept_score_threshold": ACCEPT_SCORE_THRESHOLD,
        },
        "structured_count": len([
            o for o in structured_offers
            if o.get("store") == args.store and o.get("source", "structured") == "structured"
        ]),
        "ocr_page_count": len(ocr_payload["pages"]),
        "ocr_candidate_count": sum(len(p["product_candidates"]) for p in ocr_payload["pages"]),
        "matched_structured_count": len(matched_structured_ids),
        "ocr_accepted_count": len(ocr_added),
        "ocr_rejected_count": len(rejected_items),
        "merged_offer_count": len(merged_offers),
        "offers": merged_offers,
        "rejected_items": rejected_items,
    }
    save_json(output_json, payload)

    # Also write rejected items to a separate debug file for easy inspection
    rejected_path = output_json.parent / (output_json.stem + "_rejected.json")
    save_json(rejected_path, {
        "store": args.store,
        "accept_score_threshold": ACCEPT_SCORE_THRESHOLD,
        "rejected_count": len(rejected_items),
        "rejected_items": sorted(rejected_items, key=lambda x: -x["candidate_score"]),
    })

    print(f"Saved merged output -> {output_json}")
    print(f"Saved rejected items -> {rejected_path}")
    print(f"Structured offers  : {payload['structured_count']}")
    print(f"OCR candidates     : {payload['ocr_candidate_count']}")
    print(f"  accepted         : {payload['ocr_accepted_count']}")
    print(f"  rejected         : {payload['ocr_rejected_count']}")
    print(f"Structured matched : {payload['matched_structured_count']}")
    print(f"Merged total       : {payload['merged_offer_count']}")


if __name__ == "__main__":
    main()
