// Exporta a planificação em DXF R12 (ASCII), em milímetros, 1:1. Camadas:
//   CORTE       contornos e furos (laser)
//   DOBRA_CIMA  linhas de dobra para cima (lado da gravação)
//   DOBRA_BAIXO linhas de dobra para baixo
//   GRAVACAO    código da peça (marcação a laser, baixa potência)
import { fmt } from './sheetmetal.js';

const LAYERS = [
  ['CORTE', 7, 'CONTINUOUS'],
  ['DOBRA_CIMA', 5, 'DASHED'],
  ['DOBRA_BAIXO', 1, 'DASHED'],
  ['GRAVACAO', 3, 'CONTINUOUS'],
];

const n = (v) => (Math.abs(v) < 1e-9 ? '0.0' : v.toFixed(4));

function header() {
  const o = ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '9', '$INSUNITS', '70', '4', '9', '$MEASUREMENT', '70', '1', '0', 'ENDSEC'];
  o.push('0', 'SECTION', '2', 'TABLES');
  o.push('0', 'TABLE', '2', 'LTYPE', '70', '2');
  o.push('0', 'LTYPE', '2', 'CONTINUOUS', '70', '0', '3', 'Solid line', '72', '65', '73', '0', '40', '0.0');
  o.push('0', 'LTYPE', '2', 'DASHED', '70', '0', '3', 'Dashed __ __ __', '72', '65', '73', '2', '40', '9.0', '49', '6.0', '49', '-3.0');
  o.push('0', 'ENDTAB');
  o.push('0', 'TABLE', '2', 'LAYER', '70', String(LAYERS.length));
  for (const [name, color, lt] of LAYERS) o.push('0', 'LAYER', '2', name, '70', '0', '62', String(color), '6', lt);
  o.push('0', 'ENDTAB', '0', 'ENDSEC');
  return o;
}

function polyline(o, layer, ring, dx, dy) {
  o.push('0', 'POLYLINE', '8', layer, '66', '1', '70', '1');
  for (const [x, y] of ring) o.push('0', 'VERTEX', '8', layer, '10', n(x + dx), '20', n(y + dy));
  o.push('0', 'SEQEND', '8', layer);
}

// items: [{ flat, label, x, y, rot }] — rot = true gira 90° (para o aninhamento)
export function dxfDocument(items) {
  const o = header();
  o.push('0', 'SECTION', '2', 'ENTITIES');
  for (const it of items) {
    const { flat } = it;
    const dx = it.x ?? 0,
      dy = it.y ?? 0;
    const R = it.rot ? ([x, y]) => [flat.height - y, x] : (p) => p;
    for (const ring of [...flat.outer, ...flat.inner]) polyline(o, 'CORTE', ring.map(R), dx, dy);
    for (const c of flat.circles) {
      const [x, y] = R(c.c);
      o.push('0', 'CIRCLE', '8', 'CORTE', '10', n(x + dx), '20', n(y + dy), '40', n(c.d / 2));
    }
    for (const b of flat.bends) {
      const [x0, y0] = R(b.p0),
        [x1, y1] = R(b.p1);
      const layer = b.dir === 'up' ? 'DOBRA_CIMA' : 'DOBRA_BAIXO';
      o.push('0', 'LINE', '8', layer, '6', 'DASHED', '10', n(x0 + dx), '20', n(y0 + dy), '11', n(x1 + dx), '21', n(y1 + dy));
    }
    if (it.label) {
      const [cx, cy] = it.labelAt ?? [(it.rot ? flat.height : flat.width) / 2, (it.rot ? flat.width : flat.height) / 2];
      const hgt = Math.max(3, Math.min(8, Math.min(flat.width, flat.height) / 6));
      o.push('0', 'TEXT', '8', 'GRAVACAO', '10', n(cx + dx - it.label.length * hgt * 0.35), '20', n(cy + dy - hgt / 2), '40', n(hgt), '1', it.label);
    }
  }
  o.push('0', 'ENDSEC', '0', 'EOF');
  return o.join('\r\n') + '\r\n';
}

export const partDxf = (part, flat) => dxfDocument([{ flat, label: part.file, labelAt: labelPoint(flat) }]);

// Ponto para a gravação: centro da caixa, a menos que caia num furo
export function labelPoint(flat) {
  const c = [flat.width / 2, flat.height / 2];
  for (const k of flat.circles) if (Math.hypot(k.c[0] - c[0], k.c[1] - c[1]) < k.d / 2 + 14) return [c[0], c[1] + k.d / 2 + 18];
  return c;
}

export const bendNote = (b) => `${b.dir === 'up' ? 'CIMA' : 'BAIXO'} ${fmt(b.angle)}° R${fmt(b.r)}`;
