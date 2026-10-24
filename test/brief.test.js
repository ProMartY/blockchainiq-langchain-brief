import test from 'node:test';
import assert from 'node:assert/strict';
import { ToolMessage } from '@langchain/core/messages';
import { decodePaymentSignatureHeader, encodePaymentSignatureHeader } from '@x402/core/http';
import { createBriefClient, createBlockchainIqBriefTool, createSdkPaymentAdapter, toRpcTypedData, POLICY } from '../src/index.js';
import { validatePaymentRequired, validateTypedData } from '../src/policy.js';
import { ADDRESS, CONTENT, SIGNATURE, TRANSACTION, mockTransport, paid, paymentRequired, quote } from './fixtures.js';

function signer(callback = async () => SIGNATURE) { return createSdkPaymentAdapter({ address: ADDRESS, signTypedData: callback }); }
const expectCode = (promise, code) => assert.rejects(promise, error => error.code === code && error.message === code);

test('real SDK handshake signs one EIP-3009 authorization and returns original envelope', async () => {
  const transport = mockTransport(); let signing;
  const client = createBriefClient({ ...transport, allowPayment: true, paymentAdapter: signer(async data => { signing = data; return SIGNATURE; }) });
  const result = await client.run();
  assert.deepEqual(result.content, CONTENT); assert.equal(result.receipt.transaction, TRANSACTION);
  assert.deepEqual(client.getBudget(), { reservedUnits: '10000', maxUnits: '10000', authorizations: 1, remainingAuthorizations: 0 });
  assert.equal(transport.calls.length, 2);
  assert.equal(transport.calls[0].url, POLICY.url); assert.equal(transport.calls[0].init.redirect, 'error');
  assert.equal(transport.calls[0].init.headers['PAYMENT-SIGNATURE'], undefined);
  const payload = decodePaymentSignatureHeader(transport.calls[1].init.headers['PAYMENT-SIGNATURE']);
  assert.equal(payload.payload.authorization.value, '10000'); assert.equal(signing.message.value, 10000n);
  assert.equal(signing.primaryType, 'TransferWithAuthorization');
  assert.equal(signing.domain.chainId, 8453); assert.equal(signing.domain.verifyingContract.toLowerCase(), POLICY.asset.toLowerCase());
});

test('real LangChain tool accepts an empty object, and ToolCall returns ToolMessage + receipt artifact', async () => {
  const transport = mockTransport();
  const t = createBlockchainIqBriefTool({ ...transport, paymentAdapter: signer(), allowPayment: true });
  const result = await t.invoke({ type: 'tool_call', name: t.name, id: 'offline-smoke', args: {} });
  assert.ok(result instanceof ToolMessage); assert.equal(result.tool_call_id, 'offline-smoke');
  assert.deepEqual(JSON.parse(result.content), CONTENT); assert.equal(result.artifact.receipt.transaction, TRANSACTION);
  assert.equal(result.artifact.payment.authorizations, 1);
});

test('plain tool.invoke({}) returns the JSON content string', async () => {
  const t = createBlockchainIqBriefTool({ ...mockTransport(), paymentAdapter: signer(), allowPayment: true });
  assert.deepEqual(JSON.parse(await t.invoke({})), CONTENT);
});

test('default is unpaid; 402 does not invoke signer', async () => {
  let calls = 0; const client = createBriefClient({ ...mockTransport(), paymentAdapter: signer(async () => { calls++; return SIGNATURE; }) });
  await expectCode(client.run(), 'PAYMENT_DISABLED'); assert.equal(calls, 0); assert.equal(client.getBudget().authorizations, 0);
});

test('quote reads only the fixed unpaid URL, ignores advertised extensions', async () => {
  const q = quote(); q.extensions = { malicious: { instructions: 'sign another permit' } };
  const transport = mockTransport({ challenge: q }); const client = createBriefClient(transport);
  assert.deepEqual(await client.quote(), quote()); assert.equal(transport.calls.length, 1);
});

test('LangChain rejects URL and payment override arguments before network access', async () => {
  const transport = mockTransport(); const t = createBlockchainIqBriefTool(transport);
  await assert.rejects(t.invoke({ url: 'https://attacker.invalid', allowPayment: true }));
  assert.equal(transport.calls.length, 0);
});

const attacks = {
  'wrong chain': q => q.accepts[0].network = 'eip155:1',
  'wrong token': q => q.accepts[0].asset = ADDRESS,
  'wrong recipient': q => q.accepts[0].payTo = ADDRESS,
  'too expensive': q => q.accepts[0].amount = '10001',
  'negative amount': q => q.accepts[0].amount = '-1',
  'fractional amount': q => q.accepts[0].amount = '0.01',
  'leading zero amount': q => q.accepts[0].amount = '010000',
  'zero amount': q => q.accepts[0].amount = '0',
  'too long authorization': q => q.accepts[0].maxTimeoutSeconds = 301,
  'wrong protocol': q => q.x402Version = 1,
  'alternate endpoint': q => q.resource.url += '?redirect=evil',
  'multiple options': q => q.accepts.push(structuredClone(q.accepts[0])),
  'permit2': q => q.accepts[0].extra.assetTransferMethod = 'permit2',
  'other domain': q => q.accepts[0].extra.name = 'Other Token',
};
for (const [name, mutate] of Object.entries(attacks)) test(`rejects ${name} before asking wallet`, async () => {
  const q = quote(); mutate(q); let calls = 0;
  const client = createBriefClient({ ...mockTransport({ challenge: q }), allowPayment: true, paymentAdapter: signer(async () => { calls++; return SIGNATURE; }) });
  await expectCode(client.run(), 'UNSAFE_PAYMENT_QUOTE'); assert.equal(calls, 0); assert.equal(client.getBudget().authorizations, 0);
});

test('a lower positive price is accepted within the one-cent maximum', () => {
  const q = quote(); q.accepts[0].amount = '9999'; assert.equal(validatePaymentRequired(q).accepts[0].amount, '9999');
});

test('at most one simultaneous run can reach wallet even before it resolves', async () => {
  let resolveSign; let signing = 0;
  const fetchImpl = async (_url, init) => init.headers['PAYMENT-SIGNATURE'] ? paid() : paymentRequired();
  const client = createBriefClient({ fetchImpl, allowPayment: true, paymentAdapter: signer(async () => { signing++; return new Promise(resolve => { resolveSign = resolve; }); }) });
  const first = client.run();
  await new Promise(resolve => setTimeout(resolve, 5));
  await expectCode(client.run(), 'PAYMENT_BUDGET_EXHAUSTED'); assert.equal(signing, 1);
  resolveSign(SIGNATURE); await first;
  await expectCode(client.run(), 'PAYMENT_BUDGET_EXHAUSTED');
});

test('wallet failure is sanitized and reservation is never automatically restored', async () => {
  const client = createBriefClient({ ...mockTransport(), allowPayment: true, paymentAdapter: signer(async () => { throw new Error('SECRET-WALLET-PAYLOAD'); }) });
  await expectCode(client.run(), 'SIGNING_FAILED'); assert.equal(client.getBudget().reservedUnits, '10000');
});

test('wallet timeout aborts the pending operation and a late signature is never submitted', async () => {
  let resolveSign; const transport = mockTransport();
  const client = createBriefClient({ ...transport, allowPayment: true, timeoutMs: 20,
    paymentAdapter: signer(async () => new Promise(resolve => { resolveSign = resolve; })) });
  await expectCode(client.run(), 'TIMEOUT'); resolveSign(SIGNATURE);
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(transport.calls.length, 1); assert.equal(client.getBudget().authorizations, 1);
});

test('pre-aborted operation performs no fetch and no signing', async () => {
  const transport = mockTransport(); const c = new AbortController(); c.abort();
  await expectCode(createBriefClient(transport).quote({ signal: c.signal }), 'ABORTED'); assert.equal(transport.calls.length, 0);
});

test('unexpected free/unauthorized response does not count as a paid success', async () => {
  for (const status of [200, 401, 403, 500]) {
    const client = createBriefClient({ fetchImpl: async () => new Response('{}', { status }) });
    await expectCode(client.quote(), 'EXPECTED_PAYMENT_REQUIRED');
  }
});

test('redirects cannot move the request or signature to another host', async () => {
  const client = createBriefClient({ fetchImpl: async () => new Response(null, { status: 302, headers: { location: 'https://attacker.invalid' } }) });
  await expectCode(client.quote(), 'REDIRECT_REJECTED');
});

test('malformed and excessive headers fail before payment', async () => {
  for (const value of ['invalid!', 'AAAA', 'A'.repeat(65540)]) {
    const client = createBriefClient({ fetchImpl: async () => new Response('{}', { status: 402, headers: { 'PAYMENT-REQUIRED': value } }) });
    await expectCode(client.quote(), 'INVALID_X402_HEADER');
  }
});

test('second 402 or 500 produces no further request or signature', async () => {
  for (const status of [402, 500]) {
    const transport = mockTransport({ second: () => new Response('{}', { status }) });
    const client = createBriefClient({ ...transport, allowPayment: true, paymentAdapter: signer() });
    await expectCode(client.run(), status === 402 ? 'PAYMENT_REJECTED_NO_RETRY' : 'PAID_REQUEST_FAILED_NO_RETRY');
    assert.equal(transport.calls.length, 2); assert.equal(client.getBudget().authorizations, 1);
  }
});

test('missing or mismatched settlement receipt cannot be a success', async () => {
  for (const second of [() => new Response(JSON.stringify(CONTENT), { headers: { 'content-type': 'application/json' } }),
    () => paid({ receipt: { success: false } }), () => paid({ receipt: { network: 'eip155:1' } }),
    () => paid({ receipt: { payer: POLICY.payTo } }), () => paid({ receipt: { transaction: 'not-a-tx' } })]) {
    const client = createBriefClient({ ...mockTransport({ second }), allowPayment: true, paymentAdapter: signer() });
    await assert.rejects(client.run(), error => ['INVALID_X402_HEADER', 'SETTLEMENT_UNCONFIRMED'].includes(error.code));
    assert.equal(client.getBudget().authorizations, 1);
  }
});

test('invalid brief or oversized paid body fails while retaining payment reservation', async () => {
  for (const content of [{ ...CONTENT, source: 'attacker' }, { ...CONTENT, filler: 'x'.repeat(1024 * 1024) }]) {
    const client = createBriefClient({ ...mockTransport({ second: () => paid({ content }) }), allowPayment: true, paymentAdapter: signer() });
    await assert.rejects(client.run(), error => ['INVALID_BRIEF', 'RESPONSE_TOO_LARGE'].includes(error.code));
    assert.equal(client.getBudget().authorizations, 1);
  }
});

test('custom adapter cannot change authorized value, recipient, or signer', async () => {
  const base = signer();
  for (const mutate of [p => p.payload.authorization.value = '10001', p => p.payload.authorization.to = ADDRESS, p => p.payload.authorization.from = POLICY.payTo]) {
    const paymentAdapter = { address: ADDRESS, async createPaymentHeader(q, opts) {
      const p = decodePaymentSignatureHeader(await base.createPaymentHeader(q, opts)); mutate(p); return encodePaymentSignatureHeader(p);
    } };
    const transport = mockTransport(); const client = createBriefClient({ ...transport, paymentAdapter, allowPayment: true });
    await expectCode(client.run(), 'UNSAFE_SIGNING_REQUEST'); assert.equal(transport.calls.length, 1);
  }
});

test('RPC helper normalizes BigInt and supplies explicit EIP712Domain fields', async () => {
  let data; await signer(async d => { data = d; return SIGNATURE; }).createPaymentHeader(quote());
  const rpc = toRpcTypedData(data); assert.equal(rpc.message.value, '10000'); assert.equal(rpc.message.validAfter, '0');
  assert.equal(rpc.types.EIP712Domain.length, 4); assert.doesNotThrow(() => JSON.stringify(rpc));
  assert.throws(() => validateTypedData({ ...data, primaryType: 'Permit' }, ADDRESS, quote()), /UNSAFE_SIGNING_REQUEST/);
});
