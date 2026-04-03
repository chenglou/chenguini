import { mkdtemp, open, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

export type BrowserReport = {
  status: 'ready' | 'error'
  requestId: string
  phase: 'booting' | 'idle' | 'dragging' | 'settling' | 'error'
  orderedCardIds: number[]
  cardPositions: { id: number; x: number; y: number; width: number; height: number }[]
  draggedId: number | null
  lastDraggedId: number | null
  cursor: string
  zOrder: number[]
  swapCount: number
}

export type BrowserSession = {
  getCardCenter(cardId: number): Promise<{ x: number; y: number }>
  pointerMove(x: number, y: number, options?: { steps?: number }): Promise<void>
  pointerDown(x: number, y: number): Promise<void>
  pointerUp(x: number, y: number): Promise<void>
  waitForReport(
    predicate: (report: BrowserReport) => boolean,
    description: string,
  ): Promise<BrowserReport>
}

export async function runBrowserScenario<T>(
  _run: (session: BrowserSession) => Promise<T>,
): Promise<T> {
  return withChromeLock(async () => {
    const server = startRoundServer()
    const baseUrl = await probeLoopbackBaseUrl(server.port)
    const requestId = `round04-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const pageUrl = `${baseUrl}/index.html?requestId=${encodeURIComponent(requestId)}`
    const chrome = await launchChrome()
    const page = await chrome.openPage(pageUrl)

    try {
      return await _run({
        async getCardCenter(cardId) {
          const report = await waitForReport(page, requestId, (candidate) => {
            return candidate.cardPositions.some((position) => position.id === cardId)
          }, `card ${cardId} center`)
          const card = report.cardPositions.find((position) => position.id === cardId)
          if (card == null) throw new Error(`Card ${cardId} is missing from the report`)
          return { x: card.x + card.width / 2, y: card.y + card.height / 2 }
        },

        async pointerMove(x, y, options) {
          await page.pointerMove(x, y, options?.steps ?? 1)
        },

        async pointerDown(x, y) {
          await page.pointerDown(x, y)
        },

        async pointerUp(x, y) {
          await page.pointerUp(x, y)
        },

        async waitForReport(predicate, description) {
          return waitForReport(page, requestId, predicate, description)
        },
      })
    } finally {
      await page.close()
      await chrome.close()
      server.stop(true)
    }
  })
}

const roundDir = resolve('/Users/chenglou/github/vibescript/demos_with_specs/draggable-cards/round-04')
const chromeBinary = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const chromeLockPath = join(tmpdir(), 'vibescript-round04-chrome.lock')
const transpiler = new Bun.Transpiler({ loader: 'ts' })

function startRoundServer() {
  const server = Bun.serve({
    port: 0,
    hostname: '::',
    fetch(request) {
      const url = new URL(request.url)
      if (url.pathname === '/__health') {
        return new Response('ok', { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } })
      }

      const relativePath = url.pathname === '/' ? 'index.html' : url.pathname.slice(1)
      const filePath = resolve(roundDir, relativePath)
      if (!filePath.startsWith(roundDir)) {
        return new Response('Not found', { status: 404 })
      }

      if (filePath.endsWith('.ts')) {
        const source = Bun.file(filePath)
        return source.text().then((contents) => {
          const code = transpiler.transformSync(contents, filePath)
          return new Response(code, {
            headers: {
              'content-type': 'text/javascript; charset=utf-8',
              'cache-control': 'no-store',
            },
          })
        }).catch(() => new Response('Not found', { status: 404 }))
      }

      const file = Bun.file(filePath)
      return file.exists().then((exists) => {
        if (!exists) return new Response('Not found', { status: 404 })
        return new Response(file, {
          headers: {
            'cache-control': 'no-store',
          },
        })
      })
    },
  })
  return server
}

async function probeLoopbackBaseUrl(port: number) {
  const hostnames = ['127.0.0.1', 'localhost', '[::1]']
  for (const hostname of hostnames) {
    const baseUrl = `http://${hostname}:${port}`
    try {
      const response = await fetch(`${baseUrl}/__health`, {
        signal: AbortSignal.timeout(500),
      })
      if (response.ok) return baseUrl
    } catch {}
  }
  throw new Error(`Could not reach the round-04 server on 127.0.0.1, localhost, or [::1] for port ${port}`)
}

async function launchChrome() {
  const userDataDir = await mkdtemp(join(tmpdir(), 'vibescript-round04-chrome-'))
  const chrome = Bun.spawn([
    chromeBinary,
    '--headless=new',
    '--disable-background-networking',
    '--disable-extensions',
    '--disable-sync',
    '--metrics-recording-only',
    '--mute-audio',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ], {
    stdout: 'ignore',
    stderr: 'pipe',
  })

  try {
    const { port } = await waitForDevToolsPort(userDataDir)
    return {
      async openPage(url: string) {
        const targetResponse = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, {
          method: 'PUT',
          signal: AbortSignal.timeout(5_000),
        })
        if (!targetResponse.ok) {
          const message = await targetResponse.text()
          throw new Error(`Chrome failed to open a target: ${message}`)
        }

        const target = await targetResponse.json() as { id: string; webSocketDebuggerUrl: string }
        const client = await connectCdp(target.webSocketDebuggerUrl)
        await client.send('Page.enable')
        await client.send('Runtime.enable')
        await client.send('Emulation.setDeviceMetricsOverride', {
          width: 900,
          height: 900,
          deviceScaleFactor: 1,
          mobile: false,
        })
        await client.send('Page.bringToFront')

        let pointer = { x: 0, y: 0, buttons: 0 }
        return {
          async pointerMove(x: number, y: number, steps: number) {
            const start = pointer
            for (let step = 1; step <= Math.max(1, steps); step++) {
              const progress = step / Math.max(1, steps)
              const pointX = start.x + (x - start.x) * progress
              const pointY = start.y + (y - start.y) * progress
              await client.send('Input.dispatchMouseEvent', {
                type: 'mouseMoved',
                x: pointX,
                y: pointY,
                button: 'left',
                buttons: pointer.buttons,
              })
            }
            pointer = { x, y, buttons: pointer.buttons }
          },

          async pointerDown(x: number, y: number) {
            await this.pointerMove(x, y, 1)
            await client.send('Input.dispatchMouseEvent', {
              type: 'mousePressed',
              x,
              y,
              button: 'left',
              buttons: 1,
              clickCount: 1,
            })
            pointer = { x, y, buttons: 1 }
          },

          async pointerUp(x: number, y: number) {
            await this.pointerMove(x, y, 1)
            await client.send('Input.dispatchMouseEvent', {
              type: 'mouseReleased',
              x,
              y,
              button: 'left',
              buttons: 0,
              clickCount: 1,
            })
            pointer = { x, y, buttons: 0 }
          },

          async evaluate(expression: string) {
            const response = await client.send('Runtime.evaluate', {
              expression,
              returnByValue: true,
            }) as { result?: { value?: unknown } }
            return response.result?.value
          },

          async close() {
            try {
              await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`, {
                method: 'PUT',
                signal: AbortSignal.timeout(2_000),
              })
            } catch {}
            await client.close()
          },
        }
      },

      async close() {
        chrome.kill()
        try {
          await chrome.exited
        } catch {}
        await rm(userDataDir, { recursive: true, force: true })
      },
    }
  } catch (error) {
    chrome.kill()
    try {
      await chrome.exited
    } catch {}
    await rm(userDataDir, { recursive: true, force: true })
    throw error
  }
}

async function waitForDevToolsPort(userDataDir: string) {
  const filePath = join(userDataDir, 'DevToolsActivePort')
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    try {
      const raw = await readFile(filePath, 'utf8')
      const [portLine] = raw.trim().split('\n')
      const port = Number(portLine)
      if (Number.isFinite(port)) return { port }
    } catch {}
    await Bun.sleep(25)
  }

  throw new Error(`Chrome did not expose DevToolsActivePort in ${userDataDir}`)
}

async function connectCdp(webSocketDebuggerUrl: string) {
  const socket = new WebSocket(webSocketDebuggerUrl)
  const pending = new Map<number, {
    resolve(value: unknown): void
    reject(error: unknown): void
  }>()
  let nextId = 1

  await new Promise<void>((resolvePromise, rejectPromise) => {
    const onOpen = () => {
      socket.removeEventListener('error', onError)
      resolvePromise()
    }
    const onError = (event: Event) => {
      socket.removeEventListener('open', onOpen)
      rejectPromise(new Error(`Could not connect to Chrome DevTools: ${event.type}`))
    }
    socket.addEventListener('open', onOpen, { once: true })
    socket.addEventListener('error', onError, { once: true })
  })

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data)) as {
      id?: number
      result?: unknown
      error?: { message?: string }
    }
    if (message.id == null) return
    const entry = pending.get(message.id)
    if (entry == null) return
    pending.delete(message.id)
    if (message.error != null) {
      entry.reject(new Error(message.error.message ?? 'Chrome DevTools returned an error'))
      return
    }
    entry.resolve(message.result)
  })

  socket.addEventListener('close', () => {
    for (const entry of pending.values()) {
      entry.reject(new Error('Chrome DevTools socket closed'))
    }
    pending.clear()
  })

  return {
    send(method: string, params?: Record<string, unknown>) {
      const id = nextId++
      socket.send(JSON.stringify({ id, method, params }))
      return new Promise<unknown>((resolve, reject) => {
        pending.set(id, { resolve, reject })
      })
    },

    async close() {
      socket.close()
      await Bun.sleep(10)
    },
  }
}

async function waitForReport(
  page: {
    evaluate(expression: string): Promise<unknown>
  },
  requestId: string,
  predicate: (report: BrowserReport) => boolean,
  description: string,
) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const report = await readCurrentReport(page)
    if (report != null && report.requestId === requestId) {
      if (report.status === 'error' || report.phase === 'error') {
        throw new Error(`Page reported an error while waiting for ${description}: ${JSON.stringify(report)}`)
      }
      if (predicate(report)) return report
    }
    await Bun.sleep(25)
  }

  throw new Error(`Timed out waiting for ${description}`)
}

async function readCurrentReport(page: {
  evaluate(expression: string): Promise<unknown>
}) {
  const hashValue = await page.evaluate('location.hash')
  if (typeof hashValue !== 'string' || !hashValue.startsWith('#report=')) return null
  const encoded = hashValue.slice('#report='.length)
  try {
    return JSON.parse(decodeURIComponent(encoded)) as BrowserReport
  } catch {
    return null
  }
}

async function withChromeLock<T>(run: () => Promise<T>) {
  const startedAt = Date.now()
  while (true) {
    try {
      const handle = await open(chromeLockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600)
      try {
        await writeFile(handle, JSON.stringify({ pid: process.pid, startedAt }))
        return await run()
      } finally {
        await handle.close()
        await unlink(chromeLockPath).catch(() => {})
      }
    } catch {
      const stale = await readStaleChromeLock()
      if (!stale) {
        await unlink(chromeLockPath).catch(() => {})
        continue
      }
      await Bun.sleep(50)
    }
  }
}

async function readStaleChromeLock() {
  try {
    const raw = await readFile(chromeLockPath, 'utf8')
    const lock = JSON.parse(raw) as { pid?: number }
    if (typeof lock.pid === 'number' && process.kill(lock.pid, 0)) {
      return lock
    }
    return null
  } catch {
    return null
  }
}
