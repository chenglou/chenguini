import {afterAll, beforeAll, describe, expect, test} from 'bun:test'
import {existsSync, mkdtempSync, rmSync} from 'node:fs'
import {createServer} from 'node:net'
import {extname, resolve} from 'node:path'
import {tmpdir} from 'node:os'

const demoRoot = '/Users/chenglou/github/vibescript/demos_with_specs/scroll-anchor/prompt-01-template'
const chromeBinary = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

type ReportSnapshot = {
  label: string
  scrollTop: number
  anchorId: string | null
  anchorPrevY: number | null
  referenceItemId: string | null
  referenceOffset: number | null
  mountedEntryCount: number
  totalEntryCount: number
}

type Report = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  itemCount?: number
  snapshots?: ReportSnapshot[]
  message?: string
}

type ChromeSession = {
  cdp: CDPClient
  proc: ReturnType<typeof Bun.spawn>
  userDataDir: string
}

let server: ReturnType<typeof Bun.serve>
let baseUrl = ''

beforeAll(async () => {
  if (!existsSync(chromeBinary)) {
    throw new Error(`Chrome binary not found at ${chromeBinary}`)
  }

  server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(req) {
      const url = new URL(req.url)
      if (url.pathname === '/healthz') return new Response('ok')

      const pathname = url.pathname === '/' ? '/index.html' : url.pathname
      const filePath = resolve(demoRoot, `.${pathname}`)
      if (!filePath.startsWith(demoRoot)) return new Response('forbidden', {status: 403})

      const file = Bun.file(filePath)
      if (!(await file.exists())) return new Response('not found', {status: 404})

      return new Response(file, {
        headers: {'content-type': contentTypeForPath(filePath)},
      })
    },
  })

  baseUrl = await pickLoopbackBaseUrl(server.port)
}, 30_000)

afterAll(() => {
  server.stop(true)
})

describe('browser verification', () => {
  test('scroll-to-700 then add-3-above keeps the same item at the reference line', async () => {
    const report = await runBrowserScenario('scroll-to-700-add-3-above')

    expect(report.phase).toBe('ready')
    expect(report.itemCount).toBe(20)
    expect(report.snapshots?.length).toBe(2)

    const before = report.snapshots?.[0]
    const after = report.snapshots?.[1]

    expect(before?.label).toBe('before-add')
    expect(before?.referenceItemId).toBe('V8')
    expect(before?.anchorId).toBe('V8')
    expect(before?.mountedEntryCount).toBeLessThan(before?.totalEntryCount ?? 0)

    expect(after?.label).toBe('after-add')
    expect(after?.referenceItemId).toBe(before?.referenceItemId)
    expect(Math.abs((after?.referenceOffset ?? 0) - (before?.referenceOffset ?? 0))).toBeLessThan(0.6)
    expect(after?.scrollTop).toBe(1024)
  }, 35_000)

  test('add-1 then 2 rapid keeps the same item at the reference line', async () => {
    const report = await runBrowserScenario('add-1-then-2-rapid')

    expect(report.phase).toBe('ready')
    expect(report.itemCount).toBe(20)
    expect(report.snapshots?.length).toBe(2)

    const before = report.snapshots?.[0]
    const after = report.snapshots?.[1]

    expect(before?.referenceItemId).toBe('V8')
    expect(after?.referenceItemId).toBe(before?.referenceItemId)
    expect(Math.abs((after?.referenceOffset ?? 0) - (before?.referenceOffset ?? 0))).toBeLessThan(0.6)
    expect(after?.scrollTop).toBe(1024)
  }, 35_000)

  test('user-scroll then prepend repicks from the new scroll position', async () => {
    const report = await runBrowserScenario('user-scroll-then-prepend')

    expect(report.phase).toBe('ready')
    expect(report.itemCount).toBe(20)
    expect(report.snapshots?.length).toBe(2)

    const afterUserScroll = report.snapshots?.[0]
    const afterAdd = report.snapshots?.[1]

    expect(afterUserScroll?.label).toBe('after-user-scroll')
    expect(afterUserScroll?.anchorId).toBe('V10')
    expect(afterUserScroll?.referenceItemId).toBe('V10')

    expect(afterAdd?.label).toBe('after-add')
    expect(afterAdd?.anchorId).toBe('V10')
    expect(afterAdd?.referenceItemId).toBe('V10')
    expect(Math.abs((afterAdd?.referenceOffset ?? 0) - (afterUserScroll?.referenceOffset ?? 0))).toBeLessThan(0.6)
    expect(afterAdd?.scrollTop).toBe(1304)
  }, 35_000)
})

async function runBrowserScenario(scenario: string): Promise<Report> {
  const requestId = crypto.randomUUID()
  const url = `${baseUrl}/index.html?scenario=${encodeURIComponent(scenario)}&requestId=${encodeURIComponent(requestId)}`
  const chrome = await launchChrome()

  try {
    const target = await fetchJson(`http://127.0.0.1:${chrome.cdp.port}/json/new?${encodeURIComponent(url)}`, {
      method: 'PUT',
    }) as {webSocketDebuggerUrl: string}
    const page = await CDPClient.connect(target.webSocketDebuggerUrl, chrome.cdp.port)

    try {
      return await waitForReadyReport(page, requestId)
    } finally {
      await page.close()
    }
  } finally {
    chrome.proc.kill()
    rmSync(chrome.userDataDir, {force: true, recursive: true})
  }
}

async function launchChrome(): Promise<ChromeSession> {
  const port = await getFreePort()
  const userDataDir = mkdtempSync(resolve(tmpdir(), 'scroll-anchor-chrome-'))
  const proc = Bun.spawn({
    cmd: [
      chromeBinary,
      '--headless=new',
      '--disable-gpu',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-renderer-backgrounding',
      '--mute-audio',
      '--no-first-run',
      '--no-default-browser-check',
      '--remote-debugging-port=' + port,
      '--user-data-dir=' + userDataDir,
      '--window-size=1280,900',
      'about:blank',
    ],
    stderr: 'ignore',
    stdout: 'ignore',
  })

  await waitFor(async () => {
    try {
      await fetchJson(`http://127.0.0.1:${port}/json/version`)
      return true
    } catch {
      return false
    }
  }, 10_000)

  return {
    cdp: await CDPClient.connectBrowser(port),
    proc,
    userDataDir,
  }
}

async function waitForReadyReport(cdp: CDPClient, requestId: string): Promise<Report> {
  await cdp.send('Runtime.enable')

  const report = await waitForValue(async () => {
    const evaluation = await cdp.send('Runtime.evaluate', {
      expression: 'location.hash',
      returnByValue: true,
    }) as {result?: {value?: string}}
    const hash = evaluation.result?.value
    if (typeof hash !== 'string') return null

    const parsed = parseReportHash(hash)
    if (parsed == null || parsed.requestId !== requestId) return null
    if (parsed.phase === 'error') throw new Error(parsed.message ?? 'page reported error')
    return parsed.phase === 'ready' ? parsed : null
  }, 20_000)

  return report
}

function parseReportHash(hash: string): Report | null {
  const match = /^#report=(.+)$/.exec(hash)
  if (match == null) return null

  try {
    return JSON.parse(decodeURIComponent(match[1]!)) as Report
  } catch {
    return null
  }
}

function contentTypeForPath(filePath: string): string {
  switch (extname(filePath)) {
    case '.html':
      return 'text/html; charset=utf-8'
    case '.js':
      return 'text/javascript; charset=utf-8'
    default:
      return 'text/plain; charset=utf-8'
  }
}

async function pickLoopbackBaseUrl(port: number): Promise<string> {
  const candidates = [
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
    `http://[::1]:${port}`,
  ]

  for (const candidate of candidates) {
    try {
      const response = await fetch(`${candidate}/healthz`)
      if (response.ok) return candidate
    } catch {
      continue
    }
  }

  throw new Error(`No loopback host responded for port ${port}`)
}

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init)
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`)
  return response.json()
}

async function waitFor(check: () => Promise<boolean>, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await check()) return
    await Bun.sleep(50)
  }
  throw new Error(`Timed out after ${timeoutMs}ms`)
}

async function waitForValue<T>(check: () => Promise<T | null>, timeoutMs: number): Promise<T> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await check()
    if (value != null) return value
    await Bun.sleep(50)
  }
  throw new Error(`Timed out after ${timeoutMs}ms`)
}

async function getFreePort(): Promise<number> {
  return await new Promise((resolvePromise, rejectPromise) => {
    const server = createServer()
    server.on('error', rejectPromise)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address == null || typeof address === 'string') {
        rejectPromise(new Error('Failed to reserve a port'))
        return
      }
      server.close(error => {
        if (error != null) rejectPromise(error)
        else resolvePromise(address.port)
      })
    })
  })
}

class CDPClient {
  private nextId = 1
  private pending = new Map<number, {resolve: (value: unknown) => void; reject: (error: Error) => void}>()
  private ws: WebSocket

  private constructor(ws: WebSocket, readonly port: number) {
    this.ws = ws
    ws.addEventListener('message', event => {
      const payload = JSON.parse(String(event.data)) as {
        id?: number
        result?: unknown
        error?: {message?: string}
      }

      if (payload.id == null) return
      const pending = this.pending.get(payload.id)
      if (pending == null) return
      this.pending.delete(payload.id)

      if (payload.error != null) {
        pending.reject(new Error(payload.error.message ?? 'CDP error'))
      } else {
        pending.resolve(payload.result)
      }
    })
  }

  static async connect(url: string, port: number): Promise<CDPClient> {
    const ws = new WebSocket(url)
    await new Promise<void>((resolvePromise, rejectPromise) => {
      ws.addEventListener('open', () => resolvePromise(), {once: true})
      ws.addEventListener('error', () => rejectPromise(new Error(`Failed to connect to ${url}`)), {once: true})
    })
    return new CDPClient(ws, port)
  }

  static async connectBrowser(port: number): Promise<CDPClient> {
    const version = await fetchJson(`http://127.0.0.1:${port}/json/version`) as {webSocketDebuggerUrl: string}
    return await CDPClient.connect(version.webSocketDebuggerUrl, port)
  }

  async send(method: string, params: Record<string, unknown> = {}) {
    const id = this.nextId++
    const payload = JSON.stringify({id, method, params})
    const responsePromise = new Promise((resolvePromise, rejectPromise) => {
      this.pending.set(id, {resolve: resolvePromise, reject: rejectPromise})
    })
    this.ws.send(payload)
    return await responsePromise
  }

  async close() {
    if (this.ws.readyState === this.ws.OPEN) this.ws.close()
  }
}
