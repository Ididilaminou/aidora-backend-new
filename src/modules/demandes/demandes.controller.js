const service = require("./demandes.service");
const asyncHandler = require("../../utils/asyncHandler");
const { success } = require("../../utils/response");

/**
 * @desc    Lister les demandes avec filtres
 * @route   GET /api/demandes
 * @access  Privé
 */
const lister = asyncHandler(async (req, res) => {
  const { statut, urgence, type_produit, groupe_sanguin, rhesus, page, limite } = req.query;
  const result = await service.lister(
    {
      statut, urgence: urgence === "true" ? true : urgence === "false" ? false : undefined,
      type_produit, groupe_sanguin, rhesus, page, limite,
    },
    req.user
  );
  return success(res, result);
});

/**
 * @desc    Consulter une demande
 * @route   GET /api/demandes/:id
 * @access  Privé
 */
const consulter = asyncHandler(async (req, res) => {
  const result = await service.consulter(req.params.id, req.user);
  return success(res, result);
});

/**
 * @desc    Historique d'une demande
 * @route   GET /api/demandes/:id/historique
 * @access  Privé
 */
const historique = asyncHandler(async (req, res) => {
  const result = await service.historique(req.params.id, req.user);
  return success(res, result);
});

/**
 * @desc    Créer une demande de sang
 * @route   POST /api/demandes
 * @access  Personnel hôpital
 */
const creer = asyncHandler(async (req, res) => {
  const result = await service.creer(req.body, req.user);
  return success(res, result, "Demande de sang créée avec succès", 201);
});

/**
 * @desc    Accepter une demande
 * @route   PATCH /api/demandes/:id/accepter
 * @access  Personnel banque / Admin
 */
const accepter = asyncHandler(async (req, res) => {
  const result = await service.accepter(req.params.id, req.body, req.user);
  return success(res, result, "Demande acceptée");
});

/**
 * @desc    Rejeter une demande
 * @route   PATCH /api/demandes/:id/rejeter
 * @access  Personnel banque / Admin
 */
const rejeter = asyncHandler(async (req, res) => {
  const result = await service.rejeter(req.params.id, req.body, req.user);
  return success(res, result, "Demande rejetée");
});

/**
 * @desc    Livrer une demande (déduit du stock)
 * @route   PATCH /api/demandes/:id/livrer
 * @access  Personnel banque / Admin
 */
const livrer = asyncHandler(async (req, res) => {
  const result = await service.livrer(req.params.id, req.user);
  return success(res, result, "Demande livrée");
});

/**
 * @desc    Confirmer la réception (côté hôpital)
 * @route   PATCH /api/demandes/:id/confirmer-reception
 * @access  Personnel hôpital
 */
const confirmerReception = asyncHandler(async (req, res) => {
  const result = await service.confirmerReception(req.params.id, req.user);
  return success(res, result, "Réception confirmée");
});

/**
 * @desc    Annuler une demande
 * @route   PATCH /api/demandes/:id/annuler
 * @access  Personnel hôpital / Admin
 */
const annuler = asyncHandler(async (req, res) => {
  const result = await service.annuler(req.params.id, req.body, req.user);
  return success(res, result, "Demande annulée");
});

module.exports = {
  lister,
  consulter,
  historique,
  creer,
  accepter,
  rejeter,
  livrer,
  confirmerReception,
  annuler,
};