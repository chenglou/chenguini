import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { accessSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, extname, join, normalize, resolve } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export type BrowserReport = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  message?: string
  orderedCardIds?: number[]
  lastDraggedId?: number | null
  reorderedBeforeRelease?: boolean
  releasedCardId?: number | null
  stayedOnTopUntilSettle?: boolean
}

type TargetInfo = {
  type?: string
  url?: string
  webSocketDebuggerUrl?: string
}

type CdpResponse = {
  id?: number
  result?: unknown
  error?: { message?: string }
}

const DEMO_DIR = dirname(fileURLToPath(import.meta.url))
const HASH_PREFIX = '#report='

const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
}

export async function runBrowserScenario(
  scenario: string,
  timeoutMs = 30_000,
): Promise<BrowserReport> {
  const requestId = crypto.randomUUID()
  const server = await startStaticServer(DEMO_DIR)
  const targetUrl = `${server.baseUrl}/index.html?scenario=${encodeURIComponent(scenario)}&requestId=${encodeURIComponent(requestId)}`

  const chrome = await launchChrome(targetUrl)

  try {
    const pageWsUrl = await waitForPageTarget(chrome.debugBaseUrl, targetUrl, timeoutMs)
    const report = await waitForMatchingReadyReport(pageWsUrl, requestId, timeoutMs)
    return report
  } finally {
    await chrome.close()
    await server.close()
  }
}

async function startStaticServer(rootDir: string) {
  const server = createServer((request, response) => {
    void handleRequest(rootDir, request, response)
  })

  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise)
    server.listen(0, resolvePromise)
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    server.close()
    throw new Error('Static server did not expose a numeric port.')
  }

  const baseUrl = await probeLoopbackHost(address.port)

  return {
    baseUrl,
    close: async () => {
      await new Promise<void>((resolvePromise, rejectPromise) => {
        server.close((error) => {
          if (error) {
            rejectPromise(error)
            return
          }

          resolvePromise()
        })
      })
    },
  }
}

async function handleRequest(
  rootDir: string,
  request: IncomingMessage,
  response: ServerResponse,
) {
  const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1')
  const pathname = decodeURIComponent(requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname)
  const absolutePath = normalize(resolve(rootDir, `.${pathname}`))

  if (!absolutePath.startsWith(rootDir)) {
    response.writeHead(403).end('Forbidden')
    return
  }

  if (!existsSync(absolutePath)) {
    response.writeHead(404).end('Not found')
    return
  }

  const extension = extname(absolutePath)
  const contentType = CONTENT_TYPES[extension] ?? 'text/plain; charset=utf-8'

  response.writeHead(200, { 'Content-Type': contentType })
  response.end(readFileSync(absolutePath))
}

async function probeLoopbackHost(port: number) {
  const hosts = ['127.0.0.1', 'localhost', '[::1]']

  for (const host of hosts) {
    const baseUrl = `http://${host}:${port}`

    try {
      const response = await fetch(`${baseUrl}/index.html`)
      if (response.ok) {
        return baseUrl
      }
    } catch {
      continue
    }
  }

  throw new Error(`None of the loopback hosts responded for port ${port}.`)
}

async function launchChrome(targetUrl: string) {
  const executable = findChromeExecutable()
  const userDataDir = mkdtempSync(join(tmpdir(), 'thin-level-0-rich-chrome-'))

  const chromeProcess = spawn(
    executable,
    [
      '--headless=new',
      '--disable-gpu',
      '--disable-background-networking',
      '--disable-extensions',
      '--no-first-run',
      '--no-default-browser-check',
      '--remote-debugging-port=0',
      `--user-data-dir=${userDataDir}`,
      '--window-size=1440,1200',
      targetUrl,
    ],
    {
      stdio: ['ignore', 'ignore', 'pipe'],
    },
  )

  const browserWsUrl = await waitForDevToolsUrl(chromeProcess, 10_000)
  const wsUrl = new URL(browserWsUrl)
  const debugBaseUrl = `http://${wsUrl.hostname}:${wsUrl.port}`

  return {
    debugBaseUrl,
    close: async () => {
      chromeProcess.kill('SIGKILL')
      await new Promise<void>((resolvePromise) => {
        chromeProcess.once('exit', () => resolvePromise())
      })
      rmSync(userDataDir, { force: true, recursive: true })
    },
  }
}

function findChromeExecutable() {
  const explicit = process.env.CHROME_BIN ?? process.env.GOOGLE_CHROME_BIN
  if (explicit) {
    accessSync(explicit)
    return explicit
  }

  const shellCandidates = ['google-chrome', 'chromium', 'chromium-browser', 'chrome']

  for (const candidate of shellCandidates) {
    const result = spawnSync('which', [candidate], { encoding: 'utf8' })
    const resolved = result.stdout.trim()
    if (result.status === 0 && resolved) {
      return resolved
    }
  }

  const appCandidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ]

  for (const candidate of appCandidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  throw new Error('Could not find a Chrome-compatible browser. Set CHROME_BIN if needed.')
}

async function waitForDevToolsUrl(chromeProcess: ReturnType<typeof spawn>, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs
  let output = ''

  return await new Promise<string>((resolvePromise, rejectPromise) => {
    function onData(chunk: Buffer) {
      output += chunk.toString('utf8')
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/)
      if (match) {
        cleanup()
        resolvePromise(match[1])
      }
    }

    function onExit() {
      cleanup()
      rejectPromise(new Error(`Chrome exited before exposing DevTools.\n${output}`))
    }

    function cleanup() {
      chromeProcess.stderr.off('data', onData)
      chromeProcess.off('exit', onExit)
      clearTimeout(timer)
    }

    const timer = setTimeout(() => {
      cleanup()
      rejectPromise(new Error(`Timed out waiting for DevTools endpoint.\n${output}`))
    }, Math.max(1, deadline - Date.now()))

    chromeProcess.stderr.on('data', onData)
    chromeProcess.on('exit', onExit)
  })
}

async function waitForPageTarget(
  debugBaseUrl: string,
  targetUrl: string,
  timeoutMs: number,
) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const response = await fetch(`${debugBaseUrl}/json/list`)
    if (response.ok) {
      const targets = (await response.json()) as TargetInfo[]
      const pageTarget = targets.find((target) => {
        return target.type === 'page' && target.url === targetUrl && target.webSocketDebuggerUrl
      })

      if (pageTarget?.webSocketDebuggerUrl) {
        return pageTarget.webSocketDebuggerUrl
      }
    }

    await sleep(50)
  }

  throw new Error(`Timed out waiting for Chrome to open the scenario URL: ${targetUrl}`)
}

async function waitForMatchingReadyReport(
  pageWsUrl: string,
  requestId: string,
  timeoutMs: number,
) {
  const cdp = await connectToCdp(pageWsUrl)

  try {
    await cdp.send('Runtime.enable')

    const deadline = Date.now() + timeoutMs

    while (Date.now() < deadline) {
      const evaluation = (await cdp.send('Runtime.evaluate', {
        expression: 'location.hash',
        returnByValue: true,
      })) as { result?: { value?: string } }

      const hash = evaluation.result?.value
      const report = parseReportHash(hash)
      if (report && report.requestId === requestId) {
        if (report.phase === 'ready') {
          return report
        }

        if (report.phase === 'error') {
          throw new Error(report.message ?? `Scenario ${report.scenario} failed in the page.`)
        }
      }

      await sleep(50)
    }
  } finally {
    cdp.close()
  }

  throw new Error(`Timed out waiting for a ready report for request ${requestId}.`)
}

function parseReportHash(hash: string | undefined) {
  if (!hash || !hash.startsWith(HASH_PREFIX)) {
    return null
  }

  try {
    return JSON.parse(decodeURIComponent(hash.slice(HASH_PREFIX.length))) as BrowserReport
  } catch {
    return null
  }
}

async function connectToCdp(wsUrl: string) {
  const socket = new WebSocket(wsUrl)
  const pending = new Map<number, { reject: (error: Error) => void; resolve: (value: unknown) => void }>()
  let nextId = 1

  await new Promise<void>((resolvePromise, rejectPromise) => {
    socket.addEventListener('open', () => resolvePromise(), { once: true })
    socket.addEventListener(
      'error',
      () => rejectPromise(new Error(`Could not connect to CDP target ${wsUrl}`)),
      { once: true },
    )
  })

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data)) as CdpResponse
    if (!message.id) {
      return
    }

    const entry = pending.get(message.id)
    if (!entry) {
      return
    }

    pending.delete(message.id)

    if (message.error) {
      entry.reject(new Error(message.error.message ?? 'Unknown CDP error'))
      return
    }

    entry.resolve(message.result)
  })

  return {
    close() {
      socket.close()
    },
    send(method: string, params?: Record<string, unknown>) {
      const id = nextId++

      return new Promise<unknown>((resolvePromise, rejectPromise) => {
        pending.set(id, { reject: rejectPromise, resolve: resolvePromise })
        socket.send(JSON.stringify({ id, method, params }))
      })
    },
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolvePromise) => setTimeout(resolvePromise, ms))
}
