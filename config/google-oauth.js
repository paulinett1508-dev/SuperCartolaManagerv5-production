/**
 * Configuração Google OAuth para Admin
 * Super Cartola Manager
 *
 * Substitui o Replit Auth como provider de autenticação admin.
 * Mantém a mesma shape de sessão (req.session.admin) para compatibilidade
 * total com middleware/auth.js e todas as rotas existentes.
 */
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { getDB } from "./database.js";
import { isAdminAutorizado, isSuperAdmin as checkSuperAdmin, SUPER_ADMIN_EMAILS } from "./admin-config.js";
import { getBaseURL } from "./base-url.js";

/**
 * Configura o Passport com Google OAuth
 * Verify callback busca admin no MongoDB e monta sessão compatível
 */
function configurarGoogleOAuth() {
  const baseURL = getBaseURL();
  const callbackURL = `${baseURL}/api/oauth/callback`;

  console.log("[GOOGLE-OAUTH] Callback URL:", callbackURL);

  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: callbackURL,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value?.toLowerCase();

          console.log("[GOOGLE-OAUTH] Email autenticado:", email);

          if (!email) {
            return done(null, false, {
              message: "Email nao encontrado no perfil Google",
            });
          }

          // Verificar se e admin autorizado (banco ou env) - usa funcao centralizada
          const db = getDB();
          const autorizado = await isAdminAutorizado(email, db);
          if (!autorizado) {
            console.log("[GOOGLE-OAUTH] Email nao autorizado:", email);
            return done(null, false, {
              message: "Email nao autorizado como administrador",
            });
          }

          console.log("[GOOGLE-OAUTH] Admin autorizado:", email);

          // Verificar se e superAdmin (env ou banco) - usa funcao centralizada
          const isSuperAdminUser = checkSuperAdmin(email);

          // Buscar MongoDB _id do admin para usar no filtro de tenant
          let mongoAdminId = null;
          try {
            const adminDoc = await db.collection("admins").findOne(
              { email: email },
              { projection: { _id: 1 } }
            );
            if (adminDoc?._id) {
              mongoAdminId = adminDoc._id.toString();
            }
          } catch (dbErr) {
            console.warn("[GOOGLE-OAUTH] Erro ao buscar MongoDB admin_id:", dbErr.message);
          }

          // Shape IDENTICA ao que replit-auth.js montava
          // Isso garante compatibilidade com middleware/auth.js e todas as rotas
          const user = {
            id: profile.id,
            _id: mongoAdminId,          // MongoDB _id para filtro de tenant
            email: email,
            nome: profile.displayName || email?.split("@")[0] || "Admin",
            foto: profile.photos?.[0]?.value,
            provider: "google",
            expires_at: Math.floor(Date.now() / 1000) + (14 * 24 * 60 * 60), // 14 dias
            superAdmin: isSuperAdminUser,
          };

          return done(null, user);
        } catch (error) {
          console.error("[GOOGLE-OAUTH] Erro na verificacao:", error.message);
          done(error);
        }
      },
    ),
  );

  passport.serializeUser((user, done) => {
    done(null, user);
  });

  passport.deserializeUser((user, done) => {
    done(null, user);
  });

  console.log("[GOOGLE-OAUTH] Passport configurado com Google Strategy");
}

/**
 * Registra as rotas de autenticação Google OAuth
 * Mesmos paths que replit-auth.js usava para zero mudança no frontend
 */
export function setupGoogleAuthRoutes(app) {
  app.set("trust proxy", 1);

  // Configurar Passport com Google Strategy
  if (verificarConfigOAuth()) {
    configurarGoogleOAuth();
  } else {
    console.warn("[GOOGLE-OAUTH] Credenciais nao configuradas - auth desabilitado");
  }

  // Rota de debug para verificar configuracao
  app.get("/api/admin/auth/debug", (req, res) => {
    res.json({
      ok: true,
      provider: "google-oauth",
      hostname: req.hostname,
      protocol: req.protocol,
      google_client_id: process.env.GOOGLE_CLIENT_ID ? "SET" : "NOT_SET",
      google_client_secret: process.env.GOOGLE_CLIENT_SECRET ? "SET" : "NOT_SET",
      base_url: getBaseURL(),
      callback_url: `${getBaseURL()}/api/oauth/callback`,
      admin_emails_env: SUPER_ADMIN_EMAILS.length > 0 ? SUPER_ADMIN_EMAILS : "EMPTY",
      node_env: process.env.NODE_ENV || "not_set",
      session_admin: req.session?.admin ? {
        email: req.session.admin.email,
        superAdmin: req.session.admin.superAdmin,
        provider: req.session.admin.provider,
      } : null,
    });
  });

  // Login - inicia fluxo Google OAuth
  app.get("/api/admin/auth/login", (req, res, next) => {
    console.log("[GOOGLE-OAUTH] Iniciando login...");

    if (!verificarConfigOAuth()) {
      return res.redirect("/?error=oauth_not_configured");
    }

    // Armazena redirect na sessao para usar no callback
    if (req.query.redirect) {
      req.session.redirectAfterLogin = req.query.redirect;

      // Salvar sessao explicitamente antes de redirecionar
      req.session.save((err) => {
        if (err) {
          console.error("[GOOGLE-OAUTH] Erro ao salvar redirect na sessao:", err);
        }
        passport.authenticate("google", {
          scope: ["profile", "email"],
          prompt: "select_account",
        })(req, res, next);
      });
    } else {
      passport.authenticate("google", {
        scope: ["profile", "email"],
        prompt: "select_account",
      })(req, res, next);
    }
  });

  // Callback - Google retorna aqui apos autenticacao
  app.get("/api/oauth/callback", (req, res, next) => {
    console.log("[GOOGLE-OAUTH] Callback recebido");

    passport.authenticate("google", {
      failureRedirect: "/?error=unauthorized",
      failureMessage: true,
    })(req, res, (err) => {
      if (err) {
        console.error("[GOOGLE-OAUTH] Erro no callback:", err.message || err);
        return res.redirect("/?error=auth_failed");
      }

      if (!req.user) {
        console.log("[GOOGLE-OAUTH] Usuario nao autorizado");
        return res.redirect("/?error=unauthorized");
      }

      // Setar sessao admin (mesma shape que replit-auth usava)
      req.session.admin = req.user;

      // Pega o redirect da sessao (se existir) e limpa
      let redirectTo = req.session.redirectAfterLogin;
      if (!redirectTo) {
        redirectTo = "/painel.html";
      }
      delete req.session.redirectAfterLogin;

      req.session.save((saveErr) => {
        if (saveErr) {
          console.error("[GOOGLE-OAUTH] Erro ao salvar sessao:", saveErr);
          return res.redirect("/?error=session");
        }
        console.log("[GOOGLE-OAUTH] Admin autenticado:", req.user.email);
        res.redirect(redirectTo);
      });
    });
  });

  // Logout - destroi sessao e redireciona para home
  app.get("/api/admin/auth/logout", (req, res) => {
    const email = req.session?.admin?.email || "desconhecido";

    req.logout(() => {
      req.session.destroy((err) => {
        if (err) {
          console.error("[GOOGLE-OAUTH] Erro ao destruir sessao:", err);
        }

        res.clearCookie("connect.sid");
        console.log("[GOOGLE-OAUTH] Admin deslogado:", email);
        res.redirect("/");
      });
    });
  });

  console.log("[GOOGLE-OAUTH] Google OAuth configurado com sucesso");
}

/**
 * Middleware de autenticacao (verifica sessao admin)
 * Compativel com a shape de sessao do Google OAuth
 */
export async function isAuthenticated(req, res, next) {
  const user = req.session?.admin;

  if (!user || !user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  // Sessao expirada - Google OAuth nao tem refresh token no fluxo padrao
  // Redirecionar para re-login
  return res.status(401).json({ message: "Unauthorized" });
}

/**
 * Verifica se as credenciais OAuth estão configuradas
 */
function verificarConfigOAuth() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return false;
  }

  return true;
}

export default passport;
export { configurarGoogleOAuth, verificarConfigOAuth, getBaseURL }; // getBaseURL re-exported from base-url.js
