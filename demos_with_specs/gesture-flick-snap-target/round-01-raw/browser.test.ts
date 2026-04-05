import { expect, test } from "bun:test"

import { mkdtemp, rm } from "node:fs/promises"
import net from "node:net"
import path from "node:path"
import { tmpdir } from "node:os"
import { setTimeout as delay } from "node:timers/promises"

const ROOT_DIR = import.meta.dir
const CHROME_BIN =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

const PIP_WIDTH = 120
const PIP_HEIGHT = 80
const CORNER_PAD = 20

type Point = { x: number; y: number }

type Report = {
  phase: "loading" | "running" | "ready" | "error"
  requestId: string
  scenario: string
  viewport?: { width: number; height: number }
  releaseKind?: string
  chosenCorner?: string
  finalPipPosition?: Point
  restPoint?: Point | null
  restMarkerCenter?: Point | null
  maxPointerAlignmentError?: number
  message?: string
}

function expectPointClose(
  actual: Point | null | undefined,
  expected: Point,
  tolerance: number,
) {
  expect(actual).not.toBeNull()
  expect(actual).toBeDefined()
  expect(Math.abs(actual!.x - expected.x)).toBeLessThanOrEqual(tolerance)
  expect(Math.abs(actual!.y - expected.y)).toBeLessThanOrEqual(tolerance)
}

function createReportUrl(baseUrl: string, scenario: string, requestId: string) {
  const params = new URLSearchParams({ scenario, requestId })
  return `${baseUrl}/index.html?${params.toString()}`
}

async function pickLoopbackBaseUrl(port: number) {
  const candidates = [
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
    `http://[::1]:${port}`,
  ]

  for (const candidate of candidates) {
    try {
      const response = await fetch(`${candidate}/healthz`)
      if (response.ok) {
        return candidate
      }
    } catch {}
  }

  throw new Error(`No loopback host responded for port ${port}`)
}

async function waitFor<T>(
  label: string,
  timeoutMs: number,
  read: () => Promise<T | null>,
) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const value = await read()
    if (value != null) {
      return value
    }
    await delay(50)
  }

  throw new Error(`Timed out waiting for ${label}`)
}

async function waitForJson(url: string, timeoutMs: number) {
  return waitFor(`JSON at ${url}`, timeoutMs, async () => {
    try {
      const response = await fetch(url)
      if (!response.ok) {
        return null
      }
      return (await response.json()) as unknown
    } catch {
      return null
    }
  })
}

async function getFreePort() {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer()
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      if (address == null || typeof address === "string") {
        reject(new Error("Missing temporary port"))
        return
      }
      const { port } = address
      server.close((error) => {
        if (error != null) {
          reject(error)
          return
        }
        resolve(port)
      })
    })
    server.on("error", reject)
  })
}

class CdpClient {
  ws: WebSocket
  nextId = 1
  pending = new Map<
    number,
    {
      resolve: (value: unknown) => void
      reject: (error: unknown) => void
    }
  >()

  constructor(ws: WebSocket) {
    this.ws = ws
    this.ws.addEventListener("message", (event) => {
      const data = JSON.parse(String(event.data))
      if (typeof data.id !== "number") {
        return
      }
      const pending = this.pending.get(data.id)
      if (pending == null) {
        return
      }
      this.pending.delete(data.id)
      if (data.error != null) {
        pending.reject(new Error(data.error.message ?? "CDP error"))
        return
      }
      pending.resolve(data.result)
    })
  }

  static async connect(wsUrl: string) {
    const ws = new WebSocket(wsUrl)
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener("open", () => resolve(), { once: true })
      ws.addEventListener("error", (event) => reject(event), { once: true })
    })
    return new CdpClient(ws)
  }

  async send(method: string, params: Record<string, unknown> = {}) {
    const id = this.nextId++
    const promise = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
    })
    this.ws.send(JSON.stringify({ id, method, params }))
    return promise
  }

  async evaluate(expression: string) {
    const result = (await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
    })) as {
      result?: { value?: unknown }
    }

    return result.result?.value
  }

  close() {
    for (const pending of this.pending.values()) {
      pending.reject(new Error("CDP connection closed"))
    }
    this.pending.clear()
    this.ws.close()
  }
}

async function readChromeDebugTarget(debugPort: number, requestId: string) {
  return waitFor(`Chrome target for ${requestId}`, 10_000, async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`)
      if (!response.ok) {
        return null
      }
      const targets = (await response.json()) as Array<{
        url: string
        webSocketDebuggerUrl?: string
      }>
      const matchingTarget = targets.find((entry) => entry.url.includes(requestId))
      return matchingTarget?.webSocketDebuggerUrl ?? null
    } catch {
      return null
    }
  })
}

async function waitForMatchingReadyReport(client: CdpClient, requestId: string) {
  return waitFor(`ready report for ${requestId}`, 20_000, async () => {
    const value = await client.evaluate("location.hash")
    if (typeof value !== "string" || value.length === 0) {
      return null
    }
    const hash = value.startsWith("#") ? value.slice(1) : value
    const params = new URLSearchParams(hash)
    const encodedReport = params.get("report")
    if (encodedReport == null) {
      return null
    }
    const report = JSON.parse(decodeURIComponent(encodedReport)) as Report
    if (report.requestId !== requestId) {
      return null
    }
    if (report.phase === "error") {
      throw new Error(report.message ?? "Scenario reported error")
    }
    if (report.phase !== "ready") {
      return null
    }
    return report
  })
}

async function runScenario(scenario: string) {
  const server = Bun.serve({
    port: 0,
    hostname: "0.0.0.0",
    async fetch(request) {
      const url = new URL(request.url)
      if (url.pathname === "/healthz") {
        return new Response("ok")
      }

      const pathname =
        url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname)
      const absolutePath = path.join(ROOT_DIR, pathname)
      const file = Bun.file(absolutePath)

      if (!(await file.exists())) {
        return new Response("Not found", { status: 404 })
      }

      return new Response(file)
    },
  })

  const baseUrl = await pickLoopbackBaseUrl(server.port)
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const url = createReportUrl(baseUrl, scenario, requestId)
  const debugPort = await getFreePort()
  const userDataDir = await mkdtemp(
    path.join(tmpdir(), "gesture-flick-snap-target-"),
  )

  const chrome = Bun.spawn({
    cmd: [
      CHROME_BIN,
      "--headless=new",
      "--disable-gpu",
      "--disable-background-networking",
      "--disable-renderer-backgrounding",
      "--hide-scrollbars",
      "--mute-audio",
      "--no-first-run",
      "--no-default-browser-check",
      "--window-size=900,700",
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${userDataDir}`,
      url,
    ],
    stdout: "ignore",
    stderr: "ignore",
  })

  try {
    const wsUrl = await readChromeDebugTarget(debugPort, requestId)
    const client = await CdpClient.connect(wsUrl)

    try {
      return await waitForMatchingReadyReport(client, requestId)
    } finally {
      client.close()
    }
  } finally {
    chrome.kill()
    await chrome.exited
    server.stop(true)
    await rm(userDataDir, { recursive: true, force: true })
  }
}

test(
  "browser-backed drag keeps the PiP under the pointer before release",
  async () => {
    const report = await runScenario("drag-under-pointer")

    expect(report.scenario).toBe("drag-under-pointer")
    expect(report.releaseKind).toBe("mouseup")
    expect(report.maxPointerAlignmentError).toBeLessThanOrEqual(1.5)
  },
  30_000,
)

test(
  "browser-backed flick toward the upper-right lands at the upper-right corner",
  async () => {
    const report = await runScenario("flick-upper-right")

    expect(report.scenario).toBe("flick-upper-right")
    expect(report.releaseKind).toBe("touchend")
    expect(report.chosenCorner).toBe("top-right")

    const expectedPosition = {
      x: report.viewport!.width - CORNER_PAD - PIP_WIDTH,
      y: CORNER_PAD,
    }
    expectPointClose(report.finalPipPosition, expectedPosition, 1.5)
  },
  30_000,
)

test(
  "browser-backed slower release toward the lower-right reports the blue rest point and lands at the lower-right corner",
  async () => {
    const report = await runScenario("release-lower-right")

    expect(report.scenario).toBe("release-lower-right")
    expect(report.releaseKind).toBe("touchcancel")
    expect(report.chosenCorner).toBe("bottom-right")
    expect(report.restPoint).not.toBeNull()
    expect(report.restMarkerCenter).not.toBeNull()

    expectPointClose(report.restMarkerCenter, report.restPoint!, 1.5)

    const expectedPosition = {
      x: report.viewport!.width - CORNER_PAD - PIP_WIDTH,
      y: report.viewport!.height - CORNER_PAD - PIP_HEIGHT,
    }
    expectPointClose(report.finalPipPosition, expectedPosition, 1.5)
  },
  30_000,
)
