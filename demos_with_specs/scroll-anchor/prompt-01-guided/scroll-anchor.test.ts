import {mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {afterAll, beforeAll, describe, expect, test} from 'bun:test'
import {
  TARGET_SCROLL_TOP,
  applyAnchorDelta,
  createInitialItems,
  createLayout,
  pickAnchor,
  prependItemsAbove,
  type LayoutEntry,
} from './model'

const folder = '/Users/chenglou/github/vibescript/demos_with_specs/scroll-anchor/prompt-01-guided'
const chromeExecutable = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

type Report = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  referenceItemIdBefore?: string | null
  referenceItemIdAfter?: string | null
  expectedAnchorIdAfterUserScroll?: string | null
  anchorIdAfterUserScroll?: string | null
  mountedItemCount?: number
  totalItemCount?: number
  message?: string
}

describe('scroll anchor model', () => {
  test('lays out headers, items, and total height with the exact spec numbers', () => {
    const items = createInitialItems()
    const layout = createLayout(items)

    expect(layout.entries.find(entry => entry.kind === 'header' && entry.day === 'Today')?.top).toBe(0)
    expect(layout.entries.find(entry => entry.kind === 'item' && entry.item.id === 'V1')?.top).toBe(32)
    expect(layout.entries.find(entry => entry.kind === 'item' && entry.item.id === 'V8')?.top).toBe(788)
    expect(layout.entries.find(entry => entry.kind === 'header' && entry.day === 'Yesterday')?.top).toBe(920)
    expect(layout.entries.find(entry => entry.kind === 'item' && entry.item.id === 'V9')?.top).toBe(952)
    expect(layout.entries.find(entry => entry.kind === 'header' && entry.day === '2 Days Ago')?.top).toBe(1084)
    expect(layout.entries.find(entry => entry.kind === 'item' && entry.item.id === 'V10')?.top).toBe(1116)
    expect(layout.entries.find(entry => entry.kind === 'item' && entry.item.id === 'V17')?.top).toBe(1872)
    expect(layout.totalHeight).toBe(1972)
  })

  test('picks the first item below scrollTop and adjusts by the anchor delta', () => {
    const items = createInitialItems()
    const layoutBefore = createLayout(items)
    const anchor = pickAnchor(layoutBefore.entries, TARGET_SCROLL_TOP)

    expect(anchor).toEqual({id: 'V8', prevY: 788})

    const {items: prependedItems} = prependItemsAbove(items, 18, 3)
    const layoutAfter = createLayout(prependedItems)
    const anchoredEntry = findItem(layoutAfter.entries, anchor!.id)
    const adjustment = applyAnchorDelta(TARGET_SCROLL_TOP, anchor!, anchoredEntry.top)

    expect(anchoredEntry.top).toBe(1112)
    expect(adjustment).toEqual({
      adjustedScrollTop: 1024,
      anchor: {id: 'V8', prevY: 1112},
    })
  })
})

let server: ReturnType<typeof Bun.serve> | null = null

beforeAll(() => {
  const transpiler = new Bun.Transpiler({loader: 'ts'})
  server = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url)
      const pathname = url.pathname === '/' ? '/index.html' : url.pathname
      const file = Bun.file(`${folder}${pathname}`)
      if (!await file.exists()) {
        return new Response('Not found', {status: 404})
      }

      if (pathname.endsWith('.ts')) {
        return new Response(transpiler.transformSync(await file.text()), {
          headers: {'content-type': 'text/javascript; charset=utf-8'},
        })
      }

      return new Response(file)
    },
  })
})

afterAll(() => {
  server?.stop(true)
})

describe('scroll anchor browser semantics', () => {
  test(
    'keeps the same item on the reference line across the required scenarios',
    async () => {
      if (server == null) throw new Error('server missing')
      const baseUrl = await resolveBaseUrl(server.port)

      const addThree = await runScenario(baseUrl, 'scroll-to-700-add-3-above')
      expect(addThree.phase).toBe('ready')
      expect(addThree.referenceItemIdBefore).toBe(addThree.referenceItemIdAfter)
      expect(addThree.referenceItemIdBefore).toBe('V9')
      expect(addThree.mountedItemCount).toBeLessThan(addThree.totalItemCount!)

      const rapid = await runScenario(baseUrl, 'scroll-to-700-add-1-then-2-rapid')
      expect(rapid.phase).toBe('ready')
      expect(rapid.referenceItemIdBefore).toBe(rapid.referenceItemIdAfter)
      expect(rapid.referenceItemIdBefore).toBe('V9')
      expect(rapid.mountedItemCount).toBeLessThan(rapid.totalItemCount!)

      const userScroll = await runScenario(baseUrl, 'user-scroll-then-prepend')
      expect(userScroll.phase).toBe('ready')
      expect(userScroll.referenceItemIdBefore).toBe(userScroll.referenceItemIdAfter)
      expect(userScroll.anchorIdAfterUserScroll).toBe(userScroll.expectedAnchorIdAfterUserScroll)
      expect(userScroll.anchorIdAfterUserScroll).toBe('V10')
      expect(userScroll.mountedItemCount).toBeLessThan(userScroll.totalItemCount!)
    },
    30_000,
  )
})

function findItem(entries: LayoutEntry[], id: string) {
  const item = entries.find(entry => entry.kind === 'item' && entry.item.id === id)
  if (item == null) throw new Error(`Missing item ${id}`)
  return item
}

async function resolveBaseUrl(port: number) {
  const candidates = [
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
    `http://[::1]:${port}`,
  ]

  for (const candidate of candidates) {
    const response = await fetch(`${candidate}/index.html`)
    if (response.ok) return candidate
  }

  throw new Error(`No loopback host responded for port ${port}`)
}

async function runScenario(baseUrl: string, scenario: string): Promise<Report> {
  const requestId = crypto.randomUUID()
  const chrome = await launchChrome()
  const client = await CDPClient.connect(chrome.wsUrl)

  try {
    const url = `${baseUrl}/index.html?scenario=${encodeURIComponent(scenario)}&requestId=${encodeURIComponent(requestId)}`
    const {targetId} = await client.send('Target.createTarget', {url})
    const {sessionId} = await client.send('Target.attachToTarget', {targetId, flatten: true})
    return await waitForReadyReport(client, sessionId, requestId)
  } finally {
    await client.close()
    chrome.process.kill()
    await chrome.process.exited
  }
}

async function launchChrome() {
  const userDataDir = await mkdtemp(`${tmpdir()}/vibescript-scroll-anchor-`)
  const process = Bun.spawn([
    chromeExecutable,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-sync',
    '--disable-extensions',
    '--window-size=1280,900',
    `--user-data-dir=${userDataDir}`,
    '--remote-debugging-port=0',
    'about:blank',
  ], {
    stdout: 'ignore',
    stderr: 'pipe',
  })

  const wsUrl = await readDevtoolsUrl(process.stderr)
  return {process, wsUrl}
}

async function readDevtoolsUrl(stderr: ReadableStream<Uint8Array>) {
  const reader = stderr.getReader()
  const decoder = new TextDecoder()
  const startedAt = Date.now()
  let text = ''

  while (Date.now() - startedAt < 10_000) {
    const {done, value} = await reader.read()
    if (done) break
    text += decoder.decode(value, {stream: true})
    const match = text.match(/DevTools listening on (ws:\/\/\S+)/)
    if (match != null) return match[1]!
  }

  throw new Error(`Chrome never published a DevTools URL.\n${text}`)
}

async function waitForReadyReport(client: CDPClient, sessionId: string, requestId: string): Promise<Report> {
  const startedAt = Date.now()

  while (Date.now() - startedAt < 20_000) {
    const result = await client.send(
      'Runtime.evaluate',
      {
        expression: 'document.getElementById("__report")?.textContent ?? ""',
        returnByValue: true,
      },
      sessionId,
    )

    const rawReport = result.result.value as string
    if (rawReport !== '') {
      const report = JSON.parse(rawReport) as Report
      if (report.requestId === requestId) {
        if (report.phase === 'ready') return report
        if (report.phase === 'error') {
          throw new Error(report.message ?? `Scenario ${report.scenario} failed`)
        }
      }
    }

    await Bun.sleep(50)
  }

  throw new Error(`Timed out waiting for ready report ${requestId}`)
}

class CDPClient {
  static async connect(url: string) {
    const socket = new WebSocket(url)
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener('open', () => resolve(), {once: true})
      socket.addEventListener('error', event => reject((event as ErrorEvent).error), {once: true})
    })
    return new CDPClient(socket)
  }

  #socket: WebSocket
  #nextId = 1
  #pending = new Map<number, {resolve(value: unknown): void; reject(error: unknown): void}>()

  constructor(socket: WebSocket) {
    this.#socket = socket
    this.#socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data)) as {
        id?: number
        result?: unknown
        error?: {message: string}
      }

      if (message.id == null) return
      const pending = this.#pending.get(message.id)
      if (pending == null) return
      this.#pending.delete(message.id)
      if (message.error != null) pending.reject(new Error(message.error.message))
      else pending.resolve(message.result)
    })
  }

  close() {
    this.#socket.close()
    return Promise.resolve()
  }

  send(method: string, params?: unknown, sessionId?: string) {
    const id = this.#nextId++
    this.#socket.send(JSON.stringify({id, method, params, sessionId}))
    return new Promise<any>((resolve, reject) => {
      this.#pending.set(id, {resolve, reject})
    })
  }
}
