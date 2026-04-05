import {createServer} from 'node:net'
import {mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '[::1]']

type TargetInfo = {
  id: string
  webSocketDebuggerUrl: string
}

export type ServerHandle = {
  baseUrl: string
  stop: () => Promise<void>
}

export async function startDemoServer(cwd: string): Promise<ServerHandle> {
  const port = await getAvailablePort()
  const child = Bun.spawn([process.execPath, '--port', String(port), '--no-hmr', './index.html'], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  })

  const host = await waitForResponsiveLoopback(port)
  const baseUrl = `${host}:${port}/`

  return {
    baseUrl,
    async stop() {
      child.kill()
      await child.exited
    },
  }
}

export async function runScenario(baseUrl: string, scenario: string) {
  const debugPort = await getAvailablePort()
  const profileDir = await mkdtemp(join(tmpdir(), 'gesture-flick-snap-target-chrome-'))
  const chrome = Bun.spawn(
    [
      CHROME_PATH,
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${profileDir}`,
      'about:blank',
    ],
    {
      stdout: 'pipe',
      stderr: 'pipe',
    },
  )

  try {
    await waitForJsonVersion(debugPort)

    const requestId = crypto.randomUUID()
    const url = `${baseUrl}?scenario=${encodeURIComponent(scenario)}&requestId=${encodeURIComponent(requestId)}`
    const target = await createTarget(debugPort, url)
    const cdp = await connectToTarget(target.webSocketDebuggerUrl)

    try {
      await cdp.send('Page.enable')
      await cdp.send('Runtime.enable')
      return await waitForMatchingReadyReport(cdp, requestId)
    } finally {
      cdp.close()
      await fetch(`http://127.0.0.1:${debugPort}/json/close/${target.id}`).catch(() => undefined)
    }
  } finally {
    chrome.kill()
    await chrome.exited.catch(() => undefined)
    await rm(profileDir, {recursive: true, force: true})
  }
}

async function getAvailablePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address == null || typeof address === 'string') {
        reject(new Error('Failed to reserve a local port'))
        return
      }
      const {port} = address
      server.close((error) => {
        if (error != null) reject(error)
        else resolve(port)
      })
    })
    server.on('error', reject)
  })
}

async function waitForResponsiveLoopback(port: number): Promise<string> {
  const deadline = performance.now() + 10_000

  while (performance.now() < deadline) {
    for (const host of LOOPBACK_HOSTS) {
      const baseUrl = `http://${host}:${port}/`
      try {
        const response = await fetch(baseUrl, {signal: AbortSignal.timeout(500)})
        if (response.ok) return `http://${host}`
      } catch {
      }
    }
    await sleep(50)
  }

  throw new Error(`Timed out waiting for Bun server on port ${port}`)
}

async function waitForJsonVersion(port: number) {
  const deadline = performance.now() + 10_000

  while (performance.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
        signal: AbortSignal.timeout(500),
      })
      if (response.ok) return
    } catch {
    }
    await sleep(50)
  }

  throw new Error(`Timed out waiting for Chrome CDP on port ${port}`)
}

async function createTarget(port: number, url: string): Promise<TargetInfo> {
  const response = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, {
    method: 'PUT',
    signal: AbortSignal.timeout(5_000),
  })

  if (!response.ok) {
    throw new Error(`Failed to create Chrome target: ${response.status} ${response.statusText}`)
  }

  return await response.json()
}

type CdpClient = {
  close: () => void
  send: (method: string, params?: Record<string, unknown>) => Promise<unknown>
}

async function connectToTarget(webSocketDebuggerUrl: string): Promise<CdpClient> {
  return await new Promise((resolve, reject) => {
    const socket = new WebSocket(webSocketDebuggerUrl)
    let nextId = 0
    const pending = new Map<number, {resolve: (value: unknown) => void; reject: (error: unknown) => void}>()

    socket.addEventListener('open', () => {
      resolve({
        close() {
          socket.close()
        },
        send(method, params = {}) {
          return new Promise((resolveSend, rejectSend) => {
            const id = ++nextId
            pending.set(id, {resolve: resolveSend, reject: rejectSend})
            socket.send(JSON.stringify({id, method, params}))
          })
        },
      })
    })

    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as {
        id?: number
        result?: unknown
        error?: {message?: string}
      }
      if (message.id == null) return
      const handler = pending.get(message.id)
      if (handler == null) return
      pending.delete(message.id)
      if (message.error != null) {
        handler.reject(new Error(message.error.message ?? 'Unknown CDP error'))
      } else {
        handler.resolve(message.result)
      }
    })

    socket.addEventListener('error', (error) => {
      reject(error)
    })

    socket.addEventListener('close', () => {
      for (const handler of pending.values()) {
        handler.reject(new Error('CDP socket closed'))
      }
      pending.clear()
    })
  })
}

async function waitForMatchingReadyReport(cdp: CdpClient, requestId: string) {
  const deadline = performance.now() + 20_000
  let lastPhase: string | null = null

  while (performance.now() < deadline) {
    const evaluation = await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const raw = new URLSearchParams(location.hash.slice(1)).get('report')
          if (raw == null) return null
          return JSON.parse(raw)
        })()
      `,
      returnByValue: true,
    }) as {
      result?: {
        value?: unknown
      }
    }

    const report = evaluation.result?.value
    if (report != null && typeof report === 'object' && 'requestId' in report) {
      const typedReport = report as Record<string, unknown>
      if (typedReport.requestId === requestId) {
        lastPhase = String(typedReport.phase ?? '')
        if (typedReport.phase === 'ready') return typedReport
        if (typedReport.phase === 'error') {
          throw new Error(`Scenario ${String(typedReport.scenario)} failed: ${String(typedReport.message)}`)
        }
      }
    }

    await sleep(50)
  }

  throw new Error(`Timed out waiting for a ready report for requestId ${requestId}. Last phase: ${lastPhase ?? 'none'}`)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
