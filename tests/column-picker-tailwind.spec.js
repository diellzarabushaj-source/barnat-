const { test, expect } = require('@playwright/test');

const BASE = 'http://127.0.0.1:4173';
const PICKER_VERSION = 'column-picker-tailwind-20260805-1';
const REPRESENTATIVE_COLUMNS = [
  'Nr',
  'Emri tregtar',
  'Substanca aktive',
  'ATC',
  'Klasa / Çka është',
  'Përdorimi / fjalë kyçe',
  'PDID',
  'Protokolli',
  'Fortësia',
  'Forma',
  'Paketimi',
  'Prodhuesi',
];

function optionMarkup(text, checked) {
  return `<label><input type="checkbox"${checked ? ' checked' : ''}><span>${text}</span></label>`;
}

async function mountHarness(page) {
  const options = REPRESENTATIVE_COLUMNS
    .map((text, index) => optionMarkup(text, index < 6 || index === 8 || index === 9))
    .join('');

  await page.setContent(`<!DOCTYPE html>
    <html lang="sq" data-mi-page="barnat">
      <head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head>
      <body>
        <div class="toolbar">
          <div class="col-picker">
            <button id="colPickerBtn" type="button" aria-haspopup="dialog" aria-controls="colPanel" aria-expanded="false">Kolonat ▾</button>
            <div id="colPanel" class="col-panel" role="dialog" aria-label="Zgjedhja e kolonave të regjistrit" aria-hidden="true">
              <div class="col-panel-actions">
                <button type="button">Shfaqi të gjitha</button>
                <button type="button">Fshihi të gjitha</button>
              </div>
              ${options}
              <div class="registry-dosage-picker-group">
                <div class="registry-dosage-picker-heading">Dozimi</div>
                <div class="registry-dosage-picker-note">Aktivizo vetëm kolonën që të duhet për një tabelë më të shpejtë për t’u lexuar.</div>
                ${optionMarkup('Dozimi · të rritur', true)}
                ${optionMarkup('Dozimi · fëmijë', true)}
              </div>
            </div>
          </div>
        </div>
        <script>
          document.getElementById('colPickerBtn').addEventListener('click', () => {
            document.getElementById('colPanel').classList.toggle('open');
          });
        </script>
      </body>
    </html>`);

  await page.addStyleTag({ url:`${BASE}/registry-column-picker-tailwind.css?v=20260805-1` });
  await page.addScriptTag({ url:`${BASE}/registry-column-picker-tailwind.js?v=20260805-1` });

  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.miColumnPicker), { timeout:5000 })
    .toBe(PICKER_VERSION);
  await expect(page.locator('#colPanel')).toHaveAttribute('data-mi-column-picker', PICKER_VERSION);
  await expect(page.locator('#colPanel > label[data-mi-column-option]')).toHaveCount(REPRESENTATIVE_COLUMNS.length);
  await expect(page.locator('#colPanel .registry-dosage-picker-group > label')).toHaveCount(2);
}

async function expectInsideViewport(page, selector) {
  const geometry = await page.evaluate(target => {
    const rect = document.querySelector(target).getBoundingClientRect();
    return {
      left:rect.left, right:rect.right, top:rect.top, bottom:rect.bottom,
      viewportWidth:innerWidth, viewportHeight:innerHeight,
      htmlWidth:document.documentElement.scrollWidth,
    };
  }, selector);
  expect(geometry.left).toBeGreaterThanOrEqual(-1);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  expect(geometry.top).toBeGreaterThanOrEqual(-1);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight + 1);
  expect(geometry.htmlWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1);
}

async function openPicker(page) {
  const trigger = page.locator('#colPickerBtn');
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const dialog = page.getByRole('dialog', { name:'Zgjedhja e kolonave të regjistrit' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-hidden', 'false');
  return { trigger, dialog };
}

test.describe('Tailwind-style registry column picker', () => {
  test('desktop picker is compact, searchable and aligned', async ({ page }) => {
    await page.setViewportSize({ width:1280, height:900 });
    await mountHarness(page);
    const { trigger, dialog } = await openPicker(page);
    await expectInsideViewport(page, '#colPanel');

    const layout = await dialog.evaluate(node => {
      const style = getComputedStyle(node);
      const actions = node.querySelector('.col-panel-actions');
      const buttons = [...actions.querySelectorAll('button')].map(button => {
        const rect = button.getBoundingClientRect();
        return { width:rect.width, height:rect.height };
      });
      const labels = [...node.querySelectorAll(':scope > label[data-mi-column-option]')].slice(0, 4).map(label => {
        const rect = label.getBoundingClientRect();
        return { width:rect.width, height:rect.height };
      });
      return {
        display:style.display,
        columns:style.gridTemplateColumns,
        autoRows:style.gridAutoRows,
        buttons,
        labels,
      };
    });

    expect(layout.display).toBe('grid');
    expect(layout.columns.split(' ').length).toBeGreaterThanOrEqual(2);
    expect(layout.autoRows).toMatch(/max-content|auto/);
    layout.buttons.forEach(button => {
      expect(button.height).toBeGreaterThanOrEqual(36);
      expect(button.height).toBeLessThanOrEqual(44);
      expect(button.width).toBeLessThan(190);
    });
    layout.labels.forEach(label => {
      expect(label.height).toBeGreaterThanOrEqual(44);
      expect(label.width).toBeGreaterThan(140);
    });

    await expect(dialog.locator('.registry-dosage-picker-group')).toBeVisible();
    await expect(dialog.locator('.mi-column-picker-count')).toContainText('10 / 14');

    const search = dialog.getByRole('searchbox', { name:'Kërko kolonën' });
    await search.fill('ATC');
    await expect(dialog.locator(':scope > label[data-mi-column-option]:not([hidden])')).toHaveCount(1);
    await expect(dialog.locator(':scope > label[data-mi-column-option]:not([hidden])').first()).toContainText('ATC');
    await expect(dialog.locator('.registry-dosage-picker-group')).toBeHidden();
    await search.fill('');
    await expect(dialog.locator('.registry-dosage-picker-group')).toBeVisible();

    await dialog.getByRole('button', { name:'Ruaj dhe mbyll' }).click();
    await expect(dialog).toBeHidden();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger).toBeFocused();
  });

  test('mobile picker stays inside viewport with one-column touch layout', async ({ page }) => {
    await page.setViewportSize({ width:390, height:844 });
    await mountHarness(page);
    const { dialog } = await openPicker(page);
    await expectInsideViewport(page, '#colPanel');

    const layout = await dialog.evaluate(node => {
      const style = getComputedStyle(node);
      const option = node.querySelector(':scope > label[data-mi-column-option]');
      const optionStyle = getComputedStyle(option);
      const optionRect = option.getBoundingClientRect();
      const closeRect = node.querySelector('.mi-column-picker-close').getBoundingClientRect();
      return {
        position:style.position,
        columns:style.gridTemplateColumns,
        optionColumns:optionStyle.gridTemplateColumns,
        optionHeight:optionRect.height,
        closeHeight:closeRect.height,
        scrollWidth:node.scrollWidth,
        clientWidth:node.clientWidth,
      };
    });

    expect(layout.position).toBe('fixed');
    expect(layout.columns.split(' ').length).toBe(1);
    expect(layout.optionColumns.split(' ').length).toBeGreaterThanOrEqual(2);
    expect(layout.optionHeight).toBeGreaterThanOrEqual(44);
    expect(layout.closeHeight).toBeGreaterThanOrEqual(38);
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
});
