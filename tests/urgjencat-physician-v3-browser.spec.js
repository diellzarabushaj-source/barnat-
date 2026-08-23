const { test, expect } = require('@playwright/test');

const fixture = {
  _id:'emergency-v3-test',
  title:'Anafilaksia — test v3',
  icdCodes:['T78.2'],
  aliases:['anafilaksi'],
  category:'Alergji / Anafilaksi',
  triageLevel:'critical',
  summary:'Emergjencë me fillim të shpejtë.',
  primaryCareSteps:[
    {title:'Jep adrenalinë IM',priority:'immediate',setting:'primary',action:'Jep adrenalinë 0.5 mg IM në kofshën anterolaterale.',why:'Është trajtimi i linjës së parë.',note:'Mos e vono.'},
    {title:'Monitoro ABCDE',priority:'minutes',setting:'primary',action:'Monitoro rrugët e frymëmarrjes, frymëmarrjen dhe qarkullimin.',why:'Zbulon përkeqësimin herët.'},
  ],
  redFlags:['Stridor ose edema progresive e rrugëve të frymëmarrjes','Hipotension, sinkopë ose shenja shoku'],
  doNotDo:['Mos e vono adrenalinën duke pritur antihistaminik.'],
  referral:{when:'Menjëherë, paralelisht me stabilizimin.',destination:'Urgjenca spitalore.',urgency:'immediate',handover:'Përshkruaj komprometimin A/B/C dhe trajtimin e dhënë.'},
  secondaryCareSteps:[{title:'Anafilaksia refraktare',priority:'minutes',setting:'secondary',action:'Kërko ekspertizë të avancuar.',why:'Kërkon monitorim dhe trajtim të avancuar.'}],
  sources:[{title:'Guideline',url:'https://example.test/guideline'}],
  reviewStatus:'review',
};

async function openEmergency(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.route('**/sanity-clinical-client.js*', route => route.fulfill({
    status:200,
    contentType:'application/javascript; charset=utf-8',
    body:`window.MedIndexSanity=Object.freeze({projectId:'test',dataset:'test',studioUrl:'#',query:async groq=>String(groq).includes('"sourceCount":count(sources)')?[{_id:'emergency-v3-test',reviewStatus:'review',sourceCount:1,sources:[{title:'Guideline',url:'https://example.test/guideline'}]}]:${JSON.stringify([fixture])}});`,
  }));
  await page.goto('http://127.0.0.1:4173/urgjencat.html', {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => document.documentElement.classList.contains('auth-ready'));
  await expect(page.locator('#emergencyDetail .ck-sl-experience')).toBeVisible({timeout:10000});
  return errors;
}

test.describe('Urgjencat physician UX v3', () => {
  test.use({serviceWorkers:'block'});

  test('desktop: skanim klinik, navigation dhe smart active recall', async ({page}) => {
    await page.setViewportSize({width:1360,height:900});
    const errors = await openEmergency(page);

    await expect(page.locator('.ck-doctor-redflags-quick')).toBeVisible();
    await expect(page.locator('.ck-doctor-redflags-quick li')).toHaveCount(2);
    await expect(page.locator('[data-ck-doctor-nav="summary"]')).toContainText('Tani');
    await expect(page.locator('[data-ck-doctor-nav="summary"]')).toContainText('Red flags');
    await expect(page.locator('[data-ck-doctor-nav="summary"]')).toContainText('Transferimi');

    await page.getByRole('button',{name:'Mëso'}).click();
    const flash = page.locator('[data-ck-sl-flashcards]');
    await expect(flash).toBeVisible();
    await expect(flash.locator('.ck-flash-session-stats span')).toHaveCount(3);

    await flash.locator('[data-flash-reveal]').click();
    await expect(flash.locator('[data-ck-flash-hard]')).toBeVisible();
    await expect(flash.locator('[data-ck-flash-hard]')).toHaveAttribute('aria-keyshortcuts','2');
    await expect(flash.locator('[data-flash-known]')).toHaveAttribute('aria-keyshortcuts','3');
    await flash.locator('[data-ck-flash-hard]').click();

    await expect(page.locator('.ck-flash-feedback')).toContainText('Me ndihmë');
    await expect(page.locator('.ck-flash-session-stats .is-hard strong')).toHaveText('1');
    await expect(page.locator('[data-ck-flash-difficult]')).toBeVisible();

    const card = page.locator('.ck-sl-flashcard');
    await card.focus();
    await card.press('Space');
    await expect(page.locator('.ck-sl-flash-answer')).toBeVisible();
    await card.press('1');
    await expect(page.locator('.ck-flash-feedback')).toContainText('Nuk e dija');
    await expect(page.locator('.ck-flash-session-stats .is-again strong')).toHaveText('1');

    await page.locator('[data-ck-flash-difficult]').click();
    await expect(page.locator('.ck-flash-feedback')).toContainText('Fokus te kartat');
    expect(errors).toEqual([]);
  });

  test('mobile 320px: pa overflow, kontrolle >=44px dhe recall i lexueshëm', async ({page}) => {
    await page.setViewportSize({width:320,height:720});
    const errors = await openEmergency(page);
    await page.getByRole('button',{name:'Mëso'}).click();
    await page.locator('[data-flash-reveal]').click();

    const metrics = await page.evaluate(() => {
      const root = document.querySelector('.ck-sl-experience');
      const controls = [...root.querySelectorAll('button')]
        .filter(node => node.getClientRects().length)
        .map(node => ({label:node.textContent.trim(),height:node.getBoundingClientRect().height}));
      const visibleText = [...root.querySelectorAll('*')].filter(node => {
        const style = getComputedStyle(node);
        return node.textContent.trim() && style.display !== 'none' && style.visibility !== 'hidden' && node.getClientRects().length;
      });
      const fonts = visibleText.map(node => Number.parseFloat(getComputedStyle(node).fontSize)).filter(Number.isFinite);
      const recall = root.querySelector('.ck-sl-recall')?.getBoundingClientRect();
      return {
        overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
        minFont:Math.min(...fonts),
        controls,
        recallWidth:recall?.width || 0,
        viewport:document.documentElement.clientWidth,
      };
    });

    expect(metrics.overflow).toBeLessThanOrEqual(0);
    expect(metrics.minFont).toBeGreaterThanOrEqual(11);
    for (const control of metrics.controls) expect(control.height, control.label).toBeGreaterThanOrEqual(44);
    expect(metrics.recallWidth).toBeLessThanOrEqual(metrics.viewport);
    expect(errors).toEqual([]);
  });
});
