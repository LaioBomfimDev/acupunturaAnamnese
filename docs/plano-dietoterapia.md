# Plano: Aba de Dietoterapia (ervas/alimentos) — desenho, ainda NÃO implementado

**Status:** estudo aprovado, implementação adiada por decisão do usuário (2026-07-01). Não codar até os pré-requisitos abaixo. Regras de fonte/curadoria vivem em [`docs/agents-mapas.md`](agents-mapas.md) (§ Dietoterapia); este doc é o **plano da feature**.

## Decisão de desenho

- A aba **"Dietoterapia"** entra na barra "Filtros terapêuticos" do Protocolo (superfície do **profissional**, `frontend/src/components/panels/Protocolo.jsx`), como uma **modalidade que abre um painel educativo** — não como técnica de ponto e **não como recomendador**.
- Cuidado de categoria: os filtros atuais (`Sistêmicos`, `Auriculoterapia`, `Laser`, `Moxa`, `Ventosa`, `Stiper`, `Eletro`) são *técnicas de aplicação do ponto*. Dietoterapia não é; deve abrir seção educativa própria (como Laser/Moxa abrem o card deles), sem se comportar como filtro de ponto. Manter fora de `PROTOCOL_TECHNIQUES` ou marcar com flag para não poluir a semântica.
- **"Interação que ajude o paciente" foi reenquadrado:** vira **checagem de cautela/interação** (o que EVITAR/conferir), nunca "tome X pro seu padrão". O valor seguro é evitar dano, não recomendar.

## Por que adiar (riscos de "orientar errado")

1. **Nada liberado:** triagem-semente = 218 plantas, **0 `educativo_aprovado`** (90 restritas por toxicologia, 128 só-fonte). Aprovação é local e exige `safetyReview` completo.
2. **Padrão MTC não libera erva/alimento sozinho** (agents-mapas § "Um padrão MTC não pode liberar alimento ou erva por si só"). Mapear padrão→erva automaticamente é o proibido.
3. **Interação erva/alimento × medicamento** é área de dano real (erva-de-são-joão × antidepressivo/anticoncepcional; ginkgo/alho × anticoagulante; alcaçuz × hipertensão). `interactionsReviewed`/`vulnerableGroupsReviewed` são travas duras.
4. **Não existe passo de publicação/retrieval revisado:** mesmo item aprovado ainda não alimenta paciente/Biblioteca/IA. Sem ele a aba é legitimamente vazia.
5. **Invariante:** nunca prescrição/dose/preparo/cardápio; ficha de erva começa pela cautela.

## Pré-requisitos (bloqueadores da implementação)

1. **Curadoria humana:** aprovar itens `educativo_aprovado` no `HerbalPlantCurationPanel` (SuperAdm), com `safetyReview` completo e rastreabilidade de fonte. Enquanto for 0, a Fase A começa vazia.
2. **Passo de publicação/retrieval revisado (a desenhar/construir):** pipeline que pega decisões `educativo_aprovado` + elegíveis (`isHerbalPatientEligible`) e as disponibiliza para exibição via um gate de publicação explícito — não ler `localStorage` cru na tela clínica.

## Fase A — aba educativa segura (quando pré-req. 1 e 2 existirem)

- Chip "Dietoterapia" na barra; ao ativar, esconde mapas/sugestões de ponto e mostra o painel educativo.
- Exibe **só** itens `educativo_aprovado` **e** `isHerbalPatientEligible`. Vazio → estado honesto: "Em curadoria — nenhum item liberado ainda".
- Cada item: nome comum + científico, associação tradicional MTC (com fonte), síntese educativa e **cautelas primeiro**. Sem dose/preparo/cardápio. Rótulo fixo: "Educação, não prescrição; revisado por profissional".
- **Sem** mapeamento automático padrão→erva.
- Testes de regressão: aba nunca exibe item não-aprovado; estado vazio correto; rótulos de segurança presentes.

## Fase B — checagem de cautela/interação (futuro)

- Entrada: medicamentos/condições do paciente (captura com consentimento; dado sensível → `AGENTS.md` §0/§9).
- Saída: avisos "evite/consulte" cruzando item curado × medicação/condição/grupo vulnerável. **Nunca "tome".**
- Requer campo de dados de interação curado por item (com fonte) + gate humano.
