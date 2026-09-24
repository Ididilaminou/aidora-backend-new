const repository = require("./demandes.repository");
const stockRepository = require("../stock/stock.repository");
const AppError = require("../../utils/AppError");
const logger = require("../../config/logger");
const notificationService = require("../notifications/notifications.service");

/**
 * Liste les demandes avec filtres + contrôle d'accès.
 */
async function lister(filtres, utilisateur) {
  // Filtre par rôle : un hôpital ne voit que ses demandes
  if (utilisateur.role === "PERSONNEL_HOPITAL") {
    filtres.etablissement_demandeur_id = utilisateur.etablissementId;
  }
  // Un personnel de banque voit les demandes qui lui sont destinées ou sans destinataire
  if (utilisateur.role === "PERSONNEL_BANQUE") {
    filtres.etablissement_destinataire_id = utilisateur.etablissementId;
  }

  return repository.findAll(filtres);
}

/**
 * Récupère une demande par ID (avec contrôle d'accès).
 */
async function consulter(id, utilisateur) {
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    throw new AppError("Identifiant de demande invalide", 400, "VALIDATION_ERROR");
  }

  const demande = await repository.findById(idNum);
  if (!demande) {
    throw new AppError("Demande introuvable", 404, "NOT_FOUND");
  }

  // Un hôpital ne peut voir que ses propres demandes
  if (
    utilisateur.role === "PERSONNEL_HOPITAL" &&
    demande.etablissement_demandeur_id !== utilisateur.etablissementId
  ) {
    throw new AppError("Accès refusé à cette demande", 403, "FORBIDDEN");
  }

  return demande;
}

/**
 * Historique d'une demande.
 */
async function historique(id, utilisateur) {
  await consulter(id, utilisateur);
  return repository.findHistorique(Number(id));
}

/**
 * Crée une nouvelle demande de sang.
 */
async function creer(donnees, utilisateur) {
  const etablissementId = utilisateur.etablissementId;

  if (!etablissementId) {
    throw new AppError(
      "Aucun établissement rattaché à ce compte",
      403,
      "FORBIDDEN"
    );
  }

  // Si un destinataire est précisé, il doit exister
  if (donnees.etablissement_destinataire_id) {
    const destExiste = await repository.etablissementExiste(
      donnees.etablissement_destinataire_id
    );
    if (!destExiste) {
      throw new AppError("Établissement destinataire introuvable", 404, "NOT_FOUND");
    }
  }

  // 1. Créer la demande (d'abord)
  const demande = await repository.createAvecHistorique(
    {
      ...donnees,
      etablissement_demandeur_id: etablissementId,
    },
    utilisateur.id
  );

  // 2. Logger
  logger.info(
    `Demande #${demande.id} créée par #${utilisateur.id} (${demande.urgence ? "URGENTE" : "normale"})`
  );

  // 3. Notifier les banques si urgente (APRÈS création)
  if (demande.urgence) {
    await notificationService.notifierParRole("PERSONNEL_BANQUE", {
      titre: "🚨 Demande urgente",
      message: `Nouvelle demande urgente de ${demande.groupe_sanguin}${demande.rhesus === "POSITIF" ? "+" : "-"} — ${demande.quantite_demandee} unité(s)`,
      type: "URGENCE",
    });
  } else {
    // Optionnel : notifier pour les demandes normales aussi
    await notificationService.notifierParRole("PERSONNEL_BANQUE", {
      titre: "Nouvelle demande de sang",
      message: `Demande de ${demande.groupe_sanguin}${demande.rhesus === "POSITIF" ? "+" : "-"} — ${demande.quantite_demandee} unité(s)`,
      type: "DEMANDE",
    });
  }

  return demande;
}

/**
 * Accepte une demande.
 */
async function accepter(id, { commentaire }, utilisateur) {
  const demande = await consulter(id, utilisateur);

  if (demande.statut !== "EN_ATTENTE") {
    throw new AppError(
      `Impossible d'accepter une demande au statut ${demande.statut}`,
      400,
      "BAD_REQUEST"
    );
  }

  // Vérifier que la banque a assez de stock
  const stock = await stockRepository.findByCombinaison({
    etablissement_id: utilisateur.etablissementId,
    groupe_sanguin: demande.groupe_sanguin,
    rhesus: demande.rhesus,
    type_produit: demande.type_produit,
  });

  if (!stock || stock.quantite < demande.quantite_demandee) {
    throw new AppError(
      `Stock insuffisant. Disponible : ${stock?.quantite || 0}, demandé : ${demande.quantite_demandee}`,
      400,
      "BAD_REQUEST"
    );
  }

  const updated = await repository.changerStatutAvecHistorique(
    Number(id),
    demande.statut,
    "ACCEPTEE",
    commentaire || "Demande acceptée",
    utilisateur.id,
    {
      etablissement_destinataire_id: utilisateur.etablissementId,
      personnel_traitant_id: utilisateur.id,
    }
  );

  logger.info(`Demande #${id} acceptée par #${utilisateur.id}`);
  return updated;
}

/**
 * Rejette une demande.
 */
async function rejeter(id, { motif }, utilisateur) {
  const demande = await consulter(id, utilisateur);

  if (demande.statut !== "EN_ATTENTE") {
    throw new AppError(
      `Impossible de rejeter une demande au statut ${demande.statut}`,
      400,
      "BAD_REQUEST"
    );
  }

  const updated = await repository.changerStatutAvecHistorique(
    Number(id),
    demande.statut,
    "REJETEE",
    motif,
    utilisateur.id,
    { personnel_traitant_id: utilisateur.id }
  );

  logger.warn(`Demande #${id} rejetée par #${utilisateur.id} — Motif : ${motif}`);
  return updated;
}

/**
 * Livre une demande : déduit du stock et enregistre la distribution (transaction).
 */
async function livrer(id, utilisateur) {
  const demande = await consulter(id, utilisateur);

  if (demande.statut !== "ACCEPTEE") {
    throw new AppError(
      `Seules les demandes acceptées peuvent être livrées (statut actuel : ${demande.statut})`,
      400,
      "BAD_REQUEST"
    );
  }

  const resultat = await repository.livrerTransactionnel(
    Number(id),
    demande,
    utilisateur.id,
    utilisateur.etablissementId
  );

  logger.info(`Demande #${id} livrée par #${utilisateur.id}`);
  return resultat;
}

/**
 * Confirme la réception (côté hôpital).
 */
async function confirmerReception(id, utilisateur) {
  const demande = await consulter(id, utilisateur);

  if (demande.statut !== "LIVREE") {
    throw new AppError(
      `Impossible de confirmer la réception d'une demande au statut ${demande.statut}`,
      400,
      "BAD_REQUEST"
    );
  }

  const updated = await repository.changerStatutAvecHistorique(
    Number(id),
    demande.statut,
    "RECUE",   // ✅
    "Réception confirmée par l'hôpital",
    utilisateur.id,
    {}
  );

  logger.info(`Demande #${id} réception confirmée par #${utilisateur.id}`);
  return updated;
}

/**
 * Annule une demande.
 */
async function annuler(id, { motif }, utilisateur) {
  const demande = await consulter(id, utilisateur);

  if (["LIVREE", "ANNULEE", "REJETEE"].includes(demande.statut)) {
    throw new AppError(
      `Impossible d'annuler une demande au statut ${demande.statut}`,
      400,
      "BAD_REQUEST"
    );
  }

  const updated = await repository.changerStatutAvecHistorique(
    Number(id),
    demande.statut,
    "ANNULEE",
    motif,
    utilisateur.id,
    {}
  );

  logger.warn(`Demande #${id} annulée par #${utilisateur.id} — Motif : ${motif}`);
  return updated;
}

module.exports = {
  lister,
  consulter,
  historique,
  creer,
  accepter,
  rejeter,
  livrer,
  confirmerReception,
  annuler,
};