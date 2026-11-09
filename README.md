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
| **Fachada (base: Milkcan Hamilton)** | De cima para baixo: fenda de cartas, painel "Cartas", rebaixo de pegada com 3 batentes, porta de encomendas ripada e frente ripada. Atrás, porta de acesso de altura inteira. |
| **Cartas** | Entram pela fenda (a aba interna balança), escorregam pela calha do nicho e caem na prateleira de cima. Só saem pela porta traseira. |
| **Porta de depósito** (basculante) | Dobradiça embaixo; abre até 90° e vira prateleira. Clique ou arraste. |
| **Bandeja anti-furto** | Bandeja interna que ocupa a profundidade toda, logo abaixo da boca. Com a porta aberta (já a partir de 10°) ela fica horizontal e separa a parte de cima do compartimento; ao fechar a porta, uma biela chata (com rasgo de folga) ligada à manivela do eixo da porta inclina a bandeja 30° para trás (ela gira em discos presos a placas laterais trapezoidais), uma aba superior desce junto e a encomenda escorrega e cai. Inspirado no mecanismo Milkcan. |
| **Fechaduras tambor** (frente e trás) | Clique: a chave entra, gira 90° e o came libera/trava o montante. Cada porta tem a sua. |
| **Portas frontal e traseira** | Mesmo vão (368 × 490 mm), abrem 105°; a traseira é a frontal espelhada. Trancadas, só "tremem". |
| **Encomendas** | "Depositar" gera caixas com tamanhos variados que caem e se empilham com apoio real. Com uma das portas aberta, clique numa caixa para retirá-la (as de cima reacomodam). |

Visualização: raio-X, sem lateral (corte como nas vistas do CAD), vista explodida, cotas,
linhas CAD, câmeras 3D/Frente/Lateral/Trás/Topo e 6 acabamentos (inclusive as cores do CAD).

Atalhos: `P` depositar encomenda · `A` depositar carta · `B` basculante · `L`/`D` fechadura/porta frontal · `U`/`T` fechadura/porta traseira · `R` retirar tudo ·
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
