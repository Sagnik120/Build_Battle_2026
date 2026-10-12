"""Dependency-free clustering for the ``cloud`` profile.

TF-IDF over unigrams+bigrams, then spherical k-means with deterministic
farthest-first seeding. No numpy: sparse dict vectors keep the resident set
small enough for a 512 MB free-tier instance.
"""

from __future__ import annotations

import math
from collections import Counter

from app.intelligence.clustering.base import Cluster, target_k
from app.intelligence.text import terms

Vector = dict[str, float]


def _dot(a: Vector, b: Vector) -> float:
    if len(a) > len(b):
        a, b = b, a
    return sum(v * b.get(k, 0.0) for k, v in a.items())


def _unit(v: Vector) -> Vector:
    norm = math.sqrt(sum(x * x for x in v.values()))
    return {k: x / norm for k, x in v.items()} if norm else v


def tfidf(texts: list[str]) -> list[Vector]:
    docs = [Counter(terms(t)) for t in texts]
    df = Counter(term for doc in docs for term in doc)
    n = len(docs)
    return [
        _unit({t: (1 + math.log(c)) * (math.log((1 + n) / (1 + df[t])) + 1) for t, c in doc.items()})
        for doc in docs
    ]


def _centroid(vectors: list[Vector], members: list[int], weights: list[int]) -> Vector:
    acc: Vector = {}
    for i in members:
        for term, value in vectors[i].items():
            acc[term] = acc.get(term, 0.0) + value * weights[i]
    return _unit(acc)


def _kmeans(vectors: list[Vector], weights: list[int], k: int, iters: int = 25) -> list[int]:
    # Farthest-first seeding from the heaviest document: deterministic and spread out.
    seeds = [max(range(len(vectors)), key=lambda i: weights[i])]
    while len(seeds) < k:
        seeds.append(
            max(range(len(vectors)), key=lambda i: min(1 - _dot(vectors[i], vectors[s]) for s in seeds))
        )
    centroids = [dict(vectors[s]) for s in seeds]
    labels = [-1] * len(vectors)
    for _ in range(iters):
        new = [max(range(k), key=lambda c: _dot(v, centroids[c])) for v in vectors]
        if new == labels:
            break
        labels = new
        for c in range(k):
            members = [i for i, lab in enumerate(labels) if lab == c]
            if members:
                centroids[c] = _centroid(vectors, members, weights)
    return labels


def _cohesion(vectors: list[Vector], labels: list[int], weights: list[int], k: int) -> float:
    """Mean similarity to own centroid minus mean similarity to nearest other."""
    groups = [[i for i, lab in enumerate(labels) if lab == c] for c in range(k)]
    centroids = [_centroid(vectors, g, weights) if g else {} for g in groups]
    total = 0.0
    for i, v in enumerate(vectors):
        own = _dot(v, centroids[labels[i]])
        other = max((_dot(v, c) for j, c in enumerate(centroids) if j != labels[i] and c), default=0.0)
        total += own - other
    return total / len(vectors)


class LiteClusterer:
    name = "lite"

    def cluster(self, texts: list[str], weights: list[int] | None = None) -> list[Cluster]:
        if not texts:
            return []
        weights = weights or [1] * len(texts)
        vectors = tfidf(texts)
        if len(texts) < 4:
            labels, k = [0] * len(texts), 1
        else:
            best: tuple[float, list[int], int] | None = None
            for k_try in target_k(len(texts)):
                trial = _kmeans(vectors, weights, k_try)
                score = _cohesion(vectors, trial, weights, k_try)
                if best is None or score > best[0]:
                    best = (score, trial, k_try)
            assert best is not None
            _, labels, k = best

        clusters: list[Cluster] = []
        for c in range(k):
            members = [i for i, lab in enumerate(labels) if lab == c]
            if not members:
                continue
            centroid = _centroid(vectors, members, weights)
            top = sorted(centroid.items(), key=lambda kv: -kv[1])[:6]
            clusters.append(Cluster(members=members, top_terms=[t for t, _ in top]))
        return clusters

# InsightFlow build iteration: commit 170
