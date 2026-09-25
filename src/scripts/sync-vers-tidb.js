// ============================================================
// AIDORA — Synchronisation LOCAL → TiDB Cloud
// ------------------------------------------------------------
// Copie TOUTES les tables et données de ton MySQL local
// vers ton cluster TiDB Cloud.
//
// ⚠️  À lancer UNE SEULE FOIS (écrase les données TiDB)
//
// Usage : node scripts/sync-vers-tidb.js
// ============================================================

require("dotenv").config();
const mysql = require("mysql2/promise");
const fs = require("fs");

// ============================================
// CONFIGURATION
// ============================================

// --- Source : LOCAL ---
const SOURCE = {
  host: "127.0.0.1",
  port: 3306,
  user: "root",
  password: "",        // ← ton mot de passe MySQL local
  database: "aidora",
};

// --- Cible : TIDB CLOUD ---
const CIBLE = {
  host: process.env.DB_HOST,          // depuis .env
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: {
    ca: fs.readFileSync("./certs/tidb-ca.pem"),
    rejectUnauthorized: true,
  },
};

// Ordre de copie (à cause des clés étrangères)
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
    dstConn = await mysql.createConnection(CIBLE);
    console.log("   ✅ Connecté\n");

    console.log("🚫 Désactivation des FK sur TiDB...");
    await dstConn.query("SET FOREIGN_KEY_CHECKS = 0");

    console.log("🧹 Nettoyage de TiDB...");
    // Vider dans l'ordre inverse
    for (const table of [...TABLES].reverse()) {
      try {
        await dstConn.query(`DELETE FROM ${table}`);
        console.log(`   ✅ ${table} vidée`);
      } catch (err) {
        if (err.code !== "ER_NO_SUCH_TABLE") {
          console.log(`   ⚠️ ${table} : ${err.message}`);
        }
      }
    }
    console.log("");

    console.log("📤 Copie des données...\n");
    for (const table of TABLES) {
      try {
        // Lire depuis local
        const [rows] = await srcConn.query(`SELECT * FROM ${table}`);

        if (rows.length === 0) {
          console.log(`   ⏭️  ${table} : 0 ligne`);
          continue;
        }

        // Construire la requête INSERT
        const colonnes = Object.keys(rows[0]);
        const placeholders = `(${colonnes.map(() => "?").join(", ")})`;
        const values = rows.map((r) => colonnes.map((c) => r[c]));

        // Insérer par batch de 100
        const BATCH = 100;
        for (let i = 0; i < values.length; i += BATCH) {
          const batch = values.slice(i, i + BATCH);
          const sql = `INSERT INTO ${table} (${colonnes.join(", ")}) VALUES ${batch
            .map(() => placeholders)
            .join(", ")}`;
          await dstConn.query(sql, batch.flat());
        }

        console.log(`   ✅ ${table} : ${rows.length} lignes copiées`);
      } catch (err) {
        console.log(`   ❌ ${table} : ${err.message}`);
      }
    }

    console.log("\n✅ Réactivation des FK sur TiDB...");
    await dstConn.query("SET FOREIGN_KEY_CHECKS = 1");

    console.log("\n🎉 Synchronisation terminée !\n");
  } catch (err) {
    console.error("❌ Erreur :", err.message);
    process.exit(1);
  } finally {
    if (srcConn) await srcConn.end();
    if (dstConn) await dstConn.end();
  }
}

sync();