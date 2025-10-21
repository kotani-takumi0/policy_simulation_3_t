from __future__ import annotations

from typing import Iterable, List


def list_to_csv(values: Iterable[str]) -> str:
    return ",".join(v.strip() for v in values if v is not None)


def csv_to_list(value: str | None) -> List[str]:
    if not value:
        return []
    return [segment.strip() for segment in value.split(",") if segment.strip()]


__all__ = ["list_to_csv", "csv_to_list"]
