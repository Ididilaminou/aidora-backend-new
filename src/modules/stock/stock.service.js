const repository = require("./stock.repository");
const AppError = require("../../utils/AppError");
const logger = require("../../config/logger");
const journalAudit = require("../journal-audit/journalAudit.service");
const notificationService = require("../notifications/notifications.service");

/**
 * Liste les stocks avec filtres.
 */
async function lister(filtres) {
  return repository.findAll(filtres);
}

/**
 * Liste les stocks d'un établissement.
 */
async function listerParEtablissement(etablissementId) {
  const idNum = Number(etablissementId);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    throw new AppError("Identifiant d'établissement invalide", 400, "VALIDATION_ERROR");
  }
  return repository.findByEtablissement(idNum);
}

/**
 * Récupère un stock par ID.
 */
async function consulter(id) {
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    throw new AppError("Identifiant de stock invalide", 400, "VALIDATION_ERROR");
  }

  const stock = await repository.findById(idNum);
  if (!stock) {
    throw new AppError("Stock introuvable", 404, "NOT_FOUND");
  }
  return stock;
}

/**
 * Récupère les mouvements d'un stock.
 */
async function mouvements(id) {
  await consulter(id);
  return repository.findMouvements(Number(id));
}

/**
 * Liste les stocks en alerte (sous le seuil).
 * Un personnel ne voit que ceux de son établissement.
 */
async function alertesSeuils(utilisateur) {
  const etablissementId =
    utilisateur.role === "PERSONNEL_BANQUE" || utilisateur.role === "PERSONNEL_HOPITAL"
      ? utilisateur.etablissementId
      : null;

  return repository.findEnAlerte(etablissementId);
}

/**
 * Crée un nouveau stock.
 */
async function creer(donnees, utilisateur) {
  const { etablissement_id, groupe_sanguin, rhesus, type_produit } = donnees;

  // Vérifier l'unicité (un seul stock par combinaison)
  const existant = await repository.findByCombinaison({
    etablissement_id,
    groupe_sanguin,
    rhesus,
    type_produit,
  });

  if (existant) {
    throw new AppError(
      "Un stock existe déjà pour cette combinaison (établissement / groupe / rhésus / produit)",
      409,
      "CONFLICT"
    );
  }

  const stock = await repository.create({
    ...donnees,
    quantite: donnees.quantite || 0,
    seuil_alerte: donnees.seuil_alerte || 5,
  });

  logger.info(`Stock #${stock.id} créé par #${utilisateur.id}`);
  return stock;
}

/**
 * Ajoute une entrée de stock.
 */
async function entree(id, { quantite, motif }, utilisateur) {
  const stock = await consulter(id);

  if (quantite <= 0) {
    throw new AppError("La quantité doit être positive", 400, "VALIDATION_ERROR");
  }

  return repository.mouvementTransactionnel(
    Number(id),
    "ENTREE",
    quantite,
    motif || "Entrée manuelle",
    utilisateur.id
  );
}

/**
 * Enregistre une sortie de stock.
 */
async function sortie(id, { quantite, motif }, utilisateur) {
  const stock = await consulter(id);

  if (quantite <= 0) {
    throw new AppError("La quantité doit être positive", 400, "VALIDATION_ERROR");
  }

  if (stock.quantite < quantite) {
    throw new AppError(
      `Stock insuffisant. Disponible : ${stock.quantite}, demandé : ${quantite}`,
      400,
      "BAD_REQUEST"
    );
  }

  // Après une sortie qui passe sous le seuil
  if (stock.quantite <= stock.seuil_alerte) {
    await notificationService.notifierParEtablissement(stock.etablissement_id, {
        titre: "⚠️ Stock en alerte",
        message: `Le stock de ${stock.type_produit} ${stock.groupe_sanguin}${stock.rhesus === "POSITIF" ? "+" : "-"} est bas (${stock.quantite} restants)`,
        type: "ALERTE",
    });
  }

  return repository.mouvementTransactionnel(
    Number(id),
    "SORTIE",
    quantite,
    motif || "Sortie manuelle",
    utilisateur.id
  );
}

/**
 * Ajustement manuel (admin).
 */
async function ajustement(id, { nouvelle_quantite, motif }, utilisateur) {
  const stock = await consulter(id);

  const updated = await repository.ajustementTransactionnel(
    Number(id),
    nouvelle_quantite,
    motif,
    utilisateur.id
  );

  // 📝 Tracer l'ajustement
  await journalAudit.enregistrer({
    utilisateur_id: utilisateur.id,
    action: "AJUSTER_STOCK",
    ancienne_valeur: { quantite: stock.quantite },
    nouvelle_valeur: { quantite: nouvelle_quantite, motif },
  });

  return updated;
}

/**
 * Modifie le seuil d'alerte.
 */
async function modifierSeuil(id, { seuil_alerte }) {
  await consulter(id);
  return repository.updateSeuil(Number(id), seuil_alerte);
}

/**
 * Supprime un stock.
 */
async function supprimer(id, utilisateur) {
  await consulter(id);
  await repository.delete(Number(id));
  logger.warn(`Stock #${id} supprimé par #${utilisateur.id}`);
}

module.exports = {
  lister,
  listerParEtablissement,
  consulter,
  mouvements,
  alertesSeuils,
  creer,
  entree,
  sortie,
  ajustement,
  modifierSeuil,
  supprimer,
};