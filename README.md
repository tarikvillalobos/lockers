# Locker Residencial 3D

Modelo 3D funcional, feito em [three.js](https://threejs.org), do locker residencial de encomendas
**LR-1020** (410 × 380 × 1020 mm), baseado nos desenhos do SolidWorks.

## Rodar

Requer Node.js 20.19+ ou 22.12+ (exigência do Vite 8).

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # gera dist/ estático
```

## O que funciona

| Peça | Comportamento |
| --- | --- |
| **Fachada (base: Milkcan Hamilton)** | De cima para baixo: módulo eletrônico liso de 5 cm, 3 batentes, porta de encomendas ripada, frente ripada e porta de baixo ripada. Atrás, a mesma porta ripada da frente (espelhada) e, em cima, uma tampa de 368 × 50 mm com fechadura de chave que dá acesso ao módulo eletrônico. |
| **Módulo eletrônico** | Compartimento de 50 mm logo abaixo do tampo, separado da boca por uma chapa. Só abre por trás, pela tampa com chave (`V` tranca/destranca, `N` abre). Não dá acesso às encomendas. |
| **Porta de depósito** (basculante) | Dobradiça embaixo; abre até 90° e vira prateleira. Clique ou arraste. |
| **Bandeja giratória anti-furto** | Duas placas laterais + piso formam um "U" que gira num eixo fixo no meio da boca. Com a porta aberta (90°) as placas ficam em pé e o piso, horizontal e contínuo com a porta. Uma biela chata liga um pino da porta a um pino da placa: ao fechar, a bandeja gira 90° (o piso vira parede logo atrás da porta) e a encomenda escorrega e cai no compartimento. Uma segunda biela, presa na placa, desce a aba superior (viseira) até a vertical. Inspirado no mecanismo Milkcan; os pinos foram resolvidos numericamente (`spec.js`). |
| **Fechaduras tambor** (frente e trás) | Clique: a chave entra, gira 90° e o came libera/trava o montante. Cada porta tem a sua. |
| **Portas frontal e traseira** | Mesmo vão (368 × 490 mm), abrem 105°; a traseira é a frontal espelhada. Trancadas, só "tremem". |
| **Encomendas** | "Depositar" gera caixas com tamanhos variados que caem e se empilham com apoio real. Com uma das portas aberta, clique numa caixa para retirá-la (as de cima reacomodam). |

Visualização: raio-X, sem lateral (corte como nas vistas do CAD), vista explodida, cotas,
linhas CAD, câmeras 3D/Frente/Lateral/Trás/Topo e 6 acabamentos (inclusive as cores do CAD).

Atalhos: `P` depositar encomenda · `B` basculante · `L`/`D` fechadura/porta frontal · `U`/`T` fechadura/porta traseira · `V`/`N` fechadura/tampa da eletrônica · `R` retirar tudo ·
`X` raio-X · `C` corte · `E` explodida · `M` cotas · `K` linhas · `G` girar · `S` som · `1–5` câmeras.

## Estrutura

```
src/
  main.js              cena, interação (raycast, arrasto), painel e teclado
  scene/setupScene.js  renderer, luzes, ambiente, chão e sombras
  locker/spec.js       TODAS as medidas (mm) — edite aqui para alterar o produto
  locker/Locker.js     geometria do gabinete, porta, fechadura e mecanismo
  locker/Parcels.js    encomendas: depósito, queda, empilhamento e retirada
  locker/materials.js  acabamentos (pintura, inox, galvanizado)
  locker/Dimensions.js cotas
  locker/textures.js   texturas procedurais (papelão, etiqueta, gravação)
  core/                tweens e sons sintetizados
```

O modelo é construído em milímetros (`locker.root` tem escala 0,001; a cena está em metros).
No console: `locker`, `parcels`, `__step(segundos)` para avançar a simulação.
