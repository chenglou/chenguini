import {mkdtemp, readFile, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {extname, resolve} from 'node:path'

const chromeCandidates = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  'google-chrome',
  'chromium',
  'chromium-browser',
  'chrome',
]

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.ts': 'text/javascript; charset=utf-8',
}

export async function startDemoServer(rootDir: string) {
  const root = resolve(rootDir)
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url)
      const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)
      const filePath = resolve(root, `.${pathname}`)
      if (!filePath.startsWith(root)) return new Response('Forbidden', {status: 403})

      const file = Bun.file(filePath)
      if (!(await file.exists())) return new Response('Not found', {status: 404})

      const type = contentTypes[extname(filePath) as keyof typeof contentTypes] ?? 'text/plain; charset=utf-8'
      return new Response(file, {headers: {'content-type': type}})
    },
  })

  const host = await pickLoopbackHost(server.port)
  return {
    baseUrl: `${host}:${server.port}`,
    stop() {
      server.stop(true)
    },
  }
}

export async function runScenarioInChrome({
  baseUrl,
  scenario,
}: {
  baseUrl: string
  scenario: string
}) {
  const chromePath = await findChromePath()
  const userDataDir = await mkdtemp(`${tmpdir()}/scroll-anchor-chrome-`)
  const browser = Bun.spawn(
    [
      chromePath,
      '--headless=new',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-extensions',
      '--disable-sync',
      '--metrics-recording-only',
      '--no-first-run',
      '--no-default-browser-check',
      '--remote-debugging-port=0',
      '--user-data-dir=' + userDataDir,
      '--window-size=1200,900',
      'about:blank',
    ],
    {
      stdin: 'ignore',
      stdout: 'ignore',
      stderr: 'ignore',
    },
  )

  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const scenarioUrl = `${baseUrl}/index.html?scenario=${encodeURIComponent(scenario)}&requestId=${encodeURIComponent(requestId)}`

  try {
    const browserWebSocketUrl = await readBrowserWebSocketUrl(userDataDir)
    const connection = await createCdpConnection(browserWebSocketUrl)
    try {
      const {targetId} = await connection.send('Target.createTarget', {url: scenarioUrl})
      const {sessionId} = await connection.send('Target.attachToTarget', {targetId, flatten: true})
      await connection.send('Runtime.enable', {}, sessionId)

      const report = await waitForReport({
        connection,
        requestId,
        sessionId,
        timeoutMs: 15000,
      })

      await connection.send('Target.closeTarget', {targetId})
      connection.close()
      return report
    } catch (error) {
      connection.close()
      throw error
    }
  } finally {
    browser.kill()
    await browser.exited
    await rm(userDataDir, {recursive: true, force: true})
  }
}

async function findChromePath() {
  for (const candidate of chromeCandidates) {
    if (candidate.startsWith('/')) {
      const file = Bun.file(candidate)
      if (await file.exists()) return candidate
      continue
    }

    const proc = Bun.spawn(['which', candidate], {
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'ignore',
    })
    const output = await new Response(proc.stdout).text()
    if (await proc.exited === 0) return output.trim()
  }

  throw new Error('Could not find a local Chrome or Chromium binary')
}

async function pickLoopbackHost(port: number) {
  const hosts = ['http://127.0.0.1', 'http://localhost', 'http://[::1]']
  for (const host of hosts) {
    try {
      const response = await fetch(`${host}:${port}/index.html`)
      if (response.ok) return host
    } catch {
      // Try the next loopback host.
    }
  }

  throw new Error(`No loopback host responded for port ${port}`)
}

async function readBrowserWebSocketUrl(userDataDir: string) {
  const activePortPath = `${userDataDir}/DevToolsActivePort`
  const startedAt = Date.now()

  while (Date.now() - startedAt < 10000) {
    try {
      const raw = await readFile(activePortPath, 'utf8')
      const [port, browserPath] = raw.trim().split('\n')
      if (port != null && browserPath != null) return `ws://127.0.0.1:${port}${browserPath}`
    } catch {
      // Chrome is still starting.
    }

    await Bun.sleep(50)
  }

  throw new Error('Timed out waiting for Chrome DevToolsActivePort')
}

async function waitForReport({
  connection,
  requestId,
  sessionId,
  timeoutMs,
}: {
  connection: Awaited<ReturnType<typeof createCdpConnection>>
  requestId: string
  sessionId: string
  timeoutMs: number
}) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const evaluation = await connection.send(
        'Runtime.evaluate',
        {
          expression: 'location.hash',
          returnByValue: true,
        },
        sessionId,
      )
      const hash = evaluation.result?.value
      const report = parseHashReport(hash)
      if (report == null || report.requestId !== requestId) {
        await Bun.sleep(50)
        continue
      }

      if (report.phase === 'ready') return report
      if (report.phase === 'error') throw new Error(report.message ?? 'Scenario reported an error')
    } catch (error) {
      if (Date.now() - startedAt >= timeoutMs) throw error
    }

    await Bun.sleep(50)
  }

  throw new Error(`Timed out waiting for scenario ${requestId}`)
}

function parseHashReport(hash: unknown) {
  if (typeof hash !== 'string' || hash === '') return null
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  const params = new URLSearchParams(raw)
  const report = params.get('report')
  if (report == null) return null
  return JSON.parse(report)
}

async function createCdpConnection(url: string) {
  const websocket = new WebSocket(url)
  const pending = new Map<
    number,
    {
      resolve: (value: any) => void
      reject: (error: Error) => void
    }
  >()
  let nextId = 1

  await new Promise<void>((resolve, reject) => {
    websocket.addEventListener('open', () => resolve(), {once: true})
    websocket.addEventListener('error', () => reject(new Error('Failed to connect to Chrome DevTools')), {once: true})
  })

  websocket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data))
    if (message.id == null) return

    const entry = pending.get(message.id)
    if (entry == null) return
    pending.delete(message.id)

    if (message.error != null) {
      entry.reject(new Error(message.error.message ?? 'Chrome DevTools request failed'))
      return
    }

    entry.resolve(message.result)
  })

  websocket.addEventListener('close', () => {
    for (const entry of pending.values()) {
      entry.reject(new Error('Chrome DevTools connection closed'))
    }
    pending.clear()
  })

  return {
    close() {
      websocket.close()
    },
    send(method: string, params: Record<string, unknown> = {}, sessionId?: string) {
      const id = nextId++
      const payload: Record<string, unknown> = {id, method, params}
      if (sessionId != null) payload.sessionId = sessionId

      return new Promise<any>((resolve, reject) => {
        pending.set(id, {resolve, reject})
        websocket.send(JSON.stringify(payload))
      })
    },
  }
}
