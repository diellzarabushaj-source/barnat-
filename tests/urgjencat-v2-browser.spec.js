'use strict';

const { test, expect } = require('@playwright/test');

const BASE = 'http://127.0.0.1:4173';

const fixture = {
  sections:[
    {
      _id:'section-1',
      title:'Resuscitimi dhe emergjencat kritike',
      sourceTitleEn:'Resuscitation and critical emergencies',
      slug:'resuscitimi',
      sectionNumber:1,
      order:1,
      lessonCount:2,
      sourceBook:'Tintinalli',
      sourceEdition:'8e',
      reviewStatus:'verified',
    },
    {
      _id:'section-2',
      title:'Emergjencat respiratore',
      sourceTitleEn:'Respiratory emergencies',
      slug:'respiratore',
      sectionNumber:2,
      order:2,
      lessonCount:1,
      sourceBook:'Tintinalli',
      sourceEdition:'8e',
      reviewStatus:'review',
    },
  ],
  lessons:[
    {
      _id:'lesson-1',
      title:'Anafilaksia',
      sourceTitleEn:'Anaphylaxis',
      slug:'anafilaksia',
      chapterNumber:1,
      order:1,
      orderInSection:1,
      sourceSectionNumber:1,
      sourcePdfStartPage:100,
      sourcePdfEndPage:104,
      quickSummary:'Anafilaksia kërkon njohje të shpejtë dhe trajtim të menjëhershëm.',
      sourceBook:'Tintinalli',
      sourceEdition:'8e',
      reviewStatus:'verified',
      section:{_id:'section-1',title:'Resuscitimi dhe emergjencat kritike',sectionNumber:1},
      subtopics:[],
      lessonSections:[
        {
          _key:'ls-1',
          order:1,
          title:'Trajtimi i menjëhershëm',
          sourceHeadingEn:'Immediate treatment',
          explanation:'Vlerëso ABCDE dhe jep trajtimin e linjës së parë pa vonesë.',
          clinicalPearl:'Mos e vono trajtimin e linjës së parë.',
          figureNumbers:[],
          tableNumbers:['T1'],
          rx:[
            {_key:'rx-1',order:1,text:'Rx. Adrenalinë 0.5 mg IM',note:'Përsërite sipas protokollit nëse simptomat vazhdojnë.'},
          ],
        },
        {
          _key:'ls-2',
          order:2,
          title:'Monitorimi',
          sourceHeadingEn:'Monitoring',
          explanation:'Monitoro frymëmarrjen dhe qarkullimin.',
          clinicalPearl:'Dokumento përgjigjen klinike.',
          figureNumbers:[],
          tableNumbers:[],
          rx:[],
        },
      ],
      translatedTables:[
        {
          _key:'table-1',
          tableNumber:'T1',
          titleSq:'Monitorimi fillestar',
          sourceTitleEn:'Initial monitoring',
          sourcePdfPage:102,
          columnsSq:['Parametri','Veprimi'],
          descriptionSq:'Monitorim i vazhdueshëm gjatë stabilizimit.',
          clinicalHighlight:'Rivlerëso pas çdo ndërhyrjeje.',
          sourceNote:'Fixture QA',
          rows:[
            {_key:'r1',cells:['SpO₂','Monitorim kontinu']},
            {_key:'r2',cells:['TA','Matje të përsëritura']},
          ],
        },
      ],
      abbreviations:[],
      figures:[],
    },
    {
      _id:'lesson-2',
      title:'Shoku',
      sourceTitleEn:'Shock',
      slug:'shoku',
      chapterNumber:2,
      order:2,
      orderInSection:2,
      sourceSectionNumber:1,
      quickSummary:'Identifiko shenjat e hipoperfuzionit dhe trajto shkakun.',
      sourceBook:'Tintinalli',
      sourceEdition:'8e',
      reviewStatus:'review',
      section:{_id:'section-1',title:'Resuscitimi dhe emergjencat kritike',sectionNumber:1},
      subtopics:[],
      lessonSections:[
        {_key:'shock-1',order:1,title:'Vlerësimi',explanation:'Vlerëso perfuzionin dhe parametrat vitalë.',clinicalPearl:'Rivlerëso shpesh.',figureNumbers:[],tableNumbers:[],rx:[]},
      ],
      translatedTables:[],
      abbreviations:[],
      figures:[],
    },
    {
      _id:'lesson-3',
      title:'Astma akute',
      sourceTitleEn:'Acute asthma',
      slug:'astma-akute',
      chapterNumber:1,
      order:3,
      orderInSection:1,
      sourceSectionNumber:2,
      quickSummary:'Vlerëso ashpërsinë dhe përgjigjen ndaj trajtimit.',
      sourceBook:'Tintinalli',
      sourceEdition:'8e',
      reviewStatus:'verified',
      section:{_id:'section-2',title:'Emergjencat respiratore',sectionNumber:2},
      subtopics:[],
      lessonSections:[
        {_key:'asthma-1',order:1,title:'Vlerësimi fillestar',explanation:'Vlerëso punën respiratore dhe oksigjenimin.',clinicalPearl:'Kërko shenja të dështimit respirator.',figureNumbers:[],tableNumbers:[],rx:[]},
      ],
      translatedTables:[],
      abbreviations:[],
      figures:[],
    },
  ],
};

async function installFixture(page) {
  await page.route('**/api/auth', async route => {
    if (route.request().method() !== 'GET') return route.continue();
    return route.fulfill({
      status:200,
      contentType:'application/json',
      body:JSON.stringify({
        authenticated:true,
        user:{name:'Dr. QA',email:'qa@example.test',role:'doctor'},
      }),
    });
  });

  await page.addInitScript(data => {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = function drxUrgjencatFixtureFetch(input, init = {}) {
      let url;
      try {
        const raw = typeof Request !== 'undefined' && input instanceof Request ? input.url : String(input);
        url = new URL(raw, location.href);
      } catch {
        return nativeFetch(input, init);
      }
      if (url.hostname === '4wdtp8cz.apicdn.sanity.io' && url.pathname.includes('/data/query/production')) {
        return Promise.resolve(new Response(JSON.stringify({ result:data }), {
          status:200,
          headers:{'Content-Type':'application/json; charset=utf-8'},
        }));
      }
      return nativeFetch(input, init);
    };
  }, fixture);
}

async function openUrgjencat(page, width = 1360, height = 900) {
  await page.setViewportSize({width,height});
  await installFixture(page);
  await page.goto(`${BASE}/urgjencat.html`, {waitUntil:'domcontentloaded'});
  await expect(page.locator('#appShell')).toHaveAttribute('aria-busy','false',{timeout:10000});
  await expect(page.locator('#emergencyDetail .ec-detail-inner')).toBeVisible({timeout:10000});
}

test.describe('Urgjencat V2 Sanity reader', () => {
  test.use({serviceWorkers:'block'});

  test('desktop renders chapters, lessons, Rx, tables, search and reader navigation', async ({page}) => {
    await openUrgjencat(page);

    await expect(page.locator('html')).toHaveAttribute('data-drx-app','urgjencat-v2');
    await expect(page.locator('#chapterTotal')).toHaveText('2');
    await expect(page.locator('#lessonTotal')).toHaveText('3');
    await expect(page.locator('#emergencyChapterSelect option')).toHaveCount(2);
    await expect(page.locator('#emergencyLessonSelect option')).toHaveCount(2);

    await expect(page.locator('#emergencyDetail h2')).toHaveText('Anafilaksia');
    await expect(page.locator('#emergencyDetail .ec-quick-summary')).toContainText('trajtim të menjëhershëm');
    await expect(page.locator('#emergencyDetail .ec-section')).toHaveCount(2);
    await expect(page.locator('#emergencyDetail .ec-rx')).toContainText('Adrenalinë 0.5 mg IM');
    await expect(page.locator('#emergencyDetail .ec-clinical-table')).toContainText('SpO₂');
    await expect(page.locator('#emergencyResultStatus')).toContainText('2 kapituj · 3 mësime');
    await expect(page.locator('#emergencyLessonPosition')).toHaveText('1 / 3');

    await page.locator('#nextLessonButton').click();
    await expect(page.locator('#emergencyDetail h2')).toHaveText('Shoku');
    await expect(page.locator('#emergencyLessonPosition')).toHaveText('2 / 3');

    await page.locator('#emergencySearch').fill('astma');
    await expect(page.locator('#emergencyResultStatus')).toContainText('1 mësime në 1 kapituj');
    await expect(page.locator('#emergencyDetail h2')).toHaveText('Astma akute');
    await expect(page.locator('#emergencyChapterSelect option')).toHaveCount(1);
    await expect(page.locator('#emergencyLessonSelect option')).toHaveCount(1);

    await page.locator('#emergencySearchClear').click();
    await expect(page.locator('#emergencyResultStatus')).toContainText('2 kapituj · 3 mësime');
  });

  test('320px keeps reader and controls inside the viewport', async ({page}) => {
    await openUrgjencat(page,320,720);

    const report = await page.evaluate(() => {
      const root = document.documentElement;
      const controls = [...document.querySelectorAll('#emergencyChapterSelect,#emergencyLessonSelect,#emergencySearch,#previousLessonButton,#nextLessonButton,#emergencySearchClear')]
        .filter(node => node.getClientRects().length)
        .map(node => {
          const rect=node.getBoundingClientRect();
          return {id:node.id,width:rect.width,height:rect.height,left:rect.left,right:rect.right};
        });
      return {
        overflow:root.scrollWidth-root.clientWidth,
        controls,
        detailWidth:document.querySelector('#emergencyDetail')?.getBoundingClientRect().width || 0,
      };
    });

    expect(report.overflow).toBeLessThanOrEqual(0);
    expect(report.detailWidth).toBeLessThanOrEqual(320);
    for (const control of report.controls) {
      expect(control.left, control.id).toBeGreaterThanOrEqual(-1);
      expect(control.right, control.id).toBeLessThanOrEqual(321);
      expect(control.height, control.id).toBeGreaterThanOrEqual(40);
    }
  });
});
