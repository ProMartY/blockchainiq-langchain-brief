import http from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { recoverTypedDataAddress } from 'viem';
import { createBlockchainIqBriefTool } from '../src/index.js';
import { createSdkPaymentAdapter, toRpcTypedData } from '../src/sdk-payment.js';

export const PAYMENT = Object.freeze({
  merchant: 'Blockchain IQ', amount: '10000', usdc: '0.01', chainId: 8453,
  asset: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
  recipient: '0x617da9383fba67e86137bc4924b8b7e400fb7c9e',
});
const lower = value => String(value ?? '').toLowerCase();
const addressPattern = /^0x[0-9a-f]{40}$/i;
const signaturePattern = /^0x[0-9a-f]{130}$/i;
const expectedFields = [
  { name: 'from', type: 'address' }, { name: 'to', type: 'address' },
  { name: 'value', type: 'uint256' }, { name: 'validAfter', type: 'uint256' },
  { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' },
];

export function assertOwnerTypedData(typed, address, now = Math.floor(Date.now() / 1000)) {
  const domain = typed?.domain, message = typed?.message;
  if (!addressPattern.test(address)) throw new Error('Invalid payer address');
  if (typed?.primaryType !== 'TransferWithAuthorization') throw new Error('Only one EIP-3009 transfer is supported');
  if (Number(domain?.chainId) !== PAYMENT.chainId || lower(domain?.verifyingContract) !== PAYMENT.asset || domain?.name !== 'USD Coin' || domain?.version !== '2') throw new Error('Unexpected payment domain');
  if (Object.keys(domain).sort().join(',') !== 'chainId,name,verifyingContract,version') throw new Error('Unexpected domain fields');
  const domainFields = [{ name: 'name', type: 'string' }, { name: 'version', type: 'string' }, { name: 'chainId', type: 'uint256' }, { name: 'verifyingContract', type: 'address' }];
  if (typed.types?.EIP712Domain && JSON.stringify(typed.types.EIP712Domain) !== JSON.stringify(domainFields)) throw new Error('Unexpected domain field definition');
  if (JSON.stringify(typed.types?.TransferWithAuthorization) !== JSON.stringify(expectedFields)) throw new Error('Unexpected transfer field definition');
  if (Object.keys(typed.types ?? {}).some(key => !['TransferWithAuthorization', 'EIP712Domain'].includes(key))) throw new Error('Unexpected additional typed-data type');
  if (!message || Object.keys(message).sort().join(',') !== expectedFields.map(field => field.name).sort().join(',')) throw new Error('Unexpected message fields');
  if (lower(message.from) !== lower(address) || lower(message.to) !== PAYMENT.recipient || String(message.value) !== PAYMENT.amount) throw new Error('Payment payer, recipient or amount changed');
  if (!/^0x[0-9a-f]{64}$/i.test(message.nonce)) throw new Error('Invalid authorization nonce');
  const after = BigInt(message.validAfter), before = BigInt(message.validBefore);
  if (after !== 0n || before <= BigInt(now) || before > BigInt(now + 300)) throw new Error('Unexpected authorization lifetime');
  return true;
}

function safeReceipt(artifact) {
  const source = artifact?.receipt ?? artifact;
  if (!source || typeof source !== 'object') throw new Error('The integration returned no settlement receipt');
  const receipt = {};
  for (const key of ['transaction', 'transactionHash', 'txHash', 'network', 'payer', 'success']) {
    if (['string', 'boolean'].includes(typeof source[key])) receipt[key] = source[key];
  }
  const hash = receipt.transaction ?? receipt.transactionHash ?? receipt.txHash;
  if (!/^0x[0-9a-f]{64}$/i.test(hash ?? '')) throw new Error('Settlement receipt has no transaction hash; do not retry automatically');
  return receipt;
}

async function readJson(request) {
  let size = 0, buffer = '';
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 32768) throw new Error('Request body too large');
    buffer += chunk;
  }
  return JSON.parse(buffer || '{}');
}

export async function createOwnerWalletServer({ port = 0, allowOnePayment = false, expectedPayer, makeTool = createBlockchainIqBriefTool, makeAdapter = createSdkPaymentAdapter } = {}) {
  if (expectedPayer && !addressPattern.test(expectedPayer)) throw new Error('Invalid expected payer');
  const sessionToken = randomBytes(32).toString('hex');
  const page = await readFile(new URL('./owner-wallet-page.html', import.meta.url), 'utf8');
  const state = { phase: 'ready', live: allowOnePayment, policy: PAYMENT, payer: null, pending: null, receipt: null, error: null };
  let started = false, signatureRequested = false, pendingControl = null, origin;

  const server = http.createServer(async (request, response) => {
    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
    const send = (code, value) => { response.writeHead(code, { ...headers, 'Content-Type': 'application/json' }); response.end(JSON.stringify(value)); };
    try {
      if (request.headers.host !== new URL(origin).host) return send(403, { error: 'Invalid host' });
      if (request.headers.origin && request.headers.origin !== origin) return send(403, { error: 'Cross-origin requests rejected' });
      if (request.method === 'GET' && request.url === '/') {
        const nonce = randomBytes(18).toString('base64');
        response.writeHead(200, { ...headers, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': `default-src 'self'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'` });
        return response.end(page.replaceAll('__CSP_NONCE__', nonce).replace('__SESSION_TOKEN__', sessionToken));
      }
      if (request.headers['x-session-token'] !== sessionToken) return send(403, { error: 'Missing session authorization' });
      if (request.method === 'GET' && request.url === '/api/state') return send(200, state);
      if (request.method !== 'POST' || request.headers['content-type'] !== 'application/json') return send(405, { error: 'Unsupported request' });
      const body = await readJson(request);
      if (request.url === '/api/start') {
        if (!allowOnePayment) return send(403, { error: 'Preview only. A paid test has not been enabled.' });
        if (started) return send(409, { error: 'This session already started its one attempt. Inspect the result before any retry.' });
        if (!addressPattern.test(body.address) || (expectedPayer && lower(body.address) !== lower(expectedPayer))) return send(400, { error: 'Wrong connected payer' });
        started = true;
        state.phase = 'requesting_quote'; state.payer = body.address;
        const signTypedData = typed => {
          if (signatureRequested) throw new Error('This session already requested its one authorization');
          assertOwnerTypedData(typed, body.address);
          signatureRequested = true;
          if (pendingControl) throw new Error('A signature is already pending');
          const id = randomUUID();
          state.pending = { id, typedData: toRpcTypedData(typed) };
          state.phase = 'awaiting_owner_signature';
          return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              if (pendingControl?.id === id) {
                pendingControl = null; state.pending = null;
                reject(new Error('Owner signature timed out; no automatic retry'));
              }
            }, 110000);
            pendingControl = { id, typed, resolve, reject, timeout };
          });
        };
        Promise.resolve().then(async () => {
          const paymentAdapter = makeAdapter({ address: body.address, signTypedData });
          const tool = makeTool({ paymentAdapter, allowPayment: true, timeoutMs: 120000 });
          const message = await tool.invoke({ name: tool.name, args: {}, id: randomUUID(), type: 'tool_call' });
          state.receipt = safeReceipt(message.artifact);
          state.phase = 'settled';
          // The paid research content is intentionally neither saved nor returned by this UI.
        }).catch(() => {
          state.phase = 'stopped';
          state.error = 'The attempt stopped. Check the wallet/API settlement before retrying. No automatic second purchase is allowed.';
        }).finally(() => {
          if (pendingControl) clearTimeout(pendingControl.timeout);
          pendingControl = null; state.pending = null;
        });
        return send(202, { started: true });
      }
      if (request.url === '/api/signature') {
        const pending = pendingControl;
        if (!pending || body.id !== pending.id || !signaturePattern.test(body.signature)) return send(400, { error: 'No matching signature request' });
        assertOwnerTypedData(pending.typed, state.payer);
        const recovered = await recoverTypedDataAddress({ ...pending.typed, signature: body.signature });
        if (lower(recovered) !== lower(state.payer)) return send(400, { error: 'Signature payer mismatch' });
        if (pendingControl !== pending) return send(409, { error: 'Signature request expired' });
        clearTimeout(pending.timeout); pendingControl = null; state.pending = null;
        state.phase = 'settling';
        pending.resolve(body.signature);
        return send(200, { accepted: true });
      }
      if (request.url === '/api/cancel') {
        const pending = pendingControl;
        if (!pending || body.id !== pending.id) return send(400, { error: 'No matching signature request' });
        clearTimeout(pending.timeout); pendingControl = null; state.pending = null;
        pending.reject(new Error('Owner declined the signature'));
        return send(200, { stopped: true });
      }
      return send(404, { error: 'Not found' });
    } catch {
      return send(400, { error: 'Request rejected' });
    }
  });
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  return { server, url: origin, close: () => new Promise(resolve => {
    if (pendingControl) { clearTimeout(pendingControl.timeout); pendingControl.reject(new Error('Local session closed')); pendingControl = null; }
    server.close(resolve);
  }) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const portArg = process.argv.find(value => value.startsWith('--port='));
  const payerArg = process.argv.find(value => value.startsWith('--payer='));
  const app = await createOwnerWalletServer({ port: portArg ? Number(portArg.split('=')[1]) : 43817, allowOnePayment: process.argv.includes('--allow-one-payment'), expectedPayer: payerArg?.split('=')[1] });
  console.log(`Local wallet review: ${app.url} (${process.argv.includes('--allow-one-payment') ? 'ONE paid attempt enabled; owner wallet signature required' : 'PREVIEW ONLY; payment disabled'})`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => app.close().then(() => process.exit(0)));
}
