const { test, expect } = require('@playwright/test');

const emergencyFixture = {
  _id:'emergency-anaphylaxis-test',
  title:'Anafilaksia — trajtimi i menjëhershëm te i rrituri',
  icdCodes:['T78.2'],
  aliases:['anafilaksi','shok anafilaktik'],
  category:'Alergji / Anafilaksi',
  triageLevel:'critical',
  summary:'Anafilaksia është emergjencë me fillim të shpejtë. Te i rrituri me probleme A/B/C, adrenalina IM është trajtimi i linjës së parë.',
  primaryCareSteps:[
    {
      _key:'ana-1', title:'Njih anafilaksinë dhe thirr ndihmë', priority:'immediate', setting:'primary',
      action:'Vlerëso ABCDE, thirr urgjencën dhe largo shkaktarin vetëm nëse kjo nuk e vonon trajtimin.',
      why:'Përkeqësimi mund të jetë shumë i shpejtë.', note:'Mos prit urtikarie për ta njohur anafilaksinë.',
    },
    {
      _key:'ana-2', title:'Jep adrenalinë intramuskulare tani', priority:'immediate', setting:'primary',
      action:'Jep adrenalinë 500 mikrogram = 0.5 mg = 0.5 mL nga 1 mg/mL IM në kofshën anterolaterale; përsërite pas 5 minutash nëse problemet A/B/C vazhdojnë.',
      why:'Adrenalina IM është trajtimi i zgjedhur dhe nuk duhet vonuar.', note:'Përdor rrugën IM në kofshën anterolaterale.',
    },
    {
      _key:'ana-3', title:'Poziciono, oksigjeno dhe monitoro', priority:'immediate', setting:'primary',
      action:'Mbaje pacientin shtrirë kur është e mundur, jep oksigjen kur indikohet dhe monitoro SpO₂, puls, tension dhe vetëdije.',
      why:'Pozicionimi dhe monitorimi ndihmojnë të zbulohet përkeqësimi.', note:'Mos e ngrit papritur pacientin në këmbë.',
    },
  ],
  redFlags:[
    'Stridor, edema e gjuhës/laringut ose vështirësi progresive në rrugët e frymëmarrjes',
    'Hipotension, sinkopë, konfuzion ose shenja shoku',
  ],
  doNotDo:[
    'Mos e vono adrenalinën IM duke pritur antihistaminik ose akses IV.',
    'Mos e lejo pacientin të ngrihet papritur në këmbë.',
  ],
  referral:{
    when:'Menjëherë, paralelisht me stabilizimin fillestar.',
    destination:'Urgjenca spitalore / ekip me kapacitet për menaxhim të avancuar.',
    urgency:'immediate',
    beforeTransfer:['Regjistro orën dhe dozën e adrenalinës.'],
    handover:'Anafilaksi; komprometimi A/B/C; dozat e adrenalinës; trendi i SpO₂ dhe tensionit.',
  },
  secondaryCareSteps:[
    {
      _key:'ana-s1', title:'Menaxho anafilaksinë refraktare', priority:'minutes', setting:'secondary',
      action:'Kërko ekspertizë të avancuar nëse komprometimi A/B/C vazhdon pas dozave të përshtatshme IM.',
      why:'Anafilaksia refraktare kërkon menaxhim të avancuar.', note:'Adrenalina IV kërkon ambient të monitoruar dhe ekspertizë.',
    },
  ],
  sources:[
    {title:'RCUK anaphylaxis guideline', url:'https://example.test/rcuk'},
    {title:'RCUK anaphylaxis guideline', url:'https://example.test/rcuk'},
    {title:'Secondary guideline', url:'https://example.test/secondary'},
  ],
  reviewStatus:'review',
  version:'0.11',
};

const metadataFixture = [{
  _id:emergencyFixture._id,
  reviewStatus:'review',
  lastReviewedAt:null,
  reviewDueAt:null,
  sourceCount:2,
  sources:[
    {title:'RCUK anaphylaxis guideline',url:'https://example.test/rcuk',publishedAt:'2025-10-27'},
    {title:'Secondary guideline',url:'https://example.test/secondary',publishedAt:'2025-01-01'},
  ],
}];

async function installFrozenSanityFixture(page) {
  await page.route('**/sanity-clinical-client.js*', route => route.fulfill({
    status:200,
    contentType:'application/javascript; charset=utf-8',
    body:`window.MedIndexSanity = Object.freeze({
      projectId:'test',dataset:'test',studioUrl:'#',
      query:async groq => String(groq).includes('"sourceCount":count(sources)')
        ? ${JSON.stringify(metadataFixture)}
        : ${JSON.stringify([emergencyFixture])}
    });`,
  }));
}

async function openEmergency(page) {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error)));
  await installFrozenSanityFixture(page);
  await page.goto('http://127.0.0.1:4173/urgjencat.html', {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => document.documentElement.classList.contains('auth-ready'));
  await expect(page.locator('#emergencyDetail .ck-sl-experience')).toBeVisible({timeout:10000});
  await page.evaluate(() => document.fonts.ready);
  return pageErrors;
}

function contrastRatio(foreground, background) {
  const rgb = value => (String(value).match(/[\d.]+/g) || []).slice(0,3).map(Number);
  const luminance = value => {
    const [r,g,b] = rgb(value).map(channel => {
      const c = channel / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126*r + 0.7152*g + 0.0722*b;
  };
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a,b) + 0.05) / (Math.min(a,b) + 0.05);
}

test.describe('Urgjencat Summary / Learn QA', () => {
  test.use({serviceWorkers:'block'});

  test('desktop: dy modalitete, terapi precize, tipografi, triage, drawer, flashcards dhe dark mode', async ({page}) => {
    await page.setViewportSize({width:1440,height:1000});
    const pageErrors = await openEmergency(page);

    const modes = page.locator('#emergencyDetail [data-ck-mode]');
    await expect(modes).toHaveCount(2);
    await expect(page.getByRole('button',{name:'Përmbledhje'})).toHaveAttribute('aria-pressed','true');
    await expect(page.getByRole('button',{name:'Mëso'})).toHaveAttribute('aria-pressed','false');
    await expect(page.locator('.ck-sl-summary')).toBeVisible();
    await expect(page.locator('.ck-sl-learn')).toBeHidden();
    await expect(page.locator('.ck-sections')).toBeHidden();

    const treatment = page.locator('.ck-sl-therapy');
    await expect(treatment).toContainText('Trajtimi i parë');
    await expect(treatment).toContainText('500 mikrogram');
    await expect(treatment).toContainText('0.5 mg');
    await expect(treatment).toContainText('IM');
    await expect(page.locator('.ck-sl-step')).toHaveCount(3);
    await expect(page.locator('.ck-review-button')).toHaveAttribute('title','2 burime klinike · Për verifikim');

    await expect(page.locator('.ck-directory-source-count')).toHaveText('2 burime');
    await expect(page.locator('.ck-directory-review')).toHaveText('Për verifikim');
    await expect(page.locator('.ck-directory-tag.is-icd')).toHaveText('T78.2');
    await expect(page.locator('.ck-triage-filter')).toBeVisible();
    await expect(page.locator('.ck-triage-filter-group button')).toHaveCount(4);
    await expect(page.locator('[data-ck-triage="critical"] [data-ck-triage-count="critical"]')).toHaveText('1');

    const typeMetrics = await page.evaluate(() => ({
      fontLoaded:document.fonts.check('14px Inter'),
      pageFamily:getComputedStyle(document.body).fontFamily,
      family:getComputedStyle(document.querySelector('.ck-sl-therapy-copy p')).fontFamily,
      body:Number.parseFloat(getComputedStyle(document.querySelector('.ck-sl-therapy-copy p')).fontSize),
      step:Number.parseFloat(getComputedStyle(document.querySelector('.ck-sl-step p')).fontSize),
      directoryTag:Number.parseFloat(getComputedStyle(document.querySelector('.ck-directory-tag')).fontSize),
      directoryStatus:Number.parseFloat(getComputedStyle(document.querySelector('.ck-directory-review')).fontSize),
      directoryTitle:Number.parseFloat(getComputedStyle(document.querySelector('.ck-list-button strong')).fontSize),
      triageText:Number.parseFloat(getComputedStyle(document.querySelector('.ck-triage-filter-copy span')).fontSize),
      triageButton:Number.parseFloat(getComputedStyle(document.querySelector('.ck-triage-filter-group button')).fontSize),
      triageHeight:document.querySelector('.ck-triage-filter-group button').getBoundingClientRect().height,
      modeHeight:document.querySelector('[data-ck-mode="summary"]').getBoundingClientRect().height,
    }));
    expect(typeMetrics.fontLoaded).toBe(true);
    expect(typeMetrics.pageFamily.toLowerCase()).toContain('inter');
    expect(typeMetrics.family).toBe(typeMetrics.pageFamily);
    expect(typeMetrics.body).toBeGreaterThanOrEqual(13.5);
    expect(typeMetrics.step).toBeGreaterThanOrEqual(13);
    expect(typeMetrics.directoryTag).toBeGreaterThanOrEqual(11);
    expect(typeMetrics.directoryStatus).toBeGreaterThanOrEqual(11);
    expect(typeMetrics.directoryTitle).toBeGreaterThanOrEqual(14);
    expect(typeMetrics.triageText).toBeGreaterThanOrEqual(11.5);
    expect(typeMetrics.triageButton).toBeGreaterThanOrEqual(12);
    expect(typeMetrics.triageHeight).toBeGreaterThanOrEqual(44);
    expect(typeMetrics.modeHeight).toBeGreaterThanOrEqual(44);

    const allTriage = page.locator('[data-ck-triage="all"]');
    const criticalTriage = page.locator('[data-ck-triage="critical"]');
    await allTriage.focus();
    await allTriage.press('ArrowRight');
    await expect(criticalTriage).toBeFocused();

    const reviewButton = page.locator('.ck-review-button');
    await reviewButton.click();
    await expect(page.locator('#ckDetailOverlay')).toHaveClass(/is-open/);
    await expect(page.locator('#ckDetailOverlay .ck-source-list li')).toHaveCount(2);
    await expect(page.locator('#ckDetailOverlay .ck-source-published')).toHaveCount(2);
    const drawerMetrics = await page.evaluate(() => ({
      family:getComputedStyle(document.querySelector('#ckDetailOverlay .ck-drawer')).fontFamily,
      kicker:Number.parseFloat(getComputedStyle(document.querySelector('#ckDetailOverlay .ck-drawer-head>div>span')).fontSize),
      closeHeight:document.querySelector('#ckDetailOverlay .ck-drawer-close').getBoundingClientRect().height,
      sourceMeta:Number.parseFloat(getComputedStyle(document.querySelector('#ckDetailOverlay .ck-source-published')).fontSize),
      sourceLink:Number.parseFloat(getComputedStyle(document.querySelector('#ckDetailOverlay .ck-source-list a')).fontSize),
    }));
    expect(drawerMetrics.family).toBe(typeMetrics.pageFamily);
    expect(drawerMetrics.kicker).toBeGreaterThanOrEqual(11);
    expect(drawerMetrics.closeHeight).toBeGreaterThanOrEqual(44);
    expect(drawerMetrics.sourceMeta).toBeGreaterThanOrEqual(11);
    expect(drawerMetrics.sourceLink).toBeGreaterThanOrEqual(12);
    await page.keyboard.press('Escape');
    await expect(reviewButton).toBeFocused();

    await page.getByRole('button',{name:'Mëso'}).click();
    await expect(page.locator('.ck-sl-summary')).toBeHidden();
    await expect(page.locator('.ck-sl-learn')).toBeVisible();
    await expect(page.locator('.ck-sl-flashcards')).toBeVisible();
    await expect(page.locator('[data-flash-reveal]')).toHaveAttribute('aria-expanded','false');
    await page.locator('[data-flash-reveal]').click();
    await expect(page.locator('[data-flash-reveal]')).toHaveAttribute('aria-expanded','true');
    await expect(page.locator('.ck-sl-flash-answer')).toBeVisible();
    await expect(page.locator('.ck-sl-flash-answer')).toContainText('500 mikrogram');
    await expect(page.locator('.ck-sl-recall')).toBeVisible();
    await page.locator('[data-flash-known]').click();
    await expect(page.locator('.ck-sl-flash-head>strong')).toHaveText('2 / 9');
    await expect(page.locator('[data-flash-reveal]')).toBeFocused();

    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
    const darkMetrics = await page.evaluate(() => {
      const text = document.querySelector('.ck-sl-lesson-action');
      const surface = text.closest('.ck-sl-lesson-block');
      return {color:getComputedStyle(text).color,background:getComputedStyle(surface).backgroundColor};
    });
    expect(contrastRatio(darkMetrics.color,darkMetrics.background)).toBeGreaterThanOrEqual(4.5);
    expect(pageErrors).toEqual([]);
  });

  test('mobile 320px: pa overflow, pa micro-text dhe kontrolle touch >=44px', async ({page}) => {
    await page.setViewportSize({width:320,height:720});
    const pageErrors = await openEmergency(page);
    await page.getByRole('button',{name:'Mëso'}).click();
    await page.locator('[data-flash-reveal]').click();

    const metrics = await page.evaluate(() => {
      const root = document.querySelector('.ck-sl-experience');
      const visibleText = [...root.querySelectorAll('*')].filter(node => {
        const style = getComputedStyle(node);
        return node.textContent.trim() && style.display !== 'none' && style.visibility !== 'hidden' && node.getClientRects().length;
      });
      const fonts = visibleText.map(node => Number.parseFloat(getComputedStyle(node).fontSize)).filter(Number.isFinite);
      const controls = [...root.querySelectorAll('button')].filter(node => node.getClientRects().length).map(node => ({
        label:node.textContent.trim(),
        rect:node.getBoundingClientRect().toJSON(),
      }));
      const triageControls = [...document.querySelectorAll('.ck-triage-filter-group button')].map(node => ({
        font:Number.parseFloat(getComputedStyle(node).fontSize),
        height:node.getBoundingClientRect().height,
      }));
      const recall = root.querySelector('.ck-sl-recall')?.getBoundingClientRect();
      const prev = root.querySelector('[data-flash-prev]')?.getBoundingClientRect();
      const next = root.querySelector('[data-flash-next]')?.getBoundingClientRect();
      return {
        overflow:document.documentElement.scrollWidth - document.documentElement.clientWidth,
        minFont:Math.min(...fonts),
        directoryTag:Number.parseFloat(getComputedStyle(document.querySelector('.ck-directory-tag')).fontSize),
        directoryStatus:Number.parseFloat(getComputedStyle(document.querySelector('.ck-directory-review')).fontSize),
        triageControls,
        controls,
        rows:{recall:recall && {top:recall.top,bottom:recall.bottom},prev:prev && {top:prev.top,bottom:prev.bottom},next:next && {top:next.top,bottom:next.bottom}},
      };
    });

    expect(metrics.overflow).toBeLessThanOrEqual(0);
    expect(metrics.minFont).toBeGreaterThanOrEqual(11);
    expect(metrics.directoryTag).toBeGreaterThanOrEqual(11);
    expect(metrics.directoryStatus).toBeGreaterThanOrEqual(11);
    for (const control of metrics.triageControls) {
      expect(control.font).toBeGreaterThanOrEqual(12);
      expect(control.height).toBeGreaterThanOrEqual(44);
    }
    for (const control of metrics.controls) expect(control.rect.height, control.label).toBeGreaterThanOrEqual(44);
    expect(Math.abs(metrics.rows.prev.top - metrics.rows.next.top)).toBeLessThan(2);
    expect(metrics.rows.prev.top).toBeGreaterThanOrEqual(metrics.rows.recall.bottom - 1);
    expect(pageErrors).toEqual([]);
  });
});
