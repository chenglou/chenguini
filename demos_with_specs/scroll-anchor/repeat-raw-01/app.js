import {
  HEADER_HEIGHT,
  ITEM_HEIGHT,
  TARGET_SCROLL_TOP,
  VIEWPORT_HEIGHT,
  buildLayout,
  computeAnchorFrame,
  createInitialItems,
  getReferenceItemId,
  getVisibleEntries,
  prependItemsAbove,
} from "./model.js";

const params = new URLSearchParams(location.search);
const scenario = params.get("scenario") ?? "";
const requestId = params.get("requestId") ?? "";

const container = document.querySelector("[data-scroll-container]");
const content = document.querySelector("[data-content]");
const infoLine = document.querySelector("[data-info]");
const scrollButton = document.querySelector("[data-action='scroll-700']");
const addThreeButton = document.querySelector("[data-action='add-3']");
const addRapidButton = document.querySelector("[data-action='add-rapid']");

const state = {
  items: createInitialItems(),
  anchor: null,
  storedScrollTop: 0,
  lastLayout: null,
  lastViewportHeight: VIEWPORT_HEIGHT,
  renderQueued: false,
  scenarioStarted: false,
};

container.style.height = `${VIEWPORT_HEIGHT}px`;

scrollButton.addEventListener("click", () => {
  scrollToTop(TARGET_SCROLL_TOP);
});

addThreeButton.addEventListener("click", () => {
  addItemsAbove(3);
});

addRapidButton.addEventListener("click", () => {
  addOneThenTwoRapid();
});

container.addEventListener("scroll", () => {
  if (container.scrollTop !== state.storedScrollTop) {
    queueRender();
  }
});

queueRender();

if (scenario) {
  publishReport({
    phase: "loading",
    requestId,
    scenario,
  });
  requestAnimationFrame(() => {
    void runScenario();
  });
}

function queueRender() {
  if (state.renderQueued) {
    return;
  }

  state.renderQueued = true;
  requestAnimationFrame(render);
}

function render() {
  state.renderQueued = false;

  const scrollTop = container.scrollTop;
  const layout = buildLayout(state.items);
  const frame = computeAnchorFrame({
    layout,
    scrollTop,
    storedScrollTop: state.storedScrollTop,
    anchor: state.anchor,
  });
  const viewportHeight = container.clientHeight || VIEWPORT_HEIGHT;
  const visibleEntries = getVisibleEntries(
    layout,
    frame.adjustedScrollTop,
    viewportHeight,
  );

  renderEntries(visibleEntries, layout.totalHeight);

  if (frame.adjustedScrollTop !== scrollTop) {
    container.scrollTo({
      top: frame.adjustedScrollTop,
      behavior: "instant",
    });
  }

  state.anchor = frame.anchor;
  state.lastLayout = layout;
  state.lastViewportHeight = viewportHeight;
  state.storedScrollTop = container.scrollTop;

  infoLine.textContent = [
    `scrollTop ${formatNumber(state.storedScrollTop)}`,
    `anchor ${state.anchor?.id ?? "-"}`,
    `prevY ${formatNumber(state.anchor?.prevY ?? 0)}`,
    `items ${state.items.length}`,
  ].join(" | ");
}

function renderEntries(visibleEntries, totalHeight) {
  content.style.height = `${totalHeight}px`;

  const fragment = document.createDocumentFragment();

  for (const header of visibleEntries.headers) {
    const headerElement = document.createElement("div");
    headerElement.className = "day-header";
    headerElement.style.top = `${header.y}px`;
    headerElement.style.height = `${HEADER_HEIGHT}px`;
    headerElement.textContent = header.day;
    fragment.append(headerElement);
  }

  for (const item of visibleEntries.items) {
    const itemElement = document.createElement("article");
    itemElement.className = "item-card";
    itemElement.dataset.itemId = item.id;
    itemElement.style.top = `${item.y}px`;
    itemElement.style.height = `${ITEM_HEIGHT}px`;
    itemElement.style.background = item.color;

    const idLine = document.createElement("div");
    idLine.className = "item-id";
    idLine.textContent = item.id;

    const labelLine = document.createElement("div");
    labelLine.className = "item-label";
    labelLine.textContent = item.label;

    const dayLine = document.createElement("div");
    dayLine.className = "item-day";
    dayLine.textContent = item.day;

    itemElement.append(idLine, labelLine, dayLine);
    fragment.append(itemElement);
  }

  content.replaceChildren(fragment);
}

function scrollToTop(top) {
  container.scrollTo({
    top,
    behavior: "instant",
  });
  queueRender();
}

function addItemsAbove(count) {
  state.items = prependItemsAbove(state.items, count);
  queueRender();
}

function addOneThenTwoRapid() {
  addItemsAbove(1);
  setTimeout(() => {
    addItemsAbove(2);
  }, 0);
}

async function runScenario() {
  if (state.scenarioStarted) {
    return;
  }
  state.scenarioStarted = true;

  try {
    await waitForIdle();
    publishReport({
      phase: "running",
      requestId,
      scenario,
    });

    if (scenario === "scroll-to-700-add-3-above") {
      scrollToTop(TARGET_SCROLL_TOP);
      await waitForIdle();
      const before = captureSnapshot();
      addItemsAbove(3);
      await waitForCondition(() => state.items.length === 20);
      await waitForIdle();
      const after = captureSnapshot();
      publishReport({
        phase: "ready",
        requestId,
        scenario,
        beforeReferenceItemId: before.referenceItemId,
        afterReferenceItemId: after.referenceItemId,
        beforeAnchorId: before.anchorId,
        afterAnchorId: after.anchorId,
        beforeScrollTop: before.scrollTop,
        afterScrollTop: after.scrollTop,
        beforeItemCount: before.itemCount,
        afterItemCount: after.itemCount,
      });
      return;
    }

    if (scenario === "add-1-then-2-rapid") {
      scrollToTop(TARGET_SCROLL_TOP);
      await waitForIdle();
      const before = captureSnapshot();
      addItemsAbove(1);
      await waitForIdle();
      addItemsAbove(2);
      await waitForCondition(() => state.items.length === 20);
      await waitForIdle();
      const after = captureSnapshot();
      publishReport({
        phase: "ready",
        requestId,
        scenario,
        beforeReferenceItemId: before.referenceItemId,
        afterReferenceItemId: after.referenceItemId,
        beforeAnchorId: before.anchorId,
        afterAnchorId: after.anchorId,
        beforeScrollTop: before.scrollTop,
        afterScrollTop: after.scrollTop,
        beforeItemCount: before.itemCount,
        afterItemCount: after.itemCount,
      });
      return;
    }

    if (scenario === "user-scroll-then-prepend") {
      scrollToTop(952);
      await waitForIdle();
      const before = captureSnapshot();
      addItemsAbove(3);
      await waitForCondition(() => state.items.length === 20);
      await waitForIdle();
      const after = captureSnapshot();
      publishReport({
        phase: "ready",
        requestId,
        scenario,
        beforeReferenceItemId: before.referenceItemId,
        afterReferenceItemId: after.referenceItemId,
        beforeAnchorId: before.anchorId,
        afterAnchorId: after.anchorId,
        beforeScrollTop: before.scrollTop,
        afterScrollTop: after.scrollTop,
        beforeItemCount: before.itemCount,
        afterItemCount: after.itemCount,
      });
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

function captureSnapshot() {
  return {
    referenceItemId: getReferenceItemId(
      state.lastLayout,
      state.storedScrollTop,
      state.lastViewportHeight,
    ),
    anchorId: state.anchor?.id ?? null,
    scrollTop: state.storedScrollTop,
    itemCount: state.items.length,
  };
}

function publishReport(report) {
  location.hash = `report=${encodeURIComponent(JSON.stringify(report))}`;
}

async function waitForIdle() {
  await waitForCondition(() => !state.renderQueued);
  await nextFrame();
  await waitForCondition(() => !state.renderQueued);
}

async function waitForCondition(predicate) {
  const startedAt = performance.now();
  while (performance.now() - startedAt < 2500) {
    if (predicate()) {
      return;
    }
    await nextFrame();
  }
  throw new Error("Timed out waiting for UI state");
}

function nextFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function formatNumber(value) {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}
