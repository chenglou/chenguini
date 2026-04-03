import {afterAll, beforeAll, expect, test} from 'bun:test'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawn, type ChildProcessWithoutNullStreams} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {createServer} from 'node:net'

import {photoGalleryData} from '../data'

const demoDir = '/Users/chenglou/github/vibescript/demos_with_specs/photo-gallery/thin-repeat-04'
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const serverHosts = ['127.0.0.1', 'localhost', '[::1]']

type AutomationReport = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  message?: string
  selectedText?: string
  focusedId?: string | null
  initialFocusedId?: string | null
  finalHash?: string
  mode?: 'grid' | 'line'
  rowGapPx?: number
  mountedCount?: number
  itemCount?: number
}

type RunningServer = {
  baseUrl: string
  process: ChildProcessWithoutNullStreams
}

class CdpClient {
  private nextId = 1
  private ws: WebSocket
  private pending = new Map<number, (result: unknown) => void>()

  private constructor(ws: WebSocket) {
    this.ws = ws
    this.ws.addEventListener('message', (event) => {
      const payload = JSON.parse(String(event.data)) as {id?: number; result?: unknown}
      if (payload.id == null) return
      const resolve = this.pending.get(payload.id)
      if (resolve == null) return
      this.pending.delete(payload.id)
      resolve(payload.result)
    })
  }

  static async connect(webSocketUrl: string): Promise<CdpClient> {
    const ws = new WebSocket(webSocketUrl)
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => resolve(), {once: true})
      ws.addEventListener('error', (event) => reject(event), {once: true})
    })
    return new CdpClient(ws)
  }

  async send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = this.nextId++
    const result = new Promise<unknown>((resolve) => {
      this.pending.set(id, resolve)
    })
    this.ws.send(JSON.stringify({id, method, params}))
    return result
  }

  async close(): Promise<void> {
    this.ws.close()
    await Bun.sleep(10)
  }
}

let server: RunningServer | null = null

beforeAll(async () => {
  server = await startDemoServer()
}, 35_000)

afterAll(async () => {
  server?.process.kill('SIGTERM')
  await Bun.sleep(100)
}, 10_000)

test(
  'hash sync keeps the focused image in the hash and reads the initial hash back into state',
  async () => {
    const initialPhotoId = photoGalleryData[6]!.id
    const report = await runScenario('hash-sync', `#photo=${encodeURIComponent(initialPhotoId)}`)

    expect(report.initialFocusedId).toBe(initialPhotoId)
    expect(report.focusedId).toBe(photoGalleryData[7]!.id)
    expect(report.finalHash).toBe(`#photo=${encodeURIComponent(photoGalleryData[7]!.id)}`)
    expect(report.mode).toBe('line')
  },
  35_000,
)

test(
  'caption clicks select the full caption text and stay in grid mode',
  async () => {
    const report = await runScenario('caption-selection')

    expect(report.selectedText).toBe(photoGalleryData[2]!.prompt)
    expect(report.mode).toBe('grid')
    expect(report.finalHash).toBe('')
  },
  35_000,
)

test(
  'dismiss restore lands the focused row with about 40px above it',
  async () => {
    const report = await runScenario('dismiss-restore')

    expect(report.mode).toBe('grid')
    expect(report.rowGapPx).toBeGreaterThanOrEqual(34)
    expect(report.rowGapPx).toBeLessThanOrEqual(46)
    expect(report.finalHash).toBe('')
  },
  35_000,
)

test(
  'occlusion mounts fewer cards than the full data set in a representative scrolled state',
  async () => {
    const report = await runScenario('occlusion')

    expect(report.mountedCount).toBeGreaterThan(0)
    expect(report.itemCount).toBe(photoGalleryData.length)
    expect(report.mountedCount).toBeLessThan(photoGalleryData.length)
  },
  35_000,
)

async function runScenario(scenario: string, hash = ''): Promise<AutomationReport> {
  if (server == null) throw new Error('server did not start')

  const requestId = randomUUID()
  const cdpPort = await getFreePort()
  const userDataDir = mkdtempSync(join(tmpdir(), 'thin-repeat-04-chrome-'))
  const url = `${server.baseUrl}/?scenario=${encodeURIComponent(scenario)}&requestId=${encodeURIComponent(requestId)}${hash}`
  const chrome = spawn(
    chromePath,
    [
      '--headless=new',
      '--disable-gpu',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-extensions',
      '--disable-sync',
      '--metrics-recording-only',
      '--mute-audio',
      '--no-first-run',
      '--no-default-browser-check',
      `--remote-debugging-port=${cdpPort}`,
      `--user-data-dir=${userDataDir}`,
      url,
    ],
    {stdio: 'pipe'},
  )

  try {
    const webSocketUrl = await waitForPageWebSocketDebuggerUrl(cdpPort, server.baseUrl)
    const client = await CdpClient.connect(webSocketUrl)
    try {
      await client.send('Runtime.enable')
      const report = await waitForMatchingReadyReport(client, requestId)
      return report
    } finally {
      await client.close()
    }
  } finally {
    chrome.kill('SIGTERM')
    rmSync(userDataDir, {force: true, recursive: true})
  }
}

async function startDemoServer(): Promise<RunningServer> {
  const port = await getFreePort()
  const process = spawn('bun', ['--port', String(port), '--no-hmr', 'index.html'], {
    cwd: demoDir,
    stdio: 'pipe',
  })
  const baseUrl = await waitForResponsiveBaseUrl(port)
  return {baseUrl, process}
}

async function waitForResponsiveBaseUrl(port: number): Promise<string> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < 10_000) {
    for (const host of serverHosts) {
      const baseUrl = `http://${host}:${port}`
      try {
        const response = await fetch(`${baseUrl}/`)
        if (response.ok) return baseUrl
      } catch {}
    }
    await Bun.sleep(50)
  }
  throw new Error(`server on port ${port} never responded`)
}

async function waitForPageWebSocketDebuggerUrl(cdpPort: number, baseUrl: string): Promise<string> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < 10_000) {
    try {
      const response = await fetch(`http://127.0.0.1:${cdpPort}/json/list`)
      if (response.ok) {
        const targets = (await response.json()) as {type?: string; url?: string; webSocketDebuggerUrl?: string}[]
        const pageTarget = targets.find(
          (target) =>
            target.type === 'page' &&
            typeof target.url === 'string' &&
            target.url.startsWith(baseUrl) &&
            typeof target.webSocketDebuggerUrl === 'string',
        )
        if (pageTarget?.webSocketDebuggerUrl != null) return pageTarget.webSocketDebuggerUrl
      }
    } catch {}
    await Bun.sleep(50)
  }
  throw new Error(`Chrome on port ${cdpPort} never exposed a page target for ${baseUrl}`)
}

async function waitForMatchingReadyReport(client: CdpClient, requestId: string): Promise<AutomationReport> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < 35_000) {
    const rawResult = (await client.send('Runtime.evaluate', {
      awaitPromise: true,
      returnByValue: true,
      expression: `document.getElementById("automation-report")?.textContent ?? ""`,
    })) as {result?: {value?: unknown}}
    const text = rawResult.result?.value
    if (typeof text === 'string' && text !== '') {
      const report = JSON.parse(text) as AutomationReport
      if (report.requestId === requestId) {
        if (report.phase === 'ready') return report
        if (report.phase === 'error') {
          throw new Error(report.message ?? `scenario ${report.scenario} failed`)
        }
      }
    }
    await Bun.sleep(50)
  }
  throw new Error(`report ${requestId} never reached ready`)
}

async function getFreePort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address == null || typeof address === 'string') {
        server.close()
        reject(new Error('failed to allocate a free port'))
        return
      }
      server.close((error) => {
        if (error != null) {
          reject(error)
          return
        }
        resolve(address.port)
      })
    })
    server.on('error', reject)
  })
}
