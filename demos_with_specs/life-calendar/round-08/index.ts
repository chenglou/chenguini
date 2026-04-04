import {
  age,
  bodyBackground,
  computeCellCenter,
  computeCellRect,
  computeGridMetrics,
  currentDayColor,
  currentWeekStartFor,
  emptyBlockColor,
  filledBlockColor,
  finalDayColor,
  fullPillRadius,
  goalDotHue,
  hitTestDayIndex,
  isAgeDay,
  isClickableDay,
  isFinalDay,
  leftBlockRadius,
  life,
  months,
  rightBlockRadius,
  tooltipOffsetX,
  tooltipOffsetY,
} from './lifeCalendar'

type EnabledTooltip = {
  anchorX: number
  anchorY: number
  kind: 'enabled'
}

type DisabledTooltip = {
  anchorX: number
  anchorY: number
  kind: 'disabled'
  text: string
}

type HiddenTooltip = {
  kind: 'hidden'
}

type TooltipState = DisabledTooltip | EnabledTooltip | HiddenTooltip

type AppState = {
  customDot: number | null
  customDotValue: string
  metrics: ReturnType<typeof computeGridMetrics>
  tooltip: TooltipState
}

const customDotKey = 'life-calendar.custom-dot'
const customDotValueKey = 'life-calendar.custom-dot-value'
const ageTooltipText = `You're 31, born in ${months[5]}`

const canvas = document.querySelector<HTMLCanvasElement>('#life-calendar')
const tooltipInput = document.querySelector<HTMLInputElement>('#tooltip-input')

if (canvas === null || tooltipInput === null) {
  throw new Error('Missing life calendar elements')
}

document.body.style.background = bodyBackground

const context = canvas.getContext('2d')

if (context === null) {
  throw new Error('Could not create a 2D rendering context')
}

const state: AppState = {
  customDot: readStoredIndex(),
  customDotValue: localStorage.getItem(customDotValueKey) ?? '',
  metrics: computeGridMetrics(window.innerWidth, window.innerHeight),
  tooltip: { kind: 'hidden' },
}

let shouldFocusTooltip = state.customDot !== null

function readStoredIndex() {
  const raw = localStorage.getItem(customDotKey)
  if (raw === null) {
    return null
  }

  const index = Number(raw)
  if (!Number.isInteger(index) || index < 0 || index >= life) {
    return null
  }

  return index
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function writeHashReport(phase: 'error' | 'loading' | 'ready' | 'running', extra: Record<string, string> = {}) {
  const requestId = new URLSearchParams(window.location.search).get('requestId')
  if (requestId === null) {
    return
  }

  const params = new URLSearchParams({
    phase,
    requestId,
    status: phase === 'ready' ? 'pass' : phase === 'error' ? 'fail' : 'pending',
    ...extra,
  })
  window.location.hash = params.toString()
}

function setCanvasGeometry() {
  state.metrics = computeGridMetrics(window.innerWidth, window.innerHeight)
  const ratio = Math.max(1, window.devicePixelRatio || 1)

  canvas.style.left = `${state.metrics.gridLeft}px`
  canvas.style.top = `${state.metrics.gridTop}px`
  canvas.style.width = `${state.metrics.gridWidth}px`
  canvas.style.height = `${state.metrics.gridHeight}px`
  canvas.width = Math.max(1, Math.round(state.metrics.gridWidth * ratio))
  canvas.height = Math.max(1, Math.round(state.metrics.gridHeight * ratio))
  context.setTransform(ratio, 0, 0, ratio, 0, 0)
}

function clampRadius(width: number, height: number, radius: readonly [number, number, number, number]) {
  const maxRadius = Math.min(width / 2, height / 2)
  return radius.map((value) => Math.min(value, maxRadius)) as [number, number, number, number]
}

function drawRoundedRect(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: readonly [number, number, number, number],
  fill: string
) {
  const [topLeft, topRight, bottomRight, bottomLeft] = clampRadius(width, height, radius)

  context.beginPath()
  context.moveTo(x + topLeft, y)
  context.lineTo(x + width - topRight, y)
  context.quadraticCurveTo(x + width, y, x + width, y + topRight)
  context.lineTo(x + width, y + height - bottomRight)
  context.quadraticCurveTo(x + width, y + height, x + width - bottomRight, y + height)
  context.lineTo(x + bottomLeft, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - bottomLeft)
  context.lineTo(x, y + topLeft)
  context.quadraticCurveTo(x, y, x + topLeft, y)
  context.closePath()
  context.fillStyle = fill
  context.fill()
}

function localCellRect(index: number) {
  const cell = computeCellRect(state.metrics, index)
  return {
    height: cell.height,
    width: cell.width,
    x: cell.x - state.metrics.gridLeft,
    y: cell.y - state.metrics.gridTop,
  }
}

function drawWeekPill(weekStart: number, fill: string) {
  const cell = localCellRect(weekStart)
  drawRoundedRect(cell.x, cell.y, cell.width * 7, cell.height, fullPillRadius, fill)
}

function drawDayCell(index: number, offsetInWeek: number, daysInWeek: number) {
  const cell = localCellRect(index)
  let fill = emptyBlockColor
  if (index < age) {
    fill = filledBlockColor
  }
  if (index === age) {
    fill = currentDayColor
  }
  if (index === life - 1) {
    fill = finalDayColor
  }

  let radius: readonly [number, number, number, number] = [0, 0, 0, 0]
  if (daysInWeek === 1) {
    radius = fullPillRadius
  } else if (offsetInWeek === 0) {
    radius = leftBlockRadius
  } else if (offsetInWeek === daysInWeek - 1) {
    radius = rightBlockRadius
  }

  drawRoundedRect(cell.x, cell.y, cell.width, cell.height, radius, fill)
}

function drawGoalDot(index: number) {
  const cell = localCellRect(index)
  const seed = goalDotHue(index)
  const radius = cell.width * 0.24
  const centerX = cell.x + cell.width * 0.5
  const centerY = cell.y + cell.height * 0.5

  context.beginPath()
  context.arc(centerX, centerY, radius + 1, 0, Math.PI * 2)
  context.fillStyle = 'rgba(13, 17, 23, 0.92)'
  context.fill()

  context.beginPath()
  context.arc(centerX, centerY, radius, 0, Math.PI * 2)
  context.fillStyle = `hsl(${seed}, 80%, 62%)`
  context.fill()
}

function render() {
  context.clearRect(0, 0, state.metrics.gridWidth, state.metrics.gridHeight)

  const currentWeekStart = currentWeekStartFor(age)
  for (let weekStart = 0; weekStart < life; weekStart += 7) {
    const daysInWeek = Math.min(7, life - weekStart)
    const currentWeek = weekStart === currentWeekStart

    if (daysInWeek === 7 && !currentWeek) {
      drawWeekPill(weekStart, weekStart < currentWeekStart ? filledBlockColor : emptyBlockColor)
      continue
    }

    for (let offset = 0; offset < daysInWeek; offset += 1) {
      drawDayCell(weekStart + offset, offset, daysInWeek)
    }
  }

  if (state.customDot !== null) {
    drawGoalDot(state.customDot)
  }
}

function focusTooltipSoon() {
  if (!shouldFocusTooltip) {
    return
  }

  shouldFocusTooltip = false
  requestAnimationFrame(() => {
    if (state.tooltip.kind === 'enabled') {
      tooltipInput.focus()
      tooltipInput.setSelectionRange(tooltipInput.value.length, tooltipInput.value.length)
    }
  })
}

function anchorForIndex(index: number) {
  const center = computeCellCenter(state.metrics, index)
  return { x: center.x, y: center.y }
}

function syncTooltip() {
  if (state.tooltip.kind === 'hidden') {
    tooltipInput.hidden = true
    return
  }

  tooltipInput.hidden = false
  tooltipInput.style.left = `${state.tooltip.anchorX + tooltipOffsetX}px`
  tooltipInput.style.top = `${state.tooltip.anchorY + tooltipOffsetY}px`

  if (state.tooltip.kind === 'disabled') {
    tooltipInput.disabled = true
    tooltipInput.value = state.tooltip.text
    tooltipInput.style.pointerEvents = 'none'
    return
  }

  tooltipInput.disabled = false
  tooltipInput.style.pointerEvents = 'auto'
  if (tooltipInput.value !== state.customDotValue) {
    tooltipInput.value = state.customDotValue
  }
  focusTooltipSoon()
}

function updateTooltipFromPointer(pointerX: number, pointerY: number, hitIndex: number | null) {
  if (hitIndex !== null && isAgeDay(hitIndex)) {
    state.tooltip = { anchorX: pointerX, anchorY: pointerY, kind: 'disabled', text: ageTooltipText }
    canvas.style.cursor = 'move'
    syncTooltip()
    return
  }

  if (hitIndex !== null && isFinalDay(hitIndex)) {
    state.tooltip = { anchorX: pointerX, anchorY: pointerY, kind: 'disabled', text: 'Good bye' }
    canvas.style.cursor = 'move'
    syncTooltip()
    return
  }

  if (hitIndex !== null) {
    canvas.style.cursor = 'pointer'
  } else {
    canvas.style.cursor = 'default'
  }

  if (state.customDot !== null) {
    const anchor = anchorForIndex(state.customDot)
    state.tooltip = { anchorX: anchor.x, anchorY: anchor.y, kind: 'enabled' }
  } else {
    state.tooltip = { kind: 'hidden' }
  }

  syncTooltip()
}

function persistCustomDot() {
  if (state.customDot === null) {
    localStorage.removeItem(customDotKey)
  } else {
    localStorage.setItem(customDotKey, `${state.customDot}`)
  }
}

function selectCustomDot(index: number, anchorX: number, anchorY: number) {
  state.customDot = index
  shouldFocusTooltip = true
  persistCustomDot()
  state.tooltip = { anchorX, anchorY, kind: 'enabled' }
  syncTooltip()
  render()
}

function clearCustomDot(pointerX: number, pointerY: number) {
  state.customDot = null
  persistCustomDot()
  updateTooltipFromPointer(pointerX, pointerY, hitTestDayIndex(state.metrics, pointerX, pointerY))
  render()
}

canvas.addEventListener('pointermove', (event) => {
  updateTooltipFromPointer(event.clientX, event.clientY, hitTestDayIndex(state.metrics, event.clientX, event.clientY))
})

canvas.addEventListener('pointerleave', () => {
  if (state.customDot !== null) {
    const anchor = anchorForIndex(state.customDot)
    state.tooltip = { anchorX: anchor.x, anchorY: anchor.y, kind: 'enabled' }
    canvas.style.cursor = 'default'
  } else {
    state.tooltip = { kind: 'hidden' }
    canvas.style.cursor = 'default'
  }
  syncTooltip()
})

canvas.addEventListener('click', (event) => {
  const hitIndex = hitTestDayIndex(state.metrics, event.clientX, event.clientY)
  if (hitIndex === null || !isClickableDay(hitIndex)) {
    return
  }

  if (state.customDot === hitIndex) {
    clearCustomDot(event.clientX, event.clientY)
    return
  }

  selectCustomDot(hitIndex, event.clientX, event.clientY)
})

tooltipInput.addEventListener('input', () => {
  state.customDotValue = tooltipInput.value
  localStorage.setItem(customDotValueKey, state.customDotValue)
})

window.addEventListener('resize', () => {
  setCanvasGeometry()
  render()
  if (state.customDot !== null) {
    const anchor = anchorForIndex(state.customDot)
    state.tooltip = { anchorX: anchor.x, anchorY: anchor.y, kind: 'enabled' }
  } else {
    state.tooltip = { kind: 'hidden' }
  }
  syncTooltip()
})

function dispatchPointerMove(index: number) {
  const point = anchorForIndex(index)
  canvas.dispatchEvent(
    new PointerEvent('pointermove', {
      bubbles: true,
      clientX: point.x,
      clientY: point.y,
    })
  )
}

function dispatchClick(index: number) {
  const point = anchorForIndex(index)
  const pointerInit = {
    bubbles: true,
    button: 0,
    clientX: point.x,
    clientY: point.y,
  }
  canvas.dispatchEvent(new PointerEvent('pointerdown', pointerInit))
  canvas.dispatchEvent(new PointerEvent('pointerup', pointerInit))
  canvas.dispatchEvent(new MouseEvent('click', pointerInit))
}

function nextFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

function firstNormalIndex() {
  const start = Math.min(age + 14, life - 8)
  for (let index = start; index < life - 1; index += 1) {
    if (isClickableDay(index)) {
      return index
    }
  }
  throw new Error('Could not find a clickable day')
}

async function runHoverTooltipScenario() {
  const normalIndex = firstNormalIndex()

  dispatchPointerMove(age)
  await nextFrame()
  assert(canvas.style.cursor === 'move', 'Age cell should use the move cursor')
  assert(!tooltipInput.hidden, 'Age cell should show a tooltip')
  assert(tooltipInput.disabled, 'Age tooltip should be disabled')
  assert(tooltipInput.value === ageTooltipText, 'Age tooltip text should match')

  dispatchPointerMove(normalIndex)
  await nextFrame()
  assert(canvas.style.cursor === 'pointer', 'Normal cell should use the pointer cursor')
  assert(tooltipInput.hidden, 'Normal cell should not show a tooltip before click')

  dispatchPointerMove(life - 1)
  await nextFrame()
  assert(!tooltipInput.hidden, 'Final day should show a tooltip')
  assert(tooltipInput.disabled, 'Final day tooltip should be disabled')
  assert(tooltipInput.value === 'Good bye', 'Final day tooltip text should match')
}

async function runCustomDotScenario(requestId: string) {
  const checkpointKey = `life-calendar.scenario.${requestId}`
  const checkpointRaw = sessionStorage.getItem(checkpointKey)
  const checkpoint = checkpointRaw === null ? null : JSON.parse(checkpointRaw) as { index: number; step: 'after-reload'; value: string }

  if (checkpoint === null) {
    localStorage.removeItem(customDotKey)
    localStorage.removeItem(customDotValueKey)
    state.customDot = null
    state.customDotValue = ''
    state.tooltip = { kind: 'hidden' }
    syncTooltip()
    render()

    const index = firstNormalIndex()
    const value = 'Learn drums'

    dispatchPointerMove(index)
    await nextFrame()
    assert(canvas.style.cursor === 'pointer', 'Normal cell should use the pointer cursor before click')
    assert(tooltipInput.hidden, 'Normal cell should not show a tooltip before click')

    dispatchClick(index)
    await nextFrame()
    assert(state.customDot === index, 'Clicking a normal cell should select a custom dot')
    assert(!tooltipInput.hidden, 'Selecting a custom dot should show the input')
    assert(!tooltipInput.disabled, 'The custom dot input should be enabled')
    assert(document.activeElement === tooltipInput, 'The custom dot input should be focused')

    tooltipInput.value = value
    tooltipInput.dispatchEvent(new Event('input', { bubbles: true }))
    await nextFrame()
    assert(localStorage.getItem(customDotKey) === `${index}`, 'The custom dot index should persist')
    assert(localStorage.getItem(customDotValueKey) === value, 'The custom dot value should persist')

    sessionStorage.setItem(checkpointKey, JSON.stringify({ index, step: 'after-reload', value }))
    window.location.reload()
    return
  }

  assert(state.customDot === checkpoint.index, 'Reload should restore the custom dot')
  assert(state.customDotValue === checkpoint.value, 'Reload should restore the custom dot value')
  assert(!tooltipInput.hidden, 'Reload should restore the visible input')
  assert(!tooltipInput.disabled, 'Reload should restore the enabled input')
  assert(tooltipInput.value === checkpoint.value, 'Reloaded input value should match storage')

  dispatchClick(checkpoint.index)
  await nextFrame()
  assert(state.customDot === null, 'Clicking the selected custom dot again should clear it')
  assert(localStorage.getItem(customDotKey) === null, 'Clearing the dot should remove the stored index')
  assert(localStorage.getItem(customDotValueKey) === checkpoint.value, 'Clearing the dot should keep the stored value')
  assert(tooltipInput.hidden, 'Clearing the dot should hide the input')

  sessionStorage.removeItem(checkpointKey)
}

async function runScenarioIfNeeded() {
  const params = new URLSearchParams(window.location.search)
  const scenario = params.get('scenario')
  const requestId = params.get('requestId')

  if (scenario === null || requestId === null) {
    return
  }

  writeHashReport('loading', { scenario })
  await nextFrame()
  writeHashReport('running', { scenario })

  try {
    if (scenario === 'hover-tooltips') {
      await runHoverTooltipScenario()
    } else if (scenario === 'custom-dot-cycle') {
      await runCustomDotScenario(requestId)
      if (sessionStorage.getItem(`life-calendar.scenario.${requestId}`) !== null) {
        return
      }
    } else {
      throw new Error(`Unknown scenario: ${scenario}`)
    }
    writeHashReport('ready', { message: '', scenario })
  } catch (error) {
    const message = error instanceof Error ? error.message : `${error}`
    writeHashReport('error', { message, scenario })
  }
}

setCanvasGeometry()
render()
if (state.customDot !== null) {
  const anchor = anchorForIndex(state.customDot)
  state.tooltip = { anchorX: anchor.x, anchorY: anchor.y, kind: 'enabled' }
  syncTooltip()
}

void runScenarioIfNeeded()
