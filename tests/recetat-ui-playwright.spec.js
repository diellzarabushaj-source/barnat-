'use strict';

const { test, expect } = require('@playwright/test');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
let server;
let baseURL;

const mime = file => ({
  '.html':'text/html; charset=utf-8',
  '.js':'application/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8',
  '.svg':'image/svg+xml',
  '.woff2':'font/woff2',
  '.json':'application/json; charset=utf-8',
  '.webmanifest':'application/manifest+json',
}[path.extname(file).toLowerCase()] || 'application/octet-stream');

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/api/auth') {
      res.writeHead(200, {'content-type':'application/json'});
      return res.end(JSON.stringify({
        authenticated:true,
        user:{id:'qa-doctor',email:'qa@example.test',name:'QA Doctor'}
      }));
    }
    if (url.pathname === '/api/user-library') {
      res.writeHead(200, {'content-type':'application/json'});
      return res.end(JSON.stringify({
        ok:true,items:[],prescriptions:[],favorites:[],notes:{},drugs:[]
      }));
    }
    if (url.pathname.startsWith('/api/')) {
      res.writeHead(200, {'content-type':'application/json'});
      return res.end(JSON.stringify({ok:true,items:[],adult:[],pediatric:[],cards:[]}));
    }

    const relative = url.pathname === '/' ? '/recetat.html' : url.pathname;
    const file = path.normalize(path.join(ROOT, relative.replace(/^\//,'')));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      return res.end('Not found');
    }

    res.writeHead(200, {'content-type':mime(file),'cache-control':'no-store'});
    fs.createReadStream(file).pipe(res);
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseURL = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  if (!server) return;
  await new Promise(resolve => server.close(resolve));
});

test('desktop workspace: typography, layout and mini-sidebar', async ({ page }) => {
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(`${baseURL}/recetat.html`, {waitUntil:'domcontentloaded'});

  await expect(page.locator('#rxWorkspace')).toBeVisible();
  await expect(page.locator('#sidebarCollapse')).toBeVisible();

  const h1 = page.locator('.rx-page-heading h1');
  await expect(h1).toHaveCSS('font-family', /Inter/);
  await expect(h1).toHaveCSS('font-size', '32px');

  await page.locator('#sidebarCollapse').click();
  await expect(page.locator('html')).toHaveClass(/drx-sidebar-collapsed/);
  await expect(page.locator('#sidebarCollapse')).toHaveAttribute('aria-pressed','true');

  const sidebarWidth = await page.locator('#sidebar').evaluate(el => Math.round(el.getBoundingClientRect().width));
  expect(sidebarWidth).toBe(76);
});

test('mobile workspace: touch sizing and search sheet', async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto(`${baseURL}/recetat.html`, {waitUntil:'domcontentloaded'});

  await expect(page.locator('#rxWorkspace')).toBeVisible();
  await expect(page.locator('#sidebarCollapse')).toBeHidden();

  const newHeight = await page.locator('#rxNew').evaluate(el => Math.round(el.getBoundingClientRect().height));
  expect(newHeight).toBeGreaterThanOrEqual(44);

  await page.locator('#rxAddDrugButton').click();
  await expect(page.locator('#rxDrugPopover')).toBeVisible();
  await expect(page.locator('#rxDrugSearch')).toHaveCSS('font-size','16px');
});
