const service = require("./statistiques.service");
const asyncHandler = require("../../utils/asyncHandler");
const { success } = require("../../utils/response");
const { pool } = require("../../config/db");

/**
 * @desc    Statistiques globales de la plateforme
 * @route   GET /api/statistiques/globales
 * @access  Admin
 */
const globales = asyncHandler(async (req, res) => {
  const result = await service.globales();
  return success(res, result);
});

/**
 * @desc    Statistiques d'un établissement sur une période
 * @route   GET /api/statistiques/etablissement/:etablissementId?periode=...
 * @access  Admin / Personnel
 */
const parEtablissement = asyncHandler(async (req, res) => {
  const { periode = "MENSUEL", date_debut, date_fin } = req.query;
  const result = await service.parEtablissement(req.params.etablissementId, {
    periode, date_debut, date_fin,
  }, req.user);
  return success(res, result);
});

/**
 * @desc    Mes statistiques journalières
 * @route   GET /api/statistiques/moi/journalier
 * @access  Personnel
 */
const monJournalier = asyncHandler(async (req, res) => {
  const result = await service.statsPersonnelles(req.user, "JOURNALIER");
  return success(res, result);
});

/**
 * @desc    Mes statistiques hebdomadaires
 * @route   GET /api/statistiques/moi/hebdomadaire
 * @access  Personnel
 */
const monHebdomadaire = asyncHandler(async (req, res) => {
  const result = await service.statsPersonnelles(req.user, "HEBDOMADAIRE");
  return success(res, result);
});

/**
 * @desc    Mes statistiques mensuelles
 * @route   GET /api/statistiques/moi/mensuel
 * @access  Personnel
 */
const monMensuel = asyncHandler(async (req, res) => {
  const result = await service.statsPersonnelles(req.user, "MENSUEL");
  return success(res, result);
});

/**
 * @desc    Mes statistiques globales
 * @route   GET /api/statistiques/moi/global
 * @access  Personnel
 */
const monGlobal = asyncHandler(async (req, res) => {
  const result = await service.statsPersonnelles(req.user, "GLOBAL");
  return success(res, result);
});

/**
 * @desc    Statistiques d'un personnel spécifique
 * @route   GET /api/statistiques/personnel/:personnelId?periode=...
 * @access  Admin
 */
const personnelParPeriode = asyncHandler(async (req, res) => {
  const { periode = "MENSUEL", date_debut, date_fin } = req.query;
  const result = await service.statsPersonnel(req.params.personnelId, {
    periode, date_debut, date_fin,
  });
  return success(res, result);
});

/**
 * @desc    Évolution des dons dans le temps (pour graphique)
 * @route   GET /api/statistiques/dons/evolution?periode=...
 * @access  Admin / Personnel banque
 */
const evolutionDons = asyncHandler(async (req, res) => {
  const { periode = "MENSUEL", etablissement_id } = req.query;
  const result = await service.evolutionDons({ periode, etablissement_id }, req.user);
  return success(res, result);
});

/**
 * @desc    Répartition des demandes par statut (graphique donut)
 * @route   GET /api/statistiques/demandes/par-statut
 * @access  Admin / Personnel
 */
const demandesParStatut = asyncHandler(async (req, res) => {
  const result = await service.demandesParStatut(req.user);
  return success(res, result);
});

/**
 * @desc    Répartition des stocks par type (graphique donut)
 * @route   GET /api/statistiques/stocks/par-type
 * @access  Admin / Personnel banque
 */
const stocksParType = asyncHandler(async (req, res) => {
  const result = await service.stocksParType(req.user);
  return success(res, result);
});

// ============================================
// 🌐 STATS PUBLIQUES (landing page)
// ------------------------------------------------------------
// Aucune authentification. Compte les données agrégées.
// Cache 5 min en mémoire pour éviter de spammer la BDD.
// ============================================

let cachePubliques = {
  data: null,
  expire: 0,
};

const DUREE_CACHE_MS = 5 * 60_000; // 5 minutes

 const publiques = asyncHandler(async (req, res) => {
  // 1. Vérifie le cache
  if (cachePubliques.data && Date.now() < cachePubliques.expire) {
    return success(res, cachePubliques.data);
  }

  // 2. Requête SQL
  const [rows] = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM utilisateurs
        WHERE role = 'DONNEUR' AND statut_compte = 'ACTIF') AS donneurs,
      (SELECT COUNT(*) FROM etablissements
        WHERE statut = 'ACTIF') AS etablissements,
      (SELECT COUNT(*) FROM dons
        WHERE statut = 'VALIDE') AS dons
  `);

  const reponse = {
    donneurs:          Number(rows[0]?.donneurs ?? 0),
    etablissements:    Number(rows[0]?.etablissements ?? 0),
    dons:              Number(rows[0]?.dons ?? 0),
    taux_satisfaction: 98,
  };

  // 3. Met en cache
  cachePubliques = {
    data: reponse,
    expire: Date.now() + DUREE_CACHE_MS,
  };

  return success(res, reponse);
});

module.exports = {
  globales,
  parEtablissement,
  monJournalier,
  monHebdomadaire,
  monMensuel,
  monGlobal,
  personnelParPeriode,
  evolutionDons,
  demandesParStatut,
  stocksParType,
  publiques,
};