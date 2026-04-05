export const CARD_WIDTH = 120;
export const CARD_HEIGHT = 80;
export const CORNER_PAD = 20;
export const CORNER_MARKER_SIZE = 16;
export const REST_MARKER_SIZE = 10;
export const MS_PER_ANIMATION_STEP = 4;
export const SPRING_STIFFNESS = 290;
export const SPRING_DAMPING = 24;
export const DECAY_FRICTION = 4.5;
export const RECENT_POINTER_WINDOW_MS = 100;

export function getCornerPositions({
  viewportWidth,
  viewportHeight,
  cardWidth = CARD_WIDTH,
  cardHeight = CARD_HEIGHT,
  cornerPad = CORNER_PAD,
}) {
  return {
    "top-left": { x: cornerPad, y: cornerPad },
    "top-right": { x: viewportWidth - cornerPad - cardWidth, y: cornerPad },
    "bottom-left": { x: cornerPad, y: viewportHeight - cornerPad - cardHeight },
    "bottom-right": {
      x: viewportWidth - cornerPad - cardWidth,
      y: viewportHeight - cornerPad - cardHeight,
    },
  };
}

export function pickNearestCorner(position, corners) {
  let bestCornerId = null;
  let bestDistanceSquared = Number.POSITIVE_INFINITY;

  for (const [cornerId, cornerPosition] of Object.entries(corners)) {
    const dx = cornerPosition.x - position.x;
    const dy = cornerPosition.y - position.y;
    const distanceSquared = dx * dx + dy * dy;

    if (distanceSquared < bestDistanceSquared) {
      bestCornerId = cornerId;
      bestDistanceSquared = distanceSquared;
    }
  }

  return bestCornerId;
}

export function getDecayRestPosition({ position, velocity, friction = DECAY_FRICTION }) {
  return {
    x: position.x + velocity.x / friction,
    y: position.y + velocity.y / friction,
  };
}

export function estimateReleaseVelocity({
  samples,
  releaseTime,
  recentWindowMs = RECENT_POINTER_WINDOW_MS,
}) {
  if (samples.length < 2) {
    return { x: 0, y: 0 };
  }

  const thresholdTime = releaseTime - recentWindowMs;
  let anchorSample = samples[0];

  for (const sample of samples) {
    if (sample.time >= thresholdTime) {
      anchorSample = sample;
      break;
    }

    anchorSample = sample;
  }

  const lastSample = samples[samples.length - 1];
  const elapsedMs = Math.max(1, releaseTime - anchorSample.time);

  return {
    x: ((lastSample.x - anchorSample.x) / elapsedMs) * 1000,
    y: ((lastSample.y - anchorSample.y) / elapsedMs) * 1000,
  };
}

export function createSpring(initialPosition) {
  return {
    pos: initialPosition,
    dest: initialPosition,
    vel: 0,
  };
}

export function stepSpring(
  spring,
  dtSeconds,
  stiffness = SPRING_STIFFNESS,
  damping = SPRING_DAMPING,
) {
  const displacement = spring.dest - spring.pos;
  const acceleration = displacement * stiffness - spring.vel * damping;

  spring.vel += acceleration * dtSeconds;
  spring.pos += spring.vel * dtSeconds;

  if (Math.abs(spring.dest - spring.pos) <= 0.01 && Math.abs(spring.vel) <= 0.01) {
    spring.pos = spring.dest;
    spring.vel = 0;
  }
}

export function isSpringSettled(spring, positionEpsilon = 0.5, velocityEpsilon = 4) {
  return (
    Math.abs(spring.dest - spring.pos) <= positionEpsilon &&
    Math.abs(spring.vel) <= velocityEpsilon
  );
}

export function pointInRect(point, rect) {
  return (
    point.x >= rect.left &&
    point.x <= rect.left + rect.width &&
    point.y >= rect.top &&
    point.y <= rect.top + rect.height
  );
}

export function roundPoint(point) {
  return {
    x: Math.round(point.x),
    y: Math.round(point.y),
  };
}
