const YahooFinance = require('yahoo-finance2').default;
const yf = new YahooFinance({ validation: { logErrors: false }, suppressNotices: ['ripHistorical'] });

// Try known SGX-listed SRS-eligible ETFs
const sgxTickers = [
  'ES3.SI',  // STI ETF
  'A35.SI',  // ABF SG Bond ETF
  'C6L.SI',  // SIA
  'D05.SI',  // DBS
  'O39.SI',  // OCBC
  'U11.SI',  // UOB
  'BN4.SI',  // Keppel
  'C52.SI',  // ComfortDelGro
  'C61.SI',  // CapitaLand
  'A17.SI',  // SGX
];

async function test() {
  for (const t of sgxTickers) {
    try {
      const r = await yf.chart(t, { period1: new Date(Date.now() - 30*86400000), interval: '1d' });
      const q = r?.quotes || [];
      console.log(`${t}: ${q.length} quotes, last=${q[q.length-1]?.close?.toFixed(2)}`);
    } catch (e) {
      console.log(`${t}: FAILED`);
    }
  }
}
test();
