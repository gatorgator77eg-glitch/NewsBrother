#!/usr/bin/env python3
"""
Batch stock downloader using yfinance.
Downloads all tickers in parallel batches and saves as individual CSVs.
Also fetches ticker metadata (name, exchange, sector, etc).

Usage:
  python batch_download.py                  # download missing tickers only
  python batch_download.py --all            # download all tickers
  python batch_download.py --update         # update existing tickers with recent data
  python batch_download.py --tickers AAPL,MSFT,GOOGL  # specific tickers
"""

import argparse
import csv
import json
import os
import sqlite3
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

import yfinance as yf
import pandas as pd


DB_PATH = Path(__file__).parent.parent.parent / "data" / "stocks.db"
TICKER_FILE = Path(__file__).parent.parent.parent.parent / "tickers_world_stock.txt"
PROGRESS_FILE = Path(__file__).parent.parent.parent / "data" / "stock-progress.json"
BATCH_SIZE = 50  # tickers per batch
DELAY_BETWEEN_BATCHES = 1.0  # seconds


def write_progress(data):
    try:
        PROGRESS_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(PROGRESS_FILE, "w") as f:
            json.dump(data, f, indent=2)
    except Exception:
        pass


def get_existing_symbols(db):
    """Get set of symbols that already have price data."""
    try:
        rows = db.execute("SELECT DISTINCT symbol FROM stock_prices").fetchall()
        return {r[0] for r in rows}
    except Exception:
        return set()


def get_last_dates(db):
    """Get last price date for each symbol."""
    try:
        rows = db.execute(
            "SELECT symbol, MAX(date) FROM stock_prices GROUP BY symbol"
        ).fetchall()
        return {r[0]: r[1] for r in rows}
    except Exception:
        return {}


def get_known_tickers(db):
    """Get set of symbols in stock_tickers table."""
    try:
        rows = db.execute("SELECT symbol FROM stock_tickers").fetchall()
        return {r[0] for r in rows}
    except Exception:
        return set()


def load_ticker_symbols():
    if not TICKER_FILE.exists():
        print(f"Ticker file not found: {TICKER_FILE}")
        return []
    with open(TICKER_FILE) as f:
        symbols = [line.strip().upper() for line in f if line.strip() and not line.startswith("#")]
    return list(dict.fromkeys(symbols))  # unique, preserve order


def download_batch(symbols, period="10y"):
    """Download OHLCV data for a batch of tickers using yfinance."""
    results = {}
    try:
        data = yf.download(
            symbols,
            period=period,
            interval="1d",
            group_by="ticker",
            progress=False,
            threads=True,
            timeout=30,
        )
    except Exception as e:
        print(f"  Batch download error: {e}")
        return results

    if len(symbols) == 1:
        sym = symbols[0]
        if data is not None and not data.empty:
            results[sym] = parse_yf_data(data, sym)
        return results

    for sym in symbols:
        try:
            if sym in data.columns.get_level_values(0):
                ticker_data = data[sym].dropna()
                if not ticker_data.empty:
                    results[sym] = parse_yf_data(ticker_data, sym)
        except Exception:
            pass

    return results


def parse_yf_data(df, symbol):
    """Parse yfinance DataFrame into list of dicts."""
    rows = []
    for idx, row in df.iterrows():
        try:
            date_str = idx.strftime("%Y-%m-%d") if hasattr(idx, "strftime") else str(idx)[:10]
            close_val = row.get("Close") or row.get("Adj Close")
            if pd.isna(close_val) or close_val is None:
                continue
            rows.append({
                "date": date_str,
                "open": round(float(row.get("Open", 0) or 0), 2),
                "high": round(float(row.get("High", 0) or 0), 2),
                "low": round(float(row.get("Low", 0) or 0), 2),
                "close": round(float(close_val), 2),
                "volume": int(row.get("Volume", 0) or 0),
            })
        except Exception:
            continue
    return rows


def download_metadata_batch(symbols):
    """Download metadata for a batch of tickers."""
    results = {}
    for sym in symbols:
        try:
            ticker = yf.Ticker(sym)
            info = ticker.info or {}
            results[sym] = {
                "symbol": sym,
                "name": info.get("shortName") or info.get("longName") or sym,
                "exchange": info.get("exchange", ""),
                "sector": info.get("sector", ""),
                "industry": info.get("industry", ""),
                "country": info.get("country", ""),
                "market_cap": info.get("marketCap", 0) or 0,
            }
        except Exception:
            results[sym] = {
                "symbol": sym,
                "name": sym,
                "exchange": "",
                "sector": "",
                "industry": "",
                "country": "",
                "market_cap": 0,
            }
    return results


def save_prices_to_db(db, symbol, prices):
    """Insert prices into stock_prices table."""
    db.executemany(
        "INSERT OR REPLACE INTO stock_prices (symbol, date, open, high, low, close, volume) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        [(symbol, p["date"], p["open"], p["high"], p["low"], p["close"], p["volume"]) for p in prices]
    )


def save_ticker_to_db(db, meta):
    """Insert/upsert ticker metadata."""
    db.execute(
        "INSERT OR REPLACE INTO stock_tickers (symbol, name, exchange, sector, industry, country, market_cap, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))",
        [meta["symbol"], meta["name"], meta["exchange"], meta["sector"],
         meta["industry"], meta["country"], meta["market_cap"]]
    )


def main():
    parser = argparse.ArgumentParser(description="Batch stock downloader")
    parser.add_argument("--all", action="store_true", help="Download all tickers")
    parser.add_argument("--update", action="store_true", help="Update existing tickers with recent data")
    parser.add_argument("--tickers", type=str, help="Comma-separated list of specific tickers")
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE, help="Tickers per batch")
    args = parser.parse_args()

    symbols = load_ticker_symbols()
    if not symbols:
        print("No tickers found")
        return

    print(f"Loaded {len(symbols)} tickers from file")

    # Ensure DB exists
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(str(DB_PATH))

    # Create tables if needed
    db.execute("""
        CREATE TABLE IF NOT EXISTS stock_tickers (
            symbol TEXT PRIMARY KEY,
            name TEXT NOT NULL DEFAULT '',
            exchange TEXT DEFAULT '',
            sector TEXT DEFAULT '',
            industry TEXT DEFAULT '',
            country TEXT DEFAULT '',
            market_cap REAL DEFAULT 0,
            updated_at TEXT DEFAULT (datetime('now'))
        )
    """)
    db.execute("""
        CREATE TABLE IF NOT EXISTS stock_prices (
            symbol TEXT NOT NULL,
            date TEXT NOT NULL,
            open REAL, high REAL, low REAL, close REAL,
            volume INTEGER DEFAULT 0,
            PRIMARY KEY (symbol, date)
        )
    """)
    db.execute("""
        CREATE TABLE IF NOT EXISTS stock_meta (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    """)
    db.execute("CREATE INDEX IF NOT EXISTS idx_stock_prices_symbol ON stock_prices(symbol)")
    db.execute("CREATE INDEX IF NOT EXISTS idx_stock_prices_date ON stock_prices(date)")
    db.execute("CREATE INDEX IF NOT EXISTS idx_stock_tickers_cap ON stock_tickers(market_cap DESC)")
    db.commit()

    # Determine what to download
    if args.tickers:
        to_download = [s.upper() for s in args.tickers.split(",")]
        period = "10y"
        print(f"Downloading {len(to_download)} specified tickers")
    elif args.update:
        last_dates = get_last_dates(db)
        today = datetime.now().strftime("%Y-%m-%d")
        to_download = [s for s in symbols if last_dates.get(s, "") < today]
        period = "3mo"  # just recent data for updates
        print(f"Updating {len(to_download)} stale tickers (recent 3 months)")
    elif args.all:
        to_download = symbols
        period = "10y"
        print(f"Downloading ALL {len(to_download)} tickers")
    else:
        existing = get_existing_symbols(db)
        to_download = [s for s in symbols if s not in existing]
        period = "10y"
        print(f"Downloading {len(to_download)} missing tickers ({len(existing)} already have data)")

    if not to_download:
        print("Nothing to download!")
        db.close()
        return

    # Set status
    db.execute("INSERT OR REPLACE INTO stock_meta (key, value) VALUES (?, ?)", ("status", "batch_downloading"))
    db.execute("INSERT OR REPLACE INTO stock_meta (key, value) VALUES (?, ?)", ("started_at", datetime.now().isoformat()))
    db.execute("INSERT OR REPLACE INTO stock_meta (key, value) VALUES (?, ?)", ("total_to_fetch", str(len(to_download))))
    db.commit()

    # Download metadata for tickers not yet in DB
    known = get_known_tickers(db)
    need_meta = [s for s in to_download if s not in known]
    if need_meta:
        print(f"\nFetching metadata for {len(need_meta)} new tickers...")
        for i in range(0, len(need_meta), 10):
            batch = need_meta[i:i+10]
            meta = download_metadata_batch(batch)
            for m in meta.values():
                save_ticker_to_db(db, m)
            db.commit()
            if (i + 10) % 100 == 0:
                print(f"  Metadata: {min(i+10, len(need_meta))}/{len(need_meta)}")

    # Download prices in batches
    downloaded = 0
    errors = 0
    skipped = 0
    start_time = time.time()
    total = len(to_download)

    print(f"\nDownloading {total} tickers in batches of {args.batch_size}...")
    print(f"Period: {period}")

    for i in range(0, total, args.batch_size):
        batch = to_download[i:i+args.batch_size]
        batch_num = i // args.batch_size + 1
        total_batches = (total + args.batch_size - 1) // args.batch_size

        try:
            prices = download_batch(batch, period=period)

            for sym, rows in prices.items():
                if rows:
                    save_prices_to_db(db, sym, rows)
                    downloaded += 1
                else:
                    skipped += 1

            # Also mark tickers with no data
            for sym in batch:
                if sym not in prices:
                    skipped += 1

            db.commit()
            downloaded_count = downloaded + skipped

            elapsed = time.time() - start_time
            rate = downloaded_count / elapsed if elapsed > 0 else 0
            remaining = total - downloaded_count
            eta_sec = remaining / rate if rate > 0 else 0
            eta_min = round(eta_sec / 60)

            pct = round((downloaded_count / total) * 100)
            print(f"  [{batch_num}/{total_batches}] {batch[0]}-{batch[-1]} | "
                  f"{downloaded} saved, {skipped} empty, {errors} errors | "
                  f"{pct}% ETA: {eta_min}m")

            write_progress({
                "phase": "batch_downloading",
                "current": batch[-1],
                "done": downloaded_count,
                "total": total,
                "saved": downloaded,
                "errors": errors,
                "pct": pct,
                "etaMin": eta_min,
                "elapsedMin": round(elapsed / 60),
            })

            db.execute("INSERT OR REPLACE INTO stock_meta (key, value) VALUES (?, ?)",
                       ("current_index", str(downloaded_count)))
            db.commit()

        except Exception as e:
            errors += len(batch)
            print(f"  Batch error: {e}")

        if i + args.batch_size < total:
            time.sleep(DELAY_BETWEEN_BATCHES)

    # Done
    elapsed = time.time() - start_time
    status = "completed" if errors == 0 else "completed_with_errors"
    db.execute("INSERT OR REPLACE INTO stock_meta (key, value) VALUES (?, ?)", ("status", status))
    db.execute("INSERT OR REPLACE INTO stock_meta (key, value) VALUES (?, ?)", ("completed_at", datetime.now().isoformat()))
    db.commit()

    print(f"\nDone! {downloaded} saved, {skipped} empty, {errors} errors in {round(elapsed/60)} minutes")
    write_progress({
        "phase": "completed",
        "saved": downloaded,
        "errors": errors,
        "skipped": skipped,
    })

    db.close()


if __name__ == "__main__":
    main()
