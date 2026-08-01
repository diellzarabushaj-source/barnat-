const { test, expect } = require('@playwright/test');

const BASE = 'http://127.0.0.1:4173';
const PERFORMANCE_BASE = 'http://127.0.0.1:4174';

test.use({ serviceWorkers:'block', viewport:{ width:1440, height:900 } });

async function waitForStableRegistry(page, base = BASE, minimumRows = 1) {
  await page.goto(`${base}/index.html`, { waitUntil:'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.classList.contains('auth-ready'));

  await expect.poll(
    () => page.evaluate(() => ({
      stable:window.MEDINDEX_REGISTRY_TABLE_AUDIT?.stable === true,
      pending:document.getElementById('dataTable')?.dataset.registryUnifiedPending === 'true',
      preview:window.MedIndexCellPreview?.version || '',
    })),
    { timeout:30000, message:'tabela ose kontrolluesi i zgjerimit nuk u stabilizua' }
  ).toEqual({ stable:true, pending:false, preview:'registry-cell-preview-20260801-7' });

  if (minimumRows > 1) {
    await expect.poll(
      () => page.evaluate(minimum => {
        const body = document.getElementById('tbody');
        const table = document.getElementById('dataTable');
        const rows = body
          ? Array.from(body.children).filter(row => !row.querySelector('.empty-state')).length
          : 0;
        return {
          rows,
          stable:window.MEDINDEX_REGISTRY_TABLE_AUDIT?.stable === true,
          pending:table?.dataset.registryUnifiedPending === 'true',
        };
      }, minimumRows),
      { timeout:30000, message:'rreshtat realë të regjistrit nuk u renderuan para auditit të scroll-it' }
    ).toEqual({ rows:minimumRows, stable:true, pending:false });
  }
}

test('qeliza reale e dozimit të gjatë e rrit rreshtin inline pa hapur modal', async ({ page }) => {
  await page.goto(`${BASE}/index.html`, { waitUntil:'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.classList.contains('auth-ready'));

  await expect.poll(
    () => page.evaluate(() => window.MedIndexRegistryDosage?.clinicalStatus?.() || 'pending'),
    { timeout:30000, message:'integrimi klinik i dozimit nuk u bë gati' }
  ).toBe('ready');

  await expect.poll(
    () => page.evaluate(() => ({
      stable:window.MEDINDEX_REGISTRY_TABLE_AUDIT?.stable === true,
      pending:document.getElementById('dataTable')?.dataset.registryUnifiedPending === 'true',
      preview:window.MedIndexCellPreview?.version || '',
    })),
    { timeout:30000, message:'tabela ose kontrolluesi i zgjerimit nuk u stabilizua' }
  ).toEqual({ stable:true, pending:false, preview:'registry-cell-preview-20260801-7' });

  const cell = page.locator('#tbody > tr td[data-registry-column-key="dosage-adult"]').first();
  await expect(cell).toBeVisible({ timeout:30000 });
  await expect(cell).toContainText(/500|tablet|orë|nevoj/i);

  const previewResult = await cell.evaluate(node => {
    window.MedIndexCellPreview.refresh();
    return {
      text:String(node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim(),
      hasTrigger:Boolean(node.querySelector('.registry-cell-preview-trigger')),
      key:node.dataset.registryColumnKey,
    };
  });
  expect(previewResult.key).toBe('dosage-adult');
  expect(previewResult.text.length).toBeGreaterThan(54);
  expect(previewResult.hasTrigger).toBe(true);

  const trigger = cell.locator('.registry-cell-preview-trigger');
  await expect(trigger).toBeVisible({ timeout:10000 });
  const iconVisual = await trigger.evaluate(node => {
    const style = getComputedStyle(node, '::before');
    return {
      content:style.content,
      width:style.width,
      height:style.height,
      mask:style.webkitMaskImage || style.maskImage,
    };
  });
  expect(iconVisual.content).not.toBe('none');
  expect(iconVisual.width).toBe('16px');
  expect(iconVisual.height).toBe('16px');
  expect(iconVisual.mask).toContain('data:image/svg+xml');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');

  const row = cell.locator('xpath=ancestor::tr');
  const compactHeight = await row.evaluate(node => node.getBoundingClientRect().height);

  await trigger.focus();
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(row).toHaveAttribute('data-registry-row-expanded', 'true');
  await expect(row).toHaveClass(/registry-row-expanded/);
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#registryCellPreviewDialog')).toHaveCount(0);
  await expect(page.locator('dialog.registry-cell-preview-dialog')).toHaveCount(0);

  await expect.poll(async () => row.evaluate(node => node.getBoundingClientRect().height)).toBeGreaterThan(compactHeight);
  const expandedHeight = await row.evaluate(node => node.getBoundingClientRect().height);
  const expandedStyles = await cell.evaluate(node => {
    const style = getComputedStyle(node);
    return { height:node.getBoundingClientRect().height, overflow:style.overflow, whiteSpace:style.whiteSpace };
  });
  expect(expandedStyles.height).toBeGreaterThan(compactHeight);
  expect(expandedStyles.overflow).toBe('visible');
  expect(expandedStyles.whiteSpace).toBe('normal');

  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(row).toHaveAttribute('data-registry-row-expanded', 'false');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(async () => row.evaluate(node => node.getBoundingClientRect().height)).toBeLessThan(expandedHeight);

  await page.setViewportSize({ width:390, height:844 });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(row).toHaveAttribute('data-registry-row-expanded', 'true');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#registryCellPreviewDialog')).toHaveCount(0);
  await expect(page.locator('dialog.registry-cell-preview-dialog')).toHaveCount(0);

  const mobileGeometry = await row.evaluate(node => {
    const rect = node.getBoundingClientRect();
    return { left:rect.left, right:rect.right, height:rect.height, viewport:window.innerWidth };
  });
  expect(mobileGeometry.height).toBeGreaterThan(compactHeight);
  expect(mobileGeometry.left).toBeGreaterThanOrEqual(-1);
  expect(mobileGeometry.right).toBeLessThanOrEqual(mobileGeometry.viewport + 1);
});

test('një zoom zbulon tekstin e plotë në të gjitha kolonat e rreshtit', async ({ page }) => {
  await waitForStableRegistry(page);

  const substanceCell = page.locator(
    '#tbody > tr td[data-registry-column-key="active-substance"]',
    { hasText:'Montelukast (as 4.16 mg montelukast sodium)' }
  ).first();
  await expect(substanceCell).toBeVisible({ timeout:30000 });

  await substanceCell.evaluate(() => window.MedIndexCellPreview.refresh());
  const trigger = substanceCell.locator('.registry-cell-preview-trigger');
  await expect(trigger).toBeVisible({ timeout:10000 });

  const row = substanceCell.locator('xpath=ancestor::tr');
  const compactHeight = await row.evaluate(node => node.getBoundingClientRect().height);
  const compactWrapper = substanceCell.locator(':scope > span').first();
  await expect(compactWrapper).toBeVisible();

  const compactState = await compactWrapper.evaluate(node => {
    const style = getComputedStyle(node);
    return {
      lineClamp:style.webkitLineClamp,
      maxHeight:style.maxHeight,
      overflow:style.overflow,
      clipped:node.scrollHeight > node.clientHeight + 2,
    };
  });
  expect(compactState.clipped || !['none', 'unset', '0'].includes(compactState.lineClamp)).toBe(true);

  await trigger.click();
  await expect(row).toHaveAttribute('data-registry-row-expanded', 'true');
  await expect(row).toHaveClass(/registry-row-expanded/);
  await expect.poll(async () => row.evaluate(node => node.getBoundingClientRect().height)).toBeGreaterThan(compactHeight);

  const allTriggersExpanded = await row.evaluate(node =>
    Array.from(node.querySelectorAll('.registry-cell-preview-trigger'))
      .every(triggerNode => triggerNode.getAttribute('aria-expanded') === 'true')
  );
  expect(allTriggersExpanded).toBe(true);

  const expandedState = await compactWrapper.evaluate(node => {
    const style = getComputedStyle(node);
    return {
      lineClamp:style.webkitLineClamp,
      maxHeight:style.maxHeight,
      overflow:style.overflow,
      whiteSpace:style.whiteSpace,
      clipped:node.scrollHeight > node.clientHeight + 2 && style.overflow !== 'visible',
    };
  });
  expect(['none', 'unset', '0']).toContain(expandedState.lineClamp);
  expect(expandedState.maxHeight).toBe('none');
  expect(expandedState.overflow).toBe('visible');
  expect(expandedState.whiteSpace).toBe('normal');
  expect(expandedState.clipped).toBe(false);

  const revealAudit = await row.evaluate(node => {
    const textKeys = new Set([
      'trade-name', 'active-substance', 'drug-class', 'use', 'form',
      'dosage-adult', 'dosage-pediatric',
    ]);
    const failures = [];

    node.querySelectorAll('td[data-registry-column-key]').forEach(cell => {
      if (!textKeys.has(cell.dataset.registryColumnKey || '')) return;
      const candidates = [cell, ...cell.querySelectorAll('span,p,div,summary,details,ul,ol,li')];
      candidates.forEach(element => {
        if (!(element instanceof HTMLElement) || !element.getClientRects().length) return;
        if (element.matches('.registry-cell-preview-trigger,.registry-dosage-route,.population-verification-grid,.population-verification-row,.population-verification-icon')) return;
        if (element.closest('button,input,select,textarea')) return;

        const style = getComputedStyle(element);
        const clamp = style.webkitLineClamp;
        const clamped = Boolean(clamp && !['none', 'unset', '0'].includes(clamp));
        const clipped = (element.scrollHeight > element.clientHeight + 2 || element.scrollWidth > element.clientWidth + 2)
          && !['visible', 'clip'].includes(style.overflow)
          && !['visible', 'clip'].includes(style.overflowY);
        if (clamped || clipped) {
          failures.push({
            key:cell.dataset.registryColumnKey,
            tag:element.tagName,
            className:element.className,
            clamp,
            overflow:style.overflow,
            clientHeight:element.clientHeight,
            scrollHeight:element.scrollHeight,
          });
        }
      });
    });

    return failures;
  });
  expect(revealAudit).toEqual([]);
  await expect(substanceCell).toContainText('pas zgjerimit të rreshtit');

  await trigger.click();
  await expect(row).toHaveAttribute('data-registry-row-expanded', 'false');
});

test('tabela scrollon horizontalisht dhe vertikalisht pa ngrirë kolonat', async ({ page }) => {
  await waitForStableRegistry(page, PERFORMANCE_BASE, 50);

  const area = page.locator('#registryContent.table-wrap');
  const header = page.locator('#headerRow th[data-registry-column-key="trade-name"]');
  await expect(area).toBeVisible();
  await expect(header).toBeVisible();

  const initial = await area.evaluate(node => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return {
      overflowX:style.overflowX,
      overflowY:style.overflowY,
      touchAction:style.touchAction,
      clientWidth:node.clientWidth,
      clientHeight:node.clientHeight,
      scrollWidth:node.scrollWidth,
      scrollHeight:node.scrollHeight,
      top:rect.top,
    };
  });

  expect(['auto', 'scroll']).toContain(initial.overflowX);
  expect(['auto', 'scroll']).toContain(initial.overflowY);
  expect(initial.touchAction).toContain('pan-x');
  expect(initial.touchAction).toContain('pan-y');
  expect(initial.scrollWidth).toBeGreaterThan(initial.clientWidth + 2);
  expect(initial.scrollHeight).toBeGreaterThan(initial.clientHeight + 2);

  const headerTopBefore = await header.evaluate(node => node.getBoundingClientRect().top);
  await area.evaluate(node => {
    node.scrollTo({
      left:Math.min(420, Math.max(0, node.scrollWidth - node.clientWidth)),
      top:Math.min(520, Math.max(0, node.scrollHeight - node.clientHeight)),
      behavior:'instant',
    });
  });

  await expect.poll(
    () => area.evaluate(node => ({ left:node.scrollLeft, top:node.scrollTop })),
    { timeout:5000, message:'scroll area nuk lëvizi në të dy boshtet' }
  ).toMatchObject({ left:expect.any(Number), top:expect.any(Number) });

  const moved = await area.evaluate(node => ({ left:node.scrollLeft, top:node.scrollTop }));
  expect(moved.left).toBeGreaterThan(0);
  expect(moved.top).toBeGreaterThan(0);

  const headerState = await header.evaluate(node => {
    const style = getComputedStyle(node);
    return {
      position:style.position,
      top:node.getBoundingClientRect().top,
      left:style.left,
      right:style.right,
    };
  });
  expect(headerState.position).toBe('sticky');
  expect(Math.abs(headerState.top - headerTopBefore)).toBeLessThanOrEqual(3);
  expect(headerState.left).toBe('auto');
  expect(headerState.right).toBe('auto');

  const frozenDataCells = await page.locator('#tbody td[data-registry-column-key]').evaluateAll(cells =>
    cells.filter(cell => {
      const style = getComputedStyle(cell);
      return style.position === 'sticky' || style.position === 'fixed';
    }).map(cell => cell.dataset.registryColumnKey)
  );
  expect(frozenDataCells).toEqual([]);

  await area.evaluate(node => node.scrollTo({ left:0, top:0, behavior:'instant' }));
  await expect.poll(() => area.evaluate(node => ({ left:node.scrollLeft, top:node.scrollTop })))
    .toEqual({ left:0, top:0 });
});
