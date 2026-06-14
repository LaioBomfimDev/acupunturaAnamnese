# Auditoria da Base do KM-Agent — Pontos Sistêmicos (Corpo)

Este documento apresenta o levantamento detalhado de todos os 416 pontos contidos na base do KM-Agent (`acupoints.index.json`), separados por meridiano, identificando quais pertencem ao padrão oficial clássico e apontando erros de dados críticos (ausência de localização ou agulhamento).

---

## Resumo Estatístico Geral

| Grupo / Canal | Sigla | Pontos no KM-Agent | Padrão Chinês Oficial | Erros de Dados Críticos (Falta de Loc ou Agulhamento) |
|---|---|---|---|---|
| **Pulmão** | LU | 11 | 11 | 0 |
| **Intestino Grosso** | LI | 20 | 20 | 0 |
| **Estômago** | ST | 45 | 45 | 0 |
| **Baço** | SP | 21 | 21 | 0 |
| **Coração** | HT | 9 | 9 | 0 |
| **Intestino Delgado** | SI | 19 | 19 | 0 |
| **Bexiga** | BL | 67 | 67 | 0 |
| **Rim** | KI | 27 | 27 | 0 |
| **Pericárdio** | PC | 9 | 9 | 0 |
| **Triplo Aquecedor** | TE | 23 | 23 | 1 (`TE21` sem agulhamento) |
| **Vesícula Biliar** | GB | 44 | 44 | 1 (`GB28` sem agulhamento) |
| **Fígado** | LR | 14 | 14 | 0 |
| **Vaso Governador** | GV | 28 | 28 | 1 (`GV11` sem agulhamento) |
| **Vaso Concepção** | CV | 24 | 24 | 0 |
| **Pontos Extras (Cabeça)** | EX-HN | 15 | 15 (Tradicionais) | 15 (Todos sem localização!) |
| **Pontos Extras (Costas)** | EX-B | 9 | 9 (Tradicionais) | 9 (Todos sem localização!) |
| **Pontos Extras (Abdome)** | EX-CA | 1 | 1 (Tradicional) | 1 (Sem localização!) |
| **Pontos Extras (M. Superiores)** | EX-UE | 11 | 11 (Tradicionais) | 11 (Todos sem localização!) |
| **Pontos Extras (M. Inferiores)** | EX-LE | 12 | 12 (Tradicionais) | 12 (Todos sem localização!) |
| **Marcadores de Superfície** | SA | 4 | 0 (Inválido/Não oficial) | 4 (Todos sem localização E sem agulhamento) |
| **Testes de Auriculoterapia** | AA | 3 | 0 (Inválido/Não oficial) | 3 (Todos sem localização E sem agulhamento) |
| **Total Geral** | — | **416** | **409** | **58** |

---

## Detalhamento de Pontos Inválidos ou com Erros Críticos

### 1. Meridianos Clássicos (Erros de dados isolados)
* **Meridiano do Triplo Aquecedor (TE)**:
  * `TE21` (Ermen): Não possui descrição de técnica de agulhamento (`needlingPreview` vazia).
* **Meridiano da Vesícula Biliar (GB)**:
  * `GB28` (Weidao): Não possui descrição de técnica de agulhamento (`needlingPreview` vazia).
* **Meridiano do Vaso Governador (GV)**:
  * `GV11` (Shendao): Não possui descrição de técnica de agulhamento (`needlingPreview` vazia).

### 2. Pontos Extras (EX-*)
Todos os 48 pontos extraordinários importados na base do KM-Agent estão **sem o texto de localização** (`locationPreview` vazia). Embora sejam clinicamente válidos no padrão chinês oficial tradicional (como Yintang `EX-HN3`, Sishencong `EX-HN1`, etc.), suas descrições brutas estão vazias na base do KM-Agent.
* **EX-HN1** a **EX-HN15** (Cabeça e Pescoço)
* **EX-B1** a **EX-B9** (Costas/Tórax Posterior)
* **EX-CA1** (Tórax e Abdome)
* **EX-UE1** a **EX-UE11** (Membro Superior)
* **EX-LE1** a **EX-LE12** (Membro Inferior)

### 3. Pontos Inválidos e Não Oficiais (SA e AA)
Estes pontos não fazem parte dos meridianos oficiais e não possuem nenhuma informação de localização ou técnica terapêutica. São detritos de bases de teste e devem ser totalmente desativados do sistema.
* **SA1**, **SA2**, **SA3**, **SA4** (Anatomia de Superfície)
* **AA1**, **AA2**, **AA3** (Marcadores Auriculares)

---

## Proposta de Resolução no Plano de Curadoria Permanente

Para promover os pontos não curados do KM-Agent de forma segura, o sistema precisa:
1. **Ignorar/Bloquear** os pontos inválidos (`SA1-SA4` e `AA1-AA3`).
2. **Importar de forma controlada** os 328 pontos dos 14 meridianos clássicos que estão com os dados válidos.
3. **Mapear e preencher a localização** para os pontos extraordinários (`EX-*`) que estão com dados vazios antes de aprová-los de forma permanente no `knowledgeBase.js`, ou deixá-los desativados como complementares aguardando dados da curadoria local.
