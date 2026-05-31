export function buildProtocolSummary(protocol) {
  const body = protocol?.body?.length ? protocol.body.join(', ') : 'aguardando dados';
  const ear = protocol?.ear?.length ? protocol.ear.join(', ') : 'aguardando dados';
  const moxa = protocol?.moxa?.length ? protocol.moxa.join(', ') : 'avaliar';
  const laser = protocol?.laser?.length ? protocol.laser.join(', ') : 'avaliar';

  return { body, ear, moxa, laser };
}

export function buildPointEvidence(protocol) {
  return (protocol?.pointJustifications || [])
    .slice(0, 8)
    .map(point => {
      const action = point.actions?.slice(0, 2).join(', ');
      const indication = point.indications?.slice(0, 2).join(', ');
      return `${point.displayCode || point.label}: ${action || 'função clínica registrada'}${indication ? `; relacionado a ${indication}` : ''}.`;
    });
}

export function buildReferenceList(protocol) {
  return [...new Set(protocol?.sources || [])];
}
