const output = document.getElementById('output')! as HTMLPreElement
const resetButton = document.getElementById('reset')! as HTMLButtonElement

const eventNames = ['pointerup', 'mouseup', 'click', 'touchend'] as const
type EventName = (typeof eventNames)[number]

let log: EventName[] = []
let counts: Record<EventName, number> = {
  pointerup: 0,
  mouseup: 0,
  click: 0,
  touchend: 0,
}

function record(name: EventName) {
  log.push(name)
  counts[name]++
  render()
}

function render() {
  output.textContent = [
    'This page only listens on window for pointerup, mouseup, click, and touchend.',
    `events=${log.length === 0 ? '(none)' : log.join(' -> ')}`,
    '',
    ...eventNames.map((name) => `${name}=${counts[name]}`),
  ].join('\n')
}

for (const name of eventNames)
  window.addEventListener(name, () => record(name))

resetButton.addEventListener('click', () => {
  log = []
  counts = {
    pointerup: 0,
    mouseup: 0,
    click: 0,
    touchend: 0,
  }
  render()
})

render()
