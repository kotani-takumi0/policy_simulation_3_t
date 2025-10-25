import ast  # Pythonの文字列をオブジェクトとして評価するライブラリ
from pathlib import Path

import numpy as np
import pandas as pd

# グローバル変数としてデータをキャッシュ
df = None
X1_n = None
X2_n = None

# 候補データファイルを上から順に探索（parquet優先）
DATA_FILE_CANDIDATES = [
    Path(__file__).resolve().parent / "final.parquet",
    Path(__file__).resolve().parent / "data" / "final.parquet",
    Path(__file__).resolve().parent.parent / "data" / "final.parquet",
    Path(__file__).resolve().parent / "final_2024.csv",
    Path(__file__).resolve().parent / "data" / "final_2024.csv",
    Path(__file__).resolve().parent.parent / "data" / "final_2024.csv",
]


def _resolve_data_path():
    for candidate in DATA_FILE_CANDIDATES:
        if candidate.exists():
            return candidate
    raise FileNotFoundError(
        "類似事業データが見つかりません。'final.parquet' もしくは 'final_2024.csv' を配置してください。"
    )

def to_vec(x):
    """
    文字列化されたPythonリスト（例: "[0.1, 0.2, ...]"）を
    numpy配列に安全に変換する、これが最終版の関数です。
    """
    if not isinstance(x, str):
        try:
            return np.asarray(x, dtype="float32")
        except:
            return np.array([], dtype="float32")
    try:
        # ast.literal_eval を使って、カンマ区切りのリスト文字列を
        # Pythonの数値リストとして安全に解釈します。
        vec_list = ast.literal_eval(x)
        return np.array(vec_list, dtype="float32")
    except Exception as e:
        print(f"ベクトル変換エラー: {e}, 元の文字列: '{x[:150]}...'")
        return np.array([], dtype="float32")

# --- これ以降の関数は変更ありません ---

def normalize_rows(M):
    if M.ndim == 1:
        M = M[None, :]
    n = np.linalg.norm(M, axis=1, keepdims=True) + 1e-12
    return M / n


def softmax_1d(x, tau=0.08):
    """温度付きソフトマックス。tauを小さくすると上位ほど重みが大きくなります。"""
    if x.size == 0:
        return np.array([], dtype="float64")
    z = x / tau
    z -= z.max()
    e = np.exp(z)
    return e / (e.sum() + 1e-12)


def weighted_log_mean(values, weights):
    """
    正の値に対して幾何平均（log-mean）を計算する。
    類似度を重みとして使い、大きな値の寄与を抑える狙い。
    """
    v = np.asarray(values, dtype="float64")
    w = np.asarray(weights, dtype="float64")
    mask = (v > 0) & np.isfinite(v) & np.isfinite(w)
    if mask.sum() == 0:
        return np.nan
    total_weight = w[mask].sum()
    if total_weight <= 0:
        return np.nan
    normalized_w = w[mask] / total_weight
    log_mean = (normalized_w * np.log(v[mask])).sum()
    return float(np.exp(log_mean))


def load_data_and_vectors():
    global df, X1_n, X2_n
    if df is not None:
        print("データは既にロード済みです。")
        return

    try:
        data_path = _resolve_data_path()
    except FileNotFoundError as exc:
        print(f"❌ データ読み込み中にエラーが発生しました: {exc}")
        df = None
        X1_n = None
        X2_n = None
        return

    print(f"参照データ '{data_path.name}' を読み込んでいます...")
    try:
        if data_path.suffix == ".parquet":
            df = pd.read_parquet(data_path)
        else:
            df = pd.read_csv(data_path)

        X_1_list = df["embedding_sum"].apply(to_vec).tolist()
        X_2_list = df["embedding_ass"].apply(to_vec).tolist()

        if any(arr.size == 0 for arr in X_1_list) or any(arr.size == 0 for arr in X_2_list):
            raise ValueError("一部のベクトルの読み込みに失敗しました。")

        X_1 = np.vstack(X_1_list)
        X_2 = np.vstack(X_2_list)

        X1_n = normalize_rows(X_1)
        X2_n = normalize_rows(X_2)
        print(f"✅ データのロードとベクトル準備が完了しました。ベクトル次元数: {X1_n.shape[1]}")
    except Exception as e:
        print(f"❌ データ読み込み中にエラーが発生しました: {e}")
        df = None
        X1_n = None
        X2_n = None


def analyze_similarity(query_vec_1: np.ndarray, query_vec_2: np.ndarray):
    """
    入力ベクトルを基に類似事業の検索と推定予算の算出を行う。
    """
    if df is None or X1_n is None or X2_n is None:
        raise Exception("データがロードされていません。'load_data_and_vectors'を先に実行してください。")

    # ハイパーパラメータ
    TOPK = 5
    TAU = 0.08
    ALPHA, BETA = 0.5, 0.5

    # クエリベクトルの正規化
    Q1_n = normalize_rows(query_vec_1)
    Q2_n = normalize_rows(query_vec_2)

    if Q1_n.shape[1] != X1_n.shape[1]:
        raise ValueError(f"次元数が一致しません。クエリ:{Q1_n.shape[1]}, データ:{X1_n.shape[1]}")

    # コサイン類似度計算
    S1 = Q1_n @ X1_n.T
    S2 = Q2_n @ X2_n.T
    S = ALPHA * S1 + BETA * S2
    scores = S[0]

    if scores.size == 0:
        return {"predicted_budget": None, "similar_projects": []}

    # 上位K件のインデックスと類似度を取得
    K = int(min(TOPK, len(scores)))
    idx = np.argpartition(-scores, K - 1)[:K]
    idx = idx[np.argsort(-scores[idx])]
    sims = scores[idx]

    # 予算データを取得し、0以下や欠損を除外
    raw_budget = df.get("当初予算")
    if raw_budget is None:
        return {
            "predicted_budget": None,
            "similar_projects": [],
        }

    init_budget = np.array(raw_budget.iloc[idx], dtype="float64")
    valid_mask = np.isfinite(init_budget) & (init_budget > 0)

    if valid_mask.sum() == 0:
        similar_projects_info = [_compose_project_payload(df.iloc[db_index], float(sims[i])) for i, db_index in enumerate(idx)]
        return {
            "predicted_budget": None,
            "similar_projects": similar_projects_info,
        }

    filtered_indices = idx[valid_mask]
    filtered_sims = sims[valid_mask]
    filtered_budget = init_budget[valid_mask]
    weights = softmax_1d(filtered_sims, tau=TAU)
    predicted_budget = weighted_log_mean(filtered_budget, weights)
    if not np.isfinite(predicted_budget):
        predicted_budget = None

    similar_projects_info = []
    for i, db_index in enumerate(idx):
        similar_projects_info.append(_compose_project_payload(df.iloc[db_index], float(sims[i])))

    return {
        "predicted_budget": predicted_budget,
        "similar_projects": similar_projects_info,
    }


def _compose_project_payload(row: pd.Series, similarity: float) -> dict:
    """フロントエンドへ渡す類似事業情報を整形する。"""
    budget_value = row.get("当初予算", None)
    if pd.isna(budget_value):
        budget_value = None
    else:
        try:
            budget_value = float(budget_value)
        except (TypeError, ValueError):
            budget_value = None

    overview = row.get("事業の概要", "情報なし")
    if pd.isna(overview):
        overview = "情報なし"
    else:
        overview = str(overview)

    project_url = row.get("事業概要URL", "")
    if pd.isna(project_url):
        project_url = ""
    else:
        project_url = str(project_url)

    return {
        "project_id": str(row.get("予算事業ID", "")),
        "project_name": row.get("事業名", "") or "",
        "ministry_name": row.get("府省庁", "") or "",
        "budget": budget_value,
        "similarity": similarity,
        "project_overview": overview,
        "project_url": project_url,
    }
