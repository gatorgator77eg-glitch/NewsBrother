import { getStockDb } from './stocks/db';
import { runFullDownload } from './stocks/downloader';

(async () => {
  console.log('🚀 Starting stock database download...');
  console.log('   This will fetch ~5000 tickers and download 10 years of daily price data.');
  console.log('   Estimated time: 1-2 hours. Press Ctrl+C to pause (resume will skip already-downloaded tickers).\n');

  await getStockDb();
  console.log('📦 Stock database initialized.\n');

  await runFullDownload();
  console.log('\n🎉 Done!');
  process.exit(0);
})();
