// Medidas do locker residencial (mm). Origem: centro da base no chão.
// Eixos: X = largura (esq → dir, visto de frente), Y = altura, Z = profundidade (+Z = frente).
// Fonte: desenhos SolidWorks (410 × 380 × 1020 mm) + vistas laterais do mecanismo.

// Basculante: altura da face (antes 300 mm) e posição. As travessas inferior e
// superior acompanham para fechar a frente logo abaixo e acima dele; o mecanismo
// (pino, biela, defletor) é relativo à quina e sobe junto.
const HOPPER_Y = 672; // quina inferior-frontal da face (antes 572)
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

  // Basculante (gaveta de depósito). Quina inferior-frontal da face em y=HOPPER_Y, z=190.
  hopper: {
    cornerY: HOPPER_Y,
    faceH: HOPPER_FACE_H,
    faceW: 372,
    sideX: 182, // face interna das laterais triangulares
    pivot: { y: 4, u: 4 }, // eixo da dobradiça relativo à quina (u = para trás)
    maxAngle: 75,
    // Chapa de fundo do basculante (gira junto), dobrada: 1º trecho = aba original
    // (~23°), depois dobra para baixo a 60° até quase o raio da cúpula (232 mm do eixo).
    // Pontos em (u = para trás, v = para cima).
    floor: [
      [0, 25],
      [60, 0],
      [158, -170],
    ],
    // contorno da lateral em (u = para trás, v = para cima): triângulo + "bochecha"
    // que desce cobrindo a lateral da chapa de fundo (sem fresta para a mão passar)
    profile: [
      [0, 0],
      [0, HOPPER_FACE_H],
      [140, 52],
      // curva arredondada até a base
      ['q', 160, 18, 128, 0],
      [163, -165],
      [158, -170],
      [60, -1],
    ],
  },

  // Defletor anti-furto pendurado no fundo, acionado pela biela.
  // Eixo 100 mm mais alto que no CAD e biela mais perto do eixo (giro de ~49°):
  // aberto, o pé do defletor encosta a ~15 mm da chapa de fundo do basculante.
  // Anti-furto: cúpula fixa concêntrica ao eixo do basculante. A ponta da chapa de
  // fundo da gaveta desliza rente a ela (folga ~8 mm) em QUALQUER ângulo de abertura,
  // então a gaveta fica isolada do compartimento mesmo entreaberta. Ângulos (graus)
  // medidos a partir da vertical, para trás. Chapas laterais fixas fecham as laterais.
  hood: { radius: 240, from: 6, to: 138.5, guardX: 186, guardFrontZ: 171 },

  // Área útil do compartimento inferior
  // z limitado pelos retornos/reforços das portas frontal e traseira
  bay: { x0: -199, x1: 199, z0: -166, z1: 150, floor: 22, maxTop: 420 },
};

export const DEG = Math.PI / 180;
