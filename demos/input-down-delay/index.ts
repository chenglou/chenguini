const target = document.getElementById('target')! as HTMLDivElement
const output = document.getElementById('output')! as HTMLPreElement
const resetButton = document.getElementById('reset')! as HTMLButtonElement

type Sample = {
  timeStamp: number
  now: number
}

type Run = {
  pointerdown: Sample | null
  touchstart: Sample | null
  mousedown: Sample | null
}

let runs: Run[] = []

function ensureRun() {
  const latestRun = runs[runs.length - 1]
  if (latestRun != null && latestRun.mousedown == null) return latestRun

  const run: Run = {pointerdown: null, touchstart: null, mousedown: null}
  runs.push(run)
  return run
}

function onPointerDown(event: PointerEvent) {
  const run = ensureRun()
  run.pointerdown = {timeStamp: event.timeStamp, now: performance.now()}
  render()
}

function onTouchStart(event: TouchEvent) {
  const run = ensureRun()
  run.touchstart = {timeStamp: event.timeStamp, now: performance.now()}
  render()
}

function onMouseDown(event: MouseEvent) {
  const latestRun = ensureRun()
  const sample = {timeStamp: event.timeStamp, now: performance.now()}

  latestRun.mousedown = sample

  render()
}

function render() {
  if (runs.length === 0) {
    output.textContent = [
      'One tap or click per run.',
      'This page only listens to pointerdown, touchstart, and mousedown on the target.',
      '',
      'No runs yet.',
    ].join('\n')
    return
  }

  output.textContent = runs.map((run, index) => formatRun(index + 1, run)).join('\n\n')
}

function formatRun(index: number, run: Run) {
  const lines = [`run ${index}`]

  if (run.pointerdown == null) lines.push('pointerdown: missing')
  else {
    lines.push(
      `pointerdown: timeStamp=${formatMs(run.pointerdown.timeStamp)} now=${formatMs(run.pointerdown.now)}`,
    )
  }

  if (run.touchstart == null) lines.push('touchstart: missing')
  else {
    lines.push(
      `touchstart: timeStamp=${formatMs(run.touchstart.timeStamp)} now=${formatMs(run.touchstart.now)}`,
    )
  }

  if (run.mousedown == null) lines.push('mousedown: missing')
  else {
    lines.push(
      `mousedown: timeStamp=${formatMs(run.mousedown.timeStamp)} now=${formatMs(run.mousedown.now)}`,
    )
  }

  if (run.pointerdown != null && run.touchstart != null) {
    lines.push(
      `touchstart - pointerdown: timeStamp=${formatMs(run.touchstart.timeStamp - run.pointerdown.timeStamp)} now=${formatMs(run.touchstart.now - run.pointerdown.now)}`,
    )
  }

  if (run.pointerdown != null && run.mousedown != null) {
    lines.push(
      `mousedown - pointerdown: timeStamp=${formatMs(run.mousedown.timeStamp - run.pointerdown.timeStamp)} now=${formatMs(run.mousedown.now - run.pointerdown.now)}`,
    )
  }

  if (run.touchstart != null && run.mousedown != null) {
    lines.push(
      `mousedown - touchstart: timeStamp=${formatMs(run.mousedown.timeStamp - run.touchstart.timeStamp)} now=${formatMs(run.mousedown.now - run.touchstart.now)}`,
    )
  }

  return lines.join('\n')
}

function formatMs(value: number) {
  return `${value.toFixed(2)}ms`
}

target.addEventListener('pointerdown', onPointerDown)
target.addEventListener('touchstart', onTouchStart)
target.addEventListener('mousedown', onMouseDown)

resetButton.addEventListener('click', () => {
  runs = []
  render()
})

render()
