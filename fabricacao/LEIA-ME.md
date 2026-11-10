# Locker Residencial LR-1020: pacote de fabricação

Arquivos para a metalúrgica cortar a laser, dobrar e soldar. Gerados a partir do modelo 3D (`src/cad`),
então refletem as mesmas medidas do armário de 410 × 380 × 1020 mm.

## O que tem aqui

- `dxf/`: uma planificação por peça, em milímetros, escala 1:1 (DXF R12).
- `desenhos/`: folha A3 de cada peça (SVG) com cotas gerais, dobras numeradas, furos e notas de solda.
- `aninhamento/`: as peças de um armário (Armário 3) distribuídas em chapas de 3000 × 1500 mm, por espessura.
- `lista-de-materiais-A1.csv`, `-A2.csv`, `-A3.csv`: peças, quantidades, massas e itens comprados de cada modelo.

## Camadas do DXF

| Camada | Uso |
| --- | --- |
| `CORTE` | contornos e furos (corte a laser) |
| `DOBRA_CIMA` | linha de dobra para cima, vista do lado da gravação |
| `DOBRA_BAIXO` | linha de dobra para baixo |
| `GRAVACAO` | código da peça, marcado a laser em baixa potência |

## Modelos

Os três modelos usam a mesma carcaça. Mudam só as peças com sufixo:

- `-CHV` (chave): porta com furo Ø19 da fechadura de tambor; laterais sem janela.
- `-SOL` (solenoide): porta sem furo na face e com 2 furos Ø4,2 na aba para a lingueta; laterais com a
  janela de 32 mm no montante e os 2 furos Ø4,5 do corpo do solenoide.
- A tampa do módulo eletrônico (`LR-031-CHV`) usa fechadura de chave em todos.
- O Armário 3 acrescenta só o solenoide do basculante (item comprado, preso na rampa).

## Consumo por armário (Armário 3)

- 43 peças de chapa em 20 códigos, 47,1 kg de aço.
- 48 m de corte a laser e 90 dobras.
- Aço carbono SAE 1008 laminado a frio 2 mm: 1 chapa(s) de 3000 × 1500 mm (aproveitamento 51%)
- Aço carbono SAE 1008 laminado a frio 1,5 mm: 1 chapa(s) de 3000 × 1500 mm (aproveitamento 11%)
- Aço galvanizado Z275 2 mm: 1 chapa(s) de 3000 × 1500 mm (aproveitamento 7%)
- Aço galvanizado Z275 3 mm: 1 chapa(s) de 3000 × 1500 mm (aproveitamento 0%)

## Roteiro de fabricação

1. **Corte a laser.** Cortar pela camada `CORTE` e marcar a camada `GRAVACAO`. Rebarbar.
2. **Dobra (dobradeira CNC).** Raio interno igual à espessura; o desenvolvido usa fator K 0,42 (desconto de
   3,54 mm por dobra de 90° na chapa de 2,0 mm). Conferir com a tabela da máquina na primeira peça.
   Onde a aba tem aba (montantes, portas), dobrar primeiro a de fora. A ordem está numerada no desenho.
3. **Solda.**
   - Portas, base e tampo: fechar os 4 cantos (MIG) e lixar.
   - Carcaça: montar no gabarito as duas laterais, o fundo, a travessa inferior, o painel superior, a rampa e
     o batente traseiro; solda ponto nas abas de 18 mm contra os retornos dos montantes.
   - Ripas: bujão + adesivo estrutural, de baixo para cima (cada ripa cobre a borda da de baixo).
   - Bandeja: piso soldado nas duas placas; pinos Ø7 das bielas soldados nas placas e na porta do basculante.
4. **Pintura eletrostática.** Desengraxe e fosfatização, pó poliéster, cura a 200 °C por 10 min. Carcaça,
   portas e basculante em RAL 7016 texturizado; base e tampo em RAL 7021. O mecanismo é galvanizado e não é pintado.
5. **Montagem.** Base aparafusada na carcaça (4 × M6), mecanismo (bandeja, aba e bielas), portas e
   dobradiças, fechaduras, eletrônica na rampa e tampo (4 × M6).

## Peças

| Código | Peça | Qtd | Material | Planificado (mm) | Dobras |
| --- | --- | --- | --- | --- | --- |
| LR-001 | Base | 1 | Aço carbono SAE 1008 laminado a frio 2 mm | 446,9 × 416,9 | 4 |
| LR-002 | Tampo | 1 | Aço carbono SAE 1008 laminado a frio 2 mm | 446,9 × 416,9 | 4 |
| LR-010-CHV | Lateral direita | 1 | Aço carbono SAE 1008 laminado a frio 2 mm | 437,8 × 1012,9 | 6 |
| LR-010-SOL | Lateral direita | 1 | Aço carbono SAE 1008 laminado a frio 2 mm | 437,8 × 1012,9 | 6 |
| LR-011-CHV | Lateral esquerda | 1 | Aço carbono SAE 1008 laminado a frio 2 mm | 437,8 × 1012,9 | 6 |
| LR-011-SOL | Lateral esquerda | 1 | Aço carbono SAE 1008 laminado a frio 2 mm | 437,8 × 1012,9 | 6 |
| LR-020 | Fundo | 1 | Aço carbono SAE 1008 laminado a frio 2 mm | 402,9 × 408,9 | 4 |
| LR-021 | Travessa inferior | 1 | Aço carbono SAE 1008 laminado a frio 2 mm | 402,9 × 217,9 | 4 |
| LR-022 | Painel superior | 1 | Aço carbono SAE 1008 laminado a frio 2 mm | 402,9 × 98,9 | 4 |
| LR-023 | Rampa do módulo eletrônico | 1 | Aço carbono SAE 1008 laminado a frio 2 mm | 426,9 × 357,5 | 2 |
| LR-024 | Batente traseiro da bandeja | 1 | Aço carbono SAE 1008 laminado a frio 2 mm | 406 × 28,5 | 1 |
| LR-030-CHV | Porta (frente e trás) | 2 | Aço carbono SAE 1008 laminado a frio 2 mm | 421,8 × 543,8 | 8 |
| LR-030-SOL | Porta (frente e trás) | 2 | Aço carbono SAE 1008 laminado a frio 2 mm | 421,8 × 543,8 | 8 |
| LR-031-CHV | Tampa do módulo eletrônico | 1 | Aço carbono SAE 1008 laminado a frio 2 mm | 421,8 × 153,8 | 8 |
| LR-040 | Ripa da porta | 16 | Aço carbono SAE 1008 laminado a frio 1,5 mm | 368 × 62,2 | 1 |
| LR-041 | Ripa da travessa | 3 | Aço carbono SAE 1008 laminado a frio 1,5 mm | 374 × 65,3 | 1 |
| LR-042 | Ripa do basculante | 3 | Aço carbono SAE 1008 laminado a frio 1,5 mm | 372 × 53,6 | 1 |
| LR-050 | Porta do basculante | 1 | Aço carbono SAE 1008 laminado a frio 2 mm | 392,9 × 249,4 | 5 |
| LR-060 | Piso da bandeja | 1 | Aço galvanizado Z275 2 mm | 378,9 × 333 | 2 |
| LR-061 | Placa lateral da bandeja | 2 | Aço galvanizado Z275 2 mm | 333 × 187 | 0 |
| LR-062 | Aba superior (viseira) | 1 | Aço galvanizado Z275 2 mm | 352,9 × 190 | 2 |
| LR-063 | Biela da porta | 2 | Aço galvanizado Z275 3 mm | 16 × 197,5 | 0 |
| LR-064 | Biela da aba | 2 | Aço galvanizado Z275 3 mm | 16 × 71,6 | 0 |
