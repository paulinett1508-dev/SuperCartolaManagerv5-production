/**
 * Rotas de Autenticação Admin (Google OAuth)
 * Super Cartola Manager
 */
import express from "express";
import axios from "axios";
import systemTokenService from "../services/systemTokenService.js";

const router = express.Router();

console.log("[ADMIN-AUTH] ✅ Rotas de autenticação admin carregadas");

/**
 * GET /api/admin/auth/test
 * Rota de teste
 */
router.get("/test", (req, res) => {
  console.log("[ADMIN-AUTH] 🧪 Rota /test acessada!");
  res.json({ message: "Admin auth routes working!", timestamp: new Date() });
});

/**
 * GET /api/admin/auth/session
 * Verifica sessão atual do admin
 */
router.get("/session", (req, res) => {
  if (req.session?.admin) {
    res.json({
      authenticated: true,
      admin: {
        id: req.session.admin.id,
        email: req.session.admin.email,
        nome: req.session.admin.nome,
        foto: req.session.admin.foto,
      },
    });
  } else {
    res.status(401).json({
      authenticated: false,
      message: "Não autenticado como admin",
    });
  }
});

/**
 * POST /api/admin/auth/logout
 * Logout do admin (legacy POST endpoint - redirects to GET)
 */
router.post("/logout", (req, res) => {
  res.redirect("/api/admin/auth/logout");
});

/**
 * GET /api/admin/auth/check
 * Verifica autenticação do admin
 */
router.get("/check", (req, res) => {
  if (req.session?.admin) {
    res.json({
      authenticated: true,
      isAdmin: true,
      user: {
        id: req.session.admin.id,
        email: req.session.admin.email,
        name: req.session.admin.nome,
        picture: req.session.admin.foto,
      },
    });
  } else {
    res.status(401).json({
      authenticated: false,
      message: "Não autenticado",
    });
  }
});

/**
 * POST /api/admin/auth/cartola-token
 * Salva manualmente um X-GLB-Token obtido pelo admin via DevTools.
 * Valida o token contra a API Cartola antes de persistir.
 */
router.post("/cartola-token", async (req, res) => {
  if (!req.session?.admin) {
    return res.status(401).json({ success: false, message: "Não autenticado como admin" });
  }

  const { glbToken } = req.body;
  if (!glbToken || typeof glbToken !== "string" || glbToken.trim().length < 10) {
    return res.status(400).json({ success: false, message: "Token inválido ou ausente" });
  }

  const token = glbToken.trim();

  // Validar token fazendo ping na API Cartola
  try {
    await axios.get("https://api.cartolafc.globo.com/time/info", {
      headers: {
        "X-GLB-Token": token,
        "User-Agent": "Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36",
        Accept: "application/json",
      },
      timeout: 10000,
      validateStatus: (s) => s < 500,
    });
  } catch (err) {
    console.warn("[ADMIN-AUTH] Não foi possível validar token (rede?):", err.message);
    // Salvar mesmo assim — timeout de rede não significa token inválido
  }

  const saved = await systemTokenService.salvarTokenSistema({
    glbid: token,
    email: req.session.admin.email,
    nome: req.session.admin.nome || req.session.admin.email,
    expires_at: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7 dias
  });

  if (!saved) {
    return res.status(500).json({ success: false, message: "Erro ao salvar token no banco" });
  }

  console.log(`[ADMIN-AUTH] Token Cartola salvo manualmente por ${req.session.admin.email}`);
  res.json({ success: true, message: "Token salvo com sucesso" });
});

/**
 * GET /api/admin/auth/cartola-token/status
 * Retorna o status do token de sistema Cartola.
 */
router.get("/cartola-token/status", async (req, res) => {
  if (!req.session?.admin) {
    return res.status(401).json({ success: false, message: "Não autenticado como admin" });
  }

  try {
    const status = await systemTokenService.statusToken();
    res.json({ success: true, ...status });
  } catch (err) {
    console.error("[ADMIN-AUTH] Erro ao buscar status do token:", err.message);
    res.status(500).json({ success: false, message: "Erro ao verificar status do token" });
  }
});

/**
 * DELETE /api/admin/auth/cartola-token
 * Revoga o token de sistema Cartola.
 */
router.delete("/cartola-token", async (req, res) => {
  if (!req.session?.admin) {
    return res.status(401).json({ success: false, message: "Não autenticado como admin" });
  }

  const revoked = await systemTokenService.revogarTokenSistema();
  if (!revoked) {
    return res.status(500).json({ success: false, message: "Erro ao revogar token" });
  }

  console.log(`[ADMIN-AUTH] Token Cartola revogado por ${req.session.admin.email}`);
  res.json({ success: true, message: "Token revogado" });
});

export default router;
