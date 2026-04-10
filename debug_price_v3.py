
import asyncio
from playwright.async_api import async_playwright
from bs4 import BeautifulSoup

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context()
        page = await context.new_page()
        # Пробваме пак сьомгата, но може би линка е друг вече?
        # В offers.json името е "Ocean Fish Пушена сьомга в Kaufland хипермаркет"
        # Търсим линк за сьомга в Kaufland
        await page.goto('https://www.broshura.bg/h/80550-kaufland')
        await asyncio.sleep(5)
        content = await page.content()
        soup = BeautifulSoup(content, 'html.parser')
        
        # Печатаме всички линкове съдържащи /p/ за дебъг
        all_p_links = soup.find_all('a', href=lambda h: h and '/p/' in h)
        print(f"Found {len(all_p_links)} product links on Kaufland page.")
        for l in all_p_links[:10]:
             print(f"Link text: {l.get_text(strip=True)}, Href: {l.get('href')}")
        
        links = [l for l in all_p_links if 'сьомга' in l.get_text(strip=True).lower() or 'сьомга' in l.get('href').lower()]
        
        for l in links[:3]:
            href = l.get('href')
            full_url = 'https://www.broshura.bg' + href if href.startswith('/') else href
            print(f"\nChecking: {full_url}")
            await page.goto(full_url)
            p_content = await page.content()
            p_soup = BeautifulSoup(p_content, 'html.parser')
            print(f"Title: {p_soup.select_one('h1').get_text(strip=True)}")
            price_box = p_soup.select_one('.list-product-price')
            if price_box:
                print(f"Price Box Text: {price_box.get_text(strip=True)}")
            else:
                print("Price box .list-product-price not found")
                # Търсим други възможни места
                scripts = p_soup.find_all('script', type='application/ld+json')
                for s in scripts:
                    if 'Price' in s.string:
                        print(f"Found Price in JSON-LD: {s.string[:200]}...")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
