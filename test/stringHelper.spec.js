import { stringifyProperties, setPropertiesString } from '../src/stringHelper'

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

test('setPropertiesString', async t => {
  const actualString = setPropertiesString('this', {
    a: 1,
    b: '2',
    c: "', d: 'x"
  })
  const expectedString = "SET this.a = 1, this.b = '2', this.c = '\\\', d: \\\'x'"
  t.deepEqual(actualString, expectedString)
})
