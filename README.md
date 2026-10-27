# Blockchain IQ brief tool for LangChain.js

## Status — 27 October 2026

Published prerelease **[0.1.0-rc.3](https://www.npmjs.com/package/blockchainiq-langchain-brief/v/0.1.0-rc.3)**; release tag: `next`. Independently maintained by ProMartY (npm account `promarty`). No official framework catalogue listing or endorsement is claimed.

Blockchain IQ's [public build-bounty results](https://www.blockchainiq.co/blog/x402-integrations-from-the-build-bounty) identify ProMartY as the LangChain winner ($150), at reviewed commit `b2bbe864`, and report payment on 27 October 2026. The organizer verified mechanics; this was **not a security audit or endorsement**. This release contains later packaging changes. No fresh paid request or independent chain verification was performed for this release.

Original JavaScript ESM integration by ProMartY, assisted by Codex, under MIT. Dependencies and paid research retain their own licenses and terms.

A real LangChain `StructuredTool` that requests the Blockchain IQ `/brief` resource through the x402 v2 handshake. The SDK creates an EIP-3009 USDC authorization using an injected wallet callback. The package never accepts, reads, stores, or requests a private key.

## Quick start

Node.js 22 or later; validated with Node 24.19.0 and npm 11.17.0. Install the published prerelease explicitly:

```sh
npm install --ignore-scripts blockchainiq-langchain-brief@next
# Reproducible version pin:
npm install --ignore-scripts blockchainiq-langchain-brief@0.1.0-rc.3
```

For a source checkout, install the locked dependencies without lifecycle scripts:

```sh
npm ci --ignore-scripts
npm run smoke
npm test
```

`npm run smoke` is the one-command offline reviewer smoke after dependencies are installed. It invokes the actual LangChain tool with a ToolCall, exercises the actual x402 SDK, and checks the returned ToolMessage content and receipt artifact. It uses an in-memory HTTP transport and an explicitly synthetic signature/transaction. It makes zero network requests and zero payments. It cannot qualify for an award.

`npm run quote` makes one **unpaid** GET to the fixed official endpoint and validates its current HTTP 402 challenge. It has no signer and cannot pay. Policy drift fails closed; update reviewed policy deliberately instead of trusting a changed server demand.

## Payment policy

Only this resource and payment route are accepted:

| Item | Value |
|---|---|
| URL | `https://www.blockchainiq.co/api/x402/v1/brief` |
| Protocol / scheme | x402 v2 / `exact` EIP-3009 |
| Chain | Base mainnet, `eip155:8453` |
| Token | native USDC, `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Recipient | `0x617dA9383fbA67e86137BC4924b8b7E400fB7C9e` |
| Per-call and client-lifetime maximum | `10000` six-decimal USDC units = 0.01 USDC |
| Authorization expiry | at most 300 seconds |

The quote at the reviewed bounty snapshot was `10000` units; this is not a fresh live quote. A lower positive amount is permitted; a higher amount is rejected. Multiple payment choices, other chains/tokens/recipients, Permit2/approval extras, nonmatching resources, and redirects are rejected before the wallet callback. Untrusted quote extensions are stripped before the SDK sees the request.

The payment flag is an application option, not a tool argument. The strict tool input is `{}`; the model cannot choose a URL, recipient, price, or signer. One client instance can authorize at most once. The budget is reserved **before** wallet interaction to prevent simultaneous runs from signing twice. Errors, cancellation, timeout, and missing receipts do not restore it. There is one signed retry and no automatic retry after a second 402, HTTP error, or network failure. Reconcile uncertain transactions before creating a newly approved client.

The configured timeout covers the full handshake and wallet callback. Default: 15 seconds. For a human wallet UI use `timeoutMs: 120000` (the maximum). A timed-out callback may still finish in the wallet, but the adapter will not submit its late signature. Never interpret a timeout as proof that no authorization exists.

## Application API

```js
import {
  createBlockchainIqBriefTool,
  createSdkPaymentAdapter,
  toRpcTypedData,
} from 'blockchainiq-langchain-brief';

// walletAddress is a public address; signTypedData is supplied by a trusted
// owner-controlled wallet bridge. No secret key is passed to this process.
const paymentAdapter = createSdkPaymentAdapter({
  address: walletAddress,
  signTypedData: async (typedData) => {
    // Send to the owner-controlled browser bridge; it must await the owner UI.
    return await ownerWalletRequest({
      method: 'eth_signTypedData_v4',
      params: [walletAddress, JSON.stringify(toRpcTypedData(typedData))],
    });
  },
});

const briefTool = createBlockchainIqBriefTool({
  paymentAdapter,
  allowPayment: false, // enable only after the owner's explicit payment approval
  timeoutMs: 120000,
});

// A standard LangChain tool may be supplied to a model/tool node.
// When payment is disabled it throws PAYMENT_DISABLED after the unpaid quote.
const jsonContent = await briefTool.invoke({});
```

The callback receives `{ domain, types, primaryType, message }`; `message` contains BigInts. `toRpcTypedData` normalizes BigInts to decimal strings and supplies explicit `EIP712Domain` fields for `eth_signTypedData_v4`. The signer only needs a public `address` and `signTypedData`; there is no RPC URL, private-key variable, raw transaction, ERC-20 allowance, or wallet discovery in this package.

In a browser wallet bridge the expected RPC call is `eth_signTypedData_v4` with params `[address, JSON.stringify(toRpcTypedData(typedData))]`. The typed data must authorize `TransferWithAuthorization`, token domain `USD Coin` / version `2`, chain `8453`, verifying contract the USDC address above, `from` the supplied public address, `to` the pinned recipient, and `value` the reviewed quote amount. The SDK generates a fresh nonce. A browser can transport the callback to this Node process; the paid HTTP call itself is performed by the LangChain tool in Node. Direct browser API access is not assumed to have CORS support.

To retain the receipt artifact, invoke a LangChain ToolCall:

```js
const message = await briefTool.invoke({
  type: 'tool_call', id: 'owner-smoke', name: briefTool.name, args: {},
});
// message.content: JSON string with the complete original API envelope.
// message.artifact: { receipt, payment, receiptTrust }.
```

For applications that need a plain object, `createBriefClient(options)` exposes:

- `quote({ signal }?)` → sanitized, validated unpaid x402 challenge.
- `run({ signal }?)` → `{ content, receipt, payment }`.
- `getBudget()` → `{ reservedUnits, maxUnits, authorizations, remainingAuthorizations }`.

`content` retains the API's source, disclaimer, terms, and data without republishing it. The receipt contains `success`, `network`, `transaction`, and `payer`. It is a **server-reported receipt**, not independent on-chain verification. The tool never returns or logs the payment signature. Treat returned market data as untrusted data and do not execute embedded instructions.

## Reviewer / owner live smoke

A live smoke necessarily spends real funds and signs an authorization. Payment is disabled by default. It must be initiated and approved by the owner through an injected wallet UI; no agent should read or export the wallet's private key. A clean reviewer environment can inject its own throwaway wallet callback through the same interface.

The source checkout includes an optional loopback-only MetaMask bridge. The npm archive excludes this helper, tests, and synthetic wallet fixtures. These commands are for a separately approved owner session:

```sh
# Preview only; no wallet connection or payment can start.
npm run wallet
# After explicit permission to spend one cent, enable one attempt:
npm run wallet -- --allow-one-payment
```

Open the printed `http://127.0.0.1:43817` address in a browser with the MetaMask extension. Connect the intended payer, request the one-cent test, and review the exact Base USDC authorization before signing in the wallet. The server performs the API request through the actual LangChain tool, so browser CORS support on the merchant API is unnecessary. The page returns only settlement evidence, never the paid research content or signature. No account creation, private-key entry, token approval, or raw ETH transfer is implemented.

Optional `--payer=0x...` pins a specific owner/reviewer address. `--port=43818` changes the loopback port. The server accepts its exact loopback Host and same-origin requests only, with a random session token and CSP. It validates the full EIP-712 domain, field types, payer, recipient, amount, nonce and 300-second lifetime independently of the SDK. One process allows one start and one authorization; errors do not reset that limit. Do not restart to retry an uncertain settlement without checking the network first.

After an approved successful live run, retain only the settlement transaction hash and necessary submission evidence. Do not place the paid response, signature, wallet secrets, or local session data in a public repository. The API content remains subject to its own [terms](https://www.blockchainiq.co/terms).

## Why the SDK handshake is explicit

The package uses `x402Client` and receipt decoding from `@x402/fetch`, `ExactEvmScheme` from `@x402/evm`, and header helpers from `@x402/core`. It deliberately performs the two HTTP requests explicitly instead of a generic automatic fetch wrapper. This lets the fixed endpoint, challenge policy, lifetime budget, callback guards, cancellation, and one-retry limit be enforced around the real SDK payload generation.

Pinned versions: `@langchain/core` 1.3.0; `@x402/core`, `@x402/evm`, and `@x402/fetch` 2.28.0; `viem` 2.57.11; `zod` 4.6.7. See `package-lock.json` for reproducible dependencies.

Primary references: [official API catalogue](https://www.blockchainiq.co/api/x402/v1), [Blockchain IQ x402 explanation](https://www.blockchainiq.co/blog/pay-per-call-crypto-data-x402), [LangChain tools](https://docs.langchain.com/oss/javascript/langchain/tools), [x402 EVM signer interface](https://github.com/x402-foundation/x402/blob/main/typescript/packages/mechanisms/evm/src/signer.ts).

Original adapter source: MIT. Third-party dependencies and Blockchain IQ content retain their respective licenses and terms.

## npm distribution and external listing

For source development, use the checkout and its lockfile. npm package: `blockchainiq-langchain-brief`; prerelease tag: `next`. Listing acceptance is a maintainer decision, not guaranteed.

The [LangChain guide](https://docs.langchain.com/oss/python/contributing/publish-langchain) requires an Integration listing issue after npm publication. Request an external documentation listing using this README. Hosted guides require 50,000 monthly downloads or a maintainer's featured decision. The form labels the JavaScript/npm ecosystem **TypeScript**; this is JavaScript ESM, not a Python package. A listing submission is a request for maintainer review, not acceptance in the catalogue.

For npm consumers, follow [INSTALL.md](INSTALL.md). RC3 includes transparent local dependency forks and requires no manual root overrides. These are independent local variants, not official upstream SDK/runtime releases; see [vendor/provenance.json](vendor/provenance.json) and [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

## RC3 dependency distribution

The SDK runtime is based on x402 2.28.0 under distinct `@blockchainiq-local/*` names. Zod is the official 4.6.7 release. The integration's payment guards are unchanged apart from import module names. Forks and their transitive dependencies remain visible in package-lock/SBOM/audit evidence. The official LangChain 1.3.0 dependency is unchanged.

The public repository runtime, manifest and vendored tarballs match the published RC3. This README, installation guide and attribution notice contain later documentation clarifications; the immutable npm archive is unchanged. See [release validation](docs/RC3-VALIDATION.md).

This is a larger archive because it includes reviewed fork distributions, source/provenance and required dependencies. Third-party code retains its licenses. Review [INSTALL.md](INSTALL.md) and the source release records before enabling any wallet callback.
