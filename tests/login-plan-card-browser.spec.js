const { test, expect } = require('@playwright/test');

const cases = [
  { name:'desktop', viewport:{ width:1440, height:900 } },
  { name:'mobile', viewport:{ width:390, height:844 } },
];

for (const scenario of cases) {
  test(`Clinical+ card keeps bounded icons on ${scenario.name}`, async ({ page }) => {
    await page.setViewportSize(scenario.viewport);
    await page.goto('http://127.0.0.1:4173/login.html', { waitUntil:'domcontentloaded' });

    const card = page.locator('.plan-block');
    await expect(card).toBeVisible();
    await page.waitForFunction(() => document.documentElement.dataset.miClinicalPlan === '20260805-3');

    const geometry = await page.evaluate(() => {
      const card = document.querySelector('.plan-block');
      const kicker = document.querySelector('.plan-kicker-icon');
      const ctaIcon = document.querySelector('.plan-cta i');
      const rect = node => {
        const value = node?.getBoundingClientRect();
        return value ? {
          top:value.top,
          right:value.right,
          bottom:value.bottom,
          left:value.left,
          width:value.width,
          height:value.height,
        } : null;
      };
      const cardRect = rect(card);
      const visibleSvgs = [...document.querySelectorAll('.plan-block svg')]
        .map(node => ({ rect:rect(node), style:getComputedStyle(node) }))
        .filter(item => item.rect && item.style.display !== 'none' && item.style.visibility !== 'hidden' && item.style.opacity !== '0');

      return {
        card:cardRect,
        kicker:rect(kicker),
        ctaIcon:rect(ctaIcon),
        visibleSvgs:visibleSvgs.map(item => item.rect),
        inlineLegacySvgCount:document.querySelectorAll('.plan-kicker-icon > svg, .plan-cta i > svg').length,
        viewport:{ width:innerWidth, height:innerHeight },
      };
    });

    expect(geometry.card).not.toBeNull();
    expect(geometry.kicker).not.toBeNull();
    expect(geometry.ctaIcon).not.toBeNull();
    expect(geometry.inlineLegacySvgCount).toBe(0);
    expect(geometry.kicker.width).toBeGreaterThanOrEqual(30);
    expect(geometry.kicker.height).toBeGreaterThanOrEqual(30);
    expect(geometry.kicker.width).toBeLessThanOrEqual(44);
    expect(geometry.kicker.height).toBeLessThanOrEqual(44);
    expect(geometry.ctaIcon.width).toBeLessThanOrEqual(48);
    expect(geometry.ctaIcon.height).toBeLessThanOrEqual(48);

    for (const svg of geometry.visibleSvgs) {
      expect(svg.width).toBeLessThanOrEqual(48);
      expect(svg.height).toBeLessThanOrEqual(48);
    }

    expect(geometry.kicker.left).toBeGreaterThanOrEqual(geometry.card.left);
    expect(geometry.kicker.right).toBeLessThanOrEqual(geometry.card.right);
    expect(geometry.kicker.top).toBeGreaterThanOrEqual(geometry.card.top);
    expect(geometry.kicker.bottom).toBeLessThanOrEqual(geometry.card.bottom);
    expect(geometry.card.left).toBeGreaterThanOrEqual(0);
    expect(geometry.card.right).toBeLessThanOrEqual(geometry.viewport.width);

    await page.screenshot({
      path:`/tmp/login-clinical-plan-${scenario.name}.png`,
      fullPage:true,
    });
  });
}
