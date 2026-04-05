import {afterAll, describe, expect, test} from 'bun:test'
import {mkdtemp, readFile, rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'

type BrowserReport = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  scenario: string
  requestId: string
  beforeItemId?: string | null
  afterItemId?: string | null
  pickedAnchorId?: string | null
  finalAnchorId?: string | null
  finalScrollTop?: number
  message?: string
}

const folder = '/Users/chenglou/github/vibescript/demos_with_specs/scroll-anchor/repeat-template-03'
const chromeBinary = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const scratchDirs: string[] = []

describe('scroll-anchor browser semantics', () => {
  test('scroll-to-700 then add-3-above keeps the same item at the reference line', async () => {
    const report = await runScenario('scroll-to-700-then-add-3-above')

    expect(report.phase).toBe('ready')
    expect(report.beforeItemId).toBeTruthy()
    expect(report.afterItemId).toBe(report.beforeItemId)
    expect(report.finalAnchorId).toBe('V7')
  }, 30_000)

  test('add-1 then 2 rapid keeps the same item at the reference line', async () => {
    const report = await runScenario('add-1-then-2-rapid')

    expect(report.phase).toBe('ready')
    expect(report.beforeItemId).toBeTruthy()
    expect(report.afterItemId).toBe(report.beforeItemId)
    expect(report.finalAnchorId).toBe('V7')
  }, 30_000)

  test('user-scroll then prepend picks a new anchor from the new scroll position', async () => {
    const report = await runScenario('user-scroll-then-prepend')

    expect(report.phase).toBe('ready')
    expect(report.pickedAnchorId).toBe('V8')
    expect(report.finalAnchorId).toBe('V8')
  }, 30_000)
})

afterAll(async () => {
  for (const dir of scratchDirs) {
    await rm(dir, {recursive: true, force: true})
  }
})

async function runScenario(scenario: string): Promise<BrowserReport> {
  const built = await buildDemo()
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const {pathname} = new URL(request.url)
      switch (pathname) {
        case '/':
          return new Response(built.html, {
            headers: {'content-type': 'text/html; charset=utf-8'},
          })

        case '/index.js':
          return new Response(Bun.file(built.bundlePath), {
            headers: {'content-type': 'text/javascript; charset=utf-8'},
          })

        case '/__health':
          return new Response('ok')

        default:
          return new Response('not found', {status: 404})
      }
    },
  })

  const host = await pickResponsiveHost(server.port)
  const chrome = await launchChrome()

  try {
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const url = `${host}/?scenario=${encodeURIComponent(scenario)}&requestId=${encodeURIComponent(requestId)}`
    const target = await createTarget(chrome.port, url)
    const report = await pollReport(chrome.port, target.webSocketDebuggerUrl, requestId)
    await closeTarget(chrome.port, target.id)
    if (report.phase === 'error') {
      throw new Error(report.message ?? `Scenario ${scenario} reported an error`)
    }
    return report
  } finally {
    chrome.process.kill('SIGKILL')
    server.stop(true)
  }
}

async function buildDemo() {
  const scratchDir = await mkdtemp(join(tmpdir(), 'scroll-anchor-'))
  scratchDirs.push(scratchDir)
  const bundlePath = join(scratchDir, 'index.js')

  const result = await Bun.build({
    entrypoints: [join(folder, 'index.ts')],
    outdir: scratchDir,
    target: 'browser',
    minify: false,
    sourcemap: 'none',
  })

  if (!result.success) {
    throw new Error(result.logs.map(log => log.message).join('\n'))
  }

  const rawHtml = await readFile(join(folder, 'index.html'), 'utf8')
  const html = rawHtml.replace('./index.ts', '/index.js')
  return {html, bundlePath}
}

async function pickResponsiveHost(port: number) {
  for (const host of [`http://127.0.0.1:${port}`, `http://localhost:${port}`, `http://[::1]:${port}`]) {
    try {
      const response = await fetch(`${host}/__health`)
      if (response.ok) return host
    } catch {}
  }

  throw new Error(`No loopback host responded for port ${port}`)
}

async function launchChrome() {
  const process = Bun.spawn([
    chromeBinary,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=0',
    'about:blank',
  ], {
    stdout: 'pipe',
    stderr: 'pipe',
  })

  let port: number
  try {
    port = await readDevToolsPort(process.stdout)
  } catch {
    port = await readDevToolsPort(process.stderr)
  }
  return {process, port}
}

async function createTarget(port: number, url: string) {
  const response = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, {
    method: 'PUT',
  })
  if (!response.ok) {
    throw new Error(`Failed to create target for ${url}: ${response.status}`)
  }

  return await response.json() as {id: string; webSocketDebuggerUrl: string}
}

async function closeTarget(port: number, targetId: string) {
  await fetch(`http://127.0.0.1:${port}/json/close/${targetId}`)
}

async function pollReport(port: number, webSocketDebuggerUrl: string, requestId: string): Promise<BrowserReport> {
  const socket = new WebSocket(webSocketDebuggerUrl)
  const pending = new Map<number, {resolve: (value: any) => void; reject: (error: unknown) => void}>()
  let nextId = 0

  await onceOpen(socket)
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data)) as {id?: number; result?: any; error?: any}
    if (message.id == null) return
    const waiter = pending.get(message.id)
    if (waiter == null) return
    pending.delete(message.id)
    if (message.error != null) waiter.reject(message.error)
    else waiter.resolve(message.result)
  })

  const evaluate = async (expression: string) => {
    const id = ++nextId
    const promise = new Promise<any>((resolve, reject) => {
      pending.set(id, {resolve, reject})
    })
    socket.send(JSON.stringify({
      id,
      method: 'Runtime.evaluate',
      params: {expression, returnByValue: true},
    }))
    return await promise
  }

  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    const result = await evaluate('location.hash')
    const hash = result.result?.value as string | undefined
    const report = parseReportHash(hash)
    if (report != null && report.requestId === requestId) {
      if (report.phase === 'ready' || report.phase === 'error') {
        socket.close()
        return report
      }
    }
    await Bun.sleep(50)
  }

  socket.close()
  throw new Error(`Timed out waiting for report ${requestId} on port ${port}`)
}

function parseReportHash(hash: string | undefined): BrowserReport | null {
  if (hash == null || hash === '' || hash === '#') return null
  const encoded = hash.startsWith('#report=') ? hash.slice('#report='.length) : null
  if (encoded == null) return null
  try {
    return JSON.parse(decodeURIComponent(encoded)) as BrowserReport
  } catch {
    return null
  }
}

function onceOpen(socket: WebSocket) {
  return new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), {once: true})
    socket.addEventListener('error', event => reject(event), {once: true})
  })
}

async function readDevToolsPort(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let text = ''
  const deadline = Date.now() + 10_000

  try {
    while (Date.now() < deadline) {
      const readResult = await Promise.race([
        reader.read(),
        Bun.sleep(250).then(() => null),
      ])
      if (readResult == null) continue
      if (readResult.done) break
      text += decoder.decode(readResult.value)
      const match = text.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//)
      if (match != null) return Number(match[1])
    }
  } finally {
    reader.releaseLock()
  }

  throw new Error(`Failed to find DevTools port in Chrome stderr:\n${text}`)
}
