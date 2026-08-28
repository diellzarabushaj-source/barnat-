'use strict';

const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir:'./tests',
  timeout:30_000,
  expect:{ timeout:5_000 },
  fullyParallel:false,
  workers:1,
  retries:0,
  reporter:'line',
  use:{
    baseURL:'http://127.0.0.1:4173',
    trace:'retain-on-failure',
    screenshot:'only-on-failure',
  },
  projects:[
    { name:'chromium', use:{ browserName:'chromium' } },
    { name:'webkit', use:{ browserName:'webkit' } },
  ],
});
