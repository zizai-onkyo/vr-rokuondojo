// Award-video timeline, Nintendo-Direct style: the developer (presenter) talks, the game plays under the narration.
// Flow: logo → presenter: why I made it (b-roll) → the game: set & crew → 「よーい、スタート」 → aim / whisper & loud / frame / shadow /
// hear the mic → 「カット」 → rank & the director's verdict → STAGE 2 (3 actors, feint, noise sources) → VR controls → closing → logo.
import { standbyPlan, DIALOGUE_LEAD } from './flow.js';

export function awardSequence(dialogue, { name = 'award_take', stages, audio = 'mix' } = {}) {
  const e1 = dialogue.cache.get(stages[0].script), e2 = dialogue.cache.get(stages[1].script) || e1;
  const L = id => dialogue.sfxDuration(id);
  const sbFull = standbyPlan(dialogue, { roll: true }).total + DIALOGUE_LEAD;     // director's call with 「本番いきます」
  const sbShort = standbyPlan(dialogue, { roll: false }).total + DIALOGUE_LEAD;   // without it
  const cutLen = L('cut') + 0.35;
  const G = 0.35;                                    // breath after a narration line
  const S = []; let t = 0;
  const add = (dt, s) => { S.push({ t: t + dt, ...s }); };
  const say = (id, s = {}) => { add(0, { say: id, ...s }); const d = L(id); t += d + G; return d; };
  const CREDIT = 'Developer: o_hori   Voice: AivisSpeech — まお・コハク（Oz Chat）/ fumifumi / hinakoyuhara / 阿井田 茂   Built with three.js + WebXR';

  // ── 0. cold open: the brush logo over the sound of a slate
  add(0, { rec: 'start', name, audio, stage: 0, roll: true, hud: false, frameLines: false, markers: false, auto: true, behavior: 'good', camera: 9, stereo: false,
    subtitle: '', callout: null, lowerThird: null, card: { logo: true, lines: ['映画の現場で、セリフを録る。'], footer: 'XR CREATIVE AWARD 2026 応募作品' } });
  add(0.5, { sfx: 'clap' });
  t = 3.6;

  // ── 1. the presenter says hello (studio)
  add(0, { card: null, camera: 10, lowerThird: { name: 'o_hori（オーホリ）', title: '録音部（初段）　サウンドエンジニア' } });
  say('p01');
  add(-G, { lowerThird: null });

  // ── 2. why I made it — b-roll of a take (audio ducked under the voice)
  add(0, { camera: 2, take: 'start', roll: false, holdCut: true, hud: false });
  { const d = say('p02', { callout: { text: '喋っている役者の口元に、マイクを向ける' } }); add(-d - G + 5.0, { camera: 8 }); }
  say('p03', { camera: 3, callout: { text: '画角・影・距離。制約の中で最適解を探す' } });
  { const d = say('p04', { camera: 6, callout: { text: 'AIの声を、身体で録る' } }); add(-d - G + 6.5, { camera: 8, stereo: true }); }
  { const d = say('p05', { camera: 10, stereo: false, callout: null }); add(-d - G + 6.4, { callout: { text: '修行の場所　＝　道場' } }); }
  add(-G, { take: 'abort', callout: null });

  // ── 3. the game: set and crew
  { const d = say('p06', { camera: 9, callout: { text: '架空の映画の撮影現場' } }); add(-d - G + 7.5, { callout: { text: '監督・カメラマン・助監督・照明部、そして録音部' } }); }
  say('p07', { camera: 9, callout: { text: '監督の「よーい、スタート」で本番' } });
  // the director's call plays in the clear (no narration), seen from the wide shot
  add(-G + 0.2, { take: 'start', roll: true, holdCut: true, callout: null });
  const takeAt = t - G + 0.2, D = takeAt + sbFull;                        // D = first line of stage 1
  const ts = i => D + (e1.timeline[i] ? e1.timeline[i].start : 0);
  add(D - 1.0 - t, { camera: 8, hud: true });
  t = D + 0.8;
  say('p08', { callout: { image: 'okite_w_1', sub: '心得 其の一　マイクの軸と距離で点が入る' } });
  t = Math.max(t, ts(2) - 0.3);
  say('p09', { callout: { image: 'okite_w_2', sub: '心得 其の二' } });
  t = Math.max(t, ts(4) - 0.4);
  add(0.2, { behavior: 'dip', camera: 2 });
  add(2.5, { behavior: 'good' });
  say('p10', { callout: { image: 'okite_w_3', sub: '心得 其の三　画角に入ると減点' } });
  t = Math.max(t, ts(6) - 0.2);
  add(0.2, { behavior: 'shadow', camera: 5 });
  add(3.7, { behavior: 'good' });
  say('p11', { callout: { image: 'okite_w_4', sub: '心得 其の四　影がフレームに落ちたら NG' } });
  add(-G, { camera: 8 });
  say('p12', { callout: { image: 'okite_w_5', sub: '心得 其の五　ヘッドホンにはマイクの音がそのまま返る' } });
  { const d = say('p13', { callout: { image: 'okite_w_6', sub: '心得 其の六　照明のコンバータ／窓の外に向けると減点' } }); add(-d - G + 3.0, { behavior: 'noise', noise: '窓の外' }); add(-d - G + 6.8, { behavior: 'good' }); }
  // the punchline plays in the clear: front shot, no callout, the lines as subtitles
  const nameOf = (e, id) => (((e.script && e.script.actors) || []).find(a => a.id === id) || {}).name || id;
  const lineSub = (e, i) => `${nameOf(e, e.timeline[i].line.actor)}「${e.timeline[i].line.text.replace(/^…+/, '')}」`;
  add(-G + 0.3, { callout: null, camera: 7 });
  for (const i of [13, 14, 15]) if (e1.timeline[i]) add(ts(i) - 0.15 - t, { subtitle: lineSub(e1, i) });
  const endLines = D + e1.duration;
  t = Math.max(t, endLines + 0.6);
  add(0, { take: 'cut', camera: 9, callout: null, subtitle: '', verdictDelay: L('p14') + 1.6 });           // 「カット！」 in the clear
  t += cutLen + 0.5;
  add(0, { camera: 2 });
  say('p14', { callout: { text: 'カット → 収録効率とランク' } });
  add(-G + 0.1, { callout: { text: 'ランクで、監督の反応が変わる' } });
  t += 3.2;                                                                 // the verdict line plays here

  // ── 4. STAGE 2: three actors, movement, feint, noise sources
  add(0, { stage: 1, camera: 9, callout: null, hud: true, take: 'start', roll: false, holdCut: true, verdictDelay: 1.1 });
  const take2At = t, D2 = take2At + sbShort;
  const ts2 = i => D2 + (e2.timeline[i] ? e2.timeline[i].start : 0);
  say('p15', { callout: { text: 'STAGE 2：役者は3人。歩き、フェイント' } });
  add(D2 - 0.5 - t, { camera: 8 });
  add(ts2(2) - 0.1 - t, { callout: { text: '同じ役者が続けて喋る　——　フェイント' } });
  t = Math.max(t, ts2(3) + 0.5);
  { const d = say('p16', { stereo: true, callout: { text: '両手モード　／　実物ポールモード' } });
    add(-d - G + 4.5, { card: { kicker: '操作', title: 'VR での操作', titleSize: 60, illustration: 'vrModes', lines: ['両手モード：コントローラでポールを持ち、手首の捻りでマイクを振る。', 'ポールモード：実物のブームポールにコントローラを固定して振る。'] } }); }
  add(-G + 0.1, { card: null, stereo: false, camera: 7, callout: null });
  t = Math.max(t, D2 + e2.timeline[5].end + 0.3 + G - 0.4);
  if (e2.timeline[5]) add(ts2(5) - 0.15 - t, { subtitle: lineSub(e2, 5) });                 // 「ホームセンター。ほら、言ったでしょ」 in the clear
  { const c = t - G + 0.4 - D2; const seg = e2.timeline.find(e => e.start - 0.2 <= c && c <= e.end + 0.1); if (seg) t = D2 + seg.end + 0.3 + G - 0.4; }   // never cut in the middle of a line
  add(-G + 0.4, { take: 'cut', subtitle: '' });                                           // the director's verdict for a clean take
  t += cutLen + 0.6;
  add(0, { camera: 2 });
  t += 4.2;

  // ── 5. closing (studio) and the logo
  add(0, { camera: 10, hud: false, callout: null, card: { board: true, footer: 'o_hori' } });   // the 心得 board while he talks about the dojo
  say('p17');
  add(-G, { card: null, lowerThird: { name: 'o_hori（オーホリ）', title: '録音部（初段）' } });
  say('p18');
  add(-G, { lowerThird: null });
  add(-G + 0.2, { card: { logo: true, lines: ['VR Rokuon Dōjō — Film Sound Recording Simulator', 'WebXR（Meta Quest 対応）'], footer: CREDIT } });
  add(5.8, { rec: 'stop', card: null });
  return S;
}
