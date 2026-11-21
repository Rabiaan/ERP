import { chromium } from 'playwright';

const routes = [
  { path: '/login', label: 'login' },
];

const viewports = [
  { width: 1440, height: 900, label: 'desktop' },
  { width: 390, height: 844, label: 'mobile' },
];

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

for (const { path, label } of routes) {
  for (const { width, height, label: vpLabel } of viewports) {
    await page.setViewportSize({ width, height });
    await page.goto(`http://localhost:3000${path}`, { waitUntil: 'networkidle' });
    await page.screenshot({
      path: `docs/audit/${label}-${vpLabel}.png`,
      fullPage: true,
    });
    console.log(`Captured ${label}-${vpLabel}.png`);
  }
}

await browser.close();
