const { Pool } = require('pg');
require('dotenv').config();

function deriveDbUrl(baseUrl, dbName) {
  if (!baseUrl || typeof baseUrl !== 'string') return undefined;
  const qIndex = baseUrl.indexOf('?');
  const prefix = qIndex >= 0 ? baseUrl.slice(0, qIndex) : baseUrl;
  const suffix = qIndex >= 0 ? baseUrl.slice(qIndex) : '';
  return prefix.replace(/\/[^/?]+$/, `/${dbName}`) + suffix;
}

function getConnectionString() {
  return (
    process.env.SECURITY_DATABASE_URL ||
    deriveDbUrl(process.env.CORE_DATABASE_URL, 'sentina_security')
  );
}

const connectionString = getConnectionString();
if (!connectionString) {
  throw new Error('Missing SECURITY_DATABASE_URL / CORE_DATABASE_URL for sentina_security connection.');
}

const sslFlag = process.env.SECURITY_PGSSL ?? process.env.CORE_PGSSL ?? 'false';

if (!global.__SENTINA_SECURITY_DB_POOL__) {
  global.__SENTINA_SECURITY_DB_POOL__ = new Pool({
    connectionString,
    ssl: sslFlag === 'true' ? { rejectUnauthorized: false } : false,
    max: Number(process.env.SECURITY_DB_POOL_MAX || 1),
    idleTimeoutMillis: Number(process.env.SECURITY_DB_IDLE_TIMEOUT_MS || 5000),
    connectionTimeoutMillis: Number(process.env.SECURITY_DB_CONNECT_TIMEOUT_MS || 8000),
    allowExitOnIdle: true,
  });

  global.__SENTINA_SECURITY_DB_POOL__.on('error', (err) => {
    console.error('[security.db] unexpected pool error:', err.message);
  });
}

module.exports = global.__SENTINA_SECURITY_DB_POOL__;
