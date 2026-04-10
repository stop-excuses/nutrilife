
import asyncio
from playwright.async_api import async_playwright
from bs4 import BeautifulSoup

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context()
        page = await context.new_page()
        
        url = 'https://www.broshura.bg/b/5965899' # Лидл
        print(f"Checking {url}...")
        await page.goto(url, wait_until="networkidle")
        await asyncio.sleep(7)
        
        # Скролваме бавно за да зареди
        for _ in range(5):
             await page.evaluate("window.scrollBy(0, 1000)")
             await asyncio.sleep(2)
             
        content = await page.content()
        soup = BeautifulSoup(content, 'html.parser')
        
        # Търсим ВСИЧКИ линкове
        all_links = soup.find_all('a', href=True)
        print(f"Total links found: {len(all_links)}")
        
        # Търсим линкове съдържащи /p/
        p_links = [l for l in all_links if '/p/' in l.get('href')]
        print(f"Product links (/p/): {len(p_links)}")
        
        if p_links:
            for l in p_links[:5]:
                print(f"Example product: {l.get_text(strip=True)} -> {l.get('href')}")
        else:
             print("No product links found. Let's look for titles that might have links inside.")
             # Може би линковете са в някакъв JS обект или data attributes
             
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
