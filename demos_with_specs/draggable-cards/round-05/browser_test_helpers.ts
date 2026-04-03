import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ROUND_DIR = '/Users/chenglou/github/vibescript/demos_with_specs/draggable-cards/round-05'
const INDEX_HTML = `${ROUND_DIR}/index.html`
const CHROME_BIN = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const TIMEOUT_MS = 30_000

type PendingResolver = {
  resolve: (value: unknown) => void
  reject: (error: unknown) => void
}

type CdpResponse = {
  id?: number
  result?: unknown
  error?: { message?: string }
  sessionId?: string
}

type CdpCommandParams = Record<string, unknown> & {
  sessionId?: string
}

export type ScenarioReport = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  order: number[]
  swapCount: number
  swapObservedDuringDrag: boolean
  draggedId: number | null
  lastDraggedId: number | null
  topCardId: number | null
  zOrderTopToBottom: number[]
  duringSettle: {
    lastDraggedId: number | null
    topCardId: number | null
  }
  positions: Array<{ id: number; x: number; y: number; z: number }>
  env: {
    userAgent: string
    viewportWidth: number
    viewportHeight: number
    devicePixelRatio: number
  }
  message?: string
}

export type HarnessHandle = {
  baseUrl: string
  serverProcess: Bun.Subprocess<'ignore', 'pipe', 'pipe'>
  browserProcess: Bun.Subprocess<'ignore', 'pipe', 'pipe'>
  browser: CdpClient
  profileDir: string
}

class CdpClient {
  private readonly socket: WebSocket
  private readonly pending = new Map<number, PendingResolver>()
  private nextId = 1

  constructor(socket: WebSocket) {
    this.socket = socket
    this.socket.addEventListener('message', event => {
      const data = JSON.parse(String(event.data)) as CdpResponse
      if (data.id == null) return
      const pending = this.pending.get(data.id)
      if (pending == null) return
      this.pending.delete(data.id)
      if (data.error != null) {
        pending.reject(new Error(data.error.message ?? 'CDP command failed'))
        return
      }
      pending.resolve(data)
    })
    this.socket.addEventListener('close', () => {
      for (const pending of this.pending.values()) {
        pending.reject(new Error('CDP socket closed'))
      }
      this.pending.clear()
    })
  }

  send(method: string, params: CdpCommandParams = {}): Promise<CdpResponse> {
    const id = this.nextId++
    const { sessionId, ...rest } = params
    const payload = sessionId == null ? { id, method, params: rest } : { id, method, params: rest, sessionId }
    this.socket.send(JSON.stringify(payload))
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
    })
  }

  async close() {
    this.socket.close()
  }
}

export async function startHarness(): Promise<HarnessHandle> {
  const profileDir = await mkdtemp(join(tmpdir(), 'draggable-cards-round-05-'))
  const serverPort = await findFreePort()
  const debugPort = await findFreePort()
  const serverProcess = Bun.spawn(['bun', '--port', String(serverPort), '--no-hmr', INDEX_HTML], {
    cwd: ROUND_DIR,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const baseUrl = await waitForBaseUrl(serverPort, TIMEOUT_MS)

  const browserProcess = Bun.spawn([
    CHROME_BIN,
    '--headless=new',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ], {
    cwd: ROUND_DIR,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const browserWsUrl = await waitForDebugWebSocketUrl(debugPort, TIMEOUT_MS)
  const socket = await connectWebSocket(browserWsUrl, TIMEOUT_MS)
  const browser = new CdpClient(socket)
  return { baseUrl, serverProcess, browserProcess, browser, profileDir }
}

export async function stopHarness(harness: HarnessHandle) {
  await harness.browser.close()
  harness.browserProcess.kill()
  harness.serverProcess.kill()
  await harness.browserProcess.exited
  await harness.serverProcess.exited
  await rm(harness.profileDir, { force: true, recursive: true })
}

export async function runScenarioReport(harness: HarnessHandle, scenario: string): Promise<ScenarioReport> {
  const requestId = randomUUID()
  const url = `${harness.baseUrl}?report=1&scenario=${encodeURIComponent(scenario)}&requestId=${encodeURIComponent(requestId)}`
  const targetResponse = await harness.browser.send('Target.createTarget', { url })
  const targetId = (targetResponse.result as { targetId?: string } | undefined)?.targetId
  if (targetId == null) {
    throw new Error('Chrome did not create a target')
  }
  const attachResponse = await harness.browser.send('Target.attachToTarget', {
    targetId,
    flatten: true,
  })
  const sessionId = (attachResponse.result as { sessionId?: string } | undefined)?.sessionId
  if (sessionId == null) {
    throw new Error('Chrome did not return a target session')
  }

  await harness.browser.send('Runtime.enable', { sessionId })
  await harness.browser.send('Page.enable', { sessionId })

  const deadline = Date.now() + TIMEOUT_MS
  for (;;) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for report from scenario "${scenario}"`)
    }
    const response = await harness.browser.send('Runtime.evaluate', {
      expression: 'location.hash',
      returnByValue: true,
      sessionId,
    })
    const hash = (
      response.result as {
        result?: { value?: string }
      } | undefined
    )?.result?.value
    const report = parseHashReport(hash)
    if (report?.requestId === requestId) {
      if (report.phase === 'error') {
        throw new Error(report.message ?? `Scenario "${scenario}" failed`)
      }
      if (report.phase === 'ready') {
        await harness.browser.send('Target.closeTarget', { targetId })
        return report
      }
    }
    await Bun.sleep(50)
  }
}

async function waitForBaseUrl(port: number, timeoutMs: number): Promise<string> {
  const deadline = Date.now() + timeoutMs
  const hosts = ['127.0.0.1', 'localhost', '[::1]']
  while (Date.now() < deadline) {
    for (const host of hosts) {
      const url = `http://${host}:${port}/`
      try {
        const response = await fetch(url)
        if (response.ok) return url
      } catch {}
    }
    await Bun.sleep(50)
  }
  throw new Error('Timed out waiting for Bun page server')
}

async function waitForDebugWebSocketUrl(port: number, timeoutMs: number): Promise<string> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`)
      if (response.ok) {
        const json = await response.json() as { webSocketDebuggerUrl?: string }
        if (json.webSocketDebuggerUrl != null) return json.webSocketDebuggerUrl
      }
    } catch {}
    await Bun.sleep(50)
  }
  throw new Error('Timed out waiting for Chrome remote debugging endpoint')
}

async function findFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address == null || typeof address === 'string') {
        server.close()
        reject(new Error('Could not reserve a port'))
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

async function connectWebSocket(url: string, timeoutMs: number): Promise<WebSocket> {
  const socket = new WebSocket(url)
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Timed out opening CDP websocket'))
    }, timeoutMs)
    socket.addEventListener('open', () => {
      clearTimeout(timer)
      resolve()
    }, { once: true })
    socket.addEventListener('error', event => {
      clearTimeout(timer)
      reject(new Error(`Failed to open CDP websocket: ${String(event.type)}`))
    }, { once: true })
  })
  return socket
}

function parseHashReport(hash: string | undefined): ScenarioReport | null {
  if (hash == null || hash.length === 0) return null
  const prefix = '#report='
  if (!hash.startsWith(prefix)) return null
  try {
    return JSON.parse(decodeURIComponent(hash.slice(prefix.length))) as ScenarioReport
  } catch {
    return null
  }
}
