# Taxonomia operacional de referência MTC (baseada em manuais)

> Repertório operacional do sistema (não uma lista única/universal — os EIXOS são
> canônicos, mas a lista exata de padrões varia por escola/manual). Itens podem ser
> **padrão primário**, **alias**, **combinação** ou **guarda-chuva**. MTC genérica estilo
> chinês; refinável pela equipe técnica nas fases finais.
> Legenda: ⭐ = priorizado na calibração inicial · [JÁ] = existe em `patternDefinitions`
> · [NOVO] = a criar · `(P)` primário · `(C)` combinação · `(alias→X)` · `(tag)` modificador.
> Revisado 2026-06-17 após crítica técnica (ver "Correções aplicadas").

## Regra de ouro do motor (técnica 2)
A **língua é uma entrada ponderada, não decide o padrão sozinha.** O motor cruza língua +
sintomas + pulso + anamnese + localização + cronicidade + sinais associados. A assinatura
de língua abaixo serve para o "Gemini vê" propor, e a base curada raciocinar — sempre
confirmado por outros eixos.

## Campos de hierarquia (evitar duplicidade/loop no motor)
Cada padrão carrega: `primaryPattern` (bool), `parentPattern`, `organSpecificPattern`,
`aliasOf`, `combinationOf[]`, `subtype` (ex.: Qi/Yang/Yin/Xue). Assim "Umidade-Calor"
genérico é pai dos específicos por órgão, e o motor não soma o mesmo raciocínio 2x.

## 1. Eixos (Oito Princípios — Ba Gang)
Interior/Exterior · Frio/Calor · Deficiência/Excesso · Yin/Yang. Filtro transversal.

## 2. Padrões de Qi
- **Deficiência de Qi** (geral) `(P)` [NOVO] — cansaço, voz fraca; língua pálida (nem sempre com marca de dente).
- **Afundamento do Qi do Baço** `(P)` [NOVO] — prolapsos, peso, diarreia crônica; língua pálida.
- *Qi rebelde / contrafluxo* `(tag)` — NÃO é padrão primário (sem assinatura de língua própria). Vira modificador: **Qi do Estômago rebelde** (náusea/refluxo/soluço) e **Qi do Pulmão rebelde** (tosse/dispneia/chiado), ativado quando o padrão-base de Estômago/Pulmão acende.
- *Estagnação de Qi do Fígado* → ver **Fígado** (nó único, `subtype: Qi`).

## 3. Padrões de Sangue (Xue)
- **Deficiência de Sangue** (geral) `(P)` [NOVO] ⭐ — palidez, tontura, insônia; **língua pálida, fina, às vezes seca; pulso fino.**
- **Estase de Sangue** (Estagnação de Xue) `(P)` [JÁ] ⭐ — dor fixa/pontada; **língua roxa/escura, manchas roxas, veias sublinguais distendidas.**
- **Calor no Sangue** `(P)` [NOVO] — sangramentos, erupções, agitação; língua vermelho-escura, pontos vermelhos.

## 4. Fluidos (Jin-Ye) e Fleuma (Tan)
- **Deficiência de Fluidos / Jin-Ye** `(P)` [NOVO] — sede, secura; língua seca. (≠ Def. Yin, ≠ secura externa.)
- **Secura externa** `(P)` [NOVO] — quadro externo: tosse seca, garganta/pele seca.
- **Fleuma-Umidade** `(P, parent)` [NOVO] ⭐ — peso, expectoração; **língua inchada, saburra branca espessa/gordurosa/pegajosa.**
- **Fleuma-Calor** `(P, parent)` [NOVO] — escarro amarelo; **língua vermelha, saburra amarela gordurosa.**
- **Fleuma-Frio** `(P)` [NOVO] — escarro claro; saburra branca espessa úmida.
- **Retenção de Alimentos / Estagnação Alimentar** → ver **Baço/Estômago**.
- (Fleuma perturbando a mente foi **desmembrada** — ver Coração.)

## 5. Fatores patogênicos externos
- **Vento-Frio** `(P)` [NOVO] ⭐, **Vento-Calor** `(P)` [NOVO] ⭐ — saburra fina branca/amarela.
- **Vento-Umidade** `(P)` [NOVO] — dor articular migratória.
- **Umidade externa** [NOVO] · **Calor de Verão** [NOVO] · (Secura externa já na Seção 4).

## 6. Zang-Fu por órgão

### Pulmão
- Def. de Qi do Pulmão `(P)` [JÁ] · Def. de Yin do Pulmão `(P)` [NOVO] · Vento-Frio/Calor no Pulmão `(P)` [NOVO] · **Fleuma-Umidade no Pulmão** `(organSpecificPattern→Fleuma-Umidade)` [NOVO] · **Fleuma-Calor no Pulmão** `(→Fleuma-Calor)` [NOVO] · Secura no Pulmão `(P)` [NOVO].

### Coração
- **Def. de Sangue do Coração** `(P)` [NOVO] ⭐ — insônia/palpitação; **língua pálida, possível ponta pálida; pulso fino/fraco.**
- **Fogo do Coração** `(P)` [NOVO] ⭐ — **ponta vermelha, possível úlcera oral, saburra amarela, agitação/insônia.**
- Def. de Qi/Yang/Yin do Coração `(P)` [NOVO] · Estase de Sangue do Coração `(C→Estase de Sangue)` [NOVO].
- **Fleuma-Fogo perturbando o Coração** (痰火扰心) `(C→Fleuma-Calor)` [NOVO] — mania, insônia, agitação; vermelha, saburra amarela gordurosa.
- **Fleuma obstruindo os orifícios do Coração** (痰蒙心窍) `(C→Fleuma-Umidade)` [NOVO] — torpor, confusão, embotamento; **pálida/normal, inchada, saburra branca gordurosa.**
- (Agitação do Shen por Calor [JÁ] = guarda-chuva já usado.)

### Baço / Estômago
- Def. de Qi do Baço `(P)` [JÁ] ⭐ — **buscar marcas de dente** (input visual-chave) + pálida.
- **Def. de Yang do Baço** `(P, subtype: Yang)` [NOVO] ⭐ — pálida, inchada, úmida, marcas de dente, frio.
- Baço não controla o Sangue `(P)` [NOVO] · Umidade-Frio no Baço `(P)` [NOVO].
- Def. de Qi do Estômago `(P)` [NOVO] · **Def. de Yin do Estômago** `(P)` [NOVO] ⭐ — **fissura central, saburra central pouca/ausente, língua seca.**
- **Fogo/Calor do Estômago** `(P)` [NOVO] ⭐ — fome, mau hálito; vermelha, saburra amarela. · Frio no Estômago `(P)` [NOVO].
- **Retenção de Alimentos** `(P)` [NOVO] ⭐ — plenitude epigástrica, eructação com odor, náusea; **saburra espessa/pegajosa, centro/raiz.**

### Fígado / Vesícula
- **Estagnação de Qi do Fígado** `(P, subtype: Qi)` [NOVO] ⭐ — distensão móvel, irritabilidade, suspiros; **língua pode ser NORMAL (cor preservada); laterais tensas/altas, ou laterais vermelhas se houver calor. Laterais ROXAS = já evoluiu p/ Estase, não Qi puro.**
- **Fogo do Fígado** `(P)` [NOVO] ⭐ — **laterais vermelhas, saburra amarela seca.**
- Ascensão do Yang do Fígado `(P)` [JÁ] ⭐ · **Vento Interno do Fígado** `(P)` [NOVO] — **desvio/tremor/rigidez da língua.**
- Def. de Sangue do Fígado `(P)` [JÁ] · **Def. de Yin do Fígado** `(P)` [NOVO] · Frio no canal do Fígado `(P)` [NOVO].
- **Qi do Fígado invadindo Baço/Estômago** `(P)` [JÁ] ⭐ — *"Desarmonia Fígado-Baço" = alias deste (mesmo mecanismo).*
- **Umidade-Calor no Fígado/Vesícula** `(organSpecificPattern→Umidade-Calor)` [NOVO] ⭐ — saburra amarela gordurosa.
- Def. de Qi da Vesícula Biliar `(P, baixa prioridade)` [opcional] — timidez/indecisão, sono agitado.

### Rim / Bexiga
- Def. de Yin do Rim `(P)` [JÁ] ⭐ · Def. de Yang do Rim `(P)` [JÁ] ⭐ · Def. de Essência (Jing) `(P)` [NOVO] · Def. de Qi do Rim / não firma `(P)` [NOVO] · Rim não recebe o Qi `(P)` [NOVO].
- **Umidade-Calor na Bexiga** `(organSpecificPattern→Umidade-Calor)` [NOVO] ⭐ — ITU; saburra amarela na raiz.

### Intestinos
- Umidade-Calor no Intestino Grosso `(→Umidade-Calor)` [NOVO] · Frio-Umidade no Intestino `(P)` [NOVO] · Secura/Calor no Intestino (constipação) `(P)` [NOVO] ⭐.

### Guarda-chuva
- **Umidade-Calor** `(P, parent)` [JÁ] ⭐ — pai dos específicos por órgão; **saburra amarela gordurosa** + localização.

## 7. Combinações / interações comuns `(C)`
O motor trata como **sobreposição de padrões-base** (peso somado controlado), não nós isolados:
- **Desarmonia Fígado–Baço** ⭐ = `aliasOf` Qi do Fígado invadindo Baço [JÁ].
- **Def. de Coração e Baço** [NOVO] ⭐ — insônia + fadiga + palpitação + preocupação (clássico de ansiedade/insônia).
- **Desarmonia Coração–Rim** [NOVO] ⭐ — Fogo/Água não se comunicam (insônia c/ calor vazio).
- **Def. de Yin de Fígado e Rim** [NOVO] ⭐ — base da Ascensão do Yang.
- **Def. de Qi de Pulmão e Baço** [NOVO] · **Def. de Yang de Baço e Rim** [NOVO] · **Def. de Yin de Pulmão e Rim** [NOVO].
- **Água não nutre a Madeira** ⭐ (já no `cycleInterpretation`).
- **Fogo do Fígado afetando o Coração** [NOVO] — combinação (Fogo do Fígado + agitação do Shen), não padrão-base.

## 8. Foco de calibração inicial (prioridade interna, não claim epidemiológico)
Priorizar na 1ª calibração, pela demanda típica da prática ambulatorial da equipe (a ser
confirmada com dados próprios): Estagnação de Qi do Fígado, Def. Coração-Baço, Def. de
Sangue, Umidade-Calor, Ascensão do Yang/Fígado, Def. Yin Fígado-Rim, Fogo do Fígado,
Retenção de Alimentos, Def. Qi/Yang do Baço, Vento-Frio/Calor, Umidade-Calor na Bexiga.

## Correções aplicadas (2026-06-17)
1. Título "canônica" → "operacional de referência".
2. Língua = entrada ponderada, não decide sozinha (regra de ouro).
3. Qi Rebelde → tag/modificador (Estômago/Pulmão), não padrão primário.
4. Retenção de Alimentos → Baço/Estômago (era Fluidos).
5. Fluidos/Secura separados: Jin-Ye, secura externa, Def. Yin Estômago, Def. Yin geral.
6. Fleuma na mente desmembrada: Fleuma-Fogo no Coração (quente) × Fleuma obstruindo orifícios (frio/úmido).
7. Def. Qi da Vesícula → opcional/baixa prioridade.
8. Fogo do Fígado→Coração = combinação, não nó isolado.
9. Hierarquia (`aliasOf`/`parent`/`organSpecific`) p/ Umidade-Calor, Fleuma, Fígado-Baço, Estagnação Qi Fígado (nó único subtype Qi).
10. Assinaturas de língua refinadas; marcas de dente como input visual-chave da Def. Baço.

## Observação de método
Esta taxonomia reúne padrões amplamente reconhecidos em manuais de MTC e serve como
repertório operacional do sistema. Alguns itens são primários; outros são aliases,
combinações ou guarda-chuvas. O leitor de língua não fecha diagnóstico isoladamente: os
achados visuais são ponderados junto a sintomas, pulso, anamnese, localização, cronicidade
e sinais associados. A base curada é a referência principal; a equipe técnica de
acupuntura ajusta nomenclatura, limites e pesos nas fases finais.
