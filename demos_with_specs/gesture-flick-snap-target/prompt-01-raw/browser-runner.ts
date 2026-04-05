import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

type BrowserReport = {
  phase: "loading" | "running" | "ready" | "error";
  requestId: string;
  scenario: string;
  dragging?: boolean;
  pointer?: { x: number; y: number };
  pointerError?: { x: number; y: number };
  chosenCornerId?: string;
  settledCornerId?: string;
  restPoint?: { x: number; y: number };
  restMarkerVisible?: boolean;
  message?: string;
};

type DemoServer = Awaited<ReturnType<typeof startDemoServer>>;

export async function startDemoServer(rootDir: string) {
  const server = Bun.serve({
    port: 0,
    development: false,
    fetch(request) {
      const url = new URL(request.url);
      const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
      const filePath = resolve(rootDir, `.${decodeURIComponent(pathname)}`);

      if (!filePath.startsWith(rootDir) || !existsSync(filePath)) {
        return new Response("Not found", { status: 404 });
      }

      return new Response(Bun.file(filePath), {
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": getContentType(filePath),
        },
      });
    },
  });

  const origin = await probeLoopbackHost(server.port);

  return {
    port: server.port,
    origin,
    baseUrl: `${origin}:${server.port}`,
    stop() {
      server.stop(true);
    },
  };
}

export async function runBrowserScenario(server: DemoServer, scenario: string) {
  const requestId = crypto.randomUUID();
  const remotePort = await getFreePort();
  const userDataDir = mkdtempSync(join(tmpdir(), "gesture-flick-snap-target-"));
  const chromePath = findChromeExecutable();
  const url =
    `${server.baseUrl}/index.html?scenario=${encodeURIComponent(scenario)}` +
    `&requestId=${encodeURIComponent(requestId)}`;

  const chromeProcess = Bun.spawn([
    chromePath,
    "--headless=new",
    "--disable-gpu",
    "--disable-background-networking",
    "--disable-extensions",
    "--disable-sync",
    "--hide-scrollbars",
    "--mute-audio",
    "--no-default-browser-check",
    "--no-first-run",
    `--remote-debugging-port=${remotePort}`,
    "--window-size=520,380",
    `--user-data-dir=${userDataDir}`,
    url,
  ], {
    stdout: "ignore",
    stderr: "ignore",
  });

  try {
    await waitForDebugger(remotePort);
    const targetWsUrl = await waitForTargetWebSocketUrl(remotePort, requestId);
    const client = await createCdpClient(targetWsUrl);

    try {
      await client.send("Runtime.enable");
      return await waitForReadyReport(client, requestId, 10_000);
    } finally {
      client.close();
    }
  } finally {
    chromeProcess.kill();
    await chromeProcess.exited.catch(() => {});
    rmSync(userDataDir, { recursive: true, force: true });
  }
}

async function probeLoopbackHost(port: number) {
  for (const host of ["http://127.0.0.1", "http://localhost", "http://[::1]"]) {
    try {
      const response = await fetch(`${host}:${port}/index.html`, {
        signal: AbortSignal.timeout(1_000),
      });

      if (response.ok) {
        return host;
      }
    } catch {}
  }

  throw new Error("Could not reach the local demo server on any loopback host");
}

async function waitForDebugger(remotePort: number, timeoutMs = 10_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${remotePort}/json/version`, {
        signal: AbortSignal.timeout(500),
      });

      if (response.ok) {
        return;
      }
    } catch {}

    await delay(50);
  }

  throw new Error("Chrome remote debugger did not come up");
}

async function waitForTargetWebSocketUrl(
  remotePort: number,
  requestId: string,
  timeoutMs = 10_000,
) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${remotePort}/json/list`, {
        signal: AbortSignal.timeout(500),
      });
      const targets = (await response.json()) as Array<{
        type: string;
        url: string;
        webSocketDebuggerUrl?: string;
      }>;

      const target = targets.find(
        (candidate) =>
          candidate.type === "page" &&
          candidate.url.includes(requestId) &&
          candidate.webSocketDebuggerUrl != null,
      );

      if (target?.webSocketDebuggerUrl != null) {
        return target.webSocketDebuggerUrl;
      }
    } catch {}

    await delay(50);
  }

  throw new Error(`Could not find Chrome target for requestId ${requestId}`);
}

async function createCdpClient(webSocketUrl: string) {
  const socket = new WebSocket(webSocketUrl);
  const pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: unknown) => void;
    }
  >();
  let nextId = 1;

  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener("error", (event) => reject(event), { once: true });
  });

  socket.addEventListener("message", (event) => {
    const payload = JSON.parse(String(event.data));

    if (payload.id == null) {
      return;
    }

    const entry = pending.get(payload.id);
    if (entry == null) {
      return;
    }

    pending.delete(payload.id);

    if (payload.error != null) {
      entry.reject(new Error(payload.error.message ?? "CDP request failed"));
      return;
    }

    entry.resolve(payload.result);
  });

  return {
    async send(method: string, params: Record<string, unknown> = {}) {
      const id = nextId++;

      const responsePromise = new Promise<unknown>((resolve, reject) => {
        pending.set(id, { resolve, reject });
      });

      socket.send(JSON.stringify({ id, method, params }));
      return responsePromise;
    },
    close() {
      for (const [, entry] of pending) {
        entry.reject(new Error("CDP socket closed"));
      }

      pending.clear();
      socket.close();
    },
  };
}

async function waitForReadyReport(
  client: Awaited<ReturnType<typeof createCdpClient>>,
  requestId: string,
  timeoutMs: number,
) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const evaluation = (await client.send("Runtime.evaluate", {
      expression: "window.location.hash",
      returnByValue: true,
    })) as {
      result?: { value?: string };
    };
    const hash = evaluation.result?.value;

    if (typeof hash === "string" && hash.startsWith("#report=")) {
      const report = JSON.parse(
        decodeURIComponent(hash.slice("#report=".length)),
      ) as BrowserReport;

      if (report.requestId === requestId) {
        if (report.phase === "ready") {
          return report;
        }

        if (report.phase === "error") {
          throw new Error(report.message ?? `Scenario ${report.scenario} failed`);
        }
      }
    }

    await delay(50);
  }

  throw new Error(`Timed out waiting for a ready report for requestId ${requestId}`);
}

function findChromeExecutable() {
  const candidates = [
    process.env.CHROME_EXECUTABLE,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "google-chrome",
    "chromium",
    "chromium-browser",
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (candidate.includes("/") && existsSync(candidate)) {
      return candidate;
    }

    if (!candidate.includes("/")) {
      try {
        const which = Bun.spawnSync(["/bin/zsh", "-lc", `command -v ${candidate}`], {
          stdout: "pipe",
          stderr: "ignore",
        });
        const resolved = which.stdout.toString().trim();

        if (resolved !== "") {
          return resolved;
        }
      } catch {}
    }
  }

  throw new Error("Could not find a Chrome or Chromium executable");
}

function getContentType(filePath: string) {
  if (filePath.endsWith(".html")) {
    return "text/html; charset=utf-8";
  }
  if (filePath.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }
  if (filePath.endsWith(".js")) {
    return "text/javascript; charset=utf-8";
  }
  return "text/plain; charset=utf-8";
}

async function getFreePort() {
  const listener = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: {
      data() {},
    },
  });
  const port = listener.port;
  listener.stop(true);
  return port;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
