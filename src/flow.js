// The director's call around a take. Timings depend on the generated voice lengths (public/director.json).
//   「はい、本番いきます」→ 助監督がカチンコを持って入る →「よーい」→「シーン3、カット1」→ カチンコ →「スタート！」→ dialogue
export const DIALOGUE_LEAD = 0.6;   // seconds between 「スタート！」 finishing and the first line (blocking may start inside this)
export function standbyPlan(d, { roll = true } = {}) {
  const L = id => d.sfxDuration(id);
  const ev = []; let t = 0.2;
  if (roll) { ev.push({ t, id: 'roll' }); t += L('roll') + 0.25; }   // 「はい、本番いきます」 — first take of a stage only
  ev.push({ t, id: 'slateIn' });   t += 0.75;
  ev.push({ t, id: 'ready' });     t += L('ready') + 0.25;
  ev.push({ t, id: 'slate' });     t += L('slate') + 0.1;
  ev.push({ t, id: 'clap' });      t += 0.4;
  ev.push({ t, id: 'slateOut' });  t += 0.15;
  ev.push({ t, id: 'action' });    t += L('action') + 0.25;
  return { events: ev, total: t, dialogueStart: t + DIALOGUE_LEAD };
}
export function verdictId(rank) { return rank === 'S' ? 'ok_s' : rank === 'A' ? 'ok_a' : rank === 'B' ? 'ok_b' : 'retake'; }
