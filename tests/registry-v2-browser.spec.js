'use strict';

const { test, expect } = require('@playwright/test');

test.use({ serviceWorkers:'block' });

const rows = [
  {
    id:'11111111-1111-4111-8111-111111111111',
    registryNumber:1,
    pdid:'1001',
    tradeName:'PARACETAMOL TEST',
    activeSubstance:'Paracetamol',
    atc:'N02BE01',
    drugClass:'Analgesik / antipiretik',
    use:'Dhimbje dhe temperaturë',
    approvedPopulation:'Pediatric only',
    strength:'500 mg',
    form:'Tabletë',
    prescriptionNotation:'Tab. Paracetamol 500 mg',
    productStatus:'Gjenerik',
    retailPrice:2.45,
  },
  {
    id:'22222222-2222-4222-8222-222222222222',
    registryNumber:2,
    pdid:'1002',
    tradeName:'AMOXICILLIN TEST',
    activeSubstance:'Amoxicillin',
    atc:'J01CA04',
    drugClass:'Antibiotik beta-laktam',
    use:'Infeksione bakteriale',
    approvedPopulation:'Pediatric and adult both',
    strength:'500 mg',
    form:'Kapsulë',
    prescriptionNotation:'Caps. Amoxicillin 500 mg',
    productStatus:'Gjenerik',
    retailPrice:4.8,
  },
];

const visibleColumns = ['registry', 'name', 'substance', 'strength', 'form', 'prescription',
  'drugClass', 'use', 'population', 'atc', 'adultDose', 'pediatricDose', 'status', 'price'];

function filteredRows(url) {
  const q = String(url.searchParams.get('q') || '').toLowerCase();
  if (!q) return rows;
  return rows.filter(row => `${row.tradeName} ${row.activeSubstance} ${row.atc} ${row.use}`.toLowerCase().includes(q));
}

async function installApiMocks(page) {
  await page.route('**/api/auth**', async route => {
    if (new URL(route.request().url()).searchParams.get('scope') === 'ui-preferences') {
      return route.fulfill({ json:{ ok:true, registryColumns:visibleColumns } });
    }
    if (route.request().method() === 'DELETE') {
      return route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ ok:true }) });
    }
    return route.fulfill({
      status:200,
      contentType:'application/json',
      body:JSON.stringify({ authenticated:true, user:{ name:'Dr. Test User', email:'test@example.test' } }),
    });
  });

  await page.route('**/api/drug-search**', async route => {
    const url = new URL(route.request().url());
    const view = url.searchParams.get('view');
    if (view === 'registry-detail') {
      const row = rows.find(item => item.id === url.searchParams.get('id')) || rows[0];
      return route.fulfill({
        status:200,
        contentType:'application/json',
        body:JSON.stringify({ ok:true, row:{ ...row, packaging:'20 tableta', manufacturer:'Test Pharma', marketingAuthorizationHolder:'Test MAH', validity:'2026' } }),
      });
    }
    if (view === 'registry-page' || view === 'registry-search') {
      const result = filteredRows(url);
      return route.fulfill({
        status:200,
        headers:{ 'X-MedIndex-Data-Source':'neon-test' },
        contentType:'application/json',
        body:JSON.stringify({
          ok:true,
          rows:result,
          pagination:{ page:1, pageSize:50, total:result.length, totalPages:1, hasPrevious:false, hasNext:false },
          query:{ q:url.searchParams.get('q') || '', status:'', form:'', sort:'registry', direction:'asc', includeTotal:true },
        }),
      });
    }
    return route.fulfill({ status:400, contentType:'application/json', body:JSON.stringify({ error:'Unexpected test view' }) });
  });

  await page.route('**/api/dosage**', async route => {
    const url = new URL(route.request().url());
    const view = url.searchParams.get('view');
    if (view === 'cards') {
      const cards = rows.map(row => ({
        registryNumber:String(row.registryNumber),
        drugId:row.id,
        pdid:row.pdid,
        tradeName:row.tradeName,
        strength:row.strength,
        adultDose:row.id.startsWith('1') ? '500 mg çdo 8 orë sipas nevojës' : '500 mg çdo 8 orë',
        adultRoute:'PO',
        pediatricDose:row.id.startsWith('1') ? '15 mg/kg për dozë' : '20–40 mg/kg/ditë',
        pediatricRoute:'PO',
        sourceUrls:['https://example.test/source'],
      }));
      return route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ ok:true, cards }) });
    }
    if (view === 'card') {
      return route.fulfill({
        status:200,
        contentType:'application/json',
        body:JSON.stringify({
          ok:true,
          adult:[{ doseMg:'500', practicalUnit:'1 tabletë', route:'Orale', frequency:'çdo 8 orë sipas nevojës', max24hMg:3000 }],
          pediatric:[{ dose:'15 mg/kg për dozë', route:'Orale', maximum:'60 mg/kg/ditë' }],
          sources:['https://example.test/source'],
        }),
      });
    }
    return route.fulfill({ status:400, contentType:'application/json', body:JSON.stringify({ error:'Unexpected dosage view' }) });
  });
}

test.beforeEach(async ({ page }) => {
  await installApiMocks(page);
});

test('registry v2 desktop flow is stable and usable', async ({ page }) => {
  await page.setViewportSize({ width:1440, height:900 });
  await page.goto('http://127.0.0.1:4173/index.html');
  await expect(page.getByText('PARACETAMOL TEST')).toBeVisible();
  await expect(page.getByText('AMOXICILLIN TEST')).toBeVisible();
  await expect(page.locator('#registryRows [data-col="prescription"]').first()).toHaveText('Tab. Paracetamol 500 mg');
  await expect(page.locator('[data-dose-pediatric]').first()).toContainText('15 mg/kg për dozë');
  await expect(page.getByText('Analgesik / antipiretik')).toBeVisible();
  await expect(page.getByText('Dhimbje dhe temperaturë')).toBeVisible();
  await expect(page.getByText('Vetëm pediatrik')).toBeVisible();
  await expect(page.getByText('Të rritur + pediatrik')).toBeVisible();
  await expect(page.locator('tr.is-pediatric-only')).toHaveCount(1);
  await expect(page.locator('tr[data-population="pediatric-only"]')).toContainText('PARACETAMOL TEST');

  const authorities = await page.evaluate(() => ({
    styles:[...document.querySelectorAll('link[rel="stylesheet"]')].map(node => new URL(node.href).pathname),
    scripts:[...document.querySelectorAll('script[src]')].map(node => new URL(node.src).pathname),
  }));
  expect(authorities.styles).toEqual(expect.arrayContaining(['/registry-v2.css','/drx-dashboard-stripe.css']));
  expect(authorities.scripts).toContain('/registry-v2.js');
  expect(authorities.scripts).not.toContain('/app-runtime.js');

  const viewport = await page.evaluate(() => ({
    bodyScrollWidth:document.body.scrollWidth,
    innerWidth:window.innerWidth,
    tableClientWidth:document.querySelector('#tableScroll').clientWidth,
    tableScrollWidth:document.querySelector('#tableScroll').scrollWidth,
  }));
  expect(viewport.bodyScrollWidth).toBeLessThanOrEqual(viewport.innerWidth);
  expect(viewport.tableScrollWidth).toBeGreaterThanOrEqual(viewport.tableClientWidth);

  await page.getByRole('button', { name:/Filtra/ }).click();
  await expect(page.locator('#filterPanel')).toBeVisible();

  await page.getByText('PARACETAMOL TEST').click();
  await expect(page.locator('#detailDrawer')).toHaveClass(/is-open/);
  await expect(page.locator('#drawerBody')).toContainText('500 mg');
  await expect(page.locator('#drawerBody')).toContainText('1 tabletë');
  await page.locator('#drawerClose').click();
  await expect(page.locator('#detailDrawer')).not.toHaveClass(/is-open/);

  await page.locator('[data-select-row]').first().check();
  await expect(page.locator('#openPrescriptionButton')).toBeEnabled();
  await expect(page.locator('#selectedCount')).toHaveText('1');

  await page.locator('#searchInput').fill('amox');
  await expect(page.locator('#registryRows')).toContainText('AMOXICILLIN TEST');
  await expect(page.locator('#registryRows')).not.toContainText('PARACETAMOL TEST');
  await expect(page.locator('#registryRows tr[data-row-id]')).toHaveCount(1);

  await page.screenshot({ path:test.info().outputPath('registry-v2-desktop.png'), fullPage:true });
});

test('registry v2 mobile keeps navigation and table overflow contained', async ({ page }) => {
  await page.setViewportSize({ width:390, height:844 });
  await page.goto('http://127.0.0.1:4173/index.html');
  await expect(page.getByText('PARACETAMOL TEST')).toBeVisible();

  const initial = await page.evaluate(() => {
    const sidebar = document.querySelector('#sidebar').getBoundingClientRect();
    const table = document.querySelector('#tableScroll');
    return {
      bodyScrollWidth:document.body.scrollWidth,
      innerWidth:window.innerWidth,
      sidebarRight:sidebar.right,
      tableClientWidth:table.clientWidth,
      tableScrollWidth:table.scrollWidth,
    };
  });
  expect(initial.bodyScrollWidth).toBeLessThanOrEqual(initial.innerWidth);
  expect(initial.sidebarRight).toBeLessThanOrEqual(1);
  expect(initial.tableScrollWidth).toBeLessThanOrEqual(initial.tableClientWidth + 1);

  const doseLayout = await page.locator('#registryRows tr').nth(1).evaluate(row => {
    const card = row.getBoundingClientRect();
    const dose = row.querySelector('[data-col="adultDose"]');
    return { cardWidth:card.width, doseWidth:dose.getBoundingClientRect().width, position:getComputedStyle(dose).position };
  });
  expect(doseLayout.position).toBe('static');
  expect(doseLayout.doseWidth).toBeGreaterThan(doseLayout.cardWidth * 0.8);

  await page.locator('#menuButton').click();
  await expect.poll(
    () => page.locator('#sidebar').evaluate(node => Math.abs(node.getBoundingClientRect().left)),
    { timeout:3000, intervals:[50,75,100,150] },
  ).toBeLessThanOrEqual(1);
  await expect(page.locator('#sidebarBackdrop')).toBeVisible();
  await page.locator('#sidebarClose').click();

  await page.getByText('PARACETAMOL TEST').click();
  await expect(page.locator('#detailDrawer')).toHaveClass(/is-open/);
  const drawerWidth = await page.locator('#detailDrawer').evaluate(node => node.getBoundingClientRect().width);
  expect(drawerWidth).toBeLessThanOrEqual(390);
  await page.locator('#drawerClose').click();

  await page.screenshot({ path:test.info().outputPath('registry-v2-mobile.png'), fullPage:true });
});


test('registry v2 tablet keeps shell and detail geometry contained', async ({ page }) => {
  await page.setViewportSize({ width:768, height:1024 });
  await page.goto('http://127.0.0.1:4173/index.html');
  await expect(page.getByText('PARACETAMOL TEST')).toBeVisible();

  const geometry = await page.evaluate(() => {
    const table = document.querySelector('#tableScroll');
    const sidebar = document.querySelector('#sidebar')?.getBoundingClientRect();
    return {
      bodyScrollWidth:document.body.scrollWidth,
      innerWidth:window.innerWidth,
      tableClientWidth:table?.clientWidth || 0,
      tableScrollWidth:table?.scrollWidth || 0,
      sidebarWidth:sidebar?.width || 0,
    };
  });
  expect(geometry.bodyScrollWidth).toBeLessThanOrEqual(geometry.innerWidth);
  expect(geometry.tableScrollWidth).toBeGreaterThanOrEqual(geometry.tableClientWidth);
  expect(geometry.sidebarWidth).toBeLessThanOrEqual(320);

  await page.getByText('PARACETAMOL TEST').click();
  await expect(page.locator('#detailDrawer')).toHaveClass(/is-open/);
  await expect.poll(
    () => page.locator('#detailDrawer').evaluate(node => {
      const rect=node.getBoundingClientRect();
      return { width:rect.width, right:rect.right };
    }),
    { timeout:3000, intervals:[50,75,100,150] },
  ).toEqual(expect.objectContaining({ width:expect.any(Number) }));
  const drawer = await page.locator('#detailDrawer').evaluate(node => {
    const rect=node.getBoundingClientRect();
    return { width:rect.width, right:rect.right };
  });
  expect(drawer.width).toBeLessThanOrEqual(768);
  await expect.poll(
    () => page.locator('#detailDrawer').evaluate(node => node.getBoundingClientRect().right),
    { timeout:3000, intervals:[50,75,100,150] },
  ).toBeLessThanOrEqual(769);
  await page.locator('#drawerClose').click();

  await page.screenshot({ path:test.info().outputPath('registry-v2-tablet.png'), fullPage:true });
});

for (const width of [320, 390, 430, 600, 760]) {
  test(`registry clinical fields stay readable at ${width}px with unpublished doses`, async ({ page }) => {
    await page.setViewportSize({ width, height:844 });
    await page.route('**/api/dosage**', route => route.fulfill({ json:{ ok:true,
      cards:rows.map(row => ({ registryNumber:String(row.registryNumber), adultDose:'', pediatricDose:'' })) } }));
    await page.goto('http://127.0.0.1:4173/index.html');
    await expect(page.locator('#registryRows [data-col="adultDose"]').first()).toHaveText('Pa dozë të publikuar');
    await expect(page.locator('#registryRows [data-col="adultDose"]').first()).toBeVisible();
    await expect(page.locator('#registryRows [data-col="pediatricDose"]').first()).toBeVisible();

    async function checkFields(cardSelector, fieldSelector) {
      const cards = page.locator(cardSelector);
      await expect(cards).toHaveCount(rows.length);
      for (const card of await cards.all()) {
        const layout = await card.evaluate((node, selector) => {
          const bounds = node.getBoundingClientRect();
          const fields = [...node.querySelectorAll(selector)].filter(field => !field.hidden && getComputedStyle(field).display !== 'none').map(field => {
            const rect = field.getBoundingClientRect();
            return { col:field.dataset.col, width:rect.width, left:rect.left, right:rect.right,
              top:rect.top, bottom:rect.bottom, scroll:field.scrollWidth, client:field.clientWidth,
              position:getComputedStyle(field).position };
          });
          return { width:bounds.width, left:bounds.left, right:bounds.right, fields };
        }, fieldSelector);
        let previousBottom = 0;
        for (const field of layout.fields) {
          expect(field.position, `${field.col} belongs inside the card`).toBe('static');
          expect(field.width, `${field.col} needs readable width`).toBeGreaterThan(layout.width * 0.8);
          expect(field.left).toBeGreaterThanOrEqual(layout.left);
          expect(field.right).toBeLessThanOrEqual(layout.right);
          expect(field.top, `${field.col} must not overlap the previous field`).toBeGreaterThanOrEqual(previousBottom);
          expect(field.scroll).toBeLessThanOrEqual(field.client + 1);
          previousBottom = field.bottom;
        }
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    }

    await checkFields('#registryRows tr', '[data-col="prescription"], [data-col="drugClass"], [data-col="use"], [data-col="adultDose"], [data-col="pediatricDose"]');
    await page.locator('[data-view="list"]').click();
    await expect(page.locator('#registryList [data-dose-adult]').first()).toHaveText('Pa dozë të publikuar');
    await checkFields('.registry-list-card', '.registry-list-field');
    await page.locator('[data-view="table"]').click();
    await checkFields('#registryRows tr', '[data-col="adultDose"], [data-col="pediatricDose"]');
    await page.screenshot({ path:test.info().outputPath(`registry-clinical-fields-${width}.png`), fullPage:true });
  });
}
