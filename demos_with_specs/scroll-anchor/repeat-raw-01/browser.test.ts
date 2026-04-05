import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

const CHROME_PATH =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const DEMO_DIR =
  "/Users/chenglou/github/vibescript/demos_with_specs/scroll-anchor/repeat-raw-01";

type ReportPhase = "loading" | "running" | "ready" | "error";

type ScenarioReport = {
  phase: ReportPhase;
  requestId: string;
  scenario: string;
  beforeReferenceItemId?: string | null;
  afterReferenceItemId?: string | null;
  beforeAnchorId?: string | null;
  afterAnchorId?: string | null;
  beforeScrollTop?: number;
  afterScrollTop?: number;
  beforeItemCount?: number;
  afterItemCount?: number;
  message?: string;
};

type StaticServerHandle = {
  baseUrl: string;
  stop: () => Promise<void>;
};

let serverHandle: StaticServerHandle;

beforeAll(async () => {
  serverHandle = await startStaticServer();
});

afterAll(async () => {
  await serverHandle.stop();
});

describe("browser-backed scroll anchoring", () => {
  test("scroll-to-700 then add-3-above keeps the same item at the reference line", async () => {
    const report = await runScenario("scroll-to-700-add-3-above");

    expect(report.beforeReferenceItemId).toBe("V8");
    expect(report.afterReferenceItemId).toBe("V8");
    expect(report.beforeAnchorId).toBe("V7");
    expect(report.afterAnchorId).toBe("V7");
    expect(report.beforeItemCount).toBe(17);
    expect(report.afterItemCount).toBe(20);
  }, 20000);

  test("add-1 then 2 rapid keeps the same item at the reference line", async () => {
    const report = await runScenario("add-1-then-2-rapid");

    expect(report.beforeReferenceItemId).toBe("V8");
    expect(report.afterReferenceItemId).toBe("V8");
    expect(report.beforeAnchorId).toBe("V7");
    expect(report.afterAnchorId).toBe("V7");
    expect(report.beforeItemCount).toBe(17);
    expect(report.afterItemCount).toBe(20);
  }, 20000);

  test("user-scroll then prepend picks a new anchor from the new scroll position", async () => {
    const report = await runScenario("user-scroll-then-prepend");

    expect(report.beforeReferenceItemId).toBe("V10");
    expect(report.afterReferenceItemId).toBe("V10");
    expect(report.beforeAnchorId).toBe("V9");
    expect(report.afterAnchorId).toBe("V9");
    expect(report.beforeScrollTop).toBe(952);
    expect(report.afterScrollTop).toBe(1276);
  }, 20000);
});

async function runScenario(scenario: string): Promise<ScenarioReport> {
  await assertFileExists(join(DEMO_DIR, "index.html"));

  const requestId = randomUUID();
  const url = `${serverHandle.baseUrl}/?scenario=${encodeURIComponent(scenario)}&requestId=${encodeURIComponent(requestId)}`;
  const browser = await launchChrome(url);

  try {
    return await browser.waitForReport(requestId);
  } finally {
    await browser.close();
  }
}

async function startStaticServer(): Promise<StaticServerHandle> {
  const server = Bun.serve({
    hostname: "0.0.0.0",
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);

      if (url.pathname === "/__health") {
        return new Response("ok");
      }

      const relativePath = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      const filePath = join(DEMO_DIR, relativePath);

      if (!(await fileExists(filePath))) {
        return new Response("Not found", { status: 404 });
      }

      return new Response(Bun.file(filePath), {
        headers: {
          "content-type": contentTypeForPath(filePath),
          "cache-control": "no-store",
        },
      });
    },
  });

  const baseUrl = await pickLoopbackBaseUrl(server.port);

  return {
    baseUrl,
    stop: async () => {
      await server.stop(true);
    },
  };
}

async function pickLoopbackBaseUrl(port: number): Promise<string> {
  const origins = [
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
    `http://[::1]:${port}`,
  ];

  for (const origin of origins) {
    try {
      const response = await fetch(`${origin}/__health`);
      if (response.ok) {
        return origin;
      }
    } catch {
      continue;
    }
  }

  throw new Error(`No loopback host responded on port ${port}`);
}

async function launchChrome(url: string) {
  await assertFileExists(CHROME_PATH);

  const userDataDir = await mkdtemp(join(tmpdir(), "scroll-anchor-chrome-"));
  const process = Bun.spawn(
    [
      CHROME_PATH,
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      `--user-data-dir=${userDataDir}`,
      "--remote-debugging-port=0",
      url,
    ],
    {
      stdout: "ignore",
      stderr: "pipe",
    },
  );

  try {
    const devtoolsFile = join(userDataDir, "DevToolsActivePort");
    const browserPort = await waitForDebugPort(devtoolsFile);
    const versionResponse = await fetch(`http://127.0.0.1:${browserPort}/json/version`);
    const versionJson = (await versionResponse.json()) as {
      webSocketDebuggerUrl: string;
    };
    const client = await createCdpClient(versionJson.webSocketDebuggerUrl);
    const { targetId } = await client.send("Target.createTarget", { url });
    const { sessionId } = await client.send("Target.attachToTarget", {
      targetId,
      flatten: true,
    });

    return {
      async waitForReport(requestId: string): Promise<ScenarioReport> {
        const startedAt = Date.now();
        while (Date.now() - startedAt < 15000) {
          const evaluation = await client.send(
            "Runtime.evaluate",
            { expression: "location.hash", returnByValue: true },
            sessionId,
          );
          const hash = evaluation.result.value as string;
          const report = readHashReport(hash);

          if (report && report.requestId === requestId) {
            if (report.phase === "ready") {
              return report;
            }
            if (report.phase === "error") {
              throw new Error(report.message ?? `Scenario ${report.scenario} failed`);
            }
          }

          await Bun.sleep(100);
        }

        throw new Error(`Timed out waiting for report for ${requestId}`);
      },
      async close() {
        try {
          await client.close();
        } finally {
          process.kill();
          await process.exited;
          await rm(userDataDir, { recursive: true, force: true });
        }
      },
    };
  } catch (error) {
    process.kill();
    await process.exited;
    await rm(userDataDir, { recursive: true, force: true });
    throw error;
  }
}

function readHashReport(hash: string): ScenarioReport | null {
  if (!hash.startsWith("#report=")) {
    return null;
  }

  const encodedReport = hash.slice("#report=".length);
  return JSON.parse(decodeURIComponent(encodedReport)) as ScenarioReport;
}

async function waitForDebugPort(devtoolsFile: string): Promise<string> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10000) {
    try {
      const contents = await readFile(devtoolsFile, "utf8");
      const [port] = contents.trim().split("\n");
      if (port) {
        return port;
      }
    } catch {
      // Chrome creates this file shortly after launch.
    }

    await Bun.sleep(50);
  }

  throw new Error("Timed out waiting for Chrome remote debugging port");
}

async function createCdpClient(webSocketUrl: string) {
  const socket = new WebSocket(webSocketUrl);
  const pending = new Map<
    number,
    {
      resolve: (value: any) => void;
      reject: (error: unknown) => void;
    }
  >();
  let nextId = 1;

  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener("error", (event) => reject(event.error), { once: true });
  });

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data)) as {
      id?: number;
      result?: any;
      error?: { message?: string };
    };

    if (typeof message.id !== "number") {
      return;
    }

    const request = pending.get(message.id);
    if (!request) {
      return;
    }
    pending.delete(message.id);

    if (message.error) {
      request.reject(new Error(message.error.message ?? "CDP request failed"));
      return;
    }

    request.resolve(message.result ?? {});
  });

  return {
    send(method: string, params?: Record<string, unknown>, sessionId?: string) {
      const id = nextId++;
      const payload = sessionId
        ? { id, method, params, sessionId }
        : { id, method, params };

      socket.send(JSON.stringify(payload));

      return new Promise<any>((resolve, reject) => {
        pending.set(id, { resolve, reject });
      });
    },
    async close() {
      socket.close();
      await Bun.sleep(25);
    },
  };
}

async function assertFileExists(path: string) {
  if (!(await fileExists(path))) {
    throw new Error(`Expected file at ${path}`);
  }
}

async function fileExists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function contentTypeForPath(path: string) {
  if (path.endsWith(".html")) {
    return "text/html; charset=utf-8";
  }
  if (path.endsWith(".js")) {
    return "text/javascript; charset=utf-8";
  }
  if (path.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }
  if (path.endsWith(".json")) {
    return "application/json; charset=utf-8";
  }
  return "text/plain; charset=utf-8";
}
