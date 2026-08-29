import test from 'node:test';
import assert from 'node:assert/strict';
import { DELIVERY_MODES, PAYMENT_METHODS, RETURN_REASONS, validateOrderInput } from '../src/order-contract.mjs';

test('supports only COD and manual payment in the current release', () => {
  assert.equal(PAYMENT_METHODS.has('COD'), true);
  assert.equal(PAYMENT_METHODS.has('MANUAL'), true);
  assert.equal(PAYMENT_METHODS.has('SHAM_CASH'), false);
});

test('requires a door address or landmark', () => {
  assert.equal(validateOrderInput({ paymentMethod: 'COD', deliveryMode: 'DOOR' }), 'A door delivery address or landmark is required');
  assert.equal(validateOrderInput({ paymentMethod: 'COD', deliveryMode: 'DOOR', nearestLandmark: 'مقابل الجامع' }), null);
});

test('requires a pickup point for pickup delivery', () => {
  assert.equal(DELIVERY_MODES.has('PICKUP'), true);
  assert.equal(validateOrderInput({ paymentMethod: 'MANUAL', deliveryMode: 'PICKUP' }), 'A pickup point is required');
  assert.equal(validateOrderInput({ paymentMethod: 'MANUAL', deliveryMode: 'PICKUP', pickupPointId: 'hub-1' }), null);
});

test('keeps return reasons aligned with the API contract', () => {
  for (const reason of ['DEFECT', 'MISMATCH', 'VIN_MISMATCH', 'DAMAGE']) assert.equal(RETURN_REASONS.has(reason), true);
  assert.equal(RETURN_REASONS.has('UNKNOWN'), false);
});
