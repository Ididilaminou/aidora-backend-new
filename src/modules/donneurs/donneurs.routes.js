const express = require("express");
const { body, query } = require("express-validator");
const controller = require("./donneurs.controller");
const validate = require("../../middlewares/validate");
const { authenticate, authorize } = require("../../middlewares/auth.middleware");

const router = express.Router();

// ============================================
// RÈGLES DE VALIDATION
// ============================================

const updateProfilRules = [
  body("groupe_sanguin").optional().isIn(["A", "B", "AB", "O"]).withMessage("Groupe sanguin invalide"),
  body("rhesus").optional().isIn(["POSITIF", "NEGATIF"]).withMessage("Rhésus invalide"),
  body("date_naissance").optional({ nullable: true }).isISO8601().withMessage("Date de naissance invalide"),
  body("sexe").optional({ nullable: true }).isIn(["M", "F"]).withMessage("Sexe invalide (M ou F)"),
  body("adresse").optional({ nullable: true, checkFalsy: true }).isString().isLength({ max: 255 }),
];

const disponibiliteRules = [
  body("disponible").isBoolean().withMessage("disponible doit être un booléen"),
];

const positionRules = [
  body("latitude").isFloat({ min: -90, max: 90 }).withMessage("Latitude invalide"),
  body("longitude").isFloat({ min: -180, max: 180 }).withMessage("Longitude invalide"),
];

const creerRules = [
  body("nom").isString().trim().isLength({ min: 2, max: 100 }).withMessage("Le nom doit contenir entre 2 et 100 caractères"),
  body("prenom").isString().trim().isLength({ min: 2, max: 100 }).withMessage("Le prénom doit contenir entre 2 et 100 caractères"),
  body("email").isEmail().withMessage("Courriel invalide").normalizeEmail(),
  body("telephone").isString().trim().isLength({ min: 8, max: 20 }).withMessage("Téléphone invalide"),
  body("groupeSanguin").isIn(["A", "B", "AB", "O"]).withMessage("Groupe sanguin invalide"),
  body("rhesus").isIn(["POSITIF", "NEGATIF"]).withMessage("Rhésus invalide"),
];

const activerRules = [
  body("telephone").isString().trim().isLength({ min: 8, max: 20 }).withMessage("Téléphone invalide"),
  body("codeActivation").isString().trim().notEmpty().withMessage("Code d'activation requis"),
  body("motDePasse").isString().isLength({ min: 8, max: 100 }).withMessage("Le mot de passe doit contenir entre 8 et 100 caractères"),
];

// ============================================
// ROUTES PUBLIQUES (sans auth)
// ============================================

router.post(
  "/activer",
  activerRules,
  validate,
  controller.activer
);

// ============================================
// ROUTES PROTÉGÉES (à partir d'ici, auth obligatoire)
// ============================================

router.use(authenticate);

router.get(
  "/",
  authorize("PERSONNEL_BANQUE", "PERSONNEL_HOPITAL", "ADMINISTRATEUR"),
  controller.lister
);

router.get(
  "/recherche-proximite",
  authorize("PERSONNEL_BANQUE", "PERSONNEL_HOPITAL", "ADMINISTRATEUR"),
  controller.rechercherProches
);

router.get("/moi", authorize("DONNEUR"), controller.profil);

router.put(
  "/moi",
  authorize("DONNEUR"),
  updateProfilRules,
  validate,
  controller.updateProfil
);

router.patch(
  "/moi/disponibilite",
  authorize("DONNEUR"),
  disponibiliteRules,
  validate,
  controller.disponibilite
);

router.patch(
  "/moi/position",
  authorize("DONNEUR"),
  positionRules,
  validate,
  controller.position
);

router.post(
  "/",
  authorize("PERSONNEL_BANQUE", "ADMINISTRATEUR"),
  creerRules,
  validate,
  controller.creer
);

// ⚠️ IMPORTANT : module.exports à la FIN
module.exports = router;