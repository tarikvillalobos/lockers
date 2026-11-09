// Medidas do locker residencial (mm). Origem: centro da base no chão.
// Eixos: X = largura (esq → dir, visto de frente), Y = altura, Z = profundidade (+Z = frente).
// Fonte: desenhos SolidWorks (410 × 380 × 1020 mm) + vistas laterais do mecanismo.

// Layout inspirado no Milkcan Hamilton (de cima para baixo, na frente):
//   tampo → fenda de cartas → painel "Cartas" → rebaixo de pegada (3 batentes)
//   → porta de encomendas ripada (abre para baixo, vira prateleira) → frente ripada.
// Atrás: porta de acesso de altura inteira (cartas na prateleira de cima + encomendas).
const HOPPER_Y = 638; // quina inferior-frontal da porta de encomendas
const HOPPER_FACE_H = 220;

export const SPEC = {
  W: 410,
  D: 380,
  H: 1020,
  sheet: 2, // espessura visual da chapa

  cap: { h: 20, overhang: 2, radius: 3 }, // tampo e base
  stile: { w: 16, ret: 16 }, // montantes frontais (dobra da lateral) + retorno interno

  door: {
    y0: 24,
    h: 490,
    w: 368,
    depth: 20, // retorno da chapa da porta
    pivotX: 186, // dobradiça no lado direito (vista frontal)
    maxAngle: 105,
    lock: { x: -332, y: 348 }, // fechadura tambor (coordenadas locais da porta)
    slatH: 61, // ripas horizontais na frente
  },

  // Porta traseira de acesso: altura inteira (cartas + encomendas)
  backDoor: { y0: 24, h: 962, lockY: 860 },

  lowerRail: { y0: 517, y1: HOPPER_Y - 6 },
  upperRail: { y0: HOPPER_Y + HOPPER_FACE_H + 6, y1: HOPPER_Y + HOPPER_FACE_H + 14 }, // 3 batentes
  niche: { y1: 924, backZ: 130, ceilBackY: 905 }, // rebaixo de pegada (teto inclinado vira calha das cartas)
  lettersPanel: { y0: 924, y1: 984 },
  slot: { y0: 984, y1: 1000 }, // fenda de cartas logo abaixo do tampo
  lettersShelf: { z0: -168, z1: 132 }, // prateleira de cartas = teto da câmara de encomendas
  topFlap: { len: 110, down: 40 }, // aba interna superior (desce quando a porta fecha)

  // Porta de depósito (basculante): dobradiça embaixo, abre para fora até ficar na
  // horizontal (vira prateleira para apoiar a encomenda).
  hopper: {
    cornerY: HOPPER_Y,
    faceH: HOPPER_FACE_H,
    faceW: 372,
    pivot: { y: 4, u: 4 }, // eixo da dobradiça relativo à quina (u = para trás)
    maxAngle: 90,
    crank: { y: -60, z: -10, x: 194 }, // manivela no eixo da porta (aciona o amortecedor)
  },

  // Bandeja interna (mecanismo tipo Milkcan): ocupa a profundidade toda logo abaixo da
  // boca. Porta aberta → bandeja horizontal, separando a parte de cima (acessível) do
  // compartimento. Porta fechando → nos últimos `sealBy` graus a bandeja inclina para
  // trás (`tilt`) e a encomenda escorrega e cai. Assim ela já está vedando antes de a
  // porta abrir o suficiente para passar a mão.
  tray: {
    pivotZ: 168, // borda da frente (eixo), atrás dos retornos dos montantes
    topY: HOPPER_Y - 6, // topo da bandeja = fundo da boca
    length: 330, // até z = -162
    halfW: 190, // fresta lateral de 13 mm até a parede (por onde passa o amortecedor)
    tilt: 30, // inclinação com a porta fechada (graus)
    sealBy: 10, // graus de abertura da porta em que a bandeja já está horizontal
    cheek: { x: 188, pts: [[2, 0], [2, 120], [90, 0]], pin: [12, 100] }, // laterais (u, v)
    rearStop: 20, // batente na porta traseira que cobre a ponta da bandeja
  },

  strut: { x: 194, r: 4.5, tube: 70, rod: 80 }, // amortecedor telescópico manivela → bandeja

  // Área útil do compartimento inferior
  // z limitado pelos retornos/reforços das portas frontal e traseira
  bay: { x0: -199, x1: 199, z0: -166, z1: 150, floor: 22, maxTop: 420 },
};

export const DEG = Math.PI / 180;
