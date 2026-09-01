const { test, expect } = require('@playwright/test');
const os = require('node:os');
const path = require('node:path');

const OUTPUT = os.tmpdir();

test.use({ serviceWorkers:'block' });
test.setTimeout(120000);

const viewports = [
  { name:'desktop', width:1440, height:900 },
  { name:'mobile', width:390, height:844 },
];

const clinicalPages = [
  'index.html',
  'analizat.html',
  'icd.html',
  'dozologjia.html',
  'recetat.html',
  'protokollet.html',
  'medical-hub.html',
  'urgjencat.html',
  'sistemi.html',
];

const publicPages = ['rreth-nesh.html', 'kontakt.html', 'blog.html'];

async function mockPhase5AuthenticatedSession(page) {
  await page.route('**/api/auth*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() !== 'GET' || url.pathname !== '/api/auth' || url.search) return route.continue();
    await route.fulfill({
      status:200,
      contentType:'application/json',
      body:JSON.stringify({
        authenticated:true,
        hardened:true,
        sessionConfigured:true,
        sessionVersion:3,
        sessionHours:8,
        identityContract:'phase5-ui-audit-v3',
        supabaseAuthenticated:false,
        rollbackSession:true,
        user:{
          email:'diellzarabushaj@gmail.com',
          role:'doctor',
          name:'Diellza Rabushaj',
        },
      }),
    });
  });
}

async function mockRegistryV2Data(page) {
  await page.route('**/api/drug-search?**', async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('view') !== 'registry-page') return route.continue();
    await route.fulfill({
      status:200,
      contentType:'application/json',
      headers:{ 'X-MedIndex-Data-Source':'supabase' },
      body:JSON.stringify({
        ok:true,
        rows:[
          { id:'11111111-1111-4111-8111-111111111111', registryNumber:101, pdid:'PD-101', tradeName:'Amoxicillin DRx', activeSubstance:'Amoxicillin', strength:'500 mg', form:'Kapsulë', atc:'J01CA04', productStatus:'Gjenerik', retailPrice:3.2 },
          { id:'22222222-2222-4222-8222-222222222222', registryNumber:202, pdid:'PD-202', tradeName:'Paracetamol DRx', activeSubstance:'Paracetamol', strength:'500 mg', form:'Tabletë', atc:'N02BE01', productStatus:'Gjenerik', retailPrice:1.8 },
          { id:'33333333-3333-4333-8333-333333333333', registryNumber:303, pdid:'PD-303', tradeName:'Salbutamol DRx', activeSubstance:'Salbutamol', strength:'100 mcg', form:'Inhalator', atc:'R03AC02', productStatus:'Origjinator', retailPrice:5.4 },
        ],
        pagination:{ page:1, pageSize:25, total:4003, totalPages:161, hasPrevious:false, hasNext:true },
      }),
    });
  });
  await page.route('**/api/dosage?**', async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('view') !== 'cards') return route.continue();
    await route.fulfill({
      status:200,
      contentType:'application/json',
      body:JSON.stringify({
        ok:true,
        cards:[
          { registryNumber:'101', adultDose:'500 mg çdo 8 orë', adultRoute:'PO', pediatricDose:'20–40 mg/kg/ditë', pediatricRoute:'PO' },
          { registryNumber:'202', adultDose:'500–1000 mg çdo 6–8 orë', adultRoute:'PO', pediatricDose:'10–15 mg/kg çdo 4–6 orë', pediatricRoute:'PO' },
          { registryNumber:'303', adultDose:'1–2 inhalime sipas nevojës', adultRoute:'Inhalim', pediatricDose:'Sipas moshës dhe planit klinik', pediatricRoute:'Inhalim' },
        ],
      }),
    });
  });
}

async function auditRegistryV2(page, label) {
  const audit = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const visible = [...document.querySelectorAll('button,input,select,a[href]')].filter(node => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    }).map(node => ({ tag:node.tagName, id:node.id || '', width:node.getBoundingClientRect().width, height:node.getBoundingClientRect().height }));
    return {
      primary:root.getPropertyValue('--stripe-primary').trim(),
      pageWidth:document.documentElement.scrollWidth,
      viewportWidth:innerWidth,
      bodyWidth:document.body.scrollWidth,
      rows:document.querySelectorAll('#registryRows tr[data-row-id]').length,
      adultDose:document.querySelector('[data-dose-adult]')?.textContent?.trim() || '',
      pediatricDose:document.querySelector('[data-dose-pediatric]')?.textContent?.trim() || '',
      sidebarBg:getComputedStyle(document.querySelector('.sidebar')).backgroundColor,
      controls:visible.filter(item => item.tag !== 'A'),
    };
  });
  expect(audit.primary, `${label}: Stripe primary token`).toBe('#533afd');
  expect(audit.pageWidth, `${label}: document horizontal overflow`).toBeLessThanOrEqual(audit.viewportWidth + 2);
  expect(audit.bodyWidth, `${label}: body horizontal overflow`).toBeLessThanOrEqual(audit.viewportWidth + 2);
  expect(audit.rows, `${label}: registry rows`).toBe(3);
  expect(audit.adultDose).toContain('500 mg');
  expect(audit.pediatricDose.length).toBeGreaterThan(0);
  expect(audit.sidebarBg).toBe('rgb(28, 30, 84)');
  for (const control of audit.controls) expect(control.height, `${label}: control ${control.id}`).toBeGreaterThanOrEqual(28);
  return audit;
}

async function interactiveAudit(page, tokenName) {
  return page.evaluate(token => {
    const style=getComputedStyle(document.documentElement);
    const visibleInteractive=[...document.querySelectorAll('button,input,select,textarea,a[href],[role="button"]')]
      .filter(node => {
        const rect=node.getBoundingClientRect();
        const computed=getComputedStyle(node);
        return rect.width>0
          && rect.height>0
          && rect.right>0
          && rect.left<innerWidth
          && computed.display!=='none'
          && computed.visibility!=='hidden'
          && computed.opacity!=='0';
      })
      .map(node => ({
        tag:node.tagName,
        id:node.id || '',
        className:typeof node.className==='string' ? node.className.trim().slice(0,120) : '',
        label:(node.getAttribute('aria-label') || node.textContent || '').trim().replace(/\s+/g,' ').slice(0,80),
        href:node.getAttribute('href') || '',
        width:node.getBoundingClientRect().width,
        height:Math.max(
          node.getBoundingClientRect().height,
          node.matches('input,select,textarea')
            ? (node.closest('label')?.getBoundingClientRect().height || 0)
            : 0,
        ),
      }));
    return {
      token:style.getPropertyValue(token).trim(),
      pageWidth:document.documentElement.scrollWidth,
      viewportWidth:innerWidth,
      bodyWidth:document.body?.scrollWidth || 0,
      interactive:visibleInteractive,
      controls:visibleInteractive.filter(item => item.tag!=='A'),
      links:visibleInteractive.filter(item => item.tag==='A'),
      title:document.title,
      page:document.documentElement.dataset.miPage || '',
    };
  },tokenName);
}

function assertCommonViewport(audit,label,{requireControls=false}={}) {
  expect(audit.pageWidth,`${label}: document has horizontal overflow`).toBeLessThanOrEqual(audit.viewportWidth+2);
  expect(audit.bodyWidth,`${label}: body has horizontal overflow`).toBeLessThanOrEqual(audit.viewportWidth+2);

  if(requireControls){
    expect(audit.controls.length,`${label}: no visible form or button controls`).toBeGreaterThan(0);
  }

  for(const control of audit.controls){
    const identity=`${control.tag}#${control.id}.${control.className} "${control.label}"`;
    expect(control.height,`${label}: ${identity} is below the compact 28px floor`).toBeGreaterThanOrEqual(28);
  }
}

async function auditClinicalViewport(page,label,{requireControls=false}={}) {
  const audit=await interactiveAudit(page,'--drx-shell-accent');
  const chrome=await page.evaluate(() => {
    const sidebar=document.querySelector('.mi-sidebar,.sidebar');
    const topbar=document.querySelector('.mi-topbar,.topbar');
    return {
      sidebarBg:sidebar ? getComputedStyle(sidebar).backgroundColor : '',
      topbarHeight:topbar ? Math.round(topbar.getBoundingClientRect().height) : 0,
    };
  });

  expect(audit.token,`${label}: Stripe accent token was not applied`).toBe('#533afd');
  expect(chrome.sidebarBg,`${label}: sidebar must use the approved navy shell`).toBe('rgb(28, 30, 84)');
  const expectedTopbarHeight=chrome.viewportWidth<=760 ? 50 : 58;
  expect(chrome.topbarHeight,`${label}: topbar height must match the Stripe shell`).toBe(expectedTopbarHeight);
  assertCommonViewport(audit,label,{requireControls});
  return {...audit,...chrome};
}

async function auditTailwindViewport(page,label,{requireControls=false}={}) {
  const audit=await interactiveAudit(page,'--tw-teal-500');
  expect(audit.token,`${label}: Tailwind teal token was not applied`).toBe('#147d7e');
  assertCommonViewport(audit,label,{requireControls});
  return audit;
}

for (const viewport of viewports) {
  test(`all authenticated clinical pages share the Stripe dashboard system on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await mockPhase5AuthenticatedSession(page);
    await mockRegistryV2Data(page);

    for (const file of clinicalPages) {
      await page.goto(`http://127.0.0.1:4173/${file}`, { waitUntil:'domcontentloaded' });
      if (file === 'index.html') {
        await expect(page.locator('html')).toHaveAttribute('data-drx-app', 'registry-v2');
        await expect(page.locator('.app-shell')).toBeVisible();
        await expect(page.locator('#registryRows tr[data-row-id]')).toHaveCount(3, { timeout:20000 });
        await page.waitForTimeout(250);
        await auditRegistryV2(page, `${file} / ${viewport.name}`);
        await page.locator('#filterToggle').click();
        await page.locator('#formPickerButton').click();
        await expect(page.locator('#formPickerPanel')).toBeVisible();
        await expect(page.locator('.form-picker-group')).toHaveCount(10);
        await expect(page.locator('[data-form-category="Tableta & pilula"] .form-category-count')).toHaveText('17');
        await expect(page.locator('[data-form-category="Kapsula"] .form-category-count')).toHaveText('11');
        await expect(page.locator('[data-form-category="Pika (sy, veshë, hundë)"] .form-category-count')).toHaveText('9');
        await expect(page.locator('[data-form-category="Sprej & Inhalim"] .form-category-count')).toHaveText('18');
        await page.locator('#formPickerSearch').fill('kapsul');
        await expect(page.locator('.form-picker-group')).toHaveCount(1);
        await expect(page.locator('[data-form-category="Kapsula"]')).toBeVisible();
        await expect(page.locator('[data-form-value="Capsule, hard"]')).toBeVisible();
        await page.screenshot({ path:path.join(OUTPUT, `registry-v2-form-picker-${viewport.name}.png`), fullPage:false });
        await page.locator('[data-form-value="Capsule, hard"]').click();
        await expect(page.locator('#formPickerValue')).toHaveText('Capsule, hard');
        await page.screenshot({ path:path.join(OUTPUT, `registry-v2-${viewport.name}.png`), fullPage:false });
        continue;
      }
      await expect(page.locator('html')).toHaveAttribute('data-medindex-profile', 'profile-portal-v2', { timeout:20000 });
      await expect(page.locator('.mi-app-shell,.app-shell').first()).toBeVisible({ timeout:20000 });
      await auditClinicalViewport(page, `${file} / ${viewport.name}`, { requireControls:true });

      if (file === 'icd.html') {
        await expect(page.locator('#icdSearch')).toBeVisible();
        await expect(page.locator('#chapterList')).toBeVisible();
      }
    }

    await page.screenshot({
      path:path.join(OUTPUT, `tailwind-clinical-${viewport.name}.png`),
      fullPage:false,
    });
  });

  test(`public pages share the Tailwind system on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);

    for (const file of publicPages) {
      await page.goto(`http://127.0.0.1:4173/${file}`, { waitUntil:'domcontentloaded' });
      await expect(page.locator('.info-shell')).toBeVisible();
      await expect(page.locator('link[data-medindex-tailwind-ui]')).toHaveCount(1);
      const audit = await auditTailwindViewport(page, `${file} / ${viewport.name}`);
      expect(audit.links.length, `${file}: public navigation links are missing`).toBeGreaterThan(0);
    }

    await page.screenshot({
      path:path.join(OUTPUT, `tailwind-public-${viewport.name}.png`),
      fullPage:true,
    });
  });

  test(`login and recovery load the Tailwind system on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.route('**/api/auth', async route => {
      if (route.request().method() !== 'GET') return route.continue();
      await route.fulfill({
        status:200,
        contentType:'application/json',
        body:JSON.stringify({
          authenticated:false,
          sessionConfigured:true,
          hardened:true,
          googleConfigured:false,
          passwordFallbackConfigured:true,
          csrfToken:'tailwind-site-browser-test',
        }),
      });
    });

    await page.goto('http://127.0.0.1:4173/login.html', { waitUntil:'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('data-mi-tailwind-ui', '20260805-1', { timeout:20000 });
    await expect(page.locator('.plan-block')).toBeVisible();
    await auditTailwindViewport(page, `login.html / ${viewport.name}`, { requireControls:true });
    const ctaBox = await page.locator('.plan-cta').boundingBox();
    expect(ctaBox).not.toBeNull();
    expect(ctaBox.height, `login CTA on ${viewport.name}`).toBeGreaterThanOrEqual(44);

    await page.unroute('**/api/auth');
    await page.goto('http://127.0.0.1:4173/recovery.html', { waitUntil:'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('data-mi-tailwind-ui', '20260805-1', { timeout:20000 });
    await expect(page.locator('.recovery-card')).toBeVisible();
    await auditTailwindViewport(page, `recovery.html / ${viewport.name}`);
  });
}
