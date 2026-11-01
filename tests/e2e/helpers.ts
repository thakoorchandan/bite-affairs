import { expect, type Page } from "@playwright/test";

export const ADMIN_URL = `http://localhost:${process.env.E2E_ADMIN_PORT ?? "3101"}`;
/** The admin is its own app on its own port; build absolute URLs for it. */
export const adminUrl = (path: string) => `${ADMIN_URL}${path}`;

export const ADMIN = { email: "admin@biteaffairs.test", password: "Admin12345" };

export async function adminLogin(page: Page) {
  await page.goto(adminUrl("/login"));
  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByRole("textbox", { name: "Password" }).fill(ADMIN.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

/** Guest COD checkout of one Margaretta Pizza to a serviceable PIN. Returns the order number. */
export async function placeGuestOrder(page: Page, opts: { name?: string; phone?: string } = {}) {
  await page.goto("/food/margaretta-pizza");
  await page.getByRole("button", { name: /^Add ·/ }).click();
  await page.goto("/checkout");
  await page.getByLabel("Full name").fill(opts.name ?? "Riya Sen");
  await page.getByLabel("Mobile number").fill(opts.phone ?? "9830012345");
  await page.getByLabel("House / flat no.").fill("12B");
  await page.getByLabel("Street / locality").fill("Park Street");
  await page.getByLabel("City").fill("Kolkata");
  await page.getByLabel("PIN code").fill("700016");
  const place = page.getByRole("button", { name: /Place order/ });
  await expect(place).toBeEnabled({ timeout: 20_000 });
  await place.click();
  await expect(page).toHaveURL(/\/order-success\/BA\d{6}-\d+/, { timeout: 30_000 });
  return decodeURIComponent(page.url().match(/order-success\/([^/?#]+)/)![1]);
}

export const trackingLink = (page: Page, orderNumber: string) => page.locator(`a[href*="/track-order/${orderNumber}?t="]`).first();
