// ============================================
// AIDORA - ROUTES AUTH
// ============================================

const express = require("express");
const { body } = require("express-validator");
const controller = require("./auth.controller");
const validate = require("../../middlewares/validate");
const { authenticate } = require("../../middlewares/auth.middleware");

const router = express.Router();

// ============================================
// RÈGLES DE VALIDATION
// ============================================

const loginRules = [
  body("identifiant")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("L'identifiant (email ou téléphone) est requis"),
  body("motDePasse")
    .isString()
    .isLength({ min: 8, max: 100 })
    .withMessage("Le mot de passe doit contenir entre 8 et 100 caractères"),
];

const inscriptionRules = [
  body("prenom")
    .isString()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Le prénom doit contenir entre 2 et 100 caractères"),
  body("nom")
    .isString()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Le nom doit contenir entre 2 et 100 caractères"),
  body("telephone")
    .isString()
    .trim()
    .isLength({ min: 8, max: 20 })
    .withMessage("Le téléphone est invalide"),
  body("email")
    .optional({ nullable: true, checkFalsy: true })
    .isEmail()
    .withMessage("L'email est invalide")
    .normalizeEmail(),
  body("motDePasse")
    .isString()
    .isLength({ min: 8, max: 100 })
    .withMessage("Le mot de passe doit contenir entre 8 et 100 caractères"),
  body("groupeSanguin")
    .isIn(["A", "B", "AB", "O"])
    .withMessage("Groupe sanguin invalide"),
  body("rhesus")
    .isIn(["POSITIF", "NEGATIF"])
    .withMessage("Rhésus invalide"),
];

/**
 * ✅ CORRIGÉ : accepte identifiant OU email OU telephone
 */
const activationRules = [
  body("identifiant")
    .optional({ nullable: true, checkFalsy: true })
    .isString()
    .trim(),
  body("email")
    .optional({ nullable: true, checkFalsy: true })
    .isString()
    .trim(),
  body("courriel")
    .optional({ nullable: true, checkFalsy: true })
    .isString()
    .trim(),
  body("telephone")
    .optional({ nullable: true, checkFalsy: true })
    .isString()
    .trim(),
  body("codeActivation")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("Le code d'activation est requis")
    .matches(/^AID-[A-Z0-9]{6}$/i)
    .withMessage("Le code doit respecter le format AID-XXXXXX"),
  // Vérifie qu'au moins un identifiant est fourni
  body().custom((value) => {
    const id =
      value.identifiant || value.email || value.courriel || value.telephone;
    if (!id) {
      throw new Error("Identifiant (email ou téléphone) requis");
    }
    return true;
  }),
];

/**
 * ✅ CORRIGÉ : même logique pour le renvoi
 */
const renvoiRules = [
  body("identifiant")
    .optional({ nullable: true, checkFalsy: true })
    .isString()
    .trim(),
  body("email")
    .optional({ nullable: true, checkFalsy: true })
    .isString()
    .trim(),
  body("courriel")
    .optional({ nullable: true, checkFalsy: true })
    .isString()
    .trim(),
  body("telephone")
    .optional({ nullable: true, checkFalsy: true })
    .isString()
    .trim(),
  body().custom((value) => {
    const id =
      value.identifiant || value.email || value.courriel || value.telephone;
    if (!id) {
      throw new Error("Identifiant (email ou téléphone) requis");
    }
    return true;
  }),
];

const demandeResetRules = [
  body("identifiant")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("L'identifiant est requis"),
];

const resetRules = [
  body("identifiant")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("L'identifiant est requis"),
  body("code")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("Le code est requis"),
  body("nouveauMotDePasse")
    .isString()
    .isLength({ min: 8, max: 100 })
    .withMessage("Le mot de passe doit contenir entre 8 et 100 caractères"),
];

const modifierMdpRules = [
  body("ancienMotDePasse")
    .isString()
    .notEmpty()
    .withMessage("L'ancien mot de passe est requis"),
  body("nouveauMotDePasse")
    .isString()
    .isLength({ min: 8, max: 100 })
    .withMessage("Le nouveau mot de passe doit contenir entre 8 et 100 caractères"),
];

// ============================================
// ROUTES PUBLIQUES
// ============================================

router.post("/login", loginRules, validate, controller.login);

router.post(
  "/inscription-donneur",
  inscriptionRules,
  validate,
  controller.inscrireDonneur
);

router.post(
  "/activation",
  activationRules,
  validate,
  controller.activerCompte
);

router.post(
  "/renvoyer-activation",
  renvoiRules,
  validate,
  controller.renvoyerCode
);

router.post(
  "/mot-de-passe-oublie",
  demandeResetRules,
  validate,
  controller.demanderReinitialisation
);

router.post(
  "/reinitialiser-mot-de-passe",
  resetRules,
  validate,
  controller.reinitialiserMotDePasse
);

// ============================================
// ROUTES PROTÉGÉES
// ============================================

router.post("/logout", authenticate, controller.logout);

router.put(
  "/mot-de-passe",
  authenticate,
  modifierMdpRules,
  validate,
  controller.modifierMotDePasse
);

module.exports = router;