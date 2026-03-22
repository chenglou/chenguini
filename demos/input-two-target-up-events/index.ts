const area = document.getElementById('area')! as HTMLDivElement
const bigButton = document.getElementById('big-button')! as HTMLButtonElement
const output = document.getElementById('output')! as HTMLPreElement
const resetButton = document.getElementById('reset')! as HTMLButtonElement

const eventNames = ['pointerup', 'mouseup', 'click', 'touchend'] as const
const targets = [
  {name: 'area', element: area},
  {name: 'button', element: bigButton},
] as const

type EventName = (typeof eventNames)[number]
type ScopeName = (typeof targets)[number]['name'] | 'window'

let log: string[] = []
let counts: Record<ScopeName, Record<EventName, number>> = {
  area: {pointerup: 0, mouseup: 0, click: 0, touchend: 0},
  button: {pointerup: 0, mouseup: 0, click: 0, touchend: 0},
  window: {pointerup: 0, mouseup: 0, click: 0, touchend: 0},
}

function record(scope: ScopeName, eventName: EventName) {
  log.push(`${scope}:${eventName}`)
  counts[scope][eventName]++
  render()
}

function render() {
  output.textContent = [
    'This page only listens on each target for pointerup, mouseup, click, and touchend.',
    `events=${log.length === 0 ? '(none)' : log.join(' -> ')}`,
    '',
    'area',
    ...eventNames.map((name) => `${name}=${counts.area[name]}`),
    '',
    'button',
    ...eventNames.map((name) => `${name}=${counts.button[name]}`),
    '',
    'window',
    ...eventNames.map((name) => `${name}=${counts.window[name]}`),
  ].join('\n')
}

for (const {name, element} of targets) {
  for (const eventName of eventNames)
    element.addEventListener(eventName, () => record(name, eventName))
}

for (const eventName of eventNames)
  window.addEventListener(eventName, () => record('window', eventName))

resetButton.addEventListener('click', () => {
  log = []
  counts = {
    area: {pointerup: 0, mouseup: 0, click: 0, touchend: 0},
    button: {pointerup: 0, mouseup: 0, click: 0, touchend: 0},
    window: {pointerup: 0, mouseup: 0, click: 0, touchend: 0},
  }
  render()
})

render()
