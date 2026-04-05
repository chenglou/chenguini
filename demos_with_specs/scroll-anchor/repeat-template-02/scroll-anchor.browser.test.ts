import {afterAll, beforeAll, expect, test} from 'bun:test'

import {TARGET_SCROLL_TOP} from './scroll-anchor-core'

const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const loopbackHosts = ['127.0.0.1', 'localhost', '[::1]']
const serverPort = 4317

let serverProcess: Bun.Subprocess | null = null
let baseUrl = ''

beforeAll(async () => {
  serverProcess = Bun.spawn({
    cmd: ['bun', '--port', String(serverPort), '--no-hmr', './index.html'],
    cwd: import.meta.dir,
    stdout: 'ignore',
    stderr: 'pipe',
  })

  baseUrl = await pickWorkingBaseUrl(serverPort)
})

afterAll(async () => {
  serverProcess?.kill()
  await serverProcess?.exited
})

test(
  'browser-backed scenarios keep the reference-line item stable and repick anchor after user scroll',
  async () => {
    const scrollThenAdd = await runScenario('scroll-to-700-add-3-above')
    expect(scrollThenAdd.referenceItemBefore).toBe('V9')
    expect(scrollThenAdd.referenceItemAfter).toBe('V9')
    expect(scrollThenAdd.pickedAnchorId).toBe('V7')
    expect(scrollThenAdd.scrollTopBefore).toBe(TARGET_SCROLL_TOP)
    expect(scrollThenAdd.mountedItemCount).toBeLessThan(scrollThenAdd.itemCount)

    const rapid = await runScenario('add-1-then-2-rapid')
    expect(rapid.referenceItemBefore).toBe('V9')
    expect(rapid.referenceItemAfter).toBe('V9')
    expect(rapid.pickedAnchorId).toBe('V7')
    expect(rapid.itemCount).toBe(20)

    const userScroll = await runScenario('user-scroll-then-prepend')
    expect(userScroll.pickedAnchorId).toBe('V10')
    expect(userScroll.referenceItemBefore).toBe('V12')
    expect(userScroll.referenceItemAfter).toBe('V12')
  },
  30_000,
)

async function runScenario(scenario: string) {
  const requestId = crypto.randomUUID()
  const chromeDebugPort = 9300 + Math.floor(Math.random() * 200)
  const userDataDir = await mkTempDir('chrome-profile-')
  const chrome = Bun.spawn({
    cmd: [
      chromePath,
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--remote-debugging-port=' + chromeDebugPort,
      '--window-size=980,960',
      '--user-data-dir=' + userDataDir,
      'about:blank',
    ],
    stdout: 'ignore',
    stderr: 'pipe',
  })

  try {
    const browser = await connectToBrowser(chromeDebugPort)
    try {
      const target = await browser.createTarget(
        `${baseUrl}?scenario=${encodeURIComponent(scenario)}&requestId=${encodeURIComponent(requestId)}`,
      )
      try {
        return await waitForReadyReport(target, requestId)
      } finally {
        await target.close()
      }
    } finally {
      await browser.close()
    }
  } finally {
    chrome.kill()
    await chrome.exited
    await Bun.$`rm -rf ${userDataDir}`.quiet()
  }
}

async function pickWorkingBaseUrl(port: number) {
  for (const host of loopbackHosts) {
    const url = `http://${host}:${port}/`
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        const response = await fetch(url)
        if (response.ok) return url
      } catch {}
      await Bun.sleep(100)
    }
  }

  const stderr = serverProcess?.stderr ? await new Response(serverProcess.stderr).text() : ''
  throw new Error(`Server did not respond on loopback. Stderr:\n${stderr}`)
}

async function connectToBrowser(port: number) {
  const versionUrl = `http://127.0.0.1:${port}/json/version`
  let webSocketDebuggerUrl: string | undefined

  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const response = await fetch(versionUrl)
      if (response.ok) {
        const json = await response.json() as {webSocketDebuggerUrl?: string}
        webSocketDebuggerUrl = json.webSocketDebuggerUrl
        if (webSocketDebuggerUrl != null) break
      }
    } catch {}
    await Bun.sleep(100)
  }

  if (webSocketDebuggerUrl == null) throw new Error(`Chrome did not expose CDP on ${versionUrl}`)
  return await createBrowserConnection(webSocketDebuggerUrl)
}

async function createBrowserConnection(url: string) {
  const socket = new WebSocket(url)
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), {once: true})
    socket.addEventListener('error', event => reject(event), {once: true})
  })

  let nextId = 1
  const pending = new Map<number, {resolve: (value: any) => void; reject: (error: unknown) => void}>()

  socket.addEventListener('message', event => {
    const payload = JSON.parse(String(event.data)) as {
      id?: number
      result?: any
      error?: {message: string}
    }

    if (payload.id == null) return
    const waiter = pending.get(payload.id)
    if (waiter == null) return
    pending.delete(payload.id)

    if (payload.error != null) waiter.reject(new Error(payload.error.message))
    else waiter.resolve(payload.result)
  })

  function send<T>(method: string, params: Record<string, unknown> = {}) {
    const id = nextId++
    socket.send(JSON.stringify({id, method, params}))
    return new Promise<T>((resolve, reject) => {
      pending.set(id, {resolve, reject})
    })
  }

  return {
    async createTarget(url: string) {
      const created = await send<{targetId: string}>('Target.createTarget', {url})
      const attached = await send<{sessionId: string}>('Target.attachToTarget', {
        targetId: created.targetId,
        flatten: true,
      })

      const sessionId = attached.sessionId

      function sessionSend<T>(method: string, params: Record<string, unknown> = {}) {
        const id = nextId++
        socket.send(JSON.stringify({id, method, params, sessionId}))
        return new Promise<T>((resolve, reject) => {
          pending.set(id, {resolve, reject})
        })
      }

      return {
        async evaluate(expression: string) {
          const result = await sessionSend<{result: {value?: unknown}}>('Runtime.evaluate', {
            expression,
            returnByValue: true,
          })
          return result.result.value
        },
        async close() {
          await send('Target.closeTarget', {targetId: created.targetId})
        },
      }
    },
    async close() {
      socket.close()
      await new Promise<void>(resolve => {
        if (socket.readyState === WebSocket.CLOSED) resolve()
        else socket.addEventListener('close', () => resolve(), {once: true})
      })
    },
  }
}

async function waitForReadyReport(
  target: {evaluate(expression: string): Promise<unknown>},
  requestId: string,
) {
  for (let attempt = 0; attempt < 300; attempt++) {
    const value = await target.evaluate('location.hash')
    if (typeof value === 'string' && value.startsWith('#report=')) {
      const report = JSON.parse(decodeURIComponent(value.slice('#report='.length))) as {
        phase: string
        requestId: string
        message?: string
      } & Record<string, unknown>

      if (report.requestId === requestId) {
        if (report.phase === 'ready') return report
        if (report.phase === 'error') throw new Error(String(report.message ?? 'Scenario failed'))
      }
    }
    await Bun.sleep(100)
  }

  throw new Error(`Timed out waiting for ready report for requestId ${requestId}`)
}

async function mkTempDir(prefix: string) {
  const parent = await Bun.$`mktemp -d /tmp/${prefix}XXXXXX`.text()
  return parent.trim()
}
