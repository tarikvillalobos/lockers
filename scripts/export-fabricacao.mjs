// Gera a pasta fabricacao/ (DXF, desenhos, lista de materiais, aninhamento, roteiro).
//   node scripts/export-fabricacao.mjs
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPackage } from '../src/cad/package.js';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'fabricacao');
rmSync(out, { recursive: true, force: true });
const { files, all } = buildPackage();
for (const f of files) {
  const p = join(out, f.path);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, f.text);
}
const t = all.drawer.totals;
console.log(`${files.length} arquivos em fabricacao/`);
console.log(`Armário 3: ${t.pieces} peças, ${t.partNumbers} códigos, ${t.mass.toFixed(1)} kg, ${(t.cut / 1000).toFixed(1)} m de corte, ${t.bends} dobras, ${t.sheets} chapas`);
for (const u of all.unique) console.log(`  ${u.part.file.padEnd(12)} ${u.part.name.padEnd(30)} x${String(u.part.qty).padEnd(3)} ${u.flat.width.toFixed(2).padStart(8)} x ${u.flat.height.toFixed(2).padStart(8)}  dobras ${u.flat.bends.length}  aneis ${u.flat.outer.length}+${u.flat.inner.length}  furos ${u.flat.circles.length}  ${u.flat.mass.toFixed(2)} kg`);
