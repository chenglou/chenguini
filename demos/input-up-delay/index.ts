const target = document.getElementById('target')! as HTMLDivElement
const output = document.getElementById('output')! as HTMLPreElement
const resetButton = document.getElementById('reset')! as HTMLButtonElement

type Sample = {
  timeStamp: number
  now: number
}

type Run = {
  pointerup: Sample | null
  touchend: Sample | null
  mouseup: Sample | null
  click: Sample | null
}

let runs: Run[] = []

function ensureRun() {
  const latestRun = runs[runs.length - 1]
  if (latestRun != null && latestRun.click == null) return latestRun

  const run: Run = {pointerup: null, touchend: null, mouseup: null, click: null}
  runs.push(run)
  return run
}

function onPointerUp(event: PointerEvent) {
  const run = ensureRun()
  run.pointerup = {timeStamp: event.timeStamp, now: performance.now()}
  render()
}

function onTouchEnd(event: TouchEvent) {
  const run = ensureRun()
  run.touchend = {timeStamp: event.timeStamp, now: performance.now()}
  render()
}

function onMouseUp(event: MouseEvent) {
  const run = ensureRun()
  run.mouseup = {timeStamp: event.timeStamp, now: performance.now()}
  render()
}

function onClick(event: MouseEvent) {
  const run = ensureRun()
  run.click = {timeStamp: event.timeStamp, now: performance.now()}
  render()
}

function render() {
  if (runs.length === 0) {
    output.textContent = [
      'One tap or click per run.',
      'This page only listens to pointerup, touchend, mouseup, and click on the target.',
      '',
      'No runs yet.',
    ].join('\n')
    return
  }

  output.textContent = runs.map((run, index) => formatRun(index + 1, run)).join('\n\n')
}

function formatRun(index: number, run: Run) {
  const lines = [`run ${index}`]

  if (run.pointerup == null) lines.push('pointerup: missing')
  else {
    lines.push(
      `pointerup: timeStamp=${formatMs(run.pointerup.timeStamp)} now=${formatMs(run.pointerup.now)}`,
    )
  }

  if (run.touchend == null) lines.push('touchend: missing')
  else {
    lines.push(
      `touchend: timeStamp=${formatMs(run.touchend.timeStamp)} now=${formatMs(run.touchend.now)}`,
    )
  }

  if (run.mouseup == null) lines.push('mouseup: missing')
  else {
    lines.push(
      `mouseup: timeStamp=${formatMs(run.mouseup.timeStamp)} now=${formatMs(run.mouseup.now)}`,
    )
  }

  if (run.click == null) lines.push('click: missing')
  else {
    lines.push(
      `click: timeStamp=${formatMs(run.click.timeStamp)} now=${formatMs(run.click.now)}`,
    )
  }

  if (run.pointerup != null && run.touchend != null) {
    lines.push(
      `touchend - pointerup: timeStamp=${formatMs(run.touchend.timeStamp - run.pointerup.timeStamp)} now=${formatMs(run.touchend.now - run.pointerup.now)}`,
    )
  }

  if (run.pointerup != null && run.mouseup != null) {
    lines.push(
      `mouseup - pointerup: timeStamp=${formatMs(run.mouseup.timeStamp - run.pointerup.timeStamp)} now=${formatMs(run.mouseup.now - run.pointerup.now)}`,
    )
  }

  if (run.touchend != null && run.mouseup != null) {
    lines.push(
      `mouseup - touchend: timeStamp=${formatMs(run.mouseup.timeStamp - run.touchend.timeStamp)} now=${formatMs(run.mouseup.now - run.touchend.now)}`,
    )
  }

  if (run.mouseup != null && run.click != null) {
    lines.push(
      `click - mouseup: timeStamp=${formatMs(run.click.timeStamp - run.mouseup.timeStamp)} now=${formatMs(run.click.now - run.mouseup.now)}`,
    )
  }

  if (run.pointerup != null && run.click != null) {
    lines.push(
      `click - pointerup: timeStamp=${formatMs(run.click.timeStamp - run.pointerup.timeStamp)} now=${formatMs(run.click.now - run.pointerup.now)}`,
    )
  }

  return lines.join('\n')
}

function formatMs(value: number) {
  return `${value.toFixed(2)}ms`
}

target.addEventListener('pointerup', onPointerUp)
target.addEventListener('touchend', onTouchEnd)
target.addEventListener('mouseup', onMouseUp)
target.addEventListener('click', onClick)

resetButton.addEventListener('click', () => {
  runs = []
  render()
})

render()
