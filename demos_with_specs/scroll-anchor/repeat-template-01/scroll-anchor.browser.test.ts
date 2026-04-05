import {afterAll, beforeAll, describe, expect, test} from 'bun:test'
import {existsSync} from 'node:fs'
import {mkdir, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join, resolve} from 'node:path'

type Report = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  referenceItemBefore?: string | null
  referenceItemAfter?: string | null
  anchorBefore?: string | null
  anchorAfter?: string | null
  anchorAfterUserScroll?: string | null
  scrollTopBefore?: number
  scrollTopAfter?: number
  itemCount?: number
  mountedItemCount?: number
  mountedHeaderCount?: number
  message?: string
}

type BrowserSession = {
  process: Bun.Subprocess
  getHash: () => Promise<string>
  close: () => Promise<void>
}

type TestServer = {
  baseUrl: string
  close: () => Promise<void>
}

const demoDir = '/Users/chenglou/github/vibescript/demos_with_specs/scroll-anchor/repeat-template-01'
const browserTimeoutMs = 30_000
const buildDir = join(tmpdir(), `scroll-anchor-browser-${process.pid}-${Date.now()}`)

let server: TestServer

beforeAll(async () => {
  await buildBrowserFiles()
  server = await startServer(buildDir)
})

afterAll(async () => {
  await server.close()
  await rm(buildDir, {recursive: true, force: true})
})

describe('browser report', () => {
  test(
    'scroll-to-700 then add-3-above keeps the same item at the reference line',
    async () => {
      const report = await runScenario('scroll-to-700-then-add-3-above')
      expect(report.phase).toBe('ready')
      expect(report.referenceItemBefore).toBe('V9')
      expect(report.referenceItemAfter).toBe('V9')
      expect(report.anchorBefore).toBe('V8')
      expect(report.anchorAfter).toBe('V8')
      expect(report.scrollTopBefore).toBe(700)
      expect(report.scrollTopAfter).toBe(1024)
      expect(report.itemCount).toBe(20)
      expect(report.mountedItemCount).toBeLessThan(report.itemCount!)
      expect(report.mountedHeaderCount).toBeLessThanOrEqual(3)
    },
    browserTimeoutMs,
  )

  test(
    'add-1 then 2 rapid keeps the same item at the reference line',
    async () => {
      const report = await runScenario('scroll-to-700-then-add-1-then-2-rapid')
      expect(report.phase).toBe('ready')
      expect(report.referenceItemBefore).toBe('V9')
      expect(report.referenceItemAfter).toBe('V9')
      expect(report.anchorBefore).toBe('V8')
      expect(report.anchorAfter).toBe('V8')
      expect(report.scrollTopBefore).toBe(700)
      expect(report.scrollTopAfter).toBe(1024)
      expect(report.itemCount).toBe(20)
    },
    browserTimeoutMs,
  )

  test(
    'user scroll then prepend picks a new anchor from the new scroll position',
    async () => {
      const report = await runScenario('user-scroll-then-prepend')
      expect(report.phase).toBe('ready')
      expect(report.referenceItemBefore).toBe('V10')
      expect(report.referenceItemAfter).toBe('V10')
      expect(report.anchorAfterUserScroll).toBe('V9')
      expect(report.anchorAfter).toBe('V9')
      expect(report.scrollTopBefore).toBe(920)
      expect(report.scrollTopAfter).toBe(1244)
      expect(report.itemCount).toBe(20)
    },
    browserTimeoutMs,
  )
})

async function buildBrowserFiles() {
  await rm(buildDir, {recursive: true, force: true})
  await mkdir(buildDir, {recursive: true})

  const html = await readFile(join(demoDir, 'index.html'), 'utf8').catch(() => '')
  const normalizedHtml =
    html === ''
      ? '<!DOCTYPE html><body><script type="module" src="./index.js"></script></body>'
      : html.replace('./index.ts', './index.js')

  await writeFile(join(buildDir, 'index.html'), normalizedHtml)

  const result = await Bun.build({
    entrypoints: [join(demoDir, 'index.ts')],
    outdir: buildDir,
    target: 'browser',
    naming: '[name].[ext]',
  })

  if (!result.success) {
    const messages = result.logs.map(log => log.message).join('\n')
    throw new Error(`Bun.build failed:\n${messages}`)
  }
}

async function startServer(rootDir: string): Promise<TestServer> {
  const port = await pickOpenPort()
  const server = Bun.serve({
    port,
    fetch(request) {
      const url = new URL(request.url)
      const pathname = url.pathname === '/' ? '/index.html' : url.pathname
      const filePath = resolve(rootDir, `.${pathname}`)
      if (!filePath.startsWith(rootDir)) return new Response('Forbidden', {status: 403})
      if (!existsSync(filePath)) return new Response('Not found', {status: 404})
      return new Response(Bun.file(filePath))
    },
  })

  const host = await pickReachableHost(port)
  return {
    baseUrl: `${host}:${port}`,
    close: async () => {
      await server.stop(true)
    },
  }
}

async function runScenario(scenario: string): Promise<Report> {
  const requestId = crypto.randomUUID()
  const url = `${server.baseUrl}/?scenario=${encodeURIComponent(scenario)}&requestId=${encodeURIComponent(requestId)}`
  const session = await openBrowserSession(url)

  try {
    return await waitForReport(session, requestId, browserTimeoutMs)
  } finally {
    await session.close()
  }
}

async function waitForReport(session: BrowserSession, requestId: string, timeoutMs: number): Promise<Report> {
  const deadline = Date.now() + timeoutMs
  let lastReport: Report | null = null

  while (Date.now() < deadline) {
    const hash = await session.getHash()
    const report = decodeReport(hash)
    if (report != null && report.requestId === requestId) {
      lastReport = report
      if (report.phase === 'ready') return report
      if (report.phase === 'error') throw new Error(report.message ?? `Scenario ${report.scenario} failed`)
    }
    await Bun.sleep(50)
  }

  throw new Error(
    `Timed out waiting for ready report for ${requestId}. Last report: ${JSON.stringify(lastReport)}`,
  )
}

function decodeReport(hash: string): Report | null {
  const prefix = '#report='
  if (!hash.startsWith(prefix)) return null
  try {
    return JSON.parse(decodeURIComponent(hash.slice(prefix.length))) as Report
  } catch {
    return null
  }
}

async function pickOpenPort() {
  const listener = Bun.listen({
    hostname: '127.0.0.1',
    port: 0,
    socket: {
      data() {},
      open() {},
      close() {},
      drain() {},
      error() {},
    },
  })
  const port = listener.port
  listener.stop(true)
  return port
}

async function pickReachableHost(port: number) {
  const candidates = ['http://127.0.0.1', 'http://localhost', 'http://[::1]']
  for (const host of candidates) {
    try {
      const response = await fetch(`${host}:${port}/`, {signal: AbortSignal.timeout(1000)})
      if (response.ok) return host
    } catch {}
  }
  throw new Error(`No loopback host responded for port ${port}`)
}

async function openBrowserSession(url: string): Promise<BrowserSession> {
  const chromePath = await findChromePath()
  const remoteDebuggingPort = await pickOpenPort()
  const userDataDir = join(buildDir, `chrome-profile-${crypto.randomUUID()}`)
  await mkdir(userDataDir, {recursive: true})

  const process = Bun.spawn([
    chromePath,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1200,900',
    `--remote-debugging-port=${remoteDebuggingPort}`,
    `--user-data-dir=${userDataDir}`,
    url,
  ])

  const websocketUrl = await waitForPageWebSocketUrl(remoteDebuggingPort, url, browserTimeoutMs)
  const cdp = new WebSocket(websocketUrl)
  await onceOpen(cdp)

  let nextId = 0
  const pending = new Map<number, {resolve: (value: unknown) => void; reject: (error: unknown) => void}>()
  cdp.addEventListener('message', event => {
    const message = JSON.parse(String(event.data)) as {id?: number; result?: unknown; error?: {message?: string}}
    if (message.id == null) return
    const pendingEntry = pending.get(message.id)
    if (pendingEntry == null) return
    pending.delete(message.id)
    if (message.error != null) {
      pendingEntry.reject(new Error(message.error.message ?? 'CDP error'))
      return
    }
    pendingEntry.resolve(message.result)
  })

  async function send(method: string, params?: Record<string, unknown>) {
    const id = ++nextId
    const resultPromise = new Promise<unknown>((resolve, reject) => {
      pending.set(id, {resolve, reject})
    })
    cdp.send(JSON.stringify({id, method, params}))
    return resultPromise
  }

  await send('Page.enable')
  await send('Runtime.enable')

  return {
    process,
    getHash: async () => {
      const result = await send('Runtime.evaluate', {
        expression: 'location.hash',
        returnByValue: true,
      }) as {result: {value: string}}
      return result.result.value
    },
    close: async () => {
      cdp.close()
      process.kill()
      await rm(userDataDir, {recursive: true, force: true})
    },
  }
}

async function findChromePath() {
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  throw new Error('No supported Chromium browser was found')
}

async function waitForPageWebSocketUrl(port: number, url: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
        signal: AbortSignal.timeout(1000),
      })
      const pages = await response.json() as Array<{
        type?: string
        url?: string
        webSocketDebuggerUrl?: string
      }>
      const page = pages.find(candidate =>
        candidate.type === 'page' &&
        candidate.url != null &&
        candidate.url.startsWith(url) &&
        candidate.webSocketDebuggerUrl != null,
      )
      if (page?.webSocketDebuggerUrl != null) return page.webSocketDebuggerUrl
    } catch {}
    await Bun.sleep(50)
  }
  throw new Error(`Timed out waiting for Chrome page target for ${url}`)
}

async function onceOpen(socket: WebSocket) {
  if (socket.readyState === WebSocket.OPEN) return
  await new Promise<void>((resolve, reject) => {
    const onOpen = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error('WebSocket failed to open'))
    }
    const cleanup = () => {
      socket.removeEventListener('open', onOpen)
      socket.removeEventListener('error', onError)
    }
    socket.addEventListener('open', onOpen)
    socket.addEventListener('error', onError)
  })
}
