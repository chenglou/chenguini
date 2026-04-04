import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { chromium, type Browser, type Page } from 'playwright'
import net from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'

const ROUND_DIR = '/Users/chenglou/github/vibescript/demos_with_specs/life-calendar/round-01'
const HOSTS = ['127.0.0.1', 'localhost', '[::1]']
const READY_TIMEOUT_MS = 30_000

type Report = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  ageCursor?: string
  ageTooltip?: string
  ageTooltipDisabled?: boolean
  finalTooltip?: string
  finalTooltipDisabled?: boolean
  chosenDotIndex?: number
  clickedDotIndex?: number | null
  restoredDotIndex?: number | null
  restoredDotValue?: string
  inputFocusedAfterClick?: boolean
  inputFocusedAfterReload?: boolean
  toggledOffDotIndex?: number | null
  persistedDotValueAfterToggle?: string
  message?: string
}

let browser: Browser
let serverProcess: Bun.Subprocess
let baseUrl = ''

beforeAll(async () => {
  const port = await getFreePort()

  serverProcess = Bun.spawn(
    ['bun', '--no-hmr', '--port', String(port), `${ROUND_DIR}/index.html`],
    {
      cwd: ROUND_DIR,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  )

  baseUrl = await waitForServer(port)
  browser = await launchBrowser()
})

afterAll(async () => {
  await browser?.close()
  serverProcess?.kill()
  await serverProcess?.exited
})

describe('browser-backed semantic reports', () => {
  test('proves the age and final-day hover tooltips', async () => {
    const report = await runScenario('hover-tooltips')

    expect(report.ageCursor).toBe('move')
    expect(report.ageTooltip).toBe("You're 31, born in June")
    expect(report.ageTooltipDisabled).toBe(true)
    expect(report.finalTooltip).toBe('Good bye')
    expect(report.finalTooltipDisabled).toBe(true)
  })

  test('proves the custom-dot cycle through reload and toggle-off', async () => {
    const report = await runScenario('custom-dot-cycle')

    expect(report.clickedDotIndex).toBe(report.chosenDotIndex)
    expect(report.restoredDotIndex).toBe(report.chosenDotIndex)
    expect(report.restoredDotValue).toBe('Learn cello')
    expect(report.inputFocusedAfterClick).toBe(true)
    expect(report.inputFocusedAfterReload).toBe(true)
    expect(report.toggledOffDotIndex).toBeNull()
    expect(report.persistedDotValueAfterToggle).toBe('Learn cello')
  })
})

async function runScenario(scenario: string) {
  const requestId = crypto.randomUUID()
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    await page.goto(
      `${baseUrl}/index.html?scenario=${encodeURIComponent(scenario)}&requestId=${encodeURIComponent(requestId)}`,
    )

    return await waitForReadyReport(page, requestId)
  } finally {
    await context.close()
  }
}

async function waitForReadyReport(page: Page, requestId: string) {
  const deadline = Date.now() + READY_TIMEOUT_MS

  while (Date.now() < deadline) {
    try {
      const hash = await page.evaluate(() => location.hash)
      const report = parseReportHash(hash)

      if (report?.requestId === requestId && report.phase === 'ready') {
        return report
      }

      if (report?.requestId === requestId && report.phase === 'error') {
        throw new Error(report.message ?? 'Scenario reported an error')
      }
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('Execution context was destroyed')) {
        throw error
      }
    }

    await delay(50)
  }

  throw new Error(`Timed out waiting for ${requestId}`)
}

function parseReportHash(hash: string): Report | null {
  const encodedReport = new URLSearchParams(hash.slice(1)).get('report')
  if (encodedReport === null) {
    return null
  }

  return JSON.parse(decodeURIComponent(encodedReport)) as Report
}

async function waitForServer(port: number) {
  const deadline = Date.now() + READY_TIMEOUT_MS

  while (Date.now() < deadline) {
    for (const host of HOSTS) {
      const origin = `http://${host}:${port}`
      try {
        const response = await fetch(`${origin}/index.html`)
        if (response.ok) {
          return origin
        }
      } catch {
        continue
      }
    }

    if (serverProcess.exitCode !== null) {
      const stderr = await new Response(serverProcess.stderr).text()
      throw new Error(`Server exited early:\n${stderr}`)
    }

    await delay(100)
  }

  throw new Error('Timed out waiting for the Bun HTML server')
}

async function launchBrowser() {
  const launchers = [
    () => chromium.launch({ headless: true }),
    () => chromium.launch({ headless: true, channel: 'chrome' }),
  ]
  let lastError: unknown

  for (const launcher of launchers) {
    try {
      return await launcher()
    } catch (error) {
      lastError = error
    }
  }

  throw lastError
}

function getFreePort() {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer()

    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        reject(new Error('Could not determine a free port'))
        return
      }

      const { port } = address
      server.close((error) => {
        if (error !== undefined) {
          reject(error)
          return
        }

        resolve(port)
      })
    })
  })
}
