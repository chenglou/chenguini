import { afterAll } from 'bun:test'
import { randomUUID } from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import type { ScenarioName, ScenarioReport } from './shared'

const roundDir = '/Users/chenglou/github/vibescript/demos_with_specs/draggable-cards/round-07'
const pagePort = 34804
const debugPort = 39229
let serverProcess: ChildProcess | null = null

afterAll(async () => {
  serverProcess?.kill('SIGTERM')
  serverProcess = null
})

export async function runScenario(scenario: ScenarioName): Promise<ScenarioReport> {
  await ensureServer()
  const baseUrl = await findResponsiveBaseUrl()
  const requestId = randomUUID()
  const pageUrl = `${baseUrl}/index.html?report=1&scenario=${encodeURIComponent(scenario)}&requestId=${encodeURIComponent(requestId)}`
  const browser = await launchChrome(pageUrl)

  try {
    const report = await waitForReport(browser.wsUrl, requestId)
    if (report.phase === 'error') {
      throw new Error(report.error ?? `Scenario ${scenario} failed in page`)
    }
    return report
  } finally {
    browser.process.kill('SIGTERM')
  }
}

async function ensureServer() {
  if (serverProcess != null && !serverProcess.killed && serverProcess.exitCode == null) return

  serverProcess = spawn('bun', ['--port', `${pagePort}`, '--no-hmr', `${roundDir}/index.html`], {
    cwd: roundDir,
    stdio: 'ignore',
  })

  await findResponsiveBaseUrl()
}

async function findResponsiveBaseUrl() {
  const deadline = Date.now() + 30_000

  while (Date.now() < deadline) {
    for (const host of ['127.0.0.1', 'localhost', '[::1]']) {
      const baseUrl = `http://${host}:${pagePort}`
      try {
        for (const path of ['/', '/index.html']) {
          const response = await fetch(`${baseUrl}${path}`)
          if (response.ok) return baseUrl
        }
      } catch {
      }
    }
    await Bun.sleep(50)
  }
  throw new Error(`No loopback host responded on port ${pagePort}`)
}

async function launchChrome(url: string) {
  const debugPort = 39229 + Math.floor(Math.random() * 1000)
  const process = spawn(
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    [
      '--headless=new',
      '--disable-background-networking',
      '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling',
      '--disable-extensions',
      '--mute-audio',
      '--no-first-run',
      '--no-default-browser-check',
      `--remote-debugging-port=${debugPort}`,
      'about:blank',
    ],
    {
      cwd: roundDir,
      stdio: 'ignore',
    },
  )

  const wsUrl = await waitForWebSocketUrl(debugPort)
  const cdp = await connectCdp(wsUrl)
  const targetId = await createTarget(cdp, url)
  await closeCdp(cdp)
  return { process, targetId, wsUrl }
}

async function waitForWebSocketUrl(debugPort: number) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`)
      if (response.ok) {
        const data = await response.json() as { webSocketDebuggerUrl?: string }
        if (data.webSocketDebuggerUrl != null) return data.webSocketDebuggerUrl
      }
    } catch {
    }
    await Bun.sleep(50)
  }
  throw new Error('Chrome remote debugging endpoint did not become ready')
}

async function waitForReport(browserWsUrl: string, requestId: string): Promise<ScenarioReport> {
  const browserCdp = await connectCdp(browserWsUrl)
  const targetId = await waitForTarget(browserCdp, requestId)
  const attach = await browserCdp.send('Target.attachToTarget', {
    targetId,
    flatten: true,
  }) as { sessionId: string }
  const sessionId = attach.sessionId

  await browserCdp.send('Runtime.enable', {}, sessionId)

  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    const result = await browserCdp.send(
      'Runtime.evaluate',
      {
        expression: 'window.location.hash',
        returnByValue: true,
      },
      sessionId,
    ) as { result: { value?: string } }

    const hash = result.result.value
    if (typeof hash === 'string' && hash.startsWith('#report=')) {
      const report = JSON.parse(decodeURIComponent(hash.slice('#report='.length))) as ScenarioReport
      if (report.requestId === requestId && report.phase === 'ready') {
        await closeCdp(browserCdp)
        return report
      }
      if (report.requestId === requestId && report.phase === 'error') {
        await closeCdp(browserCdp)
        return report
      }
    }
    await Bun.sleep(50)
  }

  await closeCdp(browserCdp)
  throw new Error(`Timed out waiting for report ${requestId}`)
}

async function waitForTarget(browserCdp: CdpConnection, requestId: string) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    const response = await browserCdp.send('Target.getTargets', {}) as {
      targetInfos: { targetId: string; url: string }[]
    }
    for (const target of response.targetInfos) {
      if (target.url.includes(requestId)) return target.targetId
    }
    await Bun.sleep(50)
  }
  throw new Error(`Timed out waiting for target ${requestId}`)
}

async function createTarget(browserCdp: CdpConnection, url: string) {
  const result = await browserCdp.send('Target.createTarget', { url }) as { targetId: string }
  return result.targetId
}

type CdpConnection = {
  send(method: string, params?: object, sessionId?: string): Promise<unknown>
  close(): void
}

async function connectCdp(wsUrl: string): Promise<CdpConnection> {
  const ws = new WebSocket(wsUrl)
  const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>()
  let nextId = 1

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out connecting to ${wsUrl}`)), 30_000)
    ws.addEventListener('open', () => {
      clearTimeout(timeout)
      resolve()
    })
    ws.addEventListener('error', event => {
      clearTimeout(timeout)
      reject(new Error(`WebSocket error while connecting to ${wsUrl}: ${String(event.type)}`))
    })
  })

  ws.addEventListener('message', event => {
    const payload = JSON.parse(String(event.data)) as {
      id?: number
      method?: string
      result?: unknown
      error?: { message?: string }
    }

    if (payload.id != null) {
      const entry = pending.get(payload.id)
      if (entry != null) {
        pending.delete(payload.id)
        if (payload.error != null) {
          entry.reject(new Error(payload.error.message ?? 'Unknown CDP error'))
          return
        }
        entry.resolve(payload.result)
      }
    }
  })

  return {
    send(method: string, params: object = {}, sessionId?: string) {
      const id = nextId++
      const message = sessionId == null ? { id, method, params } : { id, method, params, sessionId }
      ws.send(JSON.stringify(message))
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
    },
    close() {
      ws.close()
    },
  }
}

async function closeCdp(cdp: CdpConnection) {
  cdp.close()
  await Bun.sleep(10)
}
