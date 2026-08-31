import {defineConfig,devices} from '@playwright/test';
export default defineConfig({
  testDir:'./tests/e2e',fullyParallel:true,workers:2,
  reporter:[['list'],['html',{open:'never'}]],
  use:{baseURL:'http://127.0.0.1:4322',trace:'retain-on-failure',screenshot:'only-on-failure',...devices['Desktop Chrome']},
  webServer:{command:'npm run preview',url:'http://127.0.0.1:4322',reuseExistingServer:!process.env.CI,timeout:60000},
});

