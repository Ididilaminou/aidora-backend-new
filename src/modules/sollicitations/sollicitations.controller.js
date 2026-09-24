const service = require("./sollicitations.service");
const asyncHandler = require("../../utils/asyncHandler");
const { success } = require("../../utils/response");

const lister = asyncHandler(async (req, res) => {
  const result = await service.lister(req.query, req.user);
  return success(res, result);
});

const donneursCompatibles = asyncHandler(async (req, res) => {
  const { groupe_sanguin, rhesus } = req.query;
  const result = await service.donneursCompatibles(groupe_sanguin, rhesus, req.user);
  return success(res, { donneurs: result });
});

const creer = asyncHandler(async (req, res) => {
  const result = await service.creer(req.body, req.user);
  return success(res, result, "Sollicitation envoyée", 201);
});

const repondre = asyncHandler(async (req, res) => {
  const result = await service.repondre(req.params.id, req.body, req.user);
  return success(res, result, "Réponse enregistrée");
});

module.exports = { lister, donneursCompatibles, creer, repondre };