const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const dbPath = path.join(__dirname, 'data', 'srs.db');
initSqlJs().then(SQL => {
  const buf = fs.readFileSync(dbPath);
  const db = new SQL.Database(buf);
  const isins = db.exec("SELECT DISTINCT isin FROM srs_funds WHERE isin IS NOT NULL AND isin != '' LIMIT 10");
  console.log('Sample ISINs:', JSON.stringify(isins[0]?.values));
  const count = db.exec("SELECT COUNT(DISTINCT isin) FROM srs_funds WHERE isin IS NOT NULL AND isin != ''");
  console.log('Total ISINs:', count[0]?.values[0][0]);
  const navCount = db.exec('SELECT COUNT(DISTINCT isin) FROM srs_nav_history');
  console.log('ISINs with NAV data:', navCount[0]?.values[0]?.[0] || 0);
  const navRows = db.exec('SELECT COUNT(*) FROM srs_nav_history');
  console.log('Total NAV rows:', navRows[0]?.values[0]?.[0] || 0);
  const meta = db.exec("SELECT key, value FROM srs_meta WHERE key LIKE 'nav%' OR key LIKE 'last_nav%'");
  console.log('NAV meta:', JSON.stringify(meta[0]?.values));
});
