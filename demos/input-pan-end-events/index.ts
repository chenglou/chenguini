const scroller = document.getElementById('scroller')! as HTMLDivElement
const output = document.getElementById('output')! as HTMLPreElement
const resetButton = document.getElementById('reset')! as HTMLButtonElement

const eventNames = [
  'pointerdown',
  'pointerup',
  'mousedown',
  'mouseup',
  'touchstart',
  'touchend',
  'touchcancel',
] as const

type EventName = (typeof eventNames)[number]

let log: string[] = []
let counts: Record<EventName, number> = {
  pointerdown: 0,
  pointerup: 0,
  mousedown: 0,
  mouseup: 0,
  touchstart: 0,
  touchend: 0,
  touchcancel: 0,
}
let scrollCount = 0

function recordEvent(name: EventName) {
  counts[name]++
  log.push(name)
  render()
}

function render() {
  output.textContent = [
    'Do a real native pan inside the scroller, then release without tapping again.',
    `scroll=${scrollCount}`,
    `events=${log.length === 0 ? '(none)' : log.join(' -> ')}`,
    '',
    ...eventNames.map((name) => `${name}=${counts[name]}`),
  ].join('\n')
}

for (const name of eventNames)
  window.addEventListener(name, () => recordEvent(name))

scroller.addEventListener('scroll', () => {
  scrollCount++
  render()
})

resetButton.addEventListener('click', () => {
  log = []
  scrollCount = 0
  counts = {
    pointerdown: 0,
    pointerup: 0,
    mousedown: 0,
    mouseup: 0,
    touchstart: 0,
    touchend: 0,
    touchcancel: 0,
  }
  render()
})

render()
