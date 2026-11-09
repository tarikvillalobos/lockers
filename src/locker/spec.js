// Medidas do locker residencial (mm). Origem: centro da base no chão.
// Eixos: X = largura (esq → dir, visto de frente), Y = altura, Z = profundidade (+Z = frente).
// Fonte: desenhos SolidWorks (410 × 380 × 1020 mm) + vistas laterais do mecanismo.

// Porta de depósito (basculante): altura da face e posição. As travessas inferior e
// superior acompanham para fechar a frente logo abaixo e acima dela.
const HOPPER_Y = 672; // quina inferior-frontal da face
const HOPPER_FACE_H = 240;

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
  },

  lowerRail: { y0: 517, y1: HOPPER_Y - 6 },
  upperRail: { y0: HOPPER_Y + HOPPER_FACE_H + 6, y1: 926 },
  header: { y0: 926, y1: 1000 },

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
    tilt: 35, // inclinação com a porta fechada (graus)
    sealBy: 10, // graus de abertura da porta em que a bandeja já está horizontal
    cheek: { x: 188, pts: [[2, 0], [2, 120], [90, 0]], pin: [12, 100] }, // laterais (u, v)
    rearStop: 36, // batente fixo no fundo que cobre a ponta da bandeja
  },

  strut: { x: 194, r: 4.5, tube: 70, rod: 80 }, // amortecedor telescópico manivela → bandeja

  // Área útil do compartimento inferior
  // z limitado pelos retornos/reforços das portas frontal e traseira
  bay: { x0: -199, x1: 199, z0: -166, z1: 150, floor: 22, maxTop: 420 },
};

export const DEG = Math.PI / 180;
