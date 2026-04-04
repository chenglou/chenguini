export * from './logic'
export * from './app'

import { bootstrapLifeCalendar } from './app'

if (typeof document !== 'undefined') {
  bootstrapLifeCalendar()
}
