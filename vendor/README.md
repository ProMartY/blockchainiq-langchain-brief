# Transparent local dependency forks

These privately named packages are included with the integration, not official upstream releases. No fork account or npm publication has been created. Each fork has a distinct @blockchainiq-local name and -biq.* version, original license, FORK-NOTICE.md and PROVENANCE.json. Full modified fork source/distribution is retained under forks/ for review. npm archives include the local fork tarballs and npm bundleDependencies so normal consumers require no manual overrides or unpublished registry lookup.

See provenance.json for exact upstream registry SHA-512 and local archive SHA-256. x402 forks retain upstream payment logic and use official Zod 4.6.7, with import/dependency names changed. No framework code is forked.

Every bundled dependency remains in the installed lockfile and is included in audit/SBOM evidence. Local names are mapped to the original names and versions in provenance; a clean npm audit alone does not establish security of vendored SDK code. Prior V12/x402 review still applies to the upstream 2.28.0 code base. No audit exclusion, fake upstream version, or missing runtime peer is used as a remedy.

Bundled dependencies declare exact semantic versions in package.json. The source lockfile resolves them to the checked-in vendor/tarballs archives; use `npm ci --ignore-scripts` for a source checkout. This avoids exposing invalid relative file references to consumers or requiring a fork registry account. The installed consumer graph must pass npm ls and npm sbom as well as smoke/audit. [npm bundled-dependency documentation](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#bundledependencies).
