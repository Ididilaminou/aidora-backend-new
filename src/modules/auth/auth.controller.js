// ============================================
// AIDORA - CONTROLLER AUTH
// ============================================

const service = require("./auth.service");
const asyncHandler = require("../../utils/asyncHandler");
const { success } = require("../../utils/response");

function getIp(req) {
  return (
    req.ip ||
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    null
  );
}

function getUser(req) {
  return req.user || null;
}

// ============================================
// CONNEXION / DÉCONNEXION
// ============================================

const login = asyncHandler(async (req, res) => {
  const { identifiant, courriel, email, telephone, motDePasse } = req.body;
  const id = identifiant || courriel || email || telephone;
  const result = await service.login(id, motDePasse, getIp(req));
  return success(res, result, "Connexion réussie");
});

const logout = asyncHandler(async (req, res) => {
  const user = getUser(req);
  const result = await service.logout(user.id, getIp(req));
  return success(res, result);
});

// ============================================
// INSCRIPTION PUBLIQUE D'UN DONNEUR
// ============================================

const inscrireDonneur = asyncHandler(async (req, res) => {
  const result = await service.inscrireDonneur(req.body, getIp(req));
  return success(res, result, result.message, 201);
});

// ============================================
// ACTIVATION DE COMPTE
// ------------------------------------------------------------
// ✅ Accepte identifiant OU courriel/email OU telephone
// ============================================

const activerCompte = asyncHandler(async (req, res) => {
  const {
    identifiant,
    courriel,
    email,
    telephone,
    codeActivation,
    code,
  } = req.body;

  // Priorité : identifiant > courriel/email > telephone
  const idFinal = identifiant || courriel || email || telephone;

  const result = await service.activerCompte(
    {
      identifiant: idFinal,
      courriel: courriel || email,
      telephone,
      codeActivation: codeActivation || code,
    },
    getIp(req)
  );
  return success(res, result);
});

// ============================================
// RENVOYER UN CODE D'ACTIVATION
// ✅ Accepte identifiant OU courriel/email OU telephone
// ============================================

const renvoyerCode = asyncHandler(async (req, res) => {
  const { identifiant, courriel, email, telephone } = req.body;

  const idFinal = identifiant || courriel || email || telephone;

  const result = await service.renvoyerCodeActivation({
    identifiant: idFinal,
    courriel: courriel || email,
    telephone,
  });
  return success(res, result);
});

// ============================================
// MOT DE PASSE OUBLIÉ
// ============================================

const demanderReinitialisation = asyncHandler(async (req, res) => {
  const { identifiant, courriel, email, telephone } = req.body;
  const idFinal = identifiant || courriel || email || telephone;

  const result = await service.demanderReinitialisation({
    identifiant: idFinal,
    courriel: courriel || email,
    telephone,
  });
  return success(res, result);
});

const reinitialiserMotDePasse = asyncHandler(async (req, res) => {
  const {
    identifiant,
    courriel,
    email,
    telephone,
    code,
    codeActivation,
    nouveauMotDePasse,
  } = req.body;

  const idFinal = identifiant || courriel || email || telephone;

  const result = await service.reinitialiserMotDePasse(
    {
      identifiant: idFinal,
      courriel: courriel || email,
      telephone,
      code: code || codeActivation,
      nouveauMotDePasse,
    },
    getIp(req)
  );
  return success(res, result);
});

const modifierMotDePasse = asyncHandler(async (req, res) => {
  const user = getUser(req);
  const result = await service.modifierMotDePasse(
    user.id,
    req.body,
    getIp(req)
  );
  return success(res, result);
});

// ============================================
// INVITATIONS
// ============================================

const inviterDonneur = asyncHandler(async (req, res) => {
  const user = getUser(req);
  const result = await service.inviterDonneursParBanque(req.body, user);
  return success(res, result, "Invitation envoyée avec succès", 201);
});

const accepterInvitation = asyncHandler(async (req, res) => {
  const result = await service.accepterInvitation(req.body, getIp(req));
  return success(res, result, result.message, 201);
});

// ============================================
// EXPORTS
// ============================================

module.exports = {
  login,
  logout,
  inscrireDonneur,
  activerCompte,
  renvoyerCode,
  demanderReinitialisation,
  reinitialiserMotDePasse,
  modifierMotDePasse,
  inviterDonneur,
  accepterInvitation,
};