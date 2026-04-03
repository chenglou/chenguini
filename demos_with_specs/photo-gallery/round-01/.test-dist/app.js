// data.ts
var photoGalleryData = [
  { id: "d228330c-7364-497b-994f-a37467ae436a/0_0", w: 2048, h: 2048, prompt: "Miniature watermelon delicately balanced on fingertip" },
  { id: "7b5301ca-ef01-44bd-8bcc-4473c945aaaf/0_0", w: 1792, h: 2688, prompt: "Hourglass heart, liquid, grand canyon background, fleeting, ephemerality of time" },
  { id: "96ff81dd-fa46-43c0-b681-35b7cd8eb700/0_0", w: 1792, h: 2688, prompt: "A phone held extremely close against an xray of a skeleton sitting on a sofa, side by side view" },
  { id: "077ddfbf-4f1a-437f-909e-073ec48beae0/0_0", w: 1344, h: 896, prompt: "Eclipse in a tiny keychain bottle, dangling around a walking woman's purse, dynamic pose, macro photography" },
  { id: "e1d06d80-68ca-4081-9ca2-73f5ba7333cc/0_3", w: 1536, h: 768, prompt: "Tetris monuments in lord of the rings setting" },
  { id: "196ff609-69c8-47be-8d92-e9ba9db95e2c/0_3", w: 848, h: 1424, prompt: "Peaceful prehistoric marine lagaxy life, adventure, bold outlines, bold colors, psychedelic swirls patterns" },
  { id: "daa6883b-75ae-4805-9fe8-d394006ca8ca/0_1", w: 1024, h: 1024, prompt: "Apple WWDC promo, dan mumford" },
  { id: "0dcaf55a-6ece-42b1-a0b3-eb753d108415/0_3", w: 1424, h: 848, prompt: "Everything everywhere all at once, bold outlines" },
  { id: "cfd235ab-89b2-4834-9544-19768f160d2a/0_1", w: 1344, h: 896, prompt: "Cute and fluffy marshmallow modern mansion" },
  { id: "ab740a8e-54af-452a-9b74-7b8cb233c025/0_0", w: 1024, h: 1024, prompt: "Voronoi 3D printed cup taking roots" },
  { id: "bcf32fdc-6d81-40f0-9063-d67cb402ea2a/0_0", w: 1344, h: 1024, prompt: "Marble sculpture of an orange, museum gallery, exhibit" },
  { id: "eb145f80-0196-4557-8560-e33637a3a807/0_0", w: 864, h: 1728, prompt: "hourglass heart, liquid, grand canyon background" },
  { id: "604af437-f76b-4c7f-b778-1a3bf6ad663b/0_0", w: 1024, h: 1024, prompt: "Golden retriever rising from the thick smokes, silhouette, contour" },
  { id: "b6beb80d-b006-45e0-a06d-5e482b541571/0_0", w: 2304, h: 1536, prompt: "Jupiter sitting on a chair on Saturn" },
  { id: "30d33a33-9b5b-4947-b813-4d0c5c2f9939/0_0", w: 1536, h: 1024, prompt: "Chinese mid autumn festival on Neptune, surrealism" },
  { id: "fb622e95-814d-4f74-8ac0-04d266c8387d/0_0", w: 1664, h: 2432, prompt: "eclipse in a bottle" },
  { id: "733a5b94-3f35-4357-8ef5-645d1a9bb942/0_0", w: 1024, h: 1536, prompt: "silk-like silhouette of koi fish, abstract wall paper, volumetric lighting" },
  { id: "2ca7a0f7-9153-45ce-be2b-1fc89327f61b/0_0", w: 2304, h: 1536, prompt: "futuristic qipao, pink seamless astronaut skirt, sitting cross-legged at a floating space cafe, looking at camera, high angle, depth of field" },
  { id: "890a8dbb-93f6-4934-a92f-7dde390410e0/0_0", w: 1024, h: 1536, prompt: "website landing page of a company with photos of streets and tiles" },
  { id: "11048abd-2c7e-42de-929b-bad5d810b3a3/0_0", w: 1024, h: 1024, prompt: "dead tree and castle shaped like the silhouette of a skull, negative space" },
  { id: "a812ad46-f902-427e-804b-68f5a55f2264/0_0", w: 1024, h: 1024, prompt: "closed up macrophotography of a bowl of asian dessert" },
  { id: "4481ad84-444d-4761-adb1-15d470f216da/0_0", w: 1536, h: 1536, prompt: "the cutest little cartoon octopus wearing a cap in a bathtub, she's playing with a toy boat, studio lighting, closed-up, hyperrealistic, photoshoot, tilt shift, contrast, intricate details" },
  { id: "50be9117-b2f5-482f-b61f-46477ed6184e/0_0", w: 1024, h: 1536, prompt: "three-body problem, cinematic" },
  { id: "39428453-9b30-4998-a3d6-4668b4e2621f/0_0", w: 1536, h: 1536, prompt: "super mario gundam" }
];
function getLowResPhotoUrl(id) {
  return `https://cdn.midjourney.com/${id}_384_N.webp`;
}
function getHighResPhotoUrl(id) {
  return `https://cdn.midjourney.com/${id}.webp`;
}

// layout.ts
var GRID_MIN_CARD_WIDTH = 220;
var GRID_MAX_COLUMNS = 7;
var GRID_GAP = 24;
var GRID_TOP_PADDING = 40;
var GRID_CAPTION_HEIGHT = 52;
var GRID_BOTTOM_PADDING = 480;
var GRID_SIDE_PADDING = 32;
var LINE_SIDE_HIT_WIDTH = 100;
var LINE_GAP = 52;
var LINE_TOP_PADDING = 40;
var LINE_CAPTION_HEIGHT = 72;
var LINE_IMAGE_TO_CAPTION_GAP = 28;
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
function fitPhotoWithinBox(photo, maxWidth, maxHeight) {
  const aspect = photo.w / photo.h;
  const width = Math.min(photo.w, maxWidth, maxHeight * aspect);
  return { width, height: width / aspect };
}
function computeColumnCount(containerWidth) {
  return clamp(Math.floor((containerWidth + GRID_GAP) / (GRID_MIN_CARD_WIDTH + GRID_GAP)), 1, GRID_MAX_COLUMNS);
}
function computeGridBoxSize(photo, boxMaxSizeX) {
  const aspect = photo.w / photo.h;
  const imageMaxHeight = Math.abs(aspect - 1) < 0.05 ? boxMaxSizeX * 0.85 : aspect < 1 ? boxMaxSizeX * 1.05 : boxMaxSizeX;
  const imageWidth = Math.min(photo.w, boxMaxSizeX, imageMaxHeight * aspect);
  const imageHeight = imageWidth / aspect;
  return {
    width: imageWidth,
    height: imageHeight + GRID_CAPTION_HEIGHT,
    imageWidth,
    imageHeight,
    captionHeight: GRID_CAPTION_HEIGHT
  };
}
function computeGridLayout(photos, containerWidth) {
  const columnCount = computeColumnCount(containerWidth);
  const columnWidth = (containerWidth - GRID_GAP * Math.max(0, columnCount - 1)) / columnCount;
  const rowCount = Math.ceil(photos.length / columnCount);
  const rows = [];
  const rowHeights = new Array(rowCount).fill(0);
  for (let index = 0;index < photos.length; index++) {
    const rowIndex = Math.floor(index / columnCount);
    const box = computeGridBoxSize(photos[index], columnWidth);
    rowHeights[rowIndex] = Math.max(rowHeights[rowIndex], box.height);
  }
  let rowY = GRID_TOP_PADDING;
  for (let rowIndex = 0;rowIndex < rowCount; rowIndex++) {
    const startIndex = rowIndex * columnCount;
    const endIndex = Math.min(photos.length - 1, startIndex + columnCount - 1);
    const height = rowHeights[rowIndex];
    rows.push({ index: rowIndex, y: rowY, height, startIndex, endIndex });
    rowY += height + GRID_GAP;
  }
  const cards = [];
  for (let index = 0;index < photos.length; index++) {
    const photo = photos[index];
    const rowIndex = Math.floor(index / columnCount);
    const columnIndex = index % columnCount;
    const row = rows[rowIndex];
    const box = computeGridBoxSize(photo, columnWidth);
    const columnX = columnIndex * (columnWidth + GRID_GAP);
    const x = columnX + (columnWidth - box.width) / 2;
    cards.push({
      id: photo.id,
      index,
      rowIndex,
      columnIndex,
      x,
      y: row.y,
      width: box.width,
      height: box.height,
      imageWidth: box.imageWidth,
      imageHeight: box.imageHeight,
      captionHeight: box.captionHeight
    });
  }
  const lastRow = rows.at(-1);
  return {
    columnCount,
    columnWidth,
    rows,
    cards,
    totalHeight: lastRow == null ? GRID_TOP_PADDING + GRID_BOTTOM_PADDING : lastRow.y + lastRow.height + GRID_BOTTOM_PADDING
  };
}
function computeVisibleGridIds(layout, scrollTop, viewportHeight, overscan = 320) {
  const minY = scrollTop - overscan;
  const maxY = scrollTop + viewportHeight + overscan;
  const visibleIds = [];
  for (const card of layout.cards) {
    if (card.y + card.height < minY || card.y > maxY)
      continue;
    visibleIds.push(card.id);
  }
  return visibleIds;
}
function findFirstVisibleCard(layout, scrollTop, viewportHeight) {
  const minY = scrollTop;
  const maxY = scrollTop + viewportHeight;
  for (const card of layout.cards) {
    if (card.y + card.height >= minY && card.y <= maxY)
      return card;
  }
  return null;
}
function findGridCardById(layout, id) {
  for (const card of layout.cards) {
    if (card.id === id)
      return card;
  }
  return null;
}
function computeLineLayout(photos, focusedIndex, viewportWidth, viewportHeight) {
  const imageAreaHeight = Math.max(220, viewportHeight - LINE_TOP_PADDING - LINE_CAPTION_HEIGHT - LINE_IMAGE_TO_CAPTION_GAP - 36);
  const imageAreaTop = Math.max(LINE_TOP_PADDING, (viewportHeight - (imageAreaHeight + LINE_IMAGE_TO_CAPTION_GAP + LINE_CAPTION_HEIGHT)) / 2);
  const baseMaxWidth = Math.max(260, Math.min(viewportWidth * 0.52, viewportWidth - 360));
  const cards = new Array(photos.length);
  for (let index = 0;index < photos.length; index++) {
    const photo = photos[index];
    const scale = index === focusedIndex ? 1 : 0.7;
    const fitted = fitPhotoWithinBox(photo, baseMaxWidth, imageAreaHeight);
    const width = fitted.width * scale;
    const imageHeight = fitted.height * scale;
    const height = imageHeight + LINE_IMAGE_TO_CAPTION_GAP + LINE_CAPTION_HEIGHT;
    const y = imageAreaTop + (imageAreaHeight - imageHeight) / 2;
    cards[index] = {
      id: photo.id,
      index,
      x: 0,
      y,
      width,
      height,
      imageWidth: width,
      imageHeight,
      captionHeight: LINE_CAPTION_HEIGHT,
      scale
    };
  }
  const focusedCard = cards[focusedIndex];
  focusedCard.x = viewportWidth / 2 - focusedCard.width / 2;
  let cursorRight = focusedCard.x + focusedCard.width + LINE_GAP;
  for (let index = focusedIndex + 1;index < cards.length; index++) {
    const card = cards[index];
    card.x = cursorRight;
    cursorRight += card.width + LINE_GAP;
  }
  let cursorLeft = focusedCard.x - LINE_GAP;
  for (let index = focusedIndex - 1;index >= 0; index--) {
    const card = cards[index];
    card.x = cursorLeft - card.width;
    cursorLeft = card.x - LINE_GAP;
  }
  return { cards, focusedIndex, imageAreaTop, imageAreaHeight };
}
function routeLineModeClick({
  x,
  viewportWidth
}) {
  if (x < LINE_SIDE_HIT_WIDTH)
    return "previous";
  if (x > viewportWidth - LINE_SIDE_HIT_WIDTH)
    return "next";
  return "dismiss";
}

// index.ts
var dom = {
  scrollRoot: document.getElementById("scroll-root"),
  gridContent: document.getElementById("grid-content"),
  stage: document.getElementById("stage"),
  lineLayer: document.getElementById("line-layer"),
  navLeft: document.getElementById("nav-left"),
  navRight: document.getElementById("nav-right"),
  semanticReport: document.getElementById("semantic-report")
};
var domCache = {
  cards: new Map
};
var motionById = new Map;
var photoIndexById = new Map;
for (let index = 0;index < photoGalleryData.length; index++) {
  photoIndexById.set(photoGalleryData[index].id, index);
}
var reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
var isAutomationRun = new URLSearchParams(window.location.search).has("requestId");
var st = {
  scheduledRaf: null,
  lastNow: null,
  viewportWidth: 0,
  viewportHeight: 0,
  storedScrollTop: 0,
  previousGridLayout: null,
  previousRouteType: null,
  previousFocusedId: null,
  scrollAnchor: null,
  pointer: {
    x: 0,
    y: 0,
    target: null,
    inside: false
  },
  clickEvent: null,
  keydownEvent: null,
  scenarioStarted: false,
  lastSnapshot: null,
  forcedDismissToId: null,
  returnToGridId: null
};
var msPerAnimationStep = 6;
function clamp2(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
function spring(value) {
  return { current: value, target: value, velocity: 0 };
}
function createMotionFromRect(rect) {
  return {
    x: spring(rect.x),
    y: spring(rect.y),
    width: spring(rect.width),
    height: spring(rect.height),
    scale: spring(1),
    driftX: spring(0),
    driftY: spring(0),
    opacity: spring(rect.opacity ?? 1),
    brightness: spring(1),
    blur: spring(0)
  };
}
function stepSpring(value, deltaMs) {
  if (reducedMotionQuery.matches) {
    value.current = value.target;
    value.velocity = 0;
    return;
  }
  const steps = Math.max(1, Math.min(300, Math.floor(deltaMs / msPerAnimationStep)));
  const t = msPerAnimationStep / 1000;
  for (let step = 0;step < steps; step++) {
    const stretch = value.current - value.target;
    const force = -333 * stretch - 33 * value.velocity;
    value.velocity += force * t;
    value.current += value.velocity * t;
  }
  if (Math.abs(value.velocity) < 0.01 && Math.abs(value.target - value.current) < 0.01) {
    value.current = value.target;
    value.velocity = 0;
  }
}
function retarget(value, target, snap) {
  value.target = target;
  if (snap || reducedMotionQuery.matches) {
    value.current = target;
    value.velocity = 0;
  }
}
function isAnimating(value) {
  return Math.abs(value.current - value.target) > 0.01 || Math.abs(value.velocity) > 0.01;
}
function parseRoute() {
  const hashValue = window.location.hash.startsWith("#") ? decodeURIComponent(window.location.hash.slice(1)) : "";
  if (hashValue !== "" && photoIndexById.has(hashValue)) {
    return { type: "line", focusedId: hashValue };
  }
  return { type: "grid" };
}
function navigate(route) {
  if (route.type === "grid") {
    if (window.location.hash !== "") {
      window.history.pushState({ type: "grid" }, "", `${window.location.pathname}${window.location.search}`);
    }
  } else if (window.location.hash !== `#${route.focusedId}`) {
    window.location.hash = route.focusedId;
  }
}
function focusPhoto(id) {
  navigate({ type: "line", focusedId: id });
  if (render(performance.now()))
    scheduleRender();
}
function dismissToGrid(id) {
  st.forcedDismissToId = id;
  st.returnToGridId = id;
  navigate({ type: "grid" });
  if (render(performance.now()))
    scheduleRender();
}
function scheduleRender() {
  if (st.scheduledRaf != null)
    return;
  st.scheduledRaf = window.requestAnimationFrame((now) => {
    st.scheduledRaf = null;
    if (render(now))
      scheduleRender();
  });
}
function createCardNode(photo) {
  const card = document.createElement("div");
  card.className = "photo-card";
  card.dataset.photoId = photo.id;
  if (!isAutomationRun) {
    card.style.backgroundImage = `linear-gradient(180deg, rgba(9, 16, 26, 0.04), rgba(9, 16, 26, 0.54)), url(${getLowResPhotoUrl(photo.id)})`;
  }
  const media = document.createElement("div");
  media.className = "photo-image-shell";
  media.dataset.photoMedia = photo.id;
  if (!isAutomationRun) {
    media.style.backgroundImage = `url(${getLowResPhotoUrl(photo.id)})`;
  }
  const img = document.createElement("img");
  img.className = "photo-hires";
  img.alt = photo.prompt;
  img.draggable = false;
  const caption = document.createElement("div");
  caption.textContent = photo.prompt;
  media.append(img);
  card.append(media, caption);
  return { card, media, img, caption };
}
function ensureCardNode(photo) {
  let node = domCache.cards.get(photo.id);
  if (node == null) {
    node = createCardNode(photo);
    domCache.cards.set(photo.id, node);
  }
  return node;
}
function mountVisibleCards(visibleIds) {
  for (const photo of photoGalleryData) {
    const node = ensureCardNode(photo);
    const shouldMount = visibleIds.has(photo.id);
    if (shouldMount) {
      if (node.card.parentNode == null)
        dom.stage.append(node.card);
    } else if (node.card.parentNode != null) {
      node.card.remove();
    }
  }
}
function getHoveredPhotoId() {
  const target = st.pointer.target;
  if (!st.pointer.inside || !(target instanceof HTMLElement))
    return null;
  if (target.closest('[data-caption-kind="grid"]') != null)
    return null;
  const card = target.closest("[data-photo-id]");
  if (card == null)
    return null;
  const photoId = card.dataset.photoId;
  return photoId == null ? null : photoId;
}
function maybePickScrollAnchor(layout, scrollTop, viewportHeight) {
  const anchor = findFirstVisibleCard(layout, scrollTop, viewportHeight);
  if (anchor == null)
    return null;
  return { id: anchor.id, prevY: anchor.y };
}
function readCardViewportRect(card, scrollTop) {
  return {
    x: GRID_SIDE_PADDING + card.x,
    y: card.y - scrollTop,
    width: card.width,
    height: card.height
  };
}
function updateSemanticReport(report) {
  dom.semanticReport.textContent = JSON.stringify(report);
}
function publishSnapshot(snapshot) {
  st.lastSnapshot = snapshot;
}
async function waitForCondition(predicate, timeoutMs = 8000) {
  const startedAt = performance.now();
  while (!predicate()) {
    if (performance.now() - startedAt > timeoutMs) {
      throw new Error("Timed out while waiting for page state");
    }
    await new Promise((resolve) => window.setTimeout(resolve, 16));
  }
}
async function runAutomationScenario() {
  const params = new URLSearchParams(window.location.search);
  const scenario = params.get("scenario");
  const requestId = params.get("requestId");
  if (scenario == null || requestId == null || st.scenarioStarted)
    return;
  st.scenarioStarted = true;
  updateSemanticReport({
    status: "loading",
    requestId,
    scenario
  });
  try {
    await waitForCondition(() => st.lastSnapshot != null);
    await new Promise((resolve) => window.setTimeout(resolve, 200));
    if (render(performance.now()))
      scheduleRender();
    if (scenario === "navigation-flow") {
      const firstId = photoGalleryData[0].id;
      const secondId = photoGalleryData[1].id;
      focusPhoto(firstId);
      await waitForCondition(() => st.lastSnapshot?.mode === "line" && st.lastSnapshot.focusedId === firstId);
      const afterOpen = st.lastSnapshot;
      if (afterOpen == null)
        throw new Error("Missing open snapshot");
      focusPhoto(secondId);
      await waitForCondition(() => st.lastSnapshot?.mode === "line" && st.lastSnapshot.focusedId === secondId);
      const afterNext = st.lastSnapshot;
      if (afterNext == null)
        throw new Error("Missing next snapshot");
      dismissToGrid(secondId);
      await waitForCondition(() => st.lastSnapshot?.mode === "grid" && st.lastSnapshot.hash === "");
      const afterDismiss = st.lastSnapshot;
      if (afterDismiss == null)
        throw new Error("Missing dismiss snapshot");
      updateSemanticReport({
        status: "ready",
        requestId,
        scenario,
        steps: [
          {
            label: "after-open",
            mode: afterOpen.mode,
            focusedId: afterOpen.focusedId,
            hash: afterOpen.hash
          },
          {
            label: "after-next",
            mode: afterNext.mode,
            focusedId: afterNext.focusedId,
            hash: afterNext.hash
          },
          {
            label: "after-dismiss",
            mode: afterDismiss.mode,
            focusedId: afterDismiss.focusedId,
            hash: afterDismiss.hash
          }
        ]
      });
      return;
    }
    if (scenario === "dismiss-to-row") {
      const targetId = "890a8dbb-93f6-4934-a92f-7dde390410e0/0_0";
      focusPhoto(targetId);
      await waitForCondition(() => st.lastSnapshot?.mode === "line" && st.lastSnapshot.focusedId === targetId);
      const beforeDismiss = st.lastSnapshot;
      if (beforeDismiss == null)
        throw new Error("Missing before-dismiss snapshot");
      dismissToGrid(targetId);
      await waitForCondition(() => st.lastSnapshot?.mode === "grid" && st.lastSnapshot.hash === "");
      const afterDismiss = st.lastSnapshot;
      if (afterDismiss == null)
        throw new Error("Missing after-dismiss snapshot");
      const containerWidth = Math.max(220, dom.scrollRoot.clientWidth - GRID_SIDE_PADDING * 2);
      const layout = computeGridLayout(photoGalleryData, containerWidth);
      const targetCard = findGridCardById(layout, targetId);
      if (targetCard == null)
        throw new Error("Missing target card");
      updateSemanticReport({
        status: "ready",
        requestId,
        scenario,
        beforeDismiss: {
          mode: beforeDismiss.mode,
          focusedId: beforeDismiss.focusedId,
          hash: beforeDismiss.hash,
          scrollTop: beforeDismiss.scrollTop
        },
        afterDismiss: {
          mode: afterDismiss.mode,
          focusedId: afterDismiss.focusedId,
          hash: afterDismiss.hash,
          scrollTop: afterDismiss.scrollTop,
          targetViewportTop: targetCard.y - afterDismiss.scrollTop,
          targetVisible: targetCard.y + targetCard.height >= afterDismiss.scrollTop && targetCard.y <= afterDismiss.scrollTop + dom.scrollRoot.clientHeight,
          columnCount: layout.columnCount,
          targetY: targetCard.y,
          containerWidth
        }
      });
      return;
    }
    updateSemanticReport({
      status: "error",
      requestId,
      scenario,
      message: `Unknown scenario: ${scenario}`
    });
  } catch (error) {
    updateSemanticReport({
      status: "error",
      requestId,
      scenario,
      message: error instanceof Error ? error.message : String(error)
    });
  }
}
function render(now) {
  const viewportWidth = dom.scrollRoot.clientWidth;
  const viewportHeight = dom.scrollRoot.clientHeight;
  const scrollTop = dom.scrollRoot.scrollTop;
  const containerWidth = Math.max(220, viewportWidth - GRID_SIDE_PADDING * 2);
  const gridLayout = computeGridLayout(photoGalleryData, containerWidth);
  let route = parseRoute();
  let dismissToId = st.forcedDismissToId;
  st.forcedDismissToId = null;
  let returnToGridId = st.returnToGridId;
  let nextRoute = null;
  const focusedIndex = route.type === "line" ? photoIndexById.get(route.focusedId) : null;
  if (st.keydownEvent != null) {
    const event = st.keydownEvent;
    if (event.key === "Escape" && route.type === "line") {
      event.preventDefault();
      dismissToId = route.focusedId;
      returnToGridId = route.focusedId;
      nextRoute = { type: "grid" };
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (route.type === "grid") {
        nextRoute = { type: "line", focusedId: photoGalleryData[0].id };
      } else if (focusedIndex > 0) {
        nextRoute = { type: "line", focusedId: photoGalleryData[focusedIndex - 1].id };
      }
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      if (route.type === "grid") {
        nextRoute = { type: "line", focusedId: photoGalleryData[0].id };
      } else if (focusedIndex < photoGalleryData.length - 1) {
        nextRoute = { type: "line", focusedId: photoGalleryData[focusedIndex + 1].id };
      }
    }
  }
  if (st.clickEvent != null) {
    const target = st.clickEvent.target;
    if (target instanceof HTMLElement && target.closest("#chrome-link") == null) {
      if (route.type === "grid") {
        if (target.closest('[data-caption-kind="grid"]') == null) {
          const card = target.closest("[data-photo-id]");
          const photoId = card?.dataset.photoId;
          if (photoId != null)
            nextRoute = { type: "line", focusedId: photoId };
        }
      } else {
        if (target.closest('[data-caption-kind="line"]') == null) {
          const action = routeLineModeClick({
            x: st.clickEvent.clientX,
            viewportWidth
          });
          if (action === "previous" && focusedIndex > 0) {
            nextRoute = { type: "line", focusedId: photoGalleryData[focusedIndex - 1].id };
          } else if (action === "next" && focusedIndex < photoGalleryData.length - 1) {
            nextRoute = { type: "line", focusedId: photoGalleryData[focusedIndex + 1].id };
          } else {
            dismissToId = route.focusedId;
            returnToGridId = route.focusedId;
            nextRoute = { type: "grid" };
          }
        }
      }
    }
  }
  if (nextRoute != null)
    route = nextRoute;
  let adjustedScrollTop = scrollTop;
  const maxScrollTop = Math.max(0, gridLayout.totalHeight - viewportHeight);
  const userScrolled = scrollTop !== st.storedScrollTop;
  if (route.type === "grid") {
    if (userScrolled || st.scrollAnchor == null || st.previousGridLayout == null) {
      st.scrollAnchor = maybePickScrollAnchor(gridLayout, scrollTop, viewportHeight);
    } else {
      const anchorCard = findGridCardById(gridLayout, st.scrollAnchor.id);
      if (anchorCard != null) {
        adjustedScrollTop = clamp2(scrollTop + (anchorCard.y - st.scrollAnchor.prevY), 0, maxScrollTop);
        st.scrollAnchor.prevY = anchorCard.y;
      }
    }
    const revealId = dismissToId ?? returnToGridId;
    if (revealId != null) {
      const targetCard = findGridCardById(gridLayout, revealId);
      if (targetCard != null) {
        adjustedScrollTop = clamp2(targetCard.y - 40, 0, maxScrollTop);
      }
    }
  } else {
    st.scrollAnchor = maybePickScrollAnchor(gridLayout, scrollTop, viewportHeight);
  }
  const hoveredPhotoId = route.type === "grid" ? getHoveredPhotoId() : null;
  const lineLayout = route.type === "line" ? computeLineLayout(photoGalleryData, focusedIndex, viewportWidth, viewportHeight) : null;
  const deltaMs = st.lastNow == null ? 16 : Math.min(1200, now - st.lastNow);
  st.lastNow = now;
  const visibleIds = route.type === "line" ? photoGalleryData.map((photo) => photo.id) : computeVisibleGridIds(gridLayout, adjustedScrollTop, viewportHeight);
  const mountedIds = new Set(visibleIds);
  for (let index = 0;index < photoGalleryData.length; index++) {
    const photo = photoGalleryData[index];
    const motion = motionById.get(photo.id);
    const previousGridCard = st.previousGridLayout == null ? null : findGridCardById(st.previousGridLayout, photo.id);
    const currentGridCard = findGridCardById(gridLayout, photo.id);
    let initialRect = null;
    if (route.type === "grid") {
      if (currentGridCard != null) {
        initialRect = readCardViewportRect(currentGridCard, adjustedScrollTop);
      }
    } else if (lineLayout != null) {
      const lineCard = lineLayout.cards[index];
      initialRect = {
        x: lineCard.x,
        y: lineCard.y,
        width: lineCard.width,
        height: lineCard.height
      };
    }
    const nextMotion = motion ?? createMotionFromRect(initialRect ?? { x: 0, y: 0, width: 10, height: 10, opacity: 0 });
    motionById.set(photo.id, nextMotion);
    let targetX = nextMotion.x.target;
    let targetY = nextMotion.y.target;
    let targetWidth = nextMotion.width.target;
    let targetHeight = nextMotion.height.target;
    let targetScale = 1;
    let targetDriftX = 0;
    let targetDriftY = 0;
    let targetOpacity = 1;
    let targetBrightness = 1;
    let targetBlur = 0;
    let snapBox = false;
    if (route.type === "grid") {
      if (currentGridCard == null) {
        targetOpacity = 0;
      } else {
        const viewportRect = readCardViewportRect(currentGridCard, adjustedScrollTop);
        targetX = viewportRect.x;
        targetY = viewportRect.y;
        targetWidth = viewportRect.width;
        targetHeight = viewportRect.height;
        targetOpacity = mountedIds.has(photo.id) ? 1 : 0;
        if (st.previousRouteType === "grid" && previousGridCard != null && previousGridCard.rowIndex === currentGridCard.rowIndex && previousGridCard.columnIndex === currentGridCard.columnIndex && st.previousGridLayout?.columnCount === gridLayout.columnCount) {
          snapBox = true;
        }
        if (hoveredPhotoId === photo.id) {
          const centerX = targetX + targetWidth / 2;
          const centerY = targetY + currentGridCard.imageHeight / 2;
          targetScale = 1.02;
          targetDriftX = clamp2((st.pointer.x - centerX) * 0.06, -12, 12);
          targetDriftY = clamp2((st.pointer.y - centerY) * 0.06, -10, 10);
        }
        if (st.previousRouteType === "line" && st.previousFocusedId === photo.id) {
          snapBox = false;
        }
      }
    } else if (lineLayout != null) {
      const lineCard = lineLayout.cards[index];
      const distance = Math.abs(index - focusedIndex);
      const navHover2 = st.pointer.inside && st.pointer.x < LINE_SIDE_HIT_WIDTH ? "previous" : st.pointer.inside && st.pointer.x > viewportWidth - LINE_SIDE_HIT_WIDTH ? "next" : null;
      targetX = lineCard.x;
      targetY = lineCard.y;
      targetWidth = lineCard.width;
      targetHeight = lineCard.height;
      targetOpacity = 1;
      targetBrightness = index === focusedIndex ? 1 : distance === 1 ? 0.72 : 0.58;
      targetBlur = distance === 1 ? 0.8 : 0;
      if (navHover2 === "previous" && index === focusedIndex - 1) {
        targetScale = 1.04;
        targetBrightness = 0.9;
      } else if (navHover2 === "next" && index === focusedIndex + 1) {
        targetScale = 1.04;
        targetBrightness = 0.9;
      }
    }
    retarget(nextMotion.x, targetX, snapBox);
    retarget(nextMotion.y, targetY, snapBox);
    retarget(nextMotion.width, targetWidth, snapBox);
    retarget(nextMotion.height, targetHeight, snapBox);
    retarget(nextMotion.scale, targetScale, false);
    retarget(nextMotion.driftX, targetDriftX, false);
    retarget(nextMotion.driftY, targetDriftY, false);
    retarget(nextMotion.opacity, targetOpacity, false);
    retarget(nextMotion.brightness, targetBrightness, false);
    retarget(nextMotion.blur, targetBlur, false);
    stepSpring(nextMotion.x, deltaMs);
    stepSpring(nextMotion.y, deltaMs);
    stepSpring(nextMotion.width, deltaMs);
    stepSpring(nextMotion.height, deltaMs);
    stepSpring(nextMotion.scale, deltaMs);
    stepSpring(nextMotion.driftX, deltaMs);
    stepSpring(nextMotion.driftY, deltaMs);
    stepSpring(nextMotion.opacity, deltaMs);
    stepSpring(nextMotion.brightness, deltaMs);
    stepSpring(nextMotion.blur, deltaMs);
  }
  mountVisibleCards(mountedIds);
  let stillAnimating = false;
  for (let index = 0;index < photoGalleryData.length; index++) {
    const photo = photoGalleryData[index];
    const node = ensureCardNode(photo);
    const motion = motionById.get(photo.id);
    const lineCard = route.type === "line" ? lineLayout.cards[index] : null;
    const gridCard = findGridCardById(gridLayout, photo.id);
    const isMounted = node.card.parentNode != null;
    if (!isMounted)
      continue;
    const showHighRes = route.type === "line" && route.focusedId === photo.id;
    if (showHighRes && node.img.src === "" && !isAutomationRun) {
      node.img.src = getHighResPhotoUrl(photo.id);
      node.img.decoding = "async";
      node.img.loading = "eager";
    }
    node.card.style.transform = `translate(${motion.x.current + motion.driftX.current}px, ${motion.y.current + motion.driftY.current}px) scale(${motion.scale.current})`;
    node.card.style.width = `${motion.width.current}px`;
    node.card.style.height = `${motion.height.current}px`;
    node.card.style.opacity = String(motion.opacity.current);
    node.card.style.filter = `brightness(${motion.brightness.current}) blur(${motion.blur.current}px)`;
    node.card.style.zIndex = route.type === "line" ? String(100 + (route.focusedId === photo.id ? 10 : 0) - Math.abs(index - focusedIndex)) : String(10 + index);
    if (route.type === "line" && lineCard != null) {
      node.media.style.left = "0px";
      node.media.style.top = "0px";
      node.media.style.width = `${lineCard.imageWidth}px`;
      node.media.style.height = `${lineCard.imageHeight}px`;
      node.caption.dataset.captionKind = "line";
      node.caption.className = "line-caption";
      node.caption.style.left = "0px";
      node.caption.style.top = `${lineCard.imageHeight + LINE_IMAGE_TO_CAPTION_GAP}px`;
      node.caption.style.width = `${lineCard.width}px`;
      node.caption.style.height = "64px";
      node.caption.style.color = route.focusedId === photo.id ? "rgba(244, 239, 230, 0.96)" : "rgba(244, 239, 230, 0.72)";
      if (route.focusedId === photo.id) {
        node.img.style.opacity = "1";
      } else {
        node.img.style.opacity = "0";
      }
    } else if (gridCard != null) {
      node.media.style.left = "0px";
      node.media.style.top = "0px";
      node.media.style.width = `${gridCard.imageWidth}px`;
      node.media.style.height = `${gridCard.imageHeight}px`;
      node.caption.dataset.captionKind = "grid";
      node.caption.className = "grid-caption";
      node.caption.style.left = "18px";
      node.caption.style.top = "";
      node.caption.style.width = "";
      node.caption.style.height = "44px";
      node.caption.style.color = "rgba(234, 231, 223, 0.9)";
      node.img.style.opacity = "0";
    }
    stillAnimating = stillAnimating || isAnimating(motion.x) || isAnimating(motion.y) || isAnimating(motion.width) || isAnimating(motion.height) || isAnimating(motion.scale) || isAnimating(motion.driftX) || isAnimating(motion.driftY) || isAnimating(motion.opacity) || isAnimating(motion.brightness) || isAnimating(motion.blur);
  }
  const navHover = route.type === "line" && (st.pointer.inside && st.pointer.x < LINE_SIDE_HIT_WIDTH && focusedIndex > 0 || st.pointer.inside && st.pointer.x > viewportWidth - LINE_SIDE_HIT_WIDTH && focusedIndex < photoGalleryData.length - 1);
  const cursor = route.type === "grid" ? hoveredPhotoId == null ? "auto" : "zoom-in" : navHover ? "zoom-in" : "zoom-out";
  document.body.style.cursor = cursor;
  dom.lineLayer.dataset.visible = route.type === "line" ? "true" : "false";
  dom.gridContent.style.height = `${gridLayout.totalHeight}px`;
  dom.scrollRoot.style.overflowY = "auto";
  if (Math.abs(dom.scrollRoot.scrollTop - adjustedScrollTop) > 0.5) {
    dom.scrollRoot.scrollTop = adjustedScrollTop;
  }
  st.storedScrollTop = dom.scrollRoot.scrollTop;
  const snapshot = {
    mode: route.type,
    focusedId: route.type === "line" ? route.focusedId : null,
    hash: window.location.hash,
    cursor,
    visibleIds,
    firstVisibleId: findFirstVisibleCard(gridLayout, st.storedScrollTop, viewportHeight)?.id ?? null,
    scrollTop: st.storedScrollTop
  };
  publishSnapshot(snapshot);
  if (route.type === "grid" && returnToGridId != null) {
    const targetCard = findGridCardById(gridLayout, returnToGridId);
    if (targetCard != null) {
      const targetViewportTop = targetCard.y - snapshot.scrollTop;
      if (targetViewportTop >= 20 && targetViewportTop <= 90) {
        st.returnToGridId = null;
      } else {
        st.returnToGridId = returnToGridId;
        stillAnimating = true;
      }
    }
  } else {
    st.returnToGridId = null;
  }
  st.viewportWidth = viewportWidth;
  st.viewportHeight = viewportHeight;
  st.previousGridLayout = gridLayout;
  st.previousRouteType = route.type;
  st.previousFocusedId = route.type === "line" ? route.focusedId : dismissToId;
  st.clickEvent = null;
  st.keydownEvent = null;
  if (nextRoute != null)
    navigate(nextRoute);
  runAutomationScenario();
  return stillAnimating;
}
window.addEventListener("resize", () => scheduleRender());
window.addEventListener("hashchange", () => scheduleRender());
window.addEventListener("popstate", () => scheduleRender());
window.addEventListener("pointermove", (event) => {
  st.pointer.x = event.clientX;
  st.pointer.y = event.clientY;
  st.pointer.target = event.target;
  st.pointer.inside = true;
  scheduleRender();
});
window.addEventListener("mouseout", (event) => {
  if (event.relatedTarget == null) {
    st.pointer.inside = false;
    st.pointer.target = null;
    scheduleRender();
  }
});
window.addEventListener("click", (event) => {
  st.clickEvent = event;
  scheduleRender();
});
window.addEventListener("keydown", (event) => {
  st.keydownEvent = event;
  scheduleRender();
});
dom.scrollRoot.addEventListener("scroll", () => scheduleRender());
reducedMotionQuery.addEventListener("change", () => scheduleRender());
scheduleRender();
