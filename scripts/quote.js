import { createBriefClient, POLICY } from '../src/index.js';
try {
  const quote = await createBriefClient().quote();
  console.log(JSON.stringify({ mode: 'UNPAID QUOTE ONLY', endpoint: POLICY.url, quote,
    signing: false, paidCalls: 0, awardQualification: false }, null, 2));
} catch (error) { console.error(error.code ?? 'QUOTE_FAILED'); process.exitCode = 1; }
