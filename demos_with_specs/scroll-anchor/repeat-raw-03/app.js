import {
  HEADER_HEIGHT,
  ITEM_HEIGHT,
  TARGET_SCROLL_TOP,
  VIEWPORT_HEIGHT,
  computeLayout,
  computeScrollStep,
  createInitialState,
  findReferenceItem,
  getVisibleLayout,
  prependItems,
} from "./model.js";

/**
 * @typedef {{
 *   phase: "loading" | "running" | "ready" | "error";
 *   requestId: string;
 *   scenario: string;
 *   referenceItemIdBefore?: string | null;
 *   referenceItemIdAfter?: string | null;
 *   anchorIdBeforePrepend?: string | null;
 *   anchorIdAfterPrepend?: string | null;
 *   scrollTopBefore?: number;
 *   scrollTopAfter?: number;
 *   itemCountBefore?: number;
 *   itemCountAfter?: number;
 *   mountedItemCountBefore?: number;
 *   mountedItemCountAfter?: number;
 *   message?: string;
 * }} Report
 */

const params = new URLSearchParams(window.location.search);
const scenario = params.get("scenario") ?? "";
const requestId = params.get("requestId") ?? "";

const scrollContainer = document.getElementById("scroll-container");
const content = document.getElementById("content");
const info = document.getElementById("info");
const scrollToButton = document.getElementById("scroll-to-700");
const addThreeAboveButton = document.getElementById("add-3-above");
const addRapidButton = document.getElementById("add-rapid");

let state = createInitialState();
let storedScrollTop = 0;
let anchor = null;
let explicitScrollPending = false;
let renderScheduled = false;
let renderWaiters = [];
let lastLayout = computeLayout(state.items);
let lastVisibleLayout = getVisibleLayout(lastLayout, 0, VIEWPORT_HEIGHT);

if (scenario && requestId) {
  publishReport({
    phase: "loading",
    requestId,
    scenario,
  });
}

scrollToButton.addEventListener("click", () => {
  scrollToTarget();
});

addThreeAboveButton.addEventListener("click", () => {
  state = prependItems(state, 3);
  scheduleRender();
});

addRapidButton.addEventListener("click", () => {
  addOneThenTwoRapid();
});

scrollContainer.addEventListener("scroll", () => {
  if (scrollContainer.scrollTop !== storedScrollTop) {
    scheduleRender();
  }
});

scheduleRender();
void flushRenderWork().then(() => {
  if (scenario && requestId) {
    void runScenario();
  }
});

function scheduleRender() {
  if (renderScheduled) {
    return;
  }

  renderScheduled = true;
  requestAnimationFrame(() => {
    renderScheduled = false;
    render();
    flushRenderWaiters();
  });
}

function render() {
  const currentScrollTop = scrollContainer.scrollTop;
  const nextLayout = computeLayout(state.items);
  const step = computeScrollStep({
    currentScrollTop,
    storedScrollTop,
    explicitScroll: explicitScrollPending,
    anchor,
    itemPositions: nextLayout.itemPositions,
  });
  const effectiveScrollTop = step.adjustedScrollTop;
  const nextVisibleLayout = getVisibleLayout(
    nextLayout,
    effectiveScrollTop,
    scrollContainer.clientHeight || VIEWPORT_HEIGHT,
  );

  anchor = step.anchor;
  explicitScrollPending = false;
  lastLayout = nextLayout;
  lastVisibleLayout = nextVisibleLayout;

  content.style.height = `${nextLayout.totalHeight}px`;
  mountVisibleNodes(nextVisibleLayout);

  if (effectiveScrollTop !== currentScrollTop) {
    scrollToInstant(effectiveScrollTop);
  }

  storedScrollTop = scrollContainer.scrollTop;
  updateInfo();
}

/**
 * @param {{ headers: Array<{ day: string; y: number }>; items: Array<{ id: string; label: string; color: string; y: number }> }} visibleLayout
 */
function mountVisibleNodes(visibleLayout) {
  const fragment = document.createDocumentFragment();

  for (const header of visibleLayout.headers) {
    const headerElement = document.createElement("div");
    headerElement.className = "header";
    headerElement.textContent = header.day;
    headerElement.style.top = `${header.y}px`;
    headerElement.style.height = `${HEADER_HEIGHT}px`;
    fragment.appendChild(headerElement);
  }

  for (const item of visibleLayout.items) {
    const itemElement = document.createElement("div");
    itemElement.className = "item";
    itemElement.dataset.itemId = item.id;
    itemElement.textContent = `${item.id} ${item.label}`;
    itemElement.style.top = `${item.y}px`;
    itemElement.style.height = `${ITEM_HEIGHT}px`;
    itemElement.style.background = item.color;
    fragment.appendChild(itemElement);
  }

  content.replaceChildren(fragment);
}

function updateInfo() {
  info.innerHTML =
    `<strong>scrollTop</strong>: ${formatNumber(storedScrollTop)}` +
    ` | <strong>anchor</strong>: ${anchor?.id ?? "-"}` +
    ` | <strong>prevY</strong>: ${anchor ? formatNumber(anchor.prevY) : "-"}` +
    ` | <strong>items</strong>: ${state.items.length}`;
}

function scrollToTarget() {
  explicitScrollPending = true;
  scrollToInstant(TARGET_SCROLL_TOP);
  scheduleRender();
}

function addOneThenTwoRapid() {
  state = prependItems(state, 1);
  scheduleRender();

  queueMicrotask(() => {
    state = prependItems(state, 2);
    scheduleRender();
  });
}

/**
 * @param {number} top
 */
function scrollToInstant(top) {
  try {
    scrollContainer.scrollTo({ top, behavior: "instant" });
  } catch {
    scrollContainer.scrollTo({ top, behavior: "auto" });
  }
}

/**
 * @returns {Promise<void>}
 */
async function flushRenderWork() {
  while (renderScheduled) {
    await new Promise((resolve) => {
      renderWaiters.push(resolve);
    });
    await Promise.resolve();
  }
}

function flushRenderWaiters() {
  const waiters = renderWaiters;
  renderWaiters = [];
  for (const waiter of waiters) {
    waiter();
  }
}

/**
 * @returns {{
 *   anchorId: string | null;
 *   referenceItemId: string | null;
 *   scrollTop: number;
 *   itemCount: number;
 *   mountedItemCount: number;
 * }}
 */
function captureSnapshot() {
  const viewportHeight = scrollContainer.clientHeight || VIEWPORT_HEIGHT;
  const referenceItem = findReferenceItem(lastLayout, storedScrollTop, viewportHeight);

  return {
    anchorId: anchor?.id ?? null,
    referenceItemId: referenceItem?.id ?? null,
    scrollTop: storedScrollTop,
    itemCount: state.items.length,
    mountedItemCount: lastVisibleLayout.items.length,
  };
}

async function runScenario() {
  try {
    publishReport({
      phase: "running",
      requestId,
      scenario,
    });

    if (scenario === "scroll-to-700-add-3-above") {
      scrollToTarget();
      await flushRenderWork();
      const before = captureSnapshot();

      state = prependItems(state, 3);
      scheduleRender();
      await flushRenderWork();
      const after = captureSnapshot();

      publishReadyReport(before, after);
      return;
    }

    if (scenario === "add-1-then-2-rapid") {
      scrollToTarget();
      await flushRenderWork();
      const before = captureSnapshot();

      addOneThenTwoRapid();
      await flushRenderWork();
      const after = captureSnapshot();

      publishReadyReport(before, after);
      return;
    }

    if (scenario === "user-scroll-then-prepend") {
      scrollToTarget();
      await flushRenderWork();

      scrollContainer.scrollTo({ top: 356, behavior: "auto" });
      scheduleRender();
      await flushRenderWork();
      const before = captureSnapshot();

      state = prependItems(state, 3);
      scheduleRender();
      await flushRenderWork();
      const after = captureSnapshot();

      publishReadyReport(before, after);
      return;
    }

    throw new Error(`Unknown scenario: ${scenario}`);
  } catch (error) {
    publishReport({
      phase: "error",
      requestId,
      scenario,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * @param {{
 *   anchorId: string | null;
 *   referenceItemId: string | null;
 *   scrollTop: number;
 *   itemCount: number;
 *   mountedItemCount: number;
 * }} before
 * @param {{
 *   anchorId: string | null;
 *   referenceItemId: string | null;
 *   scrollTop: number;
 *   itemCount: number;
 *   mountedItemCount: number;
 * }} after
 */
function publishReadyReport(before, after) {
  publishReport({
    phase: "ready",
    requestId,
    scenario,
    referenceItemIdBefore: before.referenceItemId,
    referenceItemIdAfter: after.referenceItemId,
    anchorIdBeforePrepend: before.anchorId,
    anchorIdAfterPrepend: after.anchorId,
    scrollTopBefore: before.scrollTop,
    scrollTopAfter: after.scrollTop,
    itemCountBefore: before.itemCount,
    itemCountAfter: after.itemCount,
    mountedItemCountBefore: before.mountedItemCount,
    mountedItemCountAfter: after.mountedItemCount,
  });
}

/**
 * @param {Report} report
 */
function publishReport(report) {
  const hash = new URLSearchParams({
    report: JSON.stringify(report),
  }).toString();
  window.location.hash = hash;
}

/**
 * @param {number} value
 */
function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
