import { encodePaymentRequiredHeader, encodePaymentResponseHeader } from '@x402/core/http';
import { POLICY } from '../src/policy.js';
export const ADDRESS = '0x1111111111111111111111111111111111111111';
export const TRANSACTION = '0x' + 'ab'.repeat(32);
export const SIGNATURE = '0x' + '11'.repeat(65); // Synthetic: never valid payment evidence.
export function quote() { return {
  x402Version: 2, resource: { url: POLICY.url, mimeType: 'application/json' },
  accepts: [{ scheme: 'exact', network: POLICY.network, amount: '10000', asset: POLICY.asset,
    payTo: POLICY.payTo, maxTimeoutSeconds: 300, extra: { name: 'USD Coin', version: '2' } }],
}; }
export const CONTENT = { source: 'Blockchain IQ', disclaimer: 'Synthetic fixture; not market data or investment advice.',
  terms: 'https://www.blockchainiq.co/terms', flagCount: 0, eventCount: 0,
  data: { asOf: '2026-10-24T00:00:00Z', coins: [], events: [], flags: [] } };
export function paymentRequired(value = quote()) {
  return new Response('{}', { status: 402, headers: { 'content-type': 'application/json', 'PAYMENT-REQUIRED': encodePaymentRequiredHeader(value) } });
}
export function paid({ receipt = {}, content = CONTENT } = {}) {
  return new Response(JSON.stringify(content), { status: 200, headers: { 'content-type': 'application/json',
    'PAYMENT-RESPONSE': encodePaymentResponseHeader({ success: true, network: POLICY.network, transaction: TRANSACTION, payer: ADDRESS, ...receipt }) } });
}
export function mockTransport({ challenge = quote(), second = () => paid() } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return calls.length === 1 ? paymentRequired(challenge) : second();
  };
  return { calls, fetchImpl };
}
