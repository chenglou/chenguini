import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser } from 'playwright'

type HoverTooltipReport = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: 'hover-tooltips'
  message?: string
  ageTooltip?: {
    disabled: boolean
    value: string
    cursor: string
  }
  normalHover?: {
    tooltipVisible: boolean
    cursor: string
  }
  finalTooltip?: {
    disabled: boolean
    value: string
  }
}

type CustomDotSnapshot = {
  selectedIndex: number | null
  enabled: boolean
  focused: boolean
  value: string
  storageDot: string | null
  storageValue: string | null
}

type CustomDotCycleReport = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: 'custom-dot-cycle'
  message?: string
  targetIndex?: number
  afterSelect?: CustomDotSnapshot
  afterReload?: CustomDotSnapshot
  afterToggleOff?: CustomDotSnapshot
}

type BrowserReport = HoverTooltipReport | CustomDotCycleReport

let serverProcess: ChildProcessWithoutNullStreams | null = null
let browser: Browser | null = null
let baseUrl = ''
const roundDir = dirname(fileURLToPath(import.meta.url))

beforeAll(async () => {
  baseUrl = await new Promise<string>((resolve, reject) => {
    serverProcess = spawn('bun', ['./browser-test-server.ts', '0'], {
      cwd: roundDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    serverProcess.stdout.on('data', (chunk) => {
      const text = chunk.toString()
      const match = text.match(/READY (\d+)/)
      if (match != null) resolve(`http://127.0.0.1:${match[1]}`)
    })

    serverProcess.stderr.on('data', (chunk) => {
      const text = chunk.toString()
      if (text.length > 0) reject(new Error(text))
    })

    serverProcess.on('exit', (code) => {
      if (code !== 0) reject(new Error(`browser server exited with code ${code}`))
    })
  })

  browser = await chromium.launch({ headless: true })
})

afterAll(async () => {
  await browser?.close()
  browser = null
  serverProcess?.kill('SIGTERM')
  serverProcess = null
})

async function readReadyReport(pageUrl: string, requestId: string) {
  if (browser == null) throw new Error('browser not started')

  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
  try {
    await page.goto(pageUrl)
    const deadline = Date.now() + 10_000

    while (Date.now() < deadline) {
      const hash = await page.evaluate(() => location.hash)
      if (hash.startsWith('#report=')) {
        const report = JSON.parse(decodeURIComponent(hash.slice('#report='.length))) as BrowserReport
        if (report.requestId === requestId && (report.phase === 'ready' || report.phase === 'error')) {
          if (report.phase === 'error') {
            throw new Error(report.message ?? `scenario ${report.scenario} failed`)
          }
          return report
        }
      }

      await page.waitForTimeout(50)
    }

    throw new Error(`timed out waiting for ready report for ${requestId}`)
  } finally {
    await page.close()
  }
}

describe('browser-backed reports', () => {
  test('reports age-cell and final-day tooltip behavior', async () => {
    const requestId = `hover-tooltips-${Date.now()}`
    const report = await readReadyReport(
      `${baseUrl}/index.html?report=1&scenario=hover-tooltips&requestId=${requestId}`,
      requestId,
    ) as HoverTooltipReport

    expect(report.phase).toBe('ready')
    expect(report.requestId).toBe(requestId)
    expect(report.scenario).toBe('hover-tooltips')
    expect(report.ageTooltip).toEqual({
      disabled: true,
      value: "You're 31, born in June",
      cursor: 'move',
    })
    expect(report.normalHover).toEqual({
      tooltipVisible: false,
      cursor: 'pointer',
    })
    expect(report.finalTooltip).toEqual({
      disabled: true,
      value: 'Good bye',
    })
  })

  test('reports custom-dot click, edit, reload, and toggle-off persistence', async () => {
    const requestId = `custom-dot-${Date.now()}`
    const report = await readReadyReport(
      `${baseUrl}/index.html?report=1&scenario=custom-dot-cycle&requestId=${requestId}`,
      requestId,
    ) as CustomDotCycleReport

    expect(report.phase).toBe('ready')
    expect(report.requestId).toBe(requestId)
    expect(report.scenario).toBe('custom-dot-cycle')
    expect(report.targetIndex).toBeTypeOf('number')
    expect(report.afterSelect).toEqual({
      selectedIndex: report.targetIndex ?? null,
      enabled: true,
      focused: true,
      value: '',
      storageDot: String(report.targetIndex),
      storageValue: null,
    })
    expect(report.afterReload).toEqual({
      selectedIndex: report.targetIndex ?? null,
      enabled: true,
      focused: true,
      value: 'Climb Fuji',
      storageDot: String(report.targetIndex),
      storageValue: 'Climb Fuji',
    })
    expect(report.afterToggleOff).toEqual({
      selectedIndex: null,
      enabled: false,
      focused: false,
      value: '',
      storageDot: null,
      storageValue: 'Climb Fuji',
    })
  })
})
