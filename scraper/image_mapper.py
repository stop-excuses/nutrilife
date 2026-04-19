import re

PLACEHOLDER_IMAGE = "https://upload.wikimedia.org/wikipedia/commons/thumb/6/65/No-Image-Placeholder.svg/200px-No-Image-Placeholder.svg.png"

KEYWORD_IMAGE_RULES = [
    ("консерва за кучета", "images/fallback-pet.svg"),
    ("консерва за котки", "images/fallback-pet.svg"),
    ("храна за кучета", "images/fallback-pet.svg"),
    ("храна за куче", "images/fallback-pet.svg"),
    ("храна за котки", "images/fallback-pet.svg"),
    ("храна за котка", "images/fallback-pet.svg"),
    ("кучешка храна", "images/fallback-pet.svg"),
    ("котешка храна", "images/fallback-pet.svg"),
    ("кърпи", "images/fallback-hygiene.svg"),
    ("кърпички", "images/fallback-hygiene.svg"),
    ("сапун", "images/fallback-hygiene.svg"),
    ("шампоан", "images/fallback-hygiene.svg"),
    ("балсам", "images/fallback-hygiene.svg"),
    ("душ гел", "images/fallback-hygiene.svg"),
    ("паста за зъби", "images/fallback-hygiene.svg"),
    ("четка за зъби", "images/fallback-hygiene.svg"),
    ("дезодорант", "images/fallback-hygiene.svg"),
    ("пелени", "images/fallback-hygiene.svg"),
    ("превръзки", "images/fallback-hygiene.svg"),
    ("тоалетна хартия", "images/fallback-household.svg"),
    ("прах за пране", "images/fallback-household.svg"),
    ("омекотител", "images/fallback-household.svg"),
    ("препарат", "images/fallback-household.svg"),
    ("почистващ", "images/fallback-household.svg"),
    ("дезинфектант", "images/fallback-household.svg"),
    ("таблетки за съдомиялна", "images/fallback-household.svg"),
    ("веро", "images/fallback-household.svg"),
    ("белина", "images/fallback-household.svg"),
    ("риба тон", "images/foods/tuna.svg"),
    ("сьомга", "images/foods/salmon.svg"),
    ("скумрия", "images/foods/mackerel.svg"),
    ("сельодка", "images/foods/sardines.svg"),
    ("херинга", "images/foods/sardines.svg"),
    ("пъстърва", "images/foods/salmon.svg"),
    ("ципура", "images/foods/fatty-fish.svg"),
    ("лаврак", "images/foods/fatty-fish.svg"),
    ("яйц", "images/foods/egg.svg"),
    ("извара", "images/foods/izvara.svg"),
    ("скир", "images/foods/skyr.svg"),
    ("cottage", "images/foods/cottage.svg"),
    ("кисело мляко", "images/foods/yogurt.svg"),
    ("йогурт", "images/foods/yogurt.svg"),
    ("сирене", "images/foods/cheese.svg"),
    ("моцарела", "images/foods/cheese.svg"),
    ("пилешки гърди", "images/foods/chicken.svg"),
    ("пилешко филе", "images/foods/chicken.svg"),
    ("пилешко", "images/foods/chicken.svg"),
    ("пуешко", "images/foods/turkey.svg"),
    ("телешко", "images/foods/beef.svg"),
    ("говеждо", "images/foods/beef.svg"),
    ("свинско", "images/foods/pork.svg"),
    ("кайма", "images/foods/mince.svg"),
    ("леща", "images/foods/lentils.svg"),
    ("нахут", "images/foods/chickpeas.svg"),
    ("боб", "images/foods/beans.svg"),
    ("фасул", "images/foods/beans.svg"),
    ("грах", "images/foods/peas.svg"),
    ("овесени ядки", "images/foods/oats.svg"),
    ("овес", "images/foods/oats.svg"),
    ("ориз", "images/foods/rice.svg"),
    ("булгур", "images/foods/bulgur.svg"),
    ("елда", "images/foods/buckwheat.svg"),
    ("кус кус", "images/foods/couscous.svg"),
    ("кускус", "images/foods/couscous.svg"),
    ("паста", "images/foods/pasta.svg"),
    ("спагети", "images/foods/pasta.svg"),
    ("хляб", "images/foods/bread.svg"),
    ("ръжен", "images/foods/rye-bread.svg"),
    ("картоф", "images/foods/potato.svg"),
    ("банан", "images/foods/banana.svg"),
    ("ябъл", "images/foods/apple.svg"),
    ("авокадо", "images/foods/avocado.svg"),
    ("бадем", "images/foods/almonds.svg"),
    ("орех", "images/foods/walnuts.svg"),
    ("кашу", "images/foods/nuts.svg"),
    ("фъст", "images/foods/peanuts.svg"),
    ("тахан", "images/foods/tahini.svg"),
    ("фъстъчено масло", "images/foods/peanut-butter.svg"),
    ("зехтин", "images/foods/olive-oil.svg"),
    ("маслини", "images/foods/olives.svg"),
    ("масло", "images/foods/butter.svg"),
    ("тофу", "images/foods/tofu.svg"),
]

CATEGORY_FALLBACKS = {
    "pet": "images/fallback-pet.svg",
    "hygiene": "images/fallback-hygiene.svg",
    "household": "images/fallback-household.svg",
    "protein": "images/foods/chicken.svg",
    "dairy": "images/foods/yogurt.svg",
    "canned": "images/foods/beans.svg",
    "legume": "images/foods/beans.svg",
    "grain": "images/foods/oats.svg",
    "fat": "images/foods/olive-oil.svg",
    "vegetable": "images/foods/apple.svg",
    "nuts": "images/foods/nuts.svg",
    "bread": "images/foods/bread.svg",
}


def has_real_image(image: str | None) -> bool:
    if not image:
        return False
    return PLACEHOLDER_IMAGE not in str(image)


def normalize_name(name: str | None) -> str:
    value = (name or "").lower()
    value = re.sub(r"\bсупер цена\b", " ", value)
    value = re.sub(r"\bпродукт,\s*маркиран\s*със\s*синя\s*звезда\b", " ", value)
    value = re.sub(r"\bпроизход\s*-\s*[а-яa-z]+\b", " ", value)
    value = re.sub(r"\bза\s+\d+([.,]\d+)?\s*кг\b", " ", value)
    value = re.sub(r"\b\d+([.,]\d+)?\s*(г|гр|кг|мл|л|бр|g|kg|ml)\b", " ", value)
    value = re.sub(r"\s+", " ", value).strip()
    return value


def get_local_product_image(name: str | None, category: str | None) -> str | None:
    name_lower = normalize_name(name)
    for keyword, image in KEYWORD_IMAGE_RULES:
        if keyword in name_lower:
            return image
    return CATEGORY_FALLBACKS.get(category or "")
