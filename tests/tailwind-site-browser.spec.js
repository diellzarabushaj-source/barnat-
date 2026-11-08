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
    if (request.method() !== 'GET' || url.pathname !== '/api/auth' || url.searchParams.has('scope')) return route.continue();
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
  // This site-wide comparison audits the explicit table view on each screen.
  // First-visit phone/list behavior is covered by audit-p1-browser.spec.js.
  await page.addInitScript(() => localStorage.setItem('drx_registry_v2_row_view','table'));
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
  for (const control of audit.controls) expect(Math.round(control.height), `${label}: control ${control.id}`).toBeGreaterThanOrEqual(28);
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
    expect(Math.round(control.height),`${label}: ${identity} is below the compact 28px floor`).toBeGreaterThanOrEqual(28);
  }
}

async function auditClinicalViewport(page,label,{requireControls=false}={}) {
  const audit=await interactiveAudit(page,'--drx-shell-accent');
  const chrome=await page.evaluate(() => {
    const sidebar=document.querySelector('.mi-sidebar,.sidebar');
    const topbar=document.querySelector('.mi-topbar,.topbar');
    return {
      sidebarBg:sidebar ? getComputedStyle(sidebar).backgroundColor : '',
      sidebarFinish:sidebar ? getComputedStyle(sidebar).backgroundImage : '',
      topbarHeight:topbar ? Math.round(topbar.getBoundingClientRect().height) : 0,
      viewportWidth:innerWidth,
    };
  });

  expect(audit.token,`${label}: Stripe accent token was not applied`).toBe('#533afd');
  expect(chrome.sidebarBg,`${label}: sidebar must use the approved navy shell`).toBe('rgb(28, 30, 84)');
  expect(chrome.sidebarFinish,`${label}: shared sidebar polish must apply`).toContain('linear-gradient');
  const expectedTopbarHeight=58;
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
        if(viewport.width>940) await expect(page.locator('#chapterList')).toBeVisible();
        else {
          await expect(page.locator('#chapterList')).toBeHidden();
          await expect(page.locator('#icdFilterChapter')).toBeHidden();
          await page.locator('#icdFilterPanel > summary').click();
          await expect(page.locator('#icdFilterChapter')).toBeVisible();
          await expect.poll(()=>page.locator('#icdFilterChapter option').count()).toBeGreaterThan(1);
          await page.locator('#icdFilterChapter').selectOption({index:1});
          await expect(page.locator('#nodeHero')).toBeVisible();
        }
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
    await page.route(/\/api\/auth(?:\?(?:session_probe|entry)=1)?$/, async route => {
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

    await page.unroute(/\/api\/auth(?:\?(?:session_probe|entry)=1)?$/);
    await page.goto('http://127.0.0.1:4173/recovery.html', { waitUntil:'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('data-mi-tailwind-ui', '20260805-1', { timeout:20000 });
    await expect(page.locator('.recovery-card')).toBeVisible();
    await auditTailwindViewport(page, `recovery.html / ${viewport.name}`);
  });
}

for (const {name, width, height} of [...viewports, {name:'small-dark',width:320,height:700}]) {
  test(`MedLex chapter, global search and card reading on ${name}`, async ({page}) => {
    await page.setViewportSize({width,height});
    await page.goto('http://127.0.0.1:4173/medlex.html?category=02');
    const chapterPicker = page.locator('#medlexChapterPicker');
    const search = page.locator('#medlexSearch');
    const grid = page.locator('#medlexGridItems');
    await expect(grid.locator('.medlex-card')).toHaveCount(157);
    if (name === 'small-dark') await page.locator('html').evaluate(html => html.dataset.theme = 'dark');
    const sidebar = page.locator('#sidebar');
    const activeNav = sidebar.locator('a[aria-current="page"][href="/medlex.html"]');
    await expect(activeNav).toHaveCSS('background-color','rgb(67, 54, 137)');
    if (width < 1024) {
      const menu = page.locator('#menuButton');
      const dockMenu = page.locator('#drxMobileNav button');
      await menu.click();
      await expect(menu).toHaveAttribute('aria-expanded','true');
      await expect(activeNav).toBeInViewport();
      await expect.poll(async () => Math.abs((await sidebar.boundingBox()).x)).toBeLessThan(1);
      await expect(page.locator('#sidebarBackdrop')).toBeVisible();
      await expect.poll(() => page.locator('.main-shell').evaluate(shell => shell.inert)).toBe(true);
      await page.screenshot({path:path.join(OUTPUT, `tailwind-clinical-medlex-sidebar-${name}.png`)});
      await page.locator('#sidebarClose').click();
      await expect(menu).toBeFocused();
      await dockMenu.click();
      await expect(menu).toHaveAttribute('aria-expanded','true');
      await page.keyboard.press('Escape');
      await expect(dockMenu).toBeFocused();
      await expect(page.locator('#sidebarBackdrop')).toBeHidden();
    }

    const searchBounds = await search.boundingBox();
    expect(searchBounds.y + searchBounds.height).toBeLessThan(height * .7);
    const chapterBounds = await chapterPicker.boundingBox();
    expect(chapterBounds.y).toBeGreaterThan(searchBounds.y);
    if (width < 1120) {
      await expect(chapterPicker.locator('.medlex-category').first()).toBeHidden();
      await chapterPicker.locator('summary').click();
    }
    await expect(chapterPicker.getByRole('button')).toHaveCount(20);
    const chapterFilter = chapterPicker.getByRole('searchbox',{name:'Filtro kapitujt'});
    await chapterFilter.fill('pa rezultat 999');
    await expect(chapterPicker.getByRole('status')).toBeVisible();
    await chapterFilter.press('Escape');
    await expect(chapterPicker.getByRole('button')).toHaveCount(20);
    await chapterFilter.fill('01 terminologji');
    await expect(chapterPicker.getByRole('button')).toHaveCount(1);
    await chapterPicker.locator('[data-category="01"]').click();
    await expect(chapterPicker.locator('#medlexChapterFilter')).toHaveValue('');
    await expect(grid.locator('.medlex-card')).toHaveCount(20);
    await expect(chapterPicker.locator('[data-category="01"]')).toHaveAttribute('aria-pressed','true');
    if (width < 1120) await expect(chapterPicker.locator('summary')).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await expect.poll(() => grid.locator('img').first().evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    await page.screenshot({path:path.join(OUTPUT, `tailwind-clinical-medlex-${name}.png`)});

    await search.fill('Regio epigastrica');
    await expect(page.locator('#medlexCollectionTitle')).toHaveText('Rezultatet e kërkimit');
    const card = grid.getByRole('button',{name:'Hap kartelën Epigastriumi',exact:true});
    await expect(card).toBeVisible();
    await page.getByRole('button',{name:'Listë',exact:true}).click();
    await expect(grid).toHaveAttribute('data-view','list');
    await card.click();
    const dialog = page.getByRole('dialog',{name:'Epigastriumi'});
    await expect(dialog).toBeVisible();
    const close = dialog.getByRole('button',{name:'Mbyll kartelën'});
    await expect(close).toBeFocused();
    const dialogBounds = await dialog.boundingBox();
    expect(dialogBounds.x).toBeGreaterThanOrEqual(0);
    expect(dialogBounds.x + dialogBounds.width).toBeLessThanOrEqual(width + 1);
    await expect(dialog.locator('#medlexDetailsSheet')).toBeHidden();
    await dialog.screenshot({path:path.join(OUTPUT, `tailwind-clinical-medlex-dialog-${name}.png`)});
    await dialog.getByRole('button',{name:/Më shumë/}).click();
    await expect(dialog.getByText('Latinisht: Regio epigastrica')).toBeVisible();
    await expect(dialog.locator('#medlexDialogExample')).not.toBeEmpty();
    await expect(dialog.getByRole('link',{name:/Shkarko kartelën/})).toHaveAttribute('href',/ab02\.webp/);
    await page.keyboard.press('Escape');
    await expect(dialog.locator('#medlexDetailsSheet')).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(card).toBeFocused();
    await page.getByRole('button',{name:'Pastro kërkimin'}).click();
    await expect(grid.locator('.medlex-card')).toHaveCount(20);
    await expect(chapterPicker.locator('#medlexSelectedChapter')).toHaveText(/^01 ·/);
    await page.reload();
    await expect(grid).toHaveAttribute('data-view','list');
  });
}

test('MedLex unifies the 21 ORL findings into one chapter with six groups', async ({page}) => {
  await page.goto('http://127.0.0.1:4173/medlex.html?category=19');
  const cards = page.locator('#medlexGridItems .medlex-card');
  await expect(page.locator('#medlexCollectionTitle')).toHaveText('Atlasi ORL — Vesh, hundë, gojë dhe faring');
  await expect(cards).toHaveCount(21);
  await expect(page.locator('.medlex-subchapter')).toHaveCount(6);
  await expect(cards.locator('img')).toHaveCount(21);
  await expect(page.locator('#medlexTotal')).toHaveText('21');
  await expect(page.locator('#medlexCategories [data-category="19"]')).toContainText('21 kartela');
  await expect(page.locator('#medlexCategories [data-category="20"]')).toHaveCount(0);
  await expect(cards.locator('img').first()).toHaveAttribute('src',/\/assets\/medlex-chapters\/c19-001\.webp/);
  await expect.poll(() => cards.locator('img').first().evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  await page.getByRole('button',{name:'Hap kartelën Abscesi peritonsilar'}).click();
  const dialog = page.getByRole('dialog',{name:'Abscesi peritonsilar'});
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('#medlexDialogExample')).toContainText('urgjent ORL');
  await expect(dialog.locator('#medlexDialogImage')).toHaveAttribute('src',/c19-010\.webp/);
});

test('MedLex old ORL ear/nose link redirects into the merged 21-card atlas', async ({page}) => {
  await page.goto('http://127.0.0.1:4173/medlex.html?category=20');
  const cards = page.locator('#medlexGridItems .medlex-card');
  await expect(page).toHaveURL(/category=19$/);
  await expect(page.locator('#medlexCollectionTitle')).toHaveText('Atlasi ORL — Vesh, hundë, gojë dhe faring');
  await expect(cards).toHaveCount(21);
  await expect(page.locator('.medlex-subchapter')).toHaveCount(6);
  await expect(cards.locator('img')).toHaveCount(21);
  await page.getByRole('button',{name:'Studio me flashcards'}).click();
  await expect(page.getByLabel('Kapitulli',{exact:true})).toHaveValue('19');
  await expect(page.getByLabel('Kapitulli',{exact:true}).locator('option')).toHaveCount(20);
  await expect(page.locator('#medlexStudyAvailability')).toHaveText('21 kartela të gatshme për studim.');
  await page.getByRole('button',{name:'Listë',exact:true}).click();
  await page.getByRole('button',{name:'Hap kartelën Timpan normal'}).click();
  const dialog = page.getByRole('dialog',{name:'Timpan normal'});
  await expect(dialog.locator('#medlexDialogImage')).toHaveAttribute('src',/c20-001\.webp/);
  await expect(dialog.locator('#medlexDialogExample')).toContainText('pa bombim');
});

test('MedLex atlas supports tapping, dismissing, and swipe-style navigation', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('http://127.0.0.1:4173/medlex.html?category=20');
  await page.getByRole('button',{name:'Hap kartelën Timpan normal'}).click();
  // The dialog's accessible name intentionally changes as the active card changes.
  const dialog = page.locator('#medlexDialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('#medlexDeckCount')).toHaveText('15 / 21');
  await expect(dialog.locator('#medlexDeckProgress')).toHaveAttribute('style',/71\.428/);
  await expect(dialog.locator('#medlexDetailsSheet')).toBeHidden();
  const artwork = dialog.locator('#medlexSwipeSurface');
  const artRect = await artwork.boundingBox();
  expect(artRect.width).toBeLessThanOrEqual(390);
  expect(Math.abs(artRect.width - artRect.height)).toBeLessThan(3);
  await expect(dialog.locator('#medlexDialogImage')).toBeVisible();
  await dialog.getByRole('button',{name:/Më shumë/}).click();
  await expect(dialog.locator('#medlexDetailsSheet')).toBeVisible();
  await expect(dialog.locator('#medlexDetailsTitle')).toHaveText('Timpan normal');
  await expect(dialog.locator('#medlexDialogExample')).toContainText('pa bombim');
  await dialog.getByRole('button',{name:'Mbyll detajet'}).click();
  await expect(dialog.locator('#medlexDetailsSheet')).toBeHidden();
  await dialog.locator('#medlexDeckImageHit').click();
  await expect(dialog.locator('#medlexDialogTitle')).toHaveText('Otiti i mesëm akut');
  await expect(dialog.locator('#medlexDeckCount')).toHaveText('16 / 21');
  await dialog.getByRole('button',{name:'Hiqe këtë kartelë nga prezantimi'}).click();
  await expect(dialog.locator('#medlexDialogTitle')).toHaveText('Efuzioni i veshit të mesëm');
  await expect(dialog.locator('#medlexDeckCount')).toHaveText('16 / 20');
  await page.keyboard.press('ArrowLeft');
  await expect(dialog.locator('#medlexDialogTitle')).toHaveText('Timpan normal');
  await page.keyboard.press('ArrowRight');
  await expect(dialog.locator('#medlexDialogTitle')).toHaveText('Efuzioni i veshit të mesëm');
  await expect(dialog.getByRole('button',{name:'Kartela e mëparshme'})).toBeVisible();
  await dialog.getByRole('button',{name:'Kartela e mëparshme'}).click();
  await expect(dialog.locator('#medlexDialogTitle')).toHaveText('Timpan normal');
  await page.keyboard.press('ArrowRight');
  await expect(dialog.locator('#medlexDialogTitle')).toHaveText('Efuzioni i veshit të mesëm');
  const surface = dialog.locator('#medlexSwipeSurface');
  const rect = await surface.boundingBox();
  await page.mouse.move(rect.x + rect.width * .68,rect.y + Math.min(rect.height * .25,140));
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width * .30,rect.y + Math.min(rect.height * .25,140),{steps:7});
  await page.mouse.up();
  await expect(dialog.locator('#medlexDialogTitle')).toHaveText('Hunda normale');
  await dialog.getByRole('button',{name:'Mbyll kartelën'}).click();
  await expect(dialog).toBeHidden();
});

test('MedLex keeps a single search result swipeable within its chapter', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('http://127.0.0.1:4173/medlex.html?category=01');
  await page.locator('#medlexSearch').fill('subakut');
  await page.locator('#medlexGridItems .medlex-card-open').first().click();
  const dialog = page.locator('#medlexDialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('#medlexDeckCount')).not.toHaveText('1 / 1');
  const initial = await dialog.locator('#medlexDialogTitle').textContent();
  await dialog.locator('#medlexDeckImageHit').click();
  await expect(dialog.locator('#medlexDialogTitle')).not.toHaveText(initial);
});

test('MedLex Studio presents a 3D flashcard and supports swipe-to-rate', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('http://127.0.0.1:4173/medlex.html?category=05&mode=flashcards');
  const study = page.locator('#medlexStudy');
  await expect(study).toBeVisible();
  await page.getByLabel('Nënkapitulli',{exact:true}).selectOption('ritmi');
  await study.getByRole('button',{name:'Fillo seancën'}).click();
  const card = study.locator('#medlexStudyCard');
  await expect(card).toBeVisible();
  await expect(study.locator('#medlexStudyCardNumber')).toHaveText('01 / 04');
  await expect(study.locator('#medlexStudySwipeHint')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await study.getByRole('button',{name:'Zbulo kartelën'}).click();
  await expect(study.locator('#medlexStudySwipeHint')).toBeVisible();
  await expect(card).toHaveClass(/is-revealed/);
  await expect(study.locator('#medlexStudyTerm')).toHaveText('Takikardi');
  const actionDock = study.locator('.medlex-study-action-dock');
  await expect(actionDock).toBeVisible();
  await expect(actionDock.locator('.medlex-study-choice')).toHaveCount(2);
  expect(await card.evaluate(node => node.contains(document.getElementById('medlexStudyKnown')))).toBe(false);
  const clinicalDetails = study.locator('#medlexStudyDetailsDialog');
  await expect(clinicalDetails).toBeHidden();
  await study.getByRole('button',{name:'Më shumë'}).click();
  await expect(clinicalDetails).toBeVisible();
  await expect(clinicalDetails.locator('#medlexStudyDefinition')).toBeVisible();
  await expect(clinicalDetails.locator('#medlexStudyExample')).toBeVisible();
  await clinicalDetails.getByRole('button',{name:'Mbyll detajet'}).click();
  await expect(clinicalDetails).toBeHidden();
  await study.getByRole('button',{name:'Kthe te pyetja'}).click();
  await expect(study.locator('#medlexStudyFront')).toBeVisible();
  await study.getByRole('button',{name:'Zbulo kartelën'}).click();
  await expect(study.locator('#medlexStudyTerm')).toHaveText('Takikardi');
  await study.getByRole('button',{name:'Hap studimin në ekran të plotë'}).click();
  await expect(study.locator('#medlexStudySession')).toHaveClass(/is-immersive/);
  await expect(study.locator('#medlexStudyFocus')).toHaveAttribute('aria-pressed','true');
  await page.waitForTimeout(460);
  await page.screenshot({path:path.join(OUTPUT,'tailwind-clinical-medlex-study-focus-mobile.png')});
  await page.keyboard.press('Escape');
  await expect(study.locator('#medlexStudySession')).not.toHaveClass(/is-immersive/);
  const artwork = await study.locator('#medlexStudyImage').boundingBox();
  await page.mouse.move(artwork.x+artwork.width*.73,artwork.y+artwork.height*.4);
  await page.mouse.down();
  await page.mouse.move(artwork.x+artwork.width*.23,artwork.y+artwork.height*.4,{steps:9});
  await expect(study.locator('#medlexStudyCardStage')).toHaveClass(/is-swipe-ready/);
  expect(await study.locator('#medlexStudyCardStage').evaluate(node => node.style.getPropertyValue('--study-front-rotate'))).toMatch(/deg$/);
  await page.mouse.up();
  await expect(study.locator('#medlexStudyPosition')).toHaveText('Kartela 2 nga 4 · 25%');
  await expect(study.locator('#medlexStudyCardStage')).not.toHaveClass(/is-scrubbing/);
  await expect(study.locator('#medlexStudyRemaining')).toHaveText('1');
  await study.getByRole('button',{name:'Zbulo kartelën'}).click();
  await expect(study.locator('#medlexStudyTerm')).toHaveText('Bradikardi');
  const secondArtwork = await study.locator('#medlexStudyImage').boundingBox();
  await page.mouse.move(secondArtwork.x+secondArtwork.width*.22,secondArtwork.y+secondArtwork.height*.44);
  await page.mouse.down();
  await page.mouse.move(secondArtwork.x+secondArtwork.width*.74,secondArtwork.y+secondArtwork.height*.44,{steps:9});
  await page.mouse.up();
  await expect(study.locator('#medlexStudyPosition')).toHaveText('Kartela 3 nga 4 · 50%');
  await expect(study.locator('#medlexStudyMastered')).toHaveText('1');
});

test('MedLex desktop study arena keeps its card centered and supports keyboard ratings', async ({page}) => {
  await page.setViewportSize({width:1440,height:900});
  await page.goto('http://127.0.0.1:4173/medlex.html?category=05&mode=flashcards');
  const study = page.locator('#medlexStudy');
  await page.getByLabel('Nënkapitulli',{exact:true}).selectOption('ritmi');
  await study.getByRole('button',{name:'Fillo seancën'}).click();
  const card = study.locator('#medlexStudyCard');
  const left = study.locator('.medlex-study-desktop-rail-review');
  const right = study.locator('.medlex-study-desktop-rail-known');
  await expect(left).toBeHidden();
  await page.locator('#medlexStudyQuestion').press('Space');
  await expect(study.locator('#medlexStudyTerm')).toHaveText('Takikardi');
  await expect(left).toBeVisible();
  await expect(right).toBeVisible();
  await page.locator('#medlexStudyImage').evaluate(node => node.decode());
  await page.waitForTimeout(450);
  const cardBounds = await card.boundingBox();
  const leftBounds = await left.boundingBox();
  const rightBounds = await right.boundingBox();
  const dockBounds = await study.locator('.medlex-study-action-dock').boundingBox();
  expect(cardBounds.width).toBeLessThanOrEqual(575);
  expect(leftBounds.x + leftBounds.width).toBeLessThan(cardBounds.x - 4);
  expect(rightBounds.x).toBeGreaterThan(cardBounds.x + cardBounds.width + 4);
  expect(dockBounds.y + dockBounds.height).toBeLessThanOrEqual(900);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
  await page.screenshot({path:path.join(OUTPUT,'tailwind-clinical-medlex-study-desktop-arena.png')});
  await study.getByRole('button',{name:'Hap studimin në ekran të plotë'}).click();
  await expect(study.locator('#medlexStudySession')).toHaveClass(/is-immersive/);
  await page.waitForTimeout(450);
  await page.screenshot({path:path.join(OUTPUT,'tailwind-clinical-medlex-study-desktop-focus.png')});
  await study.locator('#medlexStudyTerm').focus();
  await page.keyboard.press('ArrowRight');
  await expect(study.locator('#medlexStudyPosition')).toHaveText('Kartela 2 nga 4 · 25%');
  await expect(study.locator('#medlexStudyMastered')).toHaveText('1');
  await expect(study.locator('#medlexStudyUndo')).toBeVisible();
  await page.locator('#medlexStudyQuestion').press('Backspace');
  await expect(study.locator('#medlexStudyPosition')).toHaveText('Kartela 1 nga 4 · 0%');
  await expect(study.locator('#medlexStudyMastered')).toHaveText('0');
  await expect(study.locator('#medlexStudyUndo')).toBeHidden();
  await page.locator('#medlexStudyQuestion').press('Space');
  await page.keyboard.press('ArrowRight');
  await expect(study.locator('#medlexStudyPosition')).toHaveText('Kartela 2 nga 4 · 25%');
  await page.locator('#medlexStudyQuestion').press('Space');
  await expect(study.locator('#medlexStudyTerm')).toHaveText('Bradikardi');
  await page.keyboard.press('ArrowLeft');
  await expect(study.locator('#medlexStudyPosition')).toHaveText('Kartela 3 nga 4 · 50%');
  await expect(study.locator('#medlexStudyRemaining')).toHaveText('1');
  await page.keyboard.press('Escape');
  await expect(study.locator('#medlexStudySession')).not.toHaveClass(/is-immersive/);
});

for (const {name, width, height} of [...viewports, {name:'small-dark',width:320,height:700}]) {
  test(`MedLex chapter flashcards reveal the original card and retry missed terms on ${name}`, async ({page}) => {
    await page.setViewportSize({width,height});
    await page.goto('http://127.0.0.1:4173/medlex.html?category=01');
    if (name === 'small-dark') await page.locator('html').evaluate(html => html.dataset.theme = 'dark');
    await page.getByRole('button',{name:'Studio me flashcards'}).click();
    const chapter = page.getByLabel('Kapitulli',{exact:true});
    const topic = page.getByLabel('Nënkapitulli',{exact:true});
    const study = page.locator('#medlexStudy');
    const start = study.getByRole('button',{name:'Fillo seancën'});
    const answer = page.locator('#medlexStudyAnswer');
    const image = page.locator('#medlexStudyImage');
    await expect(chapter.locator('option')).toHaveCount(20);
    await expect(chapter).toHaveValue('01');
    await chapter.selectOption('11');
    await expect(start).toBeDisabled();
    await chapter.selectOption('05');
    await topic.selectOption('ritmi');
    await expect(study.locator('#medlexStudyAvailability')).toHaveText('4 kartela të gatshme për studim.');
    await expect(page).toHaveURL(/category=05&mode=flashcards$/);
    await start.click();
    const question = study.getByRole('heading',{name:'Si quhet kur zemra rreh më shpejt se normalisht?'});
    const reveal = study.getByRole('button',{name:'Zbulo kartelën'});
    await expect(question).toBeFocused();
    await expect(answer).toBeHidden();
    expect(await image.getAttribute('src')).toBeNull();
    await expect(page.locator('#medlexStudyPosition')).toHaveText('Kartela 1 nga 4 · 0%');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.waitForTimeout(450);
    await page.screenshot({path:path.join(OUTPUT, `tailwind-clinical-medlex-study-front-${name}.png`)});

    if (width < 600) await page.locator('#medlexStudyFront').click({position:{x:22,y:25}});
    else await reveal.press('Enter');
    await expect(answer.getByRole('heading',{name:'Takikardi',exact:true})).toBeFocused();
    await expect(question).toBeHidden();
    await expect(image).toHaveAttribute('src',/\/assets\/medlex-chapters\/c05-001\.webp/);
    await image.evaluate(node => node.decode());
    await expect(image).toBeVisible();
    await page.waitForTimeout(450);
    await page.screenshot({path:path.join(OUTPUT, `tailwind-clinical-medlex-study-back-${name}.png`)});

    await page.getByRole('button',{name:'Listë',exact:true}).click();
    await expect(study).toBeHidden();
    await expect(page.locator('#medlexGridItems')).toHaveAttribute('data-view','list');
    await page.getByRole('button',{name:'Flashcards',exact:true}).click();
    await expect(answer.getByRole('heading',{name:'Takikardi',exact:true})).toBeVisible();
    await study.getByRole('button',{name:'Për përsëritje',exact:true}).click();
    for (const position of [2,3,4]) {
      await expect(page.locator('#medlexStudyPosition')).toHaveText(`Kartela ${position} nga 4 · ${(position - 1) * 25}%`);
      if (position === 3) {
        await expect(study.getByRole('heading',{name:'Çrregullim i ritmit ose i frekuencës normale të zemrës.',exact:true})).toBeVisible();
      }
      await reveal.click();
      await study.getByRole('button',{name:'E dija',exact:true}).click();
    }
    await expect(page.locator('#medlexStudyResult')).toHaveText('I dije 3 nga 4 kartela. Për përsëritje: 1.');
    await expect(study.locator('#medlexStudyScore')).toHaveText('75%');
    await expect(study.locator('#medlexStudyScoreRing')).toHaveAttribute('aria-label','75% të kartelave i dije');
    await expect(study.locator('#medlexStudySummaryKnown')).toHaveText('3');
    await expect(study.locator('#medlexStudySummaryReview')).toHaveText('1');
    await page.screenshot({path:path.join(OUTPUT, `tailwind-clinical-medlex-study-summary-${name}.png`)});
    await expect(study.locator('#medlexStudyUndoSummary')).toBeVisible();
    await study.locator('#medlexStudyUndoSummary').click();
    await expect(study.locator('#medlexStudyPosition')).toHaveText('Kartela 4 nga 4 · 75%');
    await expect(study.locator('#medlexStudyMastered')).toHaveText('2');
    await reveal.click();
    await study.getByRole('button',{name:'E dija',exact:true}).click();
    await expect(page.locator('#medlexStudyResult')).toHaveText('I dije 3 nga 4 kartela. Për përsëritje: 1.');
    await study.getByRole('button',{name:'Përsërit të vështirat'}).click();
    await expect(page.locator('#medlexStudyPosition')).toHaveText('Kartela 1 nga 1 · 0%');
    await expect(question).toBeFocused();
    await reveal.click();
    await study.getByRole('button',{name:'E dija',exact:true}).click();
    await expect(study.locator('#medlexStudyScore')).toHaveText('100%');
    await expect(study.getByRole('button',{name:'Përsërit të vështirat'})).toBeHidden();

    await page.goto('http://127.0.0.1:4173/medlex.html?category=02&mode=flashcards');
    await expect(chapter).toHaveValue('02');
    await expect(topic.locator('option')).toHaveCount(10);
    await expect(start).toBeEnabled();
  });
}

test('MedLex chapter flashcards sync progress and restore the right account', async ({page, browser}) => {
  const first = '11111111-1111-4111-8111-111111111111';
  const second = '22222222-2222-4222-8222-222222222222';
  const rows = new Map();
  const empty = {revision:0, mutation:null, snapshot:{ratings:{}, session:null}};
  const url = 'http://127.0.0.1:4173/medlex.html?category=05&mode=flashcards';
  async function mockAccount(tab, account) {
    await tab.route('**/api/auth*', async route => {
      const request = route.request();
      const scope = new URL(request.url()).searchParams.get('scope');
      if (!scope && request.method() === 'GET') {
        return route.fulfill({json:{
          authenticated:true, supabaseAuthenticated:true, sessionVersion:3, hardened:true,
          authUser:{id:account, role:'doctor', status:'active'}, user:{name:'Study test',email:'study@example.test'},
        }});
      }
      if (scope !== 'medlex-progress') return route.continue();
      expect(request.headers()['x-medlex-account']).toBe(account);
      const row = rows.get(account) || empty;
      if (request.method() === 'GET') return route.fulfill({json:{ok:true,...row}});
      const {revision, mutation, snapshot} = request.postDataJSON();
      if (row.revision !== revision) return route.fulfill({status:409,json:{ok:false,code:'PROGRESS_CONFLICT',...row}});
      const saved = {revision:revision + 1, mutation, snapshot};
      rows.set(account, saved);
      return route.fulfill({json:{ok:true,...saved}});
    });
  }

  await mockAccount(page, first);
  await page.goto(url);
  await expect(page.locator('#medlexStudySync')).toHaveText('I sinkronizuar me llogarinë');
  await page.getByLabel('Nënkapitulli',{exact:true}).selectOption('ritmi');
  await page.getByRole('button',{name:'Fillo seancën'}).click();
  await page.getByRole('button',{name:'Zbulo kartelën'}).click();
  await page.getByRole('button',{name:'Për përsëritje',exact:true}).click();
  await expect(page.locator('#medlexStudySync')).toHaveText('I sinkronizuar me llogarinë');
  expect(rows.get(first).snapshot.ratings).toEqual({'c05-001':'review'});

  const otherDevice = await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});
  try {
    const resumed = await otherDevice.newPage();
    await mockAccount(resumed, first);
    await resumed.goto(url);
    await expect(resumed.locator('#medlexStudyPosition')).toHaveText('Kartela 2 nga 4 · 25%');
    await expect(resumed.locator('#medlexStudyRemaining')).toHaveText('1');
    await expect(resumed.getByRole('heading',{name:'Si quhet kur zemra rreh më ngadalë se normalisht?'})).toBeVisible();
    await resumed.getByRole('button',{name:'Zbulo kartelën'}).click();
    await resumed.getByRole('button',{name:'E dija',exact:true}).click();
    await expect(resumed.locator('#medlexStudySync')).toHaveText('I sinkronizuar me llogarinë');

    await page.getByRole('button',{name:'Zbulo kartelën'}).click();
    await page.getByRole('button',{name:'Për përsëritje',exact:true}).click();
    await expect(page.locator('#medlexStudySync')).toContainText('pajisje ose tab tjetër');
    await page.getByRole('button',{name:'Hap progresin e ruajtur'}).click();
    await expect(page.locator('#medlexStudyMastered')).toHaveText('1');
    await expect(page.locator('#medlexStudyPosition')).toHaveText('Kartela 3 nga 4 · 50%');

    const other = await otherDevice.newPage();
    await mockAccount(other, second);
    await other.goto(url);
    await expect(other.locator('#medlexStudySync')).toHaveText('I sinkronizuar me llogarinë');
    await expect(other.locator('#medlexStudyStudied')).toHaveText('0');
    await expect(other.getByRole('button',{name:'Fillo seancën'})).toBeEnabled();
    await expect(other.locator('#medlexStudySession')).toBeHidden();
  } finally {
    await otherDevice.close();
  }
});
