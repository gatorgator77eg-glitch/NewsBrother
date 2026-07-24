import { Router, Request, Response } from 'express';
import { createLogger } from '../logger';
import { getNewsArchiveDb } from '../newsArchive/db';

const log = createLogger({ module: 'alerts' });
export const alertsRoutes = Router();

interface AlertConfig {
  sentimentThreshold: number;
  volumeThreshold: number;
  toneShiftThreshold: number;
  enabled: boolean;
}

let alertConfig: AlertConfig = {
  sentimentThreshold: 5,
  volumeThreshold: 50,
  toneShiftThreshold: 3,
  enabled: true,
};

interface AlertEntry {
  id: string;
  type: 'sentiment_spike' | 'volume_surge' | 'tone_shift';
  message: string;
  severity: 'high' | 'medium' | 'low';
  timestamp: string;
  metadata: Record<string, any>;
}

alertsRoutes.get('/config', (_req: Request, res: Response) => {
  res.json({ config: alertConfig });
});

alertsRoutes.post('/config', (req: Request, res: Response) => {
  const { sentimentThreshold, volumeThreshold, toneShiftThreshold, enabled } = req.body;
  if (sentimentThreshold !== undefined) alertConfig.sentimentThreshold = sentimentThreshold;
  if (volumeThreshold !== undefined) alertConfig.volumeThreshold = volumeThreshold;
  if (toneShiftThreshold !== undefined) alertConfig.toneShiftThreshold = toneShiftThreshold;
  if (enabled !== undefined) alertConfig.enabled = enabled;
  res.json({ config: alertConfig });
});

alertsRoutes.get('/scan', async (_req: Request, res: Response) => {
  try {
    const db = await getNewsArchiveDb();
    if (!alertConfig.enabled) return res.json({ alerts: [], scannedAt: new Date().toISOString() });

    const alerts: AlertEntry[] = [];
    let alertId = 0;

    const spikeResult = db.exec(`
      SELECT source_country, AVG(tone) as avg_tone, COUNT(*) as cnt
      FROM news_archive
      WHERE published_at >= date('now', '-1 day') AND tone != 0 AND source_country != ''
      GROUP BY source_country
      HAVING cnt >= 3
    `);

    const baselineResult = db.exec(`
      SELECT source_country, AVG(tone) as avg_tone, COUNT(*) as cnt
      FROM news_archive
      WHERE published_at >= date('now', '-7 days') AND published_at < date('now', '-1 day')
        AND tone != 0 AND source_country != ''
      GROUP BY source_country
      HAVING cnt >= 5
    `);

    const baseline: Record<string, number> = {};
    for (const row of (baselineResult[0]?.values || [])) {
      baseline[row[0] as string] = row[1] as number;
    }

    for (const row of (spikeResult[0]?.values || [])) {
      const country = row[0] as string;
      const todayTone = row[1] as number;
      const count = row[2] as number;
      const yesterdayTone = baseline[country];

      if (yesterdayTone !== undefined) {
        const shift = Math.abs(todayTone - yesterdayTone);
        if (shift >= alertConfig.toneShiftThreshold) {
          alerts.push({
            id: `alert-${++alertId}`,
            type: 'tone_shift',
            message: `Tone shifted ${shift.toFixed(1)} points for ${country} (from ${yesterdayTone.toFixed(1)} to ${todayTone.toFixed(1)})`,
            severity: shift >= 5 ? 'high' : shift >= 3 ? 'medium' : 'low',
            timestamp: new Date().toISOString(),
            metadata: { country, todayTone, yesterdayTone, shift },
          });
        }
      }
    }

    const volumeResult = db.exec(`
      SELECT source_country, COUNT(*) as cnt
      FROM news_archive
      WHERE published_at >= date('now', '-1 day') AND source_country != ''
      GROUP BY source_country
    `);

    const volumeBaseline = db.exec(`
      SELECT source_country, AVG(daily_count) as avg_daily
      FROM (
        SELECT date(published_at) as day, source_country, COUNT(*) as daily_count
        FROM news_archive
        WHERE published_at >= date('now', '-8 days') AND published_at < date('now', '-1 day')
          AND source_country != ''
        GROUP BY day, source_country
      )
      GROUP BY source_country
    `);

    const volBaseline: Record<string, number> = {};
    for (const row of (volumeBaseline[0]?.values || [])) {
      volBaseline[row[0] as string] = row[1] as number;
    }

    for (const row of (volumeResult[0]?.values || [])) {
      const country = row[0] as string;
      const count = row[1] as number;
      const avgDaily = volBaseline[country];
      if (avgDaily !== undefined && avgDaily > 0) {
        const surgeRatio = count / avgDaily;
        if (surgeRatio >= 2 && count >= alertConfig.volumeThreshold) {
          alerts.push({
            id: `alert-${++alertId}`,
            type: 'volume_surge',
            message: `Volume surged ${surgeRatio.toFixed(1)}x for ${country} (${count} articles today vs avg ${avgDaily.toFixed(0)})`,
            severity: surgeRatio >= 3 ? 'high' : 'medium',
            timestamp: new Date().toISOString(),
            metadata: { country, todayCount: count, avgDaily: Math.round(avgDaily), surgeRatio },
          });
        }
      }
    }

    alerts.sort((a, b) => {
      const sev = { high: 3, medium: 2, low: 1 };
      return sev[b.severity] - sev[a.severity];
    });

    res.json({ alerts, scannedAt: new Date().toISOString(), config: alertConfig });
  } catch (err: any) {
    log.error('Alert scan failed', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Alert scan failed' });
  }
});
