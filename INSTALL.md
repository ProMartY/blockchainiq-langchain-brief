# RC3 consumer installation

Prerelease: `blockchainiq-langchain-brief@0.1.0-rc.3` (`next`). Publisher account: `promarty`. Node 22+; validated on Node 24.19.0 and npm 11.17.0. The package is public: use `npm install --ignore-scripts blockchainiq-langchain-brief@next`, or `npm install --ignore-scripts blockchainiq-langchain-brief@0.1.0-rc.3` to pin this version. Use @next or the exact version; existing latest metadata is outside these prerelease instructions. The optional local archive workflow is shown below.

Use a clean application with `private: true`, `type: module`, and a dependency on the local release archive. Example:

```json
{
  "name": "blockchainiq-langchain-consumer",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "blockchainiq-langchain-brief": "file:../blockchainiq-langchain-brief-0.1.0-rc.3.tgz"
  }
}
```

Run `npm install --ignore-scripts` and retain the generated application lockfile. No root overrides, optional missing SDK peers, external fork registry account or lifecycle script is required. For registry installation, replace the archive reference with the exact package version above.

## What is included

The archive includes independently named local forks through npm bundleDependencies and their local source tarballs. They preserve upstream licenses and package/source provenance. They are not official upstream releases. The SDK fork uses the official fixed Zod 4.6.7 instead of the incompatible upstream ^3 dependency declaration; payment implementation is retained. The LangChain framework remains official 1.3.0.

See vendor/provenance.json, each fork's PROVENANCE.json/FORK-NOTICE.md/LICENSE, THIRD-PARTY-NOTICES.md and the source release SBOM. npm audit covers the installed external/transitive graph; upstream SDK identities and versions are also mapped for manual advisory review. Local fork names must not be mistaken for upstream fixes.

## Safety

Payments default off. A validated quote, exact token/network/payee/value typed data, one reserved authorization, fixed resource, redirect rejection and no automatic paid retry remain mandatory. No real wallet or paid request is used in the release tests. Server-reported receipts are not independent chain verification.

## Maintenance and scope

The maintainer owns these local fork updates. The LangChain integration retains the upstream SDK compiled distribution with dependency/import identity changes. Full upstream suites, browser use, other payment schemes and arbitrary downstream host combinations are not certified by this integration test. Keep the lockfile and update/retest forks deliberately. RC2's root-overrides setup and blocked standard install are historical and superseded for RC3.
