import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { once } from "node:events"
import { createServer } from "node:net"

import { chromium, type Browser } from "playwright"

type Report = {
  phase: "loading" | "running" | "ready" | "error"
  requestId: string
  scenario: string
  orderedCardIds?: string[]
  orderBeforeRelease?: string[]
  lastDraggedId?: string | null
  settleTopCardIds?: string[]
  message?: string
}

const roundDir = "/Users/chenglou/github/vibescript/demos_with_specs/draggable-cards/round-11-raw"
const indexHtmlPath = `${roundDir}/index.html`

let browser: Browser
let serverProcess: ChildProcessWithoutNullStreams
let baseUrl = ""
let serverOutput = ""

beforeAll(async () => {
  const port = await getFreePort()

  serverProcess = spawn("bun", ["--port", String(port), "--no-hmr", indexHtmlPath], {
    cwd: "/Users/chenglou/github/vibescript",
    stdio: ["ignore", "pipe", "pipe"],
  })

  serverProcess.stdout.on("data", (chunk) => {
    serverOutput += chunk.toString()
  })
  serverProcess.stderr.on("data", (chunk) => {
    serverOutput += chunk.toString()
  })

  baseUrl = await waitForServerBaseUrl(port)
  browser = await chromium.launch({ headless: true })
}, 30_000)

afterAll(async () => {
  if (browser !== undefined) {
    await browser.close()
  }
  if (serverProcess !== undefined) {
    serverProcess.kill("SIGTERM")
    await once(serverProcess, "exit")
  }
}, 10_000)

describe("browser-backed reports", () => {
  test(
    "scripted drag reorders before release and lands on the expected final order",
    async () => {
      const report = await runScenario("scripted-drag")

      expect(report.lastDraggedId).toBe("card-0")
      expect(report.orderBeforeRelease).toEqual([
        "card-1",
        "card-2",
        "card-0",
        "card-3",
        "card-4",
      ])
      expect(report.orderedCardIds).toEqual([
        "card-1",
        "card-2",
        "card-0",
        "card-3",
        "card-4",
      ])
    },
    30_000,
  )

  test(
    "release-depth scenario keeps the released card on top while settling",
    async () => {
      const report = await runScenario("release-depth")

      expect(report.lastDraggedId).toBe("card-1")
      expect(report.settleTopCardIds && report.settleTopCardIds.length).toBeGreaterThan(0)
      expect(new Set(report.settleTopCardIds)).toEqual(new Set(["card-1"]))
    },
    30_000,
  )
})

async function runScenario(scenario: string): Promise<Report> {
  const requestId = crypto.randomUUID()
  const page = await browser.newPage()

  try {
    await page.goto(
      `${baseUrl}?scenario=${encodeURIComponent(scenario)}&requestId=${encodeURIComponent(requestId)}`,
      { waitUntil: "load" },
    )

    return await waitForMatchingReadyReport(page, requestId)
  } finally {
    await page.close()
  }
}

async function waitForMatchingReadyReport(
  page: Awaited<ReturnType<Browser["newPage"]>>,
  requestId: string,
): Promise<Report> {
  const deadlineMs = Date.now() + 20_000

  for (;;) {
    if (Date.now() > deadlineMs) {
      throw new Error(`Timed out waiting for report ${requestId}\n${serverOutput}`)
    }

    const rawHash = await page.evaluate(() => location.hash)

    if (rawHash.startsWith("#report=")) {
      const report = JSON.parse(decodeURIComponent(rawHash.slice("#report=".length))) as Report

      if (report.requestId === requestId) {
        if (report.phase === "ready") {
          return report
        }
        if (report.phase === "error") {
          throw new Error(report.message ?? `Scenario ${report.scenario} failed`)
        }
      }
    }

    await page.waitForTimeout(25)
  }
}

async function waitForServerBaseUrl(port: number): Promise<string> {
  const hosts = ["127.0.0.1", "localhost", "[::1]"]
  const deadlineMs = Date.now() + 15_000

  for (;;) {
    for (const host of hosts) {
      try {
        const response = await fetch(`http://${host}:${port}/`)

        if (response.ok) {
          return `http://${host}:${port}/`
        }
      } catch {
        // Keep probing loopback hosts until one responds.
      }
    }

    if (Date.now() > deadlineMs) {
      throw new Error(`Timed out waiting for server\n${serverOutput}`)
    }

    await Bun.sleep(50)
  }
}

async function getFreePort(): Promise<number> {
  const server = createServer()

  server.listen(0, "127.0.0.1")
  await once(server, "listening")

  const address = server.address()
  if (address === null || typeof address === "string") {
    server.close()
    throw new Error("Could not resolve a free TCP port")
  }

  const { port } = address
  server.close()
  await once(server, "close")
  return port
}
