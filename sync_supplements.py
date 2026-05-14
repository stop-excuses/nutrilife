import json
from pathlib import Path


SOURCE_PATH = Path("data/supplements.json")
OUTPUT_PATH = Path("data/supplements.js")


def main():
    data = json.loads(SOURCE_PATH.read_text(encoding="utf-8"))
    with OUTPUT_PATH.open("w", encoding="utf-8") as f:
        f.write("const SUPPLEMENTS_DATA = ")
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write(";")
    print(f"supplements.js : {data.get('total_supplements', len(data.get('supplements', [])))} records")


if __name__ == "__main__":
    main()
