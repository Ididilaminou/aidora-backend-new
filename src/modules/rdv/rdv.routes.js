const express = require("express");
const { body, param, query } = require("express-validator");
const controller = require("./rdv.controller");
const validate = require("../../middlewares/validate");
const { authenticate, authorize } = require("../../middlewares/auth.middleware");

const router = express.Router();

router.use(authenticate);

// ============================================
// RÈGLES DE VALIDATION
// ============================================

const creerCreneauRules = [
  body("etablissement_id").optional().isInt({ min: 1 }),
  body("date_creneau")
    .isISO8601().withMessage("Date du créneau invalide")
    .custom((value) => {
      if (new Date(value) < new Date().setHours(0, 0, 0, 0)) {
        throw new Error("La date du créneau ne peut pas être dans le passé");
      }
      return true;
    }),
  body("heure_debut")
    .matches(/^\d{2}:\d{2}(:\d{2})?$/).withMessage("Heure de début invalide (HH:MM)"),
  body("heure_fin")
    .matches(/^\d{2}:\d{2}(:\d{2})?$/).withMessage("Heure de fin invalide (HH:MM)")
    .custom((value, { req }) => {
      if (value <= req.body.heure_debut) {
        throw new Error("L'heure de fin doit être postérieure à l'heure de début");
      }
      return true;
    }),
  body("capacite_max")
    .isInt({ min: 1, max: 100 }).withMessage("La capacité doit être entre 1 et 100"),
  body("est_actif").optional().isBoolean(),
];

const modifierCreneauRules = [
  param("id").isInt({ min: 1 }).withMessage("ID créneau invalide"),
  body("date_creneau").optional().isISO8601(),
  body("heure_debut").optional().matches(/^\d{2}:\d{2}(:\d{2})?$/),
  body("heure_fin").optional().matches(/^\d{2}:\d{2}(:\d{2})?$/),
  body("capacite_max").optional().isInt({ min: 1, max: 100 }),
  body("est_actif").optional().isBoolean(),
];

const prendreRdvRules = [
  body("creneau_id").isInt({ min: 1 }).withMessage("ID créneau requis"),
  body("commentaire").optional({ nullable: true, checkFalsy: true }).isString().isLength({ max: 500 }),
];

const annulerRdvRules = [
  param("id").isInt({ min: 1 }).withMessage("ID RDV invalide"),
  body("motif").optional({ nullable: true, checkFalsy: true }).isString().isLength({ max: 500 }),
];

const idRules = [
  param("id").isInt({ min: 1 }).withMessage("ID invalide"),
];

// ============================================
// CRÉNEAUX
// ============================================

router.get("/creneaux", controller.listerCreneaux);

router.post(
  "/creneaux",
  authorize("PERSONNEL_BANQUE", "ADMINISTRATEUR"),
  creerCreneauRules,
  validate,
  controller.creerCreneau
);

router.put(
  "/creneaux/:id",
  authorize("PERSONNEL_BANQUE", "ADMINISTRATEUR"),
  modifierCreneauRules,
  validate,
  controller.modifierCreneau
);

router.delete(
  "/creneaux/:id",
  authorize("PERSONNEL_BANQUE", "ADMINISTRATEUR"),
  idRules,
  validate,
  controller.supprimerCreneau
);

// ============================================
// RENDEZ-VOUS
// ============================================

router.get("/", controller.listerRdv);
router.get("/moi", authorize("DONNEUR"), controller.mesRdv);
router.get("/:id", idRules, validate, controller.consulterRdv);

router.post(
  "/",
  authorize("DONNEUR"),
  prendreRdvRules,
  validate,
  controller.prendreRdv
);

router.patch(
  "/:id/confirmer",
  authorize("PERSONNEL_BANQUE", "ADMINISTRATEUR"),
  idRules,
  validate,
  controller.confirmerRdv
);

router.patch(
  "/:id/annuler",
  annulerRdvRules,
  validate,
  controller.annulerRdv
);

router.patch(
  "/:id/honore",
  authorize("PERSONNEL_BANQUE", "ADMINISTRATEUR"),
  idRules,
  validate,
  controller.marquerHonore
);

module.exports = router;