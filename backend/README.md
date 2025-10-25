# Backend Guide (Phase 1)

## 概要
- `backend/app/` 以下が新しいバックエンドです。`backend/app/main.py` が FastAPI アプリケーションのエントリポイントになります。
- `backend/main.py` はレガシー API で、既存フロントエンドからの利用を維持するために残しています（機能追加は行いません）。
- SQLite の接続先は `.env` の `DATABASE_URL` で指定します。未設定の場合は `sqlite:///./app.db` を利用します。
- フェーズ1で `PolicyCase` / `Option` / `OptionVersion` / `Tag` / `DecisionTag` に加え、分析系エンドポイント（`/api/v1/analyses` など）も新バックエンドに統合されました。

## アーキテクチャ
```mermaid
flowchart LR
  subgraph Client[Frontend]
    A[index.html/script.js]
    H[history.html/history.js]
    Cfg[config.js]
  end

  subgraph API[FastAPI (backend/app)]
    R1[/auth router\n/api/v1/auth/*/]
    R2[/analyses router\n/api/v1/analyses, /save_analysis, /history/]
    R3[/cases/options router\n/api/v1/cases, /options/]
    R4[/decisions router\n/api/v1/decisions]
  end

  subgraph Core[Core / Utils]
    SEC[JWT, Password Hashing]
    SEM[semantic_search.py]
  end

  subgraph Data[Storage]
    DB[(SQLite via SQLAlchemy)]
    MIG[Alembic Migrations]
    PARQ[[final.parquet (embeddings)]]
  end

  A -- REST/JSON --> R1
  A -- REST/JSON --> R2
  H -- REST/JSON --> R2
  A -- REST/JSON --> R3
  A -- REST/JSON --> R4
  Cfg -- base URL/override --> A
  Cfg -- base URL/override --> H

  R1 <--> SEC
  R2 --> SEM
  R2 <--> DB
  R3 <--> DB
  R4 <--> DB
  SEM --> PARQ
  MIG --> DB
```

データフロー要約
- フロントは `config.js` で API ベース URL を解決し、FastAPI に REST でアクセスします。
- 認証は `/api/v1/auth/*` で JWT を払い出し、以降の API は `Authorization: Bearer` を使用します。
- 分析は OpenAI Embeddings を利用し、`semantic_search.py` が `final.parquet` のベクトルと照合します。
- 履歴やケース/案は SQLAlchemy 経由で SQLite に保存し、Alembic によりスキーマ管理します。

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
- マイグレーション適用（新しいテーブルが追加されています）:
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
- Decision API（タグ正規化含む）、分析 API、PolicyCase/Option API、ヘルスチェックのテストが走ります。必要に応じて `backend/tests/` に追加してください。

## 新規 API エンドポイント
- `POST /api/v1/analyses` / `POST /api/v1/save_analysis` / `GET /api/v1/history` / `DELETE /api/v1/history/{id}` : 類似事業検索と履歴保存。OpenAI Embedding → `semantic_search.analyze_similarity` のロジックは従来どおりです。
- `POST /api/v1/cases` / `GET /api/v1/cases/{id}` : PolicyCase の作成と取得。関連する Option 一覧を返却します。
- `POST /api/v1/options` : Option を作成し、初期バージョン (`option_versions` v1) を自動登録します。候補 (`candidates`) との紐付けが可能です。
- `GET /api/v1/options/{id}` : Option とバージョン履歴を取得します。
- `POST /api/v1/options/{id}/versions` : Option の改訂バージョンを追加します。
- `POST /api/v1/decisions` : 従来どおり決定を登録しますが、フェーズ1ではタグ辞書（`tags`）と中間テーブル（`decision_tags`）にも自動で書き込みます。

## レガシー API 利用時の注意
- `backend/main.py` は互換性維持のために残しています。起動すると `DeprecationWarning` を出力します。
- 保存先は `analysis_history.db` のままです。新バックエンドへ統合したため、通常運用では不要です（旧クライアント向けのみ利用）。
