import { afterAll, beforeAll, expect, test } from "bun:test"
import { createServer } from "node:net"

import { chromium, type Browser, type Page } from "playwright"

const roundDir = "/Users/chenglou/github/vibescript/demos_with_specs/draggable-cards/round-11-compressed"
const timeoutBudgetMs = 30_000

type ScenarioReport = {
  phase: "booting" | "running" | "ready" | "error"
  requestId: string
  scenario: string
  semanticResult?: Record<string, unknown>
  error?: string
}

let baseUrl = ""
let serverProcess: Bun.Subprocess | null = null

beforeAll(async () => {
  const port = await findOpenPort()
  baseUrl = `http://localhost:${port}`

  serverProcess = Bun.spawn({
    cmd: [process.execPath, "--port", String(port), `${roundDir}/index.html`],
    cwd: roundDir,
    stdout: "ignore",
    stderr: "pipe",
  })

  await waitForServer(baseUrl)
}, timeoutBudgetMs)

afterAll(async () => {
  serverProcess?.kill("SIGKILL")
  await Promise.race([serverProcess?.exited ?? Promise.resolve(0), Bun.sleep(250)])
})

test(
  "page-owned scenarios report reorder and release-depth semantics",
  async () => {
    const browser = await chromium.launch()

    try {
      const reorderReport = await runScenario(browser, "reorder-before-release")

      expect(reorderReport.semanticResult?.orderedCardIdsBeforeRelease).toEqual([
        "1",
        "0",
        "2",
        "3",
        "4",
      ])
      expect(reorderReport.semanticResult?.finalOrderedCardIds).toEqual(["1", "0", "2", "3", "4"])

      const releaseDepthReport = await runScenario(browser, "release-depth")

      expect(releaseDepthReport.semanticResult?.releasedCardId).toBe("1")
      expect(releaseDepthReport.semanticResult?.topItemIdsWhileSettling).toEqual([
        "1",
        "1",
        "1",
      ])
      expect(releaseDepthReport.semanticResult?.settled).toBe(true)
    } finally {
      await browser.close()
    }
  },
  timeoutBudgetMs,
)

async function runScenario(browser: Browser, scenario: string): Promise<ScenarioReport> {
  const requestId = `${scenario}-${Date.now()}`
  const page = await browser.newPage({
    viewport: {
      width: 1200,
      height: 1000,
    },
  })

  try {
    await page.goto(`${baseUrl}/?scenario=${scenario}&requestId=${requestId}`)
    return await waitForReadyReport(page, requestId)
  } finally {
    await page.close()
  }
}

async function waitForReadyReport(page: Page, requestId: string): Promise<ScenarioReport> {
  const startedAt = Date.now()

  while (Date.now() - startedAt <= timeoutBudgetMs) {
    const hash = await page.evaluate(() => window.location.hash)
    const report = parseScenarioReport(hash)

    if (report?.requestId === requestId) {
      if (report.phase === "error") {
        throw new Error(report.error ?? `Scenario ${report.scenario} failed`)
      }

      if (report.phase === "ready") {
        return report
      }
    }

    await page.waitForTimeout(50)
  }

  throw new Error(`Timed out waiting for scenario ${requestId}`)
}

function parseScenarioReport(hash: string): ScenarioReport | null {
  if (hash.length <= 1) {
    return null
  }

  try {
    return JSON.parse(decodeURIComponent(hash.slice(1))) as ScenarioReport
  } catch {
    return null
  }
}

async function waitForServer(url: string): Promise<void> {
  const startedAt = Date.now()

  while (Date.now() - startedAt <= timeoutBudgetMs) {
    try {
      const response = await fetch(url)

      if (response.ok) {
        return
      }
    } catch {}

    if (serverProcess && (await Promise.race([serverProcess.exited.then(() => true), Bun.sleep(10).then(() => false)]))) {
      const errorText = serverProcess.stderr ? await new Response(serverProcess.stderr).text() : ""
      throw new Error(`Server exited before becoming ready:\n${errorText}`)
    }

    await Bun.sleep(50)
  }

  throw new Error(`Timed out waiting for ${url}`)
}

async function findOpenPort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = createServer()

    server.on("error", reject)
    server.listen(0, "localhost", () => {
      const address = server.address()

      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Could not determine an open port")))
        return
      }

      const { port } = address
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }

        resolve(port)
      })
    })
  })
}
