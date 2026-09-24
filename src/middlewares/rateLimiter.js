const rateLimit = require("express-rate-limit");

// ============================================
// CONFIGURATION
// ============================================

const ENV = process.env.NODE_ENV || "development";
const EST_DEV = ENV !== "production";

// Limites configurables par .env (avec valeurs par défaut)
const LOGIN_WINDOW_MS = Number(process.env.LOGIN_WINDOW_MS) || 15 * 60 * 1000; // 15 min
const LOGIN_MAX       = Number(process.env.LOGIN_MAX)       || 10;              // 10 tentatives

const API_WINDOW_MS   = Number(process.env.API_WINDOW_MS)   || 15 * 60 * 1000; // 15 min
const API_MAX         = Number(process.env.API_MAX)         || 3000;            // 3000 requêtes (au lieu de 300)

// ============================================
// LOGIN — Anti brute-force (STRICT, jamais désactivé)
// ============================================

const loginLimiter = rateLimit({
  windowMs: LOGIN_WINDOW_MS,
  max: LOGIN_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Trop de tentatives, réessayez dans quelques minutes",
    code: "TOO_MANY_ATTEMPTS",
  },
  // Anti brute-force : limite par IP + email (empêche les attaques ciblées)
  keyGenerator: (req) => {
    const email = req.body?.identifiant || req.body?.email || "anon";
    return `${req.ip}-${email}`;
  },
});

// ============================================
// API GÉNÉRALE — Haute capacité
// ============================================

const apiLimiter = rateLimit({
  windowMs: API_WINDOW_MS,
  max: API_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Trop de requêtes, réessayez plus tard",
    code: "TOO_MANY_REQUESTS",
  },

  // ⚠️ En développement, on ne limite pas (React StrictMode double les appels)
  skip: () => EST_DEV,

  // Limite par utilisateur connecté (plus juste que par IP derrière un proxy/NAT)
  // Fallback sur l'IP si non authentifié
  keyGenerator: (req) => {
    if (req.user?.id) return `user-${req.user.id}`;
    return `ip-${req.ip}`;
  },
});

// ============================================
// EXPORTS
// ============================================

module.exports = { loginLimiter, apiLimiter };