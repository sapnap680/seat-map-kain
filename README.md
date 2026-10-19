# 会場席リアルタイム管理サイト

大学バスケ大会など向けの、**前売り・当日券**の販売状況を席ごとに表示・更新する Web アプリです。  
売れている席は**灰色**、空席は案内用にハイライトできます。URL を共有すれば誰でも閲覧可能で、スタッフはログインしてリアルタイムに更新できます。

## 公開URL（来場者・案内用）

**https://map-two-brown.vercel.app/**

- **ログイン不要**で席状況を閲覧できます（スタッフログインは編集用のみ）。
- LINE・QR・メールで上記URLをそのまま共有してください。
- Vercel で **Deployment Protection**（パスワード保護）が有効だと他人が開けません。  
  Project → Settings → **Deployment Protection** を **Off**（または Production のみ公開）にしてください。

## すぐ試す（デモモード）

Supabase を設定していない場合、**デモモード**で動作します（状態はこの PC の localStorage に保存）。

```bash
cd seat-map
npm install
npm run dev
```

- スタッフログイン → パスワード: `staff-demo`
- 会場背景は [`public/backgrounds/`](public/backgrounds/) の PNG（親フォルダの PDF から生成済み）

## 本番セットアップ（Supabase + Vercel）

### 1. Supabase プロジェクト

1. [Supabase](https://supabase.com/) でプロジェクトを作成
2. **SQL Editor** で [`supabase/migrations/001_initial.sql`](supabase/migrations/001_initial.sql) を実行
3. **Authentication → Users** でスタッフ用ユーザーを 1 件作成（全員で共有するメール/パスワード）
4. **Project Settings → API** から URL と `anon` key をコピー
5. **Database → Replication** で `seat_states` / `seats` が Realtime 対象になっていることを確認（SQL 内で publication に追加済み）

### 2. 環境変数

`.env.example` を `.env` にコピーして値を設定:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

### 3. 会場図 PNG

```bash
npm run convert-pdfs
```

親フォルダ（`会場図面/*.pdf`）を `public/backgrounds/YYYY-MM-DD.png` に変換します（**色は変更しません**。PDF そのまま）。  
本番では Vercel に同梱されるため、そのまま `/backgrounds/...` で表示されます。  

大田（12/12・12/13）の **席からの見え方（3D）** は [`public/ota-seat-view.html`](public/ota-seat-view.html) をそのまま配信します。**未ログイン（来場者向け）** のとき、会場タブ横のリンクから別タブで開きます。  
Supabase Storage に置く場合は `events.background_path` を公開 URL に変更してください。

### 4. デプロイ（Vercel）

1. GitHub 等に `seat-map` を push
2. [Vercel](https://vercel.com/) で Import
3. **Environment Variables** に `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` を設定
4. Deploy → 表示された URL を QR / LINE で配布

## スタッフ操作

| 操作 | 手順 |
|------|------|
| 席の状態変更 | スタッフログイン → 席をタップ → 状態（前売り済/当日販売済/空席など）とメモ → 保存 |
| 当日案内 | **空席のみハイライト** を ON → 緑の席を案内 |
| 試合日切替 | 画面上部の 12/11・12/12・12/13 タブ |

詳細: [`docs/STAFF.md`](docs/STAFF.md)

## 席ステータス

| 状態 | 表示 |
|------|------|
| 空席 | 緑系 |
| 前売り済 / 当日販売済 | **灰色** |
| 押さえ | 黄色 |
| 使用不可 | 濃色＋斜線 |

## Supabase と Firebase、どちらがよい？

**どちらも「リアルタイムで席状態を共有する」点では大差ありません。** このアプリ程度の規模なら、どちらでも十分です。

| 観点 | Supabase（現状） | Firebase |
|------|------------------|----------|
| データ構造 | SQL・席/状態の **複合キー**（男子/女子）に向きやすい | NoSQL・ドキュメント設計は柔軟だが自分で設計 |
| リアルタイム | Postgres の変更購読 | Firestore リスナー（体感は同等） |
| 認証 | メール/パスワード共有アカウント | 同様に可能 |
| 運用 | SQL マイグレーションで席種別を明示 | Security Rules のメンテ |
| よくある理由 | 表形式・集計（空席数など）が楽 | Google 慣れ・他サービスと統一 |

**結論:** 「Firebase の方が好み」なら移行は可能ですが、**機能的には変わらない**ので、既に Supabase で始める/ SQL で男女在庫を分けている今の構成でも問題ありません。Firebase 移行を希望する場合はその旨を伝えてください。

## 男女入れ替え（最終2日）

`2025-12-12` / `2025-12-13` では:

- **コートサイド・エンド・スペシャル** → `men` / `women` の **2系統の在庫**（UI で切替）
- **1階席** → `all_day` の **1系統のみ**（終日共通）

切替対象の日付 slug は [`src/lib/allocation.ts`](src/lib/allocation.ts) の `GENDER_SWAP_EVENT_SLUGS` で変更できます。

## 技術構成

- Vite + React + TypeScript + Tailwind CSS
- Supabase（Postgres + Realtime + Auth）
- react-zoom-pan-pinch（拡大・移動）

## スクリプト

| コマンド | 内容 |
|----------|------|
| `npm run dev` | 開発サーバー |
| `npm run build` | 本番ビルド |
| `npm run convert-pdfs` | PDF → PNG（要 `pip install pymupdf`） |
