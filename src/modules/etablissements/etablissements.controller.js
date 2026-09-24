const service = require("./etablissements.service");
const asyncHandler = require("../../utils/asyncHandler");
const { success } = require("../../utils/response");

/**
 * @desc    Créer un établissement (inscription publique)
 * @route   POST /api/etablissements
 * @access  Public
 */
const creer = asyncHandler(async (req, res) => {
  const result = await service.creerEtablissement(req.body, req.user || null);
  return success(
    res,
    result,
    "Demande d'inscription envoyée, en attente de vérification",
    201
  );
});

/**
 * @desc    Obtenir un établissement par ID
 * @route   GET /api/etablissements/:id
 * @access  Personnel / Admin
 */
const obtenir = asyncHandler(async (req, res) => {
  const result = await service.getEtablissement(req.params.id);
  return success(res, result);
});

/**
 * @desc    Lister les établissements (avec filtres)
 * @route   GET /api/etablissements
 * @access  Personnel / Admin
 */
const lister = asyncHandler(async (req, res) => {
  const { statut, type, ville, page, limite } = req.query;
  const result = await service.listerEtablissements({
    statut,
    type,
    ville,
    page,
    limite,
  });
  return success(res, result);
});

/**
 * @desc    Valider un établissement
 * @route   PATCH /api/etablissements/:id/valider
 * @access  Admin
 */
const valider = asyncHandler(async (req, res) => {
  const result = await service.validerEtablissement(
    req.params.id,
    req.user
  );
  return success(res, result, "Établissement validé");
});

/**
 * @desc    Rejeter un établissement (avec motif)
 * @route   PATCH /api/etablissements/:id/rejeter
 * @access  Admin
 */
const rejeter = asyncHandler(async (req, res) => {
  const motif = req.body.motif || null;
  const result = await service.rejeterEtablissement(
    req.params.id,
    motif,
    req.user
  );
  return success(res, result, "Établissement rejeté");
});

/**
 * @desc    Suspendre un établissement
 * @route   PATCH /api/etablissements/:id/suspendre
 * @access  Admin
 */
const suspendre = asyncHandler(async (req, res) => {
  const result = await service.suspendreEtablissement(
    req.params.id,
    req.user
  );
  return success(res, result, "Établissement suspendu");
});

/**
 * @desc    Réactiver un établissement
 * @route   PATCH /api/etablissements/:id/reactiver
 * @access  Admin
 */
const reactiver = asyncHandler(async (req, res) => {
  const result = await service.reactiverEtablissement(
    req.params.id,
    req.user
  );
  return success(res, result, "Établissement réactivé");
});

/**
 * @desc    Modifier les informations d'un établissement
 * @route   PUT /api/etablissements/:id
 * @access  Personnel / Admin
 */
const updateInfos = asyncHandler(async (req, res) => {
  const result = await service.updateInfos(
    req.params.id,
    req.body,
    req.user
  );
  return success(res, result, "Informations mises à jour");
});

/**
 * @desc    Rechercher les établissements proches (géolocalisation)
 * @route   GET /api/etablissements/recherche-proximite
 * @access  Public
 */
const rechercherProches = asyncHandler(async (req, res) => {
  const { latitude, longitude, type, rayonKm } = req.query;
  const result = await service.rechercherProches({
    latitude: parseFloat(latitude),
    longitude: parseFloat(longitude),
    type,
    rayonKm: rayonKm ? parseFloat(rayonKm) : 20,
  });
  return success(res, result);
});

module.exports = {
  creer,
  obtenir,
  lister,
  valider,
  rejeter,
  suspendre,
  reactiver,
  updateInfos,
  rechercherProches,
};