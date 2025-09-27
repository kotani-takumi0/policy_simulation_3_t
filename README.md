# 政策シミュレーションツール

## 概要
- 行政事業の概要と現状から類似事業を検索し、予算を推定するデモアプリです。
- バックエンドは FastAPI、フロントエンドは静的 HTML/JS で構成されています。
- 参照データは `final.parquet`（大容量）に含まれる埋め込みベクトルを利用します。

## フォルダ構成
- `backend/` : FastAPI アプリケーション、推論ロジック、SQLite DB。
- `frontend/` : ユーザーインターフェース（`index.html`, `script.js`, `styles.css`）。
- `data/` : 参照データ `final.parquet`（Git LFS で管理）。

## 事前準備
1. **Git LFS**
   - 大容量データを扱うため `git lfs install` を実行してからリポジトリを clone/pull してください。
2. **Python 3.10 以上** を推奨（仮想環境での利用を想定）。
3. OpenAI の API キー（Embedding API を使用します）。

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
3. `backend/.env` を作成し、OpenAI API キーを設定します。
   ```env
   OPENAI_API_KEY=sk-xxxx
   ```
4. 参照データ `final.parquet` を `data/` もしくは `backend/` に配置します。
   - 想定している主な列: `embedding_sum`, `embedding_ass`, `予算事業ID`, `事業名`, `府省庁`, `当初予算`, `事業の概要`, `事業概要URL`
   - `semantic_search.py` が `backend/` と `backend/data/`, `data/` の順で自動検出します。

## 実行手順
1. **バックエンド起動**
   ```bash
   cd backend
   uvicorn main:app --reload --port 8000
   ```
   - 起動時に `参照データ 'final.parquet' を読み込んでいます...` と表示され、正常にロードできれば `✅` ログが出ます。
2. **フロントエンド起動**（別ターミナル推奨）
   ```bash
   cd frontend
   python -m http.server 5500
   ```
   - ブラウザで `http://127.0.0.1:5500` にアクセスします。
3. フォームに情報を入力し、「過去事例と比較分析する」を押すと推定結果が表示されます。
4. 「保存」ボタンで結果を SQLite (`backend/analysis_history.db`) に蓄積できます。

## API エンドポイント
- `POST /api/v1/analyses`
  - 入力: `projectName`, `projectOverview`, `initialBudget`, `currentSituation`
  - 出力: 推定予算、類似案件一覧（類似度・概要・URL を含む）
- `POST /api/v1/save_analysis`
  - 入力: 上記レスポンスをそのまま送信
  - 出力: 保存結果 (`id`)

## 運用上の注意
- `.env` や `analysis_history.db` は機密・生成ファイルのためコミットしないでください。
- 大容量ファイル（`*.parquet`）は Git LFS を使って管理しています。クライアント側でも LFS の設定を忘れずに行ってください。
- OpenAI API の利用には課金が発生するため、利用状況に注意してください。

