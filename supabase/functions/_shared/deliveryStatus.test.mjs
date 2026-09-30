import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDeliveryStatus } from './deliveryStatus.ts';

test('Baileys numeric statuses match their named counterparts', () => {
  const cases = [
    [0, 'ERROR', 'failed'], [1, 'PENDING', 'pending'],
    [2, 'SERVER_ACK', 'sent'], [3, 'DELIVERY_ACK', 'delivered'],
    [4, 'READ', 'read'], [5, 'PLAYED', 'read'],
  ];
  for (const [number, name, expected] of cases) {
    assert.equal(normalizeDeliveryStatus(number), expected);
    assert.equal(normalizeDeliveryStatus(String(number)), expected);
    assert.equal(normalizeDeliveryStatus(name), expected);
  }
});

test('missing and unknown statuses do not imply delivery or failure', () => {
  for (const value of [null, undefined, '', 6, 99, -1, 'unknown']) {
    assert.equal(normalizeDeliveryStatus(value), null);
  }
});
