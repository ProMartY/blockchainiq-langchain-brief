import { x402Client } from '@x402/fetch';
import { ExactEvmScheme } from '@x402/evm/exact/client';
import { encodePaymentSignatureHeader } from '@x402/core/http';
import { BriefError, fail, isAddress, isSignature, POLICY, validatePaymentRequired, validateTypedData } from './policy.js';

/** JSON-RPC eth_signTypedData_v4 params: [address, JSON.stringify(toRpcTypedData(data))]. */
export function toRpcTypedData(data) {
  return JSON.parse(JSON.stringify({ ...data, types: {
    EIP712Domain: [
      { name: 'name', type: 'string' }, { name: 'version', type: 'string' },
      { name: 'chainId', type: 'uint256' }, { name: 'verifyingContract', type: 'address' },
    ], ...data.types,
  } }, (_key, value) => typeof value === 'bigint' ? value.toString() : value));
}

/** No keys, RPC credentials or automatic wallet discovery. The caller supplies a wallet callback. */
export function createSdkPaymentAdapter({ address, signTypedData } = {}) {
  if (!isAddress(address) || typeof signTypedData !== 'function') fail('INVALID_SIGNER');
  return Object.freeze({
    address,
    async createPaymentHeader(paymentRequired, { signal } = {}) {
      const quote = validatePaymentRequired(paymentRequired);
      if (signal?.aborted) fail('ABORTED');
      let calls = 0;
      const guardedSigner = {
        address,
        async signTypedData(data) {
          if (signal?.aborted) fail('ABORTED');
          if (++calls !== 1) fail('SIGNATURE_LIMIT');
          validateTypedData(data, address, quote);
          const signature = await signTypedData(data);
          if (signal?.aborted) fail('ABORTED');
          if (!isSignature(signature)) fail('INVALID_SIGNATURE');
          return signature;
        },
      };
      try {
        const client = new x402Client().register(POLICY.network, new ExactEvmScheme(guardedSigner));
        const payload = await client.createPaymentPayload(quote);
        if (calls !== 1 || signal?.aborted) fail(signal?.aborted ? 'ABORTED' : 'SIGNATURE_LIMIT');
        return encodePaymentSignatureHeader(payload);
      } catch (error) {
        if (error instanceof BriefError) throw error;
        // Provider errors may contain sensitive request payloads; do not propagate them.
        fail('SIGNING_FAILED');
      }
    },
  });
}
