import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { spawn, type ChildProcess } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const roundDir = "/Users/chenglou/github/vibescript/demos_with_specs/draggable-cards/round-09"
const htmlPath = `${roundDir}/index.html`
const serverPort = 34809
const cdpTimeoutMs = 30_000

type ScenarioReport = {
  phase: "loading" | "running" | "ready" | "error"
  requestId: string
  scenario: string
  status?: "ok" | "error"
  message?: string
  orderedIds?: string[]
  draggedId?: string | null
  lastDraggedId?: string | null
  swapHappened?: boolean
  highestZId?: string | null
  settleSample?: {
    draggedId: string | null
    lastDraggedId: string | null
    highestZId: string | null
    releasedId: string
  }
}

type CdpReply = {
  id?: number
  result?: unknown
  error?: { message?: string }
}

let serverProcess: ChildProcess | null = null
let browserProcess: ChildProcess | null = null
let browserDataDir = ""
let browserApiBaseUrl = ""
let baseUrl = ""

beforeAll(async () => {
  serverProcess = spawn("bun", ["--port", String(serverPort), "--no-hmr", htmlPath], {
    cwd: roundDir,
    stdio: "pipe",
  })

  baseUrl = await waitForPageServer(serverPort)
  const browserExecutable = findBrowserExecutable()

  browserDataDir = mkdtempSync(join(tmpdir(), "round-09-browser-"))
  browserProcess = spawn(
    browserExecutable,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--remote-debugging-port=0",
      `--user-data-dir=${browserDataDir}`,
      "about:blank",
    ],
    {
      cwd: roundDir,
      stdio: "pipe",
    },
  )

  browserApiBaseUrl = await waitForCdpBaseUrl(browserDataDir)
}, cdpTimeoutMs)

afterAll(() => {
  browserProcess?.kill("SIGKILL")
  serverProcess?.kill("SIGKILL")
  if (browserDataDir) {
    rmSync(browserDataDir, { recursive: true, force: true })
  }
})

describe("browser semantics", () => {
  test(
    "scripted drag reorders the cards before release",
    async () => {
      const report = await runScenario("swap-down")

      expect(report.status).toBe("ok")
      expect(report.swapHappened).toBe(true)
      expect(report.orderedIds).toEqual(["1", "0", "2", "3", "4"])
      expect(report.draggedId).toBe(null)
    },
    cdpTimeoutMs,
  )

  test(
    "released card stays above the stack while settling",
    async () => {
      const report = await runScenario("release-depth")

      expect(report.status).toBe("ok")
      expect(report.settleSample).toEqual({
        draggedId: null,
        lastDraggedId: "0",
        highestZId: "0",
        releasedId: "0",
      })
      expect(report.lastDraggedId).toBe(null)
    },
    cdpTimeoutMs,
  )
})

async function runScenario(scenario: string) {
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const pageUrl = `${baseUrl}/?report=1&scenario=${encodeURIComponent(scenario)}&requestId=${encodeURIComponent(requestId)}`
  const target = await createTarget(pageUrl)
  const cdp = new CdpSession(target.webSocketDebuggerUrl)

  try {
    await cdp.send("Runtime.enable")
    const deadline = Date.now() + cdpTimeoutMs

    for (;;) {
      if (Date.now() > deadline) {
        throw new Error(`Timed out waiting for scenario ${scenario}`)
      }

      const report = await readScenarioReport(cdp)
      if (report?.requestId !== requestId) {
        await Bun.sleep(50)
        continue
      }
      if (report.phase === "error") {
        throw new Error(report.message ?? `Scenario ${scenario} failed`)
      }
      if (report.phase === "ready") {
        return report
      }

      await Bun.sleep(50)
    }
  } finally {
    await cdp.close()
    await closeTarget(target.id)
  }
}

async function readScenarioReport(cdp: CdpSession) {
  const response = await cdp.send("Runtime.evaluate", {
    expression: "location.hash",
    returnByValue: true,
  })
  const hash = getNestedString(response, ["result", "value"])
  if (!hash || !hash.startsWith("#report=")) return null

  return JSON.parse(decodeURIComponent(hash.slice("#report=".length))) as ScenarioReport
}

function getNestedString(value: unknown, path: string[]) {
  let current = value as Record<string, unknown> | undefined
  for (const key of path) {
    if (current == null || typeof current !== "object") return null
    current = current[key] as Record<string, unknown> | undefined
  }
  return typeof current === "string" ? current : null
}

async function waitForPageServer(port: number) {
  const hosts = ["127.0.0.1", "localhost", "[::1]"]
  const deadline = Date.now() + 10_000

  while (Date.now() < deadline) {
    for (const host of hosts) {
      const url = `http://${host}:${port}`
      try {
        const response = await fetch(url, { redirect: "manual" })
        if (response.ok || response.status === 404) {
          return url
        }
      } catch {
        // Try the next loopback host.
      }
    }
    await Bun.sleep(50)
  }

  throw new Error("Timed out waiting for Bun page server")
}

function findBrowserExecutable() {
  const candidates = [
    process.env.BROWSER_BIN,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ]

  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      return candidate
    }
  }

  throw new Error("No supported browser executable found")
}

async function waitForCdpBaseUrl(userDataDir: string) {
  const activePortPath = join(userDataDir, "DevToolsActivePort")
  const deadline = Date.now() + 10_000

  while (Date.now() < deadline) {
    if (existsSync(activePortPath)) {
      const [port] = readFileSync(activePortPath, "utf8").trim().split("\n")
      if (port) {
        return `http://127.0.0.1:${port}`
      }
    }
    await Bun.sleep(50)
  }

  throw new Error("Timed out waiting for Chrome DevTools port")
}

async function createTarget(url: string) {
  const response = await fetch(`${browserApiBaseUrl}/json/new?${encodeURIComponent(url)}`, {
    method: "PUT",
  })
  if (!response.ok) {
    throw new Error(`Unable to open scenario target: ${response.status}`)
  }
  return (await response.json()) as { id: string; webSocketDebuggerUrl: string }
}

async function closeTarget(targetId: string) {
  await fetch(`${browserApiBaseUrl}/json/close/${targetId}`)
}

class CdpSession {
  private nextId = 1
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
  private socket: WebSocket

  constructor(url: string) {
    this.socket = new WebSocket(url)
    this.socket.addEventListener("message", (event) => {
      const reply = JSON.parse(String(event.data)) as CdpReply
      if (reply.id == null) return
      const pending = this.pending.get(reply.id)
      if (!pending) return
      this.pending.delete(reply.id)

      if (reply.error) {
        pending.reject(new Error(reply.error.message ?? "CDP error"))
        return
      }
      pending.resolve(reply.result)
    })
  }

  async send(method: string, params?: Record<string, unknown>) {
    if (this.socket.readyState === WebSocket.CONNECTING) {
      await onceOpen(this.socket)
    }

    const id = this.nextId++
    const payload = JSON.stringify({ id, method, params })

    const reply = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
    })

    this.socket.send(payload)
    return reply
  }

  async close() {
    if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) {
      this.socket.close()
    }
  }
}

function onceOpen(socket: WebSocket) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      socket.removeEventListener("open", handleOpen)
      socket.removeEventListener("error", handleError)
    }
    const handleOpen = () => {
      cleanup()
      resolve()
    }
    const handleError = () => {
      cleanup()
      reject(new Error("Unable to connect to Chrome DevTools"))
    }

    socket.addEventListener("open", handleOpen, { once: true })
    socket.addEventListener("error", handleError, { once: true })
  })
}
