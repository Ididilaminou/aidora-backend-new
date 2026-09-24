const service = require("./rattachements.service");
const asyncHandler = require("../../utils/asyncHandler");
const { success } = require("../../utils/response");

const lister = asyncHandler(async (req, res) => {
  const { donneur_id, etablissement_id, statut, disponible, page, limite } = req.query;
  const result = await service.lister(
    { donneur_id, etablissement_id, statut, disponible, page, limite },
    req.user
  );
  return success(res, result);
});

const mesRattachements = asyncHandler(async (req, res) => {
  const result = await service.mesRattachements(req.user);
  return success(res, result);
});

const rattachementsEtablissement = asyncHandler(async (req, res) => {
  const { statut = "ACTIF" } = req.query;
  const result = await service.rattachementsEtablissement(
    req.params.etablissementId,
    req.user,
    statut
  );
  return success(res, result);
});

const consulter = asyncHandler(async (req, res) => {
  const result = await service.consulter(req.params.id, req.user);
  return success(res, result);
});

const creer = asyncHandler(async (req, res) => {
  const result = await service.creer(req.body, req.user);
  return success(res, result, "Rattachement créé avec succès", 201);
});

const desactiver = asyncHandler(async (req, res) => {
  const result = await service.desactiver(req.params.id, req.user);
  return success(res, result, "Rattachement désactivé");
});

const reactiver = asyncHandler(async (req, res) => {
  const result = await service.reactiver(req.params.id, req.user);
  return success(res, result, "Rattachement réactivé");
});

const definirPrincipal = asyncHandler(async (req, res) => {
  const result = await service.definirPrincipal(req.params.id, req.user);
  return success(res, result, "Rattachement défini comme principal");
});

const supprimer = asyncHandler(async (req, res) => {
  await service.supprimer(req.params.id, req.user);
  return success(res, null, "Rattachement supprimé");
});

module.exports = {
  lister,
  mesRattachements,
  rattachementsEtablissement,
  consulter,
  creer,
  desactiver,
  reactiver,
  definirPrincipal,
  supprimer,
};