// Barramento do time: manda texto para as sessões abertas pelo Habblaud (POST /api/messages).
//
//   node docs/team/aviso.mjs lista
//   node docs/team/aviso.mjs orquestrador|deni|lk|qa|todos "texto"
//
// Cada papel tem a própria pasta de trabalho, então a mensagem vai só para a sessão aberta naquela pasta
// (a conta pode ter outras sessões abertas; elas não recebem).
const BASE = process.env.HABBLAUD_URL || 'http://127.0.0.1:4747';
const ROOMS = {
  orquestrador: 'acup-team/integracao',
  deni: 'acup-team/deni',
  lk: 'acup-team/lk',
  qa: 'acup-team/qa',
};

const norm = (p) => String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

async function snapshot() {
  const res = await fetch(`${BASE}/api/snapshot`);
  if (!res.ok) throw new Error(`snapshot ${res.status}`);
  return res.json();
}

function roleOf(agent) {
  const room = norm(agent.roomId);
  for (const [role, suffix] of Object.entries(ROOMS)) if (room.endsWith(suffix)) return role;
  return '—';
}

const [role, ...rest] = process.argv.slice(2);
const text = rest.join(' ').trim();

if (!role || role === 'lista') {
  const snap = await snapshot();
  for (const a of snap.agents) {
    console.log(`${roleOf(a).padEnd(12)} ${a.account.padEnd(16)} ${a.name.padEnd(24)} ${a.status.padEnd(8)} ${a.id}`);
  }
  process.exit(0);
}

const roles = role === 'todos' ? Object.keys(ROOMS) : [role];
if (roles.some((r) => !ROOMS[r])) {
  console.error(`papel desconhecido: ${role} (use orquestrador, deni, lk, qa ou todos)`);
  process.exit(1);
}
if (!text) {
  console.error('falta o texto da mensagem');
  process.exit(1);
}

const snap = await snapshot();
let sent = 0;
for (const r of roles) {
  const agents = snap.agents.filter((a) => roleOf(a) === r);
  if (!agents.length) {
    console.error(`sem sessão aberta em ${ROOMS[r]}`);
    continue;
  }
  for (const a of agents) {
    const res = await fetch(`${BASE}/api/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: BASE },
      body: JSON.stringify({ agentId: a.id, text }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      console.log(`ok ${r} (${a.name}, ${a.id})`);
      sent++;
    } else {
      console.error(`falhou ${r} (${a.name}): ${body.error || res.status}`);
    }
  }
}
process.exit(sent ? 0 : 1);
