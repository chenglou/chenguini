import { join, normalize } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { createServer } from "node:net";

export type ScenarioReport = {
  phase: "loading" | "running" | "ready" | "error";
  requestId: string;
  scenario: string;
  referenceItemIdBefore?: string | null;
  referenceItemIdAfter?: string | null;
  anchorIdBeforePrepend?: string | null;
  anchorIdAfterPrepend?: string | null;
  scrollTopBefore?: number;
  scrollTopAfter?: number;
  itemCountBefore?: number;
  itemCountAfter?: number;
  mountedItemCountBefore?: number;
  mountedItemCountAfter?: number;
  message?: string;
};

type BrowserHandle = {
  debugPort: number;
  process: Bun.Subprocess<"ignore", "pipe", "pipe">;
  userDataDir: string;
  stop: () => Promise<void>;
};

type StaticServerHandle = {
  baseUrl: string;
  stop: () => void;
};

type ChromeTarget = {
  type: string;
  url: string;
  webSocketDebuggerUrl?: string;
};

const ROOT = import.meta.dir;
const REPORT_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 50;

export async function runBrowserScenario(
  scenario: string,
): Promise<ScenarioReport> {
  const server = await startStaticServer();
  const requestId = crypto.randomUUID();
  const url = `${server.baseUrl}/index.html?scenario=${encodeURIComponent(
    scenario,
  )}&requestId=${encodeURIComponent(requestId)}`;
  const browser = await launchChrome(url);

  try {
    await waitForDevTools(browser.debugPort, REPORT_TIMEOUT_MS);
    const target = await waitForTarget(browser.debugPort, url, REPORT_TIMEOUT_MS);

    if (!target.webSocketDebuggerUrl) {
      throw new Error(`Chrome target for ${scenario} did not expose CDP`);
    }

    const client = await connectToTarget(target.webSocketDebuggerUrl);
    try {
      await client.send("Runtime.enable");
      return await waitForMatchingReadyReport(client, requestId);
    } finally {
      client.close();
    }
  } finally {
    await browser.stop();
    server.stop();
  }
}

async function startStaticServer(): Promise<StaticServerHandle> {
  const server = Bun.serve({
    port: 0,
    hostname: "0.0.0.0",
    fetch(request) {
      return serveStaticFile(request);
    },
  });

  const baseUrl = await pickResponsiveBaseUrl(server.port);
  return {
    baseUrl,
    stop() {
      server.stop(true);
    },
  };
}

async function serveStaticFile(request: Request): Promise<Response> {
  const { pathname } = new URL(request.url);
  const normalizedPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = normalize(join(ROOT, normalizedPath));

  if (!filePath.startsWith(ROOT)) {
    return new Response("Forbidden", { status: 403 });
  }

  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(file, {
    headers: {
      "Content-Type": contentTypeForPath(filePath),
      "Cache-Control": "no-store",
    },
  });
}

function contentTypeForPath(pathname: string): string {
  if (pathname.endsWith(".html")) {
    return "text/html; charset=utf-8";
  }
  if (pathname.endsWith(".js")) {
    return "text/javascript; charset=utf-8";
  }
  if (pathname.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }
  return "text/plain; charset=utf-8";
}

async function pickResponsiveBaseUrl(port: number): Promise<string> {
  const hosts = [
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
    `http://[::1]:${port}`,
  ];

  for (const baseUrl of hosts) {
    try {
      const response = await fetch(`${baseUrl}/index.html`);
      if (response.ok) {
        return baseUrl;
      }
    } catch {
      // Try the next loopback host.
    }
  }

  throw new Error(`No loopback host responded for port ${port}`);
}

async function launchChrome(url: string): Promise<BrowserHandle> {
  const executable = await findChromeExecutable();
  const debugPort = await getFreePort();
  const userDataDir = mkdtempSync(join(tmpdir(), "scroll-anchor-browser-"));

  const process = Bun.spawn(
    [
      executable,
      "--headless=new",
      "--disable-gpu",
      "--disable-background-networking",
      "--no-first-run",
      "--no-default-browser-check",
      "--remote-allow-origins=*",
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${userDataDir}`,
      url,
    ],
    {
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  return {
    debugPort,
    process,
    userDataDir,
    async stop() {
      process.kill();
      await process.exited;
      rmSync(userDataDir, { recursive: true, force: true });
    },
  };
}

async function findChromeExecutable(): Promise<string> {
  const absoluteCandidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ];

  for (const candidate of absoluteCandidates) {
    if (await Bun.file(candidate).exists()) {
      return candidate;
    }
  }

  const commandCandidates = [
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
    "chrome",
  ];

  for (const candidate of commandCandidates) {
    const result = Bun.spawnSync(["which", candidate], {
      stdin: "ignore",
      stdout: "pipe",
      stderr: "ignore",
    });
    if (result.exitCode === 0) {
      const resolved = result.stdout.toString().trim();
      if (resolved) {
        return resolved;
      }
    }
  }

  throw new Error("Could not find a Chrome or Chromium executable for browser tests");
}

async function getFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Could not allocate a free port"));
        return;
      }
      const { port } = address;
      server.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }
        resolve(port);
      });
    });
  });
}

async function waitForDevTools(
  debugPort: number,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      if (response.ok) {
        return;
      }
    } catch {
      // Chrome is still starting.
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`Chrome DevTools did not start within ${timeoutMs}ms`);
}

async function waitForTarget(
  debugPort: number,
  url: string,
  timeoutMs: number,
): Promise<ChromeTarget> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
    const targets = (await response.json()) as ChromeTarget[];
    const matchingTarget = targets.find(
      (target) => target.type === "page" && target.url.startsWith(url),
    );

    if (matchingTarget) {
      return matchingTarget;
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(`Chrome never opened a target for ${url}`);
}

type PendingMessage = {
  resolve: (value: any) => void;
  reject: (error: unknown) => void;
};

type CdpClient = {
  close: () => void;
  send: (method: string, params?: Record<string, unknown>) => Promise<any>;
};

async function connectToTarget(webSocketUrl: string): Promise<CdpClient> {
  const socket = new WebSocket(webSocketUrl);
  const pendingMessages = new Map<number, PendingMessage>();
  let nextMessageId = 1;

  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener("error", (event) => {
      reject(new Error(`Failed to connect to Chrome target: ${String(event)}`));
    });
  });

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (typeof message.id !== "number") {
      return;
    }

    const pending = pendingMessages.get(message.id);
    if (!pending) {
      return;
    }

    pendingMessages.delete(message.id);
    if (message.error) {
      pending.reject(new Error(message.error.message ?? "Unknown CDP error"));
      return;
    }

    pending.resolve(message.result);
  });

  socket.addEventListener("close", () => {
    for (const pending of pendingMessages.values()) {
      pending.reject(new Error("Chrome closed the CDP socket"));
    }
    pendingMessages.clear();
  });

  return {
    close() {
      socket.close();
    },
    send(method, params = {}) {
      const id = nextMessageId++;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => {
        pendingMessages.set(id, { resolve, reject });
      });
    },
  };
}

async function waitForMatchingReadyReport(
  client: CdpClient,
  requestId: string,
): Promise<ScenarioReport> {
  const deadline = Date.now() + REPORT_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const hash = await readLocationHash(client);
    const report = parseHashReport(hash);
    if (report && report.requestId === requestId) {
      if (report.phase === "ready") {
        return report;
      }
      if (report.phase === "error") {
        throw new Error(report.message ?? `Scenario ${report.scenario} failed`);
      }
    }
    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(`Timed out waiting for ready report ${requestId}`);
}

async function readLocationHash(client: CdpClient): Promise<string> {
  const result = await client.send("Runtime.evaluate", {
    expression: "location.hash",
    returnByValue: true,
  });
  return String(result.result?.value ?? "");
}

function parseHashReport(hash: string): ScenarioReport | null {
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const rawReport = params.get("report");
  if (!rawReport) {
    return null;
  }

  try {
    return JSON.parse(rawReport) as ScenarioReport;
  } catch {
    return null;
  }
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
