const { Pool } = require("pg");
require("dotenv").config();

module.exports = new Pool({
  connectionString: process.env.CORE_DATABASE_URL,
  ssl: process.env.CORE_PGSSL === "true" ? { rejectUnauthorized: false } : false,
});