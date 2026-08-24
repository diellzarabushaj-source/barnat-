const { test, expect } = require('@playwright/test');

const fixture = {
  _id:'emergency-v17-test',
  title:'Anafilaksia — physician v17 test',
  icdCodes:['T78.2'],
  aliases:['anafilaksi'],
  category:'Alergji / Anafilaksi',
  triageLevel:'critical',
  summary:'Emergjencë me fillim të shpejtë.',
  primaryCareSteps:[
    {title:'Jep adrenalinë IM',priority:'immediate',setting:'primary',action:'Jep adrenalinë IM sipas protokollit të dokumentuar.',why:'Është trajtimi i linjës së parë.',note:'Mos e vono.'},
    {title:'Monitoro ABCDE',priority:'minutes',setting:'primary',action:'Monitoro rrugët e frymëmarrjes, frymëmarrjen dhe qarkullimin.',why:'Zbulon përkeqësimin herët.'},
  ],
  redFlags:['Stridor ose edema progresive e rrugëve të frymëmarrjes','Hipotension, sinkopë ose shenja shoku'],
  doNotDo:['Mos e vono trajtimin e linjës së parë.'],
  referral:{when:'Menjëherë, paralelisht me stabilizimin.',destination:'Urgjenca spitalore.',urgency:'immediate',handover:'Përshkruaj komprometimin A/B/C dhe trajtimin e dhënë.'},
  secondaryCareSteps:[{title:'Anafilaksia refraktare',priority:'minutes',setting:'secondary',action:'Kërko ekspertizë të avancuar.',why:'Kërkon monitorim dhe trajtim të avancuar.'}],
  sources:[{title:'Guideline',url:'https://example.test/guideline'}],
  reviewStatus:'verified',
  version:'1.0',
};

async function openEmergency(page, width = 1360, height = 900) {
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.setViewportSize({width,height});
  await page.route('**/sanity-clinical-client.js*', route => route.fulfill({
    status:200,
    contentType:'application/javascript; charset=utf-8',
    body:`window.MedIndexSanity=Object.freeze({projectId:'test',dataset:'test',studioUrl:'#',query:async groq=>String(groq).includes('"sourceCount":count(sources)')?[{_id:'emergency-v17-test',reviewStatus:'verified',sourceCount:1,sources:[{title:'Guideline',url:'https://example.test/guideline'}]}]:${JSON.stringify([fixture])}});`,
  }));
  await page.goto('http://127.0.0.1:4173/urgjencat.html', {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => document.documentElement.classList.contains('auth-ready'));
  await expect(page.locator('#emergencyDetail .ck-sl-experience')).toBeVisible({timeout:10000});
  return errors;
}

test.describe('Urgjencat physician v17', () => {
  test.use({serviceWorkers:'block'});

  test('navigation is self-contained and v4 owns spaced-review ratings', async ({page}) => {
    const errors = await openEmergency(page);

    const loadedScripts = await page.locator('script[src]').evaluateAll(nodes => nodes.map(node => node.getAttribute('src')));
    expect(loadedScripts.some(src => /emergency-doctor-ux-v2\.js/.test(src || ''))).toBeFalsy();
    expect(loadedScripts.some(src => /emergency-doctor-keyboard-v2\.js/.test(src || ''))).toBeFalsy();

    await expect(page.locator('[data-ck-doctor-nav="summary"]')).toBeVisible();
    await expect(page.locator('.ck-v3-nav-context')).toBeVisible();
    await expect(page.locator('.ck-doctor-redflags-quick li')).toHaveCount(2);

    await page.getByRole('button',{name:/Testo veten|Testo$/}).click();
    const flash = page.locator('[data-ck-sl-panel="test"] [data-ck-sl-flashcards]');
    await expect(flash).toBeVisible();
    await expect(flash.locator('.ck-flash-session-stats')).toBeVisible();

    await flash.locator('[data-flash-reveal]').click();
    await flash.locator('[data-flash-repeat]').click();

    const afterAgain = await page.evaluate(() => ({
      schedule:JSON.parse(localStorage.getItem('medindex_emergency_flashcards_v4schedule:emergency-v17-test') || '{}'),
      meta:JSON.parse(sessionStorage.getItem('medindex_emergency_flashcards_v3meta:emergency-v17-test') || '{}'),
    }));
    expect(Object.values(afterAgain.schedule).some(entry => entry?.rating === 'again')).toBeTruthy();
    expect(Object.values(afterAgain.meta?.misses || {}).some(value => Number(value) > 0)).toBeTruthy();

    const testFlash = page.locator('[data-ck-sl-panel="test"] [data-ck-sl-flashcards]');
    await testFlash.locator('[data-flash-reveal]').click();
    await testFlash.locator('[data-flash-known]').click();
    const afterGood = await page.evaluate(() => JSON.parse(localStorage.getItem('medindex_emergency_flashcards_v4schedule:emergency-v17-test') || '{}'));
    expect(Object.values(afterGood).some(entry => entry?.rating === 'good')).toBeTruthy();
    expect(errors).toEqual([]);
  });

  test('320px remains navigable without horizontal overflow', async ({page}) => {
    const errors = await openEmergency(page, 320, 720);
    await page.getByRole('button',{name:/Testo veten|Testo$/}).click();
    await page.locator('[data-ck-sl-panel="test"] [data-flash-reveal]').click();

    const metrics = await page.evaluate(() => {
      const root = document.querySelector('#emergencyDetail');
      const buttons = [...root.querySelectorAll('button')]
        .filter(node => node.getClientRects().length)
        .map(node => ({label:node.textContent.trim(),height:node.getBoundingClientRect().height}));
      return {
        overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
        buttons,
      };
    });

    expect(metrics.overflow).toBeLessThanOrEqual(0);
    for (const button of metrics.buttons) {
      if (/Përsërite|Vështirë|E di|Shumë e lehtë|Shfaq përgjigjen|Rifillo/.test(button.label)) {
        expect(button.height, button.label).toBeGreaterThanOrEqual(44);
      }
    }
    expect(errors).toEqual([]);
  });
});
