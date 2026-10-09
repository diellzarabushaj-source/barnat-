'use strict';

const { test, expect } = require('@playwright/test');
const columnModel = require('../registry-column-model.js');
const columnData = require('../lib/registry-column-data.js');

test.use({ serviceWorkers:'block', baseURL:'http://127.0.0.1:4173' });

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
    adultDose:'500 mg çdo 8 orë sipas nevojës', pediatricDose:'15 mg/kg për dozë', updateStatus:'E re',
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
    adultDose:'500 mg çdo 8 orë', pediatricDose:'20–40 mg/kg/ditë', updateStatus:'Ka qenë',
  },
];

const visibleColumns = ['registry', 'name', 'substance', 'strength', 'form', 'prescription',
  'drugClass', 'use', 'population', 'atc', 'adultDose', 'pediatricDose', 'status', 'price'];

function filteredRows(url, dataset = rows) {
  return columnData.filterRows(dataset.map(row=>({...row,_search:`${row.tradeName} ${row.activeSubstance} ${row.atc} ${row.use}`})),{
    q:url.searchParams.get('q'),atc:url.searchParams.get('atc'),formExact:url.searchParams.get('formExact'),columnFilters:url.searchParams.get('columnFilters'),
  },{});
}

async function installApiMocks(page, dataset = rows) {
  // Table scenarios explicitly opt in; first-visit phone defaults have separate coverage.
  await page.addInitScript(() => { if (!localStorage.getItem("drx_registry_v2_row_view")) localStorage.setItem("drx_registry_v2_row_view","table"); });
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
      const row = dataset.find(item => item.id === url.searchParams.get('id')) || dataset[0];
      return route.fulfill({
        status:200,
        contentType:'application/json',
        body:JSON.stringify({ ok:true, row:{ ...row, packaging:'20 tableta', manufacturer:'Test Pharma', marketingAuthorizationHolder:'Test MAH', validity:'2026' } }),
      });
    }
    if (view === 'registry-facets') {
      const column = url.searchParams.get('column'), filters = columnModel.parseFilters(url.searchParams.get('columnFilters'));
      delete filters[column];
      url.searchParams.set('columnFilters',JSON.stringify(filters));
      return route.fulfill({json:{ok:true,column,...columnData.facets(filteredRows(url,dataset),column,url.searchParams.get('valueSearch'),Number(url.searchParams.get('offset')))}});
    }
    if (view === 'registry-page' || view === 'registry-search') {
      const result = columnData.sortRows(filteredRows(url,dataset),url.searchParams.get('sort'),url.searchParams.get('direction'));
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
      const requested = new Set((url.searchParams.get('nrs') || '').split(','));
      const cards = dataset.filter(row => requested.has(String(row.registryNumber))).map(row => ({
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

for (const width of [390,1440]) test(`light result pages hydrate only visible product doses and ignore old pages at ${width}px`,async ({page}) => {
  await page.setViewportSize({width,height:900});
  const dataset = Array.from({length:26},(_,index) => ({...rows[index%2],
    id:`${String(index+1).padStart(8,'0')}-3333-4333-8333-333333333333`,registryNumber:index+1,tradeName:`PRODUCT ${index+1}`}));
  await page.route('**/api/drug-search**',async route => {
    const url = new URL(route.request().url()), currentPage = Number(url.searchParams.get('page') || 1);
    const result = dataset.slice((currentPage-1)*25,currentPage*25).map(({adultDose,pediatricDose,...row}) => row);
    return route.fulfill({json:{ok:true,rows:result,pagination:{page:currentPage,pageSize:25,total:26,totalPages:2,hasPrevious:currentPage>1,hasNext:currentPage<2},meta:{completeRegistry:true,doseHydrationRequired:true}}});
  });
  let firstBatch, firstArrived;
  const firstRequest = new Promise(resolve => {firstArrived=resolve;});
  const batches = [];
  await page.route('**/api/dosage**',async route => {
    const requested = new URL(route.request().url()).searchParams.get('nrs').split(',').map(Number);
    batches.push(requested);
    if (requested[0] === 1) {firstBatch=route;firstArrived();return;}
    return route.fulfill({json:{ok:true,cards:requested.map(number => ({registryNumber:String(number),drugId:dataset[number-1].id,adultDose:'PAGE TWO EXACT',pediatricDose:''}))}});
  });
  await page.goto('/index.html?sort=substance&pageSize=25');
  await firstRequest;
  await expect(page.locator('#registryRows tr')).toHaveCount(25);
  await expect(page.locator('[data-dose-adult="1"]')).toHaveAttribute('data-dose-status','loading');
  await page.locator('[data-view="list"]').click();
  await expect(page.locator('[data-dose-adult="1"]')).toHaveAttribute('data-dose-status','loading');
  await expect(page.locator('[data-dose-adult="1"]')).not.toContainText('Pa dozë');
  await page.locator('#nextPageButton').click();
  await expect(page.locator('.registry-list-card')).toHaveCount(1);
  await expect(page.locator('[data-dose-adult="26"]')).toContainText('PAGE TWO EXACT');
  await firstBatch.fulfill({json:{ok:true,cards:dataset.slice(0,25).map(row => ({registryNumber:String(row.registryNumber),drugId:row.id,adultDose:'STALE PAGE ONE',pediatricDose:''}))}});
  await expect(page.locator('[data-dose-adult="26"]')).toContainText('PAGE TWO EXACT');
  await expect(page.locator('#registryList')).not.toContainText('STALE PAGE ONE');
  expect(batches).toEqual([Array.from({length:25},(_,index)=>index+1),[26]]);
  await page.locator('[data-view="table"]').click();
  await expect(page.locator('#registryRows tr')).toHaveCount(1);
  await expect(page.locator('[data-dose-adult="26"]')).toContainText('PAGE TWO EXACT');
  await page.locator('[data-select-row]').check();
  await expect.poll(()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('medindexPrescriptionSelection'))?.[0]?.id)).toBe(dataset[25].id);
});

test('light result dose batches reject wrong product IDs and recover without a false no-dose state',async ({page}) => {
  await page.route('**/api/drug-search**',route => route.fulfill({json:{ok:true,rows:rows.map(({adultDose,pediatricDose,...row})=>row),pagination:{page:1,pageSize:25,total:2,totalPages:1},meta:{completeRegistry:true,doseHydrationRequired:true}}}));
  let attempts = 0, releaseCorrect, correctArrived;
  const correctRequest = new Promise(resolve=>{correctArrived=resolve;});
  await page.route('**/api/dosage**',async route => {
    attempts++;
    if (attempts === 1) return route.fulfill({json:{ok:true,cards:rows.map(row=>({registryNumber:String(row.registryNumber),drugId:'33333333-3333-4333-8333-333333333333',adultDose:'WRONG PRODUCT',pediatricDose:''}))}});
    releaseCorrect=route;correctArrived();
  });
  await page.goto('/index.html?sort=substance');
  await correctRequest;
  await expect(page.locator('[data-dose-adult="1"]')).toHaveAttribute('data-dose-status','loading');
  await expect(page.locator('#registryRows')).not.toContainText('WRONG PRODUCT');
  await expect(page.locator('#registryRows')).not.toContainText('Pa dozë të publikuar');
  await releaseCorrect.fulfill({json:{ok:true,cards:rows.map(row=>({registryNumber:String(row.registryNumber),drugId:row.id,adultDose:'IDENTIFIED DOSE',pediatricDose:''}))}});
  await expect(page.locator('[data-dose-adult="1"]')).toContainText('IDENTIFIED DOSE');
  await expect(page.locator('[data-dose-pediatric="1"]')).toContainText('Pa dozë të publikuar');
  expect(attempts).toBe(2);
});

for (const width of [1440,390]) test(`substance spelling variants share one filter while products and original names remain distinct at ${width}px`, async ({page}) => {
  const dataset = ['amoxicilin','Amoxicilin','Amoxicillin','Amoxicillin trihydrate','Amoxicillin; Clavulanic acid'].map((activeSubstance,i)=>({
    ...rows[1],id:`${i+3}${'3'.repeat(7)}-3333-4333-8333-333333333333`,registryNumber:i+3,pdid:String(i+1003),tradeName:'SUBSTANCE PRODUCT '+(i+1),activeSubstance,
  }));
  await installApiMocks(page,dataset);
  await page.setViewportSize({width,height:900});
  await page.goto('/index.html');
  await expect(page.locator('#registryRows tr')).toHaveCount(5);
  if (width < 760) {
    await page.locator('#filterToggle').click();
    await page.locator('#columnFilterColumn').selectOption('substance');
    await page.locator('#columnFilterOpen').click();
  } else await page.locator('[data-column-filter="substance"]').click();
  await expect(page.locator('.column-filter-value')).toHaveCount(3);
  const merged = page.locator('.column-filter-value').filter({has:page.locator('span',{hasText:/^Amoxicillin$/})});
  await expect(merged.locator('small')).toHaveText('3');
  await page.locator('#columnFilterSearch').fill('amoxicilin');
  await expect(merged).toBeVisible();
  await page.locator('#columnFilterSelectAll').uncheck();
  await merged.locator('input').check();
  await page.locator('#registryColumnFilterPanel [data-apply]').click();
  await expect(page.locator('#registryRows tr')).toHaveCount(3);
  for (const cell of await page.locator('#registryRows [data-col="substance"]').all()) await expect(cell).toHaveText('Amoxicillin');
  await page.reload();
  await expect(page.locator('#registryRows tr')).toHaveCount(3);
  await page.locator('[data-view="list"]').click();
  await expect(page.locator('.registry-list-card')).toHaveCount(3);
  await expect(page.locator('.registry-list-card [data-col="substance"]').first()).toHaveText('Amoxicillin');
  await page.locator('.registry-list-card [data-open-row]').first().click();
  await expect(page.locator('#drawerBody')).toContainText('Emërtimi në regjistër');
  await expect(page.locator('#drawerBody')).toContainText('amoxicilin');
  await expect(page.locator('#drawerBody .detail-hero')).toContainText('Amoxicillin');
  await page.locator('#drawerClose').click();
  await page.locator('[data-remove-column="substance"]').click();
  await expect(page.locator('.registry-list-card')).toHaveCount(5);
  const request = page.waitForRequest(req=>req.url().includes('/api/drug-search') && new URL(req.url()).searchParams.get('q')==='amoxicilin');
  await page.locator('#searchInput').fill('amoxicilin');
  expect(new URL((await request).url()).searchParams.get('view')).toBe('registry-page');
  await expect(page.locator('.registry-list-card')).toHaveCount(5);
  const oldFilter = new URLSearchParams({columnFilters:JSON.stringify({substance:{mode:'include',values:['Amoxicilin']}})});
  await page.goto('/index.html?'+oldFilter);
  await expect(page.locator('.registry-list-card')).toHaveCount(3);
  await page.locator('[data-view="table"]').click();
  await expect(page.locator('#registryRows tr')).toHaveCount(3);
});

test('every data column exposes Excel filters, draft cancellation and full-registry values', async ({ page }) => {
  await page.setViewportSize({width:1440,height:950});
  await page.goto('/index.html');
  await expect(page.locator('#registryRows tr')).toHaveCount(2);
  await expect(page.locator('.column-filter-trigger')).toHaveCount(15);
  await page.locator('[data-column-filter="substance"]').click();
  await expect(page.locator('#columnFilterValues')).toContainText('Paracetamol');
  await page.locator('#columnFilterSelectAll').uncheck();
  await page.locator('.column-filter-value').filter({hasText:'Paracetamol'}).locator('input').check();
  await page.locator('[data-cancel]').click();
  await expect(page.locator('#registryRows tr')).toHaveCount(2);
  await page.locator('[data-column-filter="substance"]').click();
  await expect(page.locator('#columnFilterSelectAll')).toBeChecked();
  await page.screenshot({path:test.info().outputPath('column-filter-desktop.png'),fullPage:true});
  await page.locator('#columnFilterSelectAll').uncheck();
  await page.locator('.column-filter-value').filter({hasText:'Paracetamol'}).locator('input').check();
  await page.locator('#registryColumnFilterPanel [data-apply]').click();
  await expect(page.locator('#registryRows tr')).toHaveCount(1);
  await expect(page).toHaveURL(/columnFilters=/);
  await expect(page.locator('[data-column-filter="substance"]')).toHaveAttribute('data-filtered','true');
  await page.reload();
  await expect(page.locator('#registryRows tr')).toHaveCount(1);
  await expect(page.locator('#registryRows')).toContainText('PARACETAMOL');
  await page.locator('[data-remove-column="substance"]').click();
  await expect(page.locator('#registryRows tr')).toHaveCount(2);
  await page.goBack();
  await expect(page.locator('#registryRows tr')).toHaveCount(1);
});

test('column text and numeric conditions combine with ATC and list cards stay pink when selected', async ({ page }) => {
  await page.setViewportSize({width:1440,height:950});
  await page.goto('/index.html?atc=N02');
  await expect(page.locator('#registryRows tr')).toHaveCount(1);
  await page.locator('#filterToggle').click();
  await page.locator('#columnFilterColumn').selectOption('price');
  await page.locator('#columnFilterOpen').click();
  await page.locator('#columnFilterOperator').selectOption('between');
  await page.locator('#columnFilterText').fill('2');
  await page.locator('#columnFilterText2').fill('3');
  await page.locator('#registryColumnFilterPanel [data-apply]').click();
  await expect(page.locator('#registryRows tr')).toHaveCount(1);
  await page.locator('#columnFilterColumn').selectOption('pediatricDose');
  await page.locator('#columnFilterOpen').click();
  await page.locator('#columnFilterOperator').selectOption('contains');
  await page.locator('#columnFilterText').fill('15 mg/kg');
  await page.locator('#registryColumnFilterPanel [data-apply]').click();
  await expect(page.locator('#registryRows tr')).toHaveCount(1);
  await page.locator('[data-view="list"]').click();
  const card = page.locator('.registry-list-card');
  await expect(card.locator('[data-dose-pediatric]')).toContainText('15 mg/kg');
  await expect(card).toHaveClass(/is-pediatric-only/);
  await expect(card).toHaveCSS('background-color','rgb(255, 243, 248)');
  await page.screenshot({path:test.info().outputPath('pediatric-list-pink.png'),fullPage:true});
  await card.locator('[data-select-row]').check();
  await expect(card).toHaveCSS('background-color','rgb(252, 232, 243)');
  await page.locator('#clearFiltersButton').click();
  await expect(page.locator('.registry-list-card')).toHaveCount(2);
  await expect(page.locator('.registry-list-card').last()).not.toHaveClass(/is-pediatric-only/);
});

for (const width of [320,390,760]) {
  test(`column filter menu fits ${width}px and restores keyboard focus`,async ({page}) => {
    test.setTimeout(90_000); // Fifteen complete open/fetch/Escape cycles in both engines.
    await page.setViewportSize({width,height:844});
    await page.goto('/index.html');
    await expect(page.locator('#registryRows tr')).toHaveCount(2);
    await page.locator('#filterToggle').click();
    for (const column of Object.keys(columnModel.fields)) {
      await page.locator('#columnFilterColumn').selectOption(column);
      await page.locator('#columnFilterOpen').click();
      await expect(page.locator('#columnFilterSearch')).toBeFocused();
      await expect(page.locator('.column-filter-value').first()).toBeVisible();
      const bounds = await page.locator('#registryColumnFilterPanel').boundingBox();
      expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x+bounds.width).toBeLessThanOrEqual(width);
      expect(bounds.y).toBeGreaterThanOrEqual(0); expect(bounds.y+bounds.height).toBeLessThanOrEqual(844);
      if(column === 'substance' && width === 390) await page.screenshot({path:test.info().outputPath('column-filter-mobile.png'),fullPage:true});
      await page.keyboard.press('Escape');
      await expect(page.locator('#registryColumnFilterPanel')).toBeHidden();
      await expect(page.locator('#columnFilterOpen')).toBeFocused();
    }
  });
}

test('checkbox search preserves selections, empty state and numeric sorting',async ({page}) => {
  await page.goto('/index.html');
  await expect(page.locator('#registryRows tr')).toHaveCount(2);
  await page.locator('[data-column-filter="name"]').click();
  await page.locator('#columnFilterSelectAll').uncheck();
  await page.locator('#columnFilterSearch').fill('PARA');
  await expect(page.locator('.column-filter-value')).toHaveCount(1);
  await page.locator('.column-filter-value input').check();
  await page.locator('#columnFilterSearch').fill('AMOX');
  await expect(page.locator('.column-filter-value')).toContainText('AMOX');
  await expect(page.locator('.column-filter-value input')).not.toBeChecked();
  await page.locator('#registryColumnFilterPanel [data-apply]').click();
  await expect(page.locator('#registryRows')).toContainText('PARACETAMOL');
  await page.locator('#filterToggle').click();
  await page.locator('#columnFilterColumn').selectOption('adultDose');
  await page.locator('#columnFilterOpen').click();
  await page.locator('#columnFilterOperator').selectOption('empty');
  await page.locator('#registryColumnFilterPanel [data-apply]').click();
  await expect(page.locator('#emptyState')).toBeVisible();
  await page.locator('#emptyClearButton').click();
  await expect(page.locator('#registryRows tr')).toHaveCount(2);
  await page.locator('[data-column-filter="price"]').click();
  await page.locator('#registryColumnFilterPanel [data-direction="desc"]').click();
  await expect(page.locator('#registryRows tr').first()).toContainText('AMOX');
});

test('ATC picker narrows through subdivisions and shares filters with list view', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width:1440, height:900 });
  await page.goto('/index.html');
  await expect(page.locator('#registryRows tr')).toHaveCount(2);
  await page.locator('#filterToggle').click();
  await page.locator('#atcPickerButton').click();
  const panelBounds = await page.locator('#atcPickerPanel').boundingBox();
  expect(panelBounds.y).toBeGreaterThanOrEqual(0);
  expect(panelBounds.y + panelBounds.height).toBeLessThanOrEqual(900);
  await expect(page.locator('.atc-picker-heading')).toBeVisible();
  await expect(page.locator('#atcPickerSearch')).toBeVisible();
  for (const code of ['J', 'J01', 'J01C']) await page.locator(`[data-atc-branch="${code}"] > summary`).click();
  await page.screenshot({ path:test.info().outputPath('atc-filter-desktop.png'), fullPage:true });
  await page.locator('[data-atc-select="J01CA"]').click();
  await expect(page.locator('#atcPickerPanel')).toBeHidden();
  await expect(page.locator('#atcPickerButton')).toBeFocused();
  await expect(page).toHaveURL(/atc=J01CA/);
  await expect(page.locator('#registryRows tr')).toHaveCount(1);
  await expect(page.locator('#registryRows')).toContainText('AMOXICILLIN TEST');
  await page.locator('[data-view="list"]').click();
  await expect(page.locator('.registry-list-card')).toHaveCount(1);
  await expect(page.locator('#registryList')).toContainText('AMOXICILLIN TEST');
  await page.locator('#atcPickerButton').click();
  await page.locator('#atcPickerSearch').fill('N02BE01');
  await page.locator('[data-atc-select="N02BE01"]').click();
  await expect(page.locator('#registryList')).toContainText('PARACETAMOL TEST');
  await page.goBack();
  await expect(page.locator('#registryList')).toContainText('AMOXICILLIN TEST');
  await expect(page.locator('#atcPickerValue')).toContainText('J01CA');
  await page.locator('#searchInput').fill('no matching medicine');
  await expect(page.locator('#emptyState')).toBeVisible();
  await page.locator('#clearFiltersButton').click();
  await expect(page.locator('.registry-list-card')).toHaveCount(2);
  await expect(page.locator('#atcPickerValue')).toHaveText('Të gjitha grupet');
  expect(errors).toEqual([]);
});

test('ATC picker keeps search and pharmaceutical form while clearing ATC alone', async ({ page }) => {
  await page.goto('/index.html?atc=J01CA04');
  await expect(page.locator('#registryRows')).toContainText('AMOXICILLIN TEST');
  await page.locator('#filterToggle').click();
  await page.locator('#formPickerButton').click();
  await page.locator('#formPickerSearch').fill('Tablet');
  await page.locator('[data-form-value="Tablet"]').click();
  await expect(page.locator('#emptyState')).toBeVisible();
  await page.locator('#searchInput').fill('para');
  await page.waitForRequest(req => req.url().includes('/api/drug-search') && new URL(req.url()).searchParams.get('q') === 'para');
  await page.locator('#atcPickerButton').click();
  const nextRequest = page.waitForRequest(req => req.url().includes('/api/drug-search') && !new URL(req.url()).searchParams.has('atc') && new URL(req.url()).searchParams.get('q') === 'para');
  await page.locator('[data-atc-select=""]').click();
  const request = new URL((await nextRequest).url());
  expect(request.searchParams.get('formExact')).toBe('Tablet');
  await expect(page.locator('#searchInput')).toHaveValue('para');
  await expect(page.locator('#formPickerValue')).toHaveText('Tablet');
});

for (const width of [320, 390, 760]) {
  test(`ATC picker is readable and keyboard accessible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height:844 });
    await page.goto('/index.html');
    await expect(page.locator('#registryRows tr')).toHaveCount(2);
    await page.locator('#filterToggle').click();
    await page.locator('#atcPickerButton').click();
    await expect(page.locator('#atcPickerSearch')).toBeFocused();
    await page.locator('#atcPickerSearch').fill('spekter te gjere');
    await expect(page.locator('[data-atc-select="J01CA"]')).toBeVisible();
    const bounds = await page.locator('#atcPickerPanel').boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(844);
    await page.locator('#atcPickerSearch').press('ArrowDown');
    await expect(page.locator('[data-atc-select=""]').first()).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('[data-atc-select="J01CA"]')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#atcPickerButton')).toBeFocused();
    await expect(page.locator('#atcPickerPanel')).toBeHidden();
    await page.locator('#atcPickerButton').click();
    await page.locator('[data-atc-branch="J"] > summary').click();
    await page.locator('[data-atc-branch="J01"] > summary').click();
    await page.screenshot({ path:test.info().outputPath(`atc-filter-${width}.png`), fullPage:true });
  });
}

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
  expect(drawerWidth).toBeLessThanOrEqual(390.5); // Allow subpixel layout rounding.
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
