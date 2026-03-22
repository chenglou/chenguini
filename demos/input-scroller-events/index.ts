const scroller = document.getElementById('scroller')! as HTMLDivElement
const output = document.getElementById('output')! as HTMLPreElement
const resetButton = document.getElementById('reset')! as HTMLButtonElement

const eventNames = [
  'pointerdown',
  'mousedown',
  'touchstart',
  'pointerup',
  'mouseup',
  'click',
  'touchend',
  'touchcancel',
  'pointermove',
  'mousemove',
  'touchmove',
  'scroll',
] as const

type EventName = (typeof eventNames)[number]

let log: string[] = []
let counts: Record<EventName, number> = {
  pointerdown: 0,
  mousedown: 0,
  touchstart: 0,
  pointerup: 0,
  mouseup: 0,
  click: 0,
  touchend: 0,
  touchcancel: 0,
  pointermove: 0,
  mousemove: 0,
  touchmove: 0,
  scroll: 0,
}

function record(name: EventName) {
  counts[name]++
  if (name !== 'pointermove' && name !== 'mousemove' && name !== 'touchmove' && name !== 'scroll')
    log.push(name)
  render()
}

function render() {
  output.textContent = [
    'This page listens on the scroller itself.',
    `events=${log.length === 0 ? '(none)' : log.join(' -> ')}`,
    '',
    ...eventNames.map((name) => `${name}=${counts[name]}`),
  ].join('\n')
}

for (const name of eventNames) {
  scroller.addEventListener(name, () => record(name))
}

resetButton.addEventListener('click', () => {
  log = []
  counts = {
    pointerdown: 0,
    mousedown: 0,
    touchstart: 0,
    pointerup: 0,
    mouseup: 0,
    click: 0,
    touchend: 0,
    touchcancel: 0,
    pointermove: 0,
    mousemove: 0,
    touchmove: 0,
    scroll: 0,
  }
  render()
})

render()
