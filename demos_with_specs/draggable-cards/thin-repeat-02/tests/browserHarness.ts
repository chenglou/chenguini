import {spawn} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {fileURLToPath} from 'node:url'

import {chromium, type Browser} from 'playwright'

export type DemoReport = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  initialOrder?: string[]
  orderedCardIdsAtRelease?: string[]
  reorderedDuringDrag?: boolean
  releasedCardId?: string | null
  topCardIdDuringSettle?: string | null
  topCardStayedReleasedDuringSettle?: boolean
  releaseVelocityY?: number
  message?: string
}

type Harness = {
  baseUrl: string
  browser: Browser
  close: () => Promise<void>
}

const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '[::1]']
const SERVER_TIMEOUT_MS = 10_000

export async function startHarness(): Promise<Harness> {
  const cwd = fileURLToPath(new URL('..', import.meta.url))
  const port = 32_000 + Math.floor(Math.random() * 1_000)
  const server = spawn('bun', ['--port', String(port), '--no-hmr', 'index.html'], {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let output = ''
  server.stdout.on('data', (chunk) => {
    output += chunk.toString()
  })
  server.stderr.on('data', (chunk) => {
    output += chunk.toString()
  })

  try {
    const baseUrl = await waitForServer(port)
    const browser = await chromium.launch({headless: true})

    return {
      baseUrl,
      browser,
      async close() {
        await browser.close()
        server.kill('SIGTERM')
        await new Promise<void>((resolve) => {
          server.once('exit', () => resolve())
          setTimeout(() => resolve(), 1_000)
        })
      },
    }
  } catch (error) {
    server.kill('SIGTERM')
    throw new Error(`Failed to start browser harness.\n${output}`, {cause: error})
  }
}

export async function runScenario(harness: Harness, scenario: string): Promise<DemoReport> {
  const requestId = randomUUID()
  const page = await harness.browser.newPage({viewport: {width: 960, height: 900}})

  try {
    const url = `${harness.baseUrl}/?scenario=${encodeURIComponent(scenario)}&requestId=${encodeURIComponent(requestId)}`
    await page.goto(url, {waitUntil: 'domcontentloaded'})
    await page.waitForFunction(
      (expectedRequestId) => {
        const hash = window.location.hash
        if (!hash.startsWith('#report=')) return false

        try {
          const report = JSON.parse(decodeURIComponent(hash.slice('#report='.length)))
          return report.requestId === expectedRequestId && (report.phase === 'ready' || report.phase === 'error')
        } catch {
          return false
        }
      },
      requestId,
      {timeout: 20_000},
    )

    const report = await page.evaluate(() => {
      const hash = window.location.hash
      if (!hash.startsWith('#report=')) {
        throw new Error(`Expected machine-readable report in location.hash, got ${hash || '<empty>'}`)
      }

      return JSON.parse(decodeURIComponent(hash.slice('#report='.length)))
    })

    return report as DemoReport
  } finally {
    await page.close()
  }
}

async function waitForServer(port: number): Promise<string> {
  const deadline = Date.now() + SERVER_TIMEOUT_MS

  while (Date.now() < deadline) {
    for (const host of LOOPBACK_HOSTS) {
      const baseUrl = `http://${host}:${port}`

      try {
        const response = await fetch(`${baseUrl}/`, {signal: AbortSignal.timeout(500)})
        if (response.ok) return baseUrl
      } catch {
      }
    }

    await Bun.sleep(100)
  }

  throw new Error(`Timed out waiting for demo server on port ${port}`)
}
