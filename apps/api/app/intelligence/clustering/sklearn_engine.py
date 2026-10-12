"""scikit-learn clustering for the ``local`` profile.

Sub-linear TF-IDF over 1-2 grams, k-means++ with several restarts, and the
cluster count chosen by silhouette score rather than guessed.
"""

from __future__ import annotations

from app.intelligence.clustering.base import Cluster, target_k
from app.intelligence.text import STOPWORDS


class SklearnClusterer:
    name = "sklearn"

    def cluster(self, texts: list[str], weights: list[int] | None = None) -> list[Cluster]:
        import numpy as np
        from sklearn.cluster import KMeans
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.metrics import silhouette_score

        if not texts:
            return []
        vectorizer = TfidfVectorizer(
            ngram_range=(1, 2), sublinear_tf=True, stop_words=sorted(STOPWORDS), min_df=1
        )
        try:
            matrix = vectorizer.fit_transform(texts)
        except ValueError:  # every token was a stop word
            return [Cluster(members=list(range(len(texts))), top_terms=[])]
        vocab = np.array(vectorizer.get_feature_names_out())
        sample_weight = np.array(weights or [1] * len(texts), dtype=float)

        if len(texts) < 4:
            labels, centers = np.zeros(len(texts), dtype=int), matrix.mean(axis=0).A
        else:
            best = None
            for k in target_k(len(texts)):
                model = KMeans(n_clusters=k, n_init=5, random_state=7)
                trial = model.fit_predict(matrix, sample_weight=sample_weight)
                if len(set(trial)) < 2:
                    continue
                score = silhouette_score(matrix, trial, metric="cosine")
                if best is None or score > best[0]:
                    best = (score, trial, model.cluster_centers_)
            if best is None:
                labels, centers = np.zeros(len(texts), dtype=int), matrix.mean(axis=0).A
            else:
                _, labels, centers = best

        clusters: list[Cluster] = []
        for c in sorted(set(labels.tolist())):
            members = np.flatnonzero(labels == c).tolist()
            top = vocab[np.argsort(centers[c])[::-1][:6]].tolist()
            clusters.append(Cluster(members=members, top_terms=top))
        return clusters
