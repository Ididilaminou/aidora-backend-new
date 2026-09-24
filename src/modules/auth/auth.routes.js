const express = require("express");
const { body } = require("express-validator");
const controller = require("./auth.controller");
const validate = require("../../middlewares/validate");
const auth = require("../../middlewares/auth.middleware");

const router = express.Router();

// ============================================
// RÈGLES DE VALIDATION
// ============================================

const loginRules = [
  body("identifiant")
    .isString().trim().notEmpty()
    .withMessage("L'identifiant (email ou téléphone) est requis"),
  body("motDePasse")
    .isString().isLength({ min: 8, max: 100 })
    .withMessage("Le mot de passe doit contenir entre 8 et 100 caractères"),
];

const inscriptionDonneurRules = [
  body("nom")
    .isString().trim().isLength({ min: 2, max: 100 })
    .withMessage("Le nom doit contenir entre 2 et 100 caractères"),
  body("prenom")
    .isString().trim().isLength({ min: 2, max: 100 })
    .withMessage("Le prénom doit contenir entre 2 et 100 caractères"),
  body("email")
    .optional({ nullable: true, checkFalsy: true })
    .isEmail().withMessage("Email invalide")
    .normalizeEmail(),
  body("telephone")
    .isString().trim().isLength({ min: 8, max: 20 })
    .withMessage("Le téléphone doit contenir entre 8 et 20 caractères"),
  body("motDePasse")
    .isString().isLength({ min: 8, max: 100 })
    .withMessage("Le mot de passe doit contenir entre 8 et 100 caractères")
    .matches(/[A-Za-z]/).withMessage("Le mot de passe doit contenir au moins une lettre")
    .matches(/\d/).withMessage("Le mot de passe doit contenir au moins un chiffre"),
  body("groupeSanguin")
    .isIn(["A", "B", "AB", "O"]).withMessage("Groupe sanguin invalide"),
  body("rhesus")
    .isIn(["POSITIF", "NEGATIF"]).withMessage("Rhésus invalide"),
  body("dateNaissance")
    .optional({ nullable: true })
    .isISO8601().withMessage("Date de naissance invalide"),
  body("sexe")
    .optional({ nullable: true })
    .isIn(["M", "F"]).withMessage("Le sexe doit être M ou F"),
  body("latitude")
    .optional({ nullable: true })
    .isFloat({ min: -90, max: 90 }).withMessage("Latitude invalide"),
  body("longitude")
    .optional({ nullable: true })
    .isFloat({ min: -180, max: 180 }).withMessage("Longitude invalide"),
  body("ville")
    .optional({ nullable: true, checkFalsy: true })
    .isString().isLength({ max: 100 }),
  body("quartier")
    .optional({ nullable: true, checkFalsy: true })
    .isString().isLength({ max: 100 }),
];

const activationRules = [
  body("code")
    .isString().trim().matches(/^AID-[A-Z0-9]{6}$/)
    .withMessage("Le code doit respecter le format AID-XXXXXX"),
  body("courriel")
    .optional({ nullable: true, checkFalsy: true })
    .isEmail().withMessage("Email invalide"),
  body("telephone")
    .optional({ nullable: true, checkFalsy: true })
    .isString().isLength({ min: 8, max: 20 }),
];

const renvoyerCodeRules = [
  body("courriel")
    .optional({ nullable: true, checkFalsy: true })
    .isEmail().withMessage("Email invalide"),
  body("telephone")
    .optional({ nullable: true, checkFalsy: true })
    .isString().isLength({ min: 8, max: 20 }),
];

const motDePasseOublieRules = [
  body("courriel")
    .optional({ nullable: true, checkFalsy: true })
    .isEmail().withMessage("Email invalide"),
  body("telephone")
    .optional({ nullable: true, checkFalsy: true })
    .isString().isLength({ min: 8, max: 20 }),
];

const reinitialiserRules = [
  body("code")
    .isString().trim().matches(/^AID-[A-Z0-9]{6}$/)
    .withMessage("Le code doit respecter le format AID-XXXXXX"),
  body("nouveauMotDePasse")
    .isString().isLength({ min: 8, max: 100 })
    .withMessage("Le mot de passe doit contenir entre 8 et 100 caractères"),
];

const modifierMdpRules = [
  body("ancienMotDePasse")
    .isString().notEmpty().withMessage("L'ancien mot de passe est requis"),
  body("nouveauMotDePasse")
    .isString().isLength({ min: 8, max: 100 })
    .withMessage("Le mot de passe doit contenir entre 8 et 100 caractères"),
];

const inviterDonneurRules = [
  body("etablissementId")
    .optional()
    .isInt({ min: 1 }).withMessage("ID établissement invalide"),
  body("prenom")
    .isString().trim().isLength({ min: 2, max: 100 })
    .withMessage("Le prénom doit contenir entre 2 et 100 caractères"),
  body("nom")
    .isString().trim().isLength({ min: 2, max: 100 })
    .withMessage("Le nom doit contenir entre 2 et 100 caractères"),
  body("email")
    .optional({ nullable: true, checkFalsy: true })
    .isEmail().withMessage("Email invalide"),
  body("telephone")
    .optional({ nullable: true, checkFalsy: true })
    .isString().isLength({ min: 8, max: 20 }),
  body("groupeSanguin")
    .optional()
    .isIn(["A", "B", "AB", "O"]).withMessage("Groupe sanguin invalide"),
  body("rhesus")
    .optional()
    .isIn(["POSITIF", "NEGATIF"]).withMessage("Rhésus invalide"),
];

const accepterInvitationRules = [
  body("code")
    .isString().trim().matches(/^AID-[A-Z0-9]{6}$/)
    .withMessage("Code d'invitation invalide"),
  body("motDePasse")
    .isString().isLength({ min: 8, max: 100 })
    .withMessage("Le mot de passe doit contenir entre 8 et 100 caractères"),
];

// ============================================
// ROUTES PUBLIQUES
// ============================================

router.post("/login", loginRules, validate, controller.login);
router.post("/inscription-donneur", inscriptionDonneurRules, validate, controller.inscrireDonneur);
router.post("/activation", activationRules, validate, controller.activerCompte);
router.post("/renvoyer-activation", renvoyerCodeRules, validate, controller.renvoyerCode);
router.post("/mot-de-passe-oublie", motDePasseOublieRules, validate, controller.demanderReinitialisation);
router.post("/reinitialiser-mot-de-passe", reinitialiserRules, validate, controller.reinitialiserMotDePasse);
router.post("/accepter-invitation", accepterInvitationRules, validate, controller.accepterInvitation);

// ============================================
// ROUTES PROTÉGÉES
// ============================================

router.post("/logout", auth.authenticate, controller.logout);

router.put(
  "/mot-de-passe",
  auth.authenticate,
  modifierMdpRules,
  validate,
  controller.modifierMotDePasse
);

router.post(
  "/inviter-donneur",
  auth.authenticate,
  auth.authorize("PERSONNEL_BANQUE", "ADMINISTRATEUR"),
  inviterDonneurRules,
  validate,
  controller.inviterDonneur
);

module.exports = router;