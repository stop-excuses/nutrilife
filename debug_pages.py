
import asyncio
from playwright.async_api import async_playwright
from bs4 import BeautifulSoup

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()
        
        # Примерна брошура на Lidl
        url = 'https://www.broshura.bg/b/5965899#page-1'
        print(f"Opening brochure: {url}")
        await page.goto(url, wait_until="networkidle")
        await asyncio.sleep(5)
        
        # 1. Търсим бутон за следваща страница
        next_btn = await page.query_selector(".next-page, .brochure-next, [aria-label*='Next']")
        print(f"Next button found: {next_btn is not None}")
        
        # 2. Търсим къде са скрити продуктите за ТАЗИ страница
        # Често в тези сайтове има невидим списък с продукти за SEO или за екранни четци
        content = await page.content()
        soup = BeautifulSoup(content, 'html.parser')
        
        # Търсим продукти в контейнера на брошурата
        products_on_page = soup.select('.brochure-products, .page-products, .offer-on-page')
        print(f"Products on page (by selector): {len(products_on_page)}")
        
        # Търсим заглавия или линкове /p/ които се появяват при смяна на страницата
        links = soup.find_all('a', href=lambda h: h and '/p/' in h)
        print(f"Total /p/ links on initial page: {len(links)}")
        
        # Печатаме ВСИЧКИ линкове за дебъг
        all_links = soup.find_all('a', href=True)
        print(f"Total links on page: {len(all_links)}")
        for l in all_links[:20]:
            print(f"Link: {l.get('href')} - Text: {l.get_text(strip=True)[:30]}")

        # Търсим iframe или canvas (често брошурите са там)
        iframes = soup.find_all('iframe')
        print(f"Iframes: {len(iframes)}")
        for i in iframes:
            print(f"Iframe src: {i.get('src')}")
        
        # Търсим скриптове с данни (JSON)
        scripts = soup.find_all('script')
        print(f"Scripts: {len(scripts)}")
        for i, s in enumerate(scripts):
            if s.string:
                print(f"Script {i} (first 100 chars): {s.string[:100]}...")
            elif s.get('src'):
                print(f"Script {i} src: {s.get('src')}")

        # Скролваме няколко пъти поетапно и натискаме бутони ако видим
        print("Scrolling and searching for 'Load more' or similar...")
        for i in range(5):
            await page.evaluate("window.scrollBy(0, 1000)")
            await asyncio.sleep(2)
            # Търсим бутон "Продукти в тази брошура" или подобен
            btn = await page.query_selector("button:has-text('Продукти'), .btn-primary, .show-more")
            if btn:
                print(f"Found button at step {i}: {await btn.inner_text()}")
                # await btn.click() # Може да пробваме да кликнем ако е логично
        
        # Правим скрийншот за да видим какво вижда бота
        await page.screenshot(path="screenshot_brochure.png", full_page=True)
        print("Screenshot saved to screenshot_brochure.png")

        content_after = await page.content()
        soup_after = BeautifulSoup(content_after, 'html.parser')
        
        # Търсим всички div-ове, които може да съдържат текст на продукти
        potential_cards = soup_after.find_all('div', class_=lambda c: c and ('offer' in c or 'product' in c))
        print(f"Potential cards found: {len(potential_cards)}")
        if potential_cards:
            print(f"First card HTML: {str(potential_cards[0])[:200]}")
        
        # Проверяваме дали списъкът с продукти под брошурата се променя
        # (На някои сайтове списъкът "Продукти в тази брошура" показва само тези за текущата страница)
        
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
