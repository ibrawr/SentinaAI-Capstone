const { Pool } = require("pg");
require("dotenv").config();

module.exports = new Pool({
  connectionString: process.env.SUSTAINABILITY_DATABASE_URL,
  ssl: process.env.SUSTAINABILITY_PGSSL === "true" ? { rejectUnauthorized: false } : false,
});