import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  applianceCategoryLabels,
  claimStatusLabels,
  claimStatusTone,
  formatPaise,
  rupeesToPaise,
  bytesToHuman,
  warrantyStatusLabels,
  warrantyStatusTone,
} from '../lib/api/homepassport-utils.ts';

test('formatPaise renders INR from integer paise', () => {
  assert.equal(formatPaise(0), '₹0.00');
  assert.equal(formatPaise(25000), '₹250.00');
  assert.equal(formatPaise(123456789), '₹12,34,567.89');
});

test('rupeesToPaise parses safely and rejects invalid input', () => {
  assert.equal(rupeesToPaise('250'), 25000);
  assert.equal(rupeesToPaise(' 1,999.50'.replace(',', '')), 199950);
  assert.equal(rupeesToPaise(''), null);
  assert.equal(rupeesToPaise('   '), null);
  assert.equal(rupeesToPaise('-5'), null);
  assert.equal(rupeesToPaise('abc'), null);
  assert.equal(rupeesToPaise('12.999'), 1300); // rounds to nearest paise
});

test('bytesToHuman formats readable sizes', () => {
  assert.equal(bytesToHuman(512), '512 B');
  assert.equal(bytesToHuman(2048), '2.0 KB');
  assert.equal(bytesToHuman(5 * 1024 * 1024), '5.0 MB');
  assert.equal(bytesToHuman(Number.NaN), 'Unknown size');
});

test('category labels cover every seeded category and warranty/claim labels are complete', () => {
  assert.equal(applianceCategoryLabels.air_conditioner, 'Air conditioner');
  assert.equal(applianceCategoryLabels.ro_water_purifier, 'RO / Water purifier');
  assert.equal(Object.keys(applianceCategoryLabels).length, 10);

  for (const status of [
    'upcoming',
    'active',
    'expired',
    'claim_submitted',
    'under_review',
    'approved',
    'rejected',
    'closed',
  ]) {
    assert.ok(warrantyStatusLabels[status], `missing warranty label for ${status}`);
    assert.ok(warrantyStatusTone(status).length > 0, `missing warranty tone for ${status}`);
  }

  for (const status of [
    'submitted',
    'additional_information_requested',
    'under_review',
    'approved',
    'rejected',
    'closed',
  ]) {
    assert.ok(claimStatusLabels[status], `missing claim label for ${status}`);
    assert.ok(claimStatusTone(status).length > 0, `missing claim tone for ${status}`);
  }
});
