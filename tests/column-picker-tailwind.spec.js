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

async function openRegistry(page) {
  await page.goto(`${BASE}/index.html`, { waitUntil:'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('auth-ready')), { timeout:15000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.miColumnPicker), { timeout:15000 })
    .toBe(PICKER_VERSION);
  await expect(page.locator('.mi-app-shell')).toBeVisible();
  await expect(page.locator('#registryViewToolbar')).toBeVisible({ timeout:15000 });
  await expect(page.locator('[data-registry-filter-toggle]')).toBeVisible();
}

async function expectInsideViewport(page, selector) {
  const geometry = await page.evaluate(target => {
    const rect = document.querySelector(target).getBoundingClientRect();
    return {
      left:rect.left, right:rect.right, top:rect.top, bottom:rect.bottom,
      width:rect.width, height:rect.height, viewportWidth:innerWidth, viewportHeight:innerHeight,
      htmlWidth:document.documentElement.scrollWidth,
    };
  }, selector);
  expect(geometry.left).toBeGreaterThanOrEqual(-1);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  expect(geometry.top).toBeGreaterThanOrEqual(-1);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight + 1);
  expect(geometry.htmlWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1);
}

async function exposeFilterPanel(page) {
  const trigger = page.locator('#colPickerBtn');
  if (await trigger.isVisible()) return trigger;

  const filterToggle = page.locator('[data-registry-filter-toggle]');
  await filterToggle.click();
  await expect(filterToggle).toHaveAttribute('aria-expanded', 'true');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.registryFiltersOpen)).toBe('true');
  await expect(page.locator('#registryFilterPanel')).toBeVisible();
  await expect(trigger).toBeVisible();
  return trigger;
}

async function ensureRepresentativeOptions(page) {
  await page.evaluate(labels => {
    const panel = document.getElementById('colPanel');
    if (!panel || panel.querySelectorAll(':scope > label').length >= labels.length) return;

    panel.querySelectorAll(':scope > label[data-column-picker-test-fixture]').forEach(label => label.remove());
    const dosage = panel.querySelector('.registry-dosage-picker-group');
    labels.forEach((text, index) => {
      const label = document.createElement('label');
      label.dataset.columnPickerTestFixture = 'true';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = index < 6 || index === 8 || index === 9;
      const span = document.createElement('span');
      span.textContent = text;
      label.append(input, span);
      panel.insertBefore(label, dosage || panel.querySelector('.mi-column-picker-empty') || null);
    });
    window.MedIndexColumnPicker?.refresh?.();
  }, REPRESENTATIVE_COLUMNS);

  await expect.poll(() => page.locator('#colPanel > label').count(), { timeout:5000 })
    .toBeGreaterThanOrEqual(REPRESENTATIVE_COLUMNS.length);
  await expect.poll(() => page.locator('#colPanel > label[data-mi-column-option]').count(), { timeout:5000 })
    .toBeGreaterThanOrEqual(REPRESENTATIVE_COLUMNS.length);
}

async function openPicker(page) {
  const trigger = await exposeFilterPanel(page);
  await ensureRepresentativeOptions(page);
  await expect(page.locator('#colPanel .registry-dosage-picker-group > label')).toHaveCount(2);

  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const dialog = page.getByRole('dialog', { name:'Zgjedhja e kolonave të regjistrit' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('data-mi-column-picker', PICKER_VERSION);
  return { trigger, dialog };
}

test.describe('Tailwind-style registry column picker', () => {
  test.use({ viewport:{ width:1280, height:900 } });

  test('desktop picker is compact, searchable and aligned', async ({ page }) => {
    await openRegistry(page);
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
        return { top:rect.top, left:rect.left, width:rect.width, height:rect.height };
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
    await expect(dialog.locator('.mi-column-picker-count')).toContainText('/');

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
    await openRegistry(page);
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
