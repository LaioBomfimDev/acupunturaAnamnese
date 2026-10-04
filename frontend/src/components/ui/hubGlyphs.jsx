// Ícones das ferramentas do hub (traço de 24px, sem cor própria: herdam
// currentColor). Moram aqui porque duas telas desenham os mesmos
// destinos: o menu da tela inicial (HomeConsole) e a barra de baixo do
// celular (HubNav). Desenho igual nos dois lugares ensina que é o mesmo
// lugar.
export const TOOL_GLYPHS = {
  inicio: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M9 21v-6h6v6" />
    </>
  ),
  agenda: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
      <path d="M8 14h2M8 17h2M14 14h2M14 17h2" />
    </>
  ),
  evolucao: (
    <>
      <path d="m3 17 6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </>
  ),
  gestao: (
    <>
      <path d="M4 19h16" />
      <rect x="6" y="11" width="3" height="8" />
      <rect x="11" y="6" width="3" height="13" />
      <rect x="16" y="14" width="3" height="5" />
    </>
  ),
  pacientes: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M16 9.5a3 3 0 1 0 0-6" />
      <path d="M15 14.5c2.8.4 4.8 1.9 5.5 4" />
    </>
  ),
  documentos: (
    <>
      <path d="M12 3v10" />
      <path d="m8 9 4 4 4-4" />
      <path d="M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
    </>
  ),
  cake: (
    <>
      <path d="M4 21v-7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7" />
      <path d="M4 17c1.2.8 2.2.8 3.4 0 1.2-.8 2.2-.8 3.4 0 1.2.8 2.2.8 3.4 0 1.2-.8 2.2-.8 3.4 0" />
      <path d="M9 12V8M12 12V8M15 12V8" />
      <path d="M9 5.5c0-1 .5-1.5.5-2.5M12 5.5c0-1 .5-1.5.5-2.5M15 5.5c0-1 .5-1.5.5-2.5" />
    </>
  ),
  returns: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v4h4" />
    </>
  ),
};
