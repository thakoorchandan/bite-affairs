import { expect, test, type Page } from "@playwright/test";
import { ADMIN, adminLogin, adminUrl } from "./helpers";

/** A fresh customer per run so the suite is repeatable against the same database. */
function newCustomer() {
  const n = Date.now().toString().slice(-8);
  return { name: "Asha Test", phone: `97${n}`, email: `asha.${n}@example.test`, password: "Secret1234" };
}

async function register(page: Page, c: ReturnType<typeof newCustomer>) {
  await page.goto("/register");
  await page.getByLabel("Full name").fill(c.name);
  await page.getByLabel("Mobile number").fill(c.phone);
  await page.getByLabel("Email (optional)").fill(c.email);
  await page.getByLabel("Password", { exact: true }).fill(c.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/account/, { timeout: 30_000 });
}

async function login(page: Page, identifier: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Mobile number or email").fill(identifier);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test.describe("customer accounts", () => {
  test("sign up, sign out from the account menu, sign back in with email and with mobile", async ({ page }) => {
    const c = newCustomer();
    await register(page, c);

    // The header account menu opens (it used to crash) and signs out.
    await page.getByRole("button", { name: "Account menu" }).click();
    await expect(page.getByText(`Hi, ${c.name.split(" ")[0]}`)).toBeVisible();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page.getByRole("link", { name: "Sign in" }).first()).toBeVisible({ timeout: 15_000 });

    // Signed-out users are sent to login from account pages.
    await page.goto("/account");
    await expect(page).toHaveURL(/\/login/);

    await login(page, c.email, c.password);
    await expect(page).toHaveURL(/\/account/, { timeout: 30_000 });
    await page.getByRole("navigation", { name: "Account" }).getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/localhost:\d+\/$/, { timeout: 15_000 });

    await login(page, c.phone, c.password);
    await expect(page).toHaveURL(/\/account/, { timeout: 30_000 });
  });

  test("wrong password and duplicate sign-up are rejected with clear messages", async ({ page }) => {
    const c = newCustomer();
    await register(page, c);
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page.getByRole("link", { name: "Sign in" }).first()).toBeVisible({ timeout: 15_000 });

    await login(page, c.email, "WrongPass999");
    await expect(page.getByRole("alert").filter({ hasText: /incorrect/i })).toBeVisible();

    await page.goto("/register");
    await page.getByLabel("Full name").fill("Someone Else");
    await page.getByLabel("Mobile number").fill(c.phone);
    await page.getByLabel("Password", { exact: true }).fill("Another1234");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText(/already/i).first()).toBeVisible();
  });

  test("profile edits are saved to the database and survive a reload", async ({ page }) => {
    const c = newCustomer();
    await register(page, c);
    await page.goto("/account/profile");
    await page.getByLabel("Full name").fill("Asha Renamed");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Profile updated")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Full name")).toHaveValue("Asha Renamed");
  });

  test("Continue with Google is offered and starts the Google OAuth redirect", async ({ page }) => {
    for (const path of ["/login", "/register"]) {
      await page.goto(path);
      await expect(page.getByRole("button", { name: /with Google/ })).toBeVisible();
    }
    await page.goto("/login");
    const [request] = await Promise.all([
      page.waitForRequest((r) => r.url().startsWith("https://accounts.google.com/"), { timeout: 30_000 }),
      page.getByRole("button", { name: "Continue with Google" }).click(),
    ]);
    const url = new URL(request.url());
    expect(url.searchParams.get("client_id")).toBeTruthy();
    expect(url.searchParams.get("redirect_uri")).toMatch(/\/api\/auth\/callback\/google$/);
  });

  test("a Google sign-in error sent back to /login is explained", async ({ page }) => {
    await page.goto("/login?error=OAuthCallback");
    await expect(page.getByRole("alert").filter({ hasText: /Google sign-in was cancelled or failed/ })).toBeVisible();
  });
});

test.describe("admin accounts", () => {
  test("admin signs in, signs out, and the panel is locked again", async ({ page }) => {
    await adminLogin(page);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    await page.goto(adminUrl("/dashboard"));
    await expect(page).toHaveURL(/\/login/);
  });

  test("wrong admin password is rejected, and customers can't use the admin", async ({ page }) => {
    await page.goto(adminUrl("/login"));
    await page.getByLabel("Email").fill(ADMIN.email);
    await page.getByRole("textbox", { name: "Password" }).fill("not-the-password1");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page.getByRole("alert").filter({ hasText: /incorrect/i })).toBeVisible();
    // The store's customer/Google providers don't exist on the admin app.
    const providers = await (await page.request.get(adminUrl("/api/auth/providers"))).json();
    expect(Object.keys(providers)).toEqual(["admin"]);
  });
});
