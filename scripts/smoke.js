import assert from 'node:assert/strict';
import { createBlockchainIqBriefTool, createSdkPaymentAdapter } from '../src/index.js';
import { ADDRESS, CONTENT, SIGNATURE, TRANSACTION, mockTransport } from '../test/fixtures.js';
// Purely offline: the injected transport never calls fetch or a network API.
const t = createBlockchainIqBriefTool({ ...mockTransport(), allowPayment: true,
  paymentAdapter: createSdkPaymentAdapter({ address: ADDRESS, signTypedData: async () => SIGNATURE }) });
const message = await t.invoke({ type: 'tool_call', name: t.name, id: 'synthetic-smoke', args: {} });
assert.deepEqual(JSON.parse(message.content), CONTENT);
assert.equal(message.artifact.receipt.transaction, TRANSACTION);
console.log(JSON.stringify({ mode: 'OFFLINE SYNTHETIC ONLY — no paid call, no award evidence',
  langchainMessageType: message._getType(), tool: t.name, handshake: '402 -> guarded SDK EIP-3009 payload -> 200 + synthetic receipt',
  assertions: 'passed', networkRequests: 0, realPayments: 0 }, null, 2));
