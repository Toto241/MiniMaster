import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

const files = walk(process.cwd());
const tests = files.filter(p => /[\\/]test[\\/].+\.test\.ts$/i.test(p));
console.log('CWD:', process.cwd());
console.log('Gefundene Testdateien:', tests.length);
for (const t of tests) console.log(t);
