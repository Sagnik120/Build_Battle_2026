from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(slots=True)
class Cluster:
    members: list[int]  # indexes into the input texts
    top_terms: list[str]


class Clusterer(Protocol):
    name: str

    def cluster(self, texts: list[str], weights: list[int] | None = None) -> list[Cluster]:
        """Group ``texts`` into topical clusters. ``weights`` = how many raw
        feedback entries each distinct text stands for."""
        ...


def target_k(n_docs: int) -> range:
    """Candidate cluster counts for ``n_docs`` distinct messages."""
    upper = max(2, min(12, n_docs // 3))
    return range(2, upper + 1)
