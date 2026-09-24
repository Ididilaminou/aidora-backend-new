const service = require("./stock.service");
const asyncHandler = require("../../utils/asyncHandler");
const { success } = require("../../utils/response");

/**
 * @desc    Lister tous les stocks
 * @route   GET /api/stock
 * @access  Privé
 */
const lister = asyncHandler(async (req, res) => {
  const { etablissement_id, groupe_sanguin, rhesus, type_produit, en_alerte, page, limite } = req.query;
  const result = await service.lister({
    etablissement_id, groupe_sanguin, rhesus, type_produit,
    en_alerte: en_alerte === "true",
    page, limite,
  });
  return success(res, result);
});

/**
 * @desc    Lister les stocks d'un établissement
 * @route   GET /api/stock/etablissement/:etablissementId
 * @access  Privé
 */
const listerParEtablissement = asyncHandler(async (req, res) => {
  const result = await service.listerParEtablissement(req.params.etablissementId);
  return success(res, result);
});

/**
 * @desc    Consulter un stock
 * @route   GET /api/stock/:id
 * @access  Privé
 */
const consulter = asyncHandler(async (req, res) => {
  const result = await service.consulter(req.params.id);
  return success(res, result);
});

/**
 * @desc    Consulter les mouvements d'un stock
 * @route   GET /api/stock/:id/mouvements
 * @access  Privé
 */
const mouvements = asyncHandler(async (req, res) => {
  const result = await service.mouvements(req.params.id);
  return success(res, result);
});

/**
 * @desc    Lister les stocks en alerte (sous le seuil)
 * @route   GET /api/stock/alertes/seuils
 * @access  Privé
 */
const alertesSeuils = asyncHandler(async (req, res) => {
  const result = await service.alertesSeuils(req.user);
  return success(res, result);
});

/**
 * @desc    Créer un nouveau stock
 * @route   POST /api/stock
 * @access  Personnel banque / Admin
 */
const creer = asyncHandler(async (req, res) => {
  const result = await service.creer(req.body, req.user);
  return success(res, result, "Stock créé avec succès", 201);
});

/**
 * @desc    Ajouter une entrée de stock
 * @route   PATCH /api/stock/:id/entree
 * @access  Personnel banque / Admin
 */
const entree = asyncHandler(async (req, res) => {
  const result = await service.entree(req.params.id, req.body, req.user);
  return success(res, result, "Entrée enregistrée");
});

/**
 * @desc    Enregistrer une sortie de stock
 * @route   PATCH /api/stock/:id/sortie
 * @access  Personnel banque / Admin
 */
const sortie = asyncHandler(async (req, res) => {
  const result = await service.sortie(req.params.id, req.body, req.user);
  return success(res, result, "Sortie enregistrée");
});

/**
 * @desc    Ajuster manuellement un stock (admin)
 * @route   PATCH /api/stock/:id/ajustement
 * @access  Admin
 */
const ajustement = asyncHandler(async (req, res) => {
  const result = await service.ajustement(req.params.id, req.body, req.user);
  return success(res, result, "Stock ajusté");
});

/**
 * @desc    Modifier le seuil d'alerte
 * @route   PATCH /api/stock/:id/seuil
 * @access  Admin
 */
const modifierSeuil = asyncHandler(async (req, res) => {
  const result = await service.modifierSeuil(req.params.id, req.body);
  return success(res, result, "Seuil d'alerte mis à jour");
});

/**
 * @desc    Supprimer un stock
 * @route   DELETE /api/stock/:id
 * @access  Admin
 */
const supprimer = asyncHandler(async (req, res) => {
  await service.supprimer(req.params.id, req.user);
  return success(res, null, "Stock supprimé avec succès");
});

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