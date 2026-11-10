// Layout da fábrica (metros). X = comprimento do galpão, Z = profundidade (+Z = frente), Y = altura.
// Fluxo em U: fabricação na fileira de trás (da esquerda para a direita), pintura no laço da direita e
// montagem na fileira da frente (da direita para a esquerda), terminando na doca de expedição à esquerda.

export const TAKT = 24; // segundos de simulação por armário (1×)

export const B = { x0: -43, x1: 30, z0: -15, z1: 15, h: 9.6 };
// Corredor de caminhões (entram pelos fundos, saem pela frente): nos fundos descarrega o caminhão de
// chapas e insumos; na frente carrega o caminhão de expedição.
export const LANE = { x: -39.5, w: 5 };
export const ROW_A = -7;
export const ASM_Z = 9.2;
// Três estoques:
//  RAW   insumos e chapas, ao longo da parede dos fundos
//  FG    armários embalados (paletes), na frente à esquerda, ao lado da expedição
//  PARTS peças acabadas (portas, carcaças, bases…), na frente à direita, ao lado da montagem
export const RAW = { z: -14.15, sheet: { x: -30.6, z: -13.75 }, sheet2: { x: -26.6 }, racks: [-20.6, -13.2, -5.8], shelves: [1.6, 4.2, 6.8], cage: { x: -35.3, z: -13.9 } };
export const FG = { x0: -34.8, x1: -25.2, bays: 4, rows: { north: 11.9, mid: 6.6, south: 5.34 }, slots: [-27.06, -25.74], aisle: 9.45 };
export const PARTS = { x0: 11.6, x1: 27.6, bays: 6, z: 11.9 };

export const POS = {
  stack: { x: -30.6, z: ROW_A },
  laser: { load: -26.2, cut: -22.0, unload: -17.8, z: ROW_A },
  rail: { z: -4.9, x0: -19.6, x1: -11.0 },
  brake: { x: -12.3, z: -7.75, die: -7.15, h: 0.95 },
  conv1: { x0: -9.9, x1: -6.9, z: -6.2, h: 0.8 },
  pick: { x: -6.05, z: -6.2 },
  fixture: { x: -3.9, z: -6.7, h: 0.5 },
  r3: { x: -5.0, z: -4.4 },
  r4: { x: -3.4, z: -9.0 },
  r5: { x: -5.9, z: -8.4 },
  r6: { x: -1.6, z: -6.2 },
  paint: { x0: 0.2, x1: 26, z0: -7, z1: 4.6, r: 2.2, rail: 4.3, hook: 2.75 },
  asm: { x: [4.6, 1.0, -2.6, -6.2, -9.8, -13.4, -17.0], z: ASM_Z, h: 0.42 },
  pallet: { x: -20.4, z: 9.6 },
  r13: { x: -18.7, z: 11.3 },
  truckIn: { x: LANE.x, z: -8.5 }, // caminhão de chapas e insumos (metade de trás do corredor)
  truckOut: { x: LANE.x, z: 8.6 }, // caminhão de expedição (metade da frente)
  table: { x: -15.0, z: ROW_A, h: 0.86, zSort: -6.45, zPick: -7.55 }, // mesa de recortes
  weld2: { x: -10.2, z: -2.2, h: 0.8 }, // célula de solda dos conjuntos
};

// Trilho aéreo da pintura: retângulo de cantos arredondados, percorrido no sentido
// fileira de trás (→ +x), lado direito (→ +z), fileira da frente (→ −x), lado esquerdo (→ −z).
export function paintPath() {
  const { x0, x1, z0, z1, r } = POS.paint;
  const segs = [];
  const line = (a, b) => segs.push({ type: 'line', a, b, len: Math.hypot(b[0] - a[0], b[1] - a[1]) });
  const arc = (c, a0) => segs.push({ type: 'arc', c, a0, len: (Math.PI / 2) * r });
  line([x0 + r, z0], [x1 - r, z0]);
  arc([x1 - r, z0 + r], -Math.PI / 2); // SE
  line([x1, z0 + r], [x1, z1 - r]);
  arc([x1 - r, z1 - r], 0); // NE
  line([x1 - r, z1], [x0 + r, z1]);
  arc([x0 + r, z1 - r], Math.PI / 2); // NO
  line([x0, z1 - r], [x0, z0 + r]);
  arc([x0 + r, z0 + r], Math.PI); // SO
  let L = 0;
  for (const s of segs) {
    s.s0 = L;
    L += s.len;
  }
  // ponto e rumo (ângulo em torno de Y do vetor tangente) na distância s
  const at = (s) => {
    s = ((s % L) + L) % L;
    const sg = segs.find((q) => s < q.s0 + q.len) ?? segs[segs.length - 1];
    const t = (s - sg.s0) / sg.len;
    if (sg.type === 'line') {
      const dx = sg.b[0] - sg.a[0],
        dz = sg.b[1] - sg.a[1];
      return { x: sg.a[0] + dx * t, z: sg.a[1] + dz * t, yaw: Math.atan2(dx, dz) };
    }
    // arcos no sentido +ângulo no plano (x, z): x = cx + r cos a, z = cz + r sin a
    const a = sg.a0 + (Math.PI / 2) * t;
    return { x: sg.c[0] + r * Math.cos(a), z: sg.c[1] + r * Math.sin(a), yaw: Math.atan2(-Math.sin(a), Math.cos(a)) };
  };
  // distância s dos pontos notáveis
  const sOf = {
    legA: (x) => x - (x0 + r),
    legB: (x) => segs[4].s0 + (x1 - r - x),
    west: (z) => segs[6].s0 + (z1 - r - z),
    east: (z) => segs[2].s0 + (z - (z0 + r)),
  };
  return { L, at, sOf, segs };
}

// Estações do passeio: nome, o que acontece, números de processo e câmera
export const STATIONS = [
  {
    id: 'almoxarifado',
    n: '01',
    name: 'Recebimento e insumos',
    text: 'O estoque de insumos fica ao longo da parede dos fundos: chapas por espessura, tinta em pó, arame de solda, gases, químicos, embalagens, componentes e itens de reposição. A empilhadeira guarda o fardo que chega e é do estoque que sai a chapa para o laser.',
    specs: [['Chapas', 'estante cantilever · 4 espessuras'], ['Insumos', 'tinta, arame, gases, químicos'], ['Itens', 'componentes e reposição']],
    cam: { p: [-23.2, 6.0, -8.6], t: [-31.0, 1.4, -13.6] },
  },
  {
    id: 'laser',
    n: '02',
    name: 'Corte a laser',
    text: 'Laser de fibra corta as 43 peças do armário seguindo o aninhamento gerado do CAD. A mesa troca sozinha e o robô sobre trilho retira os recortes.',
    specs: [['Fonte', 'fibra 6 kW'], ['Corte por armário', '48 m'], ['Aproveitamento', '≈ 51 %']],
    cam: { p: [-24.4, 3.3, -2.6], t: [-21.2, 0.9, -7.0] },
  },
  {
    id: 'dobra',
    n: '03',
    name: 'Dobra CNC',
    text: 'Um robô separa os recortes do laser na mesa e o robô da dobradeira dobra todas as peças do armário em sequência: laterais, fundo, travessas, base, tampo, portas, ripas, basculante e bandeja. As peças com abas para baixo são viradas antes da dobra.',
    specs: [['Dobradeira', '110 t · 3 m'], ['Peças dobradas', '17 tipos · 39 por armário'], ['Dobras', '90 / armário']],
    cam: { p: [-15.6, 2.9, -3.6], t: [-13.0, 1.0, -7.1] },
  },
  {
    id: 'solda',
    n: '04',
    name: 'Solda',
    text: 'Duas células. Na da carcaça, um robô monta as laterais, o fundo, as travessas e a rampa no gabarito e dois robôs MIG soldam. Na dos conjuntos, são soldados em sequência as portas com as ripas, a tampa, a base, o tampo, o basculante e a bandeja.',
    specs: [['Processo', 'MIG robotizado'], ['Carcaça', '7 peças + 3 ripas'], ['Conjuntos', '7 em sequência']],
    cam: { p: [-9.6, 4.6, 2.4], t: [-6.6, 1.0, -5.0] },
  },
  {
    id: 'pintura',
    n: '05',
    name: 'Pintura eletrostática',
    text: 'No trilho aéreo as peças passam pela lavagem em 3 estágios, secam na estufa de secagem, recebem o pó na cabine (as pistolas só disparam com peça na frente), curam a 200 °C e esfriam antes da medição de camada.',
    specs: [['Pré-tratamento', 'desengraxe · fosfato · enxágue'], ['Pó', 'poliéster RAL 7016 · 70 µm'], ['Cura', '200 °C · 10 min']],
    cam: { p: [9.4, 5.2, 0.6], t: [15.6, 2.0, -7.0] },
  },
  {
    id: 'montagem',
    n: '06',
    name: 'Montagem',
    text: 'Na linha de montagem a carcaça pintada recebe a base, o mecanismo do basculante, as portas, a eletrônica e o tampo, um posto por etapa.',
    specs: [['Postos', '4 de montagem'], ['Fixação', 'M6 com torque controlado'], ['Robôs', '6']],
    cam: { p: [5.2, 4.6, 15.2], t: [-1.0, 1.0, 9.0] },
  },
  {
    id: 'teste',
    n: '07',
    name: 'Teste funcional',
    text: 'Cada armário é testado: o basculante abre e fecha movendo a bandeja anti-furto, a fechadura é acionada e a visão confere o acabamento.',
    specs: [['Ciclos', 'basculante + porta'], ['Inspeção', 'visão 3D'], ['Resultado', '100 % testado']],
    cam: { p: [-8.2, 2.1, 12.6], t: [-9.9, 1.0, 9.2] },
  },
  {
    id: 'embalagem',
    n: '08',
    name: 'Embalagem e paletização',
    text: 'A caixa de papelão desce sobre o armário, recebe as cintas e a etiqueta. O robô paletiza 4 caixas e o palete é envolvido com filme.',
    specs: [['Caixa', '470 × 440 × 1100 mm'], ['Palete', '4 armários'], ['Filme', 'stretch automático']],
    cam: { p: [-11.4, 3.4, 13.8], t: [-16.0, 1.0, 9.4] },
  },
  {
    id: 'expedicao',
    n: '09',
    name: 'Estoque e expedição',
    text: 'Os paletes envolvidos vão para o estoque de armários embalados, ao lado da paletização. De lá a empilhadeira carrega o caminhão; com a carga completa, o portão abre e ele sai da fábrica.',
    specs: [['Estoque', 'porta-paletes · 3 níveis'], ['Carga', '8 armários / viagem'], ['Saída', 'portão frontal']],
    cam: { p: [-25.5, 8.0, 22.0], t: [-33.0, 1.4, 8.6] },
  },
];

export const OVERVIEW = { p: [-6, 36, 54], t: [-6, 0, 0] };
