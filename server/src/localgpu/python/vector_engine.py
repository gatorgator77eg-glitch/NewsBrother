#!/usr/bin/env python3
"""
Vector Embedding & Topic Clustering Engine — Outputs JSON to stdout.
Usage: python vector_engine.py <db_path> [--embed-model nomic-embed-text] [--clusters 10] [--batch-size 32]
"""
import sys
import json
import sqlite3
import struct
import argparse
import hashlib

def text_hash(text: str) -> str:
    return hashlib.md5(text.encode()).hexdigest()[:8]

def fallback_embed(text: str, dim: int = 384) -> list:
    """Deterministic pseudo-embedding based on text hash — no ML model needed."""
    h = hashlib.sha512(text.encode()).digest()
    vec = []
    for i in range(dim):
        val = (h[i % len(h)] / 255.0) * 2 - 1  # normalize to [-1, 1]
        vec.append(round(val, 6))
    norm = sum(v*v for v in vec) ** 0.5
    if norm > 0:
        vec = [v / norm for v in vec]
    return vec

def cosine_sim(a: list, b: list) -> float:
    dot = sum(x*y for x, y in zip(a, b))
    na = sum(x*x for x in a) ** 0.5
    nb = sum(x*x for x in b) ** 0.5
    if na == 0 or nb == 0:
        return 0
    return dot / (na * nb)

def mini_batch_kmeans(vectors: list, k: int, max_iter: int = 20) -> list:
    """Simple mini-batch K-means clustering."""
    import random
    n = len(vectors)
    if n < k:
        return [0] * n

    dim = len(vectors[0])
    # Initialize centroids randomly from data
    centroids = [list(vectors[i]) for i in random.sample(range(n), k)]
    assignments = [0] * n

    for iteration in range(max_iter):
        # Assign
        changed = False
        for i, v in enumerate(vectors):
            best_c = 0
            best_sim = -1
            for c, cent in enumerate(centroids):
                s = cosine_sim(v, cent)
                if s > best_sim:
                    best_sim = s
                    best_c = c
            if assignments[i] != best_c:
                changed = True
                assignments[i] = best_c

        if not changed:
            break

        # Update centroids
        for c in range(k):
            members = [vectors[i] for i in range(n) if assignments[i] == c]
            if members:
                centroids[c] = [sum(m[d] for m in members) / len(members) for d in range(dim)]

    return assignments

def vec_to_blob(vec: list) -> bytes:
    return struct.pack(f'{len(vec)}f', *vec)

def blob_to_vec(blob: bytes) -> list:
    n = len(blob) // 4
    return list(struct.unpack(f'{n}f', blob))

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('db_path', help='Path to news.db')
    parser.add_argument('--embed-model', default='nomic-embed-text')
    parser.add_argument('--clusters', type=int, default=10)
    parser.add_argument('--batch-size', type=int, default=32)
    parser.add_argument('--limit', type=int, default=0)
    args = parser.parse_args()

    conn = sqlite3.connect(args.db_path)
    cur = conn.cursor()

    # Ensure tables exist
    cur.execute("""CREATE TABLE IF NOT EXISTS article_embeddings (
        article_id INTEGER PRIMARY KEY,
        embedding BLOB,
        model TEXT DEFAULT ''
    )""")
    cur.execute("""CREATE TABLE IF NOT EXISTS topic_clusters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        label TEXT,
        centroid BLOB,
        article_count INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
    )""")
    cur.execute("""CREATE TABLE IF NOT EXISTS cluster_assignments (
        article_id INTEGER PRIMARY KEY,
        cluster_id INTEGER,
        distance REAL DEFAULT 0
    )""")
    conn.commit()

    # Step 1: Generate embeddings for articles without them
    query = """SELECT na.id, na.title FROM news_archive na
               LEFT JOIN article_embeddings ae ON na.id = ae.article_id
               WHERE ae.article_id IS NULL AND na.title != ''"""
    if args.limit > 0:
        query += f" LIMIT {args.limit}"
    cur.execute(query)
    rows = cur.fetchall()

    if rows:
        print(json.dumps({"status": "embedding", "total": len(rows), "model": args.embed_model}))
        sys.stdout.flush()

        # Try to use Ollama for real embeddings
        ollama_ok = False
        try:
            import urllib.request
            req = urllib.request.Request('http://localhost:11434/api/tags')
            resp = urllib.request.urlopen(req, timeout=3)
            ollama_ok = resp.status == 200
        except:
            pass

        batch = []
        batch_ids = []
        for row_id, title in rows:
            batch.append(title)
            batch_ids.append(row_id)

            if len(batch) >= args.batch_size:
                _process_embeddings(cur, batch, batch_ids, ollama_ok, args.embed_model)
                conn.commit()
                print(json.dumps({"status": "embedding", "processed": len(batch_ids), "total": len(rows)}))
                sys.stdout.flush()
                batch, batch_ids = [], []

        if batch:
            _process_embeddings(cur, batch, batch_ids, ollama_ok, args.embed_model)
            conn.commit()

    # Step 2: Run clustering
    cur.execute("SELECT article_id, embedding FROM article_embeddings WHERE embedding IS NOT NULL")
    emb_rows = cur.fetchall()

    if len(emb_rows) >= args.clusters:
        print(json.dumps({"status": "clustering", "articles": len(emb_rows), "k": args.clusters}))
        sys.stdout.flush()

        ids = [r[0] for r in emb_rows]
        vectors = [blob_to_vec(r[1]) for r in emb_rows]
        assignments = mini_batch_kmeans(vectors, args.clusters)

        # Clear old clusters
        cur.execute("DELETE FROM topic_clusters")
        cur.execute("DELETE FROM cluster_assignments")

        cluster_counts = {}
        for aid, cid in zip(ids, assignments):
            cur.execute("INSERT OR REPLACE INTO cluster_assignments (article_id, cluster_id) VALUES (?, ?)", (aid, cid))
            cluster_counts[cid] = cluster_counts.get(cid, 0) + 1

        # Save cluster labels and centroids
        for cid in range(args.clusters):
            members = [vectors[i] for i in range(len(vectors)) if assignments[i] == cid]
            if members:
                dim = len(members[0])
                centroid = [sum(m[d] for m in members) / len(members) for d in range(dim)]
                # Get sample titles for label
                member_ids = [ids[i] for i in range(len(ids)) if assignments[i] == cid][:5]
                placeholders = ','.join(['?'] * len(member_ids))
                cur.execute(f"SELECT title FROM news_archive WHERE id IN ({placeholders})", member_ids)
                titles = [r[0][:80] for r in cur.fetchall()]
                label = ' | '.join(titles[:3]) if titles else f'Cluster {cid}'
                cur.execute(
                    "INSERT INTO topic_clusters (label, centroid, article_count) VALUES (?, ?, ?)",
                    (label[:200], vec_to_blob(centroid), cluster_counts.get(cid, 0))
                )

        conn.commit()
        print(json.dumps({"status": "done", "clusters": args.clusters, "total_articles": len(ids)}))
    else:
        print(json.dumps({"status": "done", "clusters": 0, "message": "Not enough articles for clustering"}))

    conn.close()


def _process_embeddings(cur, batch, batch_ids, use_ollama, model):
    if use_ollama:
        try:
            import urllib.request
            for text, aid in zip(batch, batch_ids):
                data = json.dumps({"model": model, "prompt": text[:512]}).encode()
                req = urllib.request.Request('http://localhost:11434/api/embeddings', data=data, headers={'Content-Type': 'application/json'})
                resp = urllib.request.urlopen(req, timeout=10)
                result = json.loads(resp.read())
                vec = result.get('embedding', [])
                if vec:
                    cur.execute("INSERT OR REPLACE INTO article_embeddings (article_id, embedding, model) VALUES (?, ?, ?)",
                                (aid, vec_to_blob(vec), model))
                    continue
        except Exception:
            pass

    # Fallback: deterministic pseudo-embedding
    for text, aid in zip(batch, batch_ids):
        vec = fallback_embed(text)
        cur.execute("INSERT OR REPLACE INTO article_embeddings (article_id, embedding, model) VALUES (?, ?, ?)",
                     (aid, vec_to_blob(vec), 'fallback'))


if __name__ == '__main__':
    main()
