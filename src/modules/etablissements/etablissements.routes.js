const express = require("express");
const { body, param, query } = require("express-validator");
const controller = require("./etablissements.controller");
const validate = require("../../middlewares/validate");
const auth = require("../../middlewares/auth.middleware");

// ⚠️ ADAPTEZ CES NOMS À VOTRE auth.middleware.js
// Si votre middleware exporte { authenticate, authorize }, gardez ces noms
// Sinon remplacez par auth.authentifier / auth.autoriser
const { authenticate, authorize } = auth;

const router = express.Router();

const PERSONNEL_OU_ADMIN = [
  "PERSONNEL_BANQUE",
  "PERSONNEL_HOPITAL",
  "ADMINISTRATEUR",
];

// ============================================
// RÈGLES DE VALIDATION
// ============================================

const creerRules = [
  body("nom")
    .isString().trim().isLength({ min: 3, max: 150 })
    .withMessage("Le nom doit contenir entre 3 et 150 caractères"),
  body("type")
    .isIn(["HOPITAL", "BANQUE_DE_SANG"])
    .withMessage("Le type doit être HOPITAL ou BANQUE_DE_SANG"),
  body("adresse")
    .optional({ nullable: true, checkFalsy: true })
    .isString().isLength({ max: 255 }),
  body("ville")
    .optional({ nullable: true, checkFalsy: true })
    .isString().isLength({ max: 100 }),
  body("region")
    .optional({ nullable: true, checkFalsy: true })
    .isString().isLength({ max: 100 }),
  body("telephone")
    .optional({ nullable: true, checkFalsy: true })
    .isString().isLength({ min: 8, max: 20 }),
  body("email")
    .isEmail().withMessage("Courriel invalide")
    .normalizeEmail(),
  body("latitude")
    .optional({ nullable: true })
    .isFloat({ min: -90, max: 90 })
    .withMessage("Latitude invalide"),
  body("longitude")
    .optional({ nullable: true })
    .isFloat({ min: -180, max: 180 })
    .withMessage("Longitude invalide"),
  body("possede_banque_de_sang")
  .optional({ nullable: true })
  .isBoolean().withMessage("possede_banque_de_sang doit être un booléen"),  
];

const updateInfosRules = [
  param("id").isInt({ min: 1 }).withMessage("ID établissement invalide"),

  body("nom")
    .optional()
    .isString().trim().isLength({ min: 3, max: 150 })
    .withMessage("Le nom doit contenir entre 3 et 150 caractères"),

  body("type")
    .optional()
    .isIn(["HOPITAL", "BANQUE_DE_SANG"])
    .withMessage("Le type doit être HOPITAL ou BANQUE_DE_SANG"),

  body("possede_banque_de_sang")
    .optional({ nullable: true })
    .isBoolean().withMessage("possede_banque_de_sang doit être un booléen"),

  body("adresse")
    .optional({ nullable: true, checkFalsy: true })
    .isString().isLength({ max: 255 }),

  body("ville")
    .optional({ nullable: true, checkFalsy: true })
    .isString().isLength({ max: 100 }),

  body("region")
    .optional({ nullable: true, checkFalsy: true })
    .isString().isLength({ max: 100 }),

  body("telephone")
    .optional({ nullable: true, checkFalsy: true })
    .isString().isLength({ min: 8, max: 20 }),

  body("email")
    .optional({ nullable: true, checkFalsy: true })
    .isEmail().withMessage("Courriel invalide")
    .normalizeEmail(),

  body("latitude")
    .optional({ nullable: true })
    .isFloat({ min: -90, max: 90 })
    .withMessage("Latitude invalide"),

  body("longitude")
    .optional({ nullable: true })
    .isFloat({ min: -180, max: 180 })
    .withMessage("Longitude invalide"),
];

const idParamRule = [
  param("id").isInt({ min: 1 }).withMessage("ID établissement invalide"),
];

const rejeterRules = [
  param("id").isInt({ min: 1 }).withMessage("ID établissement invalide"),
  body("motif")
    .optional({ nullable: true, checkFalsy: true })
    .isString().trim().isLength({ min: 3, max: 500 })
    .withMessage("Le motif doit contenir entre 3 et 500 caractères"),
];

const rechercheProximiteRules = [
  query("latitude")
    .isFloat({ min: -90, max: 90 })
    .withMessage("Latitude requise et valide (-90 à 90)"),
  query("longitude")
    .isFloat({ min: -180, max: 180 })
    .withMessage("Longitude requise et valide (-180 à 180)"),
  query("type")
    .optional()
    .isIn(["HOPITAL", "BANQUE_DE_SANG"])
    .withMessage("Type invalide"),
  query("rayonKm")
    .optional()
    .isFloat({ min: 1, max: 500 })
    .withMessage("Le rayon doit être entre 1 et 500 km"),
];

const listerRules = [
  query("statut")
    .optional()
    .isIn(["EN_ATTENTE_VERIFICATION", "ACTIF", "REJETE", "SUSPENDU"])
    .withMessage("Statut invalide"),
  query("type")
    .optional()
    .isIn(["HOPITAL", "BANQUE_DE_SANG"])
    .withMessage("Type invalide"),
  query("page").optional().isInt({ min: 1 }),
  query("limite").optional().isInt({ min: 1, max: 100 }),
];

// ============================================
// ROUTES
// ============================================

// --- Inscription publique ---
router.post("/", creerRules, validate, controller.creer);

// --- Recherche géo publique (placée AVANT /:id) ---
router.get(
  "/recherche-proximite",
  rechercheProximiteRules,
  validate,
  controller.rechercherProches
);

// --- Consultation (personnel ou admin) ---
router.get(
  "/",
  authenticate,
  authorize(...PERSONNEL_OU_ADMIN),
  listerRules,
  validate,
  controller.lister
);

router.get(
  "/:id",
  authenticate,
  authorize(...PERSONNEL_OU_ADMIN),
  idParamRule,
  validate,
  controller.obtenir
);

router.put(
  "/:id",
  authenticate,
  authorize(...PERSONNEL_OU_ADMIN),
  updateInfosRules,
  validate,
  controller.updateInfos
);

// --- Actions réservées admin ---
router.patch(
  "/:id/valider",
  authenticate,
  authorize("ADMINISTRATEUR"),
  idParamRule,
  validate,
  controller.valider
);

router.patch(
  "/:id/rejeter",
  authenticate,
  authorize("ADMINISTRATEUR"),
  rejeterRules,
  validate,
  controller.rejeter
);

router.patch(
  "/:id/suspendre",
  authenticate,
  authorize("ADMINISTRATEUR"),
  idParamRule,
  validate,
  controller.suspendre
);

router.patch(
  "/:id/reactiver",
  authenticate,
  authorize("ADMINISTRATEUR"),
  idParamRule,
  validate,
  controller.reactiver
);

module.exports = router;