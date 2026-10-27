import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { z } from 'zod';
const sdkRequire = createRequire(import.meta.resolve('@blockchainiq-local/x402-core/schemas'));
test('local SDK fork loads fixed Zod and oversized constrained collections stop before parsing elements', () => {
  assert.equal(sdkRequire('zod/package.json').version, '4.6.7');
  let parsed = 0;
  const item = z.string().refine(() => { parsed++; return true; });
  const schema = z.array(item).max(2);
  const result = schema.safeParse(['a','b','c']);
  assert.equal(result.success, false);
  assert.equal(parsed, 0, 'the upstream security fix must reject size before element callbacks');
  assert.equal(result.error.issues.length, 1);
});
