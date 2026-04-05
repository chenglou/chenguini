import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import { createServer } from 'node:net'

const ROOT = '/Users/chenglou/github/vibescript/demos_with_specs/scroll-anchor/repeat-raw-02'
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

type Report = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  beforeReferenceItemId?: string | null
  afterReferenceItemId?: string | null
  anchorBeforeScrollId?: string | null
  anchorAfterScrollId?: string | null
  expectedAnchorAfterScrollId?: string | null
  variants?: Array<{
    mode: 'same-frame' | 'split-frame'
    beforeReferenceItemId: string | null
    afterReferenceItemId: string | null
  }>
  message?: string
}

class CdpClient {
  #socket: WebSocket
  #nextId = 1
  #pending = new Map<number, { resolve: (value: any) => void; reject: (reason?: unknown) => void }>()

  static async connect(url: string) {
    const socket = new WebSocket(url)
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener('open', () => resolve(), { once: true })
      socket.addEventListener('error', (event) => reject(event), { once: true })
    })
    return new CdpClient(socket)
  }

  constructor(socket: WebSocket) {
    this.#socket = socket
    this.#socket.addEventListener('message', (event) => {
      const payload = JSON.parse(String(event.data))
      if (!('id' in payload)) {
        return
      }
      const pending = this.#pending.get(payload.id)
      if (!pending) {
        return
      }
      this.#pending.delete(payload.id)
      if (payload.error) {
        pending.reject(new Error(payload.error.message))
        return
      }
      pending.resolve(payload.result)
    })
    this.#socket.addEventListener('close', () => {
      for (const pending of this.#pending.values()) {
        pending.reject(new Error('CDP socket closed'))
      }
      this.#pending.clear()
    })
  }

  send(method: string, params: Record<string, unknown> = {}) {
    const id = this.#nextId++
    this.#socket.send(JSON.stringify({ id, method, params }))
    return new Promise<any>((resolve, reject) => {
      this.#pending.set(id, { resolve, reject })
    })
  }

  close() {
    this.#socket.close()
  }
}

let server: ReturnType<typeof Bun.serve>
let baseUrl = ''

beforeAll(async () => {
  server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url)
      const pathname = url.pathname === '/' ? '/index.html' : url.pathname
      const filePath = join(ROOT, pathname.slice(1))
      if (!existsSync(filePath)) {
        return new Response('Not found', { status: 404 })
      }
      return new Response(Bun.file(filePath), {
        headers: {
          'content-type': mimeTypeFor(pathname),
        },
      })
    },
  })

  baseUrl = await pickLoopbackBaseUrl(server.port)
})

afterAll(() => {
  server.stop(true)
})

describe('browser-backed anchoring', () => {
  test(
    'scroll-to-700 then add-3-above keeps the same item at the reference line',
    async () => {
      const report = await runScenario('scroll-to-700-add-3-above')
      expect(report.beforeReferenceItemId).toBe('V9')
      expect(report.beforeReferenceItemId).toBe(report.afterReferenceItemId)
    },
    20_000,
  )

  test(
    'add-1 then 2 rapid keeps the same item at the reference line',
    async () => {
      const report = await runScenario('rapid-prepend')

      expect(report.variants).toBeDefined()
      expect(report.variants).toHaveLength(2)
      expect(report.variants).toEqual([
        {
          mode: 'same-frame',
          beforeReferenceItemId: 'V9',
          afterReferenceItemId: 'V9',
        },
        {
          mode: 'split-frame',
          beforeReferenceItemId: 'V9',
          afterReferenceItemId: 'V9',
        },
      ])
    },
    20_000,
  )

  test(
    'user-scroll then prepend picks a new anchor from the new scroll position',
    async () => {
      const report = await runScenario('user-scroll-then-prepend')

      expect(report.anchorBeforeScrollId).toBe('V8')
      expect(report.anchorAfterScrollId).toBe('V10')
      expect(report.expectedAnchorAfterScrollId).toBe('V10')
      expect(report.anchorAfterScrollId).not.toBe(report.anchorBeforeScrollId)
      expect(report.beforeReferenceItemId).toBe('V11')
      expect(report.beforeReferenceItemId).toBe(report.afterReferenceItemId)
    },
    20_000,
  )
})

function mimeTypeFor(pathname: string) {
  switch (extname(pathname)) {
    case '.html':
      return 'text/html; charset=utf-8'
    case '.js':
      return 'text/javascript; charset=utf-8'
    case '.css':
      return 'text/css; charset=utf-8'
    case '.json':
      return 'application/json; charset=utf-8'
    default:
      return 'text/plain; charset=utf-8'
  }
}

async function pickLoopbackBaseUrl(port: number) {
  const hosts = ['127.0.0.1', 'localhost', '[::1]']
  for (const host of hosts) {
    const candidate = `http://${host}:${port}`
    try {
      const response = await fetch(`${candidate}/index.html`)
      if (response.ok) {
        return candidate
      }
    } catch {
      continue
    }
  }
  throw new Error(`No loopback host responded for port ${port}`)
}

async function getFreePort() {
  return await new Promise<number>((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        reject(new Error('Could not allocate a TCP port'))
        return
      }
      const { port } = address
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve(port)
      })
    })
  })
}

async function runScenario(scenario: string) {
  const debugPort = await getFreePort()
  const chromeUserDataDir = mkdtempSync(join(tmpdir(), 'scroll-anchor-chrome-'))
  const chrome = Bun.spawn(
    [
      CHROME_PATH,
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--window-size=1200,1200',
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${chromeUserDataDir}`,
      'about:blank',
    ],
    {
      stdout: 'ignore',
      stderr: 'ignore',
    },
  )

  let client: CdpClient | null = null
  let targetId = ''

  try {
    await waitForChrome(debugPort)

    const requestId = crypto.randomUUID()
    const pageUrl = `${baseUrl}/index.html?scenario=${encodeURIComponent(scenario)}&requestId=${encodeURIComponent(requestId)}`
    const target = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(pageUrl)}`, {
      method: 'PUT',
    })
    if (!target.ok) {
      throw new Error(`Could not create a Chrome target for ${scenario}`)
    }

    const targetInfo = (await target.json()) as { id: string; webSocketDebuggerUrl: string }
    targetId = targetInfo.id
    client = await CdpClient.connect(targetInfo.webSocketDebuggerUrl)
    await client.send('Runtime.enable')
    await client.send('Page.enable')

    return await waitForMatchingReadyReport(client, requestId, scenario)
  } finally {
    if (client) {
      client.close()
    }
    if (targetId) {
      await fetch(`http://127.0.0.1:${debugPort}/json/close/${targetId}`).catch(() => {})
    }
    chrome.kill()
    await chrome.exited.catch(() => {})
    rmSync(chromeUserDataDir, { recursive: true, force: true })
  }
}

async function waitForChrome(debugPort: number) {
  for (let attempt = 0; attempt < 160; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`)
      if (response.ok) {
        return
      }
    } catch {
      // Keep polling while Chrome boots.
    }
    await Bun.sleep(50)
  }
  throw new Error(`Chrome did not open a DevTools endpoint on port ${debugPort}`)
}

async function waitForMatchingReadyReport(client: CdpClient, requestId: string, scenario: string) {
  let lastHash = ''

  for (let attempt = 0; attempt < 200; attempt++) {
    const evaluation = await client.send('Runtime.evaluate', {
      expression: 'location.hash',
      returnByValue: true,
    })
    const hash = String(evaluation.result?.value ?? '')
    if (hash) {
      lastHash = hash
    }
    const report = parseReportFromHash(hash)
    if (report?.requestId !== requestId) {
      await Bun.sleep(50)
      continue
    }
    if (report.phase === 'error') {
      throw new Error(report.message ?? `${scenario} reported an error`)
    }
    if (report.phase === 'ready') {
      return report
    }
    await Bun.sleep(50)
  }

  throw new Error(`Timed out waiting for ${scenario}. Last hash: ${lastHash}`)
}

function parseReportFromHash(hash: string) {
  if (!hash.startsWith('#report=')) {
    return null
  }
  try {
    return JSON.parse(decodeURIComponent(hash.slice('#report='.length))) as Report
  } catch {
    return null
  }
}
