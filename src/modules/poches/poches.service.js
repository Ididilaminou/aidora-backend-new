const repository = require("./poches.repository");
const stockRepository = require("../stock/stock.repository");
const AppError = require("../../utils/AppError");
const logger = require("../../config/logger");

// ------------------------------------------------------------
// Règle : quels statuts comptent dans le stock ?
// ------------------------------------------------------------
const STATUTS_DANS_STOCK = ["DISPONIBLE"];

function estDansStock(statut) {
  return STATUTS_DANS_STOCK.includes(statut);
}

/**
 * Ajuste le stock après un changement de statut poche.
 */
async function ajusterStockPourPoche(poche, ancienStatut, nouveauStatut, utilisateur) {
  const etaitDedans = estDansStock(ancienStatut);
  const estDedans = estDansStock(nouveauStatut);

  if (etaitDedans === estDedans) return; // Pas de changement

  // Trouve ou crée le stock correspondant
  let stock = await stockRepository.findByCombinaison({
    etablissement_id: poche.etablissement_id,
    groupe_sanguin: poche.groupe_sanguin,
    rhesus: poche.rhesus,
    type_produit: poche.type_produit,
  });

  if (!stock) {
    stock = await stockRepository.create({
      etablissement_id: poche.etablissement_id,
      groupe_sanguin: poche.groupe_sanguin,
      rhesus: poche.rhesus,
      type_produit: poche.type_produit,
      quantite: 0,
      seuil_alerte: 5,
    });
  }

  // +1 ou -1 selon le sens
  const delta = estDedans ? 1 : -1;
  const motif = estDedans
    ? `Poche ${poche.code_poche} → ${nouveauStatut}`
    : `Poche ${poche.code_poche} → ${nouveauStatut}`;

  if (delta > 0) {
    await stockRepository.mouvementTransactionnel(
      stock.id,
      "ENTREE",
      1,
      motif,
      utilisateur?.id || null
    );
  } else {
    // Empêche le stock de passer négatif
    if (stock.quantite <= 0) {
      logger.warn(
        `Stock négatif évité pour poche ${poche.code_poche} (stock actuel: ${stock.quantite})`
      );
      return;
    }
    await stockRepository.mouvementTransactionnel(
      stock.id,
      "SORTIE",
      1,
      motif,
      utilisateur?.id || null
    );
  }

  logger.info(
    `Stock ajusté (${delta > 0 ? "+1" : "-1"}) pour ${poche.groupe_sanguin}${poche.rhesus === "POSITIF" ? "+" : "-"} — poche ${poche.code_poche}`
  );
}

// ============================================================
// LECTURE
// ============================================================

async function lister(filtres) {
  return repository.findAll(filtres);
}

async function consulter(id) {
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    throw new AppError("Identifiant de poche invalide", 400, "VALIDATION_ERROR");
  }
  const poche = await repository.findById(idNum);
  if (!poche) {
    throw new AppError("Poche introuvable", 404, "NOT_FOUND");
  }
  return poche;
}

async function historique(id) {
  await consulter(id);
  return repository.findHistorique(Number(id));
}

// ============================================================
// CRÉATION
// ============================================================

/**
 * Crée une poche unique.
 */
async function creer(donnees, utilisateur) {
  const existant = await repository.findByCode(donnees.code_poche);
  if (existant) {
    throw new AppError("Une poche avec ce code existe déjà", 409, "CONFLICT");
  }

  if (new Date(donnees.date_peremption) <= new Date(donnees.date_collecte)) {
    throw new AppError(
      "La date de péremption doit être postérieure à la date de collecte",
      400,
      "VALIDATION_ERROR"
    );
  }

  const poche = await repository.createAvecHistorique(donnees, utilisateur.id);

  logger.info(`Poche ${poche.code_poche} créée par utilisateur #${utilisateur.id}`);

  // Si la poche est créée directement DISPONIBLE → +1 stock
  if (estDansStock(poche.statut)) {
    await ajusterStockPourPoche(poche, null, poche.statut, utilisateur);
  }

  return poche;
}

/**
 * Crée un LOT de poches en masse (pour la numérisation).
 */
async function creerLot(donnees, utilisateur) {
  const {
    nombre,
    groupe_sanguin,
    rhesus,
    type_produit,
    volume,
    date_collecte,
    date_peremption,
    don_id,
    etablissement_id,
    statut_initial = "EN_CONTROLE",
  } = donnees;

  if (!nombre || nombre < 1 || nombre > 500) {
    throw new AppError("Nombre de poches entre 1 et 500", 400, "VALIDATION_ERROR");
  }

  if (new Date(date_peremption) <= new Date(date_collecte)) {
    throw new AppError(
      "La date de péremption doit être postérieure à la date de collecte",
      400,
      "VALIDATION_ERROR"
    );
  }

  const etabId = etablissement_id || utilisateur.etablissementId;
  if (!etabId) {
    throw new AppError("Aucun établissement associé", 403, "FORBIDDEN");
  }

  const pochesCreees = [];

  // Génère un préfixe unique pour le lot
  const prefixe = `PCH-${etabId}-${Date.now().toString().slice(-6)}`;

  for (let i = 0; i < nombre; i++) {
    const code = `${prefixe}-${String(i + 1).padStart(3, "0")}`;

    try {
      const poche = await repository.createAvecHistorique(
        {
          don_id: don_id || null,
          code_poche: code,
          groupe_sanguin,
          rhesus,
          type_produit,
          volume,
          date_collecte,
          date_peremption,
          statut: statut_initial,
          etablissement_id: etabId,
          personnel_responsable_id: utilisateur.id,
        },
        utilisateur.id
      );
      pochesCreees.push(poche);
    } catch (err) {
      logger.warn(`Échec création poche ${code} : ${err.message}`);
    }
  }

  logger.info(
    `Lot de ${pochesCreees.length} poches créé par #${utilisateur.id} (${groupe_sanguin}${rhesus === "POSITIF" ? "+" : "-"} ${type_produit})`
  );

  // Si les poches sont créées directement DISPONIBLE → ajuste le stock
  if (estDansStock(statut_initial) && pochesCreees.length > 0) {
    const stock = await stockRepository.findByCombinaison({
      etablissement_id: etabId,
      groupe_sanguin,
      rhesus,
      type_produit,
    });

    let stockId = stock?.id;
    if (!stock) {
      const nouveau = await stockRepository.create({
        etablissement_id: etabId,
        groupe_sanguin,
        rhesus,
        type_produit,
        quantite: 0,
        seuil_alerte: 5,
      });
      stockId = nouveau.id;
    }

    await stockRepository.mouvementTransactionnel(
      stockId,
      "ENTREE",
      pochesCreees.length,
      `Lot de ${pochesCreees.length} poches (${prefixe})`,
      utilisateur.id
    );
  }

  return {
    nombre: pochesCreees.length,
    prefixe,
    poches: pochesCreees,
  };
}

// ============================================================
// CHANGEMENT DE STATUT
// ============================================================

async function changerStatut(id, { statut, commentaire }, utilisateur) {
  const poche = await consulter(id);

  if (poche.statut === statut) {
    throw new AppError(`La poche est déjà au statut ${statut}`, 400, "BAD_REQUEST");
  }

  if (["PERIMEE", "REJETEE"].includes(poche.statut)) {
    throw new AppError(
      "Impossible de modifier le statut d'une poche périmée ou rejetée",
      400,
      "BAD_REQUEST"
    );
  }

  const pocheMiseAJour = await repository.changerStatutAvecHistorique(
    Number(id),
    poche.statut,
    statut,
    commentaire || null,
    utilisateur.id
  );

  // ✅ Synchronise le stock
  await ajusterStockPourPoche(poche, poche.statut, statut, utilisateur);

  logger.info(
    `Poche ${poche.code_poche} : ${poche.statut} → ${statut} (par #${utilisateur.id})`
  );

  return pocheMiseAJour;
}

// ============================================================
// VENTE
// ============================================================

async function vendre(id, { prix_vente, date_vente }, utilisateur) {
  const poche = await consulter(id);

  if (poche.statut !== "DISPONIBLE" && poche.statut !== "RESERVEE") {
    throw new AppError(
      "Seules les poches disponibles ou réservées peuvent être vendues",
      400,
      "BAD_REQUEST"
    );
  }

  const pocheVendue = await repository.vendreAvecHistorique(
    Number(id),
    prix_vente,
    date_vente || new Date(),
    utilisateur.id
  );

  // ✅ Synchronise le stock (sortie)
  await ajusterStockPourPoche(poche, poche.statut, "VENDUE", utilisateur);

  logger.info(`Poche ${poche.code_poche} vendue à ${prix_vente} par #${utilisateur.id}`);

  return pocheVendue;
}

// ============================================================
// SUPPRESSION
// ============================================================

async function supprimer(id, utilisateur) {
  const poche = await consulter(id);

  if (estDansStock(poche.statut)) {
    await ajusterStockPourPoche(poche, poche.statut, "REJETEE", utilisateur);
  }

  await repository.delete(Number(id));
  logger.warn(`Poche #${id} supprimée par admin #${utilisateur.id}`);
}

async function listerLots(filtres, utilisateur) {
  // Un personnel ne voit que les lots de son établissement
  if (
    (utilisateur.role === "PERSONNEL_BANQUE" ||
      utilisateur.role === "PERSONNEL_HOPITAL") &&
    utilisateur.etablissementId
  ) {
    filtres.etablissement_id = utilisateur.etablissementId;
  }

  const lots = await repository.findLots(filtres);
  return { lots, total: lots.length };
}

// ============================================
// LISTER LES LOTS (regroupés par préfixe)
// ============================================

async function listerLots(filtres, utilisateur) {
  // Un personnel ne voit que les lots de son établissement
  if (
    (utilisateur.role === "PERSONNEL_BANQUE" ||
      utilisateur.role === "PERSONNEL_HOPITAL") &&
    utilisateur.etablissementId
  ) {
    filtres.etablissement_id = utilisateur.etablissementId;
  }

  const lots = await repository.findLots(filtres);
  return { lots, total: lots.length };
}

module.exports = {
  lister,
  consulter,
  historique,
  creer,
  creerLot,     
  changerStatut,
  vendre,
  supprimer,
  listerLots,
};