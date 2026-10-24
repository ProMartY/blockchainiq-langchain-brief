import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { privateKeyToAccount } from 'viem/accounts';
import { assertOwnerTypedData, createOwnerWalletServer, PAYMENT } from '../scripts/owner-wallet-server.js';
import { createBlockchainIqBriefTool } from '../src/index.js';
import { mockTransport, paid, TRANSACTION } from './fixtures.js';

// Public synthetic fixture used only for local tests. Never fund it.
const fixtureAccount = privateKeyToAccount('0x' + '11'.repeat(32));
function typed(now = Math.floor(Date.now() / 1000)) {
  return {
    domain: { name: 'USD Coin', version: '2', chainId: 8453, verifyingContract: PAYMENT.asset },
    primaryType: 'TransferWithAuthorization',
    types: { TransferWithAuthorization: [
      { name: 'from', type: 'address' }, { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' }, { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' },
    ] },
    message: { from: fixtureAccount.address, to: PAYMENT.recipient, value: 10000n, validAfter: 0n, validBefore: BigInt(now + 300), nonce: '0x' + '22'.repeat(32) },
  };
}
test('accepts the intended one-cent EIP-3009 authorization', () => assert.equal(assertOwnerTypedData(typed(), fixtureAccount.address), true));
for (const [name, change] of [
  ['network', value => value.domain.chainId = 1],
  ['token', value => value.domain.verifyingContract = '0x' + '33'.repeat(20)],
  ['domain name', value => value.domain.name = 'Permit2'],
  ['domain version', value => value.domain.version = '1'],
  ['extra domain field', value => value.domain.salt = '0x' + '00'.repeat(32)],
  ['recipient', value => value.message.to = '0x' + '44'.repeat(20)],
  ['amount', value => value.message.value = 10001n],
  ['payer', value => value.message.from = '0x' + '55'.repeat(20)],
  ['authorization schema', value => value.primaryType = 'Permit'],
  ['type field', value => value.types.TransferWithAuthorization[2].type = 'string'],
  ['extra type', value => value.types.Permit = []],
  ['extra message field', value => value.message.spender = PAYMENT.recipient],
  ['nonce', value => value.message.nonce = '0x1234'],
  ['expired signature', value => value.message.validBefore = 1n],
  ['nonzero validAfter', value => value.message.validAfter = 1n],
  ['over-five-minute lifetime', value => value.message.validBefore = BigInt(Math.floor(Date.now()/1000) + 301)],
  ['long lifetime', value => value.message.validBefore = BigInt(Math.floor(Date.now()/1000) + 10000)],
]) test(`refuses altered ${name}`, () => { const value = typed(); change(value); assert.throws(() => assertOwnerTypedData(value, fixtureAccount.address)); });

async function connect(app) {
  const page = await (await fetch(app.url)).text();
  const token = page.match(/const token='([a-f0-9]{64})'/)[1];
  return async (path, body, extraHeaders = {}) => {
    const response = await fetch(app.url + path, { method: body ? 'POST' : 'GET', headers: { 'X-Session-Token': token, ...(body ? { 'Content-Type': 'application/json' } : {}), ...extraHeaders }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  };
}
test('preview cannot start a payment and session endpoints reject unauthenticated and cross-origin calls', async t => {
  let toolCalls = 0;
  const app = await createOwnerWalletServer({ makeTool() { toolCalls++; throw Error('must not run'); } });
  t.after(() => app.close());
  const call = await connect(app);
  assert.equal((await call('/api/start', { address: fixtureAccount.address })).status, 403);
  assert.equal((await fetch(app.url + '/api/state')).status, 403);
  assert.equal((await call('/api/state', undefined, { Origin: 'https://attacker.invalid' })).status, 403);
  assert.equal(toolCalls, 0);
  const invalidHostStatus = await new Promise(resolve => {
    http.get(app.url, { headers: { Host: 'attacker.invalid' } }, response => { response.resume(); resolve(response.statusCode); });
  });
  assert.equal(invalidHostStatus, 403);
});
test('one live attempt waits for a real local fixture signature, returns receipt only, and refuses a second attempt', async t => {
  let calls = 0;
  const app = await createOwnerWalletServer({ allowOnePayment: true, expectedPayer: fixtureAccount.address,
    makeAdapter: signer => signer,
    makeTool: options => ({ name: 'offline_fixture', async invoke(input) {
      assert.equal(input.type, 'tool_call');
      assert.equal(options.allowPayment, true);
      await options.paymentAdapter.signTypedData(typed());
      calls++;
      return { content: 'PAID_RESEARCH_MUST_NOT_LEAK', artifact: { receipt: { success: true, transaction: '0x' + 'ab'.repeat(32), network: 'eip155:8453', payer: fixtureAccount.address }, payment: {} } };
    } }),
  });
  t.after(() => app.close());
  const call = await connect(app);
  assert.equal((await call('/api/start', { address: '0x' + '33'.repeat(20) })).status, 400);
  assert.equal((await call('/api/start', { address: fixtureAccount.address })).status, 202);
  const pending = (await call('/api/state')).body;
  assert.equal(pending.phase, 'awaiting_owner_signature');
  assert.equal(calls, 0);
  assert.equal((await call('/api/signature', { id: 'wrong', signature: '0x' + '00'.repeat(65) })).status, 400);
  const signature = await fixtureAccount.signTypedData(typed());
  assert.equal((await call('/api/signature', { id: pending.pending.id, signature })).status, 200);
  let finished;
  for (let i = 0; i < 30; i++) { finished = (await call('/api/state')).body; if (finished.phase === 'settled') break; await new Promise(resolve => setTimeout(resolve, 5)); }
  assert.equal(finished.phase, 'settled');
  assert.equal(calls, 1);
  assert.equal(finished.receipt.success, true);
  assert.equal(JSON.stringify(finished).includes('PAID_RESEARCH_MUST_NOT_LEAK'), false);
  assert.equal(JSON.stringify(finished).includes(signature), false);
  assert.equal((await call('/api/start', { address: fixtureAccount.address })).status, 409);
});
test('the owner can decline before the integration receives a signature', async t => {
  let calls = 0;
  const app = await createOwnerWalletServer({ allowOnePayment: true, makeAdapter: signer => signer,
    makeTool: options => ({ name: 'offline_fixture', async invoke() { await options.paymentAdapter.signTypedData(typed()); calls++; return {}; } }),
  });
  t.after(() => app.close());
  const call = await connect(app);
  await call('/api/start', { address: fixtureAccount.address });
  const state = (await call('/api/state')).body;
  assert.equal((await call('/api/cancel', { id: state.pending.id })).status, 200);
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal((await call('/api/state')).body.phase, 'stopped');
  assert.equal(calls, 0);
});

test('the real SDK and LangChain tool complete the local bridge using only a synthetic owner signature and mocked upstream', async t => {
  const transport = mockTransport({ second: () => paid({ receipt: { payer: fixtureAccount.address } }) });
  const app = await createOwnerWalletServer({
    allowOnePayment: true,
    expectedPayer: fixtureAccount.address,
    // Keep the real default createSdkPaymentAdapter and real LangChain tool.
    // Inject only the upstream HTTP transport; it never performs a network request.
    makeTool: options => createBlockchainIqBriefTool({ ...options, fetchImpl: transport.fetchImpl }),
  });
  t.after(() => app.close());
  const call = await connect(app);
  assert.equal((await call('/api/start', { address: fixtureAccount.address })).status, 202);
  let current;
  for (let i = 0; i < 30; i++) {
    current = (await call('/api/state')).body;
    if (current.pending) break;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.equal(current.phase, 'awaiting_owner_signature');
  assert.equal(transport.calls.length, 1, 'only the unsigned mocked quote has been requested');
  const sdkTyped = current.pending.typedData;
  assert.equal(sdkTyped.primaryType, 'TransferWithAuthorization');
  assert.equal(sdkTyped.message.validAfter, '0');
  assert.equal(sdkTyped.message.value, PAYMENT.amount);
  assert.equal(sdkTyped.domain.chainId, PAYMENT.chainId);
  assert.deepEqual(sdkTyped.types.EIP712Domain.map(field => field.name), ['name', 'version', 'chainId', 'verifyingContract']);
  assert.equal(assertOwnerTypedData(sdkTyped, fixtureAccount.address), true);
  const signature = await fixtureAccount.signTypedData(sdkTyped);
  assert.equal((await call('/api/signature', { id: current.pending.id, signature })).status, 200);
  for (let i = 0; i < 30; i++) {
    current = (await call('/api/state')).body;
    if (current.phase === 'settled') break;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.equal(current.phase, 'settled');
  assert.equal(current.receipt.transaction, TRANSACTION);
  assert.equal(current.receipt.payer, fixtureAccount.address);
  assert.equal(transport.calls.length, 2);
  assert.equal(transport.calls[1].init.redirect, 'error');
  assert.equal(typeof transport.calls[1].init.headers['PAYMENT-SIGNATURE'], 'string');
  assert.equal(JSON.stringify(current).includes(signature), false);
  assert.equal(JSON.stringify(current).includes('Synthetic fixture'), false);
  assert.equal((await call('/api/start', { address: fixtureAccount.address })).status, 409);
});
