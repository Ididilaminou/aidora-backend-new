const service = require("./journalAudit.service");
const asyncHandler = require("../../utils/asyncHandler");
const { success } = require("../../utils/response");

/**
 * @desc    Lister les entrées d'audit avec filtres
 * @route   GET /api/journal-audit
 * @access  Admin
 */
const lister = asyncHandler(async (req, res) => {
  const { utilisateur_id, action, date_debut, date_fin, page, limite } = req.query;
  const result = await service.lister({
    utilisateur_id, action, date_debut, date_fin, page, limite,
  });
  return success(res, result);
});

/**
 * @desc    Consulter une entrée d'audit
 * @route   GET /api/journal-audit/:id
 * @access  Admin
 */
const consulter = asyncHandler(async (req, res) => {
  const result = await service.consulter(req.params.id);
  return success(res, result);
});

/**
 * @desc    Historique d'un utilisateur spécifique
 * @route   GET /api/journal-audit/utilisateur/:utilisateurId
 * @access  Admin
 */
const parUtilisateur = asyncHandler(async (req, res) => {
  const result = await service.parUtilisateur(req.params.utilisateurId);
  return success(res, result);
});

/**
 * @desc    Statistiques des actions les plus fréquentes
 * @route   GET /api/journal-audit/stats/actions
 * @access  Admin
 */
const statsActions = asyncHandler(async (req, res) => {
  const result = await service.statsActions();
  return success(res, result);
});

/**
 * @desc    Purger les anciennes entrées d'audit (avant une date)
 * @route   DELETE /api/journal-audit/purger?avant=...
 * @access  Admin
 */
const purger = asyncHandler(async (req, res) => {
  const result = await service.purger(req.query.avant, req.user);
  return success(res, result, `${result.supprimees} entrée(s) purgée(s)`);
});

module.exports = { lister, consulter, parUtilisateur, statsActions, purger };