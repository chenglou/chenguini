import { afterAll, beforeAll, expect, test } from 'bun:test'

type SemanticReport = {
  status: 'ready' | 'error'
  requestId: string
  scenario: string
  message?: string
  steps?: {
    label: string
    mode: 'grid' | 'line'
    focusedId: string | null
    hash: string
  }[]
  beforeDismiss?: {
    mode: 'grid' | 'line'
    focusedId: string | null
    hash: string
    scrollTop: number
  }
  afterDismiss?: {
    mode: 'grid' | 'line'
    focusedId: string | null
    hash: string
    scrollTop: number
    targetViewportTop: number | null
    targetVisible: boolean
  }
}

let serverProcess: Bun.Subprocess<'ignore', 'pipe', 'pipe'> | null = null

async function waitForServer() {
  const startedAt = Date.now()
  while (Date.now() - startedAt < 10000) {
    try {
      const response = await fetch('http://127.0.0.1:4313/__health')
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error('Timed out waiting for browser test server')
}

function appleString(value: string) {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
}

async function runAppleScript(lines: string[]) {
  const args = lines.flatMap((line) => ['-e', line])
  const process = Bun.spawn(['osascript', ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const stdout = await new Response(process.stdout).text()
  const stderr = await new Response(process.stderr).text()
  const exitCode = await process.exited
  if (exitCode !== 0) {
    throw new Error(stderr || `osascript exited with code ${exitCode}`)
  }
  return stdout.trim()
}

async function closeSafariWindow() {
  try {
    await runAppleScript([
      'tell application "Safari"',
      'if (count of windows) > 0 then close front window',
      'end tell',
    ])
  } catch {}
}

async function runBrowserScenario(url: string) {
  await runAppleScript([
    'tell application "Safari"',
    `set newDocument to make new document with properties {URL:${appleString(url)}}`,
    'activate',
    'end tell',
  ])

  await new Promise((resolve) => setTimeout(resolve, 1500))
  const text = await runAppleScript([
    'tell application "Safari"',
    'if (count of windows) = 0 then return ""',
    'return do JavaScript "document.getElementById(\\"semantic-report\\").textContent" in current tab of front window',
    'end tell',
  ])
  await closeSafariWindow()

  if (text === '') {
    throw new Error('Safari semantic report was empty')
  }

  return JSON.parse(text) as SemanticReport
}

beforeAll(async () => {
  serverProcess = Bun.spawn(['bun', 'tests/browser-server.ts'], {
    stdout: 'pipe',
    stderr: 'pipe',
  })
  await waitForServer()
})

afterAll(async () => {
  serverProcess?.kill()
  await serverProcess?.exited
  await closeSafariWindow()
})

test(
  'navigation flow uses hash routing and dismisses back to the grid',
  async () => {
  const requestId = `navigation-${Date.now()}`
  const report = await runBrowserScenario(
    `http://127.0.0.1:4313/?scenario=navigation-flow&requestId=${requestId}`,
  )

  expect(report).toEqual({
    status: 'ready',
    requestId,
    scenario: 'navigation-flow',
    steps: [
      {
        label: 'after-open',
        mode: 'line',
        focusedId: 'd228330c-7364-497b-994f-a37467ae436a/0_0',
        hash: '#d228330c-7364-497b-994f-a37467ae436a/0_0',
      },
      {
        label: 'after-next',
        mode: 'line',
        focusedId: '7b5301ca-ef01-44bd-8bcc-4473c945aaaf/0_0',
        hash: '#7b5301ca-ef01-44bd-8bcc-4473c945aaaf/0_0',
      },
      {
        label: 'after-dismiss',
        mode: 'grid',
        focusedId: null,
        hash: '',
      },
    ],
  })
  },
  20000,
)

test(
  'dismissing a deep focused image scrolls its grid row back into view with a little peek',
  async () => {
  const requestId = `dismiss-${Date.now()}`
  const report = await runBrowserScenario(
    `http://127.0.0.1:4313/?scenario=dismiss-to-row&requestId=${requestId}`,
  )

  expect(report.scenario).toBe('dismiss-to-row')
  expect(report.status).toBe('ready')
  expect(report.beforeDismiss).toMatchObject({
    mode: 'line',
    focusedId: '890a8dbb-93f6-4934-a92f-7dde390410e0/0_0',
    hash: '#890a8dbb-93f6-4934-a92f-7dde390410e0/0_0',
    scrollTop: 0,
  })
  expect(report.afterDismiss).toBeDefined()
  expect(report.afterDismiss).toMatchObject({
    mode: 'grid',
    focusedId: null,
    hash: '',
    targetVisible: true,
  })
  expect(report.afterDismiss!.scrollTop).toBeGreaterThan(0)
  expect(report.afterDismiss!.targetViewportTop).not.toBeNull()
  expect(report.afterDismiss!.targetViewportTop!).toBeGreaterThanOrEqual(20)
  expect(report.afterDismiss!.targetViewportTop!).toBeLessThanOrEqual(90)
  },
  20000,
)
