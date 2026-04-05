import {afterAll, beforeAll, describe, expect, test} from 'bun:test'
import {mkdtemp, readFile, rm} from 'node:fs/promises'
import {join, normalize, resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {createInitialState, buildLayout, pickAnchor} from './model'

const cwd = import.meta.dir
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

type Report = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  itemCount?: number
  anchorId?: string | null
  anchorBeforePrependId?: string | null
  referenceItemBeforeId?: string | null
  referenceItemAfterId?: string | null
  scrollTopBefore?: number
  scrollTopAfter?: number
  message?: string
}

type DevToolsTarget = {
  id: string
  title: string
  type: string
  url: string
  webSocketDebuggerUrl?: string
}

class CDPClient {
  #socket: WebSocket
  #nextId = 1
  #pending = new Map<number, {resolve: (value: any) => void; reject: (error: Error) => void}>()

  private constructor(socket: WebSocket) {
    this.#socket = socket
    socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data)) as {id?: number; result?: any; error?: {message?: string}}
      if (message.id == null) return
      const pending = this.#pending.get(message.id)
      if (pending == null) return
      this.#pending.delete(message.id)
      if (message.error != null) pending.reject(new Error(message.error.message ?? 'CDP error'))
      else pending.resolve(message.result)
    })
    socket.addEventListener('close', () => {
      for (const [id, pending] of this.#pending) {
        this.#pending.delete(id)
        pending.reject(new Error(`CDP socket closed before response ${id}`))
      }
    })
  }

  static async connect(wsUrl: string) {
    const socket = new WebSocket(wsUrl)
    await new Promise<void>((resolvePromise, rejectPromise) => {
      socket.addEventListener('open', () => resolvePromise(), {once: true})
      socket.addEventListener('error', () => rejectPromise(new Error(`Failed to open ${wsUrl}`)), {once: true})
    })
    return new CDPClient(socket)
  }

  send(method: string, params?: Record<string, unknown>) {
    const id = this.#nextId++
    const payload = JSON.stringify({id, method, params})
    this.#socket.send(payload)
    return new Promise<any>((resolvePromise, rejectPromise) => {
      this.#pending.set(id, {resolve: resolvePromise, reject: rejectPromise})
    })
  }

  async evaluate<T>(expression: string): Promise<T> {
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    return result.result.value as T
  }

  close() {
    this.#socket.close()
  }
}

type BrowserHarness = {
  chrome: Bun.Subprocess
  browserClient: CDPClient
  userDataDir: string
  port: number
}

let server: Bun.Server | null = null

beforeAll(() => {
  const transpiler = new Bun.Transpiler({loader: 'ts', target: 'browser'})
  server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: async request => {
      const url = new URL(request.url)
      const pathname = url.pathname === '/' ? '/index.html' : url.pathname
      const filePath = resolve(cwd, `.${pathname}`)
      if (!filePath.startsWith(normalize(cwd + '/')) && filePath !== resolve(cwd, 'index.html')) {
        return new Response('Not found', {status: 404})
      }

      if (pathname.endsWith('.html')) {
        return new Response(Bun.file(filePath), {
          headers: {'content-type': 'text/html; charset=utf-8'},
        })
      }

      if (pathname.endsWith('.ts')) {
        const source = await Bun.file(filePath).text()
        return new Response(transpiler.transformSync(source), {
          headers: {'content-type': 'text/javascript; charset=utf-8'},
        })
      }

      return new Response('Not found', {status: 404})
    },
  })
})

afterAll(async () => {
  await server?.stop()
  server = null
})

describe('browser-backed scroll anchor verification', () => {
  test(
    'scroll-to-700 then add-3-above keeps the same item at the reference line',
    async () => {
      const report = await runScenario('scroll-to-700-add-3-above')

      expect(report.phase).toBe('ready')
      expect(report.referenceItemBeforeId).toBe('V9')
      expect(report.referenceItemAfterId).toBe('V9')
      expect(report.anchorId).toBe('V7')
      expect(report.itemCount).toBe(20)
      expect(report.scrollTopBefore).toBe(700)
      expect(report.scrollTopAfter).toBe(1024)
    },
    30_000,
  )

  test(
    'add-1 then 2 rapid keeps the same item at the reference line when updates merge',
    async () => {
      const report = await runScenario('add-1-then-2-rapid-merged')

      expect(report.phase).toBe('ready')
      expect(report.referenceItemBeforeId).toBe('V9')
      expect(report.referenceItemAfterId).toBe('V9')
      expect(report.itemCount).toBe(20)
    },
    30_000,
  )

  test(
    'add-1 then 2 rapid keeps the same item at the reference line when updates split',
    async () => {
      const report = await runScenario('add-1-then-2-rapid-split')

      expect(report.phase).toBe('ready')
      expect(report.referenceItemBeforeId).toBe('V9')
      expect(report.referenceItemAfterId).toBe('V9')
      expect(report.itemCount).toBe(20)
    },
    30_000,
  )

  test(
    'user-scroll then prepend picks a new anchor from the new scroll position',
    async () => {
      const state = createInitialState()
      const expectedAnchor = pickAnchor(buildLayout(state.items).items, 860)
      const report = await runScenario('user-scroll-then-prepend')

      expect(report.phase).toBe('ready')
      expect(report.anchorBeforePrependId).toBe(expectedAnchor?.id)
      expect(report.referenceItemBeforeId).toBe('V10')
      expect(report.referenceItemAfterId).toBe('V10')
    },
    30_000,
  )
})

async function runScenario(scenario: string) {
  if (server == null) throw new Error('Static server is not running')

  const requestId = crypto.randomUUID()
  const url = `${server.url.toString()}?scenario=${encodeURIComponent(scenario)}&requestId=${encodeURIComponent(requestId)}`
  const harness = await launchBrowser()
  let pageClient: CDPClient | null = null

  try {
    const targetId = await harness.browserClient.send('Target.createTarget', {url})
    const target = await waitForTarget(harness.port, targetId.targetId)
    if (target.webSocketDebuggerUrl == null) throw new Error('Missing target websocket URL')

    pageClient = await CDPClient.connect(target.webSocketDebuggerUrl)
    await pageClient.send('Runtime.enable')

    return await waitForMatchingReadyReport(pageClient, requestId)
  } finally {
    pageClient?.close()
    harness.browserClient.close()
    harness.chrome.kill()
    await rm(harness.userDataDir, {recursive: true, force: true})
  }
}

async function launchBrowser(): Promise<BrowserHarness> {
  const userDataDir = await mkdtemp(join(tmpdir(), 'scroll-anchor-browser-'))
  const chrome = Bun.spawn([
    chromePath,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-renderer-backgrounding',
    '--remote-debugging-port=0',
    '--window-size=1280,900',
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ])

  const port = await waitForDevToolsPort(userDataDir)
  const version = await fetchJson<{webSocketDebuggerUrl: string}>(`http://127.0.0.1:${port}/json/version`)
  const browserClient = await CDPClient.connect(version.webSocketDebuggerUrl)

  return {chrome, browserClient, userDataDir, port}
}

async function waitForDevToolsPort(userDataDir: string) {
  const filePath = join(userDataDir, 'DevToolsActivePort')
  const deadline = Date.now() + 10_000

  while (Date.now() < deadline) {
    try {
      const content = await readFile(filePath, 'utf8')
      const port = Number(content.split('\n')[0]?.trim())
      if (Number.isFinite(port)) return port
    } catch {
      // keep polling
    }
    await Bun.sleep(50)
  }

  throw new Error('Timed out waiting for Chrome DevTools port')
}

async function waitForTarget(port: number, targetId: string) {
  const deadline = Date.now() + 10_000

  while (Date.now() < deadline) {
    const targets = await fetchJson<DevToolsTarget[]>(`http://127.0.0.1:${port}/json/list`)
    const target = targets.find(candidate => candidate.id === targetId)
    if (target != null) return target
    await Bun.sleep(50)
  }

  throw new Error(`Timed out waiting for target ${targetId}`)
}

async function waitForMatchingReadyReport(pageClient: CDPClient, requestId: string): Promise<Report> {
  const deadline = Date.now() + 30_000

  while (Date.now() < deadline) {
    const report = await pageClient.evaluate<Report | null>(`
      (() => {
        const encoded = new URLSearchParams(location.hash.slice(1)).get('report')
        if (encoded == null) return null
        return JSON.parse(decodeURIComponent(encoded))
      })()
    `)
    if (report != null && report.requestId === requestId) {
      if (report.phase === 'ready') return report
      if (report.phase === 'error') throw new Error(report.message ?? 'Page reported an error')
    }
    await Bun.sleep(50)
  }

  throw new Error(`Timed out waiting for report ${requestId}`)
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Request failed for ${url}: ${response.status}`)
  return await response.json() as T
}
