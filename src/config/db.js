const mysql = require("mysql2/promise");
const fs = require("fs");
const logger = require("./logger");

require("dotenv").config();

// ============================================================
// CONFIGURATION SSL/TLS
// ------------------------------------------------------------
// Priorité :
//   1. TIDB_CA_PEM (variable d'env) → utilise ce certificat
//   2. TIDB_ENABLE_SSL=true        → utilise les CA par défaut
//   3. Rien                        → pas de SSL (dev local)
// ============================================================

function buildSSLConfig() {
  // Mode 1 : certificat fourni explicitement (recommandé en production)
  if (process.env.TIDB_CA_PEM) {
    logger.info("[DB] SSL : certificat CA fourni via TIDB_CA_PEM");
    return {
      ca: process.env.TIDB_CA_PEM,
      minVersion: "TLSv1.2",
      rejectUnauthorized: true,
    };
  }

  // Mode 2 : SSL avec les CA par défaut du système
  if (process.env.TIDB_ENABLE_SSL === "true") {
    logger.info("[DB] SSL : CA par défaut du système");
    return {
      minVersion: "TLSv1.2",
      rejectUnauthorized: true,
    };
  }

  // Mode 3 : pas de SSL (MySQL local en dev)
  logger.info("[DB] SSL : désactivé (dev local)");
  return undefined;
}

// ============================================================
// POOL DE CONNEXIONS
// ============================================================

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  decimalNumbers: true,

  ssl: buildSSLConfig(),
});

pool.on("connection", () => logger.debug("Nouvelle connexion MySQL établie"));

// ============================================================
// VÉRIFICATION DE LA CONNEXION AU DÉMARRAGE
// ============================================================

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

// ============================================================
// TRANSACTIONS
// ============================================================

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
