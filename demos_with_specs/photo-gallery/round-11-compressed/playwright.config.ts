import { defineConfig } from 'playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: 'browser.semantic.spec.ts',
  timeout: 40_000,
  use: {
    baseURL: 'http://localhost:4173',
    browserName: 'chromium',
    headless: true,
    viewport: {
      width: 1_280,
      height: 900,
    },
  },
  webServer: {
    command: 'bun --port 4173 /Users/chenglou/github/vibescript/demos_with_specs/photo-gallery/round-11-compressed/index.html',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 35_000,
  },
})
