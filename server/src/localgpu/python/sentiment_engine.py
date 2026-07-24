#!/usr/bin/env python3
"""
Financial Sentiment Engine — Runs as subprocess, outputs JSON to stdout.
Usage: python sentiment_engine.py <db_path> [--batch-size 16] [--model ProsusAI/finbert]
"""
import sys
import json
import sqlite3
import argparse

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('db_path', help='Path to news.db')
    parser.add_argument('--batch-size', type=int, default=16)
    parser.add_argument('--model', default='ProsusAI/finbert')
    parser.add_argument('--limit', type=int, default=0, help='0 = all unprocessed')
    args = parser.parse_args()

    # Try importing transformers
    try:
        from transformers import pipeline
    except ImportError:
        # Fallback: rule-based sentiment when transformers not installed
        fallback_sentiment(args.db_path, args.batch_size, args.limit)
        return

    conn = sqlite3.connect(args.db_path)
    cur = conn.cursor()

    # Get articles without sentiment_label
    query = "SELECT id, title, tone FROM news_archive WHERE sentiment_label IS NULL OR sentiment_label = ''"
    if args.limit > 0:
        query += f" LIMIT {args.limit}"
    cur.execute(query)
    rows = cur.fetchall()

    if not rows:
        print(json.dumps({"status": "done", "processed": 0, "message": "No unprocessed articles"}))
        conn.close()
        return

    print(json.dumps({"status": "starting", "total": len(rows), "model": args.model}))
    sys.stdout.flush()

    # Load model
    try:
        classifier = pipeline("sentiment-analysis", model=args.model, truncation=True, max_length=512)
    except Exception as e:
        print(json.dumps({"status": "error", "error": f"Failed to load model: {e}"}))
        fallback_sentiment(args.db_path, args.batch_size, args.limit)
        conn.close()
        return

    processed = 0
    batch = []
    batch_ids = []

    for row_id, title, existing_tone in rows:
        if not title:
            continue
        batch.append(title[:512])
        batch_ids.append(row_id)

        if len(batch) >= args.batch_size:
            results = classifier(batch)
            for bid, result in zip(batch_ids, results):
                label = result['label'].lower()
                score = result['score']
                cur.execute(
                    "UPDATE news_archive SET sentiment_label = ? WHERE id = ?",
                    (f"{label}:{score:.3f}", bid)
                )
                processed += 1
            conn.commit()
            print(json.dumps({"status": "processing", "processed": processed, "total": len(rows)}))
            sys.stdout.flush()
            batch, batch_ids = [], []

    # Process remaining
    if batch:
        results = classifier(batch)
        for bid, result in zip(batch_ids, results):
            label = result['label'].lower()
            score = result['score']
            cur.execute(
                "UPDATE news_archive SET sentiment_label = ? WHERE id = ?",
                (f"{label}:{score:.3f}", bid)
            )
            processed += 1
        conn.commit()

    print(json.dumps({"status": "done", "processed": processed, "total": len(rows)}))
    conn.close()


def fallback_sentiment(db_path: str, batch_size: int, limit: int):
    """Rule-based fallback when no ML model is available."""
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    query = "SELECT id, title FROM news_archive WHERE sentiment_label IS NULL OR sentiment_label = ''"
    if limit > 0:
        query += f" LIMIT {limit}"
    cur.execute(query)
    rows = cur.fetchall()

    positive_words = {'win', 'winning', 'success', 'growth', 'boom', 'rally', 'gain', 'progress', 'deal', 'agreement', 'peace', 'hope', 'surge', 'record', 'high', 'boost', 'positive', 'optimistic', 'reform'}
    negative_words = {'crisis', 'war', 'crash', 'recession', 'inflation', 'loss', 'decline', 'fall', 'fear', 'protest', 'conflict', 'sanctions', 'tariff', 'attack', 'threat', 'collapse', 'negative', 'bearish', 'plunge'}

    processed = 0
    for row_id, title in rows:
        if not title:
            continue
        lower = title.lower()
        words = set(lower.split())
        pos = len(words & positive_words)
        neg = len(words & negative_words)
        total = pos + neg
        if total == 0:
            label, score = "neutral", 0.5
        elif pos > neg:
            label, score = "positive", pos / total
        else:
            label, score = "negative", neg / total
        cur.execute("UPDATE news_archive SET sentiment_label = ? WHERE id = ?", (f"{label}:{score:.3f}", row_id))
        processed += 1
        if processed % batch_size == 0:
            conn.commit()
            print(json.dumps({"status": "processing", "processed": processed, "total": len(rows), "method": "fallback"}))
            sys.stdout.flush()

    conn.commit()
    print(json.dumps({"status": "done", "processed": processed, "total": len(rows), "method": "fallback"}))
    conn.close()


if __name__ == '__main__':
    main()
