const service = require("./evaluations-ia.service");
const asyncHandler = require("../../utils/asyncHandler");
const { success } = require("../../utils/response");

const lister = asyncHandler(async (req, res) => {
  const result = await service.lister(req.query, req.user);
  return success(res, { evaluations: result });
});

const consulter = asyncHandler(async (req, res) => {
  const result = await service.consulter(req.params.id, req.user);
  return success(res, result);
});

const evaluer = asyncHandler(async (req, res) => {
  const result = await service.evaluerPour(req.user, req.body);
  return success(res, result, "Pré-évaluation effectuée", 201);
});

const derniere = asyncHandler(async (req, res) => {
  const result = await service.derniere(req.user);
  return success(res, result);
});

module.exports = { lister, consulter, evaluer, derniere };