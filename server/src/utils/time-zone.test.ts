import assert from 'assert'

import {
  DEFAULT_TIME_ZONE,
  formatDateTimeInTimeZone,
  resolveTimeZone
} from './time-zone'

assert.strictEqual(resolveTimeZone(), DEFAULT_TIME_ZONE)
assert.strictEqual(resolveTimeZone(''), DEFAULT_TIME_ZONE)
assert.strictEqual(resolveTimeZone('not-a-time-zone'), DEFAULT_TIME_ZONE)
assert.strictEqual(resolveTimeZone('America/New_York'), 'America/New_York')

const instant = new Date('2026-07-30T07:05:00.000Z')

assert.strictEqual(
  formatDateTimeInTimeZone(instant, 'Asia/Shanghai'),
  '2026-07-30 15:05'
)
assert.strictEqual(
  formatDateTimeInTimeZone(instant, 'America/New_York'),
  '2026-07-30 03:05'
)
