import {afterAll, beforeAll, describe, expect, test} from 'bun:test'
import {existsSync, mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join, resolve} from 'node:path'
import {
  TARGET_SCROLL_TOP,
  adjustScrollForAnchor,
  createInitialFeed,
  layoutFeed,
  pickAnchorForScrollTop,
  prependItems,
  resolveAnchorForRender,
  type ScrollAnchorReport,
} from './model'

const DEMO_DIR = import.meta.dir
const BROWSER_TIMEOUT_MS = 30_000
const CHROME_WINDOW_WIDTH = 1200
const CHROME_WINDOW_HEIGHT = 900

let server: ReturnType<typeof startDemoServer> | null = null
let baseUrl = ''

beforeAll(async () => {
  server = startDemoServer(DEMO_DIR)
  baseUrl = await pickResponsiveLoopbackHost(server.port)
})

afterAll(() => {
  server?.stop(true)
})

describe('layout math', () => {
  test('positions headers, items, and total height from the spec numbers', () => {
    const {items} = createInitialFeed()
    const layout = layoutFeed(items)

    expect(layout.totalHeight).toBe(1972)
    expect(layout.entries.map(entry => `${entry.kind}:${entry.kind === 'header' ? entry.day : entry.id}`)).toEqual([
      'header:Today',
      'item:V1',
      'item:V2',
      'item:V3',
      'item:V4',
      'item:V5',
      'item:V6',
      'item:V7',
      'item:V8',
      'header:Yesterday',
      'item:V9',
      'header:2 Days Ago',
      'item:V10',
      'item:V11',
      'item:V12',
      'item:V13',
      'item:V14',
      'item:V15',
      'item:V16',
      'item:V17',
    ])
    expect(layout.entryTopByKey.get('header:Today')).toBe(0)
    expect(layout.entryTopByKey.get('item:V1')).toBe(32)
    expect(layout.entryTopByKey.get('item:V8')).toBe(788)
    expect(layout.entryTopByKey.get('header:Yesterday')).toBe(920)
    expect(layout.entryTopByKey.get('item:V9')).toBe(952)
    expect(layout.entryTopByKey.get('header:2 Days Ago')).toBe(1084)
    expect(layout.entryTopByKey.get('item:V10')).toBe(1116)
    expect(layout.entryTopByKey.get('item:V17')).toBe(1872)
  })
})

describe('anchor logic', () => {
  test('picks a new anchor when scroll position changed and keeps it when only data changed', () => {
    const {items} = createInitialFeed()
    const layout = layoutFeed(items)

    const explicitScroll = resolveAnchorForRender({
      layout,
      readScrollTop: 0,
      storedScrollTop: 0,
      explicitScrollToTop: TARGET_SCROLL_TOP,
      previousAnchor: null,
    })
    expect(explicitScroll.didRebaseAnchor).toBe(true)
    expect(explicitScroll.effectiveScrollTop).toBe(TARGET_SCROLL_TOP)
    expect(explicitScroll.anchor).toEqual({id: 'V8', prevY: 788})

    const userScroll = resolveAnchorForRender({
      layout,
      readScrollTop: 880,
      storedScrollTop: TARGET_SCROLL_TOP,
      explicitScrollToTop: null,
      previousAnchor: explicitScroll.anchor,
    })
    expect(userScroll.didRebaseAnchor).toBe(true)
    expect(userScroll.anchor).toEqual({id: 'V9', prevY: 952})

    const prepended = prependItems(items, 18, 3)
    const layoutAfterPrepend = layoutFeed(prepended.items)
    const unchangedScroll = resolveAnchorForRender({
      layout: layoutAfterPrepend,
      readScrollTop: TARGET_SCROLL_TOP,
      storedScrollTop: TARGET_SCROLL_TOP,
      explicitScrollToTop: null,
      previousAnchor: explicitScroll.anchor,
    })
    expect(unchangedScroll.didRebaseAnchor).toBe(false)
    expect(unchangedScroll.anchor).toEqual({id: 'V8', prevY: 788})
  })

  test('computes anchor delta from the new item position and updates prevY immediately', () => {
    const {items} = createInitialFeed()
    const initialLayout = layoutFeed(items)
    const anchor = pickAnchorForScrollTop(initialLayout, TARGET_SCROLL_TOP)

    expect(anchor).toEqual({id: 'V8', prevY: 788})

    const prepended = prependItems(items, 18, 3)
    const layoutAfterPrepend = layoutFeed(prepended.items)
    const adjusted = adjustScrollForAnchor(TARGET_SCROLL_TOP, anchor, layoutAfterPrepend)

    expect(adjusted.delta).toBe(324)
    expect(adjusted.adjustedScrollTop).toBe(1024)
    expect(adjusted.anchor).toEqual({id: 'V8', prevY: 1112})
  })
})

describe('browser semantics', () => {
  test('scroll-to-700 then add-3-above keeps the same item at the reference line', {timeout: BROWSER_TIMEOUT_MS}, async () => {
    const report = await runBrowserScenario('scroll-to-700-then-add-3-above')

    expect(report.phase).toBe('ready')
    expect(report.beforeLineItemId).toBe('V9')
    expect(report.afterLineItemId).toBe('V9')
    expect(report.anchorBeforeId).toBe('V8')
    expect(report.anchorAfterId).toBe('V8')
  })

  test('add-1 then 2 rapid keeps the same item at the reference line in coalesced and split renders', {timeout: BROWSER_TIMEOUT_MS}, async () => {
    const report = await runBrowserScenario('add-1-then-2-rapid')

    expect(report.phase).toBe('ready')
    expect(report.steps?.map(step => step.mode)).toEqual(['coalesced', 'split'])
    expect(report.steps?.map(step => step.beforeLineItemId)).toEqual(['V9', 'V9'])
    expect(report.steps?.map(step => step.afterLineItemId)).toEqual(['V9', 'V9'])
    expect(report.steps?.map(step => step.anchorBeforeId)).toEqual(['V8', 'V8'])
    expect(report.steps?.map(step => step.anchorAfterId)).toEqual(['V8', 'V8'])
  })

  test('user-scroll then prepend picks a new anchor from the new scroll position', {timeout: BROWSER_TIMEOUT_MS}, async () => {
    const report = await runBrowserScenario('user-scroll-then-prepend')

    expect(report.phase).toBe('ready')
    expect(report.anchorBeforeId).toBe('V8')
    expect(report.anchorAfterUserScrollId).toBe('V9')
    expect(report.beforeLineItemId).toBe('V10')
    expect(report.afterLineItemId).toBe('V10')
  })
})

function startDemoServer(rootDir: string) {
  const transpiler = new Bun.Transpiler({loader: 'ts', target: 'browser'})

  return Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url)
      const pathname = url.pathname === '/' ? '/index.html' : url.pathname
      const filePath = resolve(rootDir, `.${pathname}`)
      if (!filePath.startsWith(rootDir)) return new Response('Forbidden', {status: 403})

      const file = Bun.file(filePath)
      if (!(await file.exists())) return new Response('Not found', {status: 404})

      if (filePath.endsWith('.ts')) {
        const source = await file.text()
        return new Response(transpiler.transformSync(source), {
          headers: {'content-type': 'text/javascript; charset=utf-8'},
        })
      }

      return new Response(file, {
        headers: {'content-type': guessContentType(filePath)},
      })
    },
  })
}

async function pickResponsiveLoopbackHost(port: number) {
  for (const host of ['127.0.0.1', 'localhost', '[::1]']) {
    const candidate = `http://${host}:${port}/index.html`
    try {
      const response = await fetch(candidate, {signal: AbortSignal.timeout(1_000)})
      if (response.ok) return candidate
    } catch {
      continue
    }
  }

  throw new Error(`Could not find a responding loopback host for port ${port}`)
}

function guessContentType(filePath: string) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8'
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8'
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8'
  return 'text/plain; charset=utf-8'
}

async function runBrowserScenario(scenario: string): Promise<ScrollAnchorReport> {
  const requestId = crypto.randomUUID()
  const url = `${baseUrl}?scenario=${encodeURIComponent(scenario)}&requestId=${encodeURIComponent(requestId)}`
  const chrome = await launchChrome(url)

  try {
    return await waitForMatchingReadyReport(chrome.debugPort, url, requestId)
  } finally {
    await chrome.close()
  }
}

async function launchChrome(url: string) {
  const executable = findChromeExecutable()
  const debugPort = reservePort()
  const userDataDir = mkdtempSync(join(tmpdir(), 'scroll-anchor-chrome-'))
  const proc = Bun.spawn(
    [
      executable,
      '--headless=new',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-gpu',
      '--hide-scrollbars',
      '--mute-audio',
      '--no-default-browser-check',
      '--no-first-run',
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${userDataDir}`,
      `--window-size=${CHROME_WINDOW_WIDTH},${CHROME_WINDOW_HEIGHT}`,
      url,
    ],
    {
      stdout: 'pipe',
      stderr: 'pipe',
    },
  )

  return {
    debugPort,
    async close() {
      proc.kill()
      await proc.exited
      rmSync(userDataDir, {recursive: true, force: true})
    },
  }
}

function findChromeExecutable() {
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    'google-chrome',
    'chromium',
    'chromium-browser',
  ]

  for (const candidate of candidates) {
    if (candidate.includes('/') && existsSync(candidate)) return candidate
  }

  throw new Error(`Could not find Chrome. Checked: ${candidates.join(', ')}`)
}

function reservePort() {
  const probe = Bun.serve({
    port: 0,
    fetch() {
      return new Response('ok')
    },
  })
  const port = probe.port
  probe.stop(true)
  return port
}

async function waitForMatchingReadyReport(
  debugPort: number,
  scenarioUrl: string,
  requestId: string,
) {
  const target = await waitForScenarioTarget(debugPort, scenarioUrl)
  const session = await createCDPSession(target.webSocketDebuggerUrl)
  const timeoutAt = Date.now() + BROWSER_TIMEOUT_MS

  try {
    await session.send('Runtime.enable')

    while (Date.now() < timeoutAt) {
      const hash = await session.evaluateString('location.hash')
      const report = parseReportFromHash(hash)
      if (report == null || report.requestId !== requestId) {
        await Bun.sleep(100)
        continue
      }
      if (report.phase === 'error') {
        throw new Error(report.message ?? `Scenario ${report.scenario} failed`)
      }
      if (report.phase === 'ready') return report
      await Bun.sleep(100)
    }
  } finally {
    session.close()
  }

  throw new Error(`Timed out waiting for ready report for ${requestId}`)
}

async function waitForScenarioTarget(debugPort: number, scenarioUrl: string) {
  const deadline = Date.now() + 5_000

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`)
      const targets = (await response.json()) as Array<{
        type: string
        url: string
        webSocketDebuggerUrl: string
      }>
      const match = targets.find(target => target.type === 'page' && target.url.startsWith(scenarioUrl))
      if (match != null) return match
    } catch {
      // Chrome often needs a short moment before the debugging endpoint responds.
    }
    await Bun.sleep(50)
  }

  throw new Error(`Could not find a page target for ${scenarioUrl}`)
}

function parseReportFromHash(hash: string): ScrollAnchorReport | null {
  if (!hash.startsWith('#report=')) return null

  try {
    return JSON.parse(decodeURIComponent(hash.slice('#report='.length))) as ScrollAnchorReport
  } catch {
    return null
  }
}

async function createCDPSession(wsUrl: string) {
  const socket = new WebSocket(wsUrl)
  const pending = new Map<number, {resolve: (value: any) => void; reject: (error: Error) => void}>()
  let nextId = 0

  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), {once: true})
    socket.addEventListener('error', () => reject(new Error(`Could not connect to ${wsUrl}`)), {once: true})
  })

  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data)) as
      | {id: number; result?: unknown; error?: {message: string}}
      | {method: string}
    if (!('id' in message)) return

    const promise = pending.get(message.id)
    if (promise == null) return
    pending.delete(message.id)

    if (message.error != null) promise.reject(new Error(message.error.message))
    else promise.resolve(message.result)
  })

  return {
    send(method: string, params: Record<string, unknown> = {}) {
      return new Promise<any>((resolve, reject) => {
        const id = ++nextId
        pending.set(id, {resolve, reject})
        socket.send(JSON.stringify({id, method, params}))
      })
    },
    async evaluateString(expression: string) {
      const result = await this.send('Runtime.evaluate', {
        expression,
        returnByValue: true,
      })
      return result.result?.value as string
    },
    close() {
      socket.close()
    },
  }
}
