import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { runBrowserScenario, startDemoServer } from "./browser-runner.ts";

let server: Awaited<ReturnType<typeof startDemoServer>>;

beforeAll(async () => {
  server = await startDemoServer(import.meta.dir);
});

afterAll(async () => {
  await server.stop();
});

describe("browser-backed semantic reports", () => {
  test(
    "drag keeps the PiP under the pointer before release",
    { timeout: 30_000 },
    async () => {
      const report = await runBrowserScenario(server, "drag-hold");

      expect(report.phase).toBe("ready");
      expect(report.scenario).toBe("drag-hold");
      expect(report.pointerError).toEqual({ x: 0, y: 0 });
      expect(report.dragging).toBe(true);
      expect(report.pointer).toEqual({ x: 242, y: 184 });
    },
  );

  test(
    "a flick toward the upper-right lands at the upper-right corner",
    { timeout: 30_000 },
    async () => {
      const report = await runBrowserScenario(server, "flick-upper-right");

      expect(report.phase).toBe("ready");
      expect(report.scenario).toBe("flick-upper-right");
      expect(report.chosenCornerId).toBe("top-right");
      expect(report.settledCornerId).toBe("top-right");
      expect(report.restPoint.x).toBeGreaterThan(200);
      expect(report.restPoint.y).toBeLessThan(150);
    },
  );

  test(
    "a slower release toward the lower-right lands at the lower-right corner and reports the blue rest point",
    { timeout: 30_000 },
    async () => {
      const report = await runBrowserScenario(server, "release-lower-right");

      expect(report.phase).toBe("ready");
      expect(report.scenario).toBe("release-lower-right");
      expect(report.chosenCornerId).toBe("bottom-right");
      expect(report.settledCornerId).toBe("bottom-right");
      expect(report.restMarkerVisible).toBe(true);
      expect(report.restPoint).toEqual({ x: 310, y: 256 });
    },
  );
});
