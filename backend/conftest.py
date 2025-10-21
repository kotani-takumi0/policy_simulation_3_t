from __future__ import annotations

import sys
from pathlib import Path


def _ensure_repo_root_on_sys_path() -> None:
    # This file lives in `<repo>/backend/conftest.py`.
    # Add `<repo>` to sys.path so `import backend.app...` works even when
    # running `pytest` from the `backend/` directory.
    backend_dir = Path(__file__).resolve().parent
    repo_root = backend_dir.parent
    repo_root_str = str(repo_root)
    if repo_root_str not in sys.path:
        sys.path.insert(0, repo_root_str)


_ensure_repo_root_on_sys_path()

