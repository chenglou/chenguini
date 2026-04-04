export * from './model'

if (typeof document !== 'undefined') {
  const app = document.querySelector<HTMLDivElement>('#app')
  if (app !== null) {
    app.textContent = 'Life calendar loading...'
  }
}
