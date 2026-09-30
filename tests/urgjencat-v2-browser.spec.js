'use strict';

const { test, expect } = require('@playwright/test');

const BASE = 'http://127.0.0.1:4173';

const fixture = require('./urgjencat-browser-fixture.js');

async function installFixture(page) {
  await page.route('**/api/auth', async route => {
    if (route.request().method() !== 'GET') return route.continue();
    return route.fulfill({
      status:200,
      contentType:'application/json',
      body:JSON.stringify({
        authenticated:true,
        user:{name:'Dr. QA',email:'qa@example.test',role:'doctor'},
      }),
    });
  });

  await page.addInitScript(data => {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = function drxUrgjencatFixtureFetch(input, init = {}) {
      let url;
      try {
        const raw = typeof Request !== 'undefined' && input instanceof Request ? input.url : String(input);
        url = new URL(raw, location.href);
      } catch {
        return nativeFetch(input, init);
      }
      if (url.hostname === '4wdtp8cz.apicdn.sanity.io' && url.pathname.includes('/data/query/production')) {
        return Promise.resolve(new Response(JSON.stringify({ result:data }), {
          status:200,
          headers:{'Content-Type':'application/json; charset=utf-8'},
        }));
      }
      return nativeFetch(input, init);
    };
  }, fixture);
}

async function openUrgjencat(page, width = 1360, height = 900) {
  await page.setViewportSize({width,height});
  await installFixture(page);
  await page.goto(`${BASE}/urgjencat.html`, {waitUntil:'domcontentloaded'});
  await expect(page.locator('#appShell')).toHaveAttribute('aria-busy','false',{timeout:10000});
  await expect(page.locator('#emergencyDetail .ec-detail-inner')).toBeVisible({timeout:10000});
}

test.describe('Urgjencat V2 Sanity reader', () => {
  test.use({serviceWorkers:'block'});

  test('desktop renders chapters, lessons, Rx, tables, search and reader navigation', async ({page}) => {
    await openUrgjencat(page);

    await expect(page.locator('html')).toHaveAttribute('data-drx-app','urgjencat-v2');
    await expect(page.locator('#chapterTotal')).toHaveText('2');
    await expect(page.locator('#lessonTotal')).toHaveText('3');
    await expect(page.locator('#emergencyChapterSelect option')).toHaveCount(2);
    await expect(page.locator('#emergencyLessonSelect option')).toHaveCount(2);

    await expect(page.locator('#emergencyDetail h2')).toHaveText('Anafilaksia');
    await expect(page.locator('#emergencyDetail .ec-quick-summary')).toContainText('trajtim të menjëhershëm');
    await expect(page.locator('#emergencyDetail .ec-section')).toHaveCount(2);
    await expect(page.locator('#emergencyDetail .ec-rx')).toContainText('Adrenalinë 0.5 mg IM');
    await expect(page.locator('#emergencyDetail .ec-clinical-table')).toContainText('SpO₂');
    await expect(page.locator('#emergencyResultStatus')).toContainText('2 kapituj · 3 mësime');
    await expect(page.locator('#emergencyLessonPosition')).toHaveText('1 / 3');

    await page.locator('#nextLessonButton').click();
    await expect(page.locator('#emergencyDetail h2')).toHaveText('Shoku');
    await expect(page.locator('#emergencyLessonPosition')).toHaveText('2 / 3');

    await page.locator('#emergencySearch').fill('astma');
    await expect(page.locator('#emergencyResultStatus')).toContainText('1 mësime në 1 kapituj');
    await expect(page.locator('#emergencyDetail h2')).toHaveText('Astma akute');
    await expect(page.locator('#emergencyChapterSelect option')).toHaveCount(1);
    await expect(page.locator('#emergencyLessonSelect option')).toHaveCount(1);

    await page.locator('#emergencySearchClear').click();
    await expect(page.locator('#emergencyResultStatus')).toContainText('2 kapituj · 3 mësime');
  });

  test('320px keeps reader and controls inside the viewport', async ({page}) => {
    await openUrgjencat(page,320,720);

    const report = await page.evaluate(() => {
      const root = document.documentElement;
      const controls = [...document.querySelectorAll('#emergencyChapterSelect,#emergencyLessonSelect,#emergencySearch,#previousLessonButton,#nextLessonButton,#emergencySearchClear')]
        .filter(node => node.getClientRects().length)
        .map(node => {
          const rect=node.getBoundingClientRect();
          return {id:node.id,width:rect.width,height:rect.height,left:rect.left,right:rect.right};
        });
      return {
        overflow:root.scrollWidth-root.clientWidth,
        controls,
        detailWidth:document.querySelector('#emergencyDetail')?.getBoundingClientRect().width || 0,
      };
    });

    expect(report.overflow).toBeLessThanOrEqual(0);
    expect(report.detailWidth).toBeLessThanOrEqual(320);
    for (const control of report.controls) {
      expect(control.left, control.id).toBeGreaterThanOrEqual(-1);
      expect(control.right, control.id).toBeLessThanOrEqual(321);
      expect(control.height, control.id).toBeGreaterThanOrEqual(40);
    }
  });
});
