// ============================================
// AIDORA - CONTROLLER AUTH
// ============================================

const service = require("./auth.service");
const asyncHandler = require("../../utils/asyncHandler");
const { success } = require("../../utils/response");

/**
 * Extrait l'IP réelle (derrière proxy éventuel).
 */
function getIp(req) {
  return (
    req.ip ||
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    null
  );
}

/**
 * Récupère l'utilisateur connecté depuis req.user (défini par le middleware).
 */
function getUser(req) {
  return req.user || null;
}

// ============================================
// CONNEXION / DÉCONNEXION
// ============================================

const login = asyncHandler(async (req, res) => {
  const { identifiant, motDePasse } = req.body;
  const result = await service.login(identifiant, motDePasse, getIp(req));
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

/**
 * @desc    Inscription publique d'un nouveau donneur
 * @route   POST /api/auth/inscription-donneur
 * @access  Public
 */
const inscrireDonneur = asyncHandler(async (req, res) => {
  const result = await service.inscrireDonneur(req.body, getIp(req));
  return success(res, result, result.message, 201);
});

// ============================================
// ACTIVATION DE COMPTE
// ============================================

/**
 * @desc    Activer un compte avec un code
 * @route   POST /api/auth/activation
 * @access  Public
 */
const activerCompte = asyncHandler(async (req, res) => {
  const result = await service.activerCompte(req.body, getIp(req));
  return success(res, result);
});

/**
 * @desc    Renvoyer un code d'activation
 * @route   POST /api/auth/renvoyer-activation
 * @access  Public
 */
const renvoyerCode = asyncHandler(async (req, res) => {
  const result = await service.renvoyerCodeActivation(req.body);
  return success(res, result);
});

// ============================================
// MOT DE PASSE OUBLIÉ
// ============================================

/**
 * @desc    Demander une réinitialisation de mot de passe
 * @route   POST /api/auth/mot-de-passe-oublie
 * @access  Public
 */
const demanderReinitialisation = asyncHandler(async (req, res) => {
  const result = await service.demanderReinitialisation(req.body);
  return success(res, result);
});

/**
 * @desc    Réinitialiser le mot de passe avec un code
 * @route   POST /api/auth/reinitialiser-mot-de-passe
 * @access  Public
 */
const reinitialiserMotDePasse = asyncHandler(async (req, res) => {
  const result = await service.reinitialiserMotDePasse(req.body, getIp(req));
  return success(res, result);
});

/**
 * @desc    Modifier son mot de passe (connecté)
 * @route   PUT /api/auth/mot-de-passe
 * @access  Privé
 */
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
// INVITATIONS (registre papier)
// ============================================

/**
 * @desc    Inviter un donneur du registre à rejoindre Aidora
 * @route   POST /api/auth/inviter-donneur
 * @access  Personnel banque / Admin
 */
const inviterDonneur = asyncHandler(async (req, res) => {
  const user = getUser(req);
  // Récupérer le nom de l'établissement pour l'email/SMS
  const result = await service.inviterDonneursParBanque(req.body, user);
  return success(res, result, "Invitation envoyée avec succès", 201);
});

/**
 * @desc    Accepter une invitation reçue d'une banque
 * @route   POST /api/auth/accepter-invitation
 * @access  Public
 */
const accepterInvitation = asyncHandler(async (req, res) => {
  const result = await service.accepterInvitation(req.body, getIp(req));
  return success(res, result, result.message, 201);
});

// ============================================
// EXPORTS
// ============================================

module.exports = {
  // Connexion
  login,
  logout,
  // Inscription
  inscrireDonneur,
  activerCompte,
  renvoyerCode,
  // Mot de passe
  demanderReinitialisation,
  reinitialiserMotDePasse,
  modifierMotDePasse,
  // Invitations
  inviterDonneur,
  accepterInvitation,
};