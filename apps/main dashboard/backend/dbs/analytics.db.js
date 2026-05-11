const { Pool } = require("pg");
require("dotenv").config();

module.exports = new Pool({
  connectionString: process.env.ANALYTICS_DATABASE_URL,
  ssl: process.env.ANALYTICS_PGSSL === "true" ? { rejectUnauthorized: false } : false,
});