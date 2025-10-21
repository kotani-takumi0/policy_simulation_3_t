from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path
from typing import Any, Optional
import sys

from sqlalchemy import select

CURRENT_FILE = Path(__file__).resolve()
PROJECT_ROOT = CURRENT_FILE.parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.append(str(PROJECT_ROOT))

from backend.app.db.base import SessionLocal  # noqa: E402
from backend.app.db.models import (  # noqa: E402
    AuditLog,
    Candidate,
    Decision,
    Org,
    Query,
    SessionRecord,
    User,
)

DEFAULT_ORG_NAME = "default"
DEFAULT_USER_EMAIL = "demo@local"
DEFAULT_USER_NAME = "Demo User"


def ensure_defaults(session: SessionLocal) -> tuple[Org, User]:
    org = session.execute(select(Org).where(Org.name == DEFAULT_ORG_NAME)).scalar_one_or_none()
    if org is None:
        org = Org(name=DEFAULT_ORG_NAME)
        session.add(org)
        session.flush()

    user = session.execute(select(User).where(User.email == DEFAULT_USER_EMAIL)).scalar_one_or_none()
    if user is None:
        user = User(org_id=org.id, email=DEFAULT_USER_EMAIL, role="analyst")
        user.created_at  # trigger default
        session.add(user)
        session.flush()

    return org, user


def migrate_row(session: SessionLocal, row: sqlite3.Row, org: Org, user: User) -> Optional[int]:
    data = dict(row)
    project_name = data.get("project_name") or data.get("name")
    project_overview = data.get("project_overview") or data.get("overview") or ""

    if not project_name:
        return None

    session_rec = SessionRecord(org_id=org.id, user_id=user.id)
    session.add(session_rec)
    session.flush()

    query = Query(
        session_id=session_rec.id,
        text=project_name,
        purpose=project_overview,
    )
    session.add(query)
    session.flush()

    references_raw: Any = data.get("references")
    references: list[dict[str, Any]] = []
    if references_raw:
        try:
            references = json.loads(references_raw)
            if not isinstance(references, list):
                references = []
        except Exception:
            references = []

    candidate_payload = references[0] if references else {"project_name": project_name}
    candidate = Candidate(
        query_id=query.id,
        project_id=str(candidate_payload.get("project_id") or ""),
        title=candidate_payload.get("project_name") or project_name,
        ministry=candidate_payload.get("ministry_name"),
        url=candidate_payload.get("project_url"),
        score_bm25=None,
        score_embed=None,
        score_rrf=None,
        rank=0,
        metadata_json=json.dumps(candidate_payload, ensure_ascii=False),
    )
    session.add(candidate)
    session.flush()

    decision = Decision(
        candidate_id=candidate.id,
        decision="adopt",
        reason_tags="migration",
        note=None,
        decided_by=user.id,
    )
    session.add(decision)
    session.flush()

    audit_log = AuditLog(
        user_id=user.id,
        org_id=org.id,
        action="MIGRATED_DECISION",
        target_id=str(decision.id),
        ip=None,
        user_agent="migration-script",
    )
    session.add(audit_log)
    session.flush()

    return query.id


def migrate(legacy_path: Path) -> None:
    if not legacy_path.exists():
        print(f"Legacy DB not found: {legacy_path}")
        return

    conn = sqlite3.connect(str(legacy_path))
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='history'")
    if cur.fetchone() is None:
        print("Legacy DB missing 'history' table.")
        return

    rows = list(cur.execute("SELECT * FROM history"))
    total = len(rows)
    print(f"Found {total} legacy records.")

    moved = 0
    skipped = 0
    errors = 0

    session = SessionLocal()
    try:
        org, user = ensure_defaults(session)
        for row in rows:
            try:
                result = migrate_row(session, row, org, user)
                if result is None:
                    skipped += 1
                else:
                    moved += 1
            except Exception as exc:
                session.rollback()
                errors += 1
                print(f"Error migrating row {dict(row)}: {exc}")
        session.commit()
    finally:
        session.close()

    print("=== Migration Summary ===")
    print(f"Moved: {moved}")
    print(f"Skipped: {skipped}")
    print(f"Errors: {errors}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Migrate legacy history DB to new schema.")
    parser.add_argument(
        "--legacy-db",
        type=Path,
        default=Path("backend/analysis_history.db"),
        help="Path to legacy SQLite DB (default: backend/analysis_history.db)",
    )
    args = parser.parse_args()
    migrate(args.legacy_db)


if __name__ == "__main__":
    main()
