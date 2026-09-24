const service = require("./rdv.service");
const asyncHandler = require("../../utils/asyncHandler");
const { success } = require("../../utils/response");

// ============================================
// CRÉNEAUX
// ============================================

const listerCreneaux = asyncHandler(async (req, res) => {
  const { etablissement_id, date_debut, date_fin, est_actif } = req.query;
  const result = await service.listerCreneaux({
    etablissement_id,
    date_debut,
    date_fin,
    est_actif: est_actif === "false" ? false : true,
  });
  return success(res, result);
});

const creerCreneau = asyncHandler(async (req, res) => {
  const result = await service.creerCreneau(req.body, req.user);
  return success(res, result, "Créneau créé avec succès", 201);
});

const modifierCreneau = asyncHandler(async (req, res) => {
  const result = await service.modifierCreneau(req.params.id, req.body, req.user);
  return success(res, result, "Créneau modifié");
});

const supprimerCreneau = asyncHandler(async (req, res) => {
  await service.supprimerCreneau(req.params.id, req.user);
  return success(res, null, "Créneau supprimé");
});

// ============================================
// RENDEZ-VOUS
// ============================================

const listerRdv = asyncHandler(async (req, res) => {
  const { statut, date_debut, date_fin, page, limite } = req.query;
  const result = await service.listerRdv(
    { statut, date_debut, date_fin, page, limite },
    req.user
  );
  return success(res, result);
});

const mesRdv = asyncHandler(async (req, res) => {
  const result = await service.mesRdv(req.user);
  return success(res, result);
});

const consulterRdv = asyncHandler(async (req, res) => {
  const result = await service.consulterRdv(req.params.id, req.user);
  return success(res, result);
});

const prendreRdv = asyncHandler(async (req, res) => {
  const result = await service.prendreRdv(req.body, req.user);
  return success(res, result, "Rendez-vous pris avec succès", 201);
});

const confirmerRdv = asyncHandler(async (req, res) => {
  const result = await service.confirmerRdv(req.params.id, req.user);
  return success(res, result, "Rendez-vous confirmé");
});

const annulerRdv = asyncHandler(async (req, res) => {
  const result = await service.annulerRdv(req.params.id, req.body, req.user);
  return success(res, result, "Rendez-vous annulé");
});

const marquerHonore = asyncHandler(async (req, res) => {
  const result = await service.marquerHonore(req.params.id, req.user);
  return success(res, result, "Rendez-vous marqué comme honoré");
});

module.exports = {
  listerCreneaux,
  creerCreneau,
  modifierCreneau,
  supprimerCreneau,
  listerRdv,
  mesRdv,
  consulterRdv,
  prendreRdv,
  confirmerRdv,
  annulerRdv,
  marquerHonore,
};