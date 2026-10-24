# Validation record — 2026-10-24

Packaging-time snapshot (24 October 2026): private local integration, not yet submitted or published. No private key was read, requested, exported, or stored. No wallet signature or paid call was made.

Executed with bundled Node v24.19.0:

- `node --test test/brief.test.js`: **33 passed, 0 failed**, approximately 2.2 seconds.
- `node scripts/smoke.js`: passed. Actual LangChain ToolMessage and x402 SDK handshake with injected synthetic transport/signature; **zero network requests, zero real payments**.
- `node scripts/quote.js`: passed against the live fixed official endpoint. HTTP 402 quoted Base native USDC, recipient pinned in policy, amount `10000`, maximum timeout 300 seconds. **Unpaid; no signing.**
- `npm ls --depth=0`: installed exact versions `@langchain/core@1.3.0`, `@x402/core@2.28.0`, `@x402/evm@2.28.0`, `@x402/fetch@2.28.0`, `viem@2.57.11`, `zod@4.6.7`.
- After the independently reviewed owner wallet bridge was completed, `npm run check` and `npm run smoke` both passed: Node reported **60 passed, 0 failed** across the adapter and wallet bridge (including one fixture-module discovery entry), approximately 1.1 seconds, at 18:34 UTC. This includes the preview refusal, owner decline, session/origin/Host checks, strict EIP-712 policy, once-only local bridge tests, and the actual SDK + LangChain + local bridge flow with a public synthetic test wallet. Real upstream HTTP requests and real funds remain absent from the tests.

Coverage includes fixed-resource policy, unsafe chain/token/recipient/price/timeout/domain/Permit2 rejection, strict tool arguments, actual SDK payload and RPC normalization, default payment disabled, simultaneous-run budget reservation, sanitized provider errors, cancellation/late signature, redirects, malformed/oversized challenge, second 402, missing/mismatched receipt, oversized/invalid response, modified adapter payload, and preservation of the original data envelope.

The standalone adapter has 33 assertions/tests; the integrated result above includes the parent-owned optional wallet UI/server tests as well.

Still needed for bounty qualification: owner-approved real one-cent call through this integration, verification of settlement, public repo approval/publication, maintainer submission, and pass. Award availability and review time are not guaranteed; USDC payout is stated within three days after passing, not within three days after submission.


Final dependency review 24 October 2026: npm audit reports 0 low / 0 moderate / 0 high / 0 critical. @x402/core and @x402/evm are scoped to Zod 4.6.7, crossing their declared ^3.24.2 constraint. Installed 4.6.7 restores single-argument record compatibility; four additional tests validate actual public SDK schema exports, real synthetic SDK payload and invalid inputs. Native LangChain handshake/negative client/bridge checks also pass. This supports the documented x402 v2 exact path, not blanket upstream compatibility. Final count 60 includes the fixture module as a discovered test. At that packaging-time snapshot, no real paid call, publication or claim had occurred.
