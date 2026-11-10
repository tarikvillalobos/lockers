// Aninhamento simples (prateleiras) das planificações em chapas padrão, por espessura.
// Serve para estimar o consumo de chapa, gerar o DXF de aninhamento e desenhar o corte na fábrica 3D.
export const SHEET = { w: 3000, h: 1500, margin: 10, gap: 8 };

// pieces: [{ part, flat }], já multiplicadas pela quantidade. Retorna [{ t, mat, sheets: [{ items, used }] }]
export function nestParts(entries, sheet = SHEET) {
  const byMat = new Map();
  for (const e of entries) {
    const key = e.part.mat;
    if (!byMat.has(key)) byMat.set(key, []);
    for (let i = 0; i < e.part.qty; i++) byMat.get(key).push(e);
  }
  const result = [];
  for (const [mat, list] of byMat) {
    // maiores primeiro; deita a peça para a prateleira ficar o mais baixa possível
    const items = list
      .map((e) => {
        const rot = e.flat.height > e.flat.width && e.flat.height <= sheet.w - 2 * sheet.margin;
        return { e, rot, w: rot ? e.flat.height : e.flat.width, h: rot ? e.flat.width : e.flat.height };
      })
      .sort((a, b) => b.h - a.h || b.w - a.w);
    const sheets = [];
    const newSheet = () => (sheets.push({ items: [], shelves: [], area: 0 }), sheets[sheets.length - 1]);
    for (const it of items) {
      let placed = false;
      for (const sh of sheets.length ? sheets : [newSheet()]) {
        // tenta prateleiras existentes
        for (const s of sh.shelves) {
          if (it.h <= s.h + 1e-6 && s.x + it.w <= sheet.w - sheet.margin + 1e-6) {
            sh.items.push({ part: it.e.part, flat: it.e.flat, rot: it.rot, x: s.x, y: s.y, w: it.w, h: it.h });
            s.x += it.w + sheet.gap;
            placed = true;
            break;
          }
        }
        if (placed) break;
        const y = sh.shelves.length ? sh.shelves[sh.shelves.length - 1].y + sh.shelves[sh.shelves.length - 1].h + sheet.gap : sheet.margin;
        if (y + it.h <= sheet.h - sheet.margin + 1e-6) {
          sh.shelves.push({ y, h: it.h, x: sheet.margin + it.w + sheet.gap });
          sh.items.push({ part: it.e.part, flat: it.e.flat, rot: it.rot, x: sheet.margin, y, w: it.w, h: it.h });
          placed = true;
          break;
        }
      }
      if (!placed) {
        const sh = newSheet();
        sh.shelves.push({ y: sheet.margin, h: it.h, x: sheet.margin + it.w + sheet.gap });
        sh.items.push({ part: it.e.part, flat: it.e.flat, rot: it.rot, x: sheet.margin, y: sheet.margin, w: it.w, h: it.h });
      }
    }
    for (const sh of sheets) {
      sh.area = sh.items.reduce((a, i) => a + i.flat.area, 0);
      sh.used = sh.area / (sheet.w * sheet.h);
      delete sh.shelves;
    }
    result.push({ mat, t: list[0].part.t, sheets });
  }
  return result;
}

// Contornos de um item aninhado, já na posição da chapa: [[x, y], ...] por anel
export function nestedRings(item) {
  const { flat, rot, x, y } = item;
  const R = rot ? ([px, py]) => [flat.height - py + x, px + y] : ([px, py]) => [px + x, py + y];
  const rings = [...flat.outer, ...flat.inner].map((r) => r.map(R));
  for (const c of flat.circles) {
    const [cx, cy] = R(c.c);
    const pts = [];
    for (let i = 0; i < 20; i++) pts.push([cx + (c.d / 2) * Math.cos((i / 20) * Math.PI * 2), cy + (c.d / 2) * Math.sin((i / 20) * Math.PI * 2)]);
    rings.push(pts);
  }
  return rings;
}
