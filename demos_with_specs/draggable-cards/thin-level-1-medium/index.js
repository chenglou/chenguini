import {
  CARD_COUNT,
  CARD_WIDTH,
  DRAG_OPACITY,
  DRAG_SCALE,
  MS_PER_ANIMATION_STEP,
  TOP_PADDING,
  cardZIndex,
  createOrderedCardIds,
  estimateReleaseVelocity,
  getCardHeight,
  getCardLayouts,
  getCardLightness,
  reorderByPointerMidpoint,
} from "./model.js";

const scenario = new URLSearchParams(location.search).get("scenario") ?? "";
const requestId = new URLSearchParams(location.search).get("requestId") ?? "";
const app = document.getElementById("app");

if (!(app instanceof HTMLElement)) {
  throw new Error("Missing #app");
}

const cardCopy = [
  {
    eyebrow: "Daily",
    title: "Gather references",
    body: "Drag the stack and watch the order update before you let go.",
  },
  {
    eyebrow: "Motion",
    title: "Pin to pointer",
    body: "The dragged card stays under the pointer while the others make room.",
  },
  {
    eyebrow: "Release",
    title: "Carry momentum",
    body: "Release uses the latest pointer history so the card keeps its throw.",
  },
  {
    eyebrow: "Depth",
    title: "Stay on top",
    body: "The last released card floats above the stack until the settle finishes.",
  },
  {
    eyebrow: "Spec",
    title: "Five cards only",
    body: "Everything here is deterministic so the browser report can stay compact.",
  },
];

function spring(position, destination = position, velocity = 0, stiffness = 333, damping = 33) {
  return { pos: position, dest: destination, v: velocity, k: stiffness, b: damping };
}

function springStep(config) {
  const t = MS_PER_ANIMATION_STEP / 1000;
  const { pos, dest, v, k, b } = config;
  const springForce = -k * (pos - dest);
  const dampingForce = -b * v;
  const nextVelocity = v + (springForce + dampingForce) * t;
  const nextPosition = pos + nextVelocity * t;

  config.pos = nextPosition;
  config.v = nextVelocity;
}

function springMostlyDone(config) {
  return Math.abs(config.v) < 0.01 && Math.abs(config.dest - config.pos) < 0.01;
}

function sameOrder(a, b) {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
}

function createCardState(cardId) {
  return {
    id: cardId,
    height: getCardHeight(cardId),
    lightness: getCardLightness(cardId),
    x: spring(0),
    y: spring(0),
    scale: spring(1),
    opacity: spring(1),
    node: null,
  };
}

const cards = Array.from({ length: CARD_COUNT }, (_, cardId) => createCardState(cardId));
const cardsById = new Map(cards.map((card) => [card.id, card]));

const st = {
  orderedCardIds: createOrderedCardIds(),
  draggedCardId: null,
  lastDraggedCardId: null,
  dragPointerId: null,
  dragPointer: null,
  dragDeltaX: 0,
  dragDeltaY: 0,
  pointerHistory: [],
  animatedUntilTime: null,
  events: {
    pointerDown: null,
    pointerMove: null,
    pointerUp: null,
  },
  automation: {
    scenario,
    requestId,
    running: false,
    started: false,
  },
};

let scheduledRaf = null;

function publishReport(report) {
  if (st.automation.requestId === "") return;
  location.hash = `report=${encodeURIComponent(JSON.stringify(report))}`;
}

function scheduleRender() {
  if (scheduledRaf != null) return;
  scheduledRaf = requestAnimationFrame((now) => {
    scheduledRaf = null;
    if (render(now)) scheduleRender();
  });
}

function recordPointerSample(point) {
  const lastPoint = st.pointerHistory[st.pointerHistory.length - 1];
  if (lastPoint != null && lastPoint.time === point.time && lastPoint.x === point.x && lastPoint.y === point.y) return;
  st.pointerHistory.push(point);
  if (st.pointerHistory.length > 20) st.pointerHistory.shift();
}

function createCardNode(card) {
  const node = document.createElement("article");
  node.className = "card";
  node.dataset.cardId = String(card.id);
  node.innerHTML = `
    <div class="card__eyebrow">${cardCopy[card.id].eyebrow}</div>
    <div class="card__title">${cardCopy[card.id].title}</div>
    <div class="card__body">${cardCopy[card.id].body}</div>
  `;
  node.style.height = `${card.height}px`;
  node.style.background = `linear-gradient(180deg, hsl(${25 + card.id * 39} 82% ${Math.min(card.lightness + 14, 92)}%), hsl(${18 + card.id * 33} 74% ${card.lightness}%))`;
  card.node = node;
  app.appendChild(node);
}

function getCenteredX(windowWidth) {
  return (windowWidth - CARD_WIDTH) / 2;
}

function getDraggedCardX(pointerX, deltaX, windowWidth) {
  const rawX = pointerX - deltaX;
  const centeredX = getCenteredX(windowWidth);
  return rawX + (centeredX - rawX) / 1.5;
}

function getCurrentTopCardId() {
  let topCardId = null;
  let topZIndex = -Infinity;

  for (const card of cards) {
    const zIndex = cardZIndex(st.orderedCardIds, st.draggedCardId, st.lastDraggedCardId, card.id);
    if (zIndex > topZIndex) {
      topZIndex = zIndex;
      topCardId = card.id;
    }
  }

  return topCardId;
}

function cardSettled(card) {
  return springMostlyDone(card.x) && springMostlyDone(card.y) && springMostlyDone(card.scale);
}

function anyCardAnimating() {
  return cards.some((card) => !springMostlyDone(card.x) || !springMostlyDone(card.y) || !springMostlyDone(card.scale) || !springMostlyDone(card.opacity));
}

function enqueueSyntheticPointerEvent(kind, event) {
  if (kind === "pointerDown") st.events.pointerDown = event;
  if (kind === "pointerMove") st.events.pointerMove = event;
  if (kind === "pointerUp") st.events.pointerUp = event;
  scheduleRender();
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function waitForFrames(count) {
  for (let index = 0; index < count; index += 1) await nextFrame();
}

async function waitUntilIdle(maxFrames = 240) {
  for (let frame = 0; frame < maxFrames; frame += 1) {
    if (st.draggedCardId == null && st.lastDraggedCardId == null && !anyCardAnimating()) return;
    await waitForFrames(1);
  }

  throw new Error("Animation did not settle");
}

function pointerEventForCard(cardId, time) {
  const card = cardsById.get(cardId);
  if (card == null) throw new Error(`Missing card ${cardId}`);
  return {
    cardId,
    pointerId: 1,
    x: card.x.pos + CARD_WIDTH / 2,
    y: card.y.pos + card.height / 2,
    time,
  };
}

async function runReorderBeforeReleaseScenario() {
  let time = 1_000;
  const start = pointerEventForCard(1, time);
  enqueueSyntheticPointerEvent("pointerDown", start);
  await waitForFrames(2);

  const layouts = getCardLayouts(st.orderedCardIds);
  const card2 = layouts.get(2);
  if (card2 == null) throw new Error("Missing card 2 layout");

  time += 32;
  enqueueSyntheticPointerEvent("pointerMove", {
    pointerId: 1,
    x: start.x,
    y: card2.midpoint + 12,
    time,
  });
  await waitForFrames(3);

  const orderBeforeRelease = st.orderedCardIds.slice();

  time += 24;
  enqueueSyntheticPointerEvent("pointerUp", {
    pointerId: 1,
    x: start.x,
    y: card2.midpoint + 18,
    time,
  });

  await waitUntilIdle();

  return {
    orderedCardIds: st.orderedCardIds.slice(),
    orderBeforeRelease,
  };
}

async function runTopUntilSettleScenario() {
  let time = 2_000;
  const start = pointerEventForCard(2, time);
  enqueueSyntheticPointerEvent("pointerDown", start);
  await waitForFrames(2);

  time += 24;
  enqueueSyntheticPointerEvent("pointerMove", {
    pointerId: 1,
    x: start.x + 36,
    y: start.y + 72,
    time,
  });
  await waitForFrames(2);

  time += 24;
  enqueueSyntheticPointerEvent("pointerUp", {
    pointerId: 1,
    x: start.x + 60,
    y: start.y + 120,
    time,
  });

  const topCardIdsDuringRelease = [];
  await waitForFrames(1);

  while (st.lastDraggedCardId != null) {
    topCardIdsDuringRelease.push(getCurrentTopCardId());
    await waitForFrames(1);
  }

  const uniqueTopCardIds = [...new Set(topCardIdsDuringRelease)];
  return {
    releasedCardId: 2,
    stayedTopUntilSettle: uniqueTopCardIds.every((cardId) => cardId === 2),
    topCardIdsDuringRelease: uniqueTopCardIds,
  };
}

async function runScenarioIfNeeded() {
  if (st.automation.started || st.automation.scenario === "") return;
  st.automation.started = true;

  publishReport({
    phase: "loading",
    requestId: st.automation.requestId,
    scenario: st.automation.scenario,
  });

  await waitForFrames(2);
  st.automation.running = true;
  publishReport({
    phase: "running",
    requestId: st.automation.requestId,
    scenario: st.automation.scenario,
  });

  try {
    let payload = null;
    if (st.automation.scenario === "reorder-before-release") payload = await runReorderBeforeReleaseScenario();
    else if (st.automation.scenario === "top-until-settle") payload = await runTopUntilSettleScenario();
    else throw new Error(`Unknown scenario: ${st.automation.scenario}`);

    publishReport({
      phase: "ready",
      requestId: st.automation.requestId,
      scenario: st.automation.scenario,
      ...payload,
    });
  } catch (error) {
    publishReport({
      phase: "error",
      requestId: st.automation.requestId,
      scenario: st.automation.scenario,
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    st.automation.running = false;
  }
}

function handlePointerDown(event) {
  const card = cardsById.get(event.cardId);
  if (card == null) return;

  st.draggedCardId = card.id;
  st.lastDraggedCardId = null;
  st.dragPointerId = event.pointerId;
  st.dragPointer = { x: event.x, y: event.y, time: event.time };
  st.dragDeltaX = event.x - card.x.pos;
  st.dragDeltaY = event.y - card.y.pos;
  st.pointerHistory = [{ x: event.x, y: event.y, time: event.time }];
}

function handlePointerMove(event) {
  if (st.draggedCardId == null || event.pointerId !== st.dragPointerId) return;
  st.dragPointer = { x: event.x, y: event.y, time: event.time };
  recordPointerSample(st.dragPointer);
}

function handlePointerUp(event) {
  if (st.draggedCardId == null || event.pointerId !== st.dragPointerId) return;

  const card = cardsById.get(st.draggedCardId);
  if (card == null) return;

  st.dragPointer = { x: event.x, y: event.y, time: event.time };
  recordPointerSample(st.dragPointer);

  const { vx, vy } = estimateReleaseVelocity(st.pointerHistory, event.time);
  card.x.v += vx;
  card.y.v += vy;

  st.lastDraggedCardId = st.draggedCardId;
  st.draggedCardId = null;
  st.dragPointerId = null;
  st.dragPointer = null;
  st.pointerHistory = [];

  if (st.animatedUntilTime == null) st.animatedUntilTime = document.timeline.currentTime ?? 0;
}

function render(now) {
  const windowWidth = document.documentElement.clientWidth;

  if (st.events.pointerDown != null) handlePointerDown(st.events.pointerDown);
  if (st.events.pointerMove != null) handlePointerMove(st.events.pointerMove);
  if (st.events.pointerUp != null) handlePointerUp(st.events.pointerUp);

  if (st.draggedCardId != null && st.dragPointer != null) {
    const nextOrder = reorderByPointerMidpoint(st.orderedCardIds, st.draggedCardId, st.dragPointer.y);
    if (!sameOrder(nextOrder, st.orderedCardIds)) st.orderedCardIds = nextOrder;
  }

  const layouts = getCardLayouts(st.orderedCardIds);
  const centeredX = getCenteredX(windowWidth);
  const appHeight = TOP_PADDING + cards.reduce((sum, card) => sum + card.height, 0) + 120;
  app.style.height = `${Math.max(window.innerHeight, appHeight)}px`;

  for (const card of cards) {
    const layout = layouts.get(card.id);
    if (layout == null) continue;

    card.x.dest = centeredX;
    card.y.dest = layout.y;
    card.scale.dest = 1;
    card.opacity.dest = 1;

    if (card.id === st.draggedCardId && st.dragPointer != null) {
      const dragX = getDraggedCardX(st.dragPointer.x, st.dragDeltaX, windowWidth);
      const dragY = st.dragPointer.y - st.dragDeltaY;
      card.x.pos = card.x.dest = dragX;
      card.y.pos = card.y.dest = dragY;
      card.x.v = 0;
      card.y.v = 0;
      card.scale.pos = card.scale.dest = DRAG_SCALE;
      card.scale.v = 0;
      card.opacity.pos = card.opacity.dest = DRAG_OPACITY;
      card.opacity.v = 0;
    }
  }

  let animationTime = st.animatedUntilTime ?? now;
  const steps = Math.min(300, Math.floor((now - animationTime) / MS_PER_ANIMATION_STEP));
  if (steps > 0) animationTime += steps * MS_PER_ANIMATION_STEP;

  for (let step = 0; step < steps; step += 1) {
    for (const card of cards) {
      if (card.id === st.draggedCardId) continue;
      springStep(card.x);
      springStep(card.y);
      springStep(card.scale);
      springStep(card.opacity);
    }
  }

  if (st.lastDraggedCardId != null) {
    const releasedCard = cardsById.get(st.lastDraggedCardId);
    if (releasedCard != null && cardSettled(releasedCard)) st.lastDraggedCardId = null;
  }

  for (const card of cards) {
    if (card.node == null) continue;
    card.node.style.transform = `translate3d(${card.x.pos}px, ${card.y.pos}px, 0) scale(${card.scale.pos})`;
    card.node.style.opacity = `${card.opacity.pos}`;
    card.node.style.zIndex = `${cardZIndex(st.orderedCardIds, st.draggedCardId, st.lastDraggedCardId, card.id)}`;
    card.node.style.cursor = card.id === st.draggedCardId ? "grabbing" : "grab";
  }

  document.body.style.cursor = st.draggedCardId == null ? "" : "grabbing";

  st.events.pointerDown = null;
  st.events.pointerMove = null;
  st.events.pointerUp = null;

  const stillAnimating = anyCardAnimating();
  const keepTicking = stillAnimating || st.draggedCardId != null;
  st.animatedUntilTime = keepTicking ? animationTime : null;
  return keepTicking;
}

for (const card of cards) createCardNode(card);

app.addEventListener("pointerdown", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const cardNode = target.closest(".card");
  if (!(cardNode instanceof HTMLElement)) return;

  event.preventDefault();
  st.events.pointerDown = {
    cardId: Number(cardNode.dataset.cardId),
    pointerId: event.pointerId,
    x: event.pageX,
    y: event.pageY,
    time: event.timeStamp,
  };
  scheduleRender();
});

window.addEventListener(
  "pointermove",
  (event) => {
    if (st.dragPointerId == null && st.events.pointerDown == null) return;
    st.events.pointerMove = {
      pointerId: event.pointerId,
      x: event.pageX,
      y: event.pageY,
      time: event.timeStamp,
    };
    scheduleRender();
  },
  { passive: true },
);

for (const eventName of ["pointerup", "pointercancel"]) {
  window.addEventListener(eventName, (event) => {
    if (st.dragPointerId == null && st.events.pointerDown == null) return;
    st.events.pointerUp = {
      pointerId: event.pointerId,
      x: event.pageX,
      y: event.pageY,
      time: event.timeStamp,
    };
    scheduleRender();
  });
}

window.addEventListener("resize", () => scheduleRender());

render(document.timeline.currentTime ?? 0);
runScenarioIfNeeded();
