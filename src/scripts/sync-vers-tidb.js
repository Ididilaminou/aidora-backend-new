// ============================================================
// AIDORA — Synchronisation LOCAL → TiDB Cloud
// ------------------------------------------------------------
// Copie TOUTES les tables et données de MySQL local vers TiDB.
//
// ⚠️  À lancer UNE SEULE FOIS (écrase les données TiDB)
//
// Usage : node src/scripts/sync-vers-tidb.js
// ============================================================

require("dotenv").config();
const mysql = require("mysql2/promise");

// ============================================
// CONFIG SOURCE : ton MySQL local
// ============================================
const SOURCE = {
  host: "127.0.0.1",
  port: 3306,
  user: "root",
  password: "",        // ← 🎯 ton mot de passe MySQL local (souvent vide avec XAMPP/WAMP)
  database: "aidora",
};

// ============================================
// CONFIG CIBLE : TiDB Cloud (depuis .env)
// ============================================
function buildSSL() {
  if (process.env.TIDB_ENABLE_SSL !== "true") return undefined;
  return {
    minVersion: "TLSv1.2",
    rejectUnauthorized: false,   // tolérant pour éviter les erreurs de certificat
  };
}

const CIBLE = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: buildSSL(),
};

// ============================================
// ORDRE DES TABLES (respecte les FK)
// ============================================
const TABLES = [
  "utilisateurs",
  "etablissements",
  "donneurs",
  "personnels",
  "administrateurs",
  "activations_compte",
  "journal_audit",
  "notifications",
  "rendez_vous",
  "sollicitations",
  "evaluations_ia",
  "dons",
  "poches",
  "historique_poches",
  "stocks",
  "mouvements_stock",
  "demandes_sang",
  "distributions",
  "statistiques",
  "statistiques_personnel",
  "rapports",
  "rattachements_donneurs",
  "invitations_donneurs",
  "traces_email",
  "traces_sms",
];

// ============================================
// MAIN
// ============================================
async function sync() {
  let srcConn, dstConn;

  try {
    console.log("🔌 Connexion à MySQL LOCAL...");
    srcConn = await mysql.createConnection(SOURCE);
    console.log("   ✅ Connecté\n");

    console.log("🔌 Connexion à TiDB Cloud...");
    console.log(`   Host : ${CIBLE.host}`);
    console.log(`   DB   : ${CIBLE.database}`);
    dstConn = await mysql.createConnection(CIBLE);
    console.log("   ✅ Connecté\n");

    console.log("🚫 Désactivation des FK sur TiDB...");
    await dstConn.query("SET FOREIGN_KEY_CHECKS = 0");

    console.log("\n🧹 Nettoyage de TiDB...");
    for (const table of [...TABLES].reverse()) {
      try {
        await dstConn.query(`DELETE FROM ${table}`);
        console.log(`   ✅ ${table} vidée`);
      } catch (err) {
        if (err.code !== "ER_NO_SUCH_TABLE") {
          console.log(`   ⚠️  ${table} : ${err.message}`);
        }
      }
    }

    console.log("\n📤 Copie des données...\n");
    let totalLignes = 0;
    for (const table of TABLES) {
      try {
        const [rows] = await srcConn.query(`SELECT * FROM ${table}`);

        if (rows.length === 0) {
          console.log(`   ⏭️  ${table.padEnd(30)} : 0 ligne`);
          continue;
        }

        const colonnes = Object.keys(rows[0]);
        const placeholders = `(${colonnes.map(() => "?").join(", ")})`;
        const values = rows.map((r) => colonnes.map((c) => r[c]));

        // Insertion par batch de 100
        const BATCH = 100;
        for (let i = 0; i < values.length; i += BATCH) {
          const batch = values.slice(i, i + BATCH);
          const sql = `INSERT INTO ${table} (${colonnes.join(", ")}) VALUES ${batch
            .map(() => placeholders)
            .join(", ")}`;
          await dstConn.query(sql, batch.flat());
        }

        totalLignes += rows.length;
        console.log(`   ✅ ${table.padEnd(30)} : ${rows.length} lignes`);
      } catch (err) {
        console.log(`   ❌ ${table.padEnd(30)} : ${err.message}`);
      }
    }

    console.log("\n✅ Réactivation des FK sur TiDB...");
    await dstConn.query("SET FOREIGN_KEY_CHECKS = 1");

    console.log(`\n🎉 Synchronisation terminée : ${totalLignes} lignes copiées !\n`);
  } catch (err) {
    console.error("❌ Erreur :", err.message);
    process.exit(1);
  } finally {
    if (srcConn) await srcConn.end();
    if (dstConn) await dstConn.end();
  }
}

sync();