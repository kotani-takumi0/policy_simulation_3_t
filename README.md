# 政策シミュレーションツール（Policy Seed）

類似の過去事業を検索し、入力内容（現状・目的、事業名/事業概要、当初予算）から推定予算を算出・保存できるデモアプリです。バックエンドは FastAPI、フロントエンドは静的 HTML/JS で構成されています。

## 主な機能
- 類似事業検索と推定予算の算出（OpenAI Embeddings を使用）
- 分析結果の保存・履歴一覧・履歴削除
- 案（Option）/ バージョン管理 / レビュー・ワークフロー（ドラフト→レビュー→承認→公開など）
- ログイン/新規登録（JWT）

## リポジトリ構成
- `frontend/` フロント: `index.html`, `history.html`, `script.js`, `history.js`, `styles.css`, `config.js`
- `backend/app/` 新バックエンド（エントリ: `backend/app/main.py`）
- `backend/main.py` 旧 API（凍結）
- `data/` 参照データ（`final.parquet` 等。Git LFS 管理）

## 動作要件
- Python 3.10 以上
- OpenAI API キー（Embeddings 利用）
- Git LFS（大容量データ取得用）

## クイックスタート
1) 依存インストール
```bash
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt
```

2) 環境変数の設定（`backend/.env`）
```env
OPENAI_API_KEY=sk-xxxx
DATABASE_URL=sqlite:///../app.db
JWT_SECRET_KEY=change-me
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
```
未設定時の既定値: `DATABASE_URL=sqlite:///./app.db`

3) 参照データの配置
- `final.parquet` を `data/` もしくは `backend/data/` に配置してください。
- 主な列: `embedding_sum`, `embedding_ass`, `予算事業ID`, `事業名`, `府省庁`, `当初予算`, `事業の概要`, `事業概要URL`
- 検出順序: `backend/` → `backend/data/` → `data/`

4) DB マイグレーション
```bash
cd backend
make db_upgrade
```

5) バックエンド起動（推奨）
```bash
cd backend
make dev   # uvicorn backend.app.main:app --reload
```
ヘルスチェック: `http://127.0.0.1:8000/healthz` が `{"status":"ok"}` を返せば準備完了。

6) フロント起動
```bash
cd frontend
python -m http.server 5500
```
ブラウザで `http://127.0.0.1:5500` を開きます。

## フロントの API 接続先の切替
- 既定では、表示中ホストに対して `:8000` を組み合わせた URL が使用されます。
- 次のいずれかで上書き可能です。
  - クエリ: `?apiBaseUrl=https://api.example.com`（`reset` で設定クリア）
  - 事前にグローバル定義: `window.__APP_CONFIG__ = { apiBaseUrl: "https://api.example.com" }`
  - メタタグや `window.__APP_ENV__` による注入
- 解決処理は `frontend/config.js` に実装されています。

## 認証（ログイン/登録）
- 画面のメニュー/ヘッダーからログイン/新規登録が可能です。
- API での例:
```bash
# 新規登録
curl -sS -X POST http://127.0.0.1:8000/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"org_name":"政策企画部","email":"user@example.com","password":"Passw0rd!","role":"analyst"}'

# ログイン
curl -sS -X POST http://127.0.0.1:8000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"user@example.com","password":"Passw0rd!"}'
```
戻り値の `access_token` を `Authorization: Bearer <token>` で付与します。

## よく使う Make ターゲット（backend/Makefile）
- `make dev` バックエンド起動（ホットリロード）
- `make db_upgrade` Alembic で最新に更新
- `make db_revision m="message"` リビジョン作成
- `make db_downgrade` 1つ前に戻す
- `make test` テスト実行

## API ダイジェスト（新バックエンド）
- 分析・履歴
  - `POST /api/v1/analyses` 入力から類似事業検索と推定予算
  - `POST /api/v1/save_analysis` 既存結果の保存
  - `GET /api/v1/history` 履歴一覧（新しい順、`limit` 指定可）
  - `DELETE /api/v1/history/{id}` 履歴削除
- 認証
  - `POST /api/v1/auth/register` 新規登録
  - `POST /api/v1/auth/login` ログイン
  - `GET /api/v1/auth/me` ログインユーザー情報
- 案管理
  - `POST /api/v1/cases` / `GET /api/v1/cases/{id}`
  - `POST /api/v1/options` / `GET /api/v1/options/{id}`
  - `POST /api/v1/options/{id}/versions`
  - `POST /api/v1/decisions`

## テスト
```bash
cd backend
make test
```
`backend/tests` のユニット/統合テストが実行されます。

## 運用上の注意・トラブルシュート
- `.env` や `*.db` はコミットしないでください。
- 大容量ファイル（`*.parquet`）は Git LFS を使用します。クライアント側でも `git lfs install` を実行してください。
- Embeddings 利用には OpenAI 課金が発生します。キーと利用状況の管理にご注意ください。
- よくあるエラー
  - `OPENAI_API_KEY is not configured` → `backend/.env` を設定し、再起動
  - `final.parquet が見つからない` → `data/` または `backend/data/` に配置
  - 履歴が表示されない → ログイン状態を確認（`/api/v1/auth/me`）

