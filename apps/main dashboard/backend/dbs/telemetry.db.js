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
    process.env.TELEMETRY_DATABASE_URL ||
    deriveDbUrl(process.env.CORE_DATABASE_URL, 'sentina_telemetry')
  );
}

const connectionString = getConnectionString();
if (!connectionString) {
  throw new Error('Missing TELEMETRY_DATABASE_URL / CORE_DATABASE_URL for sentina_telemetry connection.');
}

const sslFlag = process.env.TELEMETRY_PGSSL ?? process.env.CORE_PGSSL ?? 'false';

if (!global.__SENTINA_TELEMETRY_DB_POOL__) {
  global.__SENTINA_TELEMETRY_DB_POOL__ = new Pool({
    connectionString,
    ssl: sslFlag === 'true' ? { rejectUnauthorized: false } : false,
    max: Number(process.env.TELEMETRY_DB_POOL_MAX || 1),
    idleTimeoutMillis: Number(process.env.TELEMETRY_DB_IDLE_TIMEOUT_MS || 5000),
    connectionTimeoutMillis: Number(process.env.TELEMETRY_DB_CONNECT_TIMEOUT_MS || 8000),
    allowExitOnIdle: true,
  });

  global.__SENTINA_TELEMETRY_DB_POOL__.on('error', (err) => {
    console.error('[telemetry.db] unexpected pool error:', err.message);
  });
}

module.exports = global.__SENTINA_TELEMETRY_DB_POOL__;
