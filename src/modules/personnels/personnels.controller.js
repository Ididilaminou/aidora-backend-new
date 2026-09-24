const service = require("./personnels.service");
const asyncHandler = require("../../utils/asyncHandler");
const { success } = require("../../utils/response");

/**
 * Récupère l'utilisateur connecté (défini par le middleware comme req.user).
 */
function getUser(req) {
  return req.user || null;
}

/**
 * @desc    Lister le personnel (avec filtres)
 * @route   GET /api/personnels
 * @access  Admin
 */
const lister = asyncHandler(async (req, res) => {
  const { role, etablissement_id, statut_compte, page, limite } = req.query;
  const result = await service.lister({
    role, etablissement_id, statut_compte, page, limite,
  });
  return success(res, result);
});

/**
 * @desc    Consulter son propre profil personnel
 * @route   GET /api/personnels/moi
 * @access  Personnel connecté
 */
const monProfil = asyncHandler(async (req, res) => {
  const user = getUser(req);
  const result = await service.monProfil(user);
  return success(res, result);
});

/**
 * @desc    Consulter un personnel par ID
 * @route   GET /api/personnels/:id
 * @access  Admin / Personnel
 */
const consulter = asyncHandler(async (req, res) => {
  const user = getUser(req);
  const result = await service.consulter(req.params.id, user);
  return success(res, result);
});

/**
 * @desc    Créer un compte personnel (admin)
 * @route   POST /api/personnels
 * @access  Admin
 */
const creer = asyncHandler(async (req, res) => {
  const user = getUser(req);
  const result = await service.creer(req.body, user);
  return success(
    res,
    result,
    "Compte créé avec succès. Un email a été envoyé avec les identifiants temporaires.",
    201
  );
});

/**
 * @desc    Modifier un personnel
 * @route   PUT /api/personnels/:id
 * @access  Admin
 */
const modifier = asyncHandler(async (req, res) => {
  const user = getUser(req);
  const result = await service.modifier(req.params.id, req.body, user);
  return success(res, result, "Personnel modifié avec succès");
});

/**
 * @desc    Rattacher un personnel à un établissement
 * @route   PATCH /api/personnels/:id/etablissement
 * @access  Admin
 */
const rattacher = asyncHandler(async (req, res) => {
  const user = getUser(req);
  const result = await service.rattacher(req.params.id, req.body, user);
  return success(res, result, "Personnel rattaché avec succès");
});

/**
 * @desc    Activer un compte
 * @route   PATCH /api/personnels/:id/activer
 * @access  Admin
 */
const activer = asyncHandler(async (req, res) => {
  const user = getUser(req);
  const result = await service.changerStatut(req.params.id, "ACTIF", user);
  return success(res, result, "Compte activé");
});

/**
 * @desc    Désactiver un compte
 * @route   PATCH /api/personnels/:id/desactiver
 * @access  Admin
 */
const desactiver = asyncHandler(async (req, res) => {
  const user = getUser(req);
  const result = await service.changerStatut(req.params.id, "INACTIF", user);
  return success(res, result, "Compte désactivé");
});

/**
 * @desc    Supprimer un personnel
 * @route   DELETE /api/personnels/:id
 * @access  Admin
 */
const supprimer = asyncHandler(async (req, res) => {
  const user = getUser(req);
  await service.supprimer(req.params.id, user);
  return success(res, null, "Personnel supprimé avec succès");
});

module.exports = {
  lister,
  monProfil,
  consulter,
  creer,
  modifier,
  rattacher,
  activer,
  desactiver,
  supprimer,
};