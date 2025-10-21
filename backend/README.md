# Backend Guide (Phase 0)

## 概要
- `backend/app/` 以下が新しいバックエンドです。`backend/app/main.py` が FastAPI アプリケーションのエントリポイントになります。
- `backend/main.py` はレガシー API で、既存フロントエンドからの利用を維持するために残しています（機能追加は行いません）。
- SQLite の接続先は `.env` の `DATABASE_URL` で指定します。未設定の場合は `sqlite:///./app.db` を利用します。

## セットアップ
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
cp backend/.env.example backend/.env  # 値は環境に合わせて編集
```
- OpenAI API キーを `.env` の `OPENAI_API_KEY` に設定してください。
- `DATABASE_URL` を変更した場合は Alembic の `sqlalchemy.url` が自動的に上書きされます。

## 開発用サーバの起動
```bash
cd backend
make dev  # uvicorn backend.app.main:app --reload
```
- `http://127.0.0.1:8000/healthz` にアクセスして `"status": "ok"` が返れば準備完了です。

## データベース運用（Alembic）
- マイグレーション適用:
  ```bash
  make db_upgrade
  ```
- 新しいリビジョンを作成（コメントは必須）:
  ```bash
  make db_revision m="add option tables"
  ```
- 直前のバージョンへロールバック:
  ```bash
  make db_downgrade
  ```

## テスト
```bash
make test
```
- 既存の Decision API とヘルスチェックをカバーするテストが走ります。必要に応じて `backend/tests/` に追加してください。

## レガシー API 利用時の注意
- `backend/main.py` は互換性維持のために残しています。起動すると `DeprecationWarning` を出力します。
- 保存先は `analysis_history.db` のままです。新しいデータモデルへの移行は今後のフェーズで対応します。
