const service = require("./dons.service");
const asyncHandler = require("../../utils/asyncHandler");
const { success } = require("../../utils/response");

/**
 * @desc    Lister les dons avec filtres
 * @route   GET /api/dons
 * @access  Privé
 */
const lister = asyncHandler(async (req, res) => {
  const { statut, type_don, etablissement_id, date_debut, date_fin, page, limite } = req.query;
  const result = await service.lister(
    { statut, type_don, etablissement_id, date_debut, date_fin, page, limite },
    req.user
  );
  return success(res, result);
});

/**
 * @desc    Consulter un don par ID
 * @route   GET /api/dons/:id
 * @access  Privé
 */
const consulter = asyncHandler(async (req, res) => {
  const result = await service.consulter(req.params.id, req.user);
  return success(res, result);
});

/**
 * @desc    Lister les dons d'un donneur
 * @route   GET /api/dons/donneur/:donneurId
 * @access  Privé (donneur lui-même ou personnel)
 */
const listerParDonneur = asyncHandler(async (req, res) => {
  const result = await service.listerParDonneur(
    req.params.donneurId,
    req.user
  );
  return success(res, result);
});

/**
 * @desc    Enregistrer un nouveau don
 * @route   POST /api/dons
 * @access  Personnel banque / Admin
 */
const creer = asyncHandler(async (req, res) => {
  const result = await service.creer(req.body, req.user);
  return success(res, result, "Don enregistré avec succès", 201);
});

/**
 * @desc    Valider un don et générer les poches
 * @route   PATCH /api/dons/:id/valider
 * @access  Personnel banque / Admin
 */
const valider = asyncHandler(async (req, res) => {
  const result = await service.valider(req.params.id, req.user);
  return success(res, result, "Don validé et poches générées");
});

/**
 * @desc    Rejeter un don
 * @route   PATCH /api/dons/:id/rejeter
 * @access  Personnel banque / Admin
 */
const rejeter = asyncHandler(async (req, res) => {
  const result = await service.rejeter(req.params.id, req.body, req.user);
  return success(res, result, "Don rejeté");
});

/**
 * @desc    Supprimer un don (admin uniquement)
 * @route   DELETE /api/dons/:id
 * @access  Admin
 */
const supprimer = asyncHandler(async (req, res) => {
  await service.supprimer(req.params.id, req.user);
  return success(res, null, "Don supprimé avec succès");
});

/**
 * @desc    Lister les poches d'un don
 * @route   GET /api/dons/:id/poches
 * @access  Privé
 */
const pochesDuDon = asyncHandler(async (req, res) => {
  const result = await service.pochesDuDon(req.params.id, req.user);
  return success(res, { poches: result });
});


module.exports = { lister, consulter, listerParDonneur, creer, valider, rejeter, supprimer, pochesDuDon, };
