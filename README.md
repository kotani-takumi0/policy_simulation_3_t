# 政策シミュレーションツール

## 概要
- 行政事業の概要と現状から類似事業を検索し、予算を推定するデモアプリです。
- バックエンドは FastAPI、フロントエンドは静的 HTML/JS で構成されています。
- 参照データは `final.parquet`（大容量）に含まれる埋め込みベクトルを利用します。

## フォルダ構成
- `backend/app/` : 新バックエンド（Phase 1 以降で拡張予定）。`backend/app/main.py` がエントリポイントです。
- `backend/main.py` : レガシー API（Phase 0 で凍結。既存フロントからの呼び出しのみ想定）。
- `frontend/` : ユーザーインターフェース（`index.html`, `script.js`, `styles.css`）。
- `data/` : 参照データ `final.parquet`（Git LFS で管理）。

## 事前準備
1. **Git LFS**
   - 大容量データを扱うため `git lfs install` を実行してからリポジトリを clone/pull してください。
2. **Python 3.10 以上** を推奨（仮想環境での利用を想定）。
3. `backend/.env` に以下を設定します（例）。
   ```env
   OPENAI_API_KEY=sk-xxxx
   DATABASE_URL=sqlite:///../app.db
   ```
   - `DATABASE_URL` が未設定の場合は `sqlite:///./app.db` がデフォルトになります。
4. 参照データ `final.parquet` を `data/` もしくは `backend/` に配置します。
   - 想定している主な列: `embedding_sum`, `embedding_ass`, `予算事業ID`, `事業名`, `府省庁`, `当初予算`, `事業の概要`, `事業概要URL`
   - `semantic_search.py` が `backend/` → `backend/data/` → `data/` の順で自動検出します。

## セットアップ
1. リポジトリ直下で仮想環境を作成・有効化します。
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate  # Windows PowerShell の場合: .venv\Scripts\Activate.ps1
   ```
2. 依存パッケージをインストールします。
   ```bash
   pip install -r backend/requirements.txt
   ```

## サービス起動

### 新バックエンド（推奨）
```bash
cd backend
make dev  # uvicorn backend.app.main:app --reload
```
- `http://127.0.0.1:8000/healthz` が `{"status": "ok"}` を返せば準備完了です。
- 今後の機能拡張（Option/Case 等）はこちらに追加されます。

### レガシーバックエンド（凍結中）
既存フロントが依存する API。今後は新バックエンドへ移行予定です。
```bash
cd backend
uvicorn main:app --reload --port 8000
```
- 起動時に `参照データ 'final.parquet' を読み込んでいます...` と表示され、正常にロードできれば `✅` ログが出ます。
- 保存先は `analysis_history.db`（今後の統合作業で移行予定）。

### フロントエンド
```bash
cd frontend
python -m http.server 5500
```
- ブラウザで `http://127.0.0.1:5500` にアクセスします。

## データベースとマイグレーション
- Alembic でスキーマ管理します。Phase 0 では既存テーブルの追加・削除は行わず、運用手順のみ整備しています。
- マイグレーション適用:
  ```bash
  cd backend
  make db_upgrade
  ```
- 新しいリビジョンの雛形を作成する場合:
  ```bash
  cd backend
  make db_revision m="add options table"
  ```
  （`m` にはコメントを指定）

## テスト
```bash
cd backend
make test
```
- `backend/tests` 配下のテストが実行されます。最低限の回帰として Decision API とヘルスチェックをカバーしています。

## 運用上の注意
- `.env` や `*.db` は機密・生成ファイルのためコミットしないでください。
- 大容量ファイル（`*.parquet`）は Git LFS を使って管理しています。クライアント側でも LFS の設定を忘れずに行ってください。
- OpenAI API の利用には課金が発生するため、利用状況に注意してください。
