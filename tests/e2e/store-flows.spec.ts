import { expect, test as base, type Page } from "@playwright/test";
import { placeGuestOrder } from "./helpers";

/**
 * Customer storefront flows beyond the basics in customer.spec.ts / auth.spec.ts:
 * signed-in checkout with saved addresses, address book, favourites, order history + reorder,
 * coupons, cart behaviour (incl. merge on sign-in), menu browsing, order lookup and static pages.
 * Every test fails on unexpected browser console errors.
 */
const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      // Sign-up is rate limited per IP; give each test its own client address.
      await page.context().setExtraHTTPHeaders({ "x-forwarded-for": randomIp() });
      const errors: string[] = [];
      page.on("console", (m) => {
        if (m.type() !== "error") return;
        const text = m.text();
        // A 404 document (the not-found test) logs a resource error; that one is expected.
        if (/Failed to load resource: the server responded with a status of 404/.test(text)) return;
        errors.push(text);
      });
      page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
      await use(errors);
      expect(errors, "browser console errors").toEqual([]);
    },
    { auto: true },
  ],
});

function randomIp() {
  const b = () => Math.floor(Math.random() * 250) + 1;
  return `10.${b()}.${b()}.${b()}`;
}

function newCustomer() {
  const n = `${Date.now()}${Math.floor(Math.random() * 100)}`.slice(-8);
  return { name: "Kabir Flow", phone: `96${n}`, email: `kabir.${n}@example.test`, password: "Secret1234" };
}
type Customer = ReturnType<typeof newCustomer>;

async function register(page: Page, c: Customer) {
  await page.goto("/register");
  await page.getByLabel("Full name").fill(c.name);
  await page.getByLabel("Mobile number").fill(c.phone);
  await page.getByLabel("Email (optional)").fill(c.email);
  await page.getByLabel("Password", { exact: true }).fill(c.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/account/, { timeout: 30_000 });
}

async function login(page: Page, c: Customer, callbackUrl?: string) {
  await page.goto(callbackUrl ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}` : "/login");
  await page.getByLabel("Mobile number or email").fill(c.phone);
  await page.getByLabel("Password", { exact: true }).fill(c.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(callbackUrl ? new RegExp(callbackUrl.replace(/\//g, "\\/")) : /\/account/, { timeout: 30_000 });
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page.getByRole("link", { name: "Sign in" }).first()).toBeVisible({ timeout: 15_000 });
}

async function addToCart(page: Page, slug: string) {
  await page.goto(`/food/${slug}`);
  await page.getByRole("button", { name: /^Add ·/ }).click();
  await expect(text(page, /added to (your )?cart/i).first()).toBeVisible();
}

/**
 * Visible text only. Next keeps recently visited routes mounted but hidden (and streams content through
 * hidden containers), so plain getByText can also match invisible copies.
 */
const text = (page: Page, t: string | RegExp) => page.getByText(t).filter({ visible: true });

/** The not-found UI; notFound() inside a streamed Suspense boundary keeps a 200 status plus a noindex tag. */
async function expectNotFound(page: Page, consoleErrors: string[]) {
  await expect(text(page, "This plate is empty")).toBeVisible();
  await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
  // React reports the server-aborted boundary as a recoverable error (#419) when notFound() runs mid-stream.
  for (let i = consoleErrors.length - 1; i >= 0; i--) if (consoleErrors[i].includes("#419")) consoleErrors.splice(i, 1);
}

/** No loading skeleton is left on screen once the page has settled. */
async function expectSettled(page: Page) {
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });
}

async function addAddress(page: Page, a: { label: string; house: string; street: string; pin: string; isDefault?: boolean }) {
  await page.getByRole("button", { name: "Add address" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Label (Home, Work…)").fill(a.label);
  await dialog.getByLabel("House / flat no.").fill(a.house);
  await dialog.getByLabel("Street / locality").fill(a.street);
  await dialog.getByLabel("PIN code").fill(a.pin);
  if (a.isDefault) await dialog.getByText("Set as default address").click();
  await dialog.getByRole("button", { name: "Save address" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("listitem").filter({ hasText: a.street })).toBeVisible();
}

test.describe("address book", () => {
  test("add, edit, set default and delete addresses", async ({ page }) => {
    await register(page, newCustomer());
    await page.goto("/account/addresses");
    await expectSettled(page);
    await expect(page.getByRole("heading", { name: "No saved addresses" })).toBeVisible();

    await addAddress(page, { label: "Home", house: "7A", street: "Lake Road", pin: "700016" });
    const home = page.getByRole("listitem").filter({ hasText: "Lake Road" });
    await expect(home.getByText("DEFAULT", { exact: true })).toBeVisible(); // the first address becomes the default

    await addAddress(page, { label: "Work", house: "Floor 3", street: "Camac Street", pin: "700017" });
    const work = page.getByRole("listitem").filter({ hasText: "Camac Street" });
    await expect(work.getByText("DEFAULT", { exact: true })).toHaveCount(0);

    // Edit
    await work.getByRole("button", { name: "Edit" }).click();
    await page.getByRole("dialog").getByLabel("Street / locality").fill("Shakespeare Sarani");
    await page.getByRole("dialog").getByRole("button", { name: "Save address" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "Shakespeare Sarani" })).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "Camac Street" })).toHaveCount(0);

    // Make default moves the badge
    const work2 = page.getByRole("listitem").filter({ hasText: "Shakespeare Sarani" });
    await work2.getByRole("button", { name: "Make default" }).click();
    await expect(work2.getByText("DEFAULT", { exact: true })).toBeVisible();
    await expect(home.getByText("DEFAULT", { exact: true })).toHaveCount(0);

    // Survives a reload (persisted)
    await page.reload();
    await expect(page.getByRole("listitem").filter({ hasText: "Shakespeare Sarani" }).getByText("DEFAULT", { exact: true })).toBeVisible();

    // Delete (with confirmation)
    await page.getByRole("listitem").filter({ hasText: "Lake Road" }).getByRole("button", { name: "Delete" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "Lake Road" })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("listitem").filter({ hasText: "Shakespeare Sarani" })).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "Lake Road" })).toHaveCount(0);
  });

  test("invalid address input shows field errors", async ({ page }) => {
    await register(page, newCustomer());
    await page.goto("/account/addresses");
    await page.getByRole("button", { name: "Add address" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Save address" }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/PIN|required|invalid|at least/i).first()).toBeVisible();
  });
});

test.describe("signed-in checkout", () => {
  test("uses the default saved address, can add a new one during checkout, and orders show in history with reorder", async ({ page }) => {
    const c = newCustomer();
    await register(page, c);
    await page.goto("/account/addresses");
    await addAddress(page, { label: "Home", house: "22", street: "Elgin Road", pin: "700017" });

    await addToCart(page, "margaretta-pizza");
    await page.goto("/checkout");
    await expectSettled(page);
    // Details are prefilled from the account and the default address is selected.
    await expect(page.getByLabel("Full name")).toHaveValue(c.name);
    await expect(page.getByLabel("Mobile number")).toHaveValue(c.phone);
    await expect(page.getByRole("radio", { name: /Elgin Road/ })).toHaveAttribute("aria-checked", "true");
    await expect(text(page, /We deliver to 700017/)).toBeVisible({ timeout: 20_000 });
    const place = page.getByRole("button", { name: /Place order · ₹221/ });
    await expect(place).toBeEnabled({ timeout: 20_000 });
    await place.click();
    await expect(page).toHaveURL(/\/order-success\/BA\d{6}-\d+/, { timeout: 30_000 });
    const first = decodeURIComponent(page.url().match(/order-success\/([^/?#]+)/)![1]);

    // Second order: a new address entered at checkout and saved to the account.
    await addToCart(page, "french-fries");
    await page.goto("/checkout");
    await page.getByRole("radio", { name: /Use a new address/ }).click();
    await page.getByLabel("House / flat no.").fill("5C");
    await page.getByLabel("Street / locality").fill("Ballygunge Place");
    await page.getByLabel("PIN code").fill("700016");
    await page.getByText("Save this address").click();
    const place2 = page.getByRole("button", { name: /Place order/ });
    await expect(place2).toBeEnabled({ timeout: 20_000 });
    await place2.click();
    await expect(page).toHaveURL(/\/order-success\//, { timeout: 30_000 });
    const second = decodeURIComponent(page.url().match(/order-success\/([^/?#]+)/)![1]);

    await page.goto("/account/addresses");
    await expect(page.getByRole("listitem").filter({ hasText: "Ballygunge Place" })).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "Elgin Road" })).toBeVisible();

    // Order history
    await page.goto("/account/orders");
    await expectSettled(page);
    await expect(page.getByRole("link", { name: new RegExp(first) })).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(second) })).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(first) })).toContainText("Margaretta Pizza");

    // Order detail
    await page.getByRole("link", { name: new RegExp(first) }).click();
    await expect(page).toHaveURL(/\/account\/orders\/[0-9a-f-]{36}$/);
    await expectSettled(page);
    await expect(text(page, `Order ${first}`)).toBeVisible();
    await expect(text(page, "Margaretta Pizza").first()).toBeVisible();
    await expect(text(page, /Elgin Road/).first()).toBeVisible();
    await expect(text(page, "₹221").first()).toBeVisible();

    // Reorder puts the items back in the (empty) cart at current prices.
    await page.getByRole("button", { name: "Reorder" }).click();
    await expect(page).toHaveURL(/\/cart$/);
    await expect(page.getByRole("link", { name: "Margaretta Pizza" }).first()).toBeVisible();
  });

  test("unknown order ids in the account show the not-found page", async ({ page, consoleErrors }) => {
    await register(page, newCustomer());
    for (const id of ["00000000-0000-4000-8000-000000000000", "not-a-uuid"]) {
      await page.goto(`/account/orders/${id}`);
      await expectNotFound(page, consoleErrors);
    }
  });
});

test.describe("checkout validation", () => {
  test("missing details are flagged and unserviceable PIN codes block the order until pickup is chosen", async ({ page }) => {
    await addToCart(page, "chicken-65");
    await page.goto("/checkout");
    await page.getByLabel("PIN code").fill("110001");
    await expect(text(page, /don.t deliver to 110001/).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /Place order/ })).toBeDisabled();

    // Pickup needs no address.
    await page.getByRole("radio", { name: /Pickup/ }).click();
    const place = page.getByRole("button", { name: /Place order/ });
    await expect(place).toBeEnabled({ timeout: 15_000 });
    await place.click();
    await expect(text(page, "Please enter your name")).toBeVisible();
    await expect(text(page, "Enter a valid 10-digit mobile number")).toBeVisible();
    await expect(page).toHaveURL(/\/checkout$/);

    await page.getByLabel("Full name").fill("Pick Up");
    await page.getByLabel("Mobile number").fill("+91 98300 55443");
    await place.click();
    await expect(page).toHaveURL(/\/order-success\//, { timeout: 30_000 });
    await expect(text(page, /pickup/i).first()).toBeVisible();
  });

  test("a guest order placed on this device is linked to the account on sign-up", async ({ page }) => {
    const orderNumber = await placeGuestOrder(page, { phone: "9830066554" });
    await register(page, newCustomer());
    await expect(text(page, /earlier order linked to your account/i)).toBeVisible({ timeout: 15_000 });
    await page.goto("/account/orders");
    await expect(page.getByRole("link", { name: new RegExp(orderNumber) })).toBeVisible();
    await page.goto("/account");
    await expect(page.getByRole("link", { name: /Orders/ }).filter({ hasText: "1" }).first()).toBeVisible();
  });
});

test.describe("coupons", () => {
  test("apply and remove a coupon at checkout; invalid codes are explained", async ({ page }) => {
    await addToCart(page, "margaretta-pizza");
    await page.goto("/checkout");
    await page.getByLabel("PIN code").fill("700016");

    await page.getByLabel("Coupon code").fill("NOPE99");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(text(page, /isn.t valid|not valid|invalid|expired/i).first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Remove coupon" }).click();

    await page.getByLabel("Coupon code").fill("welcome10");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(text(page, "WELCOME10")).toBeVisible();
    // 10% off ₹191 = ₹19.10 discount; total 191 - 19.10 + 30 delivery
    await expect(page.getByRole("button", { name: /Place order · ₹201\.90/ })).toBeVisible({ timeout: 15_000 });

    // The coupon survives a reload (kept with the cart).
    await page.reload();
    await expect(text(page, "WELCOME10")).toBeVisible();

    await page.getByRole("button", { name: "Remove coupon" }).click();
    await expect(text(page, "WELCOME10")).toHaveCount(0);
    await page.getByLabel("PIN code").fill("700016");
    await expect(page.getByRole("button", { name: /Place order · ₹221/ })).toBeVisible({ timeout: 15_000 });
  });

  test("a coupon applied in the cart is charged on the order", async ({ page }) => {
    await addToCart(page, "margaretta-pizza");
    await page.goto("/cart");
    await page.getByLabel("Coupon code").fill("WELCOME10");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(text(page, "WELCOME10")).toBeVisible();
    await expect(text(page, "−₹19.10").or(text(page, "-₹19.10")).first()).toBeVisible({ timeout: 15_000 });
    // placeGuestOrder adds a second pizza: 2 × ₹191 = ₹382, 10% off = ₹38.20, + ₹30 delivery = ₹373.80
    const orderNumber = await placeGuestOrder(page, { phone: "9830099887" });
    expect(orderNumber).toMatch(/^BA/);
    await expect(text(page, "₹373.80").first()).toBeVisible();
  });
});

test.describe("cart", () => {
  test("add, change quantity, remove, and persist across reloads", async ({ page }) => {
    await addToCart(page, "margaretta-pizza");
    await addToCart(page, "chicken-65");
    await page.goto("/cart");
    await expectSettled(page);
    const pizza = page.getByRole("listitem").filter({ hasText: "Margaretta Pizza" });
    await pizza.getByRole("button", { name: "Increase quantity" }).click();
    await expect(pizza.getByRole("group")).toContainText("2");
    await expect(pizza.getByText("₹382")).toBeVisible();

    await page.reload();
    await expect(page.getByRole("listitem").filter({ hasText: "Margaretta Pizza" }).getByRole("group")).toContainText("2");
    await expect(page.getByRole("listitem").filter({ hasText: "Chicken 65" })).toBeVisible();

    await page.getByRole("listitem").filter({ hasText: "Margaretta Pizza" }).getByRole("button", { name: "Decrease quantity" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "Margaretta Pizza" }).getByRole("group")).toContainText("1");
    await page.getByRole("button", { name: "Remove Chicken 65" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "Chicken 65" })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("listitem").filter({ hasText: "Chicken 65" })).toHaveCount(0);

    // Decreasing the last unit removes the line; the cart is then empty.
    await page.getByRole("listitem").filter({ hasText: "Margaretta Pizza" }).getByRole("button", { name: "Decrease quantity" }).click();
    await expect(text(page, "Your cart is empty")).toBeVisible();
  });

  test("the header cart drawer lists items and leads to checkout", async ({ page }) => {
    await addToCart(page, "chicken-65");
    await page.getByRole("button", { name: /Open cart, 1 item/ }).click();
    const drawer = page.getByRole("dialog", { name: "Your Cart" });
    await expect(drawer.getByText("Chicken 65").first()).toBeVisible();
    await drawer.getByRole("link", { name: /checkout/i }).click();
    await expect(page).toHaveURL(/\/checkout$/);
    await expect(drawer).toBeHidden();
    await expect(text(page, "1 × Chicken 65")).toBeVisible();
  });

  test("a signed-in customer's saved cart merges into a guest cart after sign-in", async ({ page, browser }) => {
    const c = newCustomer();
    await register(page, c);
    await addToCart(page, "chicken-65");
    // Wait for the debounced server sync.
    await page.waitForTimeout(2000);

    // A fresh browser (different device): guest adds something, then signs in.
    const other = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": randomIp() } });
    const p2 = await other.newPage();
    const errors: string[] = [];
    p2.on("pageerror", (e) => errors.push(e.message));
    await addToCart(p2, "french-fries");
    await login(p2, c);
    await p2.goto("/cart");
    await expect(p2.getByRole("listitem").filter({ hasText: "French Fries" })).toBeVisible();
    await expect(p2.getByRole("listitem").filter({ hasText: "Chicken 65" })).toBeVisible({ timeout: 15_000 });
    expect(errors).toEqual([]);
    await other.close();
  });
});

test.describe("favourites", () => {
  test("toggle from product page and menu, list them, and remove", async ({ page }) => {
    await register(page, newCustomer());
    await page.goto("/account/favourites");
    await expectSettled(page);
    await expect(page.getByRole("heading", { name: "No favourites yet" })).toBeVisible();

    await page.goto("/food/margaretta-pizza");
    const fav = page.getByRole("button", { name: "Add Margaretta Pizza to favourites" }).first();
    await fav.click();
    await expect(page.getByRole("button", { name: "Remove Margaretta Pizza from favourites" }).first()).toHaveAttribute("aria-pressed", "true");

    await page.goto("/menu/fries");
    await page.getByRole("button", { name: "Add French Fries to favourites" }).first().click();
    await expect(page.getByRole("button", { name: "Remove French Fries from favourites" }).first()).toBeVisible();

    await page.goto("/account/favourites");
    await expectSettled(page);
    await expect(text(page, "Margaretta Pizza").first()).toBeVisible();
    await expect(text(page, "French Fries").first()).toBeVisible();

    await page.getByRole("button", { name: "Remove French Fries from favourites" }).first().click();
    await expect(text(page, "French Fries")).toHaveCount(0);
    await page.reload();
    await expect(text(page, "Margaretta Pizza").first()).toBeVisible();
    await expect(text(page, "French Fries")).toHaveCount(0);
  });
});

test("favourites saved as a guest move into the account on sign-up", async ({ page }) => {
  await page.goto("/food/chicken-65");
  await page.getByRole("button", { name: "Add Chicken 65 to favourites" }).first().click();
  await expect(text(page, /saved on this device/i).first()).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Remove Chicken 65 from favourites" }).first()).toBeVisible();

  await register(page, newCustomer());
  await page.goto("/account/favourites");
  await expectSettled(page);
  await expect(page.getByRole("button", { name: "Remove Chicken 65 from favourites" }).first()).toBeVisible();
  // Stored in the account, not just the browser.
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole("button", { name: "Remove Chicken 65 from favourites" }).first()).toBeVisible();
});

test.describe("menu browsing", () => {
  test("category navigation, search and diet filter", async ({ page }) => {
    await page.goto("/menu");
    await expectSettled(page);
    await page.getByRole("link", { name: "Pizza" }).first().click();
    await expect(page.getByRole("heading", { name: "Pizza", level: 2 })).toBeInViewport();

    await page.goto("/menu/pizza");
    await expect(page.getByRole("heading", { name: "Pizza", level: 1 })).toBeVisible();
    await expect(text(page, "Margaretta Pizza").first()).toBeVisible();
    await page.getByLabel("Categories").getByRole("link", { name: "Momos" }).click();
    await expect(page).toHaveURL(/\/menu\/momos$/);
    await expect(page.getByRole("heading", { name: "Momos", level: 1 })).toBeVisible();

    await page.goto("/menu");
    await page.getByRole("searchbox", { name: "Search the menu" }).fill("chicken 65");
    await expect(text(page, "Chicken 65").first()).toBeVisible();
    await expect(text(page, "Margaretta Pizza")).toHaveCount(0);
    await page.getByRole("searchbox", { name: "Search the menu" }).fill("zzzz-nothing");
    await expect(text(page, "No dishes match")).toBeVisible();
    await page.getByRole("button", { name: "Clear all filters" }).click();
    await expect(text(page, "Margaretta Pizza").first()).toBeVisible();

    await page.getByRole("radio", { name: "Veg", exact: true }).click();
    await expect(text(page, "Chicken 65")).toHaveCount(0);
    await expect(text(page, "Margaretta Pizza").first()).toBeVisible();
  });

  test("unknown dish and category show the 404 page", async ({ page, consoleErrors }) => {
    for (const path of ["/food/does-not-exist", "/menu/no-such-category"]) {
      await page.goto(path);
      await expectNotFound(page, consoleErrors);
    }
    // Unmatched URLs get a real 404 status.
    expect((await page.goto("/no-such-page"))?.status()).toBe(404);
    await expect(text(page, "This plate is empty")).toBeVisible();
  });
});

test.describe("order lookup", () => {
  test("finds a guest order by number and phone, and rejects a wrong phone", async ({ page, context }) => {
    const phone = "9830077665";
    const orderNumber = await placeGuestOrder(page, { phone });
    // A fresh device: no remembered orders.
    await context.clearCookies();
    await page.evaluate(() => localStorage.clear());

    await page.goto("/track-order");
    await page.waitForLoadState("networkidle"); // submit only once the form is interactive
    await page.getByLabel("Order number").fill(orderNumber);
    await page.getByLabel("Mobile number used for the order").fill("9830000000");
    await page.getByRole("button", { name: "Find my order" }).click();
    await expect(text(page, /couldn.t find an order/i).first()).toBeVisible();

    await page.getByLabel("Mobile number used for the order").fill(phone);
    await page.getByRole("button", { name: "Find my order" }).click();
    await expect(page).toHaveURL(new RegExp(`/track-order/${orderNumber}\\?t=`), { timeout: 20_000 });
    await expect(text(page, `Order ${orderNumber}`)).toBeVisible();
    await expect(text(page, /Order Placed/i).first()).toBeVisible();

    // It's now remembered on this device.
    await page.goto("/track-order");
    await expect(page.getByRole("link", { name: new RegExp(orderNumber) })).toBeVisible();
  });
});

test.describe("static and auth pages", () => {
  test("forgot password submits without error", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.getByLabel("Email on your account").fill("nobody@example.test");
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("link", { name: "Back to sign in" })).toBeVisible({ timeout: 15_000 });
  });

  test("public pages render without console errors or stuck skeletons", async ({ page }) => {
    const pages: [string, RegExp][] = [
      ["/", /menu/i],
      ["/menu", /Margaretta Pizza/],
      ["/about", /./],
      ["/contact", /./],
      ["/privacy-policy", /privacy/i],
      ["/terms-and-conditions", /terms/i],
      ["/track-order", /Track/],
      ["/cart", /cart/i],
      ["/checkout", /cart is empty|Checkout/i],
      ["/login", /Sign in/i],
      ["/register", /Create account/i],
      ["/forgot-password", /reset/i],
    ];
    for (const [path, text] of pages) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBeLessThan(400);
      await expect(page.locator("main, body").first()).toContainText(text);
      await expectSettled(page);
      await expect(page.locator("h1").first(), `${path} has a heading`).toBeVisible();
    }
  });

  test("account pages render without console errors or stuck skeletons", async ({ page }) => {
    await register(page, newCustomer());
    for (const path of ["/account", "/account/orders", "/account/favourites", "/account/addresses", "/account/profile"]) {
      await page.goto(path);
      await expectSettled(page);
      await expect(page.getByRole("navigation", { name: "Account" })).toBeVisible();
    }
  });
});
