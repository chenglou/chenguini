import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:net'
import { chromium, type Browser, type Page } from 'playwright'

const cwd = '/Users/chenglou/github/vibescript/demos_with_specs/life-calendar/round-08'
const htmlPath = `${cwd}/index.html`

let browser: Browser
let serverProcess: Bun.Subprocess
let baseUrl = ''
let appUrl = ''

async function getFreePort() {
  return await new Promise<number>((resolve, reject) => {
    const server = createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        reject(new Error('Could not determine a free port'))
        return
      }
      const { port } = address
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve(port)
      })
    })
  })
}

async function waitForServer(url: string) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < 15_000) {
    try {
      const response = await fetch(url)
      if (response.ok) {
        return
      }
    } catch {}
    await Bun.sleep(100)
  }
  throw new Error(`Timed out waiting for ${url}`)
}

function parseHash(hash: string) {
  return new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)
}

async function waitForReadyReport(page: Page, requestId: string) {
  await page.waitForFunction(
    (targetRequestId: string) => {
      const params = new URLSearchParams(location.hash.startsWith('#') ? location.hash.slice(1) : location.hash)
      const phase = params.get('phase')
      return params.get('requestId') === targetRequestId && (phase === 'ready' || phase === 'error')
    },
    requestId,
    { timeout: 15_000 }
  )

  const params = parseHash(await page.evaluate(() => location.hash))
  const phase = params.get('phase')
  const message = params.get('message') ?? ''

  expect(params.get('requestId')).toBe(requestId)
  expect(phase).toBe('ready')
  expect(params.get('status')).toBe('pass')
  expect(message).toBe('')
}

describe('browser scenarios', () => {
  beforeAll(async () => {
    const port = await getFreePort()
    baseUrl = `http://127.0.0.1:${port}`
    appUrl = `${baseUrl}/index.html`
    serverProcess = Bun.spawn(['bun', htmlPath, '--port', `${port}`], {
      cwd,
      stdout: 'ignore',
      stderr: 'pipe',
    })
    await waitForServer(appUrl)
    browser = await chromium.launch({ headless: true })
  })

  afterAll(async () => {
    await browser?.close()
    serverProcess?.kill()
    await serverProcess?.exited
  })

  test('report reaches ready for hover tooltip behavior', async () => {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
    const requestId = randomUUID()

    await page.goto(`${appUrl}?scenario=hover-tooltips&requestId=${requestId}`, {
      waitUntil: 'domcontentloaded',
    })
    await waitForReadyReport(page, requestId)
    await page.close()
  })

  test('report reaches ready for the custom dot cycle', async () => {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
    const requestId = randomUUID()

    await page.goto(`${appUrl}?scenario=custom-dot-cycle&requestId=${requestId}`, {
      waitUntil: 'domcontentloaded',
    })
    await waitForReadyReport(page, requestId)
    await page.close()
  })
})
