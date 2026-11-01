import { expect, test } from "@playwright/test";
import { adminUrl, placeGuestOrder, trackingLink } from "./helpers";

test.describe("Scenario 1 · guest customer", () => {
  test("browses the menu, orders with COD without an account and tracks the order", async ({ page }) => {
    await page.goto("/menu");
    await expect(page.getByText("Chicken Seekh Kabab").first()).toBeVisible();
    await expect(page.getByText("₹295").first()).toBeVisible();

    const orderNumber = await placeGuestOrder(page);
    await expect(page.getByText(orderNumber).first()).toBeVisible();

    // The success page links to secure tracking (token in URL).
    await trackingLink(page, orderNumber).click();
    await expect(page).toHaveURL(new RegExp(`/track-order/${orderNumber}\\?t=`));
    await expect(page.getByText(/Order Placed/i).first()).toBeVisible();
    // Total = ₹191 pizza + ₹30 delivery
    await expect(page.getByText("₹221").first()).toBeVisible();
  });

  test("product customisation changes the price", async ({ page }) => {
    await page.goto("/food/french-fries");
    await expect(page.getByRole("button", { name: /^Add · ₹173/ })).toBeVisible();
    // Target the accessible checkbox: while the page streams in, React briefly keeps a hidden copy of the options.
    await page.getByRole("checkbox", { name: /Extra Peri Peri/ }).click();
    await expect(page.getByRole("button", { name: /^Add · ₹190/ })).toBeVisible();
  });
});

test.describe("security", () => {
  test("guests can't open orders without the secret token, and admin is protected", async ({ page, request }) => {
    const res = await request.get("/api/orders/track/BA000000-001?t=wrong");
    expect(res.status()).toBe(404);
    // The storefront app contains no admin routes at all.
    expect((await request.get("/api/admin/live")).status()).toBe(404);
    // The admin app is separate and rejects anonymous visitors.
    expect((await request.get(adminUrl("/api/admin/live"))).status()).toBe(401);
    await page.goto(adminUrl("/dashboard"));
    await expect(page).toHaveURL(/\/login/);
  });

  test("forged Razorpay webhooks are rejected", async ({ request }) => {
    const res = await request.post("/api/payments/razorpay/webhook", { data: { event: "payment.captured" }, headers: { "x-razorpay-signature": "forged" } });
    expect([400, 503]).toContain(res.status());
  });
});

test("@mobile storefront works on a phone", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /menu/i }).first()).toBeVisible();
  await page.goto("/food/chicken-65");
  await page.getByRole("button", { name: /^Add ·/ }).click();
  await page.goto("/cart");
  await expect(page.getByText("Chicken 65").first()).toBeVisible();
});
