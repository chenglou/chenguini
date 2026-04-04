import {
  age,
  computeGridMetrics,
  currentDayColor,
  dayRectForIndex,
  emptyColor,
  filledColor,
  finalDayColor,
  getAgeTooltipText,
  getCustomDotColor,
  getDayRadius,
  getHoverColor,
  getPointForDayIndex,
  hitTestDayIndex,
  isCollapsedWeekStart,
  life,
  pillRadius,
  tooltipOffsetX,
  tooltipOffsetY,
} from './logic'

type ScenarioName = 'hover-tooltips' | 'custom-dot-cycle'

type HoverTooltipsData = {
  ageCursor: string
  ageTooltip: string | null
  ageTooltipDisabled: boolean | null
  finalTooltip: string | null
  finalTooltipDisabled: boolean | null
  normalCursor: string
  normalTooltipVisible: boolean
}

type CustomDotCycleData = {
  chosenDotIndex: number
  clickedDotIndex: number | null
  restoredDotIndex: number | null
  restoredDotValue: string | null
  inputFocusedAfterClick: boolean
  inputFocusedAfterReload: boolean
  toggledOffDotIndex: number | null
  persistedDotValueAfterToggle: string | null
}

type ScenarioReport = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  data?: HoverTooltipsData | CustomDotCycleData
  message?: string
}

type Pointer = {
  x: number
  y: number
}

const CUSTOM_DOT_KEY = 'life-calendar:custom-dot'
const CUSTOM_DOT_VALUE_KEY = 'life-calendar:custom-dot-value'

function parseStoredCustomDot(value: string | null) {
  if (value == null || value === '') return null
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}

export class LifeCalendarApp {
  readonly canvas: HTMLCanvasElement
  readonly ctx: CanvasRenderingContext2D
  readonly tooltip: HTMLInputElement
  readonly scenario: ScenarioName | ''
  readonly requestId: string

  metrics = computeGridMetrics(window.innerWidth, window.innerHeight)
  pointer: Pointer = { x: Number.NEGATIVE_INFINITY, y: Number.NEGATIVE_INFINITY }
  hoveredDay: number | null = null
  customDot = parseStoredCustomDot(localStorage.getItem(CUSTOM_DOT_KEY))
  customDotValue = localStorage.getItem(CUSTOM_DOT_VALUE_KEY) ?? ''

  constructor(canvas: HTMLCanvasElement, tooltip: HTMLInputElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.tooltip = tooltip

    const query = new URLSearchParams(window.location.search)
    this.scenario = (query.get('scenario') ?? '') as ScenarioName | ''
    this.requestId = query.get('requestId') ?? ''
  }

  start() {
    window.addEventListener('resize', this.onResize)
    window.addEventListener('mousemove', this.onMouseMove)
    window.addEventListener('click', this.onClick)
    this.tooltip.addEventListener('input', this.onInput)
    this.render()

    if (this.scenario !== '') {
      this.publishReport({
        phase: 'loading',
        requestId: this.requestId,
        scenario: this.scenario,
      })
      this.runScenario().catch((error) => {
        this.publishReport({
          phase: 'error',
          requestId: this.requestId,
          scenario: this.scenario,
          message: error instanceof Error ? error.message : 'Unknown scenario failure',
        })
      })
    }
  }

  destroy() {
    window.removeEventListener('resize', this.onResize)
    window.removeEventListener('mousemove', this.onMouseMove)
    window.removeEventListener('click', this.onClick)
    this.tooltip.removeEventListener('input', this.onInput)
  }

  private onResize = () => {
    this.metrics = computeGridMetrics(window.innerWidth, window.innerHeight)
    this.updateHover()
    this.render()
  }

  private onMouseMove = (event: MouseEvent) => {
    this.pointer = { x: event.clientX, y: event.clientY }
    this.updateHover()
    this.render()
  }

  private onClick = (event: MouseEvent) => {
    this.pointer = { x: event.clientX, y: event.clientY }
    this.handleClickAt(event.clientX, event.clientY)
  }

  private onInput = () => {
    this.customDotValue = this.tooltip.value
    localStorage.setItem(CUSTOM_DOT_VALUE_KEY, this.customDotValue)
    this.render()
  }

  private updateHover() {
    this.hoveredDay = hitTestDayIndex(this.pointer.x, this.pointer.y, this.metrics)
  }

  private handleClickAt(x: number, y: number) {
    this.pointer = { x, y }
    this.updateHover()

    if (this.hoveredDay == null) {
      this.render()
      return
    }

    this.customDot = this.hoveredDay === this.customDot ? null : this.hoveredDay
    if (this.customDot == null) {
      localStorage.removeItem(CUSTOM_DOT_KEY)
    } else {
      localStorage.setItem(CUSTOM_DOT_KEY, String(this.customDot))
    }
    this.render()
  }

  private getCursor() {
    if (this.hoveredDay == null) return 'auto'
    if (this.hoveredDay === age || this.hoveredDay === this.customDot) return 'move'
    return 'pointer'
  }

  private updateTooltip() {
    this.tooltip.style.left = `${this.pointer.x - tooltipOffsetX}px`
    this.tooltip.style.top = `${this.pointer.y - tooltipOffsetY}px`

    if (this.hoveredDay === age) {
      this.tooltip.style.display = 'block'
      this.tooltip.disabled = true
      this.tooltip.value = getAgeTooltipText()
      return
    }

    if (this.hoveredDay === life - 1) {
      this.tooltip.style.display = 'block'
      this.tooltip.disabled = true
      this.tooltip.value = 'Good bye'
      return
    }

    if (this.hoveredDay != null && this.hoveredDay === this.customDot) {
      this.tooltip.style.display = 'block'
      this.tooltip.disabled = false
      this.tooltip.value = this.customDotValue
      this.tooltip.focus()
      return
    }

    this.tooltip.style.display = 'none'
    this.tooltip.disabled = false
  }

  render() {
    this.metrics = computeGridMetrics(window.innerWidth, window.innerHeight)
    const { canvasWidth, canvasHeight, gridLeft, gridTop, blockSize, countX } = this.metrics
    const dpr = window.devicePixelRatio || 1

    this.canvas.width = Math.round(canvasWidth * dpr)
    this.canvas.height = Math.round(canvasHeight * dpr)
    this.canvas.style.width = `${canvasWidth}px`
    this.canvas.style.height = `${canvasHeight}px`
    this.canvas.style.left = `${gridLeft}px`
    this.canvas.style.top = `${gridTop}px`

    this.ctx.setTransform(1, 0, 0, 1, 0, 0)
    this.ctx.scale(dpr, dpr)
    this.ctx.clearRect(0, 0, canvasWidth, canvasHeight)

    this.ctx.strokeStyle = '#22272e'
    this.ctx.lineWidth = 0.5

    for (let dayIndex = 0; dayIndex < life; ) {
      if (isCollapsedWeekStart(dayIndex)) {
        const rect = dayRectForIndex(dayIndex, this.metrics)
        this.ctx.beginPath()
        this.ctx.fillStyle = dayIndex < age ? filledColor : emptyColor
        this.ctx.roundRect(
          rect.x - gridLeft,
          rect.y - gridTop,
          blockSize * 7,
          blockSize,
          pillRadius,
        )
        this.ctx.fill()
        this.ctx.stroke()
        dayIndex += 7
        continue
      }

      const rect = dayRectForIndex(dayIndex, this.metrics)
      this.ctx.beginPath()
      this.ctx.fillStyle =
        dayIndex < age ? filledColor : dayIndex === age ? currentDayColor : emptyColor
      this.ctx.roundRect(
        rect.x - gridLeft,
        rect.y - gridTop,
        rect.width,
        rect.height,
        getDayRadius(dayIndex),
      )
      this.ctx.fill()
      this.ctx.stroke()
      dayIndex += 1
    }

    if (this.hoveredDay != null) {
      this.drawDayFill(this.hoveredDay, getHoverColor(this.hoveredDay))
    }
    if (this.customDot != null) {
      this.drawCustomDot(this.customDot, getCustomDotColor(this.customDot))
    }
    this.drawDayFill(life - 1, finalDayColor)

    for (let column = 1; column < countX; column += 1) {
      if (column % 7 === 0) continue
      this.ctx.beginPath()
      this.ctx.moveTo(column * blockSize, 0)
      this.ctx.lineTo(column * blockSize, canvasHeight)
      this.ctx.stroke()
    }

    document.body.style.cursor = this.getCursor()
    this.updateTooltip()
  }

  private drawDayFill(dayIndex: number, fill: string) {
    const rect = dayRectForIndex(dayIndex, this.metrics)
    this.ctx.beginPath()
    this.ctx.fillStyle = fill
    this.ctx.roundRect(
      rect.x - this.metrics.gridLeft,
      rect.y - this.metrics.gridTop,
      rect.width,
      rect.height,
      getDayRadius(dayIndex),
    )
    this.ctx.fill()
    this.ctx.stroke()
  }

  private drawCustomDot(dayIndex: number, fill: string) {
    const rect = dayRectForIndex(dayIndex, this.metrics)
    const radius = Math.max(2, rect.width * 0.24)
    this.ctx.beginPath()
    this.ctx.fillStyle = fill
    this.ctx.arc(
      rect.x - this.metrics.gridLeft + rect.width / 2,
      rect.y - this.metrics.gridTop + rect.height / 2,
      radius,
      0,
      Math.PI * 2,
    )
    this.ctx.fill()
  }

  private publishReport(report: ScenarioReport) {
    location.hash = `report=${encodeURIComponent(JSON.stringify(report))}`
  }

  private tooltipReportState() {
    return {
      value: this.tooltip.style.display === 'none' ? null : this.tooltip.value,
      disabled: this.tooltip.style.display === 'none' ? null : this.tooltip.disabled,
      visible: this.tooltip.style.display !== 'none',
    }
  }

  private async runScenario() {
    this.publishReport({
      phase: 'running',
      requestId: this.requestId,
      scenario: this.scenario,
    })

    if (this.scenario === 'hover-tooltips') {
      await this.runHoverTooltipsScenario()
      return
    }
    if (this.scenario === 'custom-dot-cycle') {
      await this.runCustomDotCycleScenario()
      return
    }

    throw new Error(`Unknown scenario: ${this.scenario}`)
  }

  private async runHoverTooltipsScenario() {
    const normalPoint = getPointForDayIndex(21, this.metrics)
    this.pointer = normalPoint
    this.updateHover()
    this.render()
    const normalCursor = document.body.style.cursor
    const normalTooltipVisible = this.tooltipReportState().visible

    const agePoint = getPointForDayIndex(age, this.metrics)
    this.pointer = agePoint
    this.updateHover()
    this.render()
    const ageState = this.tooltipReportState()
    const ageCursor = document.body.style.cursor

    const finalPoint = getPointForDayIndex(life - 1, this.metrics)
    this.pointer = finalPoint
    this.updateHover()
    this.render()
    const finalState = this.tooltipReportState()

    const data: HoverTooltipsData = {
      ageCursor,
      ageTooltip: ageState.value,
      ageTooltipDisabled: ageState.disabled,
      finalTooltip: finalState.value,
      finalTooltipDisabled: finalState.disabled,
      normalCursor,
      normalTooltipVisible,
    }

    this.publishReport({
      phase: 'ready',
      requestId: this.requestId,
      scenario: this.scenario,
      data,
    })
  }

  private async runCustomDotCycleScenario() {
    const targetIndex = 20_000
    const reloadKey = `life-calendar:${this.requestId}:custom-dot-cycle`
    const point = getPointForDayIndex(targetIndex, this.metrics)
    const storedStep = sessionStorage.getItem(reloadKey)

    if (storedStep == null) {
      localStorage.removeItem(CUSTOM_DOT_KEY)
      localStorage.removeItem(CUSTOM_DOT_VALUE_KEY)
      sessionStorage.setItem(
        reloadKey,
        JSON.stringify({
          phase: 'after-reload',
          chosenDotIndex: targetIndex,
        }),
      )

      this.handleClickAt(point.x, point.y)
      const clickedDotIndex = this.customDot
      const inputFocusedAfterClick = document.activeElement === this.tooltip
      this.tooltip.value = 'Learn cello'
      this.onInput()

      sessionStorage.setItem(
        reloadKey,
        JSON.stringify({
          phase: 'after-reload',
          chosenDotIndex: targetIndex,
          clickedDotIndex,
          inputFocusedAfterClick,
        }),
      )

      location.reload()
      return
    }

    const data = JSON.parse(storedStep) as CustomDotCycleData & { phase: 'after-reload' }

    this.pointer = point
    this.updateHover()
    this.render()

    const restoredDotIndex = this.customDot
    const restoredDotValue = localStorage.getItem(CUSTOM_DOT_VALUE_KEY)
    const inputFocusedAfterReload = document.activeElement === this.tooltip

    this.handleClickAt(point.x, point.y)
    const toggledOffDotIndex = parseStoredCustomDot(localStorage.getItem(CUSTOM_DOT_KEY))
    const persistedDotValueAfterToggle = localStorage.getItem(CUSTOM_DOT_VALUE_KEY)
    sessionStorage.removeItem(reloadKey)

    const reportData: CustomDotCycleData = {
      chosenDotIndex: data.chosenDotIndex,
      clickedDotIndex: data.clickedDotIndex,
      restoredDotIndex,
      restoredDotValue,
      inputFocusedAfterClick: data.inputFocusedAfterClick,
      inputFocusedAfterReload,
      toggledOffDotIndex,
      persistedDotValueAfterToggle,
    }

    this.publishReport({
      phase: 'ready',
      requestId: this.requestId,
      scenario: this.scenario,
      data: reportData,
    })
  }

}

export function bootstrapLifeCalendar() {
  const canvas = document.querySelector<HTMLCanvasElement>('#calendar')
  const tooltip = document.querySelector<HTMLInputElement>('#tooltip')

  if (canvas == null || tooltip == null) {
    throw new Error('Missing life calendar DOM')
  }

  const app = new LifeCalendarApp(canvas, tooltip)
  app.start()
  return app
}
