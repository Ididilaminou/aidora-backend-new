const express = require("express");
const { body, param } = require("express-validator");
const controller = require("./dons.controller");
const validate = require("../../middlewares/validate");
const { authenticate, authorize } = require("../../middlewares/auth.middleware");

const router = express.Router();

router.use(authenticate);

// ============================================
// RÈGLES DE VALIDATION
// ============================================

const creerRules = [
  body("donneur_id")
    .isInt({ min: 1 }).withMessage("L'ID du donneur est requis"),
  body("date_don")
    .isISO8601().withMessage("Date du don invalide")
    .custom((value) => {
      if (new Date(value) > new Date()) {
        throw new Error("La date du don ne peut pas être dans le futur");
      }
      return true;
    }),
  body("type_don")
    .optional()
    .isIn(["SANG_TOTAL", "GLOBULES_ROUGES", "PLAQUETTES", "PLASMA"])
    .withMessage("Type de don invalide"),
  body("quantite")
    .isFloat({ min: 100, max: 600 })
    .withMessage("La quantité doit être comprise entre 100 et 600 ml"),
];

const rejeterRules = [
  param("id").isInt({ min: 1 }).withMessage("ID don invalide"),
  body("motif")
    .isString().trim().isLength({ min: 3, max: 500 })
    .withMessage("Le motif doit contenir entre 3 et 500 caractères"),
];

const idRules = [
  param("id").isInt({ min: 1 }).withMessage("ID don invalide"),
];

const donneurIdRules = [
  param("donneurId").isInt({ min: 1 }).withMessage("ID donneur invalide"),
];

// ============================================
// ROUTES
// ⚠️ Les routes statiques / préfixées DOIVENT être avant /:id
// ============================================

router.get("/", controller.lister);

// Route préfixée avant /:id
router.get(
  "/donneur/:donneurId",
  donneurIdRules,
  validate,
  controller.listerParDonneur
);

router.get(
  "/:id/poches",
  idRules,
  validate,
  controller.pochesDuDon
);

router.get("/:id", idRules, validate, controller.consulter);

router.post(
  "/",
  authorize("PERSONNEL_BANQUE", "ADMINISTRATEUR"),
  creerRules,
  validate,
  controller.creer
);

router.patch(
  "/:id/valider",
  authorize("PERSONNEL_BANQUE", "ADMINISTRATEUR"),
  idRules,
  validate,
  controller.valider
);

router.patch(
  "/:id/rejeter",
  authorize("PERSONNEL_BANQUE", "ADMINISTRATEUR"),
  rejeterRules,
  validate,
  controller.rejeter
);

router.delete(
  "/:id",
  authorize("ADMINISTRATEUR"),
  idRules,
  validate,
  controller.supprimer
);

module.exports = router;
