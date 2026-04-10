
import asyncio
from playwright.async_api import async_playwright
from bs4 import BeautifulSoup

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context()
        page = await context.new_page()
        
        # Тестваме Lidl
        url = 'https://www.broshura.bg/h/80669-lidl'
        print(f"Checking {url}...")
        await page.goto(url, wait_until="domcontentloaded")
        await asyncio.sleep(5)
        
        content = await page.content()
        soup = BeautifulSoup(content, 'html.parser')
        
        # Търсим линкове с /p/
        p_links = soup.find_all('a', href=lambda h: h and '/p/' in h)
        print(f"Found {len(p_links)} product links.")
        if p_links:
            print(f"Example: {p_links[0].get('href')} - {p_links[0].get_text(strip=True)[:50]}")
            
        # Търсим оферти по класове
        offer_cards = soup.select('.wrapper-offer-primary, .offer-card, [class*="offer"]')
        print(f"Found {len(offer_cards)} elements with potential offer classes.")

        # Търсим линкове към брошури
        b_links = soup.find_all('a', href=lambda h: h and '/b/' in h)
        print(f"Found {len(b_links)} brochure links.")
        for b in b_links[:3]:
            print(f"Brochure: {b.get('href')}")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
