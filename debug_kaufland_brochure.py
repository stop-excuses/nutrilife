
import asyncio
from playwright.async_api import async_playwright
from bs4 import BeautifulSoup

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context()
        page = await context.new_page()
        
        url = 'https://www.broshura.bg/h/80550-kaufland'
        print(f"Checking {url}...")
        await page.goto(url, wait_until="networkidle")
        await asyncio.sleep(5)
        
        # Скролваме поетапно за да зареди списъка под брошурата
        for i in range(5):
             await page.evaluate("window.scrollBy(0, 1500)")
             await asyncio.sleep(2)
             
        content = await page.content()
        soup = BeautifulSoup(content, 'html.parser')
        
        all_p = soup.find_all('a', href=lambda h: h and '/p/' in h)
        print(f"Total /p/ links on base page: {len(all_p)}")
        
        # Търсим заглавия на брошури и техните "продуктови" секции
        brochure_wrappers = soup.select('.wrapper-brochure-detail')
        print(f"Brochure wrappers: {len(brochure_wrappers)}")
        
        # Правим скрийншот за да видим структурата на списъка
        await page.screenshot(path="kaufland_list.png", full_page=True)
        print("Screenshot saved.")
        
        # Търсим специфичен таб или бутон за списък с продукти
        # На някои версии на сайта има таб "Продукти"
        list_btn = await page.query_selector("text='Списък', text='Продукти'")
        if list_btn:
            print("Found 'Products' list button/tab.")
            
        # Търсим JSON в скриптове, който може да съдържа продуктите
        for i, s in enumerate(soup.find_all('script')):
            if s.string and 'productId' in s.string:
                print(f"Found productId in script {i}")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
