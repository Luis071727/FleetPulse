import { test, expect } from "@playwright/test";

test("dispatcher carriers page renders", async ({ page }) => {
  await page.goto("/carriers");
  await expect(page.getByText("Carrier Roster")).toBeVisible();
});

test("dispatcher invoices page renders", async ({ page }) => {
  await page.goto("/invoices");
  await expect(page.getByText("Invoice Tracker")).toBeVisible();
});

test("login page renders", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByText("Dispatcher Login")).toBeVisible();
});

test("signup page renders", async ({ page }) => {
  await page.goto("/signup");
  await expect(page.getByText("Dispatcher Signup")).toBeVisible();
});
