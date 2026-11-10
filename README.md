# Locker Residencial 3D

Modelo 3D funcional, feito em [three.js](https://threejs.org), do locker residencial de encomendas
**LR-1020** (410 × 380 × 1020 mm), baseado nos desenhos do SolidWorks.

## Três páginas

| Página | O que é |
| --- | --- |
| `index.html` | O armário interativo (este modelo 3D, com o mecanismo funcionando). |
| `pecas.html` | **Peças de chapa (CAD).** As 43 peças do armário como chapa dobrada: conjunto montado e explodido, cada peça com a dobra animada, a planificação cotada e o download do DXF. |
| `fabrica.html` | **Fábrica 3D.** A linha de produção completa, da chegada das chapas ao caminhão saindo com os armários embalados. |

### Peças de chapa e pacote de fabricação

As peças são definidas em `src/cad/parts.js` a partir das mesmas medidas do modelo (`spec.js`): face base + abas, com
medidas externas. O motor em `src/cad/sheetmetal.js` calcula a planificação com desconto de dobra (raio interno igual à
espessura, fator K 0,42), as linhas de dobra e a sequência para a dobradeira.

```bash
npm run fabricacao
```

gera a pasta `fabricacao/` para mandar à metalúrgica:

- `dxf/`: planificação 1:1 de cada peça (camadas `CORTE`, `DOBRA_CIMA`, `DOBRA_BAIXO`, `GRAVACAO`).
- `desenhos/`: folha A3 de cada peça com cotas gerais, dobras numeradas, furos e notas de solda.
- `aninhamento/`: as peças de um armário em chapas de 3000 × 1500 mm, por espessura.
- `lista-de-materiais-A1/A2/A3.csv`: peças, massas e itens comprados de cada modelo.
- `LEIA-ME.md`: roteiro de corte, dobra, solda, pintura e montagem.

O mesmo pacote sai em `.zip` pelo botão da página de peças. Um armário (modelo 3) usa 43 peças de chapa em 20 códigos,
47 kg de aço, 48 m de corte e 90 dobras. O desenvolvido usa um fator K genérico: confira com a tabela da dobradeira da
metalúrgica antes do corte em série.

### Fábrica 3D

Linha em U com nove estações, tudo animado em função do tempo (um armário a cada 24 s de simulação em 1×):

1. **Recebimento de chapas**: doca, empilhadeira e pórtico a vácuo que alimenta o laser.
2. **Corte a laser**: o cabeçote percorre o aninhamento real das peças de 2 mm; mesa de troca automática.
3. **Dobra CNC**: robô sobre trilho posiciona o recorte e cada aba dobra na ordem da dobradeira.
4. **Solda da carcaça**: um robô monta as 7 peças no gabarito e dois robôs MIG soldam.
5. **Pintura eletrostática**: trilho aéreo de 71 m com lavagem, cabine de pó (a peça muda de aço cru para pó) e estufa.
6. **Montagem**: base, mecanismo, portas, eletrônica e tampo, um posto por etapa.
7. **Teste funcional**: o basculante e a porta são acionados no armário de verdade (mesmo mecanismo do modelo).
8. **Embalagem e paletização**: caixa, cintas, 4 caixas por palete e filme stretch.
9. **Expedição**: a empilhadeira carrega o caminhão, o portão abre e ele sai da fábrica.

Controles: passeio automático pelas estações, vista geral, velocidade (1× a 8×), pausa e qualidade gráfica
(Ultra, Alta, Média; baixa sozinha se a máquina não acompanhar). Setas ←/→ trocam de estação e a barra de espaço pausa.

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
| **Fachada (base: Milkcan Hamilton)** | De cima para baixo: módulo eletrônico liso de 5 cm, 3 batentes, porta de encomendas ripada, frente ripada e porta de baixo ripada. Atrás, a mesma porta ripada da frente (espelhada) e, em cima, uma tampa de 368 × 100 mm com fechadura de chave que dá acesso ao módulo eletrônico. |
| **Módulo eletrônico** | Compartimento logo abaixo do tampo, com piso em rampa contínua, de 50 mm de altura na frente a 100 mm no fundo (onde fica a tampa). Separado da boca por uma chapa. Só abre por trás, pela tampa com chave (`V` tranca/destranca, `N` abre). Não dá acesso às encomendas. |
| **Porta de depósito** (basculante) | Dobradiça embaixo; abre até 90° e vira prateleira. Clique ou arraste. |
| **Bandeja giratória anti-furto** | Duas placas laterais + piso formam um "U" que gira num eixo fixo no meio da boca. Com a porta aberta (90°) as placas ficam em pé e o piso, horizontal e contínuo com a porta. Uma biela chata liga um pino da porta a um pino da placa: ao fechar, a bandeja gira 90° (o piso vira parede logo atrás da porta) e a encomenda escorrega e cai no compartimento. Uma segunda biela, presa na placa, desce a aba superior (viseira) até a vertical. Inspirado no mecanismo Milkcan; os pinos foram resolvidos numericamente (`spec.js`). |
| **Fechaduras tambor** (frente e trás) | Clique: a chave entra, gira 90° e o came libera/trava o montante. Cada porta tem a sua. |
| **Três modelos** | O seletor "Modelo" do painel alterna entre o **Armário 1** (fechaduras de tambor com chave), o **Armário 2** (travas eletrônicas de smartlocker nas portas frontal e traseira) e o **Armário 3** (como o 2 e, além disso, solenoide na **gaveta de entrega**, o basculante). Em todos, a tampa da eletrônica tem sempre fechadura de chave. A trava solenoide tem o **corpo preto** preso na chapa lateral e a **lingueta** (chapa de aço com grampo em U) na porta; ao fechar, o U entra na fenda do corpo, e a lingueta passa por uma janela de 32 mm nas chapas do montante. Por fora da porta não há nada: o pino do trinco, em cima do corpo preto, sobe 6 mm ao destravar. **Gaveta (Armário 3):** o solenoide fica no meio da borda de cima da porta: o corpo preto (girado 90°) preso no teto da boca, logo acima da aba, e a lingueta com o U na face de dentro do topo da porta. Fica travada ao fechar; "Abrir basculante" (ou um depósito) libera o solenoide e abre; arrastar ou usar o controle de ângulo com ela travada é negado. Ao fechar, o solenoide trava de novo sozinho. Clicar no corpo preto trava/destrava. O corpo, a bandeja e as medidas são iguais nos três. |
| **Portas frontal e traseira** | Mesmo vão (368 × 490 mm), abrem 105°; a traseira é a frontal espelhada. Uma única peça de chapa: painel com retorno de 20 mm nos 4 lados e uma aba de 14 mm dobrada para dentro em cada retorno (fecha o perfil e enrijece, sem reforços soltos nem pontas), cortada a laser e dobrada. Trancadas, só "tremem". |
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
