# Vercel「公開設定」の変更手順

会場席マップ（例: `https://map-two-brown.vercel.app/`）を **誰でもログインなしで開ける** ようにする設定です。  
コードのデプロイとは別に、**Vercel ダッシュボード**で行います。

## 1. Deployment Protection（いちばん重要）

1. [Vercel Dashboard](https://vercel.com/dashboard) にログイン
2. プロジェクト **`map-two-brown`**（または `seat-map-kain`）を開く
3. **Settings** → **Deployment Protection**

### おすすめ（来場者向けに完全公開）

| 項目 | 設定 |
|------|------|
| **Production** | 保護 **オフ**（Password / Vercel Authentication を **無効**） |
| **Preview** | チーム内だけ見せたいなら **On** のままで OK |

**避けたい設定:** Production に「Vercel Authentication」や「Password Protection」が **All Deployments** にかかっていると、URL を知っていても来場者は **Vercel ログイン画面やパスワード** が出ます。

変更後、**シークレットウィンドウ**で本番 URL を開き、席図がそのまま表示されるか確認してください。

## 2. プロジェクトの Git 連携（自動デプロイ）

**Settings** → **Git**

- **Connected Git Repository:** `sapnap680/seat-map-kain`
- **Production Branch:** `main`
- **Root Directory:** 空（リポジトリ直下が `seat-map` 本体）

`main` に push すると Production が更新されます。

## 3. 環境変数（任意・本番データ）

**Settings** → **Environment Variables**

| 名前 | 用途 |
|------|------|
| `VITE_SUPABASE_URL` | Supabase 本番（未設定なら **デモモード**＝ブラウザ内保存） |
| `VITE_SUPABASE_ANON_KEY` | 同上 |
| `VITE_PUBLIC_URL` | 任意。`https://map-two-brown.vercel.app/`（「公開URLをコピー」用） |

**Production** にチェックを付けて保存 → **Redeploy** が必要な場合があります。

## 4. ドメイン（任意）

**Settings** → **Domains**

- デフォルト: `map-two-brown.vercel.app`（このままで公開可能）
- 独自ドメインを付ける場合はここで追加

## 5. チーム全体の保護（Hobby で見当たらない場合も）

アカウント **Settings** → **Security** に **Deployment Protection** のデフォルトがある場合、  
「新規プロジェクトに保護を付ける」が ON だと Production も守られることがあります。  
公開サイト用プロジェクトでは **Production は保護しない** 方針にしてください。

## 6. うまくいかないとき

- **401 / ログインを求められる** → Deployment Protection を再確認（上記 1）
- **古い画面のまま** → ブラウザで Ctrl+Shift+R、または Deployments から **Redeploy**
- **ビルド失敗** → Deployments タブでログを確認（`vercel.json` の schema エラー等）

## 公開用 URL（案内文の例）

```
会場席状況（リアルタイム）
https://map-two-brown.vercel.app/
ログイン不要でご覧いただけます。
```
