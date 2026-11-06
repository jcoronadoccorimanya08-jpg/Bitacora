// Genera los íconos (PNG y SVG) desde un solo diseño vectorial neutro: una libreta.
// Uso: npm run icons
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const out = new URL('../public/icons/', import.meta.url);
mkdirSync(out, { recursive: true });

function svg({ rounded }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#17302A"/>
      <stop offset="1" stop-color="#0D1412"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" ${rounded ? 'rx="116"' : ''} fill="url(#bg)"/>
  <rect x="156" y="124" width="200" height="264" rx="26" fill="none" stroke="#3BBFA7" stroke-width="24"/>
  <path d="M206 124 V388" stroke="#3BBFA7" stroke-width="20"/>
  <path d="M246 196 H310 M246 246 H310 M246 296 H290" stroke="#E4EDEA" stroke-width="18" stroke-linecap="round" opacity=".9"/>
</svg>`;
}

writeFileSync(new URL('favicon.svg', out), svg({ rounded: true }));

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
async function png(file, size, rounded) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg({ rounded }).replace('width="512" height="512"', `width="${size}" height="${size}"`)}</body></html>`,
  );
  await page.screenshot({ path: new URL(file, out).pathname, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}
await png('icon-192.png', 192, true);
await png('icon-512.png', 512, true);
await png('icon-maskable-512.png', 512, false);
await png('apple-touch-icon.png', 180, false);
await browser.close();
console.log('Íconos generados en public/icons/');
