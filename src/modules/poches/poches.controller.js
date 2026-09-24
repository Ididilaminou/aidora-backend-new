const service = require("./poches.service");
const asyncHandler = require("../../utils/asyncHandler");
const { success } = require("../../utils/response");

/**
 * @desc    Lister les poches avec filtres
 * @route   GET /api/poches
 * @access  Privé
 */
const lister = asyncHandler(async (req, res) => {
  const { statut, type_produit, groupe_sanguin, rhesus, etablissement_id, page, limite } = req.query;
  const result = await service.lister({
    statut, type_produit, groupe_sanguin, rhesus, etablissement_id, page, limite,
  });
  return success(res, result);
});

/**
 * @desc    Consulter une poche par ID
 * @route   GET /api/poches/:id
 * @access  Privé
 */
const consulter = asyncHandler(async (req, res) => {
  const result = await service.consulter(req.params.id);
  return success(res, result);
});

/**
 * @desc    Consulter l'historique d'une poche
 * @route   GET /api/poches/:id/historique
 * @access  Privé
 */
const historique = asyncHandler(async (req, res) => {
  const result = await service.historique(req.params.id);
  return success(res, result);
});

/**
 * @desc    Créer une nouvelle poche (génère aussi l'historique)
 * @route   POST /api/poches
 * @access  Personnel banque / Admin
 */
const creer = asyncHandler(async (req, res) => {
  const result = await service.creer(req.body, req.user);
  return success(res, result, "Poche créée avec succès", 201);
});

/**
 * @desc    Changer le statut d'une poche (avec traçabilité)
 * @route   PATCH /api/poches/:id/statut
 * @access  Personnel banque / Admin
 */
const changerStatut = asyncHandler(async (req, res) => {
  const result = await service.changerStatut(
    req.params.id,
    req.body,
    req.user
  );
  return success(res, result, "Statut de la poche mis à jour");
});

/**
 * @desc    Marquer une poche comme vendue
 * @route   PATCH /api/poches/:id/vendre
 * @access  Personnel banque / Admin
 */
const vendre = asyncHandler(async (req, res) => {
  const result = await service.vendre(req.params.id, req.body, req.user);
  return success(res, result, "Poche vendue avec succès");
});

/**
 * @desc    Supprimer une poche (admin uniquement)
 * @route   DELETE /api/poches/:id
 * @access  Admin
 */
const supprimer = asyncHandler(async (req, res) => {
  await service.supprimer(req.params.id, req.user);
  return success(res, null, "Poche supprimée avec succès");
});

const creerLot = asyncHandler(async (req, res) => {
  const result = await service.creerLot(req.body, req.user);
  return success(
    res,
    result,
    `${result.nombre} poche(s) créée(s)`,
    201
  );
});

const listerLots = asyncHandler(async (req, res) => {
  const result = await service.listerLots(req.query, req.user);
  return success(res, result);
});

module.exports = { lister, consulter, historique, creer, changerStatut, vendre, creerLot, supprimer, listerLots };