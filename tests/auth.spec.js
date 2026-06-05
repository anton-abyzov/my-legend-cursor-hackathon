const { test, expect } = require("@playwright/test");

// Pre-confirmed Supabase user (created via the Admin API for CI). Override with
// env vars if you seed a different user.
const TEST_EMAIL = process.env.E2E_EMAIL || "legend-e2e@example.com";
const TEST_PASSWORD = process.env.E2E_PASSWORD || "Test-Legend-12345";

test.describe("Legend Supabase auth", () => {
  test("email/password sign-in, session persists, protected routes work, logout clears it", async ({ page }) => {
    await page.goto("/builder");

    // Login gate is shown with the Supabase email + password fields.
    const gate = page.locator("#loginGate");
    await expect(gate).toBeVisible();
    await expect(page.locator("#emailField")).toBeVisible();
    await expect(page.locator("#loginForm input[name=email]")).toBeVisible();

    // Sign in.
    await page.fill("#loginForm input[name=email]", TEST_EMAIL);
    await page.fill("#loginForm input[name=password]", TEST_PASSWORD);
    await page.click("#signInButton");

    // Gate disappears and the signed-in email is shown.
    await expect(gate).toBeHidden();
    await expect(page.locator("#sessionState")).toContainText(TEST_EMAIL);

    // /api/me reports the real Supabase user.
    const me = await page.request.get("/api/me");
    expect(me.ok()).toBeTruthy();
    const meBody = await me.json();
    expect(meBody.authenticated).toBe(true);
    expect(meBody.authMode).toBe("supabase");
    expect(meBody.user.email).toBe(TEST_EMAIL);
    expect(meBody.user.id).toMatch(/^[0-9a-f-]{36}$/);

    // A protected API route works with the session cookie + the app loads quests.
    const quests = await page.request.get("/api/side-quests?limit=3");
    expect(quests.ok()).toBeTruthy();
    const questsBody = await quests.json();
    expect(Array.isArray(questsBody.quests)).toBe(true);
    expect(questsBody.quests.length).toBeGreaterThan(0);

    // Session persists across reload.
    await page.reload();
    await expect(page.locator("#loginGate")).toBeHidden();
    await expect(page.locator("#sessionState")).toContainText(TEST_EMAIL);

    // Logout clears the session.
    await page.click("#logoutButton");
    await expect(page.locator("#loginGate")).toBeVisible();
    const afterLogout = await page.request.get("/api/me");
    expect((await afterLogout.json()).authenticated).toBe(false);
  });

  test("rejects bad credentials", async ({ page }) => {
    await page.goto("/builder");
    await page.fill("#loginForm input[name=email]", TEST_EMAIL);
    await page.fill("#loginForm input[name=password]", "definitely-wrong-password");
    await page.click("#signInButton");
    await expect(page.locator("#loginError")).toContainText(/invalid/i);
    await expect(page.locator("#loginGate")).toBeVisible();
  });

  test("Google SSO button initiates the OAuth redirect to Supabase/Google", async ({ page }) => {
    await page.goto("/builder");

    // Button is present.
    const googleButton = page.locator("#googleButton");
    await expect(googleButton).toBeVisible();
    await expect(googleButton).toContainText(/Continue with Google/i);

    // The /auth/google route 302-redirects to the Supabase Google authorize URL.
    const resp = await page.request.get("/auth/google", { maxRedirects: 0 });
    expect(resp.status()).toBe(302);
    const location = resp.headers()["location"];
    expect(location).toContain("saznzyuhcbqusoibakej.supabase.co/auth/v1/authorize");
    expect(location).toContain("provider=google");
    expect(location).toContain("code_challenge");

    // Clicking the button follows the full chain to Google's sign-in.
    await googleButton.click();
    await page.waitForURL(/accounts\.google\.com/, { timeout: 15000 });
    expect(page.url()).toContain("accounts.google.com");
  });

  test("sign-up affordance is present and the endpoint validates input", async ({ page }) => {
    await page.goto("/builder");

    // The Sign up button exists alongside Sign in.
    await expect(page.locator("#signUpButton")).toBeVisible();

    // Deterministic endpoint contract: weak password is rejected with 400. (We
    // assert at the API layer to avoid burning the shared project's email
    // rate-limit / SMTP; real account creation is exercised via the Admin API
    // seed + the sign-in test above.)
    const weak = await page.request.post("/api/signup", {
      data: { email: `legend.e2e.${Date.now()}@gmail.com`, password: "123" }
    });
    expect(weak.status()).toBe(400);
    const body = await weak.json();
    expect(body.error).toBe("weak_credentials");

    // UI surfaces the validation error when sign-up is attempted with a short password.
    await page.fill("#loginForm input[name=email]", `legend.e2e.${Date.now()}@gmail.com`);
    await page.fill("#loginForm input[name=password]", "123");
    await page.click("#signUpButton");
    await expect(page.locator("#loginError")).toContainText(/6\+ character|character/i);
  });
});
