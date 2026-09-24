const service = require("./notifications.service");
const asyncHandler = require("../../utils/asyncHandler");
const { success } = require("../../utils/response");

/**
 * Récupère l'utilisateur connecté (défini par le middleware comme req.user).
 */
function getUser(req) {
  return req.user || null;
}

/**
 * @desc    Lister mes notifications
 * @route   GET /api/notifications
 * @access  Privé
 */
const lister = asyncHandler(async (req, res) => {
  const { page, limite } = req.query;
  const user = getUser(req);
  const result = await service.lister(user.id, { page, limite });
  return success(res, result);
});

/**
 * @desc    Lister mes notifications non lues
 * @route   GET /api/notifications/non-lues
 * @access  Privé
 */
const nonLues = asyncHandler(async (req, res) => {
  const user = getUser(req);
  const result = await service.nonLues(user.id);
  return success(res, result);
});

/**
 * @desc    Compteur de notifications non lues
 * @route   GET /api/notifications/compteur
 * @access  Privé
 */
const compteur = asyncHandler(async (req, res) => {
  const user = getUser(req);
  const result = await service.compteur(user.id);
  return success(res, result);
});

/**
 * @desc    Consulter une notification
 * @route   GET /api/notifications/:id
 * @access  Privé
 */
const consulter = asyncHandler(async (req, res) => {
  const user = getUser(req);
  const result = await service.consulter(req.params.id, user.id);
  return success(res, result);
});

/**
 * @desc    Marquer une notification comme lue
 * @route   PATCH /api/notifications/:id/lue
 * @access  Privé
 */
const marquerCommeLue = asyncHandler(async (req, res) => {
  const user = getUser(req);
  const result = await service.marquerCommeLue(req.params.id, user.id);
  return success(res, result, "Notification marquée comme lue");
});

/**
 * @desc    Marquer toutes mes notifications comme lues
 * @route   PATCH /api/notifications/toutes-lues
 * @access  Privé
 */
const marquerToutesCommeLues = asyncHandler(async (req, res) => {
  const user = getUser(req);
  const result = await service.marquerToutesCommeLues(user.id);
  return success(res, result, "Toutes les notifications ont été marquées comme lues");
});

/**
 * @desc    Supprimer une notification
 * @route   DELETE /api/notifications/:id
 * @access  Privé
 */
const supprimer = asyncHandler(async (req, res) => {
  const user = getUser(req);
  await service.supprimer(req.params.id, user.id);
  return success(res, null, "Notification supprimée");
});

/**
 * @desc    Créer une notification (admin)
 * @route   POST /api/notifications
 * @access  Admin
 */
const creer = asyncHandler(async (req, res) => {
  const user = getUser(req);
  const result = await service.creer(req.body, user);
  return success(res, result, "Notification envoyée", 201);
});

/**
 * @desc    Diffuser une notification à plusieurs utilisateurs (admin)
 * @route   POST /api/notifications/diffusion
 * @access  Admin
 */
const diffuser = asyncHandler(async (req, res) => {
  const user = getUser(req);
  const result = await service.diffuser(req.body, user);
  return success(
    res,
    result,
    `Notification diffusée à ${result.envoyees} utilisateur(s)`,
    201
  );
});

module.exports = {
  lister,
  nonLues,
  compteur,
  consulter,
  marquerCommeLue,
  marquerToutesCommeLues,
  supprimer,
  creer,
  diffuser,
};