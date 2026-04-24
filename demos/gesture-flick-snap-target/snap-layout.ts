// Pure snap geometry for gesture-flick-snap-target.
// The demo imports it.

export const pipW = 120
export const pipH = 80
export const cornerPad = 20
export const decayFriction = 4.5

/** @fit
 * return.length == 4
 * return[].x: 20..3860
 * return[].y: 20..3900
 */
export function getCorners(
  w: number, // @fit 160..4000
  h: number, // @fit 120..4000
) {
  return [
    {x: cornerPad, y: cornerPad},
    {x: w - pipW - cornerPad, y: cornerPad},
    {x: cornerPad, y: h - pipH - cornerPad},
    {x: w - pipW - cornerPad, y: h - pipH - cornerPad},
  ]
}

export function nearestCorner(x: number, y: number, w: number, h: number) {
  const corners = getCorners(w, h)
  let best = corners[0]!, bestDist = Infinity
  for (let i = 0; i < corners.length; i++) {
    const c = corners[i]!
    const d = (c.x - x) ** 2 + (c.y - y) ** 2
    if (d < bestDist) { bestDist = d; best = c }
  }
  return best
}

/** @fit
 * return == pos + velocity / decayFriction
 */
export function decayRestPos(pos: number, velocity: number) {
  return pos + velocity / decayFriction
}
