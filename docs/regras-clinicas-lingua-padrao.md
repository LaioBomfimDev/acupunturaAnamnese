# Ruleset clínico — Língua → Padrão (MTC estilo chinês)

> Lógica que o Claude usa para revisar/curar os achados de língua e ligá-los a padrões.
> Padrão de referência: MTC genérica chinesa + o que o livro-fonte diz (o livro vence
> onde fala). Meta: decisões ~80% confiáveis e funcionais; conflito → `review` (esperar).
> Será refinado por equipe técnica de acupuntura nas fases finais. Criado 2026-06-16.

## Princípio (corrigido 2026-06-17)
A **língua é UMA entrada ponderada, não fecha padrão sozinha.** Estas regras servem para o
"Gemini vê" propor e a base curada raciocinar, sempre cruzando com sintomas, pulso,
anamnese, localização e cronicidade. Hierarquia/aliases e a lista completa de padrões em
`docs/repertorio-padroes-mtc.md`. Ajustes-chave desta revisão: **marca de dente** é o
input visual-chave da Def. de Qi/Yang do Baço (pálida sem marca pende a Def. de Sangue);
**Estagnação de Qi do Fígado** costuma ter língua de cor normal (laterais roxas = já é
Estase); **Fleuma na mente** se divide em Fleuma-Fogo (vermelha/amarela gordurosa) vs
Fleuma obstruindo orifícios (pálida/branca gordurosa); **Qi rebelde** não tem assinatura
de língua própria (é tag sobre Estômago/Pulmão).

## Como ler um achado de língua (5 eixos)

1. **Cor do corpo** → estado de Calor/Frio e Deficiência/Sangue/Yin.
2. **Forma/tamanho** → Deficiência vs fator patogênico (Umidade/Fleuma), e marcas especiais.
3. **Marcas especiais** (dente, fissura, pontos, manchas, desvio) → padrões específicos.
4. **Cor da saburra** → Frio vs Calor (eixo principal de temperatura).
5. **Qualidade da saburra** (espessura/umidade/aderência/raiz) → fator patogênico e fluidos.

Regra-mãe: **a saburra decide Frio×Calor; o corpo decide Deficiência×Excesso e Sangue/Yin;
as marcas especiais têm prioridade** (sobrescrevem o genérico).

## A. Cor do corpo
| Sinal | Padrão(ões) | Conf. |
|---|---|---|
| Pálida + úmida/inchada | Def. Yang/Qi (Baço/Rim) | alta |
| Pálida + fina/seca | Def. de Sangue (geral) `NOVO` | alta |
| Vermelha com saburra | Calor pleno (ex.: Umidade-Calor, Calor no Estômago) | alta |
| Vermelha sem saburra / descascada | Def. de Yin / Fogo Vazio `NOVO` | alta |
| Vermelho-escura/carmesim | Calor no Sangue `NOVO` (calor no nível nutritivo) | alta |
| Roxa/arroxeada | Estagnação de Xue | alta |
| **Vermelho-clara** (sozinha) | quase normal → peso baixo; decidir pelas marcas/saburra | baixa |

## B. Forma / tamanho
| Sinal | Padrão | Conf. |
|---|---|---|
| Marcas de dente | **Def. de Qi do Baço** (clássico) | alta |
| Inchada/aumentada | Fleuma-Umidade `NOVO` **ou** Def. Qi/Yang do Baço | média |
| Fina/pequena | Def. de Sangue/Yin | média |
| Flácida/mole | Def. de Qi/Yin | média |
| Rígida/dura | Vento Interno `NOVO` ou Fleuma | média |

## C. Marcas especiais (prioridade alta — sobrescrevem)
| Sinal | Padrão | Conf. |
|---|---|---|
| Desvio lateral / tremor / rigidez | **Vento Interno do Fígado** `NOVO` | alta |
| Manchas roxas | **Estagnação de Xue** (somar sempre) | alta |
| Pontos vermelhos | Calor no Sangue `NOVO` / calor de órgão pela região | média-alta |
| Fissuras verticais centrais | Def. de Yin do Estômago `NOVO` (ou Yin geral) | média |
| Muitas fissuras + corpo vermelho | Def. de Yin / Fogo Vazio | alta |
| Fissuras + corpo pálido | Def. de Sangue/Qi | média |

## D. Cor da saburra (eixo Frio×Calor)
| Saburra | Padrão | Conf. |
|---|---|---|
| Branca fina | normal / Frio leve / superficial | baixa-média |
| Branca espessa/gordurosa | Frio-Umidade `NOVO` / Fleuma-Umidade `NOVO` | alta |
| Amarela | Calor | alta |
| Amarela + gordurosa/espessa | **Umidade-Calor** (ou Fleuma-Calor `NOVO`) | alta |
| Cinza/preta + úmida | Frio extremo / Def. Yang grave | média |
| Cinza/preta + seca | Calor extremo / dano de Yin | média |
| Sem saburra / descascada | Def. de Yin (Estômago/Rim) | alta |

## E. Qualidade da saburra
| Sinal | Leitura |
|---|---|
| Espessa | fator patogênico presente (excesso): Umidade/Fleuma/retenção |
| Fina | normal ou deficiência/exterior |
| Gordurosa/pegajosa/escorregadia | Umidade/Fleuma |
| Úmida/molhada | Frio/Umidade/Def. Yang |
| Seca | Calor / falta de fluidos (Yin) |
| Destacada/sem raiz | Def. de Estômago/Rim (Qi/Yin) |

## Regras de combinação
- Um achado pode (e deve) ligar a **vários padrões** quando os sinais apontam para mais de um
  (ex.: inchada + saburra amarela gordurosa + manchas roxas → Umidade-Calor **+** Estase de Xue).
- Marca especial presente → **sempre** incluir o padrão dela, além do que a saburra/corpo indicam.
- Peso (`weight`) sugerido: marca especial/objetiva forte = 5–7; combinação típica = 3–4; sinal fraco/ambíguo = 1–2.

## Confiança e quando ESPERAR (status `review`)
- **Aprovar (~80–95%)**: sinal discriminativo claro (dente→Baço; roxo→Estase; desvio→Vento;
  amarela gordurosa→Umidade-Calor; descascada→Def. Yin).
- **Esperar / `review` (não forçar)** quando:
  - sinais contraditórios sem resolução (ex.: corpo pálido/frio + saburra amarela/calor sem lógica de calor-sobre-deficiência);
  - o "Diagnóstico" do livro **contradiz** os sinais da própria língua (sinalizar os dois);
  - achado vago demais ("vermelho-clara" + "saburra fina branca" e nada mais) → quase normal;
  - achado mapeia para algo fora do escopo de língua (ruído).
- Conflito **nunca** é resolvido à força: fica `review` aguardando a equipe técnica.

## Padrões canônicos NOVOS a criar (legítimos, MTC genérica)
Além dos 10 atuais: **Vento Interno do Fígado**, **Calor no Sangue**, **Fleuma-Umidade**,
**Fleuma-Calor**, **Deficiência de Yin** (geral) / **Fogo Vazio**, **Frio-Umidade**,
**Deficiência de Sangue** (geral), **Def. de Yin do Estômago**, **Calor no Estômago**.
(Manter Estagnação de Xue, Umidade-Calor, Def. Qi do Baço, etc. já existentes.)

## Saída por achado (o que o Claude grava)
Para cada finding: confirmar `label`, limpar `aliases` (gatilhos), definir `checklistGroup`
(`lingua`), e preencher `patternLinks[]` (padrão canônico + weight + polarity + evidência do
trecho do livro). `status`: `approved_local` quando ≥80%; `review` quando conflito/vago;
`rejected` quando ruído. Padrão novo legítimo entra como candidato `pattern` a aprovar.
