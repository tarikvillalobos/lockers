// Monta o pacote de fabricação (lista de arquivos de texto): DXF e desenho de cada peça, lista de materiais
// por modelo, aninhamento por espessura e o roteiro de fabricação. Usado no navegador (.zip) e no Node.
import { flatPattern, fmt, bendCount, bendDeduction } from './sheetmetal.js';
import { buildParts, purchasedItems, MATERIALS, GROUPS, MODELS } from './parts.js';
import { partDxf, dxfDocument, labelPoint } from './dxf.js';
import { drawingSvg } from './drawing.js';
import { nestParts, SHEET } from './nest.js';

const br = (v, d = 2) => fmt(v, d).replace('.', ',');

export function modelData(modelKey) {
  const parts = buildParts(modelKey);
  const entries = parts.map((part) => ({ part, flat: flatPattern(part) }));
  const nests = nestParts(entries);
  const totals = {
    pieces: parts.reduce((a, p) => a + p.qty, 0),
    partNumbers: parts.length,
    mass: entries.reduce((a, e) => a + e.flat.mass * e.part.qty, 0),
    cut: entries.reduce((a, e) => a + e.flat.cutLength * e.part.qty, 0),
    bends: entries.reduce((a, e) => a + e.flat.bends.length * e.part.qty, 0),
    sheets: nests.reduce((a, n) => a + n.sheets.length, 0),
  };
  return { key: modelKey, model: MODELS[modelKey], parts, entries, nests, totals };
}

export function bomCsv(data) {
  const rows = [['Código', 'Descrição', 'Conjunto', 'Material', 'Espessura (mm)', 'Qtd', 'Planificado L (mm)', 'Planificado A (mm)', 'Massa unit. (kg)', 'Massa total (kg)', 'Dobras', 'Corte (m)', 'Arquivo DXF', 'Acabamento']];
  for (const { part, flat } of data.entries) {
    rows.push([
      part.file,
      part.name,
      GROUPS[part.group].label,
      MATERIALS[part.mat].label,
      br(part.t, 1),
      part.qty,
      br(flat.width),
      br(flat.height),
      br(flat.mass, 3),
      br(flat.mass * part.qty, 3),
      bendCount(part),
      br(flat.cutLength / 1000, 2),
      `dxf/${part.file}.dxf`,
      GROUPS[part.group].finish,
    ]);
  }
  rows.push([]);
  rows.push(['Itens comprados', 'Qtd']);
  for (const i of purchasedItems(data.key)) rows.push([i.item, i.qty]);
  rows.push([]);
  rows.push(['Totais', `${data.totals.pieces} peças de chapa`, `${br(data.totals.mass, 1)} kg`, `${br(data.totals.cut / 1000, 1)} m de corte`, `${data.totals.bends} dobras`]);
  return '﻿' + rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n') + '\r\n';
}

function readme(all) {
  const d = all.drawer;
  const sheetLine = (n) => `- ${MATERIALS[n.mat].label} ${br(n.t, 1)} mm: ${n.sheets.length} chapa(s) de ${SHEET.w} × ${SHEET.h} mm (aproveitamento ${n.sheets.map((s) => Math.round(s.used * 100) + '%').join(', ')})`;
  return `# Locker Residencial LR-1020: pacote de fabricação

Arquivos para a metalúrgica cortar a laser, dobrar e soldar. Gerados a partir do modelo 3D (\`src/cad\`),
então refletem as mesmas medidas do armário de 410 × 380 × 1020 mm.

## O que tem aqui

- \`dxf/\`: uma planificação por peça, em milímetros, escala 1:1 (DXF R12).
- \`desenhos/\`: folha A3 de cada peça (SVG) com cotas gerais, dobras numeradas, furos e notas de solda.
- \`aninhamento/\`: as peças de um armário (Armário 3) distribuídas em chapas de ${SHEET.w} × ${SHEET.h} mm, por espessura.
- \`lista-de-materiais-A1.csv\`, \`-A2.csv\`, \`-A3.csv\`: peças, quantidades, massas e itens comprados de cada modelo.

## Camadas do DXF

| Camada | Uso |
| --- | --- |
| \`CORTE\` | contornos e furos (corte a laser) |
| \`DOBRA_CIMA\` | linha de dobra para cima, vista do lado da gravação |
| \`DOBRA_BAIXO\` | linha de dobra para baixo |
| \`GRAVACAO\` | código da peça, marcado a laser em baixa potência |

## Modelos

Os três modelos usam a mesma carcaça. Mudam só as peças com sufixo:

- \`-CHV\` (chave): porta com furo Ø19 da fechadura de tambor; laterais sem janela.
- \`-SOL\` (solenoide): porta sem furo na face e com 2 furos Ø4,2 na aba para a lingueta; laterais com a
  janela de 32 mm no montante e os 2 furos Ø4,5 do corpo do solenoide.
- A tampa do módulo eletrônico (\`LR-031-CHV\`) usa fechadura de chave em todos.
- O Armário 3 acrescenta só o solenoide do basculante (item comprado, preso na rampa).

## Consumo por armário (Armário 3)

- ${d.totals.pieces} peças de chapa em ${d.totals.partNumbers} códigos, ${br(d.totals.mass, 1)} kg de aço.
- ${br(d.totals.cut / 1000, 1)} m de corte a laser e ${d.totals.bends} dobras.
${d.nests.map(sheetLine).join('\n')}

## Roteiro de fabricação

1. **Corte a laser.** Cortar pela camada \`CORTE\` e marcar a camada \`GRAVACAO\`. Rebarbar.
2. **Dobra (dobradeira CNC).** Raio interno igual à espessura; o desenvolvido usa fator K 0,42 (desconto de
   ${br(all.bd20, 2)} mm por dobra de 90° na chapa de 2,0 mm). Conferir com a tabela da máquina na primeira peça.
   Onde a aba tem aba (montantes, portas), dobrar primeiro a de fora. A ordem está numerada no desenho.
3. **Solda.**
   - Portas, base e tampo: fechar os 4 cantos (MIG) e lixar.
   - Carcaça: montar no gabarito as duas laterais, o fundo, a travessa inferior, o painel superior, a rampa e
     o batente traseiro; solda ponto nas abas de 18 mm contra os retornos dos montantes.
   - Ripas: bujão + adesivo estrutural, de baixo para cima (cada ripa cobre a borda da de baixo).
   - Bandeja: piso soldado nas duas placas; pinos Ø7 das bielas soldados nas placas e na porta do basculante.
4. **Pintura eletrostática.** Desengraxe e fosfatização, pó poliéster, cura a 200 °C por 10 min. Carcaça,
   portas e basculante em RAL 7016 texturizado; base e tampo em RAL 7021. O mecanismo é galvanizado e não é pintado.
5. **Montagem.** Base aparafusada na carcaça (4 × M6), mecanismo (bandeja, aba e bielas), portas e
   dobradiças, fechaduras, eletrônica na rampa e tampo (4 × M6).

## Peças

| Código | Peça | Qtd | Material | Planificado (mm) | Dobras |
| --- | --- | --- | --- | --- | --- |
${all.unique.map(({ part, flat }) => `| ${part.file} | ${part.name} | ${part.qtyNote} | ${MATERIALS[part.mat].label} ${br(part.t, 1)} mm | ${br(flat.width, 1)} × ${br(flat.height, 1)} | ${flat.bends.length} |`).join('\n')}
`;
}

// Todos os arquivos do pacote: [{ path, text }]
export function buildPackage() {
  const all = { cylinder: modelData('cylinder'), solenoid: modelData('solenoid'), drawer: modelData('drawer') };
  const files = [];
  const seen = new Map();
  for (const key of ['drawer', 'solenoid', 'cylinder']) {
    for (const e of all[key].entries) {
      if (!seen.has(e.part.file)) seen.set(e.part.file, { ...e, models: [] });
      seen.get(e.part.file).models.push(MODELS[key].code);
    }
  }
  all.unique = [...seen.values()].sort((a, b) => a.part.file.localeCompare(b.part.file));
  for (const u of all.unique) {
    u.part.qtyNote = String(u.part.qty);
    const models = u.models.sort().join(' ');
    files.push({ path: `dxf/${u.part.file}.dxf`, text: partDxf(u.part, u.flat) });
    files.push({ path: `desenhos/${u.part.file}.svg`, text: drawingSvg(u.part, u.flat, { models }) });
  }
  for (const key of ['cylinder', 'solenoid', 'drawer']) {
    files.push({ path: `lista-de-materiais-${MODELS[key].code}.csv`, text: bomCsv(all[key]) });
  }
  for (const n of all.drawer.nests) {
    n.sheets.forEach((sh, i) => {
      const items = sh.items.map((it) => {
        const lp = labelPoint(it.flat);
        return { flat: it.flat, x: it.x, y: it.y, rot: it.rot, label: it.part.file, labelAt: it.rot ? [it.flat.height - lp[1], lp[0]] : lp };
      });
      const doc = dxfDocument(items);
      files.push({ path: `aninhamento/chapa-${fmt(n.t, 1).replace('.', ',')}mm-${n.mat}-${i + 1}.dxf`, text: doc });
    });
  }
  all.bd20 = bendDeduction(2, 2, 90);
  files.push({ path: 'LEIA-ME.md', text: readme(all) });
  return { files, all };
}
