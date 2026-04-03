import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { join, normalize } from "node:path";
import { chromium, type Browser, type Page } from "playwright";

type BrowserReport = {
  phase: "loading" | "running" | "ready" | "error";
  requestId: string;
  scenario: string;
  orderedCardIds?: number[];
  orderBeforeRelease?: number[];
  releasedCardId?: number | null;
  topCardIdsDuringRelease?: number[];
  stayedTopUntilSettle?: boolean;
  message?: string;
};

let server: Bun.Server | null = null;
let browser: Browser | null = null;
let baseUrl = "";

function resolvePathname(pathname: string) {
  const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
  const resolvedPath = normalize(join(import.meta.dir, relativePath));
  if (!resolvedPath.startsWith(import.meta.dir)) return null;
  return resolvedPath;
}

async function pickBaseUrl(port: number) {
  const candidates = [`http://127.0.0.1:${port}`, `http://localhost:${port}`, `http://[::1]:${port}`];

  for (const candidate of candidates) {
    try {
      const response = await fetch(`${candidate}/index.html`);
      if (response.ok) return candidate;
    } catch {}
  }

  throw new Error(`Could not reach the local server on port ${port}`);
}

async function waitForMatchingReadyReport(page: Page, requestId: string, timeoutMs = 30_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const report = await page.evaluate(() => {
      const hash = location.hash.startsWith("#") ? location.hash.slice(1) : location.hash;
      const params = new URLSearchParams(hash);
      const rawReport = params.get("report");
      if (rawReport == null) return null;

      try {
        return JSON.parse(decodeURIComponent(rawReport));
      } catch {
        return null;
      }
    });

    if (report != null && report.requestId === requestId) {
      if (report.phase === "ready") return report as BrowserReport;
      if (report.phase === "error") throw new Error(report.message ?? `Scenario ${report.scenario} failed`);
    }

    await page.waitForTimeout(25);
  }

  throw new Error(`Timed out waiting for the ${requestId} report`);
}

async function runScenario(scenario: string) {
  const requestId = crypto.randomUUID();
  const page = await browser!.newPage({ viewport: { width: 960, height: 900 } });

  try {
    await page.goto(`${baseUrl}/index.html?scenario=${scenario}&requestId=${encodeURIComponent(requestId)}`);
    return await waitForMatchingReadyReport(page, requestId);
  } finally {
    await page.close();
  }
}

beforeAll(async () => {
  server = Bun.serve({
    port: 0,
    development: false,
    async fetch(request) {
      const url = new URL(request.url);
      const filePath = resolvePathname(url.pathname);
      if (filePath == null) return new Response("Forbidden", { status: 403 });

      const file = Bun.file(filePath);
      if (!(await file.exists())) return new Response("Not found", { status: 404 });

      return new Response(file);
    },
  });

  baseUrl = await pickBaseUrl(server.port);
  browser = await chromium.launch({ headless: true });
}, 30_000);

afterAll(async () => {
  await browser?.close();
  await server?.stop(true);
});

describe("browser verification", () => {
  it(
    "reorders before release",
    async () => {
      const report = await runScenario("reorder-before-release");

      expect(report.orderBeforeRelease).toEqual([0, 2, 1, 3, 4]);
      expect(report.orderedCardIds).toEqual([0, 2, 1, 3, 4]);
    },
    30_000,
  );

  it(
    "keeps the released card on top until settle",
    async () => {
      const report = await runScenario("top-until-settle");

      expect(report.releasedCardId).toBe(2);
      expect(report.stayedTopUntilSettle).toBe(true);
      expect(report.topCardIdsDuringRelease).toEqual([2]);
    },
    30_000,
  );
});
