// ============================================================
// GERADO por frontend/scripts/sync-instrument-mirror.mjs a partir de
// frontend/src/data/clinicalInstruments.js. Não edite à mão: mude a
// fonte e rode o script. Só o que a Edge Function usa para montar as
// perguntas e calcular a nota (tests/regression/patient-instruments).
// ============================================================

import type { Instrument } from './instrumentScoring.ts';

export type ServerInstrument = Instrument & {
  shortName: string;
  name: string;
  instructions: string;
};

export const CLINICAL_INSTRUMENTS: ServerInstrument[] = [
  {
    "id": "phq9",
    "version": 1,
    "shortName": "PHQ-9",
    "name": "Questionário sobre a Saúde do Paciente (PHQ-9)",
    "instructions": "Durante as últimas 2 semanas, com que frequência você foi incomodado(a) por qualquer um dos problemas abaixo?",
    "items": [
      {
        "id": "q1",
        "text": "Pouco interesse ou pouco prazer em fazer as coisas.",
        "options": [
          {
            "value": 0,
            "label": "Nenhuma vez"
          },
          {
            "value": 1,
            "label": "Vários dias"
          },
          {
            "value": 2,
            "label": "Mais da metade dos dias"
          },
          {
            "value": 3,
            "label": "Quase todos os dias"
          }
        ]
      },
      {
        "id": "q2",
        "text": "Se sentir “para baixo”, deprimido(a) ou sem perspectiva.",
        "options": [
          {
            "value": 0,
            "label": "Nenhuma vez"
          },
          {
            "value": 1,
            "label": "Vários dias"
          },
          {
            "value": 2,
            "label": "Mais da metade dos dias"
          },
          {
            "value": 3,
            "label": "Quase todos os dias"
          }
        ]
      },
      {
        "id": "q3",
        "text": "Dificuldade para pegar no sono ou permanecer dormindo, ou dormir mais do que de costume.",
        "options": [
          {
            "value": 0,
            "label": "Nenhuma vez"
          },
          {
            "value": 1,
            "label": "Vários dias"
          },
          {
            "value": 2,
            "label": "Mais da metade dos dias"
          },
          {
            "value": 3,
            "label": "Quase todos os dias"
          }
        ]
      },
      {
        "id": "q4",
        "text": "Se sentir cansado(a) ou com pouca energia.",
        "options": [
          {
            "value": 0,
            "label": "Nenhuma vez"
          },
          {
            "value": 1,
            "label": "Vários dias"
          },
          {
            "value": 2,
            "label": "Mais da metade dos dias"
          },
          {
            "value": 3,
            "label": "Quase todos os dias"
          }
        ]
      },
      {
        "id": "q5",
        "text": "Falta de apetite ou comendo demais.",
        "options": [
          {
            "value": 0,
            "label": "Nenhuma vez"
          },
          {
            "value": 1,
            "label": "Vários dias"
          },
          {
            "value": 2,
            "label": "Mais da metade dos dias"
          },
          {
            "value": 3,
            "label": "Quase todos os dias"
          }
        ]
      },
      {
        "id": "q6",
        "text": "Se sentir mal consigo mesmo(a), ou achar que você é um fracasso ou que decepcionou sua família ou você mesmo(a).",
        "options": [
          {
            "value": 0,
            "label": "Nenhuma vez"
          },
          {
            "value": 1,
            "label": "Vários dias"
          },
          {
            "value": 2,
            "label": "Mais da metade dos dias"
          },
          {
            "value": 3,
            "label": "Quase todos os dias"
          }
        ]
      },
      {
        "id": "q7",
        "text": "Dificuldade para se concentrar nas coisas, como ler o jornal ou ver televisão.",
        "options": [
          {
            "value": 0,
            "label": "Nenhuma vez"
          },
          {
            "value": 1,
            "label": "Vários dias"
          },
          {
            "value": 2,
            "label": "Mais da metade dos dias"
          },
          {
            "value": 3,
            "label": "Quase todos os dias"
          }
        ]
      },
      {
        "id": "q8",
        "text": "Lentidão para se movimentar ou falar, a ponto das outras pessoas perceberem. Ou o oposto: estar tão agitado(a) ou inquieto(a) que você fica andando de um lado para o outro muito mais do que de costume.",
        "options": [
          {
            "value": 0,
            "label": "Nenhuma vez"
          },
          {
            "value": 1,
            "label": "Vários dias"
          },
          {
            "value": 2,
            "label": "Mais da metade dos dias"
          },
          {
            "value": 3,
            "label": "Quase todos os dias"
          }
        ]
      },
      {
        "id": "q9",
        "text": "Pensar em se ferir de alguma maneira ou que seria melhor estar morto(a).",
        "options": [
          {
            "value": 0,
            "label": "Nenhuma vez"
          },
          {
            "value": 1,
            "label": "Vários dias"
          },
          {
            "value": 2,
            "label": "Mais da metade dos dias"
          },
          {
            "value": 3,
            "label": "Quase todos os dias"
          }
        ],
        "risk": {
          "fromValue": 1,
          "message": "Resposta positiva no item 9 (pensamentos de morte ou de se ferir). Avalie o risco ainda neste atendimento.",
          "homeMessage": "Resposta positiva no item 9 (pensamentos de morte ou de se ferir), marcada pelo paciente em casa. Entre em contato com o paciente o quanto antes para avaliar o risco."
        }
      }
    ],
    "extraItems": [
      {
        "id": "dificuldade",
        "text": "Se você assinalou qualquer um dos problemas, indique o grau de dificuldade que os mesmos lhe causaram para realizar seu trabalho, tomar conta das coisas em casa ou para se relacionar com as pessoas.",
        "options": [
          {
            "value": 0,
            "label": "Nenhuma dificuldade"
          },
          {
            "value": 1,
            "label": "Alguma dificuldade"
          },
          {
            "value": 2,
            "label": "Muita dificuldade"
          },
          {
            "value": 3,
            "label": "Extrema dificuldade"
          }
        ],
        "showWhen": "anyPositive"
      }
    ],
    "scoring": {
      "method": "sum",
      "min": 0,
      "max": 27
    },
    "bands": [
      {
        "id": "minima",
        "label": "Mínima",
        "min": 0,
        "max": 4
      },
      {
        "id": "leve",
        "label": "Leve",
        "min": 5,
        "max": 9
      },
      {
        "id": "moderada",
        "label": "Moderada",
        "min": 10,
        "max": 14
      },
      {
        "id": "moderadamente_grave",
        "label": "Moderadamente grave",
        "min": 15,
        "max": 19
      },
      {
        "id": "grave",
        "label": "Grave",
        "min": 20,
        "max": 27
      }
    ]
  },
  {
    "id": "gad7",
    "version": 1,
    "shortName": "GAD-7",
    "name": "Escala de Transtorno de Ansiedade Generalizada (GAD-7)",
    "instructions": "Durante as últimas 2 semanas, com que frequência você foi incomodado(a) pelos problemas abaixo?",
    "items": [
      {
        "id": "q1",
        "text": "Sentir-se nervoso(a), ansioso(a) ou muito tenso(a).",
        "options": [
          {
            "value": 0,
            "label": "Nenhuma vez"
          },
          {
            "value": 1,
            "label": "Vários dias"
          },
          {
            "value": 2,
            "label": "Mais da metade dos dias"
          },
          {
            "value": 3,
            "label": "Quase todos os dias"
          }
        ]
      },
      {
        "id": "q2",
        "text": "Não ser capaz de impedir ou de controlar as preocupações.",
        "options": [
          {
            "value": 0,
            "label": "Nenhuma vez"
          },
          {
            "value": 1,
            "label": "Vários dias"
          },
          {
            "value": 2,
            "label": "Mais da metade dos dias"
          },
          {
            "value": 3,
            "label": "Quase todos os dias"
          }
        ]
      },
      {
        "id": "q3",
        "text": "Preocupar-se muito com diversas coisas.",
        "options": [
          {
            "value": 0,
            "label": "Nenhuma vez"
          },
          {
            "value": 1,
            "label": "Vários dias"
          },
          {
            "value": 2,
            "label": "Mais da metade dos dias"
          },
          {
            "value": 3,
            "label": "Quase todos os dias"
          }
        ]
      },
      {
        "id": "q4",
        "text": "Dificuldade para relaxar.",
        "options": [
          {
            "value": 0,
            "label": "Nenhuma vez"
          },
          {
            "value": 1,
            "label": "Vários dias"
          },
          {
            "value": 2,
            "label": "Mais da metade dos dias"
          },
          {
            "value": 3,
            "label": "Quase todos os dias"
          }
        ]
      },
      {
        "id": "q5",
        "text": "Ficar tão agitado(a) que se torna difícil permanecer sentado(a).",
        "options": [
          {
            "value": 0,
            "label": "Nenhuma vez"
          },
          {
            "value": 1,
            "label": "Vários dias"
          },
          {
            "value": 2,
            "label": "Mais da metade dos dias"
          },
          {
            "value": 3,
            "label": "Quase todos os dias"
          }
        ]
      },
      {
        "id": "q6",
        "text": "Ficar facilmente aborrecido(a) ou irritado(a).",
        "options": [
          {
            "value": 0,
            "label": "Nenhuma vez"
          },
          {
            "value": 1,
            "label": "Vários dias"
          },
          {
            "value": 2,
            "label": "Mais da metade dos dias"
          },
          {
            "value": 3,
            "label": "Quase todos os dias"
          }
        ]
      },
      {
        "id": "q7",
        "text": "Sentir medo como se algo horrível fosse acontecer.",
        "options": [
          {
            "value": 0,
            "label": "Nenhuma vez"
          },
          {
            "value": 1,
            "label": "Vários dias"
          },
          {
            "value": 2,
            "label": "Mais da metade dos dias"
          },
          {
            "value": 3,
            "label": "Quase todos os dias"
          }
        ]
      }
    ],
    "extraItems": [
      {
        "id": "dificuldade",
        "text": "Se você assinalou qualquer um dos problemas, indique o grau de dificuldade que os mesmos lhe causaram para realizar seu trabalho, tomar conta das coisas em casa ou para se relacionar com as pessoas.",
        "options": [
          {
            "value": 0,
            "label": "Nenhuma dificuldade"
          },
          {
            "value": 1,
            "label": "Alguma dificuldade"
          },
          {
            "value": 2,
            "label": "Muita dificuldade"
          },
          {
            "value": 3,
            "label": "Extrema dificuldade"
          }
        ],
        "showWhen": "anyPositive"
      }
    ],
    "scoring": {
      "method": "sum",
      "min": 0,
      "max": 21
    },
    "bands": [
      {
        "id": "minima",
        "label": "Mínima",
        "min": 0,
        "max": 4
      },
      {
        "id": "leve",
        "label": "Leve",
        "min": 5,
        "max": 9
      },
      {
        "id": "moderada",
        "label": "Moderada",
        "min": 10,
        "max": 14
      },
      {
        "id": "grave",
        "label": "Grave",
        "min": 15,
        "max": 21
      }
    ]
  }
];

/** Versões antigas: chave `${id}@${version}`. */
export const INSTRUMENT_HISTORY: Record<string, ServerInstrument> = {};

/** A versão exata da aplicação; null se não existir (o servidor não adivinha). */
export function getServerInstrument(id: string, version: number): ServerInstrument | null {
  const current = CLINICAL_INSTRUMENTS.find(item => item.id === id) || null;
  if (current && current.version === Number(version)) return current;
  return INSTRUMENT_HISTORY[`${id}@${version}`] || null;
}
