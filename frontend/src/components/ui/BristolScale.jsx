import { useState } from 'react';

// Escala de Bristol (forma das fezes) — referência clínica padrão, os
// mesmos 7 tipos usados no checklist "fezes" (checklists.js) e citados
// nas anamneses de Acupuntura/MTC e Fisioterapia pélvica.
const BRISTOL_TYPES = [
  { tipo: 1, desc: 'Fezes "em bolinha", duras e separadas. É preciso fazer força para as fezes passarem.' },
  { tipo: 2, desc: 'Fezes moldadas, mas duras e com bolas agrupadas que podem se soltar. É preciso fazer força para as fezes passarem.' },
  { tipo: 3, desc: 'Fezes moldadas, em forma de salsicha e com algumas rachaduras na superfície.' },
  { tipo: 4, desc: 'Fezes moldadas, compridas, em forma de salsicha e com superfície lisa. Fáceis de evacuar.' },
  { tipo: 5, desc: 'Fezes não moldadas, em pedaços, e moles. Fáceis de evacuar.' },
  { tipo: 6, desc: 'Fezes pastosas ou semi-líquidas, com alguns pedaços moles misturados.' },
  { tipo: 7, desc: 'Fezes líquidas, sem pedaços sólidos.' },
];

function BristolIcon({ tipo }) {
  const fill = '#8a5a34';
  const shade = '#6e4527';
  switch (tipo) {
    case 1:
      return (
        <svg viewBox="0 0 60 36" width="48" height="30">
          {[8, 20, 32, 44, 52].map((cx, i) => (
            <circle key={i} cx={cx} cy={i % 2 === 0 ? 20 : 14} r="6" fill={fill} stroke={shade} strokeWidth="0.5" />
          ))}
        </svg>
      );
    case 2:
      return (
        <svg viewBox="0 0 60 36" width="48" height="30">
          <ellipse cx="30" cy="20" rx="22" ry="10" fill={fill} stroke={shade} strokeWidth="0.5" />
          {[14, 26, 38, 48].map((cx, i) => (
            <circle key={i} cx={cx} cy={14 + (i % 2) * 4} r="5" fill={shade} opacity="0.35" />
          ))}
        </svg>
      );
    case 3:
      return (
        <svg viewBox="0 0 60 36" width="48" height="30">
          <rect x="8" y="14" width="44" height="12" rx="6" fill={fill} stroke={shade} strokeWidth="0.5" />
          <path d="M16 15 L19 25 M26 14 L23 26 M36 15 L39 25 M46 14 L43 26" stroke={shade} strokeWidth="1" opacity="0.5" />
        </svg>
      );
    case 4:
      return (
        <svg viewBox="0 0 60 36" width="48" height="30">
          <rect x="6" y="15" width="48" height="10" rx="5" fill={fill} stroke={shade} strokeWidth="0.5" />
        </svg>
      );
    case 5:
      return (
        <svg viewBox="0 0 60 36" width="48" height="30">
          {[[10, 18], [24, 22], [38, 16], [50, 20]].map(([cx, cy], i) => (
            <ellipse key={i} cx={cx} cy={cy} rx="8" ry="6" fill={fill} stroke={shade} strokeWidth="0.5" />
          ))}
        </svg>
      );
    case 6:
      return (
        <svg viewBox="0 0 60 36" width="48" height="30">
          <path
            d="M8 22 Q10 12 18 15 Q22 8 30 13 Q38 7 44 14 Q52 12 52 20 Q52 27 44 26 Q36 30 28 26 Q18 29 12 25 Q6 26 8 22 Z"
            fill={fill}
            stroke={shade}
            strokeWidth="0.5"
          />
        </svg>
      );
    case 7:
    default:
      return (
        <svg viewBox="0 0 60 36" width="48" height="30">
          <path
            d="M6 24 Q10 18 18 22 Q24 16 32 21 Q40 15 46 21 Q54 19 54 25 Q54 30 44 29 Q34 32 24 29 Q14 31 6 27 Z"
            fill={fill}
            opacity="0.85"
            stroke={shade}
            strokeWidth="0.5"
          />
        </svg>
      );
  }
}

// Cartão de referência recolhível com a Escala de Bristol completa.
// Usado ao lado de campos/checklists que perguntam sobre forma das
// fezes — não é um campo de resposta, é material de apoio à escuta.
export function BristolScale({ defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="box bristol-scale">
      <div className="psi-risk-card-head">
        <b className="small">Escala de Bristol (forma das fezes)</b>
        <button type="button" className="psi-risk-toggle" onClick={() => setOpen(v => !v)}>
          {open ? 'Ocultar escala' : 'Ver escala'}
        </button>
      </div>
      {open && (
        <div className="bristol-scale-grid">
          {BRISTOL_TYPES.map(({ tipo, desc }) => (
            <div key={tipo} className="bristol-scale-item">
              <div className="bristol-scale-icon"><BristolIcon tipo={tipo} /></div>
              <div>
                <b className="small">Tipo {tipo}</b>
                <p className="small">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
