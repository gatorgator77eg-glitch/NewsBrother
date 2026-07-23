import { Router } from 'express';

export const stockHistoryRoutes = Router();

stockHistoryRoutes.get('/stock-history', async (req, res) => {
  try {
    const symbol = (req.query.symbol as string || '').toUpperCase().trim();
    const range = (req.query.range as string) || '1y';
    const interval = (req.query.interval as string) || '1d';

    if (!symbol) {
      res.status(400).json({ error: 'Symbol is required' });
      return;
    }

    const validRanges: Record<string, string> = {
      '1d': '1d',
      '5d': '5d',
      '1mo': '1mo',
      '3mo': '3mo',
      '6mo': '6mo',
      '1y': '1y',
      '2y': '2y',
      '5y': '5y',
      '10y': '10y',
      'max': 'max',
    };
    const validIntervals: Record<string, string> = {
      '1d': '1d',
      '1wk': '1wk',
      '1mo': '1mo',
    };

    const useRange = validRanges[range] || '1y';
    const useInterval = validIntervals[interval] || '1d';

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${useRange}&interval=${useInterval}&includePrePost=false`;

    const result = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!result.ok) {
      if (result.status === 404) {
        res.status(404).json({ error: `Symbol "${symbol}" not found` });
        return;
      }
      res.status(result.status).json({ error: `Yahoo Finance returned ${result.status}` });
      return;
    }

    const data: any = await result.json();
    const chart = data?.chart?.result?.[0];

    if (!chart) {
      res.status(404).json({ error: `No data found for "${symbol}"` });
      return;
    }

    const meta = chart.meta;
    const timestamps = chart.timestamp || [];
    const quote = chart.indicators?.quote?.[0] || {};

    const candles = timestamps.map((ts: number, i: number) => ({
      date: new Date(ts * 1000).toISOString().split('T')[0],
      open: quote.open?.[i] != null ? Math.round(quote.open[i] * 100) / 100 : null,
      high: quote.high?.[i] != null ? Math.round(quote.high[i] * 100) / 100 : null,
      low: quote.low?.[i] != null ? Math.round(quote.low[i] * 100) / 100 : null,
      close: quote.close?.[i] != null ? Math.round(quote.close[i] * 100) / 100 : null,
      volume: quote.volume?.[i] || 0,
    })).filter((c: any) => c.close !== null);

    res.json({
      symbol: meta.symbol,
      currency: meta.currency,
      exchange: meta.exchangeName,
      range: useRange,
      interval: useInterval,
      candles,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error(`Stock history error for ${req.query.symbol}:`, err.message);
    res.status(500).json({ error: 'Failed to fetch stock data' });
  }
});
