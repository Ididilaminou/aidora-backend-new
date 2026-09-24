const express = require("express");
const { body, param } = require("express-validator");
const controller = require("./personnels.controller");
const validate = require("../../middlewares/validate");
const { authenticate, authorize } = require("../../middlewares/auth.middleware");

const router = express.Router();

router.use(authenticate);

// ============================================
// RÈGLES DE VALIDATION
// ============================================

const creerRules = [
  body("courriel")
    .isEmail().withMessage("Courriel invalide")
    .normalizeEmail(),
  body("prenom")
    .isString().trim().isLength({ min: 2, max: 100 })
    .withMessage("Le prénom doit contenir entre 2 et 100 caractères"),
  body("nom")
    .isString().trim().isLength({ min: 2, max: 100 })
    .withMessage("Le nom doit contenir entre 2 et 100 caractères"),
  body("telephone")
    .isString().trim().isLength({ min: 8, max: 20 })
    .withMessage("Téléphone invalide (8 à 20 caractères)"),
  body("role")
    .isIn(["PERSONNEL_BANQUE", "PERSONNEL_HOPITAL", "ADMINISTRATEUR"])
    .withMessage("Rôle invalide"),
  body("fonction")
    .optional({ nullable: true, checkFalsy: true })
    .isString().isLength({ max: 100 }),
  body("etablissement_id")
    .optional({ nullable: true })
    .isInt({ min: 1 }).withMessage("ID établissement invalide"),
];

const modifierRules = [
  param("id").isInt({ min: 1 }).withMessage("ID personnel invalide"),
  body("prenom")
    .optional()
    .isString().trim().isLength({ min: 2, max: 100 }),
  body("nom")
    .optional()
    .isString().trim().isLength({ min: 2, max: 100 }),
  body("telephone")
    .optional()
    .isString().trim().isLength({ min: 8, max: 20 }),
  body("fonction")
    .optional({ nullable: true, checkFalsy: true })
    .isString().isLength({ max: 100 }),
];

const rattacherRules = [
  param("id").isInt({ min: 1 }).withMessage("ID personnel invalide"),
  body("etablissement_id")
    .isInt({ min: 1 }).withMessage("ID établissement requis"),
];

const idRules = [
  param("id").isInt({ min: 1 }).withMessage("ID personnel invalide"),
];

// ============================================
// ROUTES
// ============================================

router.get("/", authorize("ADMINISTRATEUR"), controller.lister);
router.get("/moi", controller.monProfil);

router.get(
  "/:id",
  authorize("ADMINISTRATEUR", "PERSONNEL_BANQUE", "PERSONNEL_HOPITAL"),
  idRules,
  validate,
  controller.consulter
);

router.post(
  "/",
  authorize("ADMINISTRATEUR"),
  creerRules,
  validate,
  controller.creer
);

router.put(
  "/:id",
  authorize("ADMINISTRATEUR"),
  modifierRules,
  validate,
  controller.modifier
);

router.patch(
  "/:id/etablissement",
  authorize("ADMINISTRATEUR"),
  rattacherRules,
  validate,
  controller.rattacher
);

router.patch(
  "/:id/activer",
  authorize("ADMINISTRATEUR"),
  idRules,
  validate,
  controller.activer
);

router.patch(
  "/:id/desactiver",
  authorize("ADMINISTRATEUR"),
  idRules,
  validate,
  controller.desactiver
);

router.delete(
  "/:id",
  authorize("ADMINISTRATEUR"),
  idRules,
  validate,
  controller.supprimer
);

module.exports = router;