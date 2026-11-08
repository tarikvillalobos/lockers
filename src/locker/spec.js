// Medidas do locker residencial (mm). Origem: centro da base no chão.
// Eixos: X = largura (esq → dir, visto de frente), Y = altura, Z = profundidade (+Z = frente).
// Fonte: desenhos SolidWorks (410 × 380 × 1020 mm) + vistas laterais do mecanismo.

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

  lowerRail: { y0: 517, y1: 566 },
  upperRail: { y0: 878, y1: 926 },
  header: { y0: 926, y1: 1000 },

  // Basculante (gaveta de depósito). Quina inferior-frontal da face em y=572, z=190.
  hopper: {
    cornerY: 572,
    faceH: 300,
    faceW: 372,
    sideX: 182, // face interna das laterais triangulares
    pivot: { y: 4, u: 4 }, // eixo da dobradiça relativo à quina (u = para trás)
    pin: { u: 128, v: 20 }, // pino da biela no triângulo lateral
    maxAngle: 75,
    // contorno da lateral triangular em (u = para trás, v = para cima)
    profile: [
      [0, 0],
      [0, 300],
      [140, 52],
      // curva arredondada até a base
      ['q', 160, 18, 128, 0],
    ],
    lip: { from: [0, 25], to: [58, 0] }, // aba-batente interna (inclinada p/ trás)
  },

  // Defletor anti-furto pendurado no fundo, acionado pela biela.
  baffle: {
    pivot: { u: 362, v: 119 }, // relativo à quina do basculante
    length: 262,
    top: 10,
    linkPoint: { dv: -213, du: -26 }, // ponto da biela em relação ao eixo (fechado)
  },

  link: { x: 189, t: 3, w: 16 },

  // Área útil do compartimento inferior
  bay: { x0: -199, x1: 199, z0: -184, z1: 150, floor: 22, maxTop: 420 },
};

export const DEG = Math.PI / 180;
