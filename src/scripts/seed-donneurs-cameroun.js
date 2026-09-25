// ============================================================
// AIDORA — Insertion de donneurs fictifs dans tout le Cameroun
// ------------------------------------------------------------
// Usage : node src/scripts/seed-donneurs-cameroun.js
// ============================================================

require("dotenv").config();
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");

// ============================================
// CONFIG TIDB CLOUD (depuis .env)
// ============================================
function buildSSL() {
  if (process.env.TIDB_ENABLE_SSL !== "true") return undefined;
  return { minVersion: "TLSv1.2", rejectUnauthorized: false };
}

const DB = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: buildSSL(),
};

// ============================================
// VILLES DU CAMEROUN AVEC COORDONNÉES
// ============================================
const VILLES = [
  { nom: "Yaoundé",      region: "Centre",        lat: 3.8480, lng: 11.5021 },
  { nom: "Douala",       region: "Littoral",      lat: 4.0511, lng: 9.7679 },
  { nom: "Bafoussam",    region: "Ouest",         lat: 5.4781, lng: 10.4176 },
  { nom: "Bamenda",      region: "Nord-Ouest",    lat: 5.9631, lng: 10.1591 },
  { nom: "Garoua",       region: "Nord",          lat: 9.3017, lng: 13.3921 },
  { nom: "Maroua",       region: "Extrême-Nord",  lat: 10.5956, lng: 14.3247 },
  { nom: "Ngaoundéré",   region: "Adamaoua",      lat: 7.3167, lng: 13.5833 },
  { nom: "Bertoua",      region: "Est",           lat: 4.5772, lng: 13.6846 },
  { nom: "Ebolowa",      region: "Sud",           lat: 2.9000, lng: 11.1500 },
  { nom: "Buea",         region: "Sud-Ouest",     lat: 4.1527, lng: 9.2410 },
  { nom: "Kribi",        region: "Sud",           lat: 2.9333, lng: 9.9167 },
  { nom: "Limbe",        region: "Sud-Ouest",     lat: 4.0167, lng: 9.2167 },
  { nom: "Dschang",      region: "Ouest",         lat: 5.4500, lng: 10.0500 },
  { nom: "Edéa",         region: "Littoral",      lat: 3.8000, lng: 10.1333 },
  { nom: "Kumbo",        region: "Nord-Ouest",    lat: 6.2000, lng: 10.6667 },
  { nom: "Foumban",      region: "Ouest",         lat: 5.7167, lng: 10.9167 },
  { nom: "Nkongsamba",   region: "Littoral",      lat: 4.9500, lng: 9.9333 },
  { nom: "Bafang",       region: "Ouest",         lat: 5.1500, lng: 10.1833 },
  { nom: "Mbalmayo",     region: "Centre",        lat: 3.5167, lng: 11.5000 },
  { nom: "Sangmélima",   region: "Sud",           lat: 2.9333, lng: 11.9833 },
];

// ============================================
// NOMS CAMEROUNAIS
// ============================================
const NOMS = [
  "Mbarga", "Ngo", "Fonkou", "Tchoumi", "Ndongo", "Ekane", "Biya", "Abanda",
  "Etoundi", "Djoumessi", "Mvondo", "Bello", "Njoya", "Tchana", "Kenfack",
  "Sadou", "Moussa", "Amadou", "Oumarou", "Nana", "Dibango", "Bakari",
  "Eyenga", "Owona", "Atangana", "Essomba", "Manga", "Biwole", "Kouam", "Fokou",
  "Ndam", "Tabi", "Mballa", "Fotso", "Kamga", "Nkemi", "Tchoua", "Mefire",
];

const PRENOMS = [
  "Jean", "Marie", "Paul", "Aïcha", "Pierre", "Sylvie", "André", "Fatou",
  "Luc", "Céline", "Marc", "Nadia", "Joseph", "Estelle", "Alain", "Awa",
  "Emmanuel", "Sandrine", "Thomas", "Brigitte", "Patrick", "Mireille",
  "Éric", "Josiane", "François", "Solange", "Serge", "Adèle", "Georges",
  "Clarisse", "Souleymane", "Rachidatou", "Ibrahim", "Hawaou", "Moussa",
  "Fadimatou", "Oumarou", "Yaya", "Bouba", "Salamatou",
];

const GROUPES = ["A", "B", "AB", "O"];
const RHESUS = ["POSITIF", "NEGATIF"];
const SEXES = ["M", "F"];

// ============================================
// UTILITAIRES
// ============================================
function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[rand(0, arr.length - 1)];
}

function randomDateNaissance() {
  const annee = rand(1970, 2005);
  const mois = rand(1, 12);
  const jour = rand(1, 28);
  return `${annee}-${String(mois).padStart(2, "0")}-${String(jour).padStart(2, "0")}`;
}

// ============================================
// MAIN
// ============================================
async function seed() {
  let conn;

  try {
    console.log("🔌 Connexion à TiDB Cloud...");
    conn = await mysql.createConnection(DB);
    console.log("   ✅ Connecté\n");

    // 1. Hash du mot de passe une seule fois
    const hash = await bcrypt.hash("Test1234!", 12);
    console.log("🔐 Mot de passe hashé\n");

    // 2. Récupérer les établissements existants (pour y rattacher les donneurs)
    const [etabs] = await conn.query(
      "SELECT id, nom, ville FROM etablissements WHERE statut = 'ACTIF'"
    );
    if (etabs.length === 0) {
      console.error("❌ Aucun établissement trouvé. Lance d'abord le script SQL.");
      process.exit(1);
    }
    console.log(`🏥 ${etabs.length} établissements trouvés\n`);

    // 3. Générer 100 donneurs répartis dans tout le Cameroun
    const TOTAL = 100;
    console.log(`🩸 Insertion de ${TOTAL} donneurs fictifs...\n`);

    let compteur = 0;
    let telCounter = 700000000;

    for (let i = 0; i < TOTAL; i++) {
      const nom = pick(NOMS);
      const prenom = pick(PRENOMS);
      const ville = pick(VILLES);
      const groupe = pick(GROUPES);
      const rhesus = pick(RHESUS);
      const sexe = pick(SEXES);
      const etab = pick(etabs);

      // Position GPS légèrement randomisée autour de la ville (± 0.05°)
      const lat = ville.lat + (Math.random() - 0.5) * 0.1;
      const lng = ville.lng + (Math.random() - 0.5) * 0.1;

      const email = `${prenom.toLowerCase()}.${nom.toLowerCase()}${i}@test.cm`;
      const telephone = `+237 6${telCounter++}`;

      try {
        // a) Créer l'utilisateur
        const [u] = await conn.query(
          `INSERT INTO utilisateurs
             (nom, prenom, email, mot_de_passe, telephone, role, statut_compte)
           VALUES (?, ?, ?, ?, ?, 'DONNEUR', 'ACTIF')`,
          [nom, prenom, email, hash, telephone]
        );

        // b) Créer le profil donneur
        await conn.query(
          `INSERT INTO donneurs
             (id, groupe_sanguin, rhesus, date_naissance, sexe, disponible,
              latitude, longitude, etablissement_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            u.insertId,
            groupe,
            rhesus,
            randomDateNaissance(),
            sexe,
            rand(0, 1),
            lat,
            lng,
            etab.id,
          ]
        );

        compteur++;
        if (compteur % 10 === 0) {
          console.log(`   ✅ ${compteur}/${TOTAL} donneurs insérés`);
        }
      } catch (err) {
        console.log(`   ⚠️  Doublon ignoré : ${err.message}`);
      }
    }

    console.log(`\n🎉 ${compteur} donneurs insérés avec succès !\n`);

    // 4. Résumé par ville
    console.log("📊 Répartition par ville :");
    const [repartition] = await conn.query(`
      SELECT e.ville, COUNT(*) AS nb
      FROM donneurs d
      LEFT JOIN etablissements e ON e.id = d.etablissement_id
      GROUP BY e.ville
      ORDER BY nb DESC
    `);
    repartition.forEach((r) => {
      console.log(`   ${r.ville || "Inconnue"} : ${r.nb} donneurs`);
    });

    console.log("\n✅ Terminé !\n");
  } catch (err) {
    console.error("❌ Erreur :", err.message);
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
}

seed();