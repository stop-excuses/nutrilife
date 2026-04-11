import argparse
import json
import re
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
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
    "meat": {"агнешка", "дроб", "сарма", "яйце"},
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


def is_structured_match(ocr_candidate, structured_offer):
    if abs(ocr_candidate["new_price"] - structured_offer["new_price"]) > 0.02:
        return False
    ocr_tokens = name_tokens(ocr_candidate["name"])
    structured_tokens = name_tokens(structured_offer["name"])
    overlap = ocr_tokens & structured_tokens
    return len(overlap) >= 1


def build_ocr_offer(page_number, candidate, store_name):
    normalized_name = clean_merge_name(candidate["name"])
    confidence = "medium"
    if candidate["score"] >= 0.95 and len(normalized_name.split()) >= 2:
        confidence = "high"
    elif candidate["score"] < 0.8 or len(normalized_name.split()) <= 1:
        confidence = "low"

    return {
        "id": f"ocr-{store_name.lower()}-{page_number}-{slugify(candidate['name'])[:40]}-{str(candidate['price']).replace('.', '-')}",
        "store": store_name,
        "name": normalized_name,
        "new_price": candidate["price"],
        "old_price": None,
        "discount_pct": None,
        "valid_until": None,
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
    matched_structured_ids = set()

    for offer in structured:
        merged_offer = dict(offer)
        merged_offer["source"] = "structured"
        merged_offer["confidence"] = "high"
        merged.append(merged_offer)

    for page in ocr_payload["pages"]:
        for candidate in page["product_candidates"]:
            ocr_offer = build_ocr_offer(page["page"], candidate, store_name)
            if ocr_offer["confidence"] == "low":
                continue
            if is_high_noise_name(ocr_offer["name"]):
                continue
            # NOTE: is_likely_food() check REMOVED — we now include ALL products.
            # Non-food items are tagged via is_non_food_hint and classified downstream.
            # Only reject if conflicting food clusters (indicates OCR garbage)
            if has_conflicting_food_clusters(ocr_offer["name"]):
                continue

            # Carry soft non-food hint through
            ocr_offer["is_non_food_hint"] = candidate.get("is_non_food_hint", False)

            matched = False
            for structured_offer in structured:
                if is_structured_match(ocr_offer, structured_offer):
                    matched_structured_ids.add(structured_offer["id"])
                    matched = True
                    break
            if not matched:
                merged.append(ocr_offer)

    deduped = []
    seen = {}
    for offer in merged:
        key = (offer["store"], clean_merge_name(offer["name"]), round(float(offer["new_price"]), 2))
        current = seen.get(key)
        if current is None:
            seen[key] = offer
            continue
        if offer.get("source") == "structured" and current.get("source") != "structured":
            seen[key] = offer
            continue
        if float(offer.get("ocr_score", 0)) > float(current.get("ocr_score", 0)):
            seen[key] = offer

    deduped.extend(seen.values())

    deduped.sort(key=lambda item: (item["source"] != "structured", item["new_price"], item["name"]))
    return deduped, matched_structured_ids


def parse_args():
    parser = argparse.ArgumentParser(description="Merge structured offers with brochure OCR candidates.")
    parser.add_argument("--brochure-url", required=True)
    parser.add_argument("--store", default="Kaufland")
    parser.add_argument("--pages", nargs="*", type=int)
    parser.add_argument("--offers-json", default=str(DEFAULT_OFFERS_PATH))
    parser.add_argument("--ocr-json-out", default=str(DEFAULT_OCR_PATH))
    parser.add_argument("--output-json", default=str(DEFAULT_OUTPUT_PATH))
    return parser.parse_args()


def main():
    args = parse_args()
    offers_path = Path(args.offers_json)
    ocr_json_out = Path(args.ocr_json_out)
    output_json = Path(args.output_json)

    offers_payload = load_json(offers_path)
    structured_offers = extract_offer_list(offers_payload)
    run_ocr_extractor(args.brochure_url, args.pages, ocr_json_out)
    ocr_payload = load_json(ocr_json_out)
    merged_offers, matched_structured_ids = merge_offers(structured_offers, ocr_payload, args.store)

    payload = {
        "generated_from": {
            "brochure_url": args.brochure_url,
            "store": args.store,
            "pages": args.pages or "all",
        },
        "structured_count": len([offer for offer in structured_offers if offer.get("store") == args.store and offer.get("source", "structured") == "structured"]),
        "ocr_page_count": len(ocr_payload["pages"]),
        "ocr_candidate_count": sum(len(page["product_candidates"]) for page in ocr_payload["pages"]),
        "matched_structured_count": len(matched_structured_ids),
        "merged_offer_count": len(merged_offers),
        "offers": merged_offers,
    }
    save_json(output_json, payload)
    print(f"Saved merged output to {output_json}")
    print(f"Structured offers: {payload['structured_count']}")
    print(f"OCR candidates: {payload['ocr_candidate_count']}")
    print(f"Structured matched by OCR: {payload['matched_structured_count']}")
    print(f"Merged offers total: {payload['merged_offer_count']}")


if __name__ == "__main__":
    main()
