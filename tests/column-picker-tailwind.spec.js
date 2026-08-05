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

async function mountDeterministicPicker(page) {
  await page.evaluate(({ labels, version }) => {
    const runtimePanel = document.getElementById('colPanel');
    const picker = runtimePanel?.closest('.col-picker');
    if (!runtimePanel || !picker) throw new Error('Runtime column picker is unavailable.');

    runtimePanel.classList.remove('open');
    runtimePanel.id = 'colPanelRuntimeOriginal';
    runtimePanel.removeAttribute('role');
    runtimePanel.removeAttribute('aria-label');
    runtimePanel.setAttribute('aria-hidden', 'true');

    const panel = document.createElement('div');
    panel.id = 'colPanel';
    panel.className = 'col-panel open';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Zgjedhja e kolonave të regjistrit');
    panel.setAttribute('aria-hidden', 'false');
    panel.dataset.columnPickerVisualFixture = 'true';

    const actions = document.createElement('div');
    actions.className = 'col-panel-actions';
    const showAll = document.createElement('button');
    showAll.type = 'button';
    showAll.textContent = 'Shfaqi të gjitha';
    const hideAll = document.createElement('button');
    hideAll.type = 'button';
    hideAll.textContent = 'Fshihi të gjitha';
    actions.append(showAll, hideAll);
    panel.appendChild(actions);

    labels.forEach((text, index) => {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = index < 6 || index === 8 || index === 9;
      const span = document.createElement('span');
      span.textContent = text;
      label.append(input, span);
      panel.appendChild(label);
    });

    const dosage = document.createElement('div');
    dosage.className = 'registry-dosage-picker-group';
    dosage.innerHTML = `
      <div class="registry-dosage-picker-heading">Dozimi</div>
      <div class="registry-dosage-picker-note">Aktivizo vetëm kolonën që të duhet për një tabelë më të shpejtë për t’u lexuar.</div>
      <label><input type="checkbox" checked><span>Dozimi · të rritur</span></label>
      <label><input type="checkbox" checked><span>Dozimi · fëmijë</span></label>`;
    panel.appendChild(dosage);
    picker.appendChild(panel);

    const trigger = document.getElementById('colPickerBtn');
    trigger?.setAttribute('aria-controls', 'colPanel');
    trigger?.setAttribute('aria-expanded', 'true');
    window.MedIndexColumnPicker?.refresh?.();
    document.documentElement.dataset.columnPickerVisualFixture = version;
  }, { labels:REPRESENTATIVE_COLUMNS, version:PICKER_VERSION });

  await expect(page.locator('#colPanel')).toHaveAttribute('data-mi-column-picker', PICKER_VERSION);
  await expect(page.locator('#colPanel > .col-panel-actions button')).toHaveCount(2);
  await expect(page.locator('#colPanel > label[data-mi-column-option]')).toHaveCount(REPRESENTATIVE_COLUMNS.length);
  await expect(page.locator('#colPanel .registry-dosage-picker-group > label')).toHaveCount(2);
}

async function openPicker(page) {
  const trigger = await exposeFilterPanel(page);
  await mountDeterministicPicker(page);
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
