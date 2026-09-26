const assert = require('assert/strict');
const test = require('node:test');

const {
  validateMemoryIdInput,
  validateVersionInput
} = require('./brain_security');

test('Brain security accepts bounded memory IDs and versions', () => {
  assert.equal(validateMemoryIdInput('mem_abc-123'), true);
  assert.equal(validateVersionInput('1'), true);
  assert.equal(validateVersionInput(1000000), true);
});

test('Brain security rejects traversal, malformed IDs, and invalid versions', () => {
  for (const value of ['', ' ', '../secret', 'a/b', 'a\\b', 'a:b', 'a.b', 'a b']) {
    assert.equal(validateMemoryIdInput(value), false, `unexpected valid memory id: ${value}`);
  }

  for (const value of [0, -1, 1.5, 'abc', 1000001, null, undefined]) {
    assert.equal(validateVersionInput(value), false, `unexpected valid version: ${value}`);
  }
});
