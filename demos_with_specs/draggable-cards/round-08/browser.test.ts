import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

type Report = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario?: string
  order?: string[]
  draggedId?: string | null
  lastDraggedId?: string | null
  swapOccurred?: boolean
  cursor?: string
  settlingTopId?: string | null
  settlingLastDraggedId?: string | null
  settleFrames?: number
  finalLastDraggedId?: string | null
  message?: string
}

type CdpMessage = {
  id?: number
  result?: unknown
  error?: { message?: string }
}

class CdpConnection {
  #socket: WebSocket
  #nextId = 1
  #pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()

  constructor(url: string) {
    this.#socket = new WebSocket(url)
  }

  async open() {
    await new Promise<void>((resolve, reject) => {
      const onOpen = () => {
        cleanup()
        this.#socket.addEventListener('message', this.#onMessage)
        resolve()
      }
      const onError = () => {
        cleanup()
        reject(new Error('Failed to connect to Chrome DevTools'))
      }
      const cleanup = () => {
        this.#socket.removeEventListener('open', onOpen)
        this.#socket.removeEventListener('error', onError)
      }

      this.#socket.addEventListener('open', onOpen)
      this.#socket.addEventListener('error', onError)
    })
  }

  close() {
    this.#socket.removeEventListener('message', this.#onMessage)
    this.#socket.close()
    for (const pending of this.#pending.values()) {
      pending.reject(new Error('Chrome DevTools connection closed'))
    }
    this.#pending.clear()
  }

  async send(method: string, params?: Record<string, unknown>) {
    const id = this.#nextId++
    const payload = JSON.stringify({ id, method, params })
    const promise = new Promise<unknown>((resolve, reject) => {
      this.#pending.set(id, { resolve, reject })
    })
    this.#socket.send(payload)
    return await promise
  }

  #onMessage = (event: MessageEvent<string>) => {
    const message = JSON.parse(event.data) as CdpMessage
    if (message.id == null) {
      return
    }
    const pending = this.#pending.get(message.id)
    if (pending == null) {
      return
    }
    this.#pending.delete(message.id)
    if (message.error != null) {
      pending.reject(new Error(message.error.message ?? 'Chrome DevTools error'))
      return
    }
    pending.resolve(message.result)
  }
}

const roundDir = '/Users/chenglou/github/vibescript/demos_with_specs/draggable-cards/round-08'
const indexHtml = `${roundDir}/index.html`
const serverPort = 34804
const chromeCandidates = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
]

let serverProcess: Bun.Subprocess | null = null
let browserProcess: Bun.Subprocess | null = null
let browserUserDataDir = ''
let baseUrl = ''
let devtoolsPort = 0

test(
  'page reports swap and release-depth semantics',
  async () => {
    await startEnvironment()
    try {
      const swapReport = await runScenario('swap-down')
      expect(swapReport.phase).toBe('ready')
      expect(swapReport.order).toEqual(['card-0', 'card-2', 'card-3', 'card-1', 'card-4'])
      expect(swapReport.swapOccurred).toBe(true)
      expect(swapReport.cursor).toBe('auto')
      expect(swapReport.draggedId).toBe(null)
      expect(swapReport.lastDraggedId).toBe(null)

      const depthReport = await runScenario('release-depth')
      expect(depthReport.phase).toBe('ready')
      expect(depthReport.settlingTopId).toBe('card-2')
      expect(depthReport.settlingLastDraggedId).toBe('card-2')
      expect(depthReport.settleFrames).toBeGreaterThan(0)
      expect(depthReport.finalLastDraggedId).toBe(null)
    } finally {
      await stopEnvironment()
    }
  },
  30_000,
)

async function startEnvironment() {
  serverProcess = Bun.spawn(['bun', '--port', `${serverPort}`, '--no-hmr', indexHtml], {
    cwd: roundDir,
    stdout: 'ignore',
    stderr: 'pipe',
  })
  baseUrl = await probeLoopbackBaseUrl(serverPort)

  const chromePath = await findChromeBinary()
  browserUserDataDir = await mkdtemp(join(tmpdir(), 'draggable-cards-round-08-'))
  browserProcess = Bun.spawn(
    [
      chromePath,
      '--headless=new',
      '--disable-background-networking',
      '--disable-extensions',
      '--disable-sync',
      '--no-default-browser-check',
      '--no-first-run',
      '--remote-debugging-port=0',
      `--user-data-dir=${browserUserDataDir}`,
      'about:blank',
    ],
    {
      cwd: roundDir,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  )

  devtoolsPort = await waitForDevtoolsPort(browserUserDataDir)
}

async function stopEnvironment() {
  browserProcess?.kill()
  serverProcess?.kill()
  browserProcess = null
  serverProcess = null
  if (browserUserDataDir !== '') {
    await rm(browserUserDataDir, { recursive: true, force: true })
    browserUserDataDir = ''
  }
}

async function findChromeBinary() {
  for (const candidate of chromeCandidates) {
    const file = Bun.file(candidate)
    if (await file.exists()) {
      return candidate
    }
  }
  throw new Error('Chrome not found at expected macOS locations')
}

async function waitForDevtoolsPort(userDataDir: string) {
  const devtoolsFile = join(userDataDir, 'DevToolsActivePort')
  const startedAt = Date.now()
  while (Date.now() - startedAt < 15_000) {
    try {
      const content = await readFile(devtoolsFile, 'utf8')
      const firstLine = content.split('\n')[0]?.trim()
      const port = Number(firstLine)
      if (Number.isFinite(port) && port > 0) {
        return port
      }
    } catch {
      // Chrome has not written the file yet.
    }
    await Bun.sleep(50)
  }
  throw new Error('Timed out waiting for Chrome DevTools port')
}

async function probeLoopbackBaseUrl(port: number) {
  const candidates = [
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
    `http://[::1]:${port}`,
  ]
  const startedAt = Date.now()
  while (Date.now() - startedAt < 15_000) {
    for (const base of candidates) {
      try {
        const response = await fetch(`${base}/`)
        if (response.ok) {
          return base
        }
      } catch {
        // Server is not ready on this host yet.
      }
    }
    await Bun.sleep(50)
  }

  let stderr = ''
  if (serverProcess?.stderr != null) {
    stderr = await new Response(serverProcess.stderr).text()
  }
  throw new Error(`Timed out waiting for Bun page server\n${stderr}`)
}

async function runScenario(scenario: string) {
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const url = `${baseUrl}/?report=1&scenario=${encodeURIComponent(scenario)}&requestId=${encodeURIComponent(requestId)}`
  const target = await openTarget(url)
  const cdp = new CdpConnection(target.webSocketDebuggerUrl)
  await cdp.open()

  try {
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')

    const startedAt = Date.now()
    while (Date.now() - startedAt < 30_000) {
      const report = await readReport(cdp)
      if (report != null && report.requestId === requestId) {
        if (report.phase === 'error') {
          throw new Error(report.message ?? `Scenario ${scenario} failed`)
        }
        if (report.phase === 'ready') {
          return report
        }
      }
      await Bun.sleep(50)
    }
    throw new Error(`Timed out waiting for scenario ${scenario}`)
  } finally {
    cdp.close()
    await closeTarget(target.id)
  }
}

async function openTarget(url: string) {
  const response = await fetch(`http://127.0.0.1:${devtoolsPort}/json/new?${encodeURIComponent(url)}`, {
    method: 'PUT',
  })
  if (!response.ok) {
    throw new Error(`Failed to open Chrome target for ${url}`)
  }
  return (await response.json()) as { id: string; webSocketDebuggerUrl: string }
}

async function closeTarget(id: string) {
  await fetch(`http://127.0.0.1:${devtoolsPort}/json/close/${id}`)
}

async function readReport(cdp: CdpConnection) {
  const result = (await cdp.send('Runtime.evaluate', {
    expression: 'location.hash',
    returnByValue: true,
  })) as { result?: { value?: string } }
  const hash = result.result?.value
  if (typeof hash !== 'string' || !hash.startsWith('#report=')) {
    return null
  }
  return JSON.parse(decodeURIComponent(hash.slice('#report='.length))) as Report
}
