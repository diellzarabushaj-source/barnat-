'use strict';

const { test, expect } = require('@playwright/test');

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

function filteredRows(url) {
  const q = String(url.searchParams.get('q') || '').toLowerCase();
  if (!q) return rows;
  return rows.filter(row => `${row.tradeName} ${row.activeSubstance} ${row.atc} ${row.use}`.toLowerCase().includes(q));
}

async function installApiMocks(page) {
  await page.route('**/api/auth**', async route => {
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
    if (view === 'registry-page') {
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
          adult:{ dose:'500 mg çdo 8 orë sipas nevojës', route:'PO', maximum:'3 g/ditë' },
          pediatric:{ dose:'15 mg/kg për dozë', route:'PO', maximum:'60 mg/kg/ditë' },
          profile:{ verificationStatus:'verified', summary:'Profil klinik testues', indications:'Dhimbje dhe temperaturë', warnings:'Kontrollo dozën totale ditore.' },
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
  expect(authorities.styles).toEqual(['/registry-v2.css']);
  expect(authorities.scripts).toEqual(['/registry-v2.js']);

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
  await expect(page.getByText('Profil klinik testues')).toBeVisible();
  await page.locator('#drawerClose').click();
  await expect(page.locator('#detailDrawer')).not.toHaveClass(/is-open/);

  await page.locator('[data-select-row]').first().check();
  await expect(page.locator('#openPrescriptionButton')).toBeEnabled();
  await expect(page.locator('#selectedCount')).toHaveText('1');

  await page.locator('#searchInput').fill('amox');
  await expect(page.getByText('AMOXICILLIN TEST')).toBeVisible();
  await expect(page.getByText('PARACETAMOL TEST')).toHaveCount(0);

  await page.screenshot({ path:'/tmp/registry-v2-desktop.png', fullPage:true });
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
  expect(initial.tableScrollWidth).toBeGreaterThan(initial.tableClientWidth);

  await page.locator('#menuButton').click();
  const openedLeft = await page.locator('#sidebar').evaluate(node => node.getBoundingClientRect().left);
  expect(Math.abs(openedLeft)).toBeLessThanOrEqual(1);
  await expect(page.locator('#sidebarBackdrop')).toBeVisible();
  await page.locator('#sidebarClose').click();

  await page.getByText('PARACETAMOL TEST').click();
  await expect(page.locator('#detailDrawer')).toHaveClass(/is-open/);
  const drawerWidth = await page.locator('#detailDrawer').evaluate(node => node.getBoundingClientRect().width);
  expect(drawerWidth).toBeLessThanOrEqual(390);
  await page.locator('#drawerClose').click();

  await page.screenshot({ path:'/tmp/registry-v2-mobile.png', fullPage:true });
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
  await page.waitForTimeout(250);
  const drawer = await page.locator('#detailDrawer').evaluate(node => {
    const rect=node.getBoundingClientRect();
    return { width:rect.width, right:rect.right };
  });
  expect(drawer.width).toBeLessThanOrEqual(768);
  expect(drawer.right).toBeLessThanOrEqual(769);
  await page.locator('#drawerClose').click();

  await page.screenshot({ path:'/tmp/registry-v2-tablet.png', fullPage:true });
});
