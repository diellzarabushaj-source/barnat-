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
    await expect(chapterPicker.getByRole('button')).toHaveCount(19);
    const chapterFilter = chapterPicker.getByRole('searchbox',{name:'Filtro kapitujt'});
    await chapterFilter.fill('pa rezultat 999');
    await expect(chapterPicker.getByRole('status')).toBeVisible();
    await chapterFilter.press('Escape');
    await expect(chapterPicker.getByRole('button')).toHaveCount(19);
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
    await expect(dialog.getByText('Latinisht: Regio epigastrica')).toBeVisible();
    await expect(dialog.locator('#medlexDialogExample')).not.toBeEmpty();
    await expect(dialog.getByRole('link',{name:/Shkarko kartelën/})).toHaveAttribute('href',/ab02\.webp/);
    const close = dialog.getByRole('button',{name:'Mbyll kartelën'});
    await expect(close).toBeFocused();
    const dialogBounds = await dialog.boundingBox();
    expect(dialogBounds.x).toBeGreaterThanOrEqual(0);
    expect(dialogBounds.x + dialogBounds.width).toBeLessThanOrEqual(width + 1);
    await dialog.screenshot({path:path.join(OUTPUT, `tailwind-clinical-medlex-dialog-${name}.png`)});
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
    await expect(chapter.locator('option')).toHaveCount(19);
    await expect(chapter).toHaveValue('01');
    await chapter.selectOption('11');
    await expect(start).toBeDisabled();
    await chapter.selectOption('05');
    await topic.selectOption('ritmi');
    await expect(study.getByRole('status')).toHaveText('4 kartela të gatshme për studim.');
    await expect(page).toHaveURL(/category=05&mode=flashcards$/);
    await start.click();
    const question = study.getByRole('heading',{name:'Si quhet kur zemra rreh më shpejt se normalisht?'});
    const reveal = study.getByRole('button',{name:'Zbulo kartelën'});
    await expect(question).toBeFocused();
    await expect(answer).toBeHidden();
    expect(await image.getAttribute('src')).toBeNull();
    await expect(page.locator('#medlexStudyPosition')).toHaveText('Kartela 1 nga 4');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({path:path.join(OUTPUT, `tailwind-clinical-medlex-study-front-${name}.png`)});

    await reveal.press('Enter');
    await expect(answer.getByRole('heading',{name:'Takikardi',exact:true})).toBeFocused();
    await expect(question).toBeHidden();
    await expect(image).toHaveAttribute('src',/\/assets\/medlex-chapters\/c05-001\.webp/);
    await image.evaluate(node => node.decode());
    await expect(image).toBeVisible();
    await page.screenshot({path:path.join(OUTPUT, `tailwind-clinical-medlex-study-back-${name}.png`)});

    await page.getByRole('button',{name:'Listë',exact:true}).click();
    await expect(study).toBeHidden();
    await expect(page.locator('#medlexGridItems')).toHaveAttribute('data-view','list');
    await page.getByRole('button',{name:'Flashcards',exact:true}).click();
    await expect(answer.getByRole('heading',{name:'Takikardi',exact:true})).toBeVisible();
    await study.getByRole('button',{name:'Për përsëritje',exact:true}).click();
    for (const position of [2,3,4]) {
      await expect(page.locator('#medlexStudyPosition')).toHaveText(`Kartela ${position} nga 4`);
      await reveal.click();
      await study.getByRole('button',{name:'E dija',exact:true}).click();
    }
    await expect(page.locator('#medlexStudyResult')).toHaveText('I dije 3 nga 4 kartela. Për përsëritje: 1.');
    await study.getByRole('button',{name:'Përsërit të vështirat'}).click();
    await expect(page.locator('#medlexStudyPosition')).toHaveText('Kartela 1 nga 1');
    await expect(question).toBeFocused();
    await reveal.click();
    await study.getByRole('button',{name:'E dija',exact:true}).click();
    await expect(study.getByRole('button',{name:'Përsërit të vështirat'})).toBeHidden();

    await page.goto('http://127.0.0.1:4173/medlex.html?category=02&mode=flashcards');
    await expect(chapter).toHaveValue('02');
    await expect(topic.locator('option')).toHaveCount(10);
    await expect(start).toBeEnabled();
  });
}
