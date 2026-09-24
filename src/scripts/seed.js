// ============================================================
// AIDORA — SCRIPT DE SEED COMPLET
// ------------------------------------------------------------
// Remplit la BDD avec des données de test réalistes.
//
// Utilisation :
//   node src/scripts/seed.js
//   ou : npm run seed (si tu as ajouté le script dans package.json)
//
// ⚠️  À N'UTILISER QU'EN DÉVELOPPEMENT !
//     Ce script VIDE les tables avant de réinsérer.
// ============================================================

require("dotenv").config();
const bcrypt = require("bcryptjs");
const { pool } = require("../config/db");

// ------------------------------------------------------------
// Mot de passe commun à tous les comptes de test
// ------------------------------------------------------------
const MOT_DE_PASSE = "Test1234!";

// ------------------------------------------------------------
// Utilitaires
// ------------------------------------------------------------
const randomPhone = () =>
  `+237 6${Math.floor(10000000 + Math.random() * 89999999)}`;

const randomBetween = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};

const daysFromNow = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
};

const toDate = (d) => d.toISOString().slice(0, 10); // YYYY-MM-DD

// ============================================================
// MAIN
// ============================================================
async function seed() {
  const conn = await pool.getConnection();

  try {
    console.log("🌱 Démarrage du seed...\n");
    await conn.beginTransaction();

    // ============================================
    // 1. VIDER LES TABLES (ordre inverse des FK)
    // ============================================
    console.log("🧹 Nettoyage des tables...");
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const table of [
      "historique_poches",
      "distributions",
      "demandes_sang",
      "mouvements_stock",
      "stocks",
      "poches",
      "dons",
      "rendez_vous",
      "sollicitations",
      "evaluations_ia",
      "notifications",
      "journal_audit",
      "activations_compte",
      "administrateurs",
      "personnels",
      "donneurs",
      "etablissements",
      "utilisateurs",
    ]) {
      await conn.query(`TRUNCATE TABLE ${table}`);
    }
    await conn.query("SET FOREIGN_KEY_CHECKS = 1");

    // ============================================
    // 2. HASH DU MOT DE PASSE
    // ============================================
    console.log("🔐 Hash du mot de passe...");
    const hash = await bcrypt.hash(MOT_DE_PASSE, 10);

    // ============================================
    // 3. ÉTABLISSEMENTS
    // --------------------------------------------
    // Structure :
    //   [0] Hôpital Central de Yaoundé     (HOPITAL)
    //   [1] Hôpital Général de Douala      (HOPITAL)
    //   [2] Hôpital Laquintinie            (HOPITAL)
    //   [3] Banque — Hôpital Central       (BANQUE_DE_SANG, parent=0)
    //   [4] Banque de Sang de Douala       (BANQUE_DE_SANG, indépendante)
    //   [5] Banque de Sang de Bafoussam    (BANQUE_DE_SANG, indépendante)
    // ============================================
    console.log("🏥 Insertion des établissements...");

    // ---- 3a. Hôpitaux (parent_id = NULL) ----
    const hopitaux = [
      { nom: "Hôpital Central de Yaoundé", ville: "Yaoundé",   region: "Centre",   lat: 3.8480, lng: 11.5021 },
      { nom: "Hôpital Général de Douala",  ville: "Douala",    region: "Littoral", lat: 4.0511, lng: 9.7679 },
      { nom: "Hôpital Laquintinie",        ville: "Douala",    region: "Littoral", lat: 4.0445, lng: 9.7021 },
    ];

    const hopitalIds = [];
    for (const h of hopitaux) {
      const [r] = await conn.query(
        `INSERT INTO etablissements
          (nom, type, adresse, ville, region, telephone, email,
           latitude, longitude, statut, parent_id)
         VALUES (?, 'HOPITAL', ?, ?, ?, ?, ?, ?, ?, 'ACTIF', NULL)`,
        [
          h.nom,
          `Rue principale, ${h.ville}`,
          h.ville,
          h.region,
          randomPhone(),
          `contact@${h.nom.toLowerCase().replace(/[^a-z]/g, "").slice(0, 20)}.cm`,
          h.lat,
          h.lng,
        ]
      );
      hopitalIds.push(r.insertId);
    }

    // ---- 3b. Banques de sang ----
    const banques = [
      {
        nom: "Banque de Sang — Hôpital Central",
        ville: "Yaoundé", region: "Centre", lat: 3.8490, lng: 11.5030,
        parent_id: hopitalIds[0], // 🆕 rattachée à l'hôpital #0
      },
      {
        nom: "Banque de Sang de Douala",
        ville: "Douala", region: "Littoral", lat: 4.0611, lng: 9.7779,
        parent_id: null,
      },
      {
        nom: "Banque de Sang de Bafoussam",
        ville: "Bafoussam", region: "Ouest", lat: 5.4781, lng: 10.4176,
        parent_id: null,
      },
    ];

    const banqueIds = [];
    for (const b of banques) {
      const [r] = await conn.query(
        `INSERT INTO etablissements
          (nom, type, adresse, ville, region, telephone, email,
           latitude, longitude, statut, parent_id)
         VALUES (?, 'BANQUE_DE_SANG', ?, ?, ?, ?, ?, ?, ?, 'ACTIF', ?)`,
        [
          b.nom,
          `Rue principale, ${b.ville}`,
          b.ville,
          b.region,
          randomPhone(),
          `contact@${b.nom.toLowerCase().replace(/[^a-z]/g, "").slice(0, 20)}.cm`,
          b.lat,
          b.lng,
          b.parent_id,
        ]
      );
      banqueIds.push(r.insertId);
    }

    // Ordre final des IDs
    const etabIds = [...hopitalIds, ...banqueIds];
    // [0]=Hôpital Central   [1]=Hôpital Douala   [2]=Hôpital Laquintinie
    // [3]=Banque Hôpital Central (parent=0)
    // [4]=Banque Douala     [5]=Banque Bafoussam

    console.log(`   ✓ ${hopitaux.length} hôpitaux + ${banques.length} banques`);

    // ============================================
    // 4. ADMINISTRATEUR
    // ============================================
    console.log("👑 Insertion de l'administrateur...");
    const [admin] = await conn.query(
      `INSERT INTO utilisateurs
        (nom, prenom, email, mot_de_passe, telephone, role, statut_compte)
       VALUES (?, ?, ?, ?, ?, 'ADMINISTRATEUR', 'ACTIF')`,
      ["Admin", "Aidora", "admin@aidora.cm", hash, "+237600000001"]
    );
    await conn.query(
      `INSERT INTO administrateurs (id, niveau_acces) VALUES (?, 'SUPER')`,
      [admin.insertId]
    );

    // ============================================
    // 5. PERSONNELS
    // --------------------------------------------
    // Le RÔLE dépend du TYPE d'établissement :
    //   - Personnel d'une BANQUE   → PERSONNEL_BANQUE
    //   - Personnel d'un HÔPITAL   → PERSONNEL_HOPITAL
    // ============================================
    console.log("👨‍⚕️ Insertion des personnels...");

    const personnelsData = [
      // --- Banques de sang ---
      { nom: "Kamga",  prenom: "Paul",   etabIdx: 3, fonction: "Responsable banque", role: "PERSONNEL_BANQUE" },
      { nom: "Nkemi",  prenom: "Sarah",  etabIdx: 4, fonction: "Responsable banque", role: "PERSONNEL_BANQUE" },
      { nom: "Tchoua", prenom: "Éric",   etabIdx: 5, fonction: "Technicien labo",    role: "PERSONNEL_BANQUE" },

      // --- Hôpitaux ---
      { nom: "Fotso",  prenom: "Jean",   etabIdx: 0, fonction: "Médecin",            role: "PERSONNEL_HOPITAL" },
      { nom: "Tabi",   prenom: "Marie",  etabIdx: 1, fonction: "Infirmière",         role: "PERSONNEL_HOPITAL" },
      { nom: "Mballa", prenom: "André",  etabIdx: 2, fonction: "Médecin",            role: "PERSONNEL_HOPITAL" },
    ];

    const personnelIds = [];
    let telCounter = 100;
    for (const p of personnelsData) {
      const [u] = await conn.query(
        `INSERT INTO utilisateurs
          (nom, prenom, email, mot_de_passe, telephone, role, statut_compte)
         VALUES (?, ?, ?, ?, ?, ?, 'ACTIF')`,
        [
          p.nom,
          p.prenom,
          `${p.prenom.toLowerCase()}.${p.nom.toLowerCase()}@aidora.cm`,
          hash,
          `+237600000${String(telCounter++).padStart(3, "0")}`,
          p.role,
        ]
      );
      await conn.query(
        `INSERT INTO personnels (id, fonction, etablissement_id) VALUES (?, ?, ?)`,
        [u.insertId, p.fonction, etabIds[p.etabIdx]]
      );
      personnelIds.push(u.insertId);
    }

    // ============================================
    // 6. DONNEURS (30 donneurs)
    // ============================================
    console.log("🩸 Insertion des donneurs...");

    const nomsCamer = [
      "Mbarga", "Ngo", "Fonkou", "Tchoumi", "Ndongo", "Ekane", "Biya", "Abanda",
      "Etoundi", "Djoumessi", "Mvondo", "Bello", "Njoya", "Tchana", "Kenfack",
      "Sadou", "Moussa", "Amadou", "Oumarou", "Nana", "Dibango", "Bakari",
      "Eyenga", "Owona", "Atangana", "Essomba", "Manga", "Biwole", "Kouam", "Fokou",
    ];
    const prenomsCamer = [
      "Jean", "Marie", "Paul", "Aïcha", "Pierre", "Sylvie", "André", "Fatou",
      "Luc", "Céline", "Marc", "Nadia", "Joseph", "Estelle", "Alain", "Awa",
      "Emmanuel", "Sandrine", "Thomas", "Brigitte", "Patrick", "Mireille",
      "Éric", "Josiane", "François", "Solange", "Serge", "Adèle", "Georges", "Clarisse",
    ];

    const groupes = ["A", "B", "AB", "O"];
    const rhesusList = ["POSITIF", "NEGATIF"];
    const sexeList = ["M", "F"];

    // Les donneurs sont rattachés à des BANQUES (indices 3, 4, 5)
    const etabsPourDonneurs = [etabIds[3], etabIds[4], etabIds[5]];

    const donneurIds = [];
    telCounter = 200;
    for (let i = 0; i < 30; i++) {
      const nom = nomsCamer[i];
      const prenom = prenomsCamer[i];
      const groupe = groupes[i % groupes.length];
      const rhesus = rhesusList[i % rhesusList.length];
      const sexe = sexeList[i % sexeList.length];
      const etabId = etabsPourDonneurs[i % etabsPourDonneurs.length];

      const [u] = await conn.query(
        `INSERT INTO utilisateurs
          (nom, prenom, email, mot_de_passe, telephone, role, statut_compte)
         VALUES (?, ?, ?, ?, ?, 'DONNEUR', 'ACTIF')`,
        [
          nom,
          prenom,
          `${prenom.toLowerCase()}.${nom.toLowerCase()}${i}@test.cm`,
          hash,
          `+237600001${String(telCounter++).padStart(3, "0")}`,
        ]
      );

      await conn.query(
        `INSERT INTO donneurs
          (id, groupe_sanguin, rhesus, date_naissance, sexe, disponible,
           latitude, longitude, etablissement_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          u.insertId,
          groupe,
          rhesus,
          `19${70 + (i % 30)}-0${(i % 9) + 1}-1${i % 9}`,
          sexe,
          i % 3 === 0 ? 1 : 0,
          4.05 + Math.random() * 0.1,
          9.70 + Math.random() * 0.1,
          etabId,
        ]
      );

      donneurIds.push({
        id: u.insertId,
        groupe,
        rhesus,
        etablissement_id: etabId,
      });
    }

    // ============================================
    // 7. DONS (60 dons VALIDE répartis sur 6 mois)
    // ============================================
    console.log("💉 Insertion des dons...");
    const donsIds = [];

    for (let i = 0; i < 60; i++) {
      const donneur = donneurIds[i % donneurIds.length];
      // Un don est toujours enregistré par un personnel de BANQUE
      const personnelId = personnelIds[i % 3]; // les 3 premiers = banques
      const joursEnArriere = randomBetween(0, 180);
      const dateDon = daysAgo(joursEnArriere);

      const [r] = await conn.query(
        `INSERT INTO dons
          (donneur_id, personnel_id, etablissement_id, date_don,
           type_don, quantite, statut)
         VALUES (?, ?, ?, ?, 'SANG_TOTAL', ?, 'VALIDE')`,
        [
          donneur.id,
          personnelId,
          donneur.etablissement_id,
          toDate(dateDon),
          450.00,
        ]
      );
      donsIds.push({
        id: r.insertId,
        donneur_id: donneur.id,
        groupe: donneur.groupe,
        rhesus: donneur.rhesus,
        etablissement_id: donneur.etablissement_id,
        date: dateDon,
      });
    }

    // ============================================
    // 8. POCHES (1 à 2 par don)
    // ============================================
    console.log("🩸 Insertion des poches...");
    const typesProduits = ["SANG_TOTAL", "GLOBULES_ROUGES", "PLAQUETTES", "PLASMA"];
    const statutsPoches = [
      "EN_CONTROLE",
      "DISPONIBLE", "DISPONIBLE", "DISPONIBLE", "DISPONIBLE",
      "RESERVEE",
      "PERIMEE",
    ];

    let pocheCounter = 1;
    for (const don of donsIds) {
      const nbPoches = randomBetween(1, 2);
      for (let j = 0; j < nbPoches; j++) {
        const typeProduit = pick(typesProduits);
        const statut = pick(statutsPoches);
        const dateCollecte = don.date;
        const datePeremption = new Date(dateCollecte);
        datePeremption.setDate(datePeremption.getDate() + 42);

        const codePoche = `PCH-${String(pocheCounter++).padStart(5, "0")}`;

        await conn.query(
          `INSERT INTO poches
            (don_id, code_poche, groupe_sanguin, rhesus, type_produit, volume,
             date_collecte, date_peremption, statut, etablissement_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            don.id,
            codePoche,
            don.groupe,
            don.rhesus,
            typeProduit,
            450.00,
            toDate(dateCollecte),
            toDate(datePeremption),
            statut,
            don.etablissement_id,
          ]
        );
      }
    }

    // ============================================
    // 9. STOCKS (pour les 3 banques de sang)
    // ============================================
    console.log("📦 Insertion des stocks...");
    const groupesStock = ["A", "B", "AB", "O"];
    const rhesusStock = ["POSITIF", "NEGATIF"];
    const typesStock = ["SANG_TOTAL", "GLOBULES_ROUGES", "PLASMA"];

    for (const etabId of banqueIds) {
      for (const g of groupesStock) {
        for (const r of rhesusStock) {
          for (const typeProduit of typesStock) {
            await conn.query(
              `INSERT INTO stocks
                (etablissement_id, groupe_sanguin, rhesus, type_produit,
                 quantite, seuil_alerte)
               VALUES (?, ?, ?, ?, ?, 5)`,
              [etabId, g, r, typeProduit, randomBetween(0, 30)]
            );
          }
        }
      }
    }

    // ============================================
    // 10. RENDEZ-VOUS
    // ============================================
    console.log("📅 Insertion des rendez-vous...");
    const statutsRdv = ["PLANIFIE", "CONFIRME", "HONORE", "ANNULE"];

    for (let i = 0; i < 20; i++) {
      const donneur = donneurIds[i % donneurIds.length];
      const joursFutur = randomBetween(-10, 20);
      const dateRdv = daysFromNow(joursFutur);
      const heure = `${String(randomBetween(8, 16)).padStart(2, "0")}:${
        i % 2 === 0 ? "00" : "30"
      }:00`;

      await conn.query(
        `INSERT INTO rendez_vous
          (donneur_id, etablissement_id, date_rendez_vous,
           heure_rendez_vous, statut)
         VALUES (?, ?, ?, ?, ?)`,
        [
          donneur.id,
          donneur.etablissement_id,
          toDate(dateRdv),
          heure,
          statutsRdv[i % statutsRdv.length],
        ]
      );
    }

    // ============================================
    // 11. DEMANDES DE SANG
    // ============================================
    console.log("📋 Insertion des demandes...");
    const statutsDemandes = ["EN_ATTENTE", "EN_COURS", "ACCEPTEE", "LIVREE"];

    for (let i = 0; i < 15; i++) {
      // Une demande est passée par un HÔPITAL vers une BANQUE
      const demandeur = hopitalIds[i % hopitalIds.length];
      const destinataire = banqueIds[i % banqueIds.length];
      // Le personnel traitant est un personnel de BANQUE
      const personnelTraitant = personnelIds[i % 3];

      await conn.query(
        `INSERT INTO demandes_sang
          (etablissement_demandeur_id, etablissement_destinataire_id,
           groupe_sanguin, rhesus, type_produit, quantite_demandee,
           urgence, motif, statut, personnel_traitant_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          demandeur,
          destinataire,
          groupesStock[i % groupesStock.length],
          rhesusStock[i % rhesusStock.length],
          typesStock[i % typesStock.length],
          randomBetween(1, 5),
          i % 4 === 0 ? 1 : 0,
          "Besoin urgent pour patient en chirurgie",
          statutsDemandes[i % statutsDemandes.length],
          personnelTraitant,
        ]
      );
    }

    // ============================================
    // 12. NOTIFICATIONS (pour l'admin)
    // ============================================
    console.log("🔔 Insertion des notifications...");
    await conn.query(
      `INSERT INTO notifications (utilisateur_id, titre, message, type, lue)
       VALUES
         (?, 'Bienvenue sur Aidora', 'Votre compte administrateur est actif.', 'SYSTEME', 0),
         (?, 'Nouvelle demande urgente', 'Une demande urgente attend votre validation.', 'URGENT', 0),
         (?, 'Stock faible détecté', 'Le stock de sang O− est en dessous du seuil.', 'ALERTE', 0)`,
      [admin.insertId, admin.insertId, admin.insertId]
    );

    // ============================================
    // COMMIT
    // ============================================
    await conn.commit();

    // ============================================
    // RÉCAPITULATIF
    // ============================================
    console.log("\n✅ Seed terminé avec succès !\n");
    console.log("📊 Données créées :");
    console.log(`   • ${hopitaux.length} hôpitaux`);
    console.log(`   • ${banques.length} banques de sang (dont 1 rattachée à un hôpital)`);
    console.log(`   • 1 administrateur`);
    console.log(`   • ${personnelsData.length} personnels (3 banques + 3 hôpitaux)`);
    console.log(`   • 30 donneurs`);
    console.log(`   • 60 dons VALIDE`);
    console.log(`   • ~90 poches`);
    console.log(`   • Stocks pour ${banqueIds.length} banques`);
    console.log(`   • 20 rendez-vous`);
    console.log(`   • 15 demandes de sang`);
    console.log(`   • 3 notifications`);

    console.log("\n🔑 Comptes de test (mot de passe commun : " + MOT_DE_PASSE + ") :\n");
    console.log("   ┌─────────────────────────────────────────────────────────┐");
    console.log("   │ RÔLE              │ EMAIL                              │");
    console.log("   ├─────────────────────────────────────────────────────────┤");
    console.log("   │ ADMINISTRATEUR    │ admin@aidora.cm                    │");
    console.log("   │ PERSONNEL_BANQUE  │ paul.kamga@aidora.cm               │");
    console.log("   │ PERSONNEL_BANQUE  │ sarah.nkemi@aidora.cm              │");
    console.log("   │ PERSONNEL_BANQUE  │ eric.tchoua@aidora.cm              │");
    console.log("   │ PERSONNEL_HOPITAL │ jean.fotso@aidora.cm               │");
    console.log("   │ PERSONNEL_HOPITAL │ marie.tabi@aidora.cm               │");
    console.log("   │ PERSONNEL_HOPITAL │ andre.mballa@aidora.cm             │");
    console.log("   │ DONNEUR           │ jean.mbarga0@test.cm               │");
    console.log("   │ DONNEUR           │ marie.ngo1@test.cm                 │");
    console.log("   └─────────────────────────────────────────────────────────┘");
    console.log("");
  } catch (err) {
    await conn.rollback();
    console.error("\n❌ Erreur durant le seed :", err.message);
    console.error(err);
    process.exit(1);
  } finally {
    conn.release();
    await pool.end();
  }
}

seed();