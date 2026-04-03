import { expect, test } from 'bun:test'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium, type Browser, type Page } from 'playwright'

type Report = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  reorderedBeforeRelease?: boolean
  releasedCardId?: string | null
  releasedCardStayedOnTop?: boolean
  topCardIdsDuringSettle?: string[]
  message?: string
}

const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const demoDir = fileURLToPath(new URL('.', import.meta.url))
const indexPath = join(demoDir, 'index.html')

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function getFreePort() {
  const server = createServer()

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })

  const address = server.address()
  if (address === null || typeof address === 'string') {
    server.close()
    throw new Error('Could not reserve a test server port.')
  }

  const port = address.port
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error)
        return
      }
      resolve()
    })
  })

  return port
}

async function probeLoopbackHost(port: number) {
  const hosts = ['http://127.0.0.1', 'http://localhost', 'http://[::1]']

  for (let attempt = 0; attempt < 60; attempt += 1) {
    for (const host of hosts) {
      const candidate = `${host}:${port}/`

      try {
        const response = await fetch(candidate)
        if (response.ok) {
          return candidate.slice(0, -1)
        }
      } catch {
        // Keep probing until the temporary server responds.
      }
    }

    await delay(100)
  }

  throw new Error(`Timed out waiting for the demo server on port ${port}.`)
}

async function startServer() {
  const port = await getFreePort()
  const serverProcess = spawn(process.execPath, [indexPath, '--host=0.0.0.0', `--port=${port}`, '--no-hmr'], {
    cwd: demoDir,
    stdio: 'ignore',
  })

  return {
    baseUrl: await probeLoopbackHost(port),
    serverProcess,
  }
}

function parseReport(hash: string): Report | null {
  const encoded = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash).get('report')
  if (encoded === null) {
    return null
  }

  try {
    return JSON.parse(decodeURIComponent(encoded)) as Report
  } catch {
    return null
  }
}

async function waitForMatchingReadyReport(page: Page, requestId: string) {
  await page.waitForFunction(
    (expectedRequestId) => {
      const encoded = new URLSearchParams(location.hash.slice(1)).get('report')
      if (encoded === null) {
        return false
      }

      try {
        const report = JSON.parse(decodeURIComponent(encoded)) as Report
        return report.requestId === expectedRequestId && (report.phase === 'ready' || report.phase === 'error')
      } catch {
        return false
      }
    },
    requestId,
    { timeout: 30_000 },
  )

  const report = parseReport(await page.evaluate(() => location.hash))
  if (report === null) {
    throw new Error('The page never published a machine-readable report.')
  }
  if (report.requestId !== requestId) {
    throw new Error(`Expected requestId ${requestId}, got ${report.requestId}.`)
  }
  if (report.phase === 'error') {
    throw new Error(report.message ?? 'Scenario failed without an error message.')
  }

  return report
}

test(
  'released card stays on top while settling',
  { timeout: 30_000 },
  async () => {
    const { baseUrl, serverProcess } = await startServer()
    const browser = await chromium.launch({
      executablePath: chromePath,
      headless: true,
    })
    const page = await browser.newPage({ viewport: { width: 960, height: 1400 } })
    const requestId = crypto.randomUUID()

    try {
      await page.goto(`${baseUrl}/?scenario=release-top-layer&requestId=${encodeURIComponent(requestId)}`)
      const report = await waitForMatchingReadyReport(page, requestId)

      expect(report.reorderedBeforeRelease).toBe(true)
      expect(report.releasedCardId).toBe('card-2')
      expect(report.releasedCardStayedOnTop).toBe(true)
      expect(report.topCardIdsDuringSettle?.length ?? 0).toBeGreaterThan(0)
      expect(report.topCardIdsDuringSettle?.every((id) => id === report.releasedCardId)).toBe(true)
    } finally {
      await page.close()
      await browser.close()
      serverProcess.kill('SIGTERM')
    }
  },
)
