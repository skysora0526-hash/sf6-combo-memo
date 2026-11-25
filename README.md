# SF6 Combo Memo

ストリートファイター6 のコンボを **手動入力** または **AI 動作認識（ベータ）** で記録・管理・共有する Web アプリです。

- 全キャラ対応（キャラ・技データは JSON で管理。アプリ内でキャラ・技を追加できます）
- 技ボタンでコンボルートを入力（挿入・差し替え・並べ替え・技ごとの備考・Undo/Redo）
- 状況 / 難易度 / ダメージ / SA・ドライブ消費（ルートから推定可）/ タグ / 備考 / お気に入り
- 検索・絞り込み（キャラ・ダメージ・難易度・状況・ゲージ・タグ・名前）
- テキストコピー、共有 URL（単体・複数）、共有 URL から自分のメモ帳へコピー、JSON の入出力
- AI 動作認識: 動画ファイル・画面キャプチャから動作区間を検出 → 技の候補（開発者モデル）→ 確認・修正 → ルートに変換
- 学習スタジオ（開発者用）: 動画の区間に技名を付けてデータセットを作り、精度を評価してモデルを書き出す

## 使い方

```bash
npm install
npm run dev        # 開発サーバー
npm run build      # 一般向け。dist/ に静的ファイルを出力（Netlify 等にそのまま配置可）
npm run build:studio  # 開発者向け（学習スタジオ入り）。dist-studio/ に出力
npm test           # 単体テスト（Vitest）
npm run e2e        # E2E（Playwright。両方ビルド → プレビュー → Phase 1〜5 のシナリオ）
```

## 構成

```
src/
  data/
    characters/*.json   キャラ定義（1 キャラ 1 ファイル。追加するだけで認識される）
    common-moves.json   共通技（通常技・ドライブ・SA・移動・繋ぎ）
    index.ts            読み込み・状況の初期値・カテゴリ定義
  store/useStore.ts     Zustand + localStorage 永続化（コンボ・メモ・追加キャラ・追加技）
  lib/                  ルート表記、絞り込み、共有 URL エンコード、テキスト化
  components/           技パレット、ルートエディタ、コンボカード、フィルタ等
  pages/                キャラ選択、キャラ別一覧、エディタ、全コンボ、AI 認識、共有ビュー、データ
  ai/                   AI 動作認識（本体から分離・遅延読み込み）
    types.ts            Segmenter / Classifier インターフェース
    registry.ts         解析器の登録場所
    video.ts            フレーム抽出・画面キャプチャ
    features.ts         動き量・区間検出・特徴量
    pipeline.ts         抽出 → 区間検出 → 分類 の実行
    analyzers/          motion（実装）/ template（実験的）/ planned（未実装の一覧）
e2e/                    Playwright シナリオ・合成テスト動画
docs/DESIGN.md          設計書（画面・データ構造・共有方式・AI 方針・課題）
```

### キャラを追加する

`src/data/characters/<id>.json` を追加します。

```json
{ "id": "newchar", "name": "新キャラ", "nameEn": "New Char", "color": "#ff2d78", "order": 31,
  "moves": [ { "id": "sp1", "name": "必殺技名", "category": "special", "numpad": "236P" } ] }
```

`category`: `normal` / `special` / `unique`（特殊技）/ `super` / `drive` / `system` / `connector`

### AI 解析器を追加する

`src/ai/types.ts` の `Segmenter` か `Classifier` を実装し、`src/ai/registry.ts` に登録します。
分類器は区間ごとに `{ moveId, confidence }` の候補を返します。確信がなければ空配列を返してください（UI で「不明な動作」になります）。

## 開発者モデル（開発者が学習 → ユーザーが利用）

1. `npm run dev`（または `npm run build:studio` のビルド）を開き、メニューの「学習スタジオ」でキャラを選ぶ
2. 試合の動画を解析し、検出された区間に技を選んで「確定」→「学習データに追加」。データセットはそのブラウザの IndexedDB に保存
3. 「評価・書き出し」で精度を確認する。動画が 2 本以上あると**動画単位の交差検証**（別の動画のサンプルだけで判定）になり、実際の精度に近い数字が出る
4. `ryu.json` などを書き出し、`node scripts/install-model.mjs <ファイル>` で `public/ai-models/` に配置（検証と `index.json` の更新も行う）
5. ビルドして公開すると、一般ユーザーの AI 認識でそのキャラの候補が出る

- 学習スタジオは `npm run build`（一般向け）には含まれません（`src/studio/flag.ts`）
- モデルにはサムネイル・動画名を含めません。特徴量は Int8 で 1 サンプル約 0.8KB
- 特徴量の計算方法を変えたら `src/ai/featureCodec.ts` の `FEATURE_VERSION` を上げる。古いモデルは読み込まれず、作り直しが必要
- 候補の信頼度は「近いサンプルの票の割合 × 類似度 × 学習例の数による上限」。75% 以上でも初期選択されるだけで、確定はユーザー

## 共有 URL の仕組み

コンボを短い配列形式にして lz-string で圧縮し、`#/share?d=...` に埋め込みます。
サーバー不要で、`#` 以降はサーバーに送られません。1 コンボで約 250 文字です。
URL が 2,000 文字を超えると警告し、8,000 文字を超える場合は JSON ファイルでの共有を案内します。
短い URL が必要になったら、サーバー保存方式（Netlify Functions + Blobs など）に拡張する想定です（docs/DESIGN.md 参照）。

## データの保存

ブラウザの localStorage（キー `sf6-combo-memo`、AI 学習データは `sf6-combo-memo-ai-templates`）に保存します。
端末・ブラウザ間では同期しないため、「データ」画面から JSON でバックアップしてください。
