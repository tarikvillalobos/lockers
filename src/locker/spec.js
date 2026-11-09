// Medidas do locker residencial (mm). Origem: centro da base no chão.
// Eixos: X = largura (esq → dir, visto de frente), Y = altura, Z = profundidade (+Z = frente).
// Fonte: desenhos SolidWorks (410 × 380 × 1020 mm) + vistas laterais do mecanismo.

// Layout inspirado no Milkcan Hamilton (de cima para baixo, na frente):
//   tampo → fenda de cartas → painel "Cartas" → rebaixo de pegada (3 batentes)
//   → porta de encomendas ripada (abre para baixo, vira prateleira) → frente ripada.
// Atrás: porta ripada igual à de baixo da frente (mesmo vão, espelhada).
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

  // Porta traseira de acesso: igual à frontal inferior (mesma altura, ripas e fechadura)
  backDoor: { y0: 24, h: 490, lockY: 348 },

  lowerRail: { y0: 517, y1: HOPPER_Y - 6 },
  upperRail: { y0: HOPPER_Y + HOPPER_FACE_H + 6, y1: HOPPER_Y + HOPPER_FACE_H + 14 }, // 3 batentes
  niche: { y1: 924, backZ: 130, ceilBackY: 905 }, // rebaixo de pegada (teto inclinado vira calha das cartas)
  lettersPanel: { y0: 924, y1: 984 },
  slot: { y0: 984, y1: 1000 }, // fenda de cartas logo abaixo do tampo
  lettersShelf: { z0: -168, z1: 130 }, // prateleira de cartas = teto da câmara de encomendas

  // Porta de depósito (basculante): dobradiça embaixo, abre para fora até ficar na
  // horizontal (vira prateleira para apoiar a encomenda).
  hopper: {
    cornerY: HOPPER_Y,
    faceH: HOPPER_FACE_H,
    faceW: 372,
    pivot: { y: 4, u: 4 }, // eixo da dobradiça relativo à quina (u = para trás)
    maxAngle: 90,
    pin: { dy: 74.714, z: -3 }, // pino da biela na porta (a 75 mm da dobradiça, no referencial da dobradiça)
  },

  // Bandeja giratória (mecanismo tipo Milkcan): duas placas laterais + piso formam um "U" que
  // gira num eixo fixo no meio da boca. Porta aberta (90°) → placas em pé e piso horizontal,
  // contínuo com a porta. Ao fechar, uma biela (pino na porta → pino da placa) gira o conjunto
  // 90°: o piso vira parede vertical logo atrás da porta e a encomenda escorrega e cai.
  // Os pinos foram resolvidos numericamente para a placa ir de 0° a 90° quase linear.
  tray: {
    pivot: { z: 60, y: 735 }, // eixo fixo (z, y)
    plate: [[85, -95], [85, 95], [-140, 95], [-210, 40], [-210, -95]], // contorno da placa (z, y) rel. ao eixo
    front: 85, // borda da frente do piso (rel. ao eixo): raio ≤ 126 mm, não sai pela frente ao girar
    back: -210, // borda de trás do piso
    floorY: -93, // face de cima do piso (rel. ao eixo)
    halfW: 178, // tudo que gira fica dentro do vão livre (±186) entre os montantes
    length: 295, // frente → fundo do piso
    topY: 642, // face de cima do piso com a bandeja na horizontal (= batente traseiro)
    closeAngle: 90, // giro com a porta fechada (graus)
    pin: [70.165, 33.198], // pino da biela da porta, no referencial da placa (z, y)
    cheek: { x: 178 }, // face interna das placas (placa: 178–180)
    rearStop: 16, // batente na porta traseira que cobre a ponta do piso
  },

  // Aba superior (viseira): articulada num suporte logo abaixo da prateleira de cartas e acionada por
  // uma segunda biela que sai de um pino da placa. Com a porta aberta fica deitada (acima das
  // encomendas); ao fechar a ponta desce e acompanha o piso da bandeja: a fresta entre os dois fica
  // ≤ ~50 mm já a 9° de giro e ≤ 25 mm de 18° a 63°; no fim, a porta quase fechada cobre a boca.
  flap: { z: -48.098, y: 838.149, len: 231.324, g: 121.534, pin: [-81.4, 89.779] },

  // Bielas chatas (largura, espessura, sobra nas pontas; x do centro de cada uma)
  arm: { w: 9, t: 3, over: 7, x1: 182.5, x2: 175.5 }, // biela 1 por fora da placa, biela 2 por dentro

  // Área útil do compartimento inferior
  // z limitado pelos retornos/reforços das portas frontal e traseira
  bay: { x0: -199, x1: 199, z0: -166, z1: 150, floor: 22, maxTop: 420 },
};

export const DEG = Math.PI / 180;
