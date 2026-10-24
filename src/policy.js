export const POLICY = Object.freeze({
  url: 'https://www.blockchainiq.co/api/x402/v1/brief',
  network: 'eip155:8453',
  chainId: 8453,
  asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  payTo: '0x617dA9383fbA67e86137BC4924b8b7E400fB7C9e',
  maxAmount: '10000',
  maxTimeoutSeconds: 300,
});

export class BriefError extends Error {
  constructor(code) { super(code); this.name = 'BriefError'; this.code = code; }
}
export function fail(code) { throw new BriefError(code); }
export const sameAddress = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
export const isAddress = a => typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a);
export const isHash = a => typeof a === 'string' && /^0x[0-9a-fA-F]{64}$/.test(a);
export const isSignature = a => typeof a === 'string' && /^0x[0-9a-fA-F]{130}$/.test(a);

export function validatePaymentRequired(value) {
  if (!value || value.x402Version !== 2 || value.resource?.url !== POLICY.url ||
      !Array.isArray(value.accepts) || value.accepts.length !== 1) fail('UNSAFE_PAYMENT_QUOTE');
  const q = value.accepts[0];
  if (!q || q.scheme !== 'exact' || q.network !== POLICY.network ||
      !sameAddress(q.asset, POLICY.asset) || !sameAddress(q.payTo, POLICY.payTo) ||
      typeof q.amount !== 'string' || !/^[1-9]\d{0,4}$/.test(q.amount) || BigInt(q.amount) > 10000n ||
      !Number.isInteger(q.maxTimeoutSeconds) || q.maxTimeoutSeconds < 1 || q.maxTimeoutSeconds > 300 ||
      q.extra?.name !== 'USD Coin' || q.extra?.version !== '2' ||
      Object.keys(q.extra).some(k => !['name', 'version'].includes(k))) fail('UNSAFE_PAYMENT_QUOTE');
  // Drop untrusted extensions and optional metadata before giving the quote to the SDK.
  return { x402Version: 2, resource: { url: POLICY.url, mimeType: 'application/json' }, accepts: [{
    scheme: 'exact', network: POLICY.network, asset: POLICY.asset, payTo: POLICY.payTo,
    amount: q.amount, maxTimeoutSeconds: q.maxTimeoutSeconds, extra: { name: 'USD Coin', version: '2' },
  }] };
}

const fields = [
  { name: 'from', type: 'address' }, { name: 'to', type: 'address' },
  { name: 'value', type: 'uint256' }, { name: 'validAfter', type: 'uint256' },
  { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' },
];
export function validateTypedData(data, address, quote, nowSeconds = Math.floor(Date.now() / 1000)) {
  const { domain: d, message: m } = data ?? {};
  const q = validatePaymentRequired(quote).accepts[0];
  if (!isAddress(address) || data.primaryType !== 'TransferWithAuthorization' ||
      d?.name !== 'USD Coin' || d.version !== '2' || Number(d.chainId) !== POLICY.chainId ||
      !sameAddress(d.verifyingContract, POLICY.asset) ||
      Object.keys(d).some(k => !['name', 'version', 'chainId', 'verifyingContract'].includes(k)) ||
      JSON.stringify(data.types?.TransferWithAuthorization) !== JSON.stringify(fields) ||
      Object.keys(data.types ?? {}).some(k => !['TransferWithAuthorization', 'EIP712Domain'].includes(k)) ||
      !m || Object.keys(m).some(k => !fields.some(f => f.name === k)) ||
      !sameAddress(m.from, address) || !sameAddress(m.to, POLICY.payTo) || !isHash(m.nonce)) fail('UNSAFE_SIGNING_REQUEST');
  try {
    if (BigInt(m.value) !== BigInt(q.amount) || BigInt(m.validAfter) !== 0n ||
        BigInt(m.validBefore) < BigInt(nowSeconds) ||
        BigInt(m.validBefore) > BigInt(nowSeconds + q.maxTimeoutSeconds)) fail('UNSAFE_SIGNING_REQUEST');
  } catch { fail('UNSAFE_SIGNING_REQUEST'); }
  return data;
}
