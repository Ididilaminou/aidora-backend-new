const express = require("express");
const { body, query } = require("express-validator");
const controller = require("./sollicitations.controller");
const validate = require("../../middlewares/validate");
const { authenticate, authorize } = require("../../middlewares/auth.middleware");

const router = express.Router();

router.use(authenticate);

const creerRules = [
  body("donneur_id").isInt({ min: 1 }).withMessage("ID donneur requis"),
  body("message").optional().isLength({ max: 500 }),
  body("motif").optional().isLength({ max: 255 }),
];

const repondreRules = [
  body("statut").isIn(["ACCEPTEE", "REFUSEE"]).withMessage("Statut invalide"),
];

router.get("/", controller.lister);
router.get(
  "/donneurs-compatibles",
  authorize("PERSONNEL_BANQUE", "ADMINISTRATEUR"),
  controller.donneursCompatibles
);
router.post(
  "/",
  authorize("PERSONNEL_BANQUE", "ADMINISTRATEUR"),
  creerRules,
  validate,
  controller.creer
);
router.patch(
  "/:id/repondre",
  authorize("DONNEUR", "PERSONNEL_BANQUE", "ADMINISTRATEUR"),
  repondreRules,
  validate,
  controller.repondre
);

module.exports = router;