import { expect, setDefaultTimeout, test } from "bun:test";
import { runBrowserScenario } from "./browserHarness";

setDefaultTimeout(30_000);

test("scroll-to-700 then add-3-above keeps V9 at the reference line", async () => {
  const report = await runBrowserScenario("scroll-to-700-add-3-above");

  expect(report.referenceItemIdBefore).toBe("V9");
  expect(report.referenceItemIdAfter).toBe("V9");
  expect(report.anchorIdBeforePrepend).toBe("V8");
  expect(report.anchorIdAfterPrepend).toBe("V8");
  expect(report.scrollTopBefore).toBe(700);
  expect(report.scrollTopAfter).toBe(1024);
  expect(report.itemCountBefore).toBe(17);
  expect(report.itemCountAfter).toBe(20);
  expect(report.mountedItemCountAfter).toBeLessThan(report.itemCountAfter!);
});

test("add-1 then 2 rapid keeps V9 at the reference line", async () => {
  const report = await runBrowserScenario("add-1-then-2-rapid");

  expect(report.referenceItemIdBefore).toBe("V9");
  expect(report.referenceItemIdAfter).toBe("V9");
  expect(report.anchorIdBeforePrepend).toBe("V8");
  expect(report.anchorIdAfterPrepend).toBe("V8");
  expect(report.scrollTopBefore).toBe(700);
  expect(report.scrollTopAfter).toBe(1024);
  expect(report.itemCountBefore).toBe(17);
  expect(report.itemCountAfter).toBe(20);
  expect(report.mountedItemCountAfter).toBeLessThan(report.itemCountAfter!);
});

test("user-scroll then prepend picks a new anchor from the new scroll position", async () => {
  const report = await runBrowserScenario("user-scroll-then-prepend");

  expect(report.anchorIdBeforePrepend).toBe("V4");
  expect(report.anchorIdAfterPrepend).toBe("V4");
  expect(report.referenceItemIdBefore).toBe("V6");
  expect(report.referenceItemIdAfter).toBe("V6");
  expect(report.scrollTopBefore).toBe(356);
  expect(report.scrollTopAfter).toBe(680);
  expect(report.mountedItemCountAfter).toBeLessThan(report.itemCountAfter!);
});
