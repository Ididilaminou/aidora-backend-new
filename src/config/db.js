const mysql = require("mysql2/promise");
const logger = require("./logger");
require("dotenv").config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  decimalNumbers: true,
});

pool.on("connection", () => logger.debug("Nouvelle connexion MySQL établie"));

// Vérifie la connexion au démarrage
async function checkConnection() {
  try {
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    logger.info("✅ Connexion à la base de données OK");
  } catch (err) {
    logger.error(`❌ Impossible de se connecter à MySQL : ${err.message}`);
    logger.error(`Code : ${err.code} | Errno : ${err.errno}`);
    throw err;
  }
}

// Exécute plusieurs requêtes dans une transaction atomique.
async function withTransaction(callback) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await callback(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, checkConnection, withTransaction };