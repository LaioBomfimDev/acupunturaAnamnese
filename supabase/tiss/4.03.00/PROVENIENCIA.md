# XSD do Padrão TISS 4.03.00 (ANS)

Arquivos copiados sem alteração do pacote oficial da ANS
`PadroTISSComunicao_202511.zip` (Componente de Comunicação, versão 4.03.00),
página "Padrão TISS julho 2026" em gov.br/ans.

O site gov.br estava bloqueado no ambiente de trabalho em 03/11/2026, então os
arquivos vieram de cópias públicas e foram conferidos por SHA-256 em três
fontes independentes que apontam para o mesmo zip da ANS
(SHA-256 do zip: `db8640e1c3b87085892f54f838bfcea9934439ff365798c8428559f88c13d62d`):

- `Voa-Health/tiss` (Apache-2.0), `src/tiss/_data/schemas/4.03.00/`
- `BrunoMNoronha/fisio-orto-sport`, `src/modules/administrativo/tiss/schemas/4.03.00/`
- `fmunizmcorp/implantarabi-ia`, `referencias/tiss/schemas-4.03.00/` (mesmo conteúdo, sem CRLF)

| Arquivo | SHA-256 |
|---|---|
| tissV4_03_00.xsd | d4c421c7e3cf936551b70d6bd794a419867b6daea554d557b4d928363c54044c |
| tissGuiasV4_03_00.xsd | 587f0b6bac24175c50635ede52356cab00ff1ae28b550adc42e3a7f03cf605c7 |
| tissComplexTypesV4_03_00.xsd | 83a24d606620cd3907c5cd574a71bf9c4411a2ec9e0510979f44293fe7c5956a |
| tissSimpleTypesV4_03_00.xsd | d854debf58ac2d96194f72db95315ef2d102de57aeaf0388512f242824fdc794 |
| tissWebServicesV4_03_00.xsd | 3044f18d2e984910c7670e3357724c2f5798d64cc4ab5919094389a3f01bce02 |
| tissAssinaturaDigital_v1.01.xsd | 8567690a0eb05b9681fdc575ca7c867f75bf5cb33573175b8d333617ef035221 |
| xmldsig-core-schema.xsd | b6388292d746c6cc8f932ce3b6bf7c7fc0bf6cba58ec385b38988887bcf5fdbb |

Licença: a ANS não publica licença no pacote. O padrão TISS é ato normativo
da ANS (RN 501/2022 e alterações), de uso obrigatório por operadoras e
prestadores; texto de ato oficial não tem proteção autoral (Lei 9.610/98,
art. 8º, IV). Guardamos os arquivos só para validar o XML gerado.

Quando o gov.br abrir no ambiente: baixe o zip, confira o SHA-256 acima e,
se a ANS publicar versão nova, guarde em pasta nova (`4.0x.00/`).
