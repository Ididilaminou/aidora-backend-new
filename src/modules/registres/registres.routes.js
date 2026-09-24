const express = require("express");
const multer = require("multer");
const path = require("path");
const { body, param, query } = require("express-validator");
const controller = require("./registres.controller");
const validate = require("../../middlewares/validate");
const { authenticate, authorize } = require("../../middlewares/auth.middleware");

const router = express.Router();

// ============================================
// CONFIGURATION MULTER (upload CSV)
// ============================================

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "../../../uploads"));
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    cb(null, `registre-${timestamp}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 Mo max
  fileFilter: (req, file, cb) => {
    if (
      file.mimetype === "text/csv" ||
      file.mimetype === "application/vnd.ms-excel" ||
      file.originalname.endsWith(".csv")
    ) {
      cb(null, true);
    } else {
      cb(new Error("Seuls les fichiers CSV sont autorisés"), false);
    }
  },
});

// ============================================
// RÈGLES DE VALIDATION
// ============================================

const inviterRules = [
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
  body("groupe_sanguin")
    .optional()
    .isIn(["A", "B", "AB", "O"]),
  body("rhesus")
    .optional()
    .isIn(["POSITIF", "NEGATIF"]),
];

const idRules = [
  param("id").isInt({ min: 1 }).withMessage("ID invitation invalide"),
];

const listerRules = [
  query("statut")
    .optional()
    .isIn(["EN_ATTENTE", "ACCEPTEE", "REFUSEE", "EXPIREE"]),
  query("source")
    .optional()
    .isIn(["MANUEL", "CSV", "OCR"]),
  query("page").optional().isInt({ min: 1 }),
  query("limite").optional().isInt({ min: 1, max: 100 }),
];

const accepterRules = [
  body("code")
    .isString().trim().matches(/^AID-[A-Z0-9]{6}$/)
    .withMessage("Code d'invitation invalide"),
  body("motDePasse")
    .isString().isLength({ min: 8, max: 100 })
    .withMessage("Le mot de passe doit contenir entre 8 et 100 caractères"),
];

// ============================================
// ROUTES
// ============================================

// --- Acceptation publique (par le donneur) ---
router.post("/accepter-invitation", accepterRules, validate, controller.accepterInvitation);

// --- Routes protégées ---
router.use(authenticate);

// Invitation unitaire
router.post(
  "/inviter",
  authorize("PERSONNEL_BANQUE", "ADMINISTRATEUR"),
  inviterRules,
  validate,
  controller.inviterDonneur
);

// Import CSV
router.post(
  "/importer",
  authorize("PERSONNEL_BANQUE", "ADMINISTRATEUR"),
  upload.single("fichier"),
  controller.importerCsv
);

// Liste et suivi
router.get(
  "/invitations",
  authorize("PERSONNEL_BANQUE", "ADMINISTRATEUR"),
  listerRules,
  validate,
  controller.listerInvitations
);

router.get(
  "/invitations/stats",
  authorize("PERSONNEL_BANQUE", "ADMINISTRATEUR"),
  controller.statsInvitations
);

router.get(
  "/invitations/:id",
  authorize("PERSONNEL_BANQUE", "ADMINISTRATEUR"),
  idRules,
  validate,
  controller.consulterInvitation
);

router.delete(
  "/invitations/:id",
  authorize("PERSONNEL_BANQUE", "ADMINISTRATEUR"),
  idRules,
  validate,
  controller.annulerInvitation
);

module.exports = router;