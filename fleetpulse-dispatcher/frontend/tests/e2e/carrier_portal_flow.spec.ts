import { test, expect } from "@playwright/test";

test("portal renders at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/overview");
  await expect(page.getByText("Carrier Portal Overview")).toBeVisible();
});

test("accept invite page renders", async ({ page }) => {
  await page.goto("/accept-invite");
  await expect(page.getByText("Accept Portal Invite")).toBeVisible();
});

test("portal loads page renders", async ({ page }) => {
  await page.goto("/overview/loads");
  await expect(page.getByText("Load History")).toBeVisible();
});
