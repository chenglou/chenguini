import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

type ReportCard = {
  id: number
  x: number
  y: number
  scale: number
  zIndex: number
}

type ScenarioReport = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  order: number[]
  draggedId: number | null
  lastDraggedId: number | null
  cursor: string
  swapHappened: boolean
  cards: ReportCard[]
  releaseCardId?: number
  duringSettle?: {
    lastDraggedId: number | null
    zOrderTopToBottom: number[]
    settled: boolean
  }
  afterSettle?: {
    lastDraggedId: number | null
    zOrderTopToBottom: number[]
    settled: boolean
  }
  message?: string
}

type PageConnection = {
  ws: WebSocket
  send: (method: string, params?: object) => Promise<any>
  targetId: string
}

type BrowserSession = {
  browserProcess: Bun.Subprocess<'ignore', 'pipe', 'pipe'>
  browserPort: number
  chromePath: string
  serverProcess: Bun.Subprocess<'ignore', 'pipe', 'pipe'>
  userDataDir: string
}

const roundDir = '/Users/chenglou/github/vibescript/demos_with_specs/draggable-cards/round-06'
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const serverPort = 34804
const browserTimeoutMs = 30_000

let activeSession: BrowserSession | null = null

afterAll(async () => {
  if (activeSession != null) {
    await closeSession(activeSession)
    activeSession = null
  }
})

describe('browser report flow', () => {
  test(
    'scripted drag reorders cards live',
    async () => {
      const report = await runScenario('swap-down')
      expect(report.phase).toBe('ready')
      expect(report.order).toEqual([0, 2, 1, 3, 4])
      expect(report.swapHappened).toBe(true)
      expect(report.draggedId).toBeNull()
      expect(report.lastDraggedId).toBeNull()
    },
    browserTimeoutMs,
  )

  test(
    'released card stays above the others until it settles',
    async () => {
      const report = await runScenario('release-depth')
      expect(report.phase).toBe('ready')
      expect(report.releaseCardId).toBe(1)
      expect(report.duringSettle).toBeDefined()
      expect(report.duringSettle?.lastDraggedId).toBe(1)
      expect(report.duringSettle?.zOrderTopToBottom[0]).toBe(1)
      expect(report.duringSettle?.settled).toBe(false)
      expect(report.afterSettle).toBeDefined()
      expect(report.afterSettle?.lastDraggedId).toBeNull()
      expect(report.afterSettle?.settled).toBe(true)
    },
    browserTimeoutMs,
  )
})

async function runScenario(scenario: string): Promise<ScenarioReport> {
  if (activeSession == null) {
    activeSession = await startBrowserSession()
  }

  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const baseUrl = await resolveLoopbackBaseUrl()
  const url = `${baseUrl}/?report=1&scenario=${encodeURIComponent(scenario)}&requestId=${encodeURIComponent(requestId)}`
  const page = await createPageConnection(activeSession.browserPort, url)

  try {
    await page.send('Page.enable')
    await page.send('Runtime.enable')
    const report = await waitForScenarioReport(page, requestId)
    if (report.phase === 'error') {
      throw new Error(report.message ?? `Scenario ${scenario} failed`)
    }
    return report
  } finally {
    page.ws.close()
    await fetch(`http://127.0.0.1:${activeSession.browserPort}/json/close/${page.targetId}`).catch(() => undefined)
  }
}

async function startBrowserSession(): Promise<BrowserSession> {
  const serverProcess = Bun.spawn({
    cmd: ['bun', '--port', `${serverPort}`, '--no-hmr', join(roundDir, 'index.html')],
    cwd: roundDir,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  })

  await resolveLoopbackBaseUrl()

  const browserPort = await getFreePort()
  const userDataDir = await mkdtemp(join(tmpdir(), 'draggable-cards-round-06-'))
  const browserProcess = Bun.spawn({
    cmd: [
      chromePath,
      '--headless',
      '--disable-gpu',
      '--disable-extensions',
      '--no-first-run',
      '--no-default-browser-check',
      `--remote-debugging-port=${browserPort}`,
      `--user-data-dir=${userDataDir}`,
      'about:blank',
    ],
    cwd: roundDir,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  })

  await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${browserPort}/json/version`).catch(() => null)
    if (response == null || !response.ok) return null
    return true
  }, browserTimeoutMs)

  return {
    browserProcess,
    browserPort,
    chromePath,
    serverProcess,
    userDataDir,
  }
}

async function closeSession(session: BrowserSession) {
  session.browserProcess.kill()
  session.serverProcess.kill()
  await rm(session.userDataDir, { recursive: true, force: true })
}

async function resolveLoopbackBaseUrl() {
  const candidates = ['http://127.0.0.1', 'http://localhost', 'http://[::1]']

  return waitFor(async () => {
    for (const candidate of candidates) {
      const url = `${candidate}:${serverPort}/`
      const response = await fetch(url).catch(() => null)
      if (response?.ok) return url.slice(0, -1)
    }
    return null
  }, browserTimeoutMs)
}

async function createPageConnection(browserPort: number, url: string): Promise<PageConnection> {
  const response = await fetch(`http://127.0.0.1:${browserPort}/json/new?${encodeURIComponent(url)}`, {
    method: 'PUT',
  })
  if (!response.ok) {
    throw new Error(`Failed to open page target: ${response.status}`)
  }

  const target = (await response.json()) as {
    id: string
    webSocketDebuggerUrl: string
  }

  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener('open', () => resolve(), { once: true })
    ws.addEventListener('error', () => reject(new Error('Page websocket failed')), { once: true })
  })

  let nextId = 1
  const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>()
  ws.addEventListener('message', event => {
    const payload = JSON.parse(String(event.data)) as { id?: number; result?: any; error?: { message?: string } }
    if (payload.id == null) return
    const entry = pending.get(payload.id)
    if (entry == null) return
    pending.delete(payload.id)
    if (payload.error != null) {
      entry.reject(new Error(payload.error.message ?? 'Unknown CDP error'))
      return
    }
    entry.resolve(payload.result)
  })

  return {
    ws,
    targetId: target.id,
    send(method: string, params?: object) {
      const id = nextId++
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject })
        ws.send(JSON.stringify({ id, method, params }))
      })
    },
  }
}

async function waitForScenarioReport(page: PageConnection, requestId: string) {
  return waitFor(async () => {
    const evaluation = (await page.send('Runtime.evaluate', {
      expression: 'location.hash',
      returnByValue: true,
    })) as { result?: { value?: string } }

    const hash = evaluation.result?.value
    if (typeof hash !== 'string' || hash.length <= '#report='.length) {
      return null
    }

    const params = new URLSearchParams(hash.slice(1))
    const rawReport = params.get('report')
    if (rawReport == null) return null
    const report = JSON.parse(rawReport) as ScenarioReport
    if (report.requestId !== requestId) return null
    if (report.phase === 'loading' || report.phase === 'running') return null
    return report
  }, browserTimeoutMs)
}

async function waitFor<T>(fn: () => Promise<T | null>, timeoutMs: number): Promise<T> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await fn()
    if (value != null) return value
    await Bun.sleep(50)
  }
  throw new Error(`Timed out after ${timeoutMs}ms`)
}

async function getFreePort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address == null || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to reserve a browser debugging port')))
        return
      }

      const { port } = address
      server.close(error => {
        if (error != null) {
          reject(error)
          return
        }
        resolve(port)
      })
    })
  })
}
