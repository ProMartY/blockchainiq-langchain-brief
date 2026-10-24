import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { privateKeyToAccount } from 'viem/accounts';
import { recoverTypedDataAddress } from 'viem';
import {
  Any,
  parsePaymentRequired,
  validatePaymentRequired,
  parsePaymentPayload,
  validatePaymentPayload,
} from '@x402/core/schemas';
import { decodePaymentSignatureHeader } from '@x402/core/http';
import { createSdkPaymentAdapter } from '../src/sdk-payment.js';
import { quote } from './fixtures.js';

// Public synthetic wallet for offline tests only. Never fund this fixture.
const account = privateKeyToAccount('0x' + '11'.repeat(32));
const schemaRequire = createRequire(import.meta.resolve('@x402/core/schemas'));

test('the public x402 schema exports resolve the explicitly scoped Zod 4.6.7 override', () => {
  assert.equal(schemaRequire('zod/package.json').version, '4.6.7');
});

test('the actual x402 Any schema preserves the SDK single-argument record path', () => {
  // @x402/core 2.28.0 builds this export with z.record(z.unknown()).
  // Exercise nonempty records; an empty object would miss value parsing.
  const value = {
    name: 'USD Coin', version: '2', nested: { flag: true },
    values: [1, 'synthetic'], nullable: null,
  };
  assert.deepEqual(Any.parse(value), value);
  for (const invalid of [null, [], 'not a record']) {
    assert.equal(Any.safeParse(invalid).success, false);
  }
});

test('public x402 schemas validate the unsigned quote and reject malformed quote shapes', () => {
  const value = quote();
  assert.deepEqual(validatePaymentRequired(value), value);
  assert.equal(parsePaymentRequired(value).success, true);
  const invalid = [
    { ...value, accepts: [] },
    { ...value, x402Version: 3 },
    { ...value, resource: null },
    { ...value, accepts: [{ ...value.accepts[0], amount: 10000 }] },
    { ...value, accepts: [{ ...value.accepts[0], network: 'Base' }] },
  ];
  for (const candidate of invalid) {
    assert.equal(parsePaymentRequired(candidate).success, false);
    assert.throws(() => validatePaymentRequired(candidate));
  }
});

test('public x402 schemas validate a real SDK payload signed only by the public synthetic wallet', async () => {
  let calls = 0, typedData;
  const adapter = createSdkPaymentAdapter({
    address: account.address,
    signTypedData: async value => {
      calls++;
      typedData = value;
      return account.signTypedData(value);
    },
  });
  const payload = decodePaymentSignatureHeader(await adapter.createPaymentHeader(quote()));
  assert.equal(calls, 1);
  assert.deepEqual(validatePaymentPayload(payload), payload);
  assert.equal(parsePaymentPayload(payload).success, true);
  assert.equal(payload.payload.authorization.from.toLowerCase(), account.address.toLowerCase());
  assert.equal(payload.payload.authorization.value, '10000');
  assert.equal((await recoverTypedDataAddress({ ...typedData, signature: payload.payload.signature })).toLowerCase(), account.address.toLowerCase());
  const invalid = [
    { ...payload, x402Version: 3 },
    { ...payload, payload: null },
    { ...payload, payload: [] },
    { ...payload, payload: 'not a record' },
    { ...payload, accepted: { ...payload.accepted, amount: 10000 } },
  ];
  for (const candidate of invalid) {
    assert.equal(parsePaymentPayload(candidate).success, false);
    assert.throws(() => validatePaymentPayload(candidate));
  }
});
