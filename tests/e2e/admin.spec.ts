import { expect, test } from "@playwright/test";
import { adminLogin, adminUrl, placeGuestOrder, trackingLink } from "./helpers";

test.describe.configure({ mode: "serial" });

test("Scenarios 3–5 · admin receives, prepares and personally delivers a COD order", async ({ browser }) => {
  const customer = await browser.newPage();
  const orderNumber = await placeGuestOrder(customer, { name: "Arjun Das", phone: "9830099999" });
  const trackingUrl = (await trackingLink(customer, orderNumber).getAttribute("href"))!;

  const admin = await browser.newPage();
  await adminLogin(admin);
  await admin.goto(adminUrl("/orders"));
  // The new order is on the live board without a manual refresh.
  const link = admin.getByRole("link", { name: new RegExp(orderNumber) }).first();
  await expect(link).toBeVisible({ timeout: 20_000 });
  await link.click();
  await expect(admin).toHaveURL(/\/orders\/[0-9a-f-]{36}/);

  for (const label of ["Accept", "Start preparing", "Mark ready", "Out for delivery", "Mark delivered"]) {
    const button = admin.getByRole("button", { name: new RegExp(`^${label}`) }).first();
    await expect(button).toBeEnabled({ timeout: 15_000 });
    await button.click();
    // Confirm dialogs (e.g. mark delivered) if one appears.
    const confirm = admin.getByRole("alertdialog").getByRole("button", { name: new RegExp(label, "i") });
    if (await confirm.isVisible().catch(() => false)) await confirm.click();
    await expect(admin.getByRole("button", { name: new RegExp(`^${label}`) })).toHaveCount(0, { timeout: 15_000 });
  }
  await expect(admin.getByText(/Delivered/).first()).toBeVisible();

  // Customer's tracking page reflects the real status.
  await customer.goto(trackingUrl);
  await expect(customer.getByText(/Delivered/).first()).toBeVisible({ timeout: 20_000 });

  // COD collection is a separate, explicit step.
  await admin.reload();
  const record = admin.getByRole("button", { name: /record cash/i }).first();
  await expect(record).toBeVisible();
  await record.click();
  const dialog = admin.getByRole("dialog");
  await dialog.getByRole("button", { name: /record|save|confirm/i }).last().click();
  await expect(admin.getByText(/collected/i).first()).toBeVisible({ timeout: 15_000 });
});

test("Scenario 7 · closing the kitchen blocks ordering on the website", async ({ browser }) => {
  const admin = await browser.newPage();
  await adminLogin(admin);
  await admin.goto(adminUrl("/business-hours"));
  await admin.getByRole("button", { name: /^Close/ }).first().click();
  await expect(admin.getByText(/closed/i).first()).toBeVisible({ timeout: 15_000 });

  try {
    const customer = await browser.newPage();
    await customer.goto("/food/paneer-pizza");
    await customer.getByRole("button", { name: /^Add ·/ }).click();
    await customer.goto("/checkout");
    await expect(customer.getByText(/We're closed right now/).first()).toBeVisible({ timeout: 20_000 });
    await expect(customer.getByRole("button", { name: "Kitchen closed" })).toBeDisabled();
    await expect(customer.getByRole("button", { name: /Place order/ })).toHaveCount(0);
  } finally {
    await admin.getByRole("button", { name: /^Force open/ }).first().click();
    await expect(admin.getByText(/open/i).first()).toBeVisible();
  }
});

test("Scenario 6 · a price change in the admin appears on the storefront immediately", async ({ browser }) => {
  const admin = await browser.newPage();
  await adminLogin(admin);
  await admin.goto(adminUrl("/products"));
  await admin.getByLabel("Edit Cheese Maggi").first().click();
  await expect(admin).toHaveURL(/\/products\/[0-9a-f-]{36}/);
  await admin.locator("#p-price").fill("125");
  await admin.getByRole("button", { name: "Save changes" }).click();
  await expect(admin.getByText(/saved|updated/i).first()).toBeVisible({ timeout: 15_000 });

  const customer = await browser.newPage();
  await customer.goto("/food/cheese-maggi");
  await expect(customer.getByRole("button", { name: /^Add · ₹125/ })).toBeVisible();
});
