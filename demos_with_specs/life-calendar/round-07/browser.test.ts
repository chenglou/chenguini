import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { chromium, type Browser, type Page } from 'playwright'
import net from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'

const ROUND_DIR = '/Users/chenglou/github/vibescript/demos_with_specs/life-calendar/round-07'
const READY_TIMEOUT_MS = 30_000
const HOSTS = ['127.0.0.1', 'localhost']

type ScenarioData =
  | {
      ageCursor: string
      ageTooltip: string | null
      ageTooltipDisabled: boolean | null
      finalTooltip: string | null
      finalTooltipDisabled: boolean | null
      normalCursor: string
      normalTooltipVisible: boolean
    }
  | {
      chosenDotIndex: number
      clickedDotIndex: number | null
      restoredDotIndex: number | null
      restoredDotValue: string | null
      inputFocusedAfterClick: boolean
      inputFocusedAfterReload: boolean
      toggledOffDotIndex: number | null
      persistedDotValueAfterToggle: string | null
    }

type ScenarioReport = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  data?: ScenarioData
  message?: string
}

let browser: Browser
let serverProcess: Bun.Subprocess
let baseUrl = ''

beforeAll(async () => {
  const port = await getFreePort()
  serverProcess = Bun.spawn(['bun', '--no-hmr', '--port', String(port), 'index.html'], {
    cwd: ROUND_DIR,
    stdout: 'pipe',
    stderr: 'pipe',
  })

  baseUrl = await waitForServer(port)
  browser = await chromium.launch({ headless: true })
})

afterAll(async () => {
  await browser?.close()
  serverProcess?.kill()
  await serverProcess?.exited
})

describe.serial('browser-backed semantic reports', () => {
  test(
    'hovering the age cell and the final day publishes the right disabled tooltips',
    async () => {
      const report = await runScenario('hover-tooltips')

      expect(report.phase).toBe('ready')
      expect(report.data).toEqual({
        ageCursor: 'move',
        ageTooltip: "You're 31, born in June",
        ageTooltipDisabled: true,
        finalTooltip: 'Good bye',
        finalTooltipDisabled: true,
        normalCursor: 'pointer',
        normalTooltipVisible: false,
      })
    },
    READY_TIMEOUT_MS,
  )

  test(
    'clicking a custom goal dot persists through reload and toggling it off keeps the text',
    async () => {
      const report = await runScenario('custom-dot-cycle')

      expect(report.phase).toBe('ready')
      expect(report.data).toEqual({
        chosenDotIndex: expect.any(Number),
        clickedDotIndex: expect.any(Number),
        restoredDotIndex: expect.any(Number),
        restoredDotValue: 'Learn cello',
        inputFocusedAfterClick: true,
        inputFocusedAfterReload: true,
        toggledOffDotIndex: null,
        persistedDotValueAfterToggle: 'Learn cello',
      })

      if (report.data == null || !('chosenDotIndex' in report.data)) {
        throw new Error('Expected custom-dot-cycle report data')
      }

      expect(report.data.clickedDotIndex).toBe(report.data.chosenDotIndex)
      expect(report.data.restoredDotIndex).toBe(report.data.chosenDotIndex)
    },
    READY_TIMEOUT_MS,
  )
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
    const hash = await page.evaluate(() => location.hash).catch(() => '')
    const report = parseReportHash(hash)

    if (report?.requestId === requestId && report.phase === 'ready') {
      return report
    }
    if (report?.requestId === requestId && report.phase === 'error') {
      throw new Error(report.message ?? `Scenario ${report.scenario} failed`)
    }

    await delay(50)
  }

  throw new Error(`Timed out waiting for report ${requestId}`)
}

function parseReportHash(hash: string): ScenarioReport | null {
  const encodedReport = new URLSearchParams(hash.slice(1)).get('report')
  if (encodedReport == null) return null
  return JSON.parse(decodeURIComponent(encodedReport)) as ScenarioReport
}

async function waitForServer(port: number) {
  const deadline = Date.now() + READY_TIMEOUT_MS

  while (Date.now() < deadline) {
    for (const host of HOSTS) {
      const origin = `http://${host}:${port}`
      try {
        const response = await fetch(`${origin}/index.html`)
        if (response.ok) return origin
      } catch {}
    }
    await delay(100)
  }

  throw new Error('Timed out waiting for round-07 server')
}

function getFreePort() {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address == null || typeof address === 'string') {
        reject(new Error('Could not determine a free port'))
        return
      }
      const { port } = address
      server.close((error) => {
        if (error != null) {
          reject(error)
          return
        }
        resolve(port)
      })
    })
  })
}
