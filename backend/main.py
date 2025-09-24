from fastapi import FastAPI, HTTPException
from typing import List
import semantic_search # 分析モジュール
import numpy as np
from openai import OpenAI # <- これに変更
from dotenv import load_dotenv
import os
# 既存のimport文の一番下に、以下の5行を追加
from sqlalchemy import create_engine, Column, Integer, String, Float, Text
from sqlalchemy.orm import sessionmaker
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

# 上記の設計図を元に、データベースファイルとテーブルを初回起動時に作成
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="行政事業分析支援ツール API v2",
    description="セマンティック検索による予算予測APIです。",
    version="2.0.0"
)

# CORS (Cross-Origin Resource Sharing) の設定
origins = [
    "http://localhost",
    "http://localhost:8080",
    "http://127.0.0.1:5500", # VSCodeのLive Serverなど
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
    semantic_search.load_data_and_vectors()

class AnalysisCreate(BaseModel):
    projectName: str
    projectOverview: str
    initialBudget: int
    currentSituation: str

@app.post("/api/v1/analyses")
def create_analysis(analysis_input: AnalysisCreate):
    """
    新規事業分析を実行します。
    - 入力テキストからEmbeddingベクトルを生成します。
    - 類似事業をセマンティック検索し、予算を予測します。
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
        analysis_result = semantic_search.analyze_similarity(query_vec_1, query_vec_2)

        # 3. フロントエンドに返すレスポンスを構築
        response_data = {
            "request_data": analysis_input.dict(),
            "result_data": {
                "estimated_budget": analysis_result["predicted_budget"],
                "budget_assessment": "類似事業の予算を基にAIが推定しました。",
                "positive_points": ["データに基づいた客観的な予算推定です。"],
                "concerns": ["入力内容と類似する過去事業が少ない場合、精度が低下する可能性があります。"]
            },
            "references": analysis_result["similar_projects"]
        }
        return response_data

    except Exception as e:
        print(f"分析中にエラーが発生: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    
    # --- フロントからの保存リクエストを受け付ける新しい窓口 ---
@app.post("/api/v1/save_analysis")
def save_analysis_to_db(analysis_data: dict):
    # データベースとのセッションを開始
    db = SessionLocal()
    try:
        # フロントから送られてきたJSONデータを、データベースの各カラムに割り当てる
        new_entry = AnalysisHistory(
            project_name=analysis_data.get("request_data", {}).get("projectName"),
            project_overview=analysis_data.get("request_data", {}).get("projectOverview"),
            initial_budget=analysis_data.get("request_data", {}).get("initialBudget"),
            current_situation=analysis_data.get("request_data", {}).get("currentSituation"),
            estimated_budget=analysis_data.get("result_data", {}).get("estimated_budget"),
            references=json.dumps(analysis_data.get("references", [])) # リストは文字列に変換
        )
        # データベースに追加して、変更を確定（保存）
        db.add(new_entry)
        db.commit()
        db.refresh(new_entry)
        # 成功したことをフロントに伝える
        return {"status": "success", "id": new_entry.id}
    except Exception as e:
        # エラーが起きたら変更を元に戻す
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # セッションを閉じる
        db.close()