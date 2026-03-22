const target = document.getElementById('target')! as HTMLDivElement
const output = document.getElementById('output')! as HTMLPreElement
const resetButton = document.getElementById('reset')! as HTMLButtonElement

const eventNames = ['pointerup', 'mouseup', 'click', 'touchend'] as const
type EventName = (typeof eventNames)[number]
type ScopeName = 'target' | 'window'

let log: string[] = []
let counts: Record<ScopeName, Record<EventName, number>> = {
  target: {pointerup: 0, mouseup: 0, click: 0, touchend: 0},
  window: {pointerup: 0, mouseup: 0, click: 0, touchend: 0},
}

function record(scope: ScopeName, eventName: EventName) {
  log.push(`${scope}:${eventName}`)
  counts[scope][eventName]++
  render()
}

function render() {
  output.textContent = [
    'Same div, same four events, tracked on target and window.',
    `events=${log.length === 0 ? '(none)' : log.join(' -> ')}`,
    '',
    'target',
    ...eventNames.map((name) => `${name}=${counts.target[name]}`),
    '',
    'window',
    ...eventNames.map((name) => `${name}=${counts.window[name]}`),
  ].join('\n')
}

for (const eventName of eventNames) {
  target.addEventListener(eventName, () => record('target', eventName))
  window.addEventListener(eventName, () => record('window', eventName))
}

resetButton.addEventListener('click', () => {
  log = []
  counts = {
    target: {pointerup: 0, mouseup: 0, click: 0, touchend: 0},
    window: {pointerup: 0, mouseup: 0, click: 0, touchend: 0},
  }
  render()
})

render()
