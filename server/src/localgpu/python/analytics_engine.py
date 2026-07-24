#!/usr/bin/env python3
"""
GPU-Accelerated Stock Analytics Engine — Outputs JSON to stdout.
Usage: python analytics_engine.py <stocks_db_path> [--window 90] [--gpu false]
"""
import sys
import json
import sqlite3
import argparse
import time

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('db_path', help='Path to stocks.db')
    parser.add_argument('--window', type=int, default=90, help='Rolling window in days')
    parser.add_argument('--gpu', default='false', help='Enable GPU acceleration (true/false)')
    parser.add_argument('--tickers', default='', help='Comma-separated tickers, empty = all')
    args = parser.parse_args()

    use_gpu = args.gpu.lower() == 'true'
    xp = None

    if use_gpu:
        try:
            import cupy as cp
            xp = cp
            print(json.dumps({"status": "gpu_init", "backend": "cupy", "gpu": True}))
        except ImportError:
            print(json.dumps({"status": "gpu_init", "backend": "numpy", "gpu": False, "note": "CuPy not installed, falling back to NumPy"}))
            use_gpu = False

    if not use_gpu:
        import numpy as np
        xp = np

    sys.stdout.flush()

    conn = sqlite3.connect(args.db_path)
    cur = conn.cursor()

    # Get tickers to process
    if args.tickers:
        ticker_list = [t.strip() for t in args.tickers.split(',') if t.strip()]
    else:
        cur.execute("SELECT DISTINCT symbol FROM stock_prices GROUP BY symbol HAVING COUNT(*) > 30 LIMIT 500")
        ticker_list = [r[0] for r in cur.fetchall()]

    total = len(ticker_list)
    print(json.dumps({"status": "starting", "tickers": total, "window": args.window}))
    sys.stdout.flush()

    results = []
    batch_size = 50
    processed = 0
    start_time = time.time()

    for i in range(0, total, batch_size):
        batch = ticker_list[i:i+batch_size]
        for symbol in batch:
            cur.execute(
                "SELECT close, high, low, volume FROM stock_prices WHERE symbol = ? ORDER BY date DESC LIMIT ?",
                (symbol, args.window)
            )
            rows = cur.fetchall()
            if len(rows) < 10:
                continue

            closes = xp.array([r[0] for r in rows if r[0]], dtype=xp.float32)
            highs = xp.array([r[1] for r in rows if r[1]], dtype=xp.float32)
            lows = xp.array([r[2] for r in rows if r[2]], dtype=xp.float32)
            volumes = xp.array([r[3] for r in rows if r[3]], dtype=xp.float32)

            if len(closes) < 10:
                continue

            # Returns
            returns = xp.diff(closes) / closes[:-1]

            # Volatility (annualized)
            volatility = float(xp.std(returns) * (252 ** 0.5)) if len(returns) > 1 else 0

            # Sharpe-like ratio (assume 0 risk-free)
            mean_ret = float(xp.mean(returns))
            sharpe = mean_ret / (xp.std(returns) + 1e-10) * (252 ** 0.5) if len(returns) > 1 else 0

            # Max drawdown
            peak = xp.maximum.accumulate(closes)
            drawdowns = (peak - closes) / peak
            max_drawdown = float(xp.max(drawdowns)) * 100

            # RSI (14-day)
            if len(returns) >= 14:
                gains = xp.where(returns > 0, returns, 0)
                losses = xp.where(returns < 0, -returns, 0)
                avg_gain = float(xp.mean(gains[-14:]))
                avg_loss = float(xp.mean(losses[-14:]))
                rs = avg_gain / (avg_loss + 1e-10)
                rsi = 100 - (100 / (1 + rs))
            else:
                rsi = 50

            # Volume trend
            vol_recent = float(xp.mean(volumes[:7])) if len(volumes) >= 7 else 0
            vol_prev = float(xp.mean(volumes[7:14])) if len(volumes) >= 14 else vol_recent
            vol_change = ((vol_recent - vol_prev) / (vol_prev + 1)) * 100

            # Move to CPU for JSON serialization
            if use_gpu:
                import cupy
                volatility = float(cupy.asnumpy(volatility)) if hasattr(volatility, 'get') else volatility
                sharpe = float(cupy.asnumpy(sharpe)) if hasattr(sharpe, 'get') else sharpe
                rsi = float(cupy.asnumpy(rsi)) if hasattr(rsi, 'get') else rsi

            results.append({
                'symbol': symbol,
                'window': len(closes),
                'volatility': round(volatility, 4),
                'sharpe': round(float(sharpe), 4),
                'max_drawdown': round(max_drawdown, 2),
                'rsi': round(rsi, 2),
                'volume_change_pct': round(vol_change, 2),
                'last_close': round(float(closes[0]), 2),
            })
            processed += 1

        elapsed = time.time() - start_time
        print(json.dumps({
            "status": "processing",
            "processed": processed,
            "total": total,
            "elapsed_sec": round(elapsed, 1),
        }))
        sys.stdout.flush()

    # Save results to stock_meta
    for r in results:
        cur.execute(
            "INSERT OR REPLACE INTO stock_meta (key, value) VALUES (?, ?)",
            (f"gpu_analysis:{r['symbol']}", json.dumps(r))
        )
    conn.commit()
    conn.close()

    elapsed = time.time() - start_time
    print(json.dumps({
        "status": "done",
        "processed": processed,
        "elapsed_sec": round(elapsed, 1),
        "gpu_used": use_gpu,
        "window": args.window,
    }))


if __name__ == '__main__':
    main()
