# Published RC3 validation

[blockchainiq-langchain-brief@0.1.0-rc.3](https://www.npmjs.com/package/blockchainiq-langchain-brief/v/0.1.0-rc.3) was published by promarty on 2026-10-27T17:43:51.512Z, with next pointing to RC3. The downloaded public tarball matched SHA-256 21dba2caa66f37b1d8f7a5ca7e5028a4317fc7ef6cb4fd2173ecd4042ef4ec9e and the registry SHA-512 integrity recorded in [rc3-artifact.json](rc3-artifact.json). This is a prerelease.

## Reproduce without a wallet

Node 22+ is required; checks ran on Node 24.19.0 / npm 11.17.0. From a fresh checkout:

```sh
npm ci --ignore-scripts
node scripts/verify-release.mjs
npm run check
npm run smoke
npm audit
```

The source lockfile resolves the three bundled fork dependencies to the checked-in vendor/tarballs files; no separate fork registry publication or consumer root overrides are required. verify-release.mjs uses only local SHA-256 checks, including every source/manifest/vendor file listed in rc3-artifact.json. It does not make network requests.

The verified source suite passed 60 tests, covering exact typed-data policy, default-disabled payment, one reservation before an asynchronous signer, concurrent calls, cancellation and late completion, redirects, unsafe challenges, second-402 refusal, receipt handling and the optional source-only loopback wallet bridge. npm run smoke uses the real LangChain ToolCall/ToolMessage and x402 SDK with mocked HTTP and synthetic test data. No wallet, paid call or real signature is needed. Do not run quote or wallet for these release checks.

A fresh consumer installed exact RC3 from the public npm registry with lifecycle scripts disabled and without manual overrides. Native framework/API smoke passed, including seven malicious challenges, one authorization and no second paid retry. npm audit reported 0 info/low/moderate/high/critical. npm ls exited 0 with a redundant auto-installed ws optional peer for langsmith; no invalid/missing dependencies. CycloneDX SBOM generation succeeded.

## Fork provenance and limits

Official @langchain/core remains 1.3.0. x402 2.28.0 distributions are maintained under distinct @blockchainiq-local names and -biq.1 versions. The modifications change import/dependency identities, pin official Zod 4.6.7 and viem 2.57.11 where applicable, and preserve upstream payment implementation. Read [vendor/provenance.json](../vendor/provenance.json), each fork's FORK-NOTICE.md / PROVENANCE.json / Apache-2.0 LICENSE, and [THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md). The reviewed fork source maps retain upstream source; no claim of an upstream-issued patch is made. The local maintainer is responsible for future updates.

Runtime and packaging bytes recorded in rc3-artifact.json match the published release. Public documentation subsequently clarifies registry installation and corrects an obsolete attribution sentence that said no third-party code was bundled. The immutable npm package remains unchanged; its THIRD-PARTY-NOTICES already correctly describes the bundled dependencies.

This was a bounded integration/release-readiness check, not a full security audit, endorsement, full upstream test run or compatibility certification for arbitrary hosts/payment schemes. The $150 bounty reviewed the original mechanics at b2bbe864; later packaging changes are separately documented. No new paid requests or independent on-chain verification were performed.
