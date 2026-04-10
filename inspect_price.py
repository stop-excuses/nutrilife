
import asyncio
from playwright.async_api import async_playwright
from bs4 import BeautifulSoup

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context()
        page = await context.new_page()
        url = 'https://www.broshura.bg/p/ocean-fish-pushena-syomga-v-kaufland-hipermarket-4272183'
        await page.goto(url)
        content = await page.content()
        soup = BeautifulSoup(content, 'html.parser')
        
        # Заглавие
        title = soup.select_one('h1')
        print(f"Title: {title.text if title else 'None'}")
        
        # Търсене на цени
        print("\n--- Price Search ---")
        price_tags = soup.select('.price, .new-price, [class*="price"], dt, dd, span')
        for tag in price_tags:
            text = tag.get_text(strip=True)
            if any(kw in text.lower() for kw in ['лв', 'цена']):
                print(f"Tag: {tag.name}, Class: {tag.get('class')}, Text: {text}")
                
        # Търсене на специфичния '47.00' лв
        if '47' in content:
            print("\n--- Found 47 in HTML ---")
            matches = soup.find_all(string=lambda s: '47' in s)
            for m in matches:
                print(f"Parent: {m.parent.name}, Class: {m.parent.get('class')}, Text: {m.strip()}")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
