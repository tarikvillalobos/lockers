// Medidas do locker residencial (mm). Origem: centro da base no chão.
// Eixos: X = largura (esq → dir, visto de frente), Y = altura, Z = profundidade (+Z = frente).
// Fonte: desenhos SolidWorks (410 × 380 × 1020 mm) + vistas laterais do mecanismo.

// Layout inspirado no Milkcan Hamilton (de cima para baixo, na frente):
//   tampo → módulo eletrônico (5 cm) → 3 batentes → porta de encomendas ripada
//   (abre para baixo, vira prateleira) → frente ripada → porta ripada de baixo.
// Atrás: porta ripada igual à de baixo da frente (espelhada) e, em cima, a tampa com chave
// do compartimento eletrônico.
const HOPPER_Y = 716; // quina inferior-frontal da porta de encomendas (logo abaixo do módulo eletrônico)
const HOPPER_FACE_H = 220;
const DY = HOPPER_Y - 638; // deslocamento do mecanismo em relação ao projeto anterior (cartas ocupavam o topo)

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
    slatH: 61, // ripas horizontais na frente (fachada e basculante)
    // Visor fumê (estilo smartlocker): a mesma porta serve para todas as posições e modelos. Abertura recortada
    // na chapa, acrílico fumê de 4 mm colado por trás (fita estrutural) e gaxeta de borracha na borda.
    // A borda do lado da fechadura é mais larga para abrigar a fechadura de tambor do Armário 1.
    window: { border: 36, borderLock: 56, gasket: 5, pane: { t: 4, overlap: 6 } },
  },

  // Porta traseira de acesso: igual à frontal inferior (mesma altura, ripas e fechadura)
  backDoor: { y0: 24, h: 490, lockY: 348 },

  lowerRail: { y0: 517, y1: HOPPER_Y - 6 },
  upperRail: { y0: HOPPER_Y + HOPPER_FACE_H + 6, y1: HOPPER_Y + HOPPER_FACE_H + 14 }, // 3 batentes

  // Módulo eletrônico no topo: 50 mm de altura na frente (y 950–1000) e 100 mm no fundo (y 900–1000).
  // O piso (= teto da boca) é uma rampa contínua, da frente (z = ceil.z1, y = y0) até a parede de trás
  // (z = ceil.z0, y = rear.y0). Acesso por trás, por uma tampa de 100 mm com fechadura de chave (mesmo
  // vão das portas: 368 mm). As placas da bandeja têm a quina da frente arredondada (raio ~112 mm) e
  // passam a ≥ 4 mm da rampa de 0° a 90°.
  elec: { y0: 950, y1: 1000, rear: { y0: 900 }, ceil: { z0: -168, z1: 186 } },

  // Porta de depósito (basculante): dobradiça embaixo, abre para fora até ficar na
  // horizontal (vira prateleira para apoiar a encomenda).
  hopper: {
    cornerY: HOPPER_Y,
    faceH: HOPPER_FACE_H,
    faceW: 372,
    pivot: { y: 4, u: 4 }, // eixo da dobradiça relativo à quina (u = para trás)
    maxAngle: 90,
    lockY: 211.5, // altura do U do solenoide da gaveta (Armário 3) acima da dobradiça: topo da porta, no meio
    pin: { dy: 74.714, z: -3 }, // pino da biela na porta (a 75 mm da dobradiça, no referencial da dobradiça)
  },

  // Bandeja giratória (mecanismo tipo Milkcan): duas placas laterais + piso formam um "U" que
  // gira num eixo fixo no meio da boca. Porta aberta (90°) → placas em pé e piso horizontal,
  // contínuo com a porta. Ao fechar, uma biela (pino na porta → pino da placa) gira o conjunto
  // 90°: o piso vira parede vertical logo atrás da porta e a encomenda escorrega e cai.
  // Os pinos foram resolvidos numericamente para a placa ir de 0° a 90° quase linear.
  tray: {
    pivot: { z: 60, y: 735 + DY }, // eixo fixo (z, y)
    plate: [[123, -95], [118, -30], [112, 0], [105, 35], [92, 62], [62, 92], [-140, 90], [-210, 40], [-210, -95]], // contorno da placa (z, y) rel. ao eixo
    front: 123, // borda da frente do piso (rel. ao eixo): com a bandeja horizontal fica rente à dobradiça da porta (z = 183)
    back: -210, // borda de trás do piso
    floorY: -93, // face de cima do piso (rel. ao eixo)
    halfW: 178, // tudo que gira fica dentro do vão livre (±186) entre os montantes
    length: 333, // frente → fundo do piso
    topY: 642 + DY, // face de cima do piso com a bandeja na horizontal (= batente traseiro)
    closeAngle: 90, // giro com a porta fechada (graus)
    pin: [70.165, 33.198], // pino da biela da porta, no referencial da placa (z, y)
    cheek: { x: 178 }, // face interna das placas (placa: 178–180)
    rearStop: 16, // batente na porta traseira que cobre a ponta do piso
  },

  // Aba superior (viseira): articulada logo abaixo do teto da boca e acionada por uma
  // segunda biela que sai de um pino da placa. Com a porta aberta fica deitada (por baixo do batente
  // superior); ao fechar desce até a vertical. Comprimento 190 mm: a ponta passa a 16 mm do piso da
  // bandeja (acima de ~195 mm ela atravessaria o piso) e vai de perto da tampa de baixo.
  flap: { z: 23.49, y: 844 + DY, len: 190, g: 71.372, pin: [-2.63, 70.68] },

  // Bielas chatas (largura, espessura, sobra nas pontas; x do centro de cada uma)
  arm: { w: 9, t: 3, over: 7, x1: 182.5, x2: 175.5 }, // biela 1 por fora da placa, biela 2 por dentro

  // Área útil do compartimento inferior
  // z limitado pelos retornos/reforços das portas frontal e traseira
  bay: { x0: -199, x1: 199, z0: -166, z1: 150, floor: 22, maxTop: 420 + DY },
};

export const DEG = Math.PI / 180;
