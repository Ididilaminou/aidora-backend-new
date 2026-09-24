const repository = require("./rapports.repository");
const AppError = require("../../utils/AppError");
const logger = require("../../config/logger");

/**
 * Types de rapports supportés et leurs sources.
 */
const TYPES_VALIDES = ["DONS", "DEMANDES", "STOCKS", "PERSONNELS", "ETABLISSEMENTS", "AUDIT"];

/**
 * Liste les rapports avec contrôle d'accès.
 */
async function lister(filtres, utilisateur) {
  // Un personnel non-admin ne voit que ses propres rapports
  const filtresFinaux = { ...filtres };
  if (utilisateur.role !== "ADMINISTRATEUR") {
    filtresFinaux.personnel_id = utilisateur.id;
  }
  return repository.findAll(filtresFinaux);
}

/**
 * Récupère un rapport par ID (avec contrôle d'accès).
 */
async function consulter(id, utilisateur) {
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    throw new AppError("Identifiant de rapport invalide", 400, "VALIDATION_ERROR");
  }

  const rapport = await repository.findById(idNum);
  if (!rapport) {
    throw new AppError("Rapport introuvable", 404, "NOT_FOUND");
  }

  // Un personnel non-admin ne peut voir que ses propres rapports
  if (
    utilisateur.role !== "ADMINISTRATEUR" &&
    rapport.personnel_id !== utilisateur.id
  ) {
    throw new AppError("Accès refusé à ce rapport", 403, "FORBIDDEN");
  }

  return rapport;
}

/**
 * Génère un rapport selon son type et sa période.
 */
async function generer(donnees, utilisateur) {
  const { type, format_export = "PDF", date_debut, date_fin, etablissement_id } = donnees;

  if (!TYPES_VALIDES.includes(type)) {
    throw new AppError(
      `Type de rapport invalide. Doit être : ${TYPES_VALIDES.join(", ")}`,
      400,
      "VALIDATION_ERROR"
    );
  }

  // Déterminer l'établissement (limité pour les non-admins)
  let etabId = etablissement_id;
  if (utilisateur.role !== "ADMINISTRATEUR") {
    etabId = utilisateur.etablissementId;
  }

  // Récupérer les données selon le type
  let donneesRapport = [];
  switch (type) {
    case "DONS":
      donneesRapport = await repository.donneesDons(etabId, date_debut, date_fin);
      break;
    case "DEMANDES":
      donneesRapport = await repository.donneesDemandes(etabId, date_debut, date_fin);
      break;
    case "STOCKS":
      donneesRapport = await repository.donneesStocks(etabId);
      break;
    case "PERSONNELS":
      donneesRapport = await repository.donneesPersonnels(etabId);
      break;
    case "ETABLISSEMENTS":
      donneesRapport = await repository.donneesEtablissements();
      break;
    case "AUDIT":
      donneesRapport = await repository.donneesAudit(date_debut, date_fin);
      break;
  }

  // Sérialiser le contenu selon le format
  const contenu = serialiserRapport(type, format_export, {
    date_debut, date_fin, etablissement_id: etabId, donnees: donneesRapport,
  });

  // Enregistrer le rapport
  const rapport = await repository.create({
    // Les admins ne sont pas dans la table `personnels` → on met NULL
    personnel_id:
        utilisateur.role === "ADMINISTRATEUR" ? null : utilisateur.id,
    type,
    format_export,
    contenu,
  });

  logger.info(
    `Rapport #${rapport.id} (${type}/${format_export}) généré par #${utilisateur.id}`
  );

  return rapport;
}

/**
 * Sérialise les données selon le format (PDF/EXCEL/CSV).
 * NOTE : Pour générer un vrai PDF ou Excel, utiliser pdfkit / exceljs.
 * Ici, un format texte/CSV minimal est produit.
 */
function serialiserRapport(type, format, meta) {
  const { date_debut, date_fin, donnees } = meta;

  if (format === "CSV") {
    if (donnees.length === 0) return "";
    const entetes = Object.keys(donnees[0]).join(";");
    const lignes = donnees.map((l) =>
      Object.values(l)
        .map((v) => (v === null || v === undefined ? "" : String(v).replace(/;/g, ",")))
        .join(";")
    );
    return `Rapport ${type} - ${date_debut || "N/A"} au ${date_fin || "N/A"}\n${entetes}\n${lignes.join("\n")}`;
  }

  // Format par défaut (PDF/EXCEL) : contenu JSON structuré
  return JSON.stringify(
    {
      type,
      date_debut,
      date_fin,
      total: donnees.length,
      donnees,
      genere_le: new Date().toISOString(),
    },
    null,
    2
  );
}

/**
 * Supprime un rapport.
 */
async function supprimer(id, utilisateur) {
  const rapport = await consulter(id, utilisateur);
  await repository.delete(Number(rapport.id));
  logger.warn(`Rapport #${id} supprimé par #${utilisateur.id}`);
}

module.exports = { lister, consulter, generer, supprimer };