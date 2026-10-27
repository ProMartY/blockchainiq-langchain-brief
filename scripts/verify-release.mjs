import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const artifact=JSON.parse(fs.readFileSync(path.join(root,'docs/rc3-artifact.json'),'utf8'));
for(const file of artifact.publishedFiles){
  const candidate=path.resolve(root,file.path);
  assert(candidate.startsWith(root+path.sep),'Unexpected path outside checkout');
  const bytes=fs.readFileSync(candidate);
  assert.equal(bytes.length,file.size,file.path+' size mismatch');
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),file.sha256,file.path+' hash mismatch');
}
console.log(JSON.stringify({package:artifact.package,version:artifact.version,publishedFilesMatched:artifact.publishedFiles.length,networkRequests:0,wallets:0}));
