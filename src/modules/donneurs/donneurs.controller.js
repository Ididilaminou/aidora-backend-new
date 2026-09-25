const donneurService = require("./donneurs.service");
const asyncHandler = require("../../utils/asyncHandler");
const { success } = require("../../utils/response");

const creer = asyncHandler(async (req, res) => {
  const result = await donneurService.creerDonneur(
    req.body,
    req.user.etablissementId,
    req.user
  );
  return success(res, result, "Compte donneur créé, code d'activation généré", 201);
});

const activer = asyncHandler(async (req, res) => {
  const { telephone, codeActivation, motDePasse } = req.body;
  const result = await donneurService.activerDonneur(telephone, codeActivation, motDePasse);
  return success(res, result, "Compte activé avec succès");
});

const listerTous = asyncHandler(async (req, res) => {
  const seulementGeo = req.query.geo === "true";
  const result = await donneurService.listerTous(seulementGeo);
  return success(res, result);
});

const profil = asyncHandler(async (req, res) => {
  const result = await donneurService.getProfil(req.user.id);
  return success(res, result);
});

const updateProfil = asyncHandler(async (req, res) => {
  const result = await donneurService.updateProfil(req.user.id, req.body);
  return success(res, result, "Profil mis à jour");
});

const disponibilite = asyncHandler(async (req, res) => {
  const result = await donneurService.updateDisponibilite(req.user.id, req.body.disponible);
  return success(res, result, "Disponibilité mise à jour");
});

const position = asyncHandler(async (req, res) => {
  const { latitude, longitude } = req.body;
  const result = await donneurService.updatePosition(req.user.id, latitude, longitude);
  return success(res, result, "Position mise à jour");
});

const lister = asyncHandler(async (req, res) => {
  const result = await donneurService.listerDonneurs(req.user.etablissementId);
  return success(res, result);
});

const rechercherProches = asyncHandler(async (req, res) => {
  const { groupeSanguin, rhesus, latitude, longitude, rayonKm } = req.query;
  const result = await donneurService.rechercherDonneursProches({
    groupeSanguin,
    rhesus,
    latitude: parseFloat(latitude),
    longitude: parseFloat(longitude),
    rayonKm: rayonKm ? parseFloat(rayonKm) : undefined,
  });
  return success(res, result);
});

module.exports = {
  creer,
  activer,
  profil,
  updateProfil,
  disponibilite,
  position,
  lister,
  rechercherProches,
  listerTous,
};