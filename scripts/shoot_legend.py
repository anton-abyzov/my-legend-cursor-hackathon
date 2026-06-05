import sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:4317/"
OUT = "/tmp/legend_shots"
import os
os.makedirs(OUT, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)

    # Desktop landscape
    dctx = browser.new_context(viewport={"width": 1280, "height": 800}, device_scale_factor=2)
    dpage = dctx.new_page()
    dpage.goto(BASE)
    dpage.wait_for_load_state("networkidle")
    dpage.wait_for_timeout(2500)  # let babel compile + react mount
    # confirm welcome screen rendered
    try:
        dpage.wait_for_selector("text=Mint your legend", timeout=8000)
        print("DESKTOP: welcome CTA found")
    except Exception as e:
        print("DESKTOP: welcome CTA NOT found:", e)
    dpage.screenshot(path=f"{OUT}/desktop_welcome.png")

    # advance: Mint your legend -> quiz step 1
    try:
        dpage.click("text=Mint your legend")
        dpage.wait_for_timeout(900)
        dpage.wait_for_selector("text=Your age", timeout=6000)
        print("DESKTOP: quiz step 01 (Your age) reached")
        dpage.screenshot(path=f"{OUT}/desktop_quiz_age.png")
        # continue -> gender
        dpage.click("text=Continue")
        dpage.wait_for_timeout(700)
        dpage.wait_for_selector("text=Your gender", timeout=6000)
        # pick Man
        dpage.click("text=Man")
        dpage.wait_for_timeout(300)
        dpage.screenshot(path=f"{OUT}/desktop_quiz_gender.png")
        print("DESKTOP: quiz step 02 (gender) reached")
    except Exception as e:
        print("DESKTOP flow error:", e)

    dctx.close()

    # Mobile
    mctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True)
    mpage = mctx.new_page()
    mpage.goto(BASE)
    mpage.wait_for_load_state("networkidle")
    mpage.wait_for_timeout(2500)
    try:
        mpage.wait_for_selector("text=Mint your legend", timeout=8000)
        print("MOBILE: welcome CTA found")
    except Exception as e:
        print("MOBILE: welcome CTA NOT found:", e)
    mpage.screenshot(path=f"{OUT}/mobile_welcome.png")
    # advance to quiz
    try:
        mpage.click("text=Mint your legend")
        mpage.wait_for_timeout(900)
        mpage.wait_for_selector("text=Your age", timeout=6000)
        mpage.screenshot(path=f"{OUT}/mobile_quiz_age.png")
        print("MOBILE: quiz step 01 reached")
    except Exception as e:
        print("MOBILE flow error:", e)
    mctx.close()

    browser.close()
print("DONE", OUT)
