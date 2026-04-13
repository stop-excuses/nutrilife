"""Quick test: OCR on Lidl brochure from broshura.bg/b/5965899"""
import requests, re, sys
from bs4 import BeautifulSoup
from io import BytesIO

HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}

def get_brochure_image_urls(brochure_url):
    r = requests.get(brochure_url, headers=HEADERS, timeout=20)
    soup = BeautifulSoup(r.content, 'html.parser')
    urls = []
    for img in soup.select('img[src*="media.marktjagd"], img[data-src*="media.marktjagd"], img[src*="brochure"]'):
        src = img.get('data-src') or img.get('src','')
        if src and src not in urls:
            urls.append(src)
    # Also check for high-res versions via JS/srcset
    for img in soup.select('img[srcset]'):
        srcset = img.get('srcset','')
        parts = [p.strip().split(' ')[0] for p in srcset.split(',') if p.strip()]
        for p in parts:
            if 'marktjagd' in p and p not in urls:
                urls.append(p)
    return urls

def ocr_image(img_bytes):
    try:
        from rapidocr_onnxruntime import RapidOCR
        ocr = RapidOCR()
        from PIL import Image
        img = Image.open(BytesIO(img_bytes)).convert('RGB')
        result, _ = ocr(img)
        if not result:
            return []
        return [line[1] for line in result if line[1]]
    except ImportError:
        try:
            import pytesseract
            from PIL import Image
            img = Image.open(BytesIO(img_bytes))
            text = pytesseract.image_to_string(img, lang='bul+eng')
            return [l.strip() for l in text.splitlines() if l.strip()]
        except Exception as e:
            return [f"OCR_ERROR: {e}"]

def parse_price(text):
    m = re.search(r'(\d+[.,]\d{2})', text)
    return float(m.group(1).replace(',','.')) if m else None

def is_product_line(text):
    """Heuristic: product lines have a price or look like a product name."""
    if len(text) < 3 or len(text) > 80:
        return False
    if re.search(r'\d+[.,]\d{2}', text):
        return True
    # Looks like Bulgarian product name (has Cyrillic)
    cyrillic = sum(1 for c in text if '\u0400' <= c <= '\u04ff')
    return cyrillic / max(len(text),1) > 0.3

if __name__ == '__main__':
    print("=== Lidl OCR brochure test ===")
    brochure_url = 'https://broshura.bg/b/5965899'

    print(f"Fetching brochure page: {brochure_url}")
    img_urls = get_brochure_image_urls(brochure_url)
    print(f"Images found on page: {len(img_urls)}")

    if not img_urls:
        # Try to find images differently
        r = requests.get(brochure_url, headers=HEADERS, timeout=20)
        soup = BeautifulSoup(r.content, 'html.parser')
        all_imgs = soup.select('img')
        print(f"All img tags: {len(all_imgs)}")
        for img in all_imgs[:5]:
            print(f"  src={img.get('src','')[:80]} data-src={img.get('data-src','')[:80]}")

        # Try to find via JS/data attributes
        page_imgs = re.findall(r'https?://[^\s"\']+(?:\.jpg|\.webp|\.png)[^\s"\']*', r.text)
        print(f"URLs in source: {len(page_imgs)}")
        for u in page_imgs[:10]:
            print(f"  {u[:100]}")
        sys.exit(0)

    print(f"\nTesting OCR on first 3 pages...")
    all_lines = []
    products = []

    for i, url in enumerate(img_urls[:3]):
        # Get high-res version
        hires_url = re.sub(r'_\d+x\d+', '_600x800', url)
        print(f"\n  Page {i+1}: {hires_url[:80]}")

        try:
            resp = requests.get(hires_url, headers=HEADERS, timeout=30)
            if resp.status_code != 200:
                resp = requests.get(url, headers=HEADERS, timeout=30)
            lines = ocr_image(resp.content)
            print(f"  OCR lines: {len(lines)}")

            for j, line in enumerate(lines):
                all_lines.append(line)
                price = parse_price(line)
                if price and 0.5 < price < 100:
                    # Probably a price line — look for name in surrounding lines
                    name = lines[j-1] if j > 0 else ''
                    products.append({'name': name, 'price': price, 'line': line})
                    sys.stdout.buffer.write(f"    -> {name!r} | {price}\n".encode('utf-8','replace'))
        except Exception as e:
            print(f"  ERROR: {e}")

    print(f"\n=== RESULTS ===")
    print(f"Total OCR lines: {len(all_lines)}")
    print(f"Products detected: {len(products)}")
    print(f"\nSample lines (first 20):")
    for line in all_lines[:20]:
        sys.stdout.buffer.write(f"  {line!r}\n".encode('utf-8','replace'))
