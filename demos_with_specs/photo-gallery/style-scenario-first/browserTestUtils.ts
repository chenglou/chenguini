import { chromium, type Browser, type Page } from 'playwright'

const serverPort = 3217
const serverBaseUrl = `http://127.0.0.1:${serverPort}/`
const entryHtml = '/Users/chenglou/github/vibescript/demos_with_specs/photo-gallery/style-scenario-first/index.html'

export type GalleryReport = {
  mode: 'grid' | 'line'
  focusedId: string | null
  hash: string
  mountedCount: number
  totalCount: number
  focusedRowTop: number | null
  selectionText: string
}

export type GalleryServer = {
  browser: Browser
  baseUrl: string
  close: () => Promise<void>
  newPage: () => Promise<Page>
}

declare global {
  interface Window {
    __photoGalleryReport?: GalleryReport
  }
}

async function waitForServer(url: string): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const rootResponse = await fetch(url)
      if (rootResponse.ok) return
      const indexResponse = await fetch(`${url}index.html`)
      if (indexResponse.ok) return
    } catch {
      // keep waiting for bun to finish booting
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  throw new Error(`timed out waiting for ${url}`)
}

async function probePageUrl(baseUrl: string): Promise<string> {
  const candidates = [baseUrl, `${baseUrl}index.html`]
  for (let index = 0; index < candidates.length; index++) {
    const candidate = candidates[index]!
    try {
      const response = await fetch(candidate)
      if (response.ok) return candidate
    } catch {
      // try the next path
    }
  }

  return baseUrl
}

export async function startGalleryServer(): Promise<GalleryServer> {
  const process = Bun.spawn({
    cmd: ['bun', '--no-hmr', entryHtml, '--host=127.0.0.1', `--port=${serverPort}`],
    stdout: 'pipe',
    stderr: 'pipe',
  })

  await waitForServer(serverBaseUrl)
  const pageUrl = await probePageUrl(serverBaseUrl)

  const browser = await chromium.launch({headless: true})

  return {
    browser,
    baseUrl: serverBaseUrl,
    close: async () => {
      await browser.close()
      process.kill()
      await process.exited
    },
    newPage: async () => {
      const page = await browser.newPage({viewport: {width: 1280, height: 900}})
      await page.goto(pageUrl, {waitUntil: 'domcontentloaded'})
      await page.waitForFunction(() => window.__photoGalleryReport != null)
      return page
    },
  }
}

export async function readGalleryReport(page: Page): Promise<GalleryReport> {
  return await page.evaluate(() => window.__photoGalleryReport as GalleryReport)
}

export async function waitForMode(page: Page, mode: GalleryReport['mode']): Promise<GalleryReport> {
  await page.waitForFunction((expectedMode) => window.__photoGalleryReport?.mode === expectedMode, mode)
  return await readGalleryReport(page)
}

export async function waitForFocusedId(page: Page, focusedId: string | null): Promise<GalleryReport> {
  await page.waitForFunction((expectedFocusedId) => window.__photoGalleryReport?.focusedId === expectedFocusedId, focusedId)
  return await readGalleryReport(page)
}
