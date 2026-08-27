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

const FLASH_KEY = 'medindex_emergency_flashcards_v1:emergency-v17-test';
const META_KEY = 'medindex_emergency_flashcards_v3meta:emergency-v17-test';
const SCHEDULE_KEY = 'medindex_emergency_flashcards_v4schedule:emergency-v17-test';

async function installFrozenSanityFixture(page) {
  await page.addInitScript(`(() => {
    const FIXTURE = ${JSON.stringify({
      meta:[{
        _id:fixture._id,
        reviewStatus:'verified',
        sourceCount:1,
        sources:[{title:'Guideline',url:'https://example.test/guideline'}],
      }],
      emergencies:[fixture],
    })};
    const fixtureClient = Object.freeze({
      projectId:'test', dataset:'test', studioUrl:'#',
      query: async groq => String(groq).includes('"sourceCount":count(sources)')
        ? FIXTURE.meta
        : FIXTURE.emergencies,
    });
    let activeClient = fixtureClient;
    Object.defineProperty(window, 'MedIndexSanity', {
      get(){ return activeClient; },
      set(value){
        if (value?.__summaryLearnWrapped) activeClient = value;
      },
      configurable:false,
    });
  })();`);
}

async function openEmergency(page, width = 1360, height = 900) {
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.setViewportSize({width,height});
  await installFrozenSanityFixture(page);
  await page.goto('http://127.0.0.1:4173/urgjencat.html', {waitUntil:'domcontentloaded', timeout:15000});
  await page.locator('html.auth-ready').waitFor({state:'attached', timeout:10000});
  await expect(page.locator('#emergencyDetail .ck-sl-experience')).toBeVisible({timeout:10000});
  return errors;
}

async function currentIndex(page) {
  return page.evaluate(key => JSON.parse(sessionStorage.getItem(key) || '{"index":0}').index || 0, FLASH_KEY);
}

async function rate(page, selector, expectedRating, minDays) {
  let flash = page.locator('[data-ck-sl-panel="test"] [data-ck-sl-flashcards]');
  await expect(flash).toBeVisible();
  await flash.locator('[data-flash-reveal]').click();
  const index = await currentIndex(page);
  await flash.locator(selector).click();
  await expect(page.locator('[data-ck-sl-panel="test"] [data-flash-reveal]')).toBeVisible();

  const entry = await page.evaluate(({key,index}) => {
    const schedule = JSON.parse(localStorage.getItem(key) || '{}');
    return schedule[index] || null;
  }, {key:SCHEDULE_KEY,index});
  expect(entry?.rating).toBe(expectedRating);
  expect(Number(entry?.intervalDays || 0)).toBeGreaterThanOrEqual(minDays);
  return {index,entry};
}

test.describe('Urgjencat physician v17', () => {
  test.use({serviceWorkers:'block'});

  test('navigation is self-contained and v17 preserves all four spaced-review ratings', async ({page}) => {
    const errors = await openEmergency(page);

    const loadedScripts = await page.locator('script[src]').evaluateAll(nodes => nodes.map(node => node.getAttribute('src')));
    expect(loadedScripts.some(src => /emergency-doctor-ux-v2\.js/.test(src || ''))).toBeFalsy();
    expect(loadedScripts.some(src => /emergency-doctor-keyboard-v2\.js/.test(src || ''))).toBeFalsy();
    expect(loadedScripts.some(src => /emergency-review-controller-v17\.js/.test(src || ''))).toBeTruthy();
    await expect.poll(() => page.evaluate(() => window.MedIndexEmergencyReviewV17?.version || '')).toBe('17.0');

    await expect(page.locator('[data-ck-doctor-nav="summary"]')).toBeVisible();
    await expect(page.locator('.ck-v3-nav-context')).toBeVisible();
    await expect(page.locator('.ck-doctor-redflags-quick li')).toHaveCount(2);

    await page.getByRole('button',{name:/Testo veten|Testo$/}).click();
    const flash = page.locator('[data-ck-sl-panel="test"] [data-ck-sl-flashcards]');
    await expect(flash).toBeVisible();
    await expect(flash.locator('.ck-flash-session-stats')).toBeVisible();

    await rate(page, '[data-flash-repeat]', 'again', 0);
    const afterAgain = await page.evaluate(key => JSON.parse(sessionStorage.getItem(key) || '{}'), META_KEY);
    expect(Object.values(afterAgain?.misses || {}).some(value => Number(value) > 0)).toBeTruthy();

    await rate(page, '[data-ck-rating="hard"]', 'hard', 1);
    await rate(page, '[data-flash-known]', 'good', 3);
    await rate(page, '[data-ck-rating="easy"]', 'easy', 7);

    const ratings = await page.evaluate(key => Object.values(JSON.parse(localStorage.getItem(key) || '{}')).map(entry => entry?.rating), SCHEDULE_KEY);
    expect(ratings).toEqual(expect.arrayContaining(['again','hard','good','easy']));
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