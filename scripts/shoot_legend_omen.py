from playwright.sync_api import sync_playwright
import os
OUT = "/tmp/legend_shots"
os.makedirs(OUT, exist_ok=True)

def run_flow(page, label):
    page.goto("http://localhost:4317/")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(2500)
    opt = lambda name: page.get_by_role("button", name=name, exact=True)
    cont = lambda: page.get_by_role("button", name="Continue").click()
    page.get_by_role("button", name="Mint your legend").click()
    page.wait_for_selector("text=Your age", timeout=6000)
    cont()                                                   # 01 age -> 02
    page.wait_for_selector("text=Your gender", timeout=6000)
    page.get_by_text("Man", exact=True).click(); cont()     # 02 -> 03
    page.wait_for_selector("text=afraid of heights", timeout=6000)
    opt("No").click(); cont()                                # 03 -> 04
    page.wait_for_selector("text=afraid to love", timeout=6000)
    opt("No").click(); cont()                                # 04 -> 05
    page.wait_for_selector("text=What is your legend", timeout=6000)
    page.get_by_role("button", name="Consult the universe").click()  # 05 -> seek
    page.wait_for_selector("text=universe answers", timeout=6000)
    page.wait_for_timeout(900)
    print(f"{label}: reached The Omen")
    page.screenshot(path=f"{OUT}/{label}_omen.png")

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    dctx = b.new_context(viewport={"width": 1280, "height": 800}, device_scale_factor=2)
    run_flow(dctx.new_page(), "desktop")
    dctx.close()
    b.close()
print("DONE")
