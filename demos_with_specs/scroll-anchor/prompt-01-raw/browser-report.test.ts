import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, join, normalize } from 'node:path'

const PROMPT_DIR = '/Users/chenglou/github/vibescript/demos_with_specs/scroll-anchor/prompt-01-raw'
const INDEX_PATH = '/index.html'
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
} as const

type ReportSnapshot = {
  scrollTop: number
  anchorId: string | null
  anchorPrevY: number | null
  referenceItemId: string | null
  mountedItemCount: number
  totalItemCount: number
}

type Report = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  step?: string
  before?: ReportSnapshot
  after?: ReportSnapshot
  afterProgrammaticScroll?: ReportSnapshot
  message?: string
}

type CdpMessage = {
  id?: number
  result?: unknown
  error?: { message?: string }
}

let server: ReturnType<typeof Bun.serve>
let baseUrl = ''

describe('scroll anchor browser report', () => {
  beforeAll(async () => {
    server = Bun.serve({
      port: 0,
      hostname: '0.0.0.0',
      async fetch(request) {
        const url = new URL(request.url)
        const pathname = url.pathname === '/' ? INDEX_PATH : url.pathname
        const normalizedPath = normalize(join(PROMPT_DIR, pathname))

        if (!normalizedPath.startsWith(PROMPT_DIR)) {
          return new Response('forbidden', { status: 403 })
        }

        const file = Bun.file(normalizedPath)
        if (!(await file.exists())) {
          return new Response('not found', { status: 404 })
        }

        return new Response(file, {
          headers: {
            'content-type': mimeTypes[extname(normalizedPath) as keyof typeof mimeTypes] ?? 'text/plain; charset=utf-8',
          },
        })
      },
    })

    baseUrl = await pickLoopbackBaseUrl(server.port)
  }, 30_000)

  afterAll(() => {
    server.stop(true)
  })

  test(
    'scroll-to-700 then add-3-above keeps the same reference item',
    async () => {
      const report = await runScenario('scroll-to-700-then-add-3-above')

      expect(report.before?.referenceItemId).toBe('V9')
      expect(report.after?.referenceItemId).toBe('V9')
      expect(report.before?.anchorId).toBe('V8')
      expect(report.after?.anchorId).toBe('V8')
      expect(report.after?.mountedItemCount).toBeLessThan(report.after?.totalItemCount ?? 0)
    },
    30_000,
  )

  test(
    'add-1 then 2 rapid keeps the same reference item',
    async () => {
      const report = await runScenario('scroll-to-700-then-add-1-then-2-rapid')

      expect(report.before?.referenceItemId).toBe('V9')
      expect(report.after?.referenceItemId).toBe('V9')
      expect(report.before?.anchorId).toBe('V8')
      expect(report.after?.anchorId).toBe('V8')
    },
    30_000,
  )

  test(
    'user scroll then prepend picks a new anchor from the new scroll position',
    async () => {
      const report = await runScenario('user-scroll-then-prepend')

      expect(report.afterProgrammaticScroll?.anchorId).toBe('V8')
      expect(report.before?.anchorId).toBe('V10')
      expect(report.after?.anchorId).toBe('V10')
      expect(report.before?.referenceItemId).toBe('V11')
      expect(report.after?.referenceItemId).toBe('V11')
    },
    30_000,
  )
})

async function pickLoopbackBaseUrl(port: number) {
  const candidates = [
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
    `http://[::1]:${port}`,
  ]

  for (const candidate of candidates) {
    try {
      const response = await fetch(`${candidate}${INDEX_PATH}`)
      if (response.ok) {
        return candidate
      }
    } catch {
      // Try the next loopback host.
    }
  }

  throw new Error(`no loopback host responded for port ${port}`)
}

async function runScenario(scenario: string) {
  const requestId = crypto.randomUUID()
  const chromePort = 9_300 + Math.floor(Math.random() * 500)
  const userDataDir = mkdtempSync(join(tmpdir(), 'scroll-anchor-chrome-'))
  const scenarioUrl = `${baseUrl}${INDEX_PATH}?scenario=${encodeURIComponent(scenario)}&requestId=${encodeURIComponent(requestId)}`
  const browser = Bun.spawn(
    [
      CHROME_PATH,
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--window-size=1280,900',
      `--remote-debugging-port=${chromePort}`,
      `--user-data-dir=${userDataDir}`,
      scenarioUrl,
    ],
    {
      stdin: 'ignore',
      stdout: 'ignore',
      stderr: 'ignore',
    },
  )

  let client: CdpClient | null = null

  try {
    const webSocketUrl = await waitForTargetWebSocket(chromePort, requestId)
    client = await connectCdp(webSocketUrl)
    return await waitForMatchingReadyReport(client, requestId)
  } finally {
    client?.close()
    browser.kill()
    await browser.exited
    rmSync(userDataDir, { recursive: true, force: true })
  }
}

async function waitForTargetWebSocket(port: number, requestId: string) {
  const deadline = Date.now() + 10_000

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`)
      if (response.ok) {
        const targets = (await response.json()) as Array<{
          type?: string
          url?: string
          webSocketDebuggerUrl?: string
        }>
        const target = targets.find((entry) => entry.type === 'page' && entry.url?.includes(requestId))
        if (target?.webSocketDebuggerUrl != null) {
          return target.webSocketDebuggerUrl
        }
      }
    } catch {
      // Chrome may still be starting up.
    }

    await Bun.sleep(50)
  }

  throw new Error(`chrome target for requestId ${requestId} never appeared`)
}

async function connectCdp(webSocketUrl: string) {
  const socket = new WebSocket(webSocketUrl)
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true })
    socket.addEventListener('error', () => reject(new Error(`failed to open CDP socket ${webSocketUrl}`)), { once: true })
  })

  const client = new CdpClient(socket)
  await client.send('Runtime.enable')
  return client
}

async function waitForMatchingReadyReport(client: CdpClient, requestId: string) {
  const deadline = Date.now() + 30_000
  let lastPhase = 'none'

  while (Date.now() < deadline) {
    const hash = await client.evaluate('location.hash')
    const report = parseReport(hash)

    if (report?.requestId === requestId) {
      lastPhase = report.phase
      if (report.phase === 'ready') {
        return report
      }
      if (report.phase === 'error') {
        throw new Error(report.message ?? `scenario ${report.scenario} failed`)
      }
    }

    await Bun.sleep(50)
  }

  throw new Error(`timed out waiting for requestId ${requestId}; last seen phase ${lastPhase}`)
}

function parseReport(hash: string): Report | null {
  if (!hash.startsWith('#')) {
    return null
  }

  const params = new URLSearchParams(hash.slice(1))
  const payload = params.get('report')
  if (payload == null) {
    return null
  }

  return JSON.parse(payload) as Report
}

class CdpClient {
  private nextId = 1
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (reason?: unknown) => void }>()

  constructor(private readonly socket: WebSocket) {
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as CdpMessage
      if (message.id == null) {
        return
      }

      const pending = this.pending.get(message.id)
      if (pending == null) {
        return
      }

      this.pending.delete(message.id)
      if (message.error != null) {
        pending.reject(new Error(message.error.message ?? `CDP error for message ${message.id}`))
        return
      }

      pending.resolve(message.result)
    })
  }

  close() {
    this.socket.close()
  }

  async send(method: string, params: Record<string, unknown> = {}) {
    const id = this.nextId
    this.nextId += 1

    const response = await new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.socket.send(JSON.stringify({ id, method, params }))
    })

    return response
  }

  async evaluate(expression: string) {
    const response = (await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
    })) as {
      result?: { value?: string }
      exceptionDetails?: unknown
    }

    if (response.exceptionDetails != null) {
      throw new Error(`evaluation failed for ${expression}`)
    }

    return response.result?.value ?? ''
  }
}
