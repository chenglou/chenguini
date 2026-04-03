import { defineConfig } from '@playwright/test'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const roundDir = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  testDir: roundDir,
  testMatch: 'browser.spec.ts',
  fullyParallel: false,
  workers: 1,
  use: {
    browserName: 'chromium',
    headless: true,
    viewport: { width: 900, height: 900 },
  },
})
