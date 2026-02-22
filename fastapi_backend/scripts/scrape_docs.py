import time
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.chrome.service import Service

def scrape_url(url, output_file, wait_selector=None):
    print(f"Scraping {url}...")
    
    options = Options()
    options.add_argument("--headless")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.add_argument("--window-size=1920,1080")
    # Fake user agent to avoid being blocked
    options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

    service = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service, options=options)
    
    try:
        driver.get(url)
        
        # Wait for content to load
        time.sleep(10) # Wait 10s for SPA
            
        # Get text content
        content = driver.find_element(By.TAG_NAME, "body").text
        
        # Also dump links to find API docs
        links = driver.find_elements(By.TAG_NAME, "a")
        link_text = "\n\n## Links found:\n"
        for link in links:
            try:
                href = link.get_attribute("href")
                text = link.text
                if href and ("api" in href.lower() or "model" in href.lower() or "doc" in href.lower()):
                    link_text += f"- [{text}]({href})\n"
            except:
                pass
            
        with open(output_file, "w", encoding="utf-8") as f:
            f.write(f"# Scraped Content from {url}\n\n")
            f.write(content)
            f.write(link_text)
            
        print(f"Saved to {output_file}")
        
    except Exception as e:
        print(f"Error scraping {url}: {e}")
    finally:
        driver.quit()

if __name__ == "__main__":
    import os
    # Ensure output directory exists
    output_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "docs", "vendor_model_reference")
    os.makedirs(output_dir, exist_ok=True)

    # Volcengine Image Generation
    scrape_url(
        "https://www.volcengine.com/docs/82379/1541523", 
        os.path.join(output_dir, "volcengine_image_raw.md")
    )

    # Volcengine Video Generation
    scrape_url(
        "https://www.volcengine.com/docs/82379/1520757", 
        os.path.join(output_dir, "volcengine_video_raw.md")
    )
    
    # Vidu Text to Video
    scrape_url(
        "https://platform.vidu.cn/docs/text-to-video", 
        os.path.join(output_dir, "vidu_t2v_raw.md")
    )

    # Vidu Model Map
    scrape_url(
        "https://platform.vidu.cn/docs/model-map", 
        os.path.join(output_dir, "vidu_models_raw.md")
    )
