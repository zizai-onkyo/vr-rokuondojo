# VR録音道場 — 映画の現場で、セリフを録る（VR Rokuon Dōjō）

架空の映画の撮影現場で、ブームの先のガンマイクを「喋っている役者の口元」に向けて録るVRゲーム／訓練シミュレータ。
監督の「よーい、スタート」で本番、「カット」で終了。カメラの画角に入らず、ライトの影をフレームに落とさず、雑音源に向けず、できるだけ近く。

- three.js + WebXR（Meta Quest のブラウザで動作。ビルド不要）
- PC シミュレーションモード（マウス操作）で同じコードが動く
- 役者・監督・紹介映像のナレーションは AI 音声合成（AivisSpeech: まお・コハク / Oz Chat、fumifumi、hinakoyuhara、阿井田 茂。すべて ACML 1.0）
- タイトルロゴは筆文字フォント TA風雅筆（Adobe Fonts）を `scripts/make_logo.py` で画像化（`public/img/logo_white.png`）
- カメラ側に監督（モニター前）・カメラマン・カチンコの助手・照明部。カチンコは本番前にフレームインする
- ステージ: 1「上京前夜」（母娘2人）／ 2「上京の朝」（3人・移動・フェイント）。劇中ドラマは「最強の録音部になる」と言って親の反対を押し切り東京へ出る娘のコミカルな話。`N` キー / Y ボタンで切替

## 起動

```bash
npm install
npm run dev        # http://127.0.0.1:5173
```

Quest 実機で動かす場合は HTTPS が必要。
最短は `npm run build` → `dist/` を GitHub Pages 等の静的ホスティングに置き、Quest のブラウザで開く。
同一 LAN なら `npx vite --host 0.0.0.0 --https`（要 `@vitejs/plugin-basic-ssl`）でも可（証明書警告を許可）。

## 操作

### PC モード
| 操作 | 内容 |
|---|---|
| マウス移動 | ブームの向き（ヨー・ピッチ） |
| ホイール | ブームの伸縮（1.4〜3.6 m） |
| A / D | マイクの首振り（キュー） |
| W / S | マイクの俯角 |
| Space | 本番（監督に合図 → よーい・カチンコ・スタート）/ カット |
| N | ステージ切替（待機中のみ） |
| 1 〜 6 / 8 / 9 | 視点（一人称 / 三人称 / 俯瞰 / 逆位置 / カメラ側 / 役者間 / ヘッドセット視点シミュレーション / 現場全景） |
| （動画用）10 | 開発者スタジオ（ナレーション用アバター） |
| O | ヘッドセット視点のとき左右の目の分割表示（ステレオ） |
| P | オートデモ（AI ブームオペ） |
| F / M / L | フレームライン / 影の着地点 / キーライト可視化 |
| H / I | ヘルプ表示 / デバッグ表示 |

### VR モード（WebXR）
- **両手モード（既定）**: 左手グリップ＝ポール後端、右手グリップ＝前方の握り。右手の捻りでマイクの首振り。右スティック上下＝伸縮、左スティック上下＝俯角、左スティック左右＝首振りオフセット。
- **ポールモード**: 実物のポールに右コントローラを固定。**較正**: ポールを水平に、役者の方へ向けて X ボタン。`src/input_xr.js` の `pole.mountFromRear`（コントローラ取付位置：後端からの距離 m）と `pole.length`（ポール長 m）を実物に合わせる。
- A ボタン: 本番（監督に合図）/ カット。B ボタン: 両手 ↔ ポール切替。Y ボタン: ステージ切替。

## 録音道場 心得（ルール）
```
一つ、マイクは喋る者の口元を狙うべし
一つ、小声には寄り、大声には引くべし
一つ、カメラの画角に入るべからず
一つ、ブームの影をフレームに落とすべからず
一つ、拾った音は己の耳で確かめるべし
一つ、雑音源にマイクを向けるべからず
```
筆文字画像は `scripts/make_okite.py`（TA風雅筆）で `public/img/okite_*.png` に生成。

## スコア
```
基本点/秒 = 100 × 指向性係数(θ) × 距離係数(d)   … 発話中のみ
指向性係数: 8°以内 1.0 → 50°で≈0（ショットガンマイクの超指向性を近似）
距離係数 : 小声 0.45m / 通常 0.60m / 大声 0.80m までが満点、そこから線形に減少
雑音     : 雑音源への拾い量 = 指向性係数(θ_src) × min(1, 2.2m / d_src)。0.45 超で NOISE 警告 −30/秒、基本点も S/N ぶん目減り
減点     : 画角侵入 −40/秒、影の映り込み −80/秒、接触 −60/秒、雑音 −30/秒
ランク   : 収録効率（得点 / 発話秒×100）S≥75% A≥60% B≥40% C → 監督の反応（OK！最高！／OK／まあOK／もう一回）
```

## 判定アルゴリズム
- **画角侵入**: ポール上 12cm 刻み＋マイク上 3 点を架空カメラの NDC に投影し、[-1,1] 内なら侵入。
- **影の映り込み**: 各サンプル点について、ライト位置 → 点 の延長レイをセットに飛ばして着地点 H を求め、H が ①ライトの円錐内 ②カメラの画角内 ③カメラから遮蔽されていない なら「影が映っている」。2 点以上で NG。
- **雑音源**: セット内の雑音源（照明の電圧コンバータ＝100Hz ハム＋ファン、窓の外＝車の低周波とうねり）ごとに、マイク軸との角度と距離から拾い量を計算。
- 実装は `src/judge.js`（エンジン非依存の純粋な幾何計算）。

## マイクの音（Web Audio、`src/dialogue.js`）
```
声 ─┬─ 直接音（漏れ聞こえ）
    ├─ マイク直接音: 距離/指向性ゲイン → オフアクシスで高域シェルフ減衰 → ローパス（干渉管の高域崩れ）
    └─ ルーム: コンボルバ（初期反射＋残響 1.15s、高域から減衰）→ 距離が遠いほど目立つ
ルームトーン（ピンクノイズ）＋マイク自己雑音（ヒス）、雑音源（拾い量に応じたゲイン）、監督の声（直接＋少し漏れ）
→ マイクバス → リミッター → マスター（スピーカー／録画）
```

## 音声の生成
```bash
# AivisSpeech Engine（tools/aivisspeech-engine/macOS-arm64/run --port 10101）を起動してから
# モデル追加: curl -X POST http://127.0.0.1:10101/aivm_models/install -F "url=https://api.aivis-project.com/v1/aivm-models/<uuid>/download?model_type=AIVMX"
#   阿井田 茂 47e53151-a378-46f3-abee-ce13aa07feb1 / fumifumi 71e72188-2726-4739-9aa9-39567396fb2a
node scripts/gen_voice.mjs                                                            # STAGE 1: content/script.json → public/script.json + audio/line_XX.wav
node scripts/gen_voice.mjs --in content/script_s2.json --out public/script_s2.json --prefix s2_   # STAGE 2
node scripts/gen_voice.mjs --in content/director.json  --out public/director.json  --prefix dir_  # 監督・助手の掛け声
node scripts/gen_voice.mjs --in content/presenter.json --out public/presenter.json --prefix nar_  # 紹介映像のナレーション（開発者 o_hori）
#   --only p01,p18 で指定行だけ再生成（他の行は既存ファイルを維持）
uv run --with pillow --with fonttools python scripts/make_logo.py                                   # 筆文字ロゴ PNG
node scripts/gen_silent.mjs           # TTS なしで試すためのプレースホルダ
```

## 動画の自動収録
ブラウザのコンソールで:
```js
__game.setPixelRatio(1);              // 1920x1080 で収録するにはウィンドウを 1920x1080 に
__game.runAward({ name: 'award_take' }) // → recordings/award_take.webm（ダイレクト風紹介映像、ナレーション＋両ステージ、約3分半）
```

画面がロックされている／ブラウザペインが隠れていると描画が止まり収録できないので、その場合はヘッドレス Chrome で収録する:

```bash
node scripts/record_headless.mjs record award_take_v7   # → recordings/award_take_v7.webm（GPU 描画 60fps、音声あり）
node scripts/record_headless.mjs record award_take_v8 --split   # 音声分離: L=ナレーション / R=ガンマイク（ダッキングなし）+ award_take_v8_stems.wav
```
`scripts/make_video.sh recordings/award_take.webm` で MP4（H.264/AAC）に変換。

`--split` で収録したテイクは `node scripts/make_split_video.mjs recordings/award_take_v8.webm docs/deliverables/VR_Rokuondojo_award_video_v8` で書き出す:
`_LR.mov`（H.264 + 24bit PCM、L=ナレーション／R=ガンマイク。DAW でミックスする用）、`_LR.mp4`（同内容 AAC）、`_mix.mp4`（参考ミックス。ナレーション下でゲーム音を約 12 dB 下げ、ピーク −1 dBFS）、`_stems/{narration,gunmic,room}.wav`（モノ 24bit。room は監督の声・カチンコ・役者の生音漏れなどマイクを通さない音）。
ステム WAV はページ内の AudioWorklet で 48 kHz float 収録しており、WebM の音声とはナレーションの相互相関でサンプル単位に合わせている（ずれは 10 ms 前後）。Chrome の MediaRecorder は 3ch 以上をステレオに落とすため WebM 本体は 2ch。

## 構成
```
src/main.js         ループ・モード切替・テイク進行・自動化API (window.__game)
src/set.js          セット・架空カメラ・ライト・オンセットモニター
src/actors.js       デフォルメ人物（口パク・歩行）。役者の見た目と初期位置は台本 JSON の look
src/crew.js         監督・カメラマン・カチンコの助手・照明部
src/presenter.js    開発者アバターのスタジオ（紹介映像のナレーション）
src/stages.js       ステージ定義（台本 JSON のパス）
src/flow.js         監督の掛け声のタイミング（よーい → カチンコ → スタート／カット → 反応）
src/boom.js         ブーム／マイクのモデルとサンプル点
src/judge.js        指向性・距離・画角侵入・影の判定
src/dialogue.js     セリフ再生 + 「マイクが拾った音」の Web Audio チェーン（EQ・ルーム・ノイズ・雑音源・監督の声・ナレーションのダッキング）
src/score.js        スコア・ランク
src/ui.js           HUD・モニター枠（Canvas 2D → DOM / テクスチャ）
src/input_desktop.js / src/input_xr.js   入力
src/demo.js         AI ブームオペ（オートデモ）
src/recorder.js     アプリ内録画（MediaRecorder → dev サーバへ保存）
src/sequences.js    応募動画のタイムライン（ナレーションの長さから自動で組む）
content/*.json      台本（stage 1 / stage 2 / 監督 / ナレーション）。blocking で役者の移動（atLine, offset, to:[x,z,facingDeg], dur）
```
