const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const file = 'file://' + path.resolve(__dirname, 'prototype.html');

  const viewports = [
    { name: 'desktop',  width: 1440, height: 900 },
    { name: 'tablet',   width: 768,  height: 1024 },
    { name: 'mobile',   width: 390,  height: 844  },
  ];

  for (const vp of viewports) {
    const page = await browser.newPage();
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto(file, { waitUntil: 'networkidle' });
    // full-page screenshot
    await page.screenshot({
      path: `prototype-${vp.name}.png`,
      fullPage: true,
    });
    console.log(`✓ prototype-${vp.name}.png  (${vp.width}×${vp.height})`);
    await page.close();
  }

  await browser.close();
})();
