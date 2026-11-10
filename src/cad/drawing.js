// Folha de desenho (SVG, A3 paisagem) da planificação de uma peça: contorno de corte, furos, linhas de
// dobra numeradas, cotas gerais, tabela de dobras, tabela de furos e legenda.
import { fmt, holeTable } from './sheetmetal.js';
import { MATERIALS, GROUPS } from './parts.js';

const PAGE = { w: 420, h: 297 };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function drawingSvg(part, flat, opts = {}) {
  const mat = MATERIALS[part.mat];
  const grp = GROUPS[part.group];
  const area = { x: 22, y: 20, w: 256, h: 212 }; // janela do desenho
  const s = Math.min(area.w / flat.width, area.h / flat.height, 1);
  const ox = area.x + (area.w - flat.width * s) / 2;
  const oy = area.y + (area.h - flat.height * s) / 2;
  const X = (x) => ox + x * s;
  const Y = (y) => oy + (flat.height - y) * s;
  const path = (ring) => ring.map(([x, y], i) => `${i ? 'L' : 'M'}${X(x).toFixed(2)} ${Y(y).toFixed(2)}`).join(' ') + ' Z';
  const o = [];
  const ink = '#14181d',
    up = '#1d5fd1',
    down = '#d1342f',
    dim = '#62666b';
  o.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAGE.w} ${PAGE.h}" font-family="'IBM Plex Mono', ui-monospace, Menlo, monospace" font-size="3.2" fill="${ink}">`);
  o.push(`<rect width="${PAGE.w}" height="${PAGE.h}" fill="#fff"/>`);
  o.push(`<rect x="6" y="6" width="${PAGE.w - 12}" height="${PAGE.h - 12}" fill="none" stroke="${ink}" stroke-width="0.5"/>`);

  // contorno e furos
  o.push(`<path d="${[...flat.outer, ...flat.inner].map(path).join(' ')}" fill="#eef1f5" fill-rule="evenodd" stroke="${ink}" stroke-width="0.45" stroke-linejoin="round"/>`);
  for (const c of flat.circles) {
    o.push(`<circle cx="${X(c.c[0]).toFixed(2)}" cy="${Y(c.c[1]).toFixed(2)}" r="${Math.max(0.25, (c.d / 2) * s).toFixed(2)}" fill="#fff" stroke="${ink}" stroke-width="0.35"/>`);
  }
  // linhas de dobra numeradas
  flat.bends.forEach((b, i) => {
    const col = b.dir === 'up' ? up : down;
    o.push(`<line x1="${X(b.p0[0]).toFixed(2)}" y1="${Y(b.p0[1]).toFixed(2)}" x2="${X(b.p1[0]).toFixed(2)}" y2="${Y(b.p1[1]).toFixed(2)}" stroke="${col}" stroke-width="0.3" stroke-dasharray="2.4 1.2"/>`);
    const mx = X((b.p0[0] + b.p1[0]) / 2),
      my = Y((b.p0[1] + b.p1[1]) / 2);
    o.push(`<circle cx="${mx.toFixed(2)}" cy="${my.toFixed(2)}" r="2.3" fill="#fff" stroke="${col}" stroke-width="0.3"/>`);
    o.push(`<text x="${mx.toFixed(2)}" y="${(my + 1.05).toFixed(2)}" text-anchor="middle" font-size="2.6" fill="${col}">${i + 1}</text>`);
  });

  // cotas gerais
  const bx0 = X(0),
    bx1 = X(flat.width),
    by0 = Y(0),
    by1 = Y(flat.height);
  const dimLine = (x0, y0, x1, y1, label, vertical) => {
    o.push(`<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="${dim}" stroke-width="0.25"/>`);
    const a = 1.6;
    if (vertical) {
      o.push(`<path d="M${x0 - a / 2} ${y0 - a} L${x0} ${y0} L${x0 + a / 2} ${y0 - a} M${x1 - a / 2} ${y1 + a} L${x1} ${y1} L${x1 + a / 2} ${y1 + a}" fill="none" stroke="${dim}" stroke-width="0.25"/>`);
      o.push(`<text transform="translate(${x0 - 1.6} ${(y0 + y1) / 2}) rotate(-90)" text-anchor="middle" fill="${dim}">${label}</text>`);
    } else {
      o.push(`<path d="M${x0 + a} ${y0 - a / 2} L${x0} ${y0} L${x0 + a} ${y0 + a / 2} M${x1 - a} ${y1 - a / 2} L${x1} ${y1} L${x1 - a} ${y1 + a / 2}" fill="none" stroke="${dim}" stroke-width="0.25"/>`);
      o.push(`<text x="${(x0 + x1) / 2}" y="${y0 - 1.4}" text-anchor="middle" fill="${dim}">${label}</text>`);
    }
  };
  o.push(`<path d="M${bx0} ${by0 + 1} V${by0 + 9} M${bx1} ${by0 + 1} V${by0 + 9} M${bx0 - 1} ${by0} H${bx0 - 9} M${bx0 - 1} ${by1} H${bx0 - 9}" stroke="${dim}" stroke-width="0.2"/>`);
  dimLine(bx0, by0 + 7, bx1, by0 + 7, fmt(flat.width, 2), false);
  dimLine(bx0 - 7, by0, bx0 - 7, by1, fmt(flat.height, 2), true);

  // coluna da direita: dados + tabelas
  const cx = 290;
  let y = 16;
  const row = (k, v, bold) => {
    o.push(`<text x="${cx}" y="${y}" fill="${dim}">${esc(k)}</text><text x="${cx + 44}" y="${y}"${bold ? ' font-weight="600"' : ''}>${esc(v)}</text>`);
    y += 5;
  };
  o.push(`<text x="${cx}" y="${y}" font-size="6" font-weight="700" font-family="Barlow, system-ui, sans-serif">${esc(part.file)}</text>`);
  y += 6.5;
  o.push(`<text x="${cx}" y="${y}" font-size="4.2" font-family="Barlow, system-ui, sans-serif">${esc(part.name)}</text>`);
  y += 8;
  row('Material', mat.label);
  row('Espessura', `${fmt(mat.t)} mm (${mat.gauge})`, true);
  row('Quantidade', `${part.qty} por armário`, true);
  row('Conjunto', grp.label);
  row('Acabamento', grp.finish);
  row('Planificado', `${fmt(flat.width, 2)} × ${fmt(flat.height, 2)} mm`);
  row('Massa', `${fmt(flat.mass, 2)} kg`);
  row('Corte', `${fmt(flat.cutLength / 1000, 2)} m · ${flat.pierces} furações`);
  row('Raio interno', `R${fmt(part.r)} · fator K 0,42`);
  y += 3;

  const head = (title) => {
    o.push(`<text x="${cx}" y="${y}" font-weight="600" font-size="3.4">${esc(title)}</text>`);
    y += 1.6;
    o.push(`<line x1="${cx}" y1="${y}" x2="${PAGE.w - 12}" y2="${y}" stroke="${ink}" stroke-width="0.25"/>`);
    y += 4.4;
  };
  head(`Dobras (${flat.bends.length})`);
  if (!flat.bends.length) {
    o.push(`<text x="${cx}" y="${y}" fill="${dim}">Peça plana, sem dobras.</text>`);
    y += 5;
  }
  flat.bends.slice(0, 16).forEach((b, i) => {
    const horiz = Math.abs(b.p0[1] - b.p1[1]) < Math.abs(b.p0[0] - b.p1[0]);
    const pos = horiz ? `Y ${fmt(b.p0[1], 2)}` : `X ${fmt(b.p0[0], 2)}`;
    const col = b.dir === 'up' ? up : down;
    o.push(
      `<text x="${cx}" y="${y}" fill="${col}">${String(i + 1).padStart(2, ' ')}</text>` +
        `<text x="${cx + 8}" y="${y}" fill="${col}">${b.dir === 'up' ? 'cima' : 'baixo'}</text>` +
        `<text x="${cx + 24}" y="${y}">${fmt(b.angle)}°</text>` +
        `<text x="${cx + 36}" y="${y}">L ${fmt(b.len, 1)}</text>` +
        `<text x="${cx + 62}" y="${y}">${pos}</text>`
    );
    y += 4.4;
  });
  if (flat.bends.length > 16) {
    o.push(`<text x="${cx}" y="${y}" fill="${dim}">… +${flat.bends.length - 16} dobras (ver DXF)</text>`);
    y += 4.4;
  }
  y += 3;
  const holes = holeTable(part);
  head('Furos e recortes');
  if (!holes.length) {
    o.push(`<text x="${cx}" y="${y}" fill="${dim}">Sem furos.</text>`);
    y += 5;
  }
  for (const h of holes) {
    o.push(`<text x="${cx}" y="${y}">${h.n} ×</text><text x="${cx + 12}" y="${y}">${esc(h.label)}</text>`);
    y += 4.4;
  }
  if (part.weld) {
    y += 3;
    head('Solda e montagem');
    for (const line of wrap(part.weld, 62)) {
      o.push(`<text x="${cx}" y="${y}">${esc(line)}</text>`);
      y += 4.4;
    }
  }

  // legenda
  const ly = PAGE.h - 44;
  o.push(`<line x1="22" y1="${ly + 2}" x2="34" y2="${ly + 2}" stroke="${ink}" stroke-width="0.45"/><text x="37" y="${ly + 3}">corte (camada CORTE)</text>`);
  o.push(`<line x1="92" y1="${ly + 2}" x2="104" y2="${ly + 2}" stroke="${up}" stroke-width="0.3" stroke-dasharray="2.4 1.2"/><text x="107" y="${ly + 3}" fill="${up}">dobra para cima</text>`);
  o.push(`<line x1="152" y1="${ly + 2}" x2="164" y2="${ly + 2}" stroke="${down}" stroke-width="0.3" stroke-dasharray="2.4 1.2"/><text x="167" y="${ly + 3}" fill="${down}">dobra para baixo</text>`);
  o.push(`<text x="22" y="${ly + 9}" fill="${dim}">Vista do lado da gravação. Medidas em mm. Tolerância geral ±0,3 (corte) e ±0,5 / ±1° (dobra).</text>`);
  o.push(`<text x="22" y="${ly + 14}" fill="${dim}">Desenvolvido calculado com fator K 0,42: conferir com a tabela da dobradeira antes do corte em série.</text>`);

  // carimbo
  const tb = { x: PAGE.w - 136, y: PAGE.h - 34, w: 130, h: 28 };
  o.push(`<rect x="${tb.x}" y="${tb.y}" width="${tb.w}" height="${tb.h}" fill="#fff" stroke="${ink}" stroke-width="0.4"/>`);
  o.push(`<line x1="${tb.x}" y1="${tb.y + 14}" x2="${tb.x + tb.w}" y2="${tb.y + 14}" stroke="${ink}" stroke-width="0.25"/>`);
  o.push(`<line x1="${tb.x + 78}" y1="${tb.y}" x2="${tb.x + 78}" y2="${tb.y + tb.h}" stroke="${ink}" stroke-width="0.25"/>`);
  o.push(`<text x="${tb.x + 3}" y="${tb.y + 5}" fill="${dim}" font-size="2.6">PROJETO</text><text x="${tb.x + 3}" y="${tb.y + 11}" font-size="4" font-weight="600" font-family="Barlow, system-ui, sans-serif">Locker Residencial LR-1020</text>`);
  o.push(`<text x="${tb.x + 3}" y="${tb.y + 19}" fill="${dim}" font-size="2.6">PEÇA</text><text x="${tb.x + 3}" y="${tb.y + 25}" font-size="3.6">${esc(part.name)}</text>`);
  o.push(`<text x="${tb.x + 81}" y="${tb.y + 5}" fill="${dim}" font-size="2.6">CÓDIGO</text><text x="${tb.x + 81}" y="${tb.y + 11}" font-size="4.2" font-weight="700">${esc(part.file)}</text>`);
  o.push(`<text x="${tb.x + 81}" y="${tb.y + 19}" fill="${dim}" font-size="2.6">ESCALA · REV · MODELO</text><text x="${tb.x + 81}" y="${tb.y + 25}" font-size="3.6">1:${fmt(1 / s, 1)} · ${opts.rev ?? 'A'} · ${esc(opts.models ?? part.model)}</text>`);
  o.push('</svg>');
  return o.join('\n');
}

function wrap(text, n) {
  const out = [];
  let line = '';
  for (const w of text.split(' ')) {
    if ((line + ' ' + w).trim().length > n) {
      out.push(line.trim());
      line = w;
    } else line += ' ' + w;
  }
  if (line.trim()) out.push(line.trim());
  return out;
}
