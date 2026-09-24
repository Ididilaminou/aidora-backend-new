const service = require("./registres.service");
const asyncHandler = require("../../utils/asyncHandler");
const { success } = require("../../utils/response");
const fs = require("fs");

// ============================================
// INVITATION UNITAIRE
// ============================================

const inviterDonneur = asyncHandler(async (req, res) => {
  const result = await service.inviterDonneur(req.body, req.user);
  return success(res, result, result.message, 201);
});

// ============================================
// IMPORT CSV
// ============================================

const importerCsv = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: "Aucun fichier fourni",
      code: "FICHIER_MANQUANT",
    });
  }

  const { etablissement_id } = req.body;

  try {
    const result = await service.importerCsv(
      req.file.path,
      req.user,
      etablissement_id ? Number(etablissement_id) : null
    );

    // Supprimer le fichier temporaire
    fs.unlink(req.file.path, (err) => {
      if (err) console.error("Erreur suppression CSV:", err);
    });

    return success(
      res,
      result,
      `Import terminé : ${result.importes} importés, ${result.echoues} échoués, ${result.doublons} doublons.`,
      201
    );
  } catch (err) {
    // Suppression du fichier même en cas d'erreur
    fs.unlink(req.file.path, () => {});
    throw err;
  }
});

// ============================================
// LISTE / SUIVI
// ============================================

const listerInvitations = asyncHandler(async (req, res) => {
  const { statut, source, page, limite } = req.query;
  const result = await service.listerInvitations(
    { statut, source, page, limite },
    req.user
  );
  return success(res, result);
});

const consulterInvitation = asyncHandler(async (req, res) => {
  const result = await service.consulterInvitation(req.params.id, req.user);
  return success(res, result);
});

const annulerInvitation = asyncHandler(async (req, res) => {
  const result = await service.annulerInvitation(req.params.id, req.user);
  return success(res, result, "Invitation annulée");
});

const statsInvitations = asyncHandler(async (req, res) => {
  const result = await service.statsInvitations(req.user);
  return success(res, result);
});

// ============================================
// ACCEPTATION (public)
// ============================================

const accepterInvitation = asyncHandler(async (req, res) => {
  const result = await service.accepterInvitation(req.body, req.ip);
  return success(res, result, result.message, 201);
});

module.exports = {
  inviterDonneur,
  importerCsv,
  listerInvitations,
  consulterInvitation,
  annulerInvitation,
  statsInvitations,
  accepterInvitation,
};