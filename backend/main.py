from fastapi import FastAPI, HTTPException
# パッケージ実行時とスクリプト実行時の両方に対応
try:
    # パッケージとしてインポートされた場合（uvicorn backend.main:app など）
    from . import semantic_search  # 分析モジュール
except ImportError:
    # 単体モジュールとして実行された場合（uvicorn main:app を backend ディレクトリで実行など）
    import semantic_search  # type: ignore
import numpy as np
from openai import OpenAI # <- これに変更
from dotenv import load_dotenv
import os
from datetime import datetime
from typing import Optional, List
from sqlalchemy import create_engine, Column, Integer, String, Float, Text, text
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.ext.declarative import declarative_base
import json

# .envファイルからAPIキーを読み込む
load_dotenv() 

# OpenAIクライアントを初期化
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# --- データベース設定 ---
DATABASE_URL = "sqlite:///./analysis_history.db" # 保存されるファイル名
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# --- 保存するデータの「設計図」を定義 ---
class AnalysisHistory(Base):
    __tablename__ = "history" # データベース内のテーブル名

    # テーブルのカラム（列）を定義
    id = Column(Integer, primary_key=True, index=True)
    project_name = Column(String)
    project_overview = Column(Text)
    initial_budget = Column(Integer)
    current_situation = Column(Text)
    estimated_budget = Column(Float)
    references = Column(Text) # 類似事業リストはJSON文字列として保存
    created_at = Column(String)

# 上記の設計図を元に、データベースファイルとテーブルを初回起動時に作成
Base.metadata.create_all(bind=engine)


def ensure_history_schema():
    """履歴テーブルに必要なカラムが揃っているかを確認し、欠けていれば追加する"""
    try:
        with engine.connect() as conn:
            result = conn.execute(text("PRAGMA table_info(history);"))
            columns = {row[1] for row in result}
            if "created_at" not in columns:
                conn.execute(text("ALTER TABLE history ADD COLUMN created_at TEXT"))
            if "estimated_budget" not in columns:
                conn.execute(text("ALTER TABLE history ADD COLUMN estimated_budget REAL"))
            if "initial_budget" not in columns:
                conn.execute(text("ALTER TABLE history ADD COLUMN initial_budget INTEGER"))
    except Exception as exc:
        print(f"履歴テーブルのスキーマ確認に失敗しました: {exc}")


ensure_history_schema()

app = FastAPI(
    title="行政事業分析支援ツール API v2",
    description="セマンティック検索による類似事業検索APIです。",
    version="2.0.0"
)

# CORS (Cross-Origin Resource Sharing) の設定
origins = [
    "http://localhost",
    "http://localhost:8080",
    "http://localhost:5500",
    "http://127.0.0.1:5500", # VSCodeのLive Serverなど
    "http://0.0.0.0:5500",
    "null" # ローカルのHTMLファイルを開いた場合
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup_event():
    """
    アプリケーション起動時に参照データをメモリにロードする
    """
    ensure_history_schema()
    semantic_search.load_data_and_vectors()

class AnalysisCreate(BaseModel):
    projectName: str
    projectOverview: str
    currentSituation: str
    initialBudget: Optional[float] = None


class AnalysisLogCreate(BaseModel):
    projectName: str
    projectOverview: str
    currentSituation: str
    initialBudget: Optional[float] = None
    references: Optional[List[dict]] = None
    estimatedBudget: Optional[float] = None


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def store_analysis(
    project_name: str,
    project_overview: str,
    current_situation: str,
    initial_budget: Optional[float] = None,
    references: Optional[List[dict]] = None,
    estimated_budget: Optional[float] = None,
    *,
    raise_on_error: bool = False
) -> Optional[int]:
    """分析結果を履歴テーブルへ保存し、保存されたIDを返す"""
    db = SessionLocal()
    try:
        new_entry = AnalysisHistory(
            project_name=project_name,
            project_overview=project_overview,
            current_situation=current_situation,
            initial_budget=int(initial_budget) if isinstance(initial_budget, (int, float)) and np.isfinite(initial_budget) else None,
            estimated_budget=estimated_budget,
            references=json.dumps(references or [], ensure_ascii=False),
            created_at=datetime.utcnow().isoformat()
        )
        db.add(new_entry)
        db.commit()
        db.refresh(new_entry)
        return new_entry.id
    except Exception as exc:
        db.rollback()
        if raise_on_error:
            raise exc
        print(f"履歴保存中にエラーが発生しました: {exc}")
        return None
    finally:
        db.close()


"""
以下のユーザー認証関連エンドポイントは一時的に無効化しました:
 - POST /register
 - POST /login
 - GET  /me
必要になったら、バージョン管理の履歴から復元できます。
"""

@app.post("/api/v1/analyses")
def create_analysis(analysis_input: AnalysisCreate):
    """
    新規事業分析を実行します。
    - 入力テキストからEmbeddingベクトルを生成します。
    - 類似事業をセマンティック検索します。
    """
    try:
        # 1. 入力テキストからEmbeddingベクトルを生成 (OpenAI版に変更)
        query_text_1 = analysis_input.projectOverview
        query_text_2 = analysis_input.currentSituation

        # OpenAIのEmbeddingモデルを呼び出す
        query_vec_1_list = client.embeddings.create(
            model="text-embedding-3-small", # OpenAIの1536次元モデル
            input=query_text_1
        ).data[0].embedding
        
        query_vec_2_list = client.embeddings.create(
            model="text-embedding-3-small",
            input=query_text_2
        ).data[0].embedding

        # numpy配列に変換
        query_vec_1 = np.array(query_vec_1_list, dtype="float32")
        query_vec_2 = np.array(query_vec_2_list, dtype="float32")

        # 2. 分析ロジックを呼び出し
        analysis_output = semantic_search.analyze_similarity(query_vec_1, query_vec_2)
        similar_projects = analysis_output.get("similar_projects", [])
        estimated_budget = analysis_output.get("predicted_budget")
        initial_budget = analysis_input.initialBudget

        # 3. 自動で履歴に保存
        history_id = store_analysis(
            project_name=analysis_input.projectName,
            project_overview=analysis_input.projectOverview,
            current_situation=analysis_input.currentSituation,
            initial_budget=initial_budget,
            references=similar_projects,
            estimated_budget=estimated_budget,
        )

        # 4. フロントエンドに返すレスポンスを構築
        response_data = {
            "request_data": analysis_input.dict(),
            "references": similar_projects,
            "estimated_budget": estimated_budget,
            "initial_budget": initial_budget,
            "history_id": history_id
        }
        return response_data

    except Exception as e:
        print(f"分析中にエラーが発生: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    
    # --- フロントからの保存リクエストを受け付ける新しい窓口 ---
@app.post("/api/v1/save_analysis")
def save_analysis_to_db(analysis_data: AnalysisLogCreate):
    try:
        history_id = store_analysis(
            project_name=analysis_data.projectName,
            project_overview=analysis_data.projectOverview,
            current_situation=analysis_data.currentSituation,
            initial_budget=analysis_data.initialBudget,
            references=analysis_data.references,
            estimated_budget=analysis_data.estimatedBudget,
            raise_on_error=True
        )
        return {"status": "success", "id": history_id}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/api/v1/history")
def list_analysis_history(limit: int = 100):
    """保存された分析履歴を新しい順で返す"""
    db = SessionLocal()
    try:
        query = (
            db.query(AnalysisHistory)
            .order_by(AnalysisHistory.id.desc())
            .limit(max(limit, 1))
        )
        records = []
        for row in query:
            try:
                references = json.loads(row.references or "[]")
            except json.JSONDecodeError:
                references = []
            records.append({
                "id": row.id,
                "projectName": row.project_name,
                "projectOverview": row.project_overview,
                "currentSituation": row.current_situation,
                "initialBudget": row.initial_budget,
                "estimatedBudget": row.estimated_budget,
                "createdAt": row.created_at,
                "references": references
            })
        return records
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        db.close()


@app.delete("/api/v1/history/{history_id}")
def delete_history_entry(history_id: int):
    db = SessionLocal()
    try:
        entry = db.query(AnalysisHistory).filter(AnalysisHistory.id == history_id).first()
        if entry is None:
            raise HTTPException(status_code=404, detail="指定されたログは存在しません")
        db.delete(entry)
        db.commit()
        return {"status": "success"}
    except HTTPException:
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        db.close()
