import { afterAll, beforeAll, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'

import {
  CARD_HEIGHT,
  CARD_WIDTH,
  CORNER_PAD,
  DECAY_FRICTION,
  chooseNearestCorner,
  computeDecayRestPosition,
  estimateReleaseVelocity,
  getCornerTargets,
  type CornerId,
  type Point,
  type PointerSample,
} from './gesture-flick-snap-target'

type BrowserReport = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  chosenCorner?: CornerId
  restPoint?: Point | null
  settledCard?: Point
  targetCard?: Point
  dragFollow?: {
    pointer: Point
    card: Point
    offset: Point
  }
  releaseKind?: 'mouseup' | 'touchend' | 'touchcancel'
  message?: string
}

const demoDir = '/Users/chenglou/github/vibescript/demos_with_specs/gesture-flick-snap-target/prompt-01-guided'

let serverProcess: ChildProcessWithoutNullStreams | null = null
let baseUrl = ''

test('corner positions and nearest-corner choice stay tied to padded viewport corners', () => {
  const corners = getCornerTargets(400, 300)
  expect(corners).toEqual([
    {id: 'top-left', card: {x: CORNER_PAD, y: CORNER_PAD}, marker: {x: CORNER_PAD, y: CORNER_PAD}},
    {id: 'top-right', card: {x: 400 - CORNER_PAD - CARD_WIDTH, y: CORNER_PAD}, marker: {x: 400 - CORNER_PAD, y: CORNER_PAD}},
    {id: 'bottom-left', card: {x: CORNER_PAD, y: 300 - CORNER_PAD - CARD_HEIGHT}, marker: {x: CORNER_PAD, y: 300 - CORNER_PAD}},
    {id: 'bottom-right', card: {x: 400 - CORNER_PAD - CARD_WIDTH, y: 300 - CORNER_PAD - CARD_HEIGHT}, marker: {x: 400 - CORNER_PAD, y: 300 - CORNER_PAD}},
  ])

  expect(chooseNearestCorner(corners, {x: 238, y: 36}).id).toBe('top-right')
  expect(chooseNearestCorner(corners, {x: 36, y: 210}).id).toBe('bottom-left')
})

test('decay rest position is current position plus velocity divided by friction', () => {
  expect(
    computeDecayRestPosition(
      {x: 200, y: 300},
      {x: 90, y: -45},
      DECAY_FRICTION,
    ),
  ).toEqual({x: 220, y: 290})
})

test('release velocity only uses the recent pointer history window', () => {
  const pointer: PointerSample[] = [
    {x: 0, y: 0, time: 0},
    {x: 300, y: 120, time: 50},
    {x: 330, y: 90, time: 120},
    {x: 360, y: 60, time: 160},
  ]

  expect(estimateReleaseVelocity(pointer, 100)).toEqual({x: 750, y: -750})
})

beforeAll(async () => {
  const port = await getFreePort()
  serverProcess = spawn('bun', ['--port', `${port}`, '--no-hmr', 'index.html'], {
    cwd: demoDir,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  baseUrl = await waitForLoopbackServer(port)
})

afterAll(() => {
  if (serverProcess != null && !serverProcess.killed) {
    serverProcess.kill('SIGTERM')
  }
})

test('browser-backed drag keeps the PiP under the pointer before release', async () => {
  const report = await runBrowserScenario('drag-under-pointer')
  expect(report.phase).toBe('ready')
  expect(report.dragFollow).toBeDefined()
  expect(report.dragFollow?.card.x).toBe(report.dragFollow?.pointer.x - report.dragFollow?.offset.x!)
  expect(report.dragFollow?.card.y).toBe(report.dragFollow?.pointer.y - report.dragFollow?.offset.y!)
})

test('browser-backed flick toward the upper-right lands at the upper-right corner', async () => {
  const report = await runBrowserScenario('flick-upper-right')
  expect(report.phase).toBe('ready')
  expect(report.chosenCorner).toBe('top-right')
  expect(report.targetCard).toEqual(report.settledCard)
  expect(report.restPoint).not.toBeNull()
  expect(report.releaseKind).toBe('mouseup')
})

test('browser-backed slower release toward the lower-right lands at the lower-right corner and reports a blue rest point', async () => {
  const report = await runBrowserScenario('slow-lower-right')
  expect(report.phase).toBe('ready')
  expect(report.chosenCorner).toBe('bottom-right')
  expect(report.targetCard).toEqual(report.settledCard)
  expect(report.restPoint).not.toBeNull()
  expect(report.releaseKind).toBe('touchend')
})

test('browser-backed touchcancel still finishes the snap path cleanly', async () => {
  const report = await runBrowserScenario('touchcancel-lower-right')
  expect(report.phase).toBe('ready')
  expect(report.chosenCorner).toBe('bottom-right')
  expect(report.targetCard).toEqual(report.settledCard)
  expect(report.releaseKind).toBe('touchcancel')
})

async function getFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address == null || typeof address === 'string') {
        reject(new Error('failed to allocate a loopback port'))
        return
      }
      server.close(error => {
        if (error != null) reject(error)
        else resolve(address.port)
      })
    })
  })
}

async function waitForLoopbackServer(port: number): Promise<string> {
  const candidates = [
    `http://127.0.0.1:${port}/`,
    `http://localhost:${port}/`,
    `http://[::1]:${port}/`,
  ]
  const deadline = Date.now() + 10_000

  while (Date.now() < deadline) {
    for (const candidate of candidates) {
      try {
        const response = await fetch(candidate)
        if (response.ok) return candidate
      } catch {
      }
    }
    await delay(50)
  }

  throw new Error(`demo server never responded on port ${port}`)
}

async function runBrowserScenario(scenario: string): Promise<BrowserReport> {
  if (baseUrl === '') throw new Error('baseUrl not ready')

  const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const url = `${baseUrl}?scenario=${encodeURIComponent(scenario)}&requestId=${encodeURIComponent(requestId)}`
  const chrome = await launchChrome(url)

  try {
    const pageWsUrl = await waitForPageTargetWebSocket(chrome.debugPort, requestId)
    const cdp = await connectToCdp(pageWsUrl)
    try {
      return await waitForReadyReport(cdp, requestId)
    } finally {
      cdp.close()
    }
  } finally {
    chrome.process.kill('SIGTERM')
    rmSync(chrome.userDataDir, {recursive: true, force: true})
  }
}

async function launchChrome(url: string): Promise<{
  debugPort: number
  process: ChildProcessWithoutNullStreams
  userDataDir: string
}> {
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    'google-chrome',
    'chromium',
    'chromium-browser',
  ]

  let lastError: unknown = null
  for (const executable of candidates) {
    if (executable.startsWith('/') && !existsSync(executable)) continue

    const userDataDir = mkdtempSync(join(tmpdir(), 'gesture-flick-snap-target-'))
    try {
      const process = spawn(executable, [
        '--headless=new',
        '--no-first-run',
        '--no-default-browser-check',
        '--no-sandbox',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--remote-debugging-port=0',
        '--window-size=1000,700',
        `--user-data-dir=${userDataDir}`,
        url,
      ], {
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      const debugPort = await waitForDebugPort(process)
      return {debugPort, process, userDataDir}
    } catch (error) {
      lastError = error
      rmSync(userDataDir, {recursive: true, force: true})
    }
  }

  throw new Error(`failed to launch Chrome: ${String(lastError)}`)
}

async function waitForDebugPort(process: ChildProcessWithoutNullStreams): Promise<number> {
  return await new Promise((resolve, reject) => {
    let settled = false

    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      callback()
    }
    const onData = (chunk: Buffer) => {
      const text = chunk.toString()
      const match = text.match(/DevTools listening on ws:\/\/[^:]+:(\d+)\//)
      if (match != null) {
        finish(() => resolve(Number(match[1])))
      }
    }
    const onError = (error: Error) => finish(() => reject(error))
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      finish(() => reject(new Error(`Chrome exited before opening CDP (code=${code}, signal=${signal})`)))
    }

    process.stdout.on('data', onData)
    process.stderr.on('data', onData)
    process.once('error', onError)
    process.once('exit', onExit)

    setTimeout(() => {
      finish(() => reject(new Error('timed out waiting for Chrome DevTools endpoint')))
    }, 10_000)
  })
}

async function waitForPageTargetWebSocket(debugPort: number, requestId: string): Promise<string> {
  const deadline = Date.now() + 10_000
  const endpoint = `http://127.0.0.1:${debugPort}/json/list`

  while (Date.now() < deadline) {
    const response = await fetch(endpoint)
    const targets = await response.json() as Array<{
      type?: string
      url?: string
      webSocketDebuggerUrl?: string
    }>
    const target = targets.find(candidate =>
      candidate.type === 'page' &&
      candidate.url?.includes(requestId) &&
      candidate.webSocketDebuggerUrl != null,
    )
    if (target?.webSocketDebuggerUrl != null) return target.webSocketDebuggerUrl
    await delay(50)
  }

  throw new Error(`did not find a page target for requestId=${requestId}`)
}

async function connectToCdp(wsUrl: string): Promise<{
  close(): void
  evaluate(expression: string): Promise<unknown>
}> {
  const ws = new WebSocket(wsUrl)
  let nextId = 1
  const pending = new Map<number, {resolve(value: unknown): void; reject(error: Error): void}>()

  await new Promise<void>((resolve, reject) => {
    ws.addEventListener('open', () => resolve(), {once: true})
    ws.addEventListener('error', () => reject(new Error('failed to connect to CDP target')), {once: true})
  })

  ws.addEventListener('message', event => {
    const payload = JSON.parse(String(event.data)) as {
      id?: number
      result?: unknown
      error?: {message?: string}
    }
    if (payload.id == null) return
    const entry = pending.get(payload.id)
    if (entry == null) return
    pending.delete(payload.id)
    if (payload.error != null) entry.reject(new Error(payload.error.message ?? 'CDP error'))
    else entry.resolve(payload.result)
  })

  async function send(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const id = nextId++
    const response = new Promise<unknown>((resolve, reject) => {
      pending.set(id, {resolve, reject})
    })
    ws.send(JSON.stringify({id, method, params}))
    return await response
  }

  return {
    close() {
      ws.close()
    },
    async evaluate(expression: string) {
      const result = await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
      }) as {
        result?: {value?: unknown}
        exceptionDetails?: {text?: string}
      }
      if (result.exceptionDetails != null) {
        throw new Error(result.exceptionDetails.text ?? 'page evaluation threw')
      }
      return result.result?.value
    },
  }
}

async function waitForReadyReport(
  cdp: {evaluate(expression: string): Promise<unknown>},
  requestId: string,
): Promise<BrowserReport> {
  const deadline = Date.now() + 20_000

  while (Date.now() < deadline) {
    const hash = await cdp.evaluate('window.location.hash')
    if (typeof hash === 'string' && hash.startsWith('#report=')) {
      const report = JSON.parse(decodeURIComponent(hash.slice('#report='.length))) as BrowserReport
      if (report.requestId === requestId) {
        if (report.phase === 'ready') return report
        if (report.phase === 'error') {
          throw new Error(report.message ?? `scenario ${report.scenario} reported an error`)
        }
      }
    }
    await delay(50)
  }

  throw new Error(`timed out waiting for ready report for requestId=${requestId}`)
}
