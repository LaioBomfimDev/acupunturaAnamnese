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
    "id": "phq8",
    "version": 1,
    "shortName": "PHQ-8",
    "name": "Questionário sobre a Saúde do Paciente, 8 perguntas (PHQ-8)",
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
      "max": 24
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
        "max": 24
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
  },
  {
    "id": "phq4",
    "version": 1,
    "shortName": "PHQ-4",
    "name": "Questionário de Saúde do Paciente para ansiedade e depressão (PHQ-4)",
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
        "id": "q4",
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
      }
    ],
    "extraItems": [],
    "scoring": {
      "method": "subscales",
      "multiplier": 1,
      "subscales": [
        {
          "id": "ansiedade",
          "label": "Ansiedade (GAD-2)",
          "short": "A",
          "items": [
            "q1",
            "q2"
          ],
          "min": 0,
          "max": 6,
          "bands": [
            {
              "id": "abaixo_corte",
              "label": "Abaixo do ponto de corte",
              "min": 0,
              "max": 2
            },
            {
              "id": "corte_ou_acima",
              "label": "No ponto de corte ou acima",
              "min": 3,
              "max": 6
            }
          ]
        },
        {
          "id": "depressao",
          "label": "Depressão (PHQ-2)",
          "short": "D",
          "items": [
            "q3",
            "q4"
          ],
          "min": 0,
          "max": 6,
          "bands": [
            {
              "id": "abaixo_corte",
              "label": "Abaixo do ponto de corte",
              "min": 0,
              "max": 2
            },
            {
              "id": "corte_ou_acima",
              "label": "No ponto de corte ou acima",
              "min": 3,
              "max": 6
            }
          ]
        }
      ]
    },
    "bands": []
  },
  {
    "id": "dass21",
    "version": 1,
    "shortName": "DASS-21",
    "name": "Escala de Depressão, Ansiedade e Estresse (DASS-21)",
    "instructions": "Por favor, leia cuidadosamente cada uma das afirmações abaixo e marque a opção que indique o quanto ela se aplicou a você durante a última semana.",
    "items": [
      {
        "id": "q1",
        "text": "Achei difícil me acalmar",
        "options": [
          {
            "value": 0,
            "label": "Não se aplicou de maneira alguma"
          },
          {
            "value": 1,
            "label": "Aplicou-se em algum grau, ou por pouco de tempo"
          },
          {
            "value": 2,
            "label": "Aplicou-se em um grau considerável, ou por uma boa parte do tempo"
          },
          {
            "value": 3,
            "label": "Aplicou-se muito, ou na maioria do tempo"
          }
        ]
      },
      {
        "id": "q2",
        "text": "Senti minha boca seca",
        "options": [
          {
            "value": 0,
            "label": "Não se aplicou de maneira alguma"
          },
          {
            "value": 1,
            "label": "Aplicou-se em algum grau, ou por pouco de tempo"
          },
          {
            "value": 2,
            "label": "Aplicou-se em um grau considerável, ou por uma boa parte do tempo"
          },
          {
            "value": 3,
            "label": "Aplicou-se muito, ou na maioria do tempo"
          }
        ]
      },
      {
        "id": "q3",
        "text": "Não consegui vivenciar nenhum sentimento positivo",
        "options": [
          {
            "value": 0,
            "label": "Não se aplicou de maneira alguma"
          },
          {
            "value": 1,
            "label": "Aplicou-se em algum grau, ou por pouco de tempo"
          },
          {
            "value": 2,
            "label": "Aplicou-se em um grau considerável, ou por uma boa parte do tempo"
          },
          {
            "value": 3,
            "label": "Aplicou-se muito, ou na maioria do tempo"
          }
        ]
      },
      {
        "id": "q4",
        "text": "Tive dificuldade em respirar em alguns momentos (ex. respiração ofegante, falta de ar, sem ter feito nenhum esforço físico)",
        "options": [
          {
            "value": 0,
            "label": "Não se aplicou de maneira alguma"
          },
          {
            "value": 1,
            "label": "Aplicou-se em algum grau, ou por pouco de tempo"
          },
          {
            "value": 2,
            "label": "Aplicou-se em um grau considerável, ou por uma boa parte do tempo"
          },
          {
            "value": 3,
            "label": "Aplicou-se muito, ou na maioria do tempo"
          }
        ]
      },
      {
        "id": "q5",
        "text": "Achei difícil ter iniciativa para fazer as coisas",
        "options": [
          {
            "value": 0,
            "label": "Não se aplicou de maneira alguma"
          },
          {
            "value": 1,
            "label": "Aplicou-se em algum grau, ou por pouco de tempo"
          },
          {
            "value": 2,
            "label": "Aplicou-se em um grau considerável, ou por uma boa parte do tempo"
          },
          {
            "value": 3,
            "label": "Aplicou-se muito, ou na maioria do tempo"
          }
        ]
      },
      {
        "id": "q6",
        "text": "Tive a tendência de reagir de forma exagerada às situações",
        "options": [
          {
            "value": 0,
            "label": "Não se aplicou de maneira alguma"
          },
          {
            "value": 1,
            "label": "Aplicou-se em algum grau, ou por pouco de tempo"
          },
          {
            "value": 2,
            "label": "Aplicou-se em um grau considerável, ou por uma boa parte do tempo"
          },
          {
            "value": 3,
            "label": "Aplicou-se muito, ou na maioria do tempo"
          }
        ]
      },
      {
        "id": "q7",
        "text": "Senti tremores (ex. nas mãos)",
        "options": [
          {
            "value": 0,
            "label": "Não se aplicou de maneira alguma"
          },
          {
            "value": 1,
            "label": "Aplicou-se em algum grau, ou por pouco de tempo"
          },
          {
            "value": 2,
            "label": "Aplicou-se em um grau considerável, ou por uma boa parte do tempo"
          },
          {
            "value": 3,
            "label": "Aplicou-se muito, ou na maioria do tempo"
          }
        ]
      },
      {
        "id": "q8",
        "text": "Senti que estava sempre nervoso",
        "options": [
          {
            "value": 0,
            "label": "Não se aplicou de maneira alguma"
          },
          {
            "value": 1,
            "label": "Aplicou-se em algum grau, ou por pouco de tempo"
          },
          {
            "value": 2,
            "label": "Aplicou-se em um grau considerável, ou por uma boa parte do tempo"
          },
          {
            "value": 3,
            "label": "Aplicou-se muito, ou na maioria do tempo"
          }
        ]
      },
      {
        "id": "q9",
        "text": "Preocupei-me com situações em que eu pudesse entrar em pânico e parecesse ridículo (a)",
        "options": [
          {
            "value": 0,
            "label": "Não se aplicou de maneira alguma"
          },
          {
            "value": 1,
            "label": "Aplicou-se em algum grau, ou por pouco de tempo"
          },
          {
            "value": 2,
            "label": "Aplicou-se em um grau considerável, ou por uma boa parte do tempo"
          },
          {
            "value": 3,
            "label": "Aplicou-se muito, ou na maioria do tempo"
          }
        ]
      },
      {
        "id": "q10",
        "text": "Senti que não tinha nada a desejar",
        "options": [
          {
            "value": 0,
            "label": "Não se aplicou de maneira alguma"
          },
          {
            "value": 1,
            "label": "Aplicou-se em algum grau, ou por pouco de tempo"
          },
          {
            "value": 2,
            "label": "Aplicou-se em um grau considerável, ou por uma boa parte do tempo"
          },
          {
            "value": 3,
            "label": "Aplicou-se muito, ou na maioria do tempo"
          }
        ]
      },
      {
        "id": "q11",
        "text": "Senti-me agitado",
        "options": [
          {
            "value": 0,
            "label": "Não se aplicou de maneira alguma"
          },
          {
            "value": 1,
            "label": "Aplicou-se em algum grau, ou por pouco de tempo"
          },
          {
            "value": 2,
            "label": "Aplicou-se em um grau considerável, ou por uma boa parte do tempo"
          },
          {
            "value": 3,
            "label": "Aplicou-se muito, ou na maioria do tempo"
          }
        ]
      },
      {
        "id": "q12",
        "text": "Achei difícil relaxar",
        "options": [
          {
            "value": 0,
            "label": "Não se aplicou de maneira alguma"
          },
          {
            "value": 1,
            "label": "Aplicou-se em algum grau, ou por pouco de tempo"
          },
          {
            "value": 2,
            "label": "Aplicou-se em um grau considerável, ou por uma boa parte do tempo"
          },
          {
            "value": 3,
            "label": "Aplicou-se muito, ou na maioria do tempo"
          }
        ]
      },
      {
        "id": "q13",
        "text": "Senti-me depressivo (a) e sem ânimo",
        "options": [
          {
            "value": 0,
            "label": "Não se aplicou de maneira alguma"
          },
          {
            "value": 1,
            "label": "Aplicou-se em algum grau, ou por pouco de tempo"
          },
          {
            "value": 2,
            "label": "Aplicou-se em um grau considerável, ou por uma boa parte do tempo"
          },
          {
            "value": 3,
            "label": "Aplicou-se muito, ou na maioria do tempo"
          }
        ]
      },
      {
        "id": "q14",
        "text": "Fui intolerante com as coisas que me impediam de continuar o que eu estava fazendo",
        "options": [
          {
            "value": 0,
            "label": "Não se aplicou de maneira alguma"
          },
          {
            "value": 1,
            "label": "Aplicou-se em algum grau, ou por pouco de tempo"
          },
          {
            "value": 2,
            "label": "Aplicou-se em um grau considerável, ou por uma boa parte do tempo"
          },
          {
            "value": 3,
            "label": "Aplicou-se muito, ou na maioria do tempo"
          }
        ]
      },
      {
        "id": "q15",
        "text": "Senti que ia entrar em pânico",
        "options": [
          {
            "value": 0,
            "label": "Não se aplicou de maneira alguma"
          },
          {
            "value": 1,
            "label": "Aplicou-se em algum grau, ou por pouco de tempo"
          },
          {
            "value": 2,
            "label": "Aplicou-se em um grau considerável, ou por uma boa parte do tempo"
          },
          {
            "value": 3,
            "label": "Aplicou-se muito, ou na maioria do tempo"
          }
        ]
      },
      {
        "id": "q16",
        "text": "Não consegui me entusiasmar com nada",
        "options": [
          {
            "value": 0,
            "label": "Não se aplicou de maneira alguma"
          },
          {
            "value": 1,
            "label": "Aplicou-se em algum grau, ou por pouco de tempo"
          },
          {
            "value": 2,
            "label": "Aplicou-se em um grau considerável, ou por uma boa parte do tempo"
          },
          {
            "value": 3,
            "label": "Aplicou-se muito, ou na maioria do tempo"
          }
        ]
      },
      {
        "id": "q17",
        "text": "Senti que não tinha valor como pessoa",
        "options": [
          {
            "value": 0,
            "label": "Não se aplicou de maneira alguma"
          },
          {
            "value": 1,
            "label": "Aplicou-se em algum grau, ou por pouco de tempo"
          },
          {
            "value": 2,
            "label": "Aplicou-se em um grau considerável, ou por uma boa parte do tempo"
          },
          {
            "value": 3,
            "label": "Aplicou-se muito, ou na maioria do tempo"
          }
        ]
      },
      {
        "id": "q18",
        "text": "Senti que estava um pouco emotivo/sensível demais",
        "options": [
          {
            "value": 0,
            "label": "Não se aplicou de maneira alguma"
          },
          {
            "value": 1,
            "label": "Aplicou-se em algum grau, ou por pouco de tempo"
          },
          {
            "value": 2,
            "label": "Aplicou-se em um grau considerável, ou por uma boa parte do tempo"
          },
          {
            "value": 3,
            "label": "Aplicou-se muito, ou na maioria do tempo"
          }
        ]
      },
      {
        "id": "q19",
        "text": "Sabia que meu coração estava alterado mesmo não tendo feito nenhum esforço físico (ex. aumento da frequência cardíaca, disritmia cardíaca)",
        "options": [
          {
            "value": 0,
            "label": "Não se aplicou de maneira alguma"
          },
          {
            "value": 1,
            "label": "Aplicou-se em algum grau, ou por pouco de tempo"
          },
          {
            "value": 2,
            "label": "Aplicou-se em um grau considerável, ou por uma boa parte do tempo"
          },
          {
            "value": 3,
            "label": "Aplicou-se muito, ou na maioria do tempo"
          }
        ]
      },
      {
        "id": "q20",
        "text": "Senti medo sem motivo",
        "options": [
          {
            "value": 0,
            "label": "Não se aplicou de maneira alguma"
          },
          {
            "value": 1,
            "label": "Aplicou-se em algum grau, ou por pouco de tempo"
          },
          {
            "value": 2,
            "label": "Aplicou-se em um grau considerável, ou por uma boa parte do tempo"
          },
          {
            "value": 3,
            "label": "Aplicou-se muito, ou na maioria do tempo"
          }
        ]
      },
      {
        "id": "q21",
        "text": "Senti que a vida não tinha sentido",
        "options": [
          {
            "value": 0,
            "label": "Não se aplicou de maneira alguma"
          },
          {
            "value": 1,
            "label": "Aplicou-se em algum grau, ou por pouco de tempo"
          },
          {
            "value": 2,
            "label": "Aplicou-se em um grau considerável, ou por uma boa parte do tempo"
          },
          {
            "value": 3,
            "label": "Aplicou-se muito, ou na maioria do tempo"
          }
        ]
      }
    ],
    "extraItems": [],
    "scoring": {
      "method": "subscales",
      "multiplier": 2,
      "subscales": [
        {
          "id": "depressao",
          "label": "Depressão",
          "short": "D",
          "items": [
            "q3",
            "q5",
            "q10",
            "q13",
            "q16",
            "q17",
            "q21"
          ],
          "min": 0,
          "max": 42,
          "bands": [
            {
              "id": "normal",
              "label": "Normal",
              "min": 0,
              "max": 9
            },
            {
              "id": "leve",
              "label": "Leve",
              "min": 10,
              "max": 13
            },
            {
              "id": "moderada",
              "label": "Moderada",
              "min": 14,
              "max": 20
            },
            {
              "id": "grave",
              "label": "Grave",
              "min": 21,
              "max": 27
            },
            {
              "id": "extremamente_grave",
              "label": "Extremamente grave",
              "min": 28,
              "max": 42
            }
          ]
        },
        {
          "id": "ansiedade",
          "label": "Ansiedade",
          "short": "A",
          "items": [
            "q2",
            "q4",
            "q7",
            "q9",
            "q15",
            "q19",
            "q20"
          ],
          "min": 0,
          "max": 42,
          "bands": [
            {
              "id": "normal",
              "label": "Normal",
              "min": 0,
              "max": 7
            },
            {
              "id": "leve",
              "label": "Leve",
              "min": 8,
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
              "max": 19
            },
            {
              "id": "extremamente_grave",
              "label": "Extremamente grave",
              "min": 20,
              "max": 42
            }
          ]
        },
        {
          "id": "estresse",
          "label": "Estresse",
          "short": "E",
          "items": [
            "q1",
            "q6",
            "q8",
            "q11",
            "q12",
            "q14",
            "q18"
          ],
          "min": 0,
          "max": 42,
          "bands": [
            {
              "id": "normal",
              "label": "Normal",
              "min": 0,
              "max": 14
            },
            {
              "id": "leve",
              "label": "Leve",
              "min": 15,
              "max": 18
            },
            {
              "id": "moderada",
              "label": "Moderada",
              "min": 19,
              "max": 25
            },
            {
              "id": "grave",
              "label": "Grave",
              "min": 26,
              "max": 33
            },
            {
              "id": "extremamente_grave",
              "label": "Extremamente grave",
              "min": 34,
              "max": 42
            }
          ]
        }
      ]
    },
    "bands": []
  },
  {
    "id": "k10",
    "version": 1,
    "shortName": "K10",
    "name": "Escala de Sofrimento Psíquico de Kessler (K10)",
    "instructions": "As questões seguintes perguntam sobre como você tem se sentido durante os últimos 30 dias. Para cada questão, por favor, marque a opção que melhor descreve com que frequência você se sentiu assim. Durante os últimos 30 dias, com que frequência você se sentiu...",
    "items": [
      {
        "id": "q1",
        "text": "...exausto (a) sem um bom motivo?",
        "options": [
          {
            "value": 5,
            "label": "O tempo todo"
          },
          {
            "value": 4,
            "label": "A maior parte do tempo"
          },
          {
            "value": 3,
            "label": "Parte do tempo"
          },
          {
            "value": 2,
            "label": "Um pouco"
          },
          {
            "value": 1,
            "label": "Nunca"
          }
        ]
      },
      {
        "id": "q2",
        "text": "...nervoso (a)?",
        "options": [
          {
            "value": 5,
            "label": "O tempo todo"
          },
          {
            "value": 4,
            "label": "A maior parte do tempo"
          },
          {
            "value": 3,
            "label": "Parte do tempo"
          },
          {
            "value": 2,
            "label": "Um pouco"
          },
          {
            "value": 1,
            "label": "Nunca"
          }
        ]
      },
      {
        "id": "q3",
        "text": "...tão nervoso (a) que nada podia acalmá-lo (a)?",
        "options": [
          {
            "value": 5,
            "label": "O tempo todo"
          },
          {
            "value": 4,
            "label": "A maior parte do tempo"
          },
          {
            "value": 3,
            "label": "Parte do tempo"
          },
          {
            "value": 2,
            "label": "Um pouco"
          },
          {
            "value": 1,
            "label": "Nunca"
          }
        ]
      },
      {
        "id": "q4",
        "text": "...sem esperança?",
        "options": [
          {
            "value": 5,
            "label": "O tempo todo"
          },
          {
            "value": 4,
            "label": "A maior parte do tempo"
          },
          {
            "value": 3,
            "label": "Parte do tempo"
          },
          {
            "value": 2,
            "label": "Um pouco"
          },
          {
            "value": 1,
            "label": "Nunca"
          }
        ]
      },
      {
        "id": "q5",
        "text": "...inquieto (a) ou agitado (a)?",
        "options": [
          {
            "value": 5,
            "label": "O tempo todo"
          },
          {
            "value": 4,
            "label": "A maior parte do tempo"
          },
          {
            "value": 3,
            "label": "Parte do tempo"
          },
          {
            "value": 2,
            "label": "Um pouco"
          },
          {
            "value": 1,
            "label": "Nunca"
          }
        ]
      },
      {
        "id": "q6",
        "text": "...tão inquieto (a) que você não conseguia ficar parado (a)?",
        "options": [
          {
            "value": 5,
            "label": "O tempo todo"
          },
          {
            "value": 4,
            "label": "A maior parte do tempo"
          },
          {
            "value": 3,
            "label": "Parte do tempo"
          },
          {
            "value": 2,
            "label": "Um pouco"
          },
          {
            "value": 1,
            "label": "Nunca"
          }
        ]
      },
      {
        "id": "q7",
        "text": "...deprimido (a)?",
        "options": [
          {
            "value": 5,
            "label": "O tempo todo"
          },
          {
            "value": 4,
            "label": "A maior parte do tempo"
          },
          {
            "value": 3,
            "label": "Parte do tempo"
          },
          {
            "value": 2,
            "label": "Um pouco"
          },
          {
            "value": 1,
            "label": "Nunca"
          }
        ]
      },
      {
        "id": "q8",
        "text": "...tão deprimido (a) que nada conseguia animá-lo (a)?",
        "options": [
          {
            "value": 5,
            "label": "O tempo todo"
          },
          {
            "value": 4,
            "label": "A maior parte do tempo"
          },
          {
            "value": 3,
            "label": "Parte do tempo"
          },
          {
            "value": 2,
            "label": "Um pouco"
          },
          {
            "value": 1,
            "label": "Nunca"
          }
        ]
      },
      {
        "id": "q9",
        "text": "Durante os últimos 30 dias, com que frequência você sentiu que tudo era um esforço?",
        "options": [
          {
            "value": 5,
            "label": "O tempo todo"
          },
          {
            "value": 4,
            "label": "A maior parte do tempo"
          },
          {
            "value": 3,
            "label": "Parte do tempo"
          },
          {
            "value": 2,
            "label": "Um pouco"
          },
          {
            "value": 1,
            "label": "Nunca"
          }
        ]
      },
      {
        "id": "q10",
        "text": "...sem valor?",
        "options": [
          {
            "value": 5,
            "label": "O tempo todo"
          },
          {
            "value": 4,
            "label": "A maior parte do tempo"
          },
          {
            "value": 3,
            "label": "Parte do tempo"
          },
          {
            "value": 2,
            "label": "Um pouco"
          },
          {
            "value": 1,
            "label": "Nunca"
          }
        ]
      }
    ],
    "extraItems": [],
    "scoring": {
      "method": "sum",
      "min": 10,
      "max": 50
    },
    "bands": [
      {
        "id": "baixo",
        "label": "Baixo",
        "min": 10,
        "max": 15
      },
      {
        "id": "moderado",
        "label": "Moderado",
        "min": 16,
        "max": 21
      },
      {
        "id": "alto",
        "label": "Alto",
        "min": 22,
        "max": 29
      },
      {
        "id": "muito_alto",
        "label": "Muito alto",
        "min": 30,
        "max": 50
      }
    ]
  },
  {
    "id": "k6",
    "version": 1,
    "shortName": "K6",
    "name": "Escala de Sofrimento Psíquico de Kessler, 6 perguntas (K6)",
    "instructions": "As questões seguintes perguntam sobre como você tem se sentido durante os últimos 30 dias. Para cada questão, por favor, marque a opção que melhor descreve com que frequência você se sentiu assim. Durante os últimos 30 dias, com que frequência você se sentiu...",
    "items": [
      {
        "id": "q1",
        "text": "...nervoso (a)?",
        "options": [
          {
            "value": 4,
            "label": "O tempo todo"
          },
          {
            "value": 3,
            "label": "A maior parte do tempo"
          },
          {
            "value": 2,
            "label": "Parte do tempo"
          },
          {
            "value": 1,
            "label": "Um pouco"
          },
          {
            "value": 0,
            "label": "Nunca"
          }
        ]
      },
      {
        "id": "q2",
        "text": "...sem esperança?",
        "options": [
          {
            "value": 4,
            "label": "O tempo todo"
          },
          {
            "value": 3,
            "label": "A maior parte do tempo"
          },
          {
            "value": 2,
            "label": "Parte do tempo"
          },
          {
            "value": 1,
            "label": "Um pouco"
          },
          {
            "value": 0,
            "label": "Nunca"
          }
        ]
      },
      {
        "id": "q3",
        "text": "...inquieto (a) ou agitado (a)?",
        "options": [
          {
            "value": 4,
            "label": "O tempo todo"
          },
          {
            "value": 3,
            "label": "A maior parte do tempo"
          },
          {
            "value": 2,
            "label": "Parte do tempo"
          },
          {
            "value": 1,
            "label": "Um pouco"
          },
          {
            "value": 0,
            "label": "Nunca"
          }
        ]
      },
      {
        "id": "q4",
        "text": "...tão deprimido (a) que nada conseguia animá-lo (a)?",
        "options": [
          {
            "value": 4,
            "label": "O tempo todo"
          },
          {
            "value": 3,
            "label": "A maior parte do tempo"
          },
          {
            "value": 2,
            "label": "Parte do tempo"
          },
          {
            "value": 1,
            "label": "Um pouco"
          },
          {
            "value": 0,
            "label": "Nunca"
          }
        ]
      },
      {
        "id": "q5",
        "text": "Durante os últimos 30 dias, com que frequência você sentiu que tudo era um esforço?",
        "options": [
          {
            "value": 4,
            "label": "O tempo todo"
          },
          {
            "value": 3,
            "label": "A maior parte do tempo"
          },
          {
            "value": 2,
            "label": "Parte do tempo"
          },
          {
            "value": 1,
            "label": "Um pouco"
          },
          {
            "value": 0,
            "label": "Nunca"
          }
        ]
      },
      {
        "id": "q6",
        "text": "...sem valor?",
        "options": [
          {
            "value": 4,
            "label": "O tempo todo"
          },
          {
            "value": 3,
            "label": "A maior parte do tempo"
          },
          {
            "value": 2,
            "label": "Parte do tempo"
          },
          {
            "value": 1,
            "label": "Um pouco"
          },
          {
            "value": 0,
            "label": "Nunca"
          }
        ]
      }
    ],
    "extraItems": [],
    "scoring": {
      "method": "sum",
      "min": 0,
      "max": 24
    },
    "bands": [
      {
        "id": "baixo",
        "label": "Baixo",
        "min": 0,
        "max": 4
      },
      {
        "id": "moderado",
        "label": "Moderado",
        "min": 5,
        "max": 12
      },
      {
        "id": "grave",
        "label": "Grave",
        "min": 13,
        "max": 24
      }
    ]
  },
  {
    "id": "pcl5",
    "version": 1,
    "shortName": "PCL-5",
    "name": "Lista de Verificação do TEPT para o DSM-5 (PCL-5)",
    "instructions": "Abaixo há uma lista de problemas que as pessoas às vezes apresentam em resposta a uma experiência muito estressante. Por favor, leia cuidadosamente cada problema e marque a opção que indica o quanto você tem sido incomodado por este problema no último mês. No último mês, quanto você foi incomodado por:",
    "items": [
      {
        "id": "q1",
        "text": "Lembranças indesejáveis, perturbadoras e repetitivas da experiência estressante?",
        "options": [
          {
            "value": 0,
            "label": "De modo nenhum"
          },
          {
            "value": 1,
            "label": "Um pouco"
          },
          {
            "value": 2,
            "label": "Moderadamente"
          },
          {
            "value": 3,
            "label": "Muito"
          },
          {
            "value": 4,
            "label": "Extremamente"
          }
        ]
      },
      {
        "id": "q2",
        "text": "Sonhos perturbadores e repetitivos com a experiência estressante?",
        "options": [
          {
            "value": 0,
            "label": "De modo nenhum"
          },
          {
            "value": 1,
            "label": "Um pouco"
          },
          {
            "value": 2,
            "label": "Moderadamente"
          },
          {
            "value": 3,
            "label": "Muito"
          },
          {
            "value": 4,
            "label": "Extremamente"
          }
        ]
      },
      {
        "id": "q3",
        "text": "De repente, sentindo ou agindo como se a experiência estressante estivesse, de fato, acontecendo de novo (como se você estivesse revivendo-a, de verdade, lá no passado)?",
        "options": [
          {
            "value": 0,
            "label": "De modo nenhum"
          },
          {
            "value": 1,
            "label": "Um pouco"
          },
          {
            "value": 2,
            "label": "Moderadamente"
          },
          {
            "value": 3,
            "label": "Muito"
          },
          {
            "value": 4,
            "label": "Extremamente"
          }
        ]
      },
      {
        "id": "q4",
        "text": "Sentir-se muito chateado quando algo lembra você da experiência estressante?",
        "options": [
          {
            "value": 0,
            "label": "De modo nenhum"
          },
          {
            "value": 1,
            "label": "Um pouco"
          },
          {
            "value": 2,
            "label": "Moderadamente"
          },
          {
            "value": 3,
            "label": "Muito"
          },
          {
            "value": 4,
            "label": "Extremamente"
          }
        ]
      },
      {
        "id": "q5",
        "text": "Ter reações físicas intensas quando algo lembra você da experiência estressante (por exemplo, coração apertado, dificuldades para respirar, suor excessivo)?",
        "options": [
          {
            "value": 0,
            "label": "De modo nenhum"
          },
          {
            "value": 1,
            "label": "Um pouco"
          },
          {
            "value": 2,
            "label": "Moderadamente"
          },
          {
            "value": 3,
            "label": "Muito"
          },
          {
            "value": 4,
            "label": "Extremamente"
          }
        ]
      },
      {
        "id": "q6",
        "text": "Evitar lembranças, pensamentos, ou sentimentos relacionados à experiência estressante?",
        "options": [
          {
            "value": 0,
            "label": "De modo nenhum"
          },
          {
            "value": 1,
            "label": "Um pouco"
          },
          {
            "value": 2,
            "label": "Moderadamente"
          },
          {
            "value": 3,
            "label": "Muito"
          },
          {
            "value": 4,
            "label": "Extremamente"
          }
        ]
      },
      {
        "id": "q7",
        "text": "Evitar lembranças externas da experiência estressante (por exemplo, pessoas, lugares, conversas, atividades, objetos ou situações)?",
        "options": [
          {
            "value": 0,
            "label": "De modo nenhum"
          },
          {
            "value": 1,
            "label": "Um pouco"
          },
          {
            "value": 2,
            "label": "Moderadamente"
          },
          {
            "value": 3,
            "label": "Muito"
          },
          {
            "value": 4,
            "label": "Extremamente"
          }
        ]
      },
      {
        "id": "q8",
        "text": "Não conseguir se lembrar de partes importantes da experiência estressante?",
        "options": [
          {
            "value": 0,
            "label": "De modo nenhum"
          },
          {
            "value": 1,
            "label": "Um pouco"
          },
          {
            "value": 2,
            "label": "Moderadamente"
          },
          {
            "value": 3,
            "label": "Muito"
          },
          {
            "value": 4,
            "label": "Extremamente"
          }
        ]
      },
      {
        "id": "q9",
        "text": "Ter crenças negativas intensas sobre você, outras pessoas ou o mundo (por exemplo, ter pensamentos tais como: “Eu sou ruim”, “existe algo seriamente errado comigo”, “ninguém é confiável”, “o mundo todo é perigoso”)?",
        "options": [
          {
            "value": 0,
            "label": "De modo nenhum"
          },
          {
            "value": 1,
            "label": "Um pouco"
          },
          {
            "value": 2,
            "label": "Moderadamente"
          },
          {
            "value": 3,
            "label": "Muito"
          },
          {
            "value": 4,
            "label": "Extremamente"
          }
        ]
      },
      {
        "id": "q10",
        "text": "Culpar a si mesmo ou aos outros pela experiência estressante ou pelo que aconteceu depois dela?",
        "options": [
          {
            "value": 0,
            "label": "De modo nenhum"
          },
          {
            "value": 1,
            "label": "Um pouco"
          },
          {
            "value": 2,
            "label": "Moderadamente"
          },
          {
            "value": 3,
            "label": "Muito"
          },
          {
            "value": 4,
            "label": "Extremamente"
          }
        ]
      },
      {
        "id": "q11",
        "text": "Ter sentimentos negativos intensos como medo, pavor, raiva, culpa ou vergonha?",
        "options": [
          {
            "value": 0,
            "label": "De modo nenhum"
          },
          {
            "value": 1,
            "label": "Um pouco"
          },
          {
            "value": 2,
            "label": "Moderadamente"
          },
          {
            "value": 3,
            "label": "Muito"
          },
          {
            "value": 4,
            "label": "Extremamente"
          }
        ]
      },
      {
        "id": "q12",
        "text": "Perder o interesse em atividades que você costumava apreciar?",
        "options": [
          {
            "value": 0,
            "label": "De modo nenhum"
          },
          {
            "value": 1,
            "label": "Um pouco"
          },
          {
            "value": 2,
            "label": "Moderadamente"
          },
          {
            "value": 3,
            "label": "Muito"
          },
          {
            "value": 4,
            "label": "Extremamente"
          }
        ]
      },
      {
        "id": "q13",
        "text": "Sentir-se distante ou isolado das outras pessoas?",
        "options": [
          {
            "value": 0,
            "label": "De modo nenhum"
          },
          {
            "value": 1,
            "label": "Um pouco"
          },
          {
            "value": 2,
            "label": "Moderadamente"
          },
          {
            "value": 3,
            "label": "Muito"
          },
          {
            "value": 4,
            "label": "Extremamente"
          }
        ]
      },
      {
        "id": "q14",
        "text": "Dificuldades para vivenciar sentimentos positivos (por exemplo, ser incapaz de sentir felicidade ou sentimentos amorosos por pessoas próximas a você)?",
        "options": [
          {
            "value": 0,
            "label": "De modo nenhum"
          },
          {
            "value": 1,
            "label": "Um pouco"
          },
          {
            "value": 2,
            "label": "Moderadamente"
          },
          {
            "value": 3,
            "label": "Muito"
          },
          {
            "value": 4,
            "label": "Extremamente"
          }
        ]
      },
      {
        "id": "q15",
        "text": "Comportamento irritado, explosões de raiva ou agir agressivamente?",
        "options": [
          {
            "value": 0,
            "label": "De modo nenhum"
          },
          {
            "value": 1,
            "label": "Um pouco"
          },
          {
            "value": 2,
            "label": "Moderadamente"
          },
          {
            "value": 3,
            "label": "Muito"
          },
          {
            "value": 4,
            "label": "Extremamente"
          }
        ]
      },
      {
        "id": "q16",
        "text": "Correr muitos riscos ou fazer coisas que podem lhe causar algum mal?",
        "options": [
          {
            "value": 0,
            "label": "De modo nenhum"
          },
          {
            "value": 1,
            "label": "Um pouco"
          },
          {
            "value": 2,
            "label": "Moderadamente"
          },
          {
            "value": 3,
            "label": "Muito"
          },
          {
            "value": 4,
            "label": "Extremamente"
          }
        ]
      },
      {
        "id": "q17",
        "text": "Ficar “super” alerta, vigilante ou de sobreaviso?",
        "options": [
          {
            "value": 0,
            "label": "De modo nenhum"
          },
          {
            "value": 1,
            "label": "Um pouco"
          },
          {
            "value": 2,
            "label": "Moderadamente"
          },
          {
            "value": 3,
            "label": "Muito"
          },
          {
            "value": 4,
            "label": "Extremamente"
          }
        ]
      },
      {
        "id": "q18",
        "text": "Sentir-se apreensivo ou assustado facilmente?",
        "options": [
          {
            "value": 0,
            "label": "De modo nenhum"
          },
          {
            "value": 1,
            "label": "Um pouco"
          },
          {
            "value": 2,
            "label": "Moderadamente"
          },
          {
            "value": 3,
            "label": "Muito"
          },
          {
            "value": 4,
            "label": "Extremamente"
          }
        ]
      },
      {
        "id": "q19",
        "text": "Ter dificuldades para se concentrar?",
        "options": [
          {
            "value": 0,
            "label": "De modo nenhum"
          },
          {
            "value": 1,
            "label": "Um pouco"
          },
          {
            "value": 2,
            "label": "Moderadamente"
          },
          {
            "value": 3,
            "label": "Muito"
          },
          {
            "value": 4,
            "label": "Extremamente"
          }
        ]
      },
      {
        "id": "q20",
        "text": "Problemas para adormecer ou continuar dormindo?",
        "options": [
          {
            "value": 0,
            "label": "De modo nenhum"
          },
          {
            "value": 1,
            "label": "Um pouco"
          },
          {
            "value": 2,
            "label": "Moderadamente"
          },
          {
            "value": 3,
            "label": "Muito"
          },
          {
            "value": 4,
            "label": "Extremamente"
          }
        ]
      }
    ],
    "extraItems": [],
    "scoring": {
      "method": "sum",
      "min": 0,
      "max": 80
    },
    "bands": [
      {
        "id": "abaixo_corte",
        "label": "Abaixo do ponto de corte",
        "min": 0,
        "max": 35
      },
      {
        "id": "corte_ou_acima",
        "label": "No ponto de corte ou acima",
        "min": 36,
        "max": 80
      }
    ]
  },
  {
    "id": "phq15",
    "version": 1,
    "shortName": "PHQ-15",
    "name": "Questionário de Saúde do Paciente: sintomas físicos (PHQ-15)",
    "instructions": "Durante as últimas 4 semanas, o quanto você foi incomodado/a por qualquer um dos problemas abaixo?",
    "items": [
      {
        "id": "q1",
        "text": "Dor de estômago",
        "options": [
          {
            "value": 0,
            "label": "Não fui incomodado/a"
          },
          {
            "value": 1,
            "label": "Pouco incomodado/a"
          },
          {
            "value": 2,
            "label": "Muito incomodado/a"
          }
        ]
      },
      {
        "id": "q2",
        "text": "Dor nas costas",
        "options": [
          {
            "value": 0,
            "label": "Não fui incomodado/a"
          },
          {
            "value": 1,
            "label": "Pouco incomodado/a"
          },
          {
            "value": 2,
            "label": "Muito incomodado/a"
          }
        ]
      },
      {
        "id": "q3",
        "text": "Dor nos braços, nas pernas ou nas juntas (joelhos, quadril, etc.)",
        "options": [
          {
            "value": 0,
            "label": "Não fui incomodado/a"
          },
          {
            "value": 1,
            "label": "Pouco incomodado/a"
          },
          {
            "value": 2,
            "label": "Muito incomodado/a"
          }
        ]
      },
      {
        "id": "q4",
        "text": "Cólicas menstruais ou outros problemas com sua menstruação (se não se aplica a você, marque “Não fui incomodado/a”)",
        "options": [
          {
            "value": 0,
            "label": "Não fui incomodado/a"
          },
          {
            "value": 1,
            "label": "Pouco incomodado/a"
          },
          {
            "value": 2,
            "label": "Muito incomodado/a"
          }
        ]
      },
      {
        "id": "q5",
        "text": "Dor ou problemas durante a relação sexual",
        "options": [
          {
            "value": 0,
            "label": "Não fui incomodado/a"
          },
          {
            "value": 1,
            "label": "Pouco incomodado/a"
          },
          {
            "value": 2,
            "label": "Muito incomodado/a"
          }
        ]
      },
      {
        "id": "q6",
        "text": "Dores de cabeça",
        "options": [
          {
            "value": 0,
            "label": "Não fui incomodado/a"
          },
          {
            "value": 1,
            "label": "Pouco incomodado/a"
          },
          {
            "value": 2,
            "label": "Muito incomodado/a"
          }
        ]
      },
      {
        "id": "q7",
        "text": "Dor no peito",
        "options": [
          {
            "value": 0,
            "label": "Não fui incomodado/a"
          },
          {
            "value": 1,
            "label": "Pouco incomodado/a"
          },
          {
            "value": 2,
            "label": "Muito incomodado/a"
          }
        ]
      },
      {
        "id": "q8",
        "text": "Tontura",
        "options": [
          {
            "value": 0,
            "label": "Não fui incomodado/a"
          },
          {
            "value": 1,
            "label": "Pouco incomodado/a"
          },
          {
            "value": 2,
            "label": "Muito incomodado/a"
          }
        ]
      },
      {
        "id": "q9",
        "text": "Desmaios",
        "options": [
          {
            "value": 0,
            "label": "Não fui incomodado/a"
          },
          {
            "value": 1,
            "label": "Pouco incomodado/a"
          },
          {
            "value": 2,
            "label": "Muito incomodado/a"
          }
        ]
      },
      {
        "id": "q10",
        "text": "Sentir seu coração bater mais forte ou disparar",
        "options": [
          {
            "value": 0,
            "label": "Não fui incomodado/a"
          },
          {
            "value": 1,
            "label": "Pouco incomodado/a"
          },
          {
            "value": 2,
            "label": "Muito incomodado/a"
          }
        ]
      },
      {
        "id": "q11",
        "text": "Falta de ar",
        "options": [
          {
            "value": 0,
            "label": "Não fui incomodado/a"
          },
          {
            "value": 1,
            "label": "Pouco incomodado/a"
          },
          {
            "value": 2,
            "label": "Muito incomodado/a"
          }
        ]
      },
      {
        "id": "q12",
        "text": "Prisão de ventre, intestino solto ou diarreia",
        "options": [
          {
            "value": 0,
            "label": "Não fui incomodado/a"
          },
          {
            "value": 1,
            "label": "Pouco incomodado/a"
          },
          {
            "value": 2,
            "label": "Muito incomodado/a"
          }
        ]
      },
      {
        "id": "q13",
        "text": "Enjoo, gases ou indigestão",
        "options": [
          {
            "value": 0,
            "label": "Não fui incomodado/a"
          },
          {
            "value": 1,
            "label": "Pouco incomodado/a"
          },
          {
            "value": 2,
            "label": "Muito incomodado/a"
          }
        ]
      },
      {
        "id": "q14",
        "text": "Se sentir cansado/a ou com pouca energia",
        "options": [
          {
            "value": 0,
            "label": "Não fui incomodado/a"
          },
          {
            "value": 1,
            "label": "Pouco incomodado/a"
          },
          {
            "value": 2,
            "label": "Muito incomodado/a"
          }
        ]
      },
      {
        "id": "q15",
        "text": "Dificuldade para pegar no sono ou permanecer dormindo, ou dormir mais do que de costume",
        "options": [
          {
            "value": 0,
            "label": "Não fui incomodado/a"
          },
          {
            "value": 1,
            "label": "Pouco incomodado/a"
          },
          {
            "value": 2,
            "label": "Muito incomodado/a"
          }
        ]
      }
    ],
    "extraItems": [],
    "scoring": {
      "method": "sum",
      "min": 0,
      "max": 30
    },
    "bands": [
      {
        "id": "minima",
        "label": "Mínima",
        "min": 0,
        "max": 4
      },
      {
        "id": "baixa",
        "label": "Baixa",
        "min": 5,
        "max": 9
      },
      {
        "id": "media",
        "label": "Média",
        "min": 10,
        "max": 14
      },
      {
        "id": "alta",
        "label": "Alta",
        "min": 15,
        "max": 30
      }
    ]
  },
  {
    "id": "asrs6",
    "version": 1,
    "shortName": "ASRS-6",
    "name": "Escala de Autoavaliação de TDAH em Adultos, 6 perguntas (ASRS-V1.1)",
    "instructions": "Assinale a alternativa que melhor descreve a forma como você tem se sentido e comportado nos últimos 6 meses.",
    "items": [
      {
        "id": "q1",
        "text": "Com que frequência você sente dificuldade para finalizar os últimos detalhes de uma tarefa, depois de já ter feito as partes mais complicadas?",
        "options": [
          {
            "value": 0,
            "label": "Nunca"
          },
          {
            "value": 1,
            "label": "Raramente"
          },
          {
            "value": 2,
            "label": "Algumas vezes"
          },
          {
            "value": 3,
            "label": "Frequentemente"
          },
          {
            "value": 4,
            "label": "Muito frequentemente"
          }
        ],
        "shadeFrom": 2
      },
      {
        "id": "q2",
        "text": "Com que frequência você sente dificuldade para manter as coisas em ordem quando precisa realizar uma tarefa que exige organização?",
        "options": [
          {
            "value": 0,
            "label": "Nunca"
          },
          {
            "value": 1,
            "label": "Raramente"
          },
          {
            "value": 2,
            "label": "Algumas vezes"
          },
          {
            "value": 3,
            "label": "Frequentemente"
          },
          {
            "value": 4,
            "label": "Muito frequentemente"
          }
        ],
        "shadeFrom": 2
      },
      {
        "id": "q3",
        "text": "Com que frequência você tem problemas para se lembrar de compromissos ou obrigações?",
        "options": [
          {
            "value": 0,
            "label": "Nunca"
          },
          {
            "value": 1,
            "label": "Raramente"
          },
          {
            "value": 2,
            "label": "Algumas vezes"
          },
          {
            "value": 3,
            "label": "Frequentemente"
          },
          {
            "value": 4,
            "label": "Muito frequentemente"
          }
        ],
        "shadeFrom": 2
      },
      {
        "id": "q4",
        "text": "Quando precisa realizar uma tarefa que exige muita concentração, com que frequência você evita ou atrasa o seu início?",
        "options": [
          {
            "value": 0,
            "label": "Nunca"
          },
          {
            "value": 1,
            "label": "Raramente"
          },
          {
            "value": 2,
            "label": "Algumas vezes"
          },
          {
            "value": 3,
            "label": "Frequentemente"
          },
          {
            "value": 4,
            "label": "Muito frequentemente"
          }
        ],
        "shadeFrom": 3
      },
      {
        "id": "q5",
        "text": "Com que frequência você fica se mexendo na cadeira ou balançando as mãos ou os pés quando precisa ficar sentado(a) durante um longo período de tempo?",
        "options": [
          {
            "value": 0,
            "label": "Nunca"
          },
          {
            "value": 1,
            "label": "Raramente"
          },
          {
            "value": 2,
            "label": "Algumas vezes"
          },
          {
            "value": 3,
            "label": "Frequentemente"
          },
          {
            "value": 4,
            "label": "Muito frequentemente"
          }
        ],
        "shadeFrom": 3
      },
      {
        "id": "q6",
        "text": "Com que frequência você se sente excessivamente ativo(a) e compelido(a) a fazer coisas, como se fosse conduzido(a) por um motor?",
        "options": [
          {
            "value": 0,
            "label": "Nunca"
          },
          {
            "value": 1,
            "label": "Raramente"
          },
          {
            "value": 2,
            "label": "Algumas vezes"
          },
          {
            "value": 3,
            "label": "Frequentemente"
          },
          {
            "value": 4,
            "label": "Muito frequentemente"
          }
        ],
        "shadeFrom": 3
      }
    ],
    "extraItems": [],
    "scoring": {
      "method": "sum",
      "min": 0,
      "max": 24
    },
    "bands": [
      {
        "id": "negativo_baixo",
        "label": "Negativo baixo",
        "min": 0,
        "max": 9
      },
      {
        "id": "negativo_alto",
        "label": "Negativo alto",
        "min": 10,
        "max": 13
      },
      {
        "id": "positivo_baixo",
        "label": "Positivo baixo",
        "min": 14,
        "max": 17
      },
      {
        "id": "positivo_alto",
        "label": "Positivo alto",
        "min": 18,
        "max": 24
      }
    ]
  },
  {
    "id": "rosenberg",
    "version": 1,
    "shortName": "Rosenberg",
    "name": "Escala de Autoestima de Rosenberg (EPM/Rosenberg)",
    "instructions": "Leia cada frase e marque o quanto você concorda ou discorda dela.",
    "items": [
      {
        "id": "q1",
        "text": "De uma forma geral (apesar de tudo), estou satisfeito(a) comigo mesmo(a).",
        "options": [
          {
            "value": 3,
            "label": "Concordo plenamente"
          },
          {
            "value": 2,
            "label": "Concordo"
          },
          {
            "value": 1,
            "label": "Discordo"
          },
          {
            "value": 0,
            "label": "Discordo plenamente"
          }
        ]
      },
      {
        "id": "q2",
        "text": "Às vezes, eu acho que eu não sirvo para nada (desqualificado(a) ou inferior em relação aos outros).",
        "options": [
          {
            "value": 0,
            "label": "Concordo plenamente"
          },
          {
            "value": 1,
            "label": "Concordo"
          },
          {
            "value": 2,
            "label": "Discordo"
          },
          {
            "value": 3,
            "label": "Discordo plenamente"
          }
        ]
      },
      {
        "id": "q3",
        "text": "Eu sinto que eu tenho um tanto (um número) de boas qualidades.",
        "options": [
          {
            "value": 3,
            "label": "Concordo plenamente"
          },
          {
            "value": 2,
            "label": "Concordo"
          },
          {
            "value": 1,
            "label": "Discordo"
          },
          {
            "value": 0,
            "label": "Discordo plenamente"
          }
        ]
      },
      {
        "id": "q4",
        "text": "Eu sou capaz de fazer coisas tão bem quanto a maioria das outras pessoas (desde que me ensinadas).",
        "options": [
          {
            "value": 3,
            "label": "Concordo plenamente"
          },
          {
            "value": 2,
            "label": "Concordo"
          },
          {
            "value": 1,
            "label": "Discordo"
          },
          {
            "value": 0,
            "label": "Discordo plenamente"
          }
        ]
      },
      {
        "id": "q5",
        "text": "Não sinto satisfação nas coisas que realizei. Eu sinto que não tenho muito do que me orgulhar.",
        "options": [
          {
            "value": 0,
            "label": "Concordo plenamente"
          },
          {
            "value": 1,
            "label": "Concordo"
          },
          {
            "value": 2,
            "label": "Discordo"
          },
          {
            "value": 3,
            "label": "Discordo plenamente"
          }
        ]
      },
      {
        "id": "q6",
        "text": "Às vezes, eu realmente me sinto inútil (incapaz de fazer as coisas).",
        "options": [
          {
            "value": 0,
            "label": "Concordo plenamente"
          },
          {
            "value": 1,
            "label": "Concordo"
          },
          {
            "value": 2,
            "label": "Discordo"
          },
          {
            "value": 3,
            "label": "Discordo plenamente"
          }
        ]
      },
      {
        "id": "q7",
        "text": "Eu sinto que sou uma pessoa de valor, pelo menos num plano igual (num mesmo nível) às outras pessoas.",
        "options": [
          {
            "value": 3,
            "label": "Concordo plenamente"
          },
          {
            "value": 2,
            "label": "Concordo"
          },
          {
            "value": 1,
            "label": "Discordo"
          },
          {
            "value": 0,
            "label": "Discordo plenamente"
          }
        ]
      },
      {
        "id": "q8",
        "text": "Não me dou o devido valor. Gostaria de ter mais respeito por mim mesmo(a).",
        "options": [
          {
            "value": 0,
            "label": "Concordo plenamente"
          },
          {
            "value": 1,
            "label": "Concordo"
          },
          {
            "value": 2,
            "label": "Discordo"
          },
          {
            "value": 3,
            "label": "Discordo plenamente"
          }
        ]
      },
      {
        "id": "q9",
        "text": "Quase sempre eu estou inclinado(a) a achar que sou um(a) fracassado(a).",
        "options": [
          {
            "value": 0,
            "label": "Concordo plenamente"
          },
          {
            "value": 1,
            "label": "Concordo"
          },
          {
            "value": 2,
            "label": "Discordo"
          },
          {
            "value": 3,
            "label": "Discordo plenamente"
          }
        ]
      },
      {
        "id": "q10",
        "text": "Eu tenho uma atitude positiva (pensamentos, atos e sentimentos positivos) em relação a mim mesmo(a).",
        "options": [
          {
            "value": 3,
            "label": "Concordo plenamente"
          },
          {
            "value": 2,
            "label": "Concordo"
          },
          {
            "value": 1,
            "label": "Discordo"
          },
          {
            "value": 0,
            "label": "Discordo plenamente"
          }
        ]
      }
    ],
    "extraItems": [],
    "scoring": {
      "method": "sum",
      "min": 0,
      "max": 30
    },
    "bands": [],
    "noBands": true
  },
  {
    "id": "scs",
    "version": 1,
    "shortName": "Autocompaixão",
    "name": "Escala de Autocompaixão (SCS)",
    "instructions": "Como eu geralmente lido comigo em momentos difíceis. Por favor, leia com cuidado antes de responder. Para cada item, indique com que frequência você se comporta da forma descrita, de 1 (quase nunca) a 5 (quase sempre).",
    "items": [
      {
        "id": "q1",
        "text": "Sou realmente crítico e severo com meus próprios erros e defeitos.",
        "options": [
          {
            "value": 1,
            "label": "1 – Quase nunca"
          },
          {
            "value": 2,
            "label": "2"
          },
          {
            "value": 3,
            "label": "3"
          },
          {
            "value": 4,
            "label": "4"
          },
          {
            "value": 5,
            "label": "5 – Quase sempre"
          }
        ]
      },
      {
        "id": "q2",
        "text": "Quando fico “pra baixo”, não consigo parar de pensar em tudo que está errado comigo.",
        "options": [
          {
            "value": 1,
            "label": "1 – Quase nunca"
          },
          {
            "value": 2,
            "label": "2"
          },
          {
            "value": 3,
            "label": "3"
          },
          {
            "value": 4,
            "label": "4"
          },
          {
            "value": 5,
            "label": "5 – Quase sempre"
          }
        ]
      },
      {
        "id": "q3",
        "text": "Quando as coisas vão mal para mim, vejo as dificuldades como parte da vida e que acontecem com todo mundo.",
        "options": [
          {
            "value": 1,
            "label": "1 – Quase nunca"
          },
          {
            "value": 2,
            "label": "2"
          },
          {
            "value": 3,
            "label": "3"
          },
          {
            "value": 4,
            "label": "4"
          },
          {
            "value": 5,
            "label": "5 – Quase sempre"
          }
        ]
      },
      {
        "id": "q4",
        "text": "Quando penso nos meus defeitos, eu me sinto realmente isolado do resto do mundo.",
        "options": [
          {
            "value": 1,
            "label": "1 – Quase nunca"
          },
          {
            "value": 2,
            "label": "2"
          },
          {
            "value": 3,
            "label": "3"
          },
          {
            "value": 4,
            "label": "4"
          },
          {
            "value": 5,
            "label": "5 – Quase sempre"
          }
        ]
      },
      {
        "id": "q5",
        "text": "Tento ser amável comigo quando me sinto emocionalmente mal.",
        "options": [
          {
            "value": 1,
            "label": "1 – Quase nunca"
          },
          {
            "value": 2,
            "label": "2"
          },
          {
            "value": 3,
            "label": "3"
          },
          {
            "value": 4,
            "label": "4"
          },
          {
            "value": 5,
            "label": "5 – Quase sempre"
          }
        ]
      },
      {
        "id": "q6",
        "text": "Quando eu falho em algo importante para mim, fico totalmente consumido por sentimentos de incompetência.",
        "options": [
          {
            "value": 1,
            "label": "1 – Quase nunca"
          },
          {
            "value": 2,
            "label": "2"
          },
          {
            "value": 3,
            "label": "3"
          },
          {
            "value": 4,
            "label": "4"
          },
          {
            "value": 5,
            "label": "5 – Quase sempre"
          }
        ]
      },
      {
        "id": "q7",
        "text": "Quando me sinto realmente mal, lembro que há outras pessoas no mundo se sentindo como eu.",
        "options": [
          {
            "value": 1,
            "label": "1 – Quase nunca"
          },
          {
            "value": 2,
            "label": "2"
          },
          {
            "value": 3,
            "label": "3"
          },
          {
            "value": 4,
            "label": "4"
          },
          {
            "value": 5,
            "label": "5 – Quase sempre"
          }
        ]
      },
      {
        "id": "q8",
        "text": "Quando as coisas estão realmente difíceis, costumo ser duro comigo mesmo.",
        "options": [
          {
            "value": 1,
            "label": "1 – Quase nunca"
          },
          {
            "value": 2,
            "label": "2"
          },
          {
            "value": 3,
            "label": "3"
          },
          {
            "value": 4,
            "label": "4"
          },
          {
            "value": 5,
            "label": "5 – Quase sempre"
          }
        ]
      },
      {
        "id": "q9",
        "text": "Quando algo me deixa aborrecido, tento buscar equilíbrio emocional.",
        "options": [
          {
            "value": 1,
            "label": "1 – Quase nunca"
          },
          {
            "value": 2,
            "label": "2"
          },
          {
            "value": 3,
            "label": "3"
          },
          {
            "value": 4,
            "label": "4"
          },
          {
            "value": 5,
            "label": "5 – Quase sempre"
          }
        ]
      },
      {
        "id": "q10",
        "text": "Quando percebo que fui inadequado, tento lembrar que a maioria das pessoas também passa por isso.",
        "options": [
          {
            "value": 1,
            "label": "1 – Quase nunca"
          },
          {
            "value": 2,
            "label": "2"
          },
          {
            "value": 3,
            "label": "3"
          },
          {
            "value": 4,
            "label": "4"
          },
          {
            "value": 5,
            "label": "5 – Quase sempre"
          }
        ]
      },
      {
        "id": "q11",
        "text": "Sou intolerante e impaciente com os aspectos de que não gosto na minha personalidade.",
        "options": [
          {
            "value": 1,
            "label": "1 – Quase nunca"
          },
          {
            "value": 2,
            "label": "2"
          },
          {
            "value": 3,
            "label": "3"
          },
          {
            "value": 4,
            "label": "4"
          },
          {
            "value": 5,
            "label": "5 – Quase sempre"
          }
        ]
      },
      {
        "id": "q12",
        "text": "Quando estou passando por um momento realmente difícil, eu me dou o apoio e o cuidado de que preciso.",
        "options": [
          {
            "value": 1,
            "label": "1 – Quase nunca"
          },
          {
            "value": 2,
            "label": "2"
          },
          {
            "value": 3,
            "label": "3"
          },
          {
            "value": 4,
            "label": "4"
          },
          {
            "value": 5,
            "label": "5 – Quase sempre"
          }
        ]
      },
      {
        "id": "q13",
        "text": "Quando fico “pra baixo”, sinto que a maioria das pessoas é mais feliz do que eu.",
        "options": [
          {
            "value": 1,
            "label": "1 – Quase nunca"
          },
          {
            "value": 2,
            "label": "2"
          },
          {
            "value": 3,
            "label": "3"
          },
          {
            "value": 4,
            "label": "4"
          },
          {
            "value": 5,
            "label": "5 – Quase sempre"
          }
        ]
      },
      {
        "id": "q14",
        "text": "Quando algo doloroso acontece, tento ver a situação de forma equilibrada.",
        "options": [
          {
            "value": 1,
            "label": "1 – Quase nunca"
          },
          {
            "value": 2,
            "label": "2"
          },
          {
            "value": 3,
            "label": "3"
          },
          {
            "value": 4,
            "label": "4"
          },
          {
            "value": 5,
            "label": "5 – Quase sempre"
          }
        ]
      },
      {
        "id": "q15",
        "text": "Tento entender meus defeitos como parte da condição humana.",
        "options": [
          {
            "value": 1,
            "label": "1 – Quase nunca"
          },
          {
            "value": 2,
            "label": "2"
          },
          {
            "value": 3,
            "label": "3"
          },
          {
            "value": 4,
            "label": "4"
          },
          {
            "value": 5,
            "label": "5 – Quase sempre"
          }
        ]
      },
      {
        "id": "q16",
        "text": "Quando vejo características que eu não gosto em mim, sou duro comigo mesmo.",
        "options": [
          {
            "value": 1,
            "label": "1 – Quase nunca"
          },
          {
            "value": 2,
            "label": "2"
          },
          {
            "value": 3,
            "label": "3"
          },
          {
            "value": 4,
            "label": "4"
          },
          {
            "value": 5,
            "label": "5 – Quase sempre"
          }
        ]
      },
      {
        "id": "q17",
        "text": "Quando eu falho em algo importante para mim, tento ver as coisas por outro ângulo.",
        "options": [
          {
            "value": 1,
            "label": "1 – Quase nunca"
          },
          {
            "value": 2,
            "label": "2"
          },
          {
            "value": 3,
            "label": "3"
          },
          {
            "value": 4,
            "label": "4"
          },
          {
            "value": 5,
            "label": "5 – Quase sempre"
          }
        ]
      },
      {
        "id": "q18",
        "text": "Quando passo por dificuldades emocionais, costumo pensar que as coisas são mais fáceis para as outras pessoas.",
        "options": [
          {
            "value": 1,
            "label": "1 – Quase nunca"
          },
          {
            "value": 2,
            "label": "2"
          },
          {
            "value": 3,
            "label": "3"
          },
          {
            "value": 4,
            "label": "4"
          },
          {
            "value": 5,
            "label": "5 – Quase sempre"
          }
        ]
      },
      {
        "id": "q19",
        "text": "Sou bondoso comigo quando estou passando por algum sofrimento.",
        "options": [
          {
            "value": 1,
            "label": "1 – Quase nunca"
          },
          {
            "value": 2,
            "label": "2"
          },
          {
            "value": 3,
            "label": "3"
          },
          {
            "value": 4,
            "label": "4"
          },
          {
            "value": 5,
            "label": "5 – Quase sempre"
          }
        ]
      },
      {
        "id": "q20",
        "text": "Quando algo me deixa incomodado, sou completamente tomado por sentimentos negativos.",
        "options": [
          {
            "value": 1,
            "label": "1 – Quase nunca"
          },
          {
            "value": 2,
            "label": "2"
          },
          {
            "value": 3,
            "label": "3"
          },
          {
            "value": 4,
            "label": "4"
          },
          {
            "value": 5,
            "label": "5 – Quase sempre"
          }
        ]
      },
      {
        "id": "q21",
        "text": "Costumo ser um pouco insensível comigo quando estou sofrendo.",
        "options": [
          {
            "value": 1,
            "label": "1 – Quase nunca"
          },
          {
            "value": 2,
            "label": "2"
          },
          {
            "value": 3,
            "label": "3"
          },
          {
            "value": 4,
            "label": "4"
          },
          {
            "value": 5,
            "label": "5 – Quase sempre"
          }
        ]
      },
      {
        "id": "q22",
        "text": "Quando fico “pra baixo”, tento aceitar e entender meus sentimentos.",
        "options": [
          {
            "value": 1,
            "label": "1 – Quase nunca"
          },
          {
            "value": 2,
            "label": "2"
          },
          {
            "value": 3,
            "label": "3"
          },
          {
            "value": 4,
            "label": "4"
          },
          {
            "value": 5,
            "label": "5 – Quase sempre"
          }
        ]
      },
      {
        "id": "q23",
        "text": "Sou compreensivo com meus próprios erros e defeitos.",
        "options": [
          {
            "value": 1,
            "label": "1 – Quase nunca"
          },
          {
            "value": 2,
            "label": "2"
          },
          {
            "value": 3,
            "label": "3"
          },
          {
            "value": 4,
            "label": "4"
          },
          {
            "value": 5,
            "label": "5 – Quase sempre"
          }
        ]
      },
      {
        "id": "q24",
        "text": "Quando algo doloroso acontece comigo, costumo reagir de forma exagerada.",
        "options": [
          {
            "value": 1,
            "label": "1 – Quase nunca"
          },
          {
            "value": 2,
            "label": "2"
          },
          {
            "value": 3,
            "label": "3"
          },
          {
            "value": 4,
            "label": "4"
          },
          {
            "value": 5,
            "label": "5 – Quase sempre"
          }
        ]
      },
      {
        "id": "q25",
        "text": "Quando eu falho em algo importante para mim, costumo me sentir muito sozinho nessa situação.",
        "options": [
          {
            "value": 1,
            "label": "1 – Quase nunca"
          },
          {
            "value": 2,
            "label": "2"
          },
          {
            "value": 3,
            "label": "3"
          },
          {
            "value": 4,
            "label": "4"
          },
          {
            "value": 5,
            "label": "5 – Quase sempre"
          }
        ]
      },
      {
        "id": "q26",
        "text": "Tento ser compreensivo e paciente com os aspectos da minha personalidade dos quais não gosto.",
        "options": [
          {
            "value": 1,
            "label": "1 – Quase nunca"
          },
          {
            "value": 2,
            "label": "2"
          },
          {
            "value": 3,
            "label": "3"
          },
          {
            "value": 4,
            "label": "4"
          },
          {
            "value": 5,
            "label": "5 – Quase sempre"
          }
        ]
      }
    ],
    "extraItems": [],
    "scoring": {
      "method": "subscale_means",
      "decimals": 2,
      "step": 0.01,
      "min": 1,
      "max": 5,
      "subscales": [
        {
          "id": "bondade",
          "label": "Bondade consigo",
          "short": "BC",
          "items": [
            "q5",
            "q12",
            "q19",
            "q23",
            "q26"
          ],
          "min": 1,
          "max": 5,
          "bands": []
        },
        {
          "id": "autocritica",
          "label": "Autocrítica severa",
          "short": "AS",
          "items": [
            "q1",
            "q8",
            "q11",
            "q16",
            "q21"
          ],
          "min": 1,
          "max": 5,
          "bands": [],
          "reverseInTotal": true
        },
        {
          "id": "humanidade",
          "label": "Senso de humanidade",
          "short": "SH",
          "items": [
            "q3",
            "q7",
            "q10",
            "q15"
          ],
          "min": 1,
          "max": 5,
          "bands": []
        },
        {
          "id": "isolamento",
          "label": "Isolamento",
          "short": "IS",
          "items": [
            "q4",
            "q13",
            "q18",
            "q25"
          ],
          "min": 1,
          "max": 5,
          "bands": [],
          "reverseInTotal": true
        },
        {
          "id": "mindfulness",
          "label": "Mindfulness",
          "short": "MF",
          "items": [
            "q9",
            "q14",
            "q17",
            "q22"
          ],
          "min": 1,
          "max": 5,
          "bands": []
        },
        {
          "id": "sobreidentificacao",
          "label": "Sobre-identificação",
          "short": "SI",
          "items": [
            "q2",
            "q6",
            "q20",
            "q24"
          ],
          "min": 1,
          "max": 5,
          "bands": [],
          "reverseInTotal": true
        }
      ]
    },
    "bands": [
      {
        "id": "baixa",
        "label": "Baixa",
        "min": 1,
        "max": 2.49
      },
      {
        "id": "moderada",
        "label": "Moderada",
        "min": 2.5,
        "max": 3.5
      },
      {
        "id": "alta",
        "label": "Alta",
        "min": 3.51,
        "max": 5
      }
    ]
  },
  {
    "id": "scssf",
    "version": 1,
    "shortName": "Autocompaixão (12)",
    "name": "Escala de Autocompaixão, forma reduzida (SCS-SF)",
    "instructions": "Como eu geralmente lido comigo em momentos difíceis. Por favor, leia com cuidado antes de responder. Para cada item, indique com que frequência você se comporta da forma descrita, de 1 (quase nunca) a 5 (quase sempre).",
    "items": [
      {
        "id": "q1",
        "text": "Quando eu falho em algo importante para mim, fico totalmente consumido por sentimentos de incompetência.",
        "options": [
          {
            "value": 5,
            "label": "1 – Quase nunca"
          },
          {
            "value": 4,
            "label": "2"
          },
          {
            "value": 3,
            "label": "3"
          },
          {
            "value": 2,
            "label": "4"
          },
          {
            "value": 1,
            "label": "5 – Quase sempre"
          }
        ]
      },
      {
        "id": "q2",
        "text": "Tento ser compreensivo e paciente com os aspectos da minha personalidade dos quais não gosto.",
        "options": [
          {
            "value": 1,
            "label": "1 – Quase nunca"
          },
          {
            "value": 2,
            "label": "2"
          },
          {
            "value": 3,
            "label": "3"
          },
          {
            "value": 4,
            "label": "4"
          },
          {
            "value": 5,
            "label": "5 – Quase sempre"
          }
        ]
      },
      {
        "id": "q3",
        "text": "Quando algo doloroso acontece, tento ver a situação de forma equilibrada.",
        "options": [
          {
            "value": 1,
            "label": "1 – Quase nunca"
          },
          {
            "value": 2,
            "label": "2"
          },
          {
            "value": 3,
            "label": "3"
          },
          {
            "value": 4,
            "label": "4"
          },
          {
            "value": 5,
            "label": "5 – Quase sempre"
          }
        ]
      },
      {
        "id": "q4",
        "text": "Quando fico “pra baixo”, sinto que a maioria das pessoas é mais feliz do que eu.",
        "options": [
          {
            "value": 5,
            "label": "1 – Quase nunca"
          },
          {
            "value": 4,
            "label": "2"
          },
          {
            "value": 3,
            "label": "3"
          },
          {
            "value": 2,
            "label": "4"
          },
          {
            "value": 1,
            "label": "5 – Quase sempre"
          }
        ]
      },
      {
        "id": "q5",
        "text": "Tento entender meus defeitos como parte da condição humana.",
        "options": [
          {
            "value": 1,
            "label": "1 – Quase nunca"
          },
          {
            "value": 2,
            "label": "2"
          },
          {
            "value": 3,
            "label": "3"
          },
          {
            "value": 4,
            "label": "4"
          },
          {
            "value": 5,
            "label": "5 – Quase sempre"
          }
        ]
      },
      {
        "id": "q6",
        "text": "Quando estou passando por um momento realmente difícil, eu me dou o apoio e o cuidado de que preciso.",
        "options": [
          {
            "value": 1,
            "label": "1 – Quase nunca"
          },
          {
            "value": 2,
            "label": "2"
          },
          {
            "value": 3,
            "label": "3"
          },
          {
            "value": 4,
            "label": "4"
          },
          {
            "value": 5,
            "label": "5 – Quase sempre"
          }
        ]
      },
      {
        "id": "q7",
        "text": "Quando algo me deixa aborrecido, tento buscar equilíbrio emocional.",
        "options": [
          {
            "value": 1,
            "label": "1 – Quase nunca"
          },
          {
            "value": 2,
            "label": "2"
          },
          {
            "value": 3,
            "label": "3"
          },
          {
            "value": 4,
            "label": "4"
          },
          {
            "value": 5,
            "label": "5 – Quase sempre"
          }
        ]
      },
      {
        "id": "q8",
        "text": "Quando eu falho em algo importante para mim, costumo me sentir muito sozinho nessa situação.",
        "options": [
          {
            "value": 5,
            "label": "1 – Quase nunca"
          },
          {
            "value": 4,
            "label": "2"
          },
          {
            "value": 3,
            "label": "3"
          },
          {
            "value": 2,
            "label": "4"
          },
          {
            "value": 1,
            "label": "5 – Quase sempre"
          }
        ]
      },
      {
        "id": "q9",
        "text": "Quando fico “pra baixo”, não consigo parar de pensar em tudo que está errado comigo.",
        "options": [
          {
            "value": 5,
            "label": "1 – Quase nunca"
          },
          {
            "value": 4,
            "label": "2"
          },
          {
            "value": 3,
            "label": "3"
          },
          {
            "value": 2,
            "label": "4"
          },
          {
            "value": 1,
            "label": "5 – Quase sempre"
          }
        ]
      },
      {
        "id": "q10",
        "text": "Quando percebo que fui inadequado, tento lembrar que a maioria das pessoas também passa por isso.",
        "options": [
          {
            "value": 1,
            "label": "1 – Quase nunca"
          },
          {
            "value": 2,
            "label": "2"
          },
          {
            "value": 3,
            "label": "3"
          },
          {
            "value": 4,
            "label": "4"
          },
          {
            "value": 5,
            "label": "5 – Quase sempre"
          }
        ]
      },
      {
        "id": "q11",
        "text": "Sou realmente crítico e severo com meus próprios erros e defeitos.",
        "options": [
          {
            "value": 5,
            "label": "1 – Quase nunca"
          },
          {
            "value": 4,
            "label": "2"
          },
          {
            "value": 3,
            "label": "3"
          },
          {
            "value": 2,
            "label": "4"
          },
          {
            "value": 1,
            "label": "5 – Quase sempre"
          }
        ]
      },
      {
        "id": "q12",
        "text": "Sou intolerante e impaciente com os aspectos de que não gosto na minha personalidade.",
        "options": [
          {
            "value": 5,
            "label": "1 – Quase nunca"
          },
          {
            "value": 4,
            "label": "2"
          },
          {
            "value": 3,
            "label": "3"
          },
          {
            "value": 2,
            "label": "4"
          },
          {
            "value": 1,
            "label": "5 – Quase sempre"
          }
        ]
      }
    ],
    "extraItems": [],
    "scoring": {
      "method": "mean",
      "decimals": 2,
      "step": 0.01,
      "min": 1,
      "max": 5
    },
    "bands": [
      {
        "id": "baixa",
        "label": "Baixa",
        "min": 1,
        "max": 2.49
      },
      {
        "id": "moderada",
        "label": "Moderada",
        "min": 2.5,
        "max": 3.5
      },
      {
        "id": "alta",
        "label": "Alta",
        "min": 3.51,
        "max": 5
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
