const repository = require("./statistiques.repository");
const AppError = require("../../utils/AppError");
const logger = require("../../config/logger");

/**
 * Calcule la plage de dates selon la période.
 */
function calculerPlageDates(periode, dateDebut, dateFin) {
  const maintenant = new Date();
  let debut, fin;

  switch (periode) {
    case "JOURNALIER":
      debut = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate());
      fin = new Date(debut);
      fin.setDate(fin.getDate() + 1);
      break;
    case "HEBDOMADAIRE":
      debut = new Date(maintenant);
      debut.setDate(maintenant.getDate() - maintenant.getDay());
      debut.setHours(0, 0, 0, 0);
      fin = new Date(debut);
      fin.setDate(fin.getDate() + 7);
      break;
    case "MENSUEL":
      debut = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1);
      fin = new Date(maintenant.getFullYear(), maintenant.getMonth() + 1, 1);
      break;
    case "GLOBAL":
      debut = null;
      fin = null;
      break;
    default:
      if (dateDebut && dateFin) {
        debut = new Date(dateDebut);
        fin = new Date(dateFin);
      } else {
        // Par défaut : mois en cours
        debut = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1);
        fin = new Date(maintenant.getFullYear(), maintenant.getMonth() + 1, 1);
      }
  }

  return {
    dateDebut: debut ? debut.toISOString().slice(0, 10) : null,
    dateFin: fin ? fin.toISOString().slice(0, 10) : null,
  };
}

/**
 * Statistiques globales de la plateforme.
 */
async function globales() {
  const [donneurs, dons, etablissements, personnels, demandes, stocks, poches] =
    await Promise.all([
      repository.compterDonneurs(),
      repository.compterDons(),
      repository.compterEtablissements(),
      repository.compterPersonnels(),
      repository.compterDemandes(),
      repository.compterStocks(),
      repository.compterPoches(),
    ]);

  return {
    donneurs,
    dons,
    etablissements,
    personnels,
    demandes,
    stocks,
    poches,
    demandesParStatut: await repository.demandesParStatut(),
    stocksParType: await repository.stocksParType(),
    etablissementsParType: await repository.etablissementsParType(),
    personnelsParRole: await repository.personnelsParRole(),
    demandesUrgentes: await repository.compterDemandesUrgentes(),
    stocksFaibles: await repository.compterStocksFaibles(),
  };
}

/**
 * Statistiques d'un établissement sur une période.
 */
async function parEtablissement(etablissementId, { periode, date_debut, date_fin }, utilisateur) {
  const idNum = Number(etablissementId);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    throw new AppError("Identifiant d'établissement invalide", 400, "VALIDATION_ERROR");
  }

  // Un personnel ne peut voir que son propre établissement
  if (
    utilisateur.role !== "ADMINISTRATEUR" &&
    utilisateur.etablissementId !== idNum
  ) {
    throw new AppError("Accès refusé à cet établissement", 403, "FORBIDDEN");
  }

  const { dateDebut, dateFin } = calculerPlageDates(periode, date_debut, date_fin);

  const stats = await repository.statsEtablissement(idNum, dateDebut, dateFin);

  return {
    etablissement_id: idNum,
    periode,
    dateDebut,
    dateFin,
    ...stats,
  };
}

/**
 * Statistiques personnelles du personnel connecté.
 */
async function statsPersonnelles(utilisateur, periode) {
  if (!utilisateur.etablissementId && utilisateur.role !== "ADMINISTRATEUR") {
    throw new AppError(
      "Aucun établissement rattaché à ce compte",
      403,
      "FORBIDDEN"
    );
  }

  const { dateDebut, dateFin } = calculerPlageDates(periode);

  const stats = await repository.statsPersonnel(
    utilisateur.id,
    utilisateur.etablissementId,
    dateDebut,
    dateFin
  );

  return {
    personnel_id: utilisateur.id,
    etablissement_id: utilisateur.etablissementId,
    periode,
    dateDebut,
    dateFin,
    ...stats,
  };
}

/**
 * Statistiques d'un personnel spécifique (admin).
 */
async function statsPersonnel(personnelId, { periode, date_debut, date_fin }) {
  const idNum = Number(personnelId);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    throw new AppError("Identifiant de personnel invalide", 400, "VALIDATION_ERROR");
  }

  const personnel = await repository.trouverPersonnel(idNum);
  if (!personnel) {
    throw new AppError("Personnel introuvable", 404, "NOT_FOUND");
  }

  const { dateDebut, dateFin } = calculerPlageDates(periode, date_debut, date_fin);

  const stats = await repository.statsPersonnel(
    idNum,
    personnel.etablissement_id,
    dateDebut,
    dateFin
  );

  return {
    personnel_id: idNum,
    personnel_nom: `${personnel.prenom} ${personnel.nom}`,
    etablissement_id: personnel.etablissement_id,
    periode,
    dateDebut,
    dateFin,
    ...stats,
  };
}

/**
 * Évolution des dons dans le temps (séries temporelles pour graphique).
 */
async function evolutionDons({ periode, etablissement_id }, utilisateur) {
  let etabId = etablissement_id;

  // Un personnel ne voit que son établissement
  if (
    utilisateur.role !== "ADMINISTRATEUR" &&
    utilisateur.role !== "PERSONNEL_HOPITAL"
  ) {
    etabId = utilisateur.etablissementId;
  }

  const donnees = await repository.evolutionDons(periode, etabId);
  return { periode, etablissement_id: etabId, donnees };
}

/**
 * Répartition des demandes par statut (donut).
 */
async function demandesParStatut(utilisateur) {
  let etablissementId = null;

  if (utilisateur.role === "PERSONNEL_HOPITAL") {
    etablissementId = utilisateur.etablissementId;
  } else if (utilisateur.role === "PERSONNEL_BANQUE") {
    etablissementId = utilisateur.etablissementId;
  }

  const donnees = await repository.demandesParStatut(etablissementId);
  return { donnees };
}

/**
 * Répartition des stocks par type (donut).
 */
async function stocksParType(utilisateur) {
  let etablissementId = null;

  if (
    utilisateur.role === "PERSONNEL_BANQUE" ||
    utilisateur.role === "PERSONNEL_HOPITAL"
  ) {
    etablissementId = utilisateur.etablissementId;
  }

  const donnees = await repository.stocksParType(etablissementId);
  return { donnees };
}

module.exports = {
  globales,
  parEtablissement,
  statsPersonnelles,
  statsPersonnel,
  evolutionDons,
  demandesParStatut,
  stocksParType,
};