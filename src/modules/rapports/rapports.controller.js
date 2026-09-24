const service = require("./rapports.service");
const asyncHandler = require("../../utils/asyncHandler");
const { success } = require("../../utils/response");

/**
 * @desc    Lister les rapports (avec contrôle d'accès par rôle)
 * @route   GET /api/rapports
 * @access  Privé
 */
const lister = asyncHandler(async (req, res) => {
  const { type, format_export, page, limite } = req.query;
  const result = await service.lister(
    { type, format_export, page, limite },
    req.user
  );
  return success(res, result);
});

/**
 * @desc    Consulter un rapport
 * @route   GET /api/rapports/:id
 * @access  Privé
 */
const consulter = asyncHandler(async (req, res) => {
  const result = await service.consulter(req.params.id, req.user);
  return success(res, result);
});

/**
 * @desc    Télécharger un rapport
 * @route   GET /api/rapports/:id/telecharger
 * @access  Privé
 */
const telecharger = asyncHandler(async (req, res) => {
  const rapport = await service.consulter(req.params.id, req.user);

  // Préparation du fichier à télécharger
  const filename = `rapport-${rapport.type.toLowerCase()}-${rapport.id}.${
    rapport.format_export === "PDF" ? "pdf" : rapport.format_export === "EXCEL" ? "xlsx" : "csv"
  }`;

  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.send(rapport.contenu);
});

/**
 * @desc    Générer un rapport
 * @route   POST /api/rapports/generer
 * @access  Personnel / Admin
 */
const generer = asyncHandler(async (req, res) => {
  const result = await service.generer(req.body, req.user);
  return success(res, result, "Rapport généré avec succès", 201);
});

/**
 * @desc    Supprimer un rapport
 * @route   DELETE /api/rapports/:id
 * @access  Personnel / Admin
 */
const supprimer = asyncHandler(async (req, res) => {
  await service.supprimer(req.params.id, req.user);
  return success(res, null, "Rapport supprimé avec succès");
});

module.exports = { lister, consulter, telecharger, generer, supprimer };