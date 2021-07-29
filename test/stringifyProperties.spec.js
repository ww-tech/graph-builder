import stringifyProperties from '../src/stringifyProperties'
import test from 'ava'

test('stringify', async t => {
  const actualString = stringifyProperties({
    a: 1,
    b: '2'
  })
  const expectedString = "{a: 1, b: '2'}"
  t.deepEqual(actualString, expectedString)
})

test('escape injection', async t => {
  const actualString = stringifyProperties({
    a: 1,
    b: '2',
    c: "', d: 'x"
  })
  const expectedString = "{a: 1, b: '2', c: '\\', d: \\'x'}"
  t.deepEqual(actualString, expectedString)
})
