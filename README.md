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
| **Basculante** (gaveta de depósito) | Abre até 75°. Clique para abrir/fechar ou arraste para cima/baixo. Ao fechar, a encomenda cai no compartimento. |
| **Anti-furto** | Cúpula fixa concêntrica ao eixo do basculante + chapas laterais. A chapa de fundo da gaveta desliza rente à cúpula (~8 mm) em qualquer ângulo, então mesmo entreaberta a gaveta fica isolada do compartimento. |
| **Fechaduras tambor** (frente e trás) | Clique: a chave entra, gira 90° e o came libera/trava o montante. Cada porta tem a sua. |
| **Portas frontal e traseira** | Mesmo vão (368 × 490 mm), abrem 105°; a traseira é a frontal espelhada. Trancadas, só "tremem". |
| **Encomendas** | "Depositar" gera caixas com tamanhos variados que caem e se empilham com apoio real. Com uma das portas aberta, clique numa caixa para retirá-la (as de cima reacomodam). |

Visualização: raio-X, sem lateral (corte como nas vistas do CAD), vista explodida, cotas,
linhas CAD, câmeras 3D/Frente/Lateral/Trás/Topo e 6 acabamentos (inclusive as cores do CAD).

Atalhos: `P` depositar · `B` basculante · `L`/`D` fechadura/porta frontal · `U`/`T` fechadura/porta traseira · `R` retirar tudo ·
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
