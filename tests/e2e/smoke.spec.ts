import { test, expect } from "@playwright/test";

test("landing page renders and has no horizontal overflow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("protected routes redirect to /login when signed out", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("login submit is disabled until email and password are entered", async ({ page }) => {
  await page.goto("/login");
  const submit = page.locator("form button[type=submit]");
  await expect(submit).toBeDisabled();
  await page.getByLabel(/email/i).fill("a@example.com");
  await page.getByLabel(/password/i).first().fill("x");
  await expect(submit).toBeEnabled();
});

test("register page loads", async ({ page }) => {
  await page.goto("/register");
  await expect(page.locator("form")).toBeVisible();
});

test("share link without a valid key fragment is reported as incomplete", async ({ page }) => {
  await page.goto("/s/not-a-real-token#abc");
  await expect(page.getByRole("heading", { name: /incomplete/i })).toBeVisible({ timeout: 15_000 });
});

test("security headers are present", async ({ request }) => {
  const res = await request.get("/");
  const h = res.headers();
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["content-security-policy"]).toContain("default-src");
  expect(h["x-powered-by"]).toBeUndefined();
});

test("share route sends no-referrer", async ({ request }) => {
  const res = await request.get("/s/whatever");
  expect(res.headers()["referrer-policy"]).toBe("no-referrer");
});

test("health endpoint reports status without leaking details", async ({ request }) => {
  const res = await request.get("/api/health");
  // 503 "degraded" is expected when no database is configured (as in CI).
  expect([200, 503]).toContain(res.status());
  const body = await res.json();
  expect(Object.keys(body)).toEqual(["status"]);
});
