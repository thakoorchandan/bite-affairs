import { expect, test, type Page } from "@playwright/test";
import { adminLogin, adminUrl, placeGuestOrder } from "./helpers";

test.describe.configure({ mode: "serial" });

const PAGES = [
  "/dashboard", "/orders", "/kitchen-display", "/deliveries", "/menu", "/products", "/products/new", "/categories", "/customisations",
  "/coupons", "/customers", "/reviews", "/website-content", "/media", "/delivery-settings", "/business-hours", "/payments", "/expenses",
  "/analytics", "/notifications", "/activity-logs", "/settings",
];

function watchConsole(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(`${page.url()} :: ${m.text()}`); });
  page.on("pageerror", (e) => errors.push(`${page.url()} :: pageerror ${e.message}`));
  return errors;
}

test("every admin page renders without console errors or stuck skeletons", async ({ page }) => {
  const errors = watchConsole(page);
  await adminLogin(page);
  for (const path of PAGES) {
    await page.goto(adminUrl(path));
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await expect(page.locator("h1").first(), path).toBeVisible();
    await expect(page.locator('[data-slot="skeleton"]'), `${path} skeletons`).toHaveCount(0, { timeout: 15_000 });
    await page.screenshot({ path: `test-results/crawl${path.replace(/\//g, "_")}.png`, fullPage: true });
  }
  expect(errors).toEqual([]);
});

/**
 * Navigation helpers that wait for streamed Suspense segments to be swapped in. Until React moves a streamed
 * segment into place, a hidden copy of the content (`<div hidden id="S:n">`) sits in the DOM and makes
 * locators ambiguous. (Client-side navigations also keep the previous route mounted but hidden, so element-id
 * locators below are restricted to `:visible`.)
 */
async function settled(page: Page) {
  await page.waitForFunction(() => !document.querySelector('div[hidden][id^="S:"]'), undefined, { timeout: 15_000 });
  // Let hydration finish before typing, or React can overwrite what was typed.
  await page.waitForLoadState("networkidle").catch(() => undefined);
}
async function go(page: Page, path: string) {
  await page.goto(adminUrl(path));
  await settled(page);
}
async function reload(page: Page) {
  await page.reload();
  await settled(page);
}

/** Waits for a sonner toast containing `text`. */
const toast = (page: Page, text: string | RegExp) => expect(page.locator("[data-sonner-toast]").filter({ hasText: text }).first()).toBeVisible({ timeout: 15_000 });

/**
 * Opens a storefront page and retries (reloading) until `check` passes. The admin tells the store to refresh
 * its cache after every edit; the store's revalidate endpoint uses stale-while-revalidate, so the very first
 * request after an edit may still be served the previous copy.
 */
async function onStore(page: Page, path: string, check: () => Promise<void>) {
  await page.goto(path);
  await expect(async () => {
    try {
      await check();
    } catch (e) {
      await reload(page);
      throw e;
    }
  }).toPass({ timeout: 30_000, intervals: [500, 1000, 2000] });
}

/** The row (<li>) of a sortable/admin list that contains `name`. */
const row = (page: Page, name: string) => page.locator("li").filter({ has: page.getByText(name, { exact: true }) }).first();

test("categories · create, edit, reorder, hide and delete", async ({ page, browser }) => {
  await adminLogin(page);
  await go(page, "/categories");
  await page.getByRole("button", { name: "New category" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#c-name").fill("E2E Desserts");
  await dialog.locator("#c-desc").fill("Sweet things");
  await dialog.getByRole("button", { name: "Save category" }).click();
  await toast(page, "Category created");
  await expect(row(page, "E2E Desserts")).toBeVisible();
  await expect(row(page, "E2E Desserts")).toContainText("/menu/e2e-desserts");

  // Edit
  await page.getByRole("button", { name: "Edit E2E Desserts" }).click();
  await dialog.locator("#c-name").fill("E2E Sweets");
  await dialog.getByRole("button", { name: "Save category" }).click();
  await toast(page, "Category updated");
  await expect(row(page, "E2E Sweets")).toBeVisible();

  // The storefront menu shows the new category immediately.
  const customer = await browser.newPage();
  await onStore(customer, "/menu", () => expect(customer.getByText("E2E Sweets").first()).toBeVisible({ timeout: 3000 }));

  // Reorder: move the new (last) category up one place; the order persists.
  const names = async () => (await page.locator("ul > li p.font-medium").allTextContents()).map((s) => s.trim());
  const before = await names();
  expect(before.at(-1)).toBe("E2E Sweets");
  await row(page, "E2E Sweets").getByRole("button", { name: "Move up" }).click();
  await toast(page, "Order saved");
  await reload(page);
  const after = await names();
  expect(after.at(-2)).toBe("E2E Sweets");
  expect(after.at(-1)).toBe(before.at(-2));

  // Hide from the menu
  await page.getByRole("switch", { name: "Show E2E Sweets on menu" }).click();
  await toast(page, "E2E Sweets hidden from menu");
  await reload(page);
  await expect(row(page, "E2E Sweets").getByText("Hidden")).toBeVisible();
  await expect(page.getByRole("switch", { name: "Show E2E Sweets on menu" })).not.toBeChecked();
  await onStore(customer, "/menu", () => expect(customer.getByText("E2E Sweets")).toHaveCount(0, { timeout: 3000 }));

  // Delete
  await page.getByRole("button", { name: "Delete E2E Sweets" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await toast(page, "Category deleted");
  await expect(page.getByText("E2E Sweets", { exact: true })).toHaveCount(0);
  await reload(page);
  await expect(page.getByText("E2E Sweets", { exact: true })).toHaveCount(0);
});

test("customisations · create, edit and delete a group", async ({ page }) => {
  await adminLogin(page);
  await go(page, "/customisations");
  await page.getByRole("button", { name: "New group" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#g-name").fill("E2E Dips");
  await dialog.locator("#g-int").fill("e2e dips");
  await dialog.getByLabel("Option name").fill("Mayo");
  await dialog.getByLabel("Extra price (₹)").fill("15");
  await dialog.getByRole("button", { name: "Add option" }).click();
  await dialog.getByLabel("Option name").nth(1).fill("Salsa");
  await dialog.getByLabel("Extra price (₹)").nth(1).fill("20");
  await dialog.getByRole("button", { name: "Save group" }).click();
  await toast(page, "Customisation group saved");
  const card = page.locator("article:visible").filter({ hasText: "E2E Dips" });
  await expect(card).toContainText("Mayo +₹15");
  await expect(card).toContainText("Salsa +₹20");

  await page.getByRole("button", { name: "Edit E2E Dips" }).click();
  await dialog.locator("#g-type").selectOption("SINGLE");
  await dialog.getByLabel("Extra price (₹)").nth(1).fill("25");
  await dialog.getByRole("button", { name: "Save group" }).click();
  await toast(page, "Customisation group saved");
  await reload(page);
  await expect(card).toContainText("Choose one");
  await expect(card).toContainText("Salsa +₹25");

  await page.getByRole("button", { name: "Delete E2E Dips" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await toast(page, "Group deleted");
  await expect(card).toHaveCount(0);
});

test("products · create with a customisation group, edit, sell out, duplicate and delete", async ({ page, browser }) => {
  await adminLogin(page);
  // A group to attach
  await go(page, "/customisations");
  await page.getByRole("button", { name: "New group" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#g-name").fill("E2E Sauce");
  await dialog.getByLabel("Option name").fill("Chipotle");
  await dialog.getByLabel("Extra price (₹)").fill("30");
  await dialog.getByRole("button", { name: "Save group" }).click();
  await toast(page, "Customisation group saved");

  await go(page, "/products");
  await page.getByRole("button", { name: "New product" }).click();
  await expect(page).toHaveURL(/\/products\/new/);
  await settled(page);
  await page.locator("#p-name:visible").fill("E2E Brownie");
  await page.locator("#p-cat:visible").selectOption({ label: "Pizza" });
  await page.locator("#p-short:visible").fill("Fudgy chocolate brownie");
  await page.locator("#p-price:visible").fill("149");
  await page.locator("label").filter({ hasText: "E2E Sauce" }).getByRole("checkbox").click();
  await page.getByRole("button", { name: "Create product" }).click();
  await toast(page, "Product created");
  await expect(page).toHaveURL(/\/products\/[0-9a-f-]{36}/);
  await settled(page);
  await expect(page.locator("#p-name:visible")).toHaveValue("E2E Brownie");
  await expect(page.locator("label").filter({ hasText: "E2E Sauce" }).getByRole("checkbox")).toBeChecked();

  // Storefront shows it with its add-on.
  const customer = await browser.newPage();
  await onStore(customer, "/food/e2e-brownie", async () => {
    await expect(customer.getByRole("heading", { name: "E2E Brownie" }).first()).toBeVisible({ timeout: 3000 });
    await expect(customer.getByText("Chipotle").first()).toBeVisible({ timeout: 3000 });
  });

  // Edit: discounted price; the "unsaved changes" hint clears after saving.
  await page.locator("#p-dprice:visible").fill("129");
  await expect(page.locator("span:visible").filter({ hasText: /^Unsaved changes$/ })).toBeVisible();
  await page.getByRole("button", { name: "Save changes" }).click();
  await toast(page, "Product saved");
  await expect(page.locator("span:visible").filter({ hasText: /^Unsaved changes$/ })).toHaveCount(0);
  await reload(page);
  await expect(page.locator("#p-dprice:visible")).toHaveValue("129");

  // Sold out from the list
  await go(page, "/products?q=E2E%20Brownie");
  const sw = page.getByRole("switch", { name: "E2E Brownie available" });
  await sw.click();
  await toast(page, "E2E Brownie marked sold out");
  await reload(page);
  await expect(page.getByRole("switch", { name: "E2E Brownie available" })).not.toBeChecked();
  await onStore(customer, "/food/e2e-brownie", () => expect(customer.getByText(/sold out/i).first()).toBeVisible({ timeout: 3000 }));

  // Duplicate opens the copy (hidden until published)
  await page.getByRole("button", { name: "Duplicate E2E Brownie" }).click();
  await toast(page, /Duplicated/);
  await expect(page).toHaveURL(/\/products\/[0-9a-f-]{36}/);
  await settled(page);
  await expect(page.locator("#p-name:visible")).toHaveValue(/E2E Brownie/);
  const copyName = await page.locator("#p-name:visible").inputValue();
  expect(copyName).not.toBe("E2E Brownie");

  // Delete both
  await go(page, "/products?q=E2E%20Brownie");
  for (const name of [copyName, "E2E Brownie"]) {
    await page.getByRole("button", { name: `Delete ${name}` }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
    await toast(page, "Product deleted");
    await expect(page.getByRole("button", { name: `Delete ${name}` })).toHaveCount(0);
  }
  await onStore(customer, "/food/e2e-brownie", () => expect(customer.getByRole("heading", { name: "E2E Brownie" })).toHaveCount(0, { timeout: 3000 }));
});

test("coupons · create, edit, toggle, use at storefront checkout, delete", async ({ page, browser }) => {
  await adminLogin(page);
  await go(page, "/coupons");
  await page.getByRole("button", { name: "New coupon" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#cp-code").fill("e2eflat50");
  await dialog.locator("#cp-desc").fill("Flat fifty");
  await dialog.locator("#cp-type").selectOption("FLAT");
  await dialog.locator("#cp-value").fill("50");
  await dialog.locator("#cp-min").fill("100");
  await dialog.locator("#cp-per").fill("0");
  await dialog.getByRole("button", { name: "Save coupon" }).click();
  await toast(page, "Coupon saved");
  const card = page.locator("article:visible").filter({ hasText: "E2EFLAT50" });
  await expect(card).toContainText("₹50 off · min order ₹100");
  await expect(card).toContainText("Live");

  // Edit
  await page.getByRole("button", { name: "Edit E2EFLAT50" }).click();
  await dialog.locator("#cp-desc").fill("Fifty off any order");
  await dialog.getByRole("button", { name: "Save coupon" }).click();
  await toast(page, "Coupon saved");
  await expect(card).toContainText("Fifty off any order");

  // Deactivate → the storefront rejects it; reactivate → it applies.
  await page.getByRole("switch", { name: "E2EFLAT50 active" }).click();
  await toast(page, "Coupon deactivated");
  await expect(card).toContainText("Inactive");

  const customer = await browser.newPage();
  await customer.goto("/food/margaretta-pizza");
  await customer.getByRole("button", { name: /^Add ·/ }).click();
  await customer.goto("/checkout");
  await customer.getByLabel("Coupon code").fill("E2EFLAT50");
  await customer.getByRole("button", { name: "Apply" }).click();
  await expect(customer.getByText("Coupon (E2EFLAT50)")).toHaveCount(0);
  await customer.getByRole("button", { name: "Remove coupon" }).click();

  await page.getByRole("switch", { name: "E2EFLAT50 active" }).click();
  await toast(page, "Coupon activated");
  await expect(card).toContainText("Live");
  await customer.getByLabel("Coupon code").fill("E2EFLAT50");
  await customer.getByRole("button", { name: "Apply" }).click();
  await expect(customer.getByText("Coupon (E2EFLAT50)").first()).toBeVisible({ timeout: 15_000 });
  await expect(customer.getByText("−₹50").first()).toBeVisible();

  // Delete (never used, so really deleted)
  await page.getByRole("button", { name: "Delete E2EFLAT50" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await toast(page, "Coupon deleted");
  await expect(card).toHaveCount(0);
});

test("delivery · rules persist; zones add, edit, pause and delete", async ({ page }) => {
  await adminLogin(page);
  await go(page, "/delivery-settings");
  await page.locator("#d-eta:visible").fill("35");
  await page.getByRole("button", { name: "Save delivery rules" }).click();
  await toast(page, "Delivery settings saved");
  await reload(page);
  await expect(page.locator("#d-eta:visible")).toHaveValue("35");

  await page.getByRole("button", { name: "New zone" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#z-name").fill("E2E Zone");
  await dialog.locator("#z-pins").fill("700091, 700064");
  await expect(dialog.getByText("2 valid PIN codes")).toBeVisible();
  await dialog.locator("#z-fee").fill("40");
  await dialog.getByRole("button", { name: "Save zone" }).click();
  await toast(page, "Zone saved");
  const zone = page.locator("li").filter({ has: page.getByText("E2E Zone", { exact: true }) });
  await expect(zone).toContainText("Fee ₹40");
  await expect(zone).toContainText("700091");

  await page.getByRole("button", { name: "Edit E2E Zone" }).click();
  await dialog.locator("#z-pins").fill("700091, 700064, 700106");
  await dialog.locator("#z-fee").fill("45");
  await dialog.getByRole("button", { name: "Save zone" }).click();
  await toast(page, "Zone saved");
  await reload(page);
  await expect(zone).toContainText("Fee ₹45");
  await expect(zone).toContainText("700106");

  await page.getByRole("switch", { name: "E2E Zone active" }).click();
  await toast(page, "Zone paused");
  await reload(page);
  await expect(page.getByRole("switch", { name: "E2E Zone active" })).not.toBeChecked();

  await page.getByRole("button", { name: "Delete E2E Zone" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await toast(page, "Zone deleted");
  await expect(zone).toHaveCount(0);
});

test("business hours · weekly hours, copy to all and a special date persist", async ({ page }) => {
  await adminLogin(page);
  await go(page, "/business-hours");
  const day = (name: string) => page.locator("li").filter({ has: page.getByText(name, { exact: true }) });
  // Make Monday 10:00–22:30 and copy it to every day.
  const monday = day("Monday");
  if (!(await page.getByRole("switch", { name: "Monday open" }).isChecked())) await page.getByRole("switch", { name: "Monday open" }).click();
  if ((await monday.getByLabel("Opens").count()) === 0) await monday.getByRole("button", { name: "Add time slot" }).click();
  await monday.getByLabel("Opens").first().fill("10:00");
  await monday.getByLabel("Closes").first().fill("22:30");
  await monday.getByRole("button", { name: "Copy to all" }).click();
  await expect(day("Sunday").getByLabel("Closes").first()).toHaveValue("22:30");

  await page.getByRole("button", { name: "Add date" }).click();
  const special = page.locator("input[type=date]").last();
  await special.fill("2026-12-25");
  await page.getByLabel("Note").last().fill("Christmas");
  await page.getByRole("button", { name: "Save hours" }).click();
  await toast(page, "Business hours saved");

  await reload(page);
  await expect(day("Sunday").getByLabel("Closes").first()).toHaveValue("22:30");
  await expect(day("Wednesday").getByLabel("Opens").first()).toHaveValue("10:00");
  await expect(page.locator("input[type=date]").last()).toHaveValue("2026-12-25");
  await expect(page.getByLabel("Note").last()).toHaveValue("Christmas");

  // Remove the special date again.
  await page.getByRole("button", { name: "Remove date" }).last().click();
  await page.getByRole("button", { name: "Save hours" }).click();
  await toast(page, "Business hours saved");
  await reload(page);
  await expect(page.getByText("No special dates.")).toBeVisible();
});

test("settings · profile, tax, payments and notifications persist after reload", async ({ page, browser }) => {
  await adminLogin(page);
  await go(page, "/settings");
  await page.locator("#bp-phone:visible").fill("9123456780");
  await page.locator("#bp-addr:visible").fill("12 Lake Road");
  await page.getByRole("button", { name: "Save profile" }).click();
  await toast(page, "Business profile saved");

  await page.locator("#tx-rate:visible").fill("5");
  await page.getByRole("button", { name: "Save tax" }).click();
  await toast(page, "Tax settings saved");

  await page.locator("#pay-codmax:visible").fill("3000");
  await page.getByRole("button", { name: "Save payments" }).click();
  await toast(page, "Payment settings saved");

  await page.locator("#n-email:visible").fill("owner@biteaffairs.test");
  await page.locator("label").filter({ hasText: "Sound alerts for new orders" }).getByRole("switch").click();
  await page.getByRole("button", { name: "Save notifications" }).click();
  await toast(page, "Notification settings saved");

  await reload(page);
  await expect(page.locator("#bp-phone:visible")).toHaveValue("9123456780");
  await expect(page.locator("#bp-addr:visible")).toHaveValue("12 Lake Road");
  await expect(page.locator("#tx-rate:visible")).toHaveValue("5");
  await expect(page.locator("#pay-codmax:visible")).toHaveValue("3000");
  await expect(page.locator("#n-email:visible")).toHaveValue("owner@biteaffairs.test");
  await expect(page.locator("label").filter({ hasText: "Sound alerts for new orders" }).getByRole("switch")).not.toBeChecked();
  // The shop-wide default mutes the new-order chime on a device that hasn't chosen yet.
  await expect(page.getByRole("button", { name: "Enable new-order sound" })).toBeVisible({ timeout: 15_000 });

  // The storefront shows the new contact phone.
  const customer = await browser.newPage();
  await onStore(customer, "/contact", () => expect(customer.getByText(/91234\s?56780/).first()).toBeVisible({ timeout: 3000 }));

  // Restore defaults so later storefront tests aren't affected.
  await page.locator("#tx-rate:visible").fill("0");
  await page.getByRole("button", { name: "Save tax" }).click();
  await toast(page, "Tax settings saved");
  await page.locator("#pay-codmax:visible").fill("0");
  await page.getByRole("button", { name: "Save payments" }).click();
  await toast(page, "Payment settings saved");
  await page.locator("label").filter({ hasText: "Sound alerts for new orders" }).getByRole("switch").click();
  await page.getByRole("button", { name: "Save notifications" }).click();
  await toast(page, "Notification settings saved");
});

test("website content · homepage, testimonials and social links", async ({ page, browser }) => {
  await adminLogin(page);
  await go(page, "/website-content");
  await expect(page.locator("a", { hasText: "Preview site" })).toHaveAttribute("href", /^http:\/\/localhost:\d+\/$/);
  await expect(page.locator("a", { hasText: "Preview site" })).not.toHaveAttribute("href", new RegExp(`:${process.env.E2E_ADMIN_PORT ?? "3101"}/`));
  await page.locator("#ann:visible").fill("E2E announcement: free dessert today");
  const annSwitch = page.locator("label").filter({ hasText: "Show announcement" }).getByRole("switch");
  if (!(await annSwitch.isChecked())) await annSwitch.click();
  await page.getByRole("button", { name: /^Save/ }).last().click();
  await toast(page, "Website updated");
  await reload(page);
  await expect(page.locator("#ann:visible")).toHaveValue("E2E announcement: free dessert today");
  const customer = await browser.newPage();
  await onStore(customer, "/", () => expect(customer.getByText("E2E announcement: free dessert today").first()).toBeVisible({ timeout: 3000 }));

  // Testimonials
  await page.getByRole("tab", { name: "Testimonials" }).click();
  await page.getByRole("button", { name: "Add testimonial" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#t-name").fill("E2E Priya");
  await dialog.locator("#t-quote").fill("Best momos in town");
  await dialog.getByRole("button", { name: /^Save/ }).click();
  await toast(page, "Testimonial saved");
  await expect(page.getByText("Best momos in town")).toBeVisible();
  await page.getByRole("button", { name: "Edit testimonial from E2E Priya" }).click();
  await dialog.locator("#t-quote").fill("Best momos in Kolkata");
  await dialog.getByRole("button", { name: /^Save/ }).click();
  await toast(page, "Testimonial saved");
  await expect(page.getByText("Best momos in Kolkata")).toBeVisible();
  await page.getByRole("button", { name: "Delete testimonial from E2E Priya" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await toast(page, "Testimonial deleted");
  await expect(page.getByText("Best momos in Kolkata")).toHaveCount(0);

  // Social links
  await page.getByRole("tab", { name: "Social links" }).click();
  await page.locator("#s-instagram:visible").fill("https://instagram.com/e2e-bite");
  await page.getByRole("button", { name: /^Save/ }).last().click();
  await toast(page, "Social links saved");
  await reload(page);
  await page.getByRole("tab", { name: "Social links" }).click();
  await expect(page.locator("#s-instagram:visible")).toHaveValue("https://instagram.com/e2e-bite");
});

test("media · without Cloudinary the library explains how to connect and pickers offer menu photos", async ({ page }) => {
  await adminLogin(page);
  await go(page, "/media");
  await expect(page.getByRole("heading", { name: "Connect Cloudinary to upload media" })).toBeVisible();
  // Image pickers still work with bundled photos.
  await go(page, "/categories");
  await page.getByRole("button", { name: /^Edit / }).first().click();
  const dialog = page.getByRole("dialog").first();
  await dialog.getByRole("button", { name: /^(Change|Choose)$/ }).click();
  const picker = page.getByRole("dialog", { name: "Choose media" });
  await expect(picker.getByRole("tab", { name: "Menu photos" })).toBeVisible();
  await expect(picker.getByRole("tab", { name: "Upload" })).toHaveCount(0);
  await picker.getByRole("tab", { name: "Paste link" }).click();
  await expect(picker.getByText(/Cloudinary isn.t configured/)).toBeVisible();
});

test("live feed · a store order appears on the dashboard, kitchen display, deliveries and payments", async ({ page, browser }) => {
  const errors = watchConsole(page);
  await adminLogin(page);
  await go(page, "/kitchen-display");
  await expect(page.getByText("● Live")).toBeVisible({ timeout: 15_000 });

  const customer = await browser.newPage();
  const orderNumber = await placeGuestOrder(customer, { name: "Kitchen Test", phone: "9830077777" });

  // New order toast + card in the "New" column without reloading.
  await toast(page, `New order ${orderNumber}`);
  const card = (col: string) => page.getByRole("region", { name: col, exact: true }).locator("article").filter({ hasText: orderNumber });
  await expect(card("New")).toBeVisible({ timeout: 20_000 });
  await card("New").getByRole("button", { name: "Accept" }).click();
  await expect(card("To cook")).toBeVisible({ timeout: 15_000 });
  await card("To cook").getByRole("button", { name: "Start preparing" }).click();
  await expect(card("Cooking")).toBeVisible({ timeout: 15_000 });
  await card("Cooking").getByRole("button", { name: "Mark ready" }).click();
  await expect(card("Ready")).toBeVisible({ timeout: 15_000 });

  // Deliveries board
  await go(page, "/deliveries");
  const delivery = page.locator("article").filter({ hasText: orderNumber });
  await expect(delivery).toBeVisible();
  await delivery.getByRole("button", { name: "Start delivery" }).click();
  await expect(delivery.getByRole("button", { name: "Mark delivered" })).toBeVisible({ timeout: 15_000 });
  await delivery.getByRole("button", { name: "Mark delivered" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: /delivered/i }).click();
  await expect(page.locator("article").filter({ hasText: orderNumber })).toHaveCount(0, { timeout: 15_000 });
  // Cash still to be collected shows up without a manual reload.
  await expect(page.locator("li").filter({ hasText: orderNumber }).filter({ has: page.getByRole("button", { name: /record cash/i }) })).toBeVisible({ timeout: 15_000 });

  // Payments page lists the COD payment and filters work.
  await go(page, "/payments");
  await expect(page.getByRole("link", { name: orderNumber })).toBeVisible();
  await page.getByLabel("Search by order number").fill(orderNumber);
  await page.getByLabel("Method").selectOption("RAZORPAY");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/method=RAZORPAY/);
  await settled(page);
  await expect(page.getByRole("link", { name: orderNumber })).toHaveCount(0);
  await page.getByRole("button", { name: "Clear" }).click();
  await expect(page.getByLabel("Search by order number")).toHaveValue("");
  await page.getByRole("group", { name: "Date range" }).getByRole("button", { name: "Today" }).click();
  await expect(page).toHaveURL(/range=today/);
  await settled(page);
  await expect(page.getByRole("link", { name: orderNumber })).toBeVisible();

  // Dashboard recent orders
  await go(page, "/dashboard");
  await expect(page.getByRole("link", { name: new RegExp(orderNumber) }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("notifications · list, unread filter and mark all read", async ({ page }) => {
  await adminLogin(page);
  await go(page, "/notifications");
  await expect(page.getByText(/New order BA/).first()).toBeVisible();
  await page.getByRole("link", { name: /^Unread/ }).click();
  await expect(page).toHaveURL(/filter=unread/);
  await settled(page);
  await expect(page.getByText(/New order BA/).first()).toBeVisible();
  await page.getByRole("button", { name: "Mark all read" }).click();
  await expect(page.getByText("0 unread").or(page.getByText("You're all caught up"))).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel("Notifications (0 unread)")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("link", { name: "All", exact: true }).click();
  await expect(page.getByText(/New order BA/).first()).toBeVisible();
  await expect(page.getByText("0 unread")).toBeVisible();
});

test("expenses · add, edit, delete and export CSV", async ({ page }) => {
  await adminLogin(page);
  await go(page, "/expenses");
  await page.getByRole("button", { name: "Add expense" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#x-cat").selectOption({ index: 0 });
  await dialog.locator("#x-amt").fill("1234");
  await dialog.locator("#x-vendor").fill("E2E Vendor");
  await dialog.locator("#x-mode").selectOption("UPI");
  await dialog.getByRole("button", { name: "Save expense" }).click();
  await toast(page, "Expense saved");
  const row = page.locator("tr").filter({ hasText: "E2E Vendor" });
  await expect(row).toContainText("₹1,234");
  await expect(row).toContainText("UPI");

  await row.getByRole("button", { name: "Edit expense" }).click();
  await dialog.locator("#x-amt").fill("1500");
  await dialog.getByRole("button", { name: "Save expense" }).click();
  await toast(page, "Expense saved");
  await reload(page);
  await expect(row).toContainText("₹1,500");

  const downloadPromise = page.waitForEvent("download");
  await page.getByText("Export CSV").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^bite-affairs-profit-\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = await (await import("node:fs/promises")).readFile((await download.path())!, "utf8");
  expect(csv).toContain("E2E Vendor");

  await row.getByRole("button", { name: "Delete expense" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await toast(page, "Expense deleted");
  await expect(row).toHaveCount(0);
});

test("analytics · date range presets and custom range", async ({ page }) => {
  const errors = watchConsole(page);
  await adminLogin(page);
  await go(page, "/analytics");
  const range = page.getByRole("group", { name: "Date range" });
  for (const [label, key] of [["Today", "today"], ["Yesterday", "yesterday"], ["7 days", "7d"], ["This month", "month"]] as const) {
    await range.getByRole("button", { name: label }).click();
    await expect(page).toHaveURL(new RegExp(`range=${key}`));
    await settled(page);
    await expect(range.getByRole("button", { name: label })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0, { timeout: 15_000 });
  }
  await range.getByRole("button", { name: "Custom" }).click();
  await page.getByLabel("From date").fill("2026-10-01");
  await page.getByLabel("To date").fill("2026-10-15");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/range=custom&from=2026-10-01&to=2026-10-15/);
  await settled(page);
  await expect(page.getByText("2026-10-01 → 2026-10-15").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("activity logs · admin actions are logged and can be filtered", async ({ page }) => {
  await adminLogin(page);
  await go(page, "/activity-logs");
  await expect(page.locator("tbody tr").first()).toBeVisible();
  await page.getByLabel("Area").selectOption("category");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/entity=category/);
  await settled(page);
  await expect(page.getByText("Created category E2E Desserts").first()).toBeVisible();
  await expect(page.getByText("Reordered categories").first()).toBeVisible();
  await expect(page.getByText(/coupon E2EFLAT50/)).toHaveCount(0);

  await page.getByLabel("Area").selectOption("coupon");
  await page.getByLabel("Search activity").fill("deleted");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/entity=coupon/);
  await settled(page);
  await expect(page.getByText("Deleted coupon E2EFLAT50").first()).toBeVisible();
  await expect(page.getByText("Created coupon E2EFLAT50")).toHaveCount(0);

  await page.getByRole("button", { name: "Clear" }).click();
  await expect(page).toHaveURL(/\/activity-logs$/);
  await settled(page);
  await expect(page.getByLabel("Search activity")).toHaveValue("");

  // A date range with no activity
  await page.getByRole("group", { name: "Date range" }).getByRole("button", { name: "Custom" }).click();
  await page.getByLabel("From date").fill("2020-01-01");
  await page.getByLabel("To date").fill("2020-01-02");
  await page.getByRole("button", { name: "Apply" }).last().click();
  await expect(page.getByText("No activity found")).toBeVisible();
});

test("customers & reviews · a registered customer's review is moderated; notes, reset link and disabling work", async ({ page, browser }) => {
  test.setTimeout(150_000);
  const n = Date.now().toString().slice(-8);
  const c = { name: "Meera Review", phone: `96${n}`, email: `meera.${n}@example.test`, password: "Secret1234" };
  const customer = await browser.newPage();
  await customer.goto("/register");
  await customer.getByLabel("Full name").fill(c.name);
  await customer.getByLabel("Mobile number").fill(c.phone);
  await customer.getByLabel("Email (optional)").fill(c.email);
  await customer.getByLabel("Password", { exact: true }).fill(c.password);
  await customer.getByRole("button", { name: "Create account" }).click();
  await expect(customer).toHaveURL(/\/account/, { timeout: 30_000 });
  const orderNumber = await placeGuestOrder(customer, { name: c.name, phone: c.phone });

  // Admin delivers the order.
  await adminLogin(page);
  await go(page, "/orders");
  await page.getByRole("link", { name: new RegExp(orderNumber) }).first().click();
  await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}/);
  await settled(page);
  const orderId = page.url().match(/orders\/([0-9a-f-]{36})/)![1];
  for (const label of ["Accept", "Start preparing", "Mark ready", "Out for delivery", "Mark delivered"]) {
    const button = page.getByRole("button", { name: new RegExp(`^${label}`) }).first();
    await expect(button).toBeEnabled({ timeout: 15_000 });
    await button.click();
    const confirm = page.getByRole("alertdialog").getByRole("button", { name: new RegExp(label, "i") });
    if (await confirm.isVisible().catch(() => false)) await confirm.click();
    await expect(page.getByRole("button", { name: new RegExp(`^${label}`) })).toHaveCount(0, { timeout: 15_000 });
  }

  // Customer reviews the item.
  await customer.goto(`/account/orders/${orderId}`);
  await customer.getByRole("button", { name: "Write review" }).first().click();
  await customer.getByRole("radio", { name: "5 stars" }).or(customer.getByRole("button", { name: "5 stars" })).first().click();
  await customer.getByPlaceholder("How was it? (optional)").fill(`Lovely crust ${n}`);
  await customer.getByRole("button", { name: "Submit review" }).click();
  await toast(customer, "Thanks!");

  // Moderation: reply, approve (appears on the product page), hide, delete.
  await go(page, "/reviews");
  const review = page.locator("li").filter({ hasText: `Lovely crust ${n}` });
  await expect(review).toBeVisible();
  await expect(review).toContainText("Awaiting approval");
  await review.getByRole("button", { name: "Reply" }).click();
  await review.getByRole("textbox").fill("Thank you, Meera!");
  await review.getByRole("button", { name: "Save reply" }).click();
  await toast(page, "Saved");
  await expect(review).toContainText("Thank you, Meera!");
  await review.getByRole("button", { name: "Approve" }).click();
  await toast(page, "Review published");
  await page.getByRole("tab", { name: /Approved/ }).click();
  await expect(review).toContainText("Published");
  await onStore(customer, "/food/margaretta-pizza", () => expect(customer.getByText(`Lovely crust ${n}`)).toBeVisible({ timeout: 3000 }));
  await review.getByRole("button", { name: "Hide" }).click();
  await toast(page, "Review hidden");
  await page.getByRole("tab", { name: /Hidden/ }).click();
  await expect(review).toContainText("Hidden");
  await review.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await toast(page, "Review deleted");
  await expect(review).toHaveCount(0);

  // Customers list → detail
  await go(page, "/customers");
  await page.getByLabel("Search customers").fill(c.phone);
  await page.getByRole("button", { name: "Apply" }).click();
  await page.getByRole("link", { name: c.name }).first().click();
  await expect(page.getByRole("heading", { name: c.name })).toBeVisible();
  await expect(page.getByText(orderNumber).first()).toBeVisible();

  // Notes
  await page.getByLabel("Customer notes").fill("Allergic to peanuts");
  await page.getByRole("button", { name: "Save notes" }).click();
  await toast(page, "Notes saved");
  await expect(page.getByRole("button", { name: "Save notes" })).toBeDisabled();
  await reload(page);
  await expect(page.locator("textarea[aria-label='Customer notes']:visible")).toHaveValue("Allergic to peanuts");

  // The password reset link points at the storefront, not the admin.
  await page.getByRole("button", { name: "Create password reset link" }).click();
  await expect(page.getByLabel("Password reset link")).toHaveValue(new RegExp(`^http://localhost:${process.env.E2E_PORT ?? "3100"}/reset-password\\?token=`));
  const resetUrl = await page.getByLabel("Password reset link").inputValue();

  // Disable → the customer is signed out and can't use the account; enable again.
  await page.getByRole("button", { name: "Disable account" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Disable" }).click();
  await toast(page, "Account disabled");
  await expect(page.getByText("account disabled")).toBeVisible();
  await customer.goto("/account");
  await expect(customer).toHaveURL(/\/login/, { timeout: 15_000 });
  await reload(page);
  await page.getByRole("button", { name: "Enable account" }).click();
  await toast(page, "Account enabled");
  await expect(page.getByText("Registered customer")).toBeVisible();

  // The reset link opens the storefront's reset form.
  await customer.goto(resetUrl);
  await expect(customer.getByRole("button", { name: /reset|update|save/i }).first()).toBeVisible();

  // Guests are listed separately.
  await go(page, "/customers?type=guest");
  await expect(page.getByRole("link", { name: "Kitchen Test" }).first()).toBeVisible();
});
