import cron from "node-cron";
import compression from "compression";
// Executar scraper de jogos Globo Esporte diariamente às 6h (horário do servidor)
import { exec } from "child_process";

// ====================================================================
// 🔄 RECURSOS GLOBAIS PARA GRACEFUL SHUTDOWN
// ====================================================================
let httpServer = null;
const cronJobs = [];
let consolidacaoIntervalId = null;
let rateLimitCleanupIntervalId = null;

const cronGloboScraper = cron.schedule("0 6 * * *", () => {
  console.log("[CRON] Executando atualização de jogos do Globo Esporte...");
  exec("node scripts/save-jogos-globo.js", (err, stdout, stderr) => {
    if (err) {
      console.error("[CRON] Erro ao rodar save-jogos-globo.js:", err.message);
      return;
    }
    if (stdout) console.log("[CRON] save-jogos-globo.js:", stdout.trim());
    if (stderr) console.error("[CRON] save-jogos-globo.js (stderr):", stderr.trim());
  });
});
cronJobs.push(cronGloboScraper);
// Também executa na inicialização para garantir cache atualizado
exec("node scripts/save-jogos-globo.js", (err, stdout, stderr) => {
  if (err) {
    console.error("[INIT] Erro ao rodar save-jogos-globo.js:", err.message);
    return;
  }
  if (stdout) console.log("[INIT] save-jogos-globo.js:", stdout.trim());
  if (stderr) console.error("[INIT] save-jogos-globo.js (stderr):", stderr.trim());
});
// index.js - Super Cartola Manager OTIMIZADO (Sessões Persistentes + Auth Admin + Segurança)
// v2.0: Hardening de Produção - Logs e Erros por ambiente
import mongoose from "mongoose";
import { readFileSync } from "fs";
import express from "express";
import session from "express-session";
import MongoStore from "connect-mongo";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";

// Carregar .env ANTES de tudo
dotenv.config();

// =========================================================================
// 🔇 SILENCIAMENTO DE LOGS EM PRODUÇÃO
// =========================================================================
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const IS_DEVELOPMENT = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;

// Guardar console original
const originalConsole = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    info: console.info.bind(console),
};

// Em produção: silenciar logs normais (manter apenas erros críticos)
if (IS_PRODUCTION) {
    console.log = () => {};
    console.info = () => {};
    // Manter warn e error para monitoramento
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
}

// ⚡ USAR CONEXÃO OTIMIZADA
import connectDB from "./config/database.js";

// 🔐 REPLIT AUTH
import passport, { setupReplitAuthRoutes } from "./config/replit-auth.js";

// 🛡️ SEGURANÇA
import { setupSecurity, authRateLimiter, getRateLimitCleanupIntervalId } from "./middleware/security.js";

// 📦 VERSIONAMENTO AUTO
import { APP_VERSION } from "./config/appVersion.js";

// 📊 MODELS PARA SYNC DE ÍNDICES
import ExtratoFinanceiroCache from "./models/ExtratoFinanceiroCache.js";
import Rodada from "./models/Rodada.js";
import UserActivity from "./models/UserActivity.js";
import AccessLog from "./models/AccessLog.js";
import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Importar package.json para versão
const pkg = JSON.parse(readFileSync("./package.json", "utf8"));

// Importar rotas do sistema
import jogosHojeRoutes from "./routes/jogos-hoje-routes.js";
import jogosHojeGloboRoutes from "./routes/jogos-hoje-globo.js"; // NOVA ROTA
import jogosAoVivoRoutes from "./routes/jogos-ao-vivo-routes.js"; // API-Football
import apiOrchestrator from "./services/api-orchestrator.js"; // Orquestrador multi-API
import ligaRoutes from "./routes/ligas.js";
import cartolaRoutes from "./routes/cartola.js";
import cartolaProxyRoutes from "./routes/cartola-proxy.js";
import timesRoutes from "./routes/times.js";
import timesAdminRoutes from "./routes/times-admin.js";
import analisarParticipantesRoutes from "./routes/analisar-participantes.js";
import rodadasRoutes from "./routes/rodadas-routes.js";
import rodadaXrayRoutes from "./routes/rodada-xray-routes.js";
import rodadaContextoRoutes from "./routes/rodada-contexto-routes.js";
import rodadasCacheRoutes from "./routes/rodadasCacheRoutes.js";
import rodadasCorrecaoRoutes from "./routes/rodadasCorrecaoRoutes.js";
import calendarioRodadasRoutes from "./routes/calendario-rodadas-routes.js";
import golsRoutes from "./routes/gols.js";
import artilheiroCampeaoRoutes from "./routes/artilheiro-campeao-routes.js";
import luvaDeOuroRoutes from "./routes/luva-de-ouro-routes.js";
import restaUmRoutes from "./routes/resta-um-routes.js";
import tiroCertoRoutes from "./routes/tiro-certo-routes.js";
import configuracaoRoutes from "./routes/configuracao-routes.js";
import fluxoFinanceiroRoutes from "./routes/fluxoFinanceiroRoutes.js";
import extratoFinanceiroCacheRoutes from "./routes/extratoFinanceiroCacheRoutes.js";
import participanteAuthRoutes from "./routes/participante-auth.js";
import participanteHistoricoRoutes from "./routes/participante-historico-routes.js";
import pontosCorridosCacheRoutes from "./routes/pontosCorridosCacheRoutes.js";
import pontosCorridosMigracaoRoutes from "./routes/pontosCorridosMigracaoRoutes.js";
import top10CacheRoutes from "./routes/top10CacheRoutes.js";
import mataMataCacheRoutes from "./routes/mataMataCacheRoutes.js";
import rankingGeralCacheRoutes from "./routes/ranking-geral-cache-routes.js";
import rankingTurnoRoutes from "./routes/ranking-turno-routes.js";
import consolidacaoRoutes from "./routes/consolidacao-routes.js";
import renovacoesRoutes from "./routes/renovacoes-routes.js";
import acertosFinanceirosRoutes from "./routes/acertos-financeiros-routes.js";
import tesourariaRoutes from "./routes/tesouraria-routes.js";
import ajustesRoutes from "./routes/ajustes-routes.js";

// ✅ FEAT-026 & FEAT-027: Matchday + Capitão de Luxo
import matchdayRoutes from "./routes/matchday-routes.js";
import capitaoRoutes from "./routes/capitao-routes.js";

// 🔄 Renovação de Temporada
import ligaRulesRoutes from "./routes/liga-rules-routes.js";
import inscricoesRoutes from "./routes/inscricoes-routes.js";
import quitacaoRoutes from "./routes/quitacao-routes.js";

// 🧩 Configuração de Módulos por Liga
import moduleConfigRoutes from "./routes/module-config-routes.js";
import rulesRoutes from "./routes/rules-routes.js";
import regrasModulosRoutes from "./routes/regras-modulos-routes.js";

// 📦 DATA LAKE dos Participantes
import dataLakeRoutes from "./routes/data-lake-routes.js";

// ⚡ Cartola PRO (Escalação Automática)
import cartolaProRoutes from "./routes/cartola-pro-routes.js";

// 🔔 Push Notifications
import notificationsRoutes from "./routes/notifications-routes.js";
import { cleanExpiredSubscriptions } from "./controllers/notificationsController.js";
import { cronEscalacaoPendente } from "./services/notificationTriggers.js";
import { verificarENotificarEscalacao, limparCacheNotificacoes } from "./services/smartEscalacaoNotifier.js";

// 🎯 Dicas Premium
import dicasPremiumRoutes from "./routes/dicas-premium-routes.js";

// 🤖 Assistente Inteligente de Escalação (Multi-Fonte)
import assistenteEscalacaoRoutes from "./routes/assistente-escalacao-routes.js";

// 📰 Notícias personalizadas do time do coração
import noticiasTimeRoutes from "./routes/noticias-time-routes.js";

// 🏆 Copa do Mundo 2026 - Notícias e dados
import copa2026NoticiasRoutes from "./routes/copa-2026-noticias-routes.js";

// 📊 Tabelas Esportivas (Brasileirão, jogos do time, etc)
import tabelasEsportesRoutes from "./routes/tabelas-esportes-routes.js";

// 🔧 Modo Manutenção do App
import manutencaoRoutes from "./routes/manutencao-routes.js";
import manutencaoParticipanteRoutes from "./routes/manutencao-participante-routes.js";

// 📢 Avisos In-App (Notificador)
import avisosAdminRoutes from "./routes/avisos-admin-routes.js";
import avisosParticipanteRoutes from "./routes/avisos-participante-routes.js";

// 📊 Raio-X Analytics (análises internas via MongoDB)
import raioXAnalyticsRoutes from "./routes/raioXAnalyticsRoutes.js";

// 📦 Versionamento do App
import appVersionRoutes from "./routes/appVersionRoutes.js";

// 👁️ Monitoramento de usuários online
import usuariosOnlineRoutes from "./routes/usuarios-online-routes.js";
import activityTrackerMiddleware from "./middleware/activityTracker.js";

// 🔐 Rotas de autenticação admin
import adminAuthRoutes from "./routes/admin-auth.js";
import adminAuditoriaRoutes from "./routes/admin-auditoria-routes.js";
import adminGestaoRoutes from "./routes/admin-gestao-routes.js";
import systemHealthRoutes from "./routes/system-health-routes.js";
import adminClienteAuthRoutes from "./routes/admin-cliente-auth.js";
import adminMobileRoutes from "./routes/admin-mobile-routes.js";
import * as analyticsController from "./controllers/analyticsController.js";
import adminMigracaoRoutes from "./routes/admin/migracao.js";
import adminMigracaoValidacaoRoutes from "./routes/admin/migracao-validacao.js";
console.log("[DEBUG] adminAuthRoutes type:", typeof adminAuthRoutes);
console.log(
  "[DEBUG] adminAuthRoutes.stack length:",
  adminAuthRoutes.stack?.length,
);

import { getClubes } from "./controllers/cartolaController.js";
import {
  verificarStatusParticipante,
  alternarStatusParticipante,
} from "./controllers/participanteStatusController.js";
import { iniciarSchedulerConsolidacao } from "./utils/consolidacaoScheduler.js";

// 🎯 Round-Market Orchestrator
import orchestratorRoutes from "./routes/orchestrator-routes.js";
import orchestrator from "./services/orchestrator/roundMarketOrchestrator.js";

// Middleware de proteção
import { protegerRotas, injetarSessaoDevAdmin } from "./middleware/auth.js";

// dotenv já foi carregado no início do arquivo

const app = express();
const PORT = process.env.PORT || 3000;

// Conectar ao Banco de Dados (Otimizado)
await connectDB();

// Inicializar orquestrador multi-API (API-Football + SoccerDataAPI)
import { getDB } from "./config/database.js";
try {
  await apiOrchestrator.init(getDB());
} catch (err) {
  console.warn('[INDEX] Orquestrador init falhou (não-crítico):', err.message);
}

// ====================================================================
// 🛡️ MIDDLEWARES DE SEGURANÇA (PRIMEIRO!)
// ====================================================================
setupSecurity(app);

// Trust proxy (necessário para rate limiting correto no Replit)
app.set("trust proxy", 1);

// ====================================================================
// 📦 COMPRESSION - Reduz ~70% do tamanho de JS/CSS na transferência
// ====================================================================
app.use(compression({
    filter: (req, res) => {
        // Não comprimir se o cliente não suportar
        if (req.headers['x-no-compression']) return false;
        // Comprimir por padrão
        return compression.filter(req, res);
    },
    level: 6, // Balanceado entre compressão e CPU (1-9)
    threshold: 1024 // Só comprimir arquivos > 1KB
}));

// Middleware para Parsing do Body (JSON e URL-encoded)
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Configuração CORS - Restrito a origens autorizadas
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map(o => o.trim())
  : [];

app.use(cors({
  origin: function (origin, callback) {
    // Permitir requests sem origin (mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    // Em desenvolvimento, permitir qualquer origem
    if (IS_DEVELOPMENT) return callback(null, true);
    // Permitir origens do mesmo domínio Replit (*.replit.dev)
    if (origin.endsWith('.replit.dev') || origin.endsWith('.repl.co') || origin.endsWith('.replit.app') || origin.endsWith('supercartolamanager.com.br')) {
      return callback(null, true);
    }
    // Verificar whitelist
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error('Origem não permitida pelo CORS'));
  },
  credentials: true
}));

// ====================================================================
// DESABILITAR CACHE PARA HTML (evita problema de CDN/proxy)
// ====================================================================
app.use((req, res, next) => {
  if (req.path.endsWith(".html") || req.path === "/") {
    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate",
    );
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");
  }
  next();
});

// ====================================================================
// 📦 CACHE BUSTING - Injetar versão em CSS/JS (evita White Screen of Death)
// ====================================================================
app.get(["/participante/", "/participante/index.html"], async (req, res, next) => {
  try {
    const htmlPath = path.join(__dirname, "public", "participante", "index.html");
    let html = await readFile(htmlPath, "utf8");

    const version = APP_VERSION.version;

    // Injetar versão em arquivos CSS locais (não CDNs)
    html = html.replace(
      /<link\s+rel=["']stylesheet["']\s+href=["']([^"']+\.css)["']/gi,
      (match, href) => {
        // Ignorar CDNs (começam com http:// ou https:// ou //)
        if (href.startsWith("http") || href.startsWith("//")) {
          return match;
        }
        // Adicionar versão
        const separator = href.includes("?") ? "&" : "?";
        return `<link rel="stylesheet" href="${href}${separator}v=${version}"`;
      }
    );

    // Injetar versão em arquivos JS locais (não CDNs)
    html = html.replace(
      /<script\s+(?:type=["']module["']\s+)?src=["']([^"']+\.js)["']/gi,
      (match, src) => {
        // Ignorar CDNs
        if (src.startsWith("http") || src.startsWith("//")) {
          return match;
        }
        // Preservar type="module" se existir
        const hasModule = match.includes('type="module"') || match.includes("type='module'");
        const separator = src.includes("?") ? "&" : "?";
        const typeAttr = hasModule ? 'type="module" ' : "";
        return `<script ${typeAttr}src="${src}${separator}v=${version}"`;
      }
    );

    // Headers anti-cache
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Content-Type", "text/html; charset=utf-8");

    res.send(html);
  } catch (error) {
    // EIO transiente pós-deploy: retry uma vez após 500ms
    if (error.code === 'EIO') {
      try {
        await new Promise(r => setTimeout(r, 500));
        const htmlPath = path.join(__dirname, "public", "participante", "index.html");
        const html = await readFile(htmlPath, "utf8");
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.send(html);
      } catch (_) {
        return res.status(503).send(getRestartingHtml());
      }
    }
    // Fallback: servir arquivo original
    next();
  }
});

// ====================================================================
// DEBUG - CAPTURAR TODAS AS REQUISIÇÕES (apenas em desenvolvimento)
// ====================================================================
if (IS_DEVELOPMENT) {
  app.use((req, res, next) => {
    console.log(`[REQUEST] ${req.method} ${req.path}`);
    next();
  });
}

// ====================================================================
// ⚡ SERVIR ASSETS ESTÁTICOS SEM SESSION (antes de MongoStore)
// JS, CSS, imagens e fontes não precisam de session/MongoDB
// HTML e diretórios seguem para o chain completo (session → protegerRotas)
// ====================================================================
// ✅ FIX MOBILE: Cache-Control para assets estáticos
// Sem isso, browsers mobile refaziam requests para TODOS os assets em cada reload.
// max-age=1h com must-revalidate: browser usa cache mas valida com servidor (304 Not Modified)
// O cache-busting via ?v=versao no HTML garante que versões novas são baixadas.
const servePublicAssets = express.static("public", {
  maxAge: '1h',
  setHeaders: (res, filePath) => {
    // Fontes e imagens: cache mais longo (7 dias) - raramente mudam
    if (/\.(woff|woff2|ttf|eot|png|jpg|jpeg|gif|svg|ico|webp)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    }
    // JS e CSS: cache curto (1h) - mudam em deploys, cache-busted via ?v=
    else if (/\.(js|mjs|css)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
    }
  }
});
app.use((req, res, next) => {
  if (/\.(js|mjs|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|map|webp|webmanifest|json)$/i.test(req.path)) {
    return servePublicAssets(req, res, next);
  }
  next();
});

// Configuração de Sessão com MongoDB Store (Persistência Real)
app.use(
  session({
    secret: (() => {
      const secret = process.env.SESSION_SECRET;
      if (!secret && IS_PRODUCTION) {
        console.error("[SERVER] ❌ SESSION_SECRET não definido em produção! Defina a variável de ambiente.");
        process.exit(1);
      }
      return secret || "dev_only_secret_" + Date.now();
    })(),
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      clientPromise: mongoose.connection
        .asPromise()
        .then((conn) => conn.client),
      collectionName: "sessions",
      ttl: 14 * 24 * 60 * 60, // 14 dias
      autoRemove: "native",
    }),
    cookie: {
      maxAge: 14 * 24 * 60 * 60 * 1000, // 14 dias
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    },
    proxy: process.env.NODE_ENV === "production",
  }),
);

// 🔐 Inicializar Passport (Replit Auth)
app.use(passport.initialize());
app.use(passport.session());

// Setup Replit Auth routes (synchronous registration with lazy OIDC discovery)
setupReplitAuthRoutes(app);
console.log("[SERVER] 🔐 Replit Auth ativado");

// 🔐 Rotas de autenticação admin (Replit Auth) - ANTES do protegerRotas
app.use("/api/admin/auth", adminAuthRoutes);
console.log("[DEBUG] Rota /api/admin/auth registrada");

// 📊 Rotas de auditoria admin
app.use("/api/admin/auditoria", adminAuditoriaRoutes);
console.log("[SERVER] 📊 Rotas de auditoria admin registradas");

// 👤 Rotas de gestao de admins
app.use("/api/admin/gestao", adminGestaoRoutes);
console.log("[SERVER] 👤 Rotas de gestao de admins registradas");

// 🔑 Rotas de autenticacao de clientes (email + senha)
app.use("/api/admin/cliente", adminClienteAuthRoutes);
console.log("[SERVER] 🔑 Rotas de autenticacao de clientes registradas");

// 👁️ Rota de monitoramento de usuários online (admin)
app.use("/api/admin/usuarios-online", usuariosOnlineRoutes);
console.log("[SERVER] 👁️ Rota de usuários online registrada");

// 🏥 Dashboard de Saúde do Sistema (admin)
app.use("/api/admin/system-health", systemHealthRoutes);
console.log("[SERVER] 🏥 Rota de dashboard de saúde registrada");

// 🔧 Migração e Correção de Dados (admin)
app.use("/api/admin/migracao", adminMigracaoRoutes);
console.log("[SERVER] 🔧 Rota de migração registrada");

app.use("/api/admin/migracao-validacao", adminMigracaoValidacaoRoutes);
console.log("[SERVER] ✅ Rota de validação de migração registrada");

// 📱 Admin Mobile - App PWA para administradores
app.use("/api/admin/mobile", adminMobileRoutes);
console.log("[SERVER] 📱 Rotas de Admin Mobile registradas");

// 🔧 Modo Manutenção do App
app.use("/api/admin", manutencaoRoutes);
console.log("[SERVER] 🔧 Rotas de modo manutenção registradas");

// 🔐 Rotas de autenticação participante - ANTES do protegerRotas
// Aplicar rate limiting específico para login (tradicional e Globo)
app.use("/api/participante/auth/login", authRateLimiter);
app.use("/api/participante/auth/globo/direct", authRateLimiter);
app.use("/api/participante/auth", participanteAuthRoutes);
app.use("/api/participante/manutencao", manutencaoParticipanteRoutes);
app.use("/api/participante/historico", participanteHistoricoRoutes);

// ====================================================================
// 📦 ROTAS DE VERSÃO DO APP (antes do protegerRotas)
// ====================================================================
app.use("/api/app", appVersionRoutes);
console.log("[SERVER] 📦 Rotas de versionamento registradas em /api/app");

// 🛡️ MIDDLEWARE DE PROTEÇÃO DE ROTAS (antes de servir estáticos)
// ✅ Bypass de desenvolvimento: injeta sessão admin automaticamente em NODE_ENV=development
app.use(injetarSessaoDevAdmin);
app.use(protegerRotas);

// 👁️ MIDDLEWARE DE RASTREAMENTO DE ATIVIDADE (participantes)
app.use(activityTrackerMiddleware);

// Servir arquivos estáticos (Frontend)
app.use(express.static("public"));

// Rotas da API
app.use("/api/jogos-hoje", jogosHojeRoutes);

// ✅ FEAT-026: Modo Matchday
app.use('/api/matchday', matchdayRoutes);

// ✅ FEAT-027: Capitão de Luxo
app.use('/api/capitao', capitaoRoutes);

app.use("/api/jogos-hoje-globo", jogosHojeGloboRoutes); // NOVA ROTA
app.use("/api/jogos-ao-vivo", jogosAoVivoRoutes); // API-Football
app.use("/api/ligas", ligaRoutes);
app.use("/api/cartola", cartolaRoutes);
app.use("/api/cartola", cartolaProxyRoutes);
app.use("/api/cartola-pro", cartolaProRoutes);
app.use("/api/times", timesRoutes);
app.use("/api/time", timesRoutes);
app.use("/api/rodadas", rodadasRoutes);
app.use("/api/rodada-xray", rodadaXrayRoutes);
app.use("/api/rodada-contexto", rodadaContextoRoutes);
app.use("/api/rodadas-cache", rodadasCacheRoutes);
app.use("/api/rodadas-correcao", rodadasCorrecaoRoutes);
app.use("/api/calendario-rodadas", calendarioRodadasRoutes);
app.use("/api/gols", golsRoutes);
app.use("/api/artilheiro-campeao", artilheiroCampeaoRoutes);
app.use("/api/luva-de-ouro", luvaDeOuroRoutes);
app.use("/api/configuracao", configuracaoRoutes);
app.use("/api/fluxo-financeiro", fluxoFinanceiroRoutes);
console.log(
  "[SERVER] ✅ Rotas de Fluxo Financeiro registradas em /api/fluxo-financeiro",
);
app.use("/api/extrato-cache", extratoFinanceiroCacheRoutes);
app.use("/api/ranking-cache", rankingGeralCacheRoutes);
app.use("/api/ranking-turno", rankingTurnoRoutes);
app.use("/api/consolidacao", consolidacaoRoutes);
app.use("/api/orchestrator", orchestratorRoutes);
app.use("/api/pontos-corridos", pontosCorridosCacheRoutes);
app.use("/api/pontos-corridos", pontosCorridosMigracaoRoutes);
app.use("/api/top10", top10CacheRoutes);
app.use("/api/mata-mata", mataMataCacheRoutes);
app.use("/api/resta-um", restaUmRoutes);
app.use("/api/tiro-certo", tiroCertoRoutes);
app.use("/api/times-admin", timesAdminRoutes);
app.use("/api/analisar-participantes", analisarParticipantesRoutes);
app.use("/api/renovacoes", renovacoesRoutes);
app.use("/api/acertos", acertosFinanceirosRoutes);
app.use("/api/tesouraria", tesourariaRoutes);
app.use("/api/ajustes", ajustesRoutes);

// 🔄 Renovação de Temporada
app.use("/api/liga-rules", ligaRulesRoutes);
app.use("/api/inscricoes", inscricoesRoutes);
app.use("/api/quitacao", quitacaoRoutes);

// 🧩 Configuração de Módulos
app.use("/api", moduleConfigRoutes);
console.log("[SERVER] 🔄 Sistema de Renovação de Temporada registrado");

// 📚 Regras estáticas (JSON)
app.use("/api/rules", rulesRoutes);
console.log("[SERVER] 🧾 Rotas de regras estáticas registradas em /api/rules");

// 📝 Regras de Módulos (editáveis por liga)
app.use("/api/regras-modulos", regrasModulosRoutes);
console.log("[SERVER] 📝 Rotas de regras de módulos registradas em /api/regras-modulos");

// 📦 DATA LAKE dos Participantes
app.use("/api/data-lake", dataLakeRoutes);
// Alias para acesso conveniente: /api/participantes/:id/raw → /api/data-lake/raw/:id
app.use("/api/participantes", dataLakeRoutes);
console.log("[SERVER] 📦 Data Lake dos Participantes registrado em /api/data-lake");

// 🔔 Push Notifications
app.use("/api/notifications", notificationsRoutes);
console.log("[SERVER] 🔔 Rotas de Push Notifications registradas em /api/notifications");

// 📊 Analytics - Branches & Merges (session auth, para SPA desktop)
app.get("/api/admin/analytics/resumo", analyticsController.getAnalyticsResumo);
app.get("/api/admin/analytics/branch/:nomeBranch", analyticsController.getAnatyticsBranchDetalhes);
app.get("/api/admin/analytics/merges", analyticsController.getAnalyticsMerges);
app.get("/api/admin/analytics/pull-requests", analyticsController.getAnalyticsPullRequests);
app.get("/api/admin/analytics/funcionalidades", analyticsController.getAnalyticsFuncionalidades);
app.get("/api/admin/analytics/estatisticas", analyticsController.getAnalyticsEstatisticas);
app.get("/api/admin/analytics/sync-status", analyticsController.getGitSyncStatus);
app.post("/api/admin/analytics/sync-trigger", analyticsController.postGitSyncTrigger);
console.log("[SERVER] 📊 Rotas de Analytics (session) registradas em /api/admin/analytics");

// 📢 Avisos In-App (Notificador)
app.use("/api/admin/avisos", avisosAdminRoutes);
console.log("[SERVER] 📢 Rotas de avisos admin registradas em /api/admin/avisos");
app.use("/api/avisos", avisosParticipanteRoutes);
console.log("[SERVER] 📢 Rotas de avisos participante registradas em /api/avisos");

// 📊 Raio-X Analytics (análises internas)
app.use("/api/admin/raio-x", raioXAnalyticsRoutes);
console.log("[SERVER] 📊 Rotas de Raio-X Analytics registradas em /api/admin/raio-x");

// 🎯 Dicas Premium
app.use("/api/dicas-premium", dicasPremiumRoutes);
console.log("[SERVER] 🎯 Rotas de Dicas Premium registradas em /api/dicas-premium");

// 🤖 Assistente Inteligente de Escalação
app.use("/api/assistente", assistenteEscalacaoRoutes);
console.log("[SERVER] 🤖 Rotas do Assistente de Escalação registradas em /api/assistente");

// 📰 Notícias do Time do Coração
app.use("/api/noticias", noticiasTimeRoutes);
console.log("[SERVER] 📰 Rotas de notícias personalizadas registradas em /api/noticias");

// 🏆 Copa do Mundo 2026
app.use("/api/copa-2026", copa2026NoticiasRoutes);
console.log("[SERVER] 🏆 Rotas da Copa do Mundo 2026 registradas em /api/copa-2026");

// 📊 Tabelas Esportivas
app.use("/api/tabelas", tabelasEsportesRoutes);
console.log("[SERVER] 📊 Rotas de tabelas esportivas registradas em /api/tabelas");

// Rotas Adicionais (Controllers Diretos)
app.get("/api/clubes", getClubes);
app.get(
  "/api/ligas/:ligaId/participantes/:timeId/status",
  verificarStatusParticipante,
);
app.post(
  "/api/ligas/:ligaId/participantes/:timeId/status",
  alternarStatusParticipante,
);

// Endpoint para versão
app.get("/api/version", (req, res) => {
  res.json({ version: pkg.version });
});

// ====================================================================
// FALLBACK - DEVE SER A ÚLTIMA ROTA REGISTRADA
// ====================================================================
// Primeiro: capturar rotas de API não encontradas
app.use("/api/*", (req, res) => {
  console.log(`[404] API endpoint não encontrado: ${req.method} ${req.path}`);
  res.status(404).json({
    error: "API endpoint not found",
    path: req.path,
    method: req.method,
  });
});

// Depois: servir o frontend para qualquer outra rota
// ✅ FIX: Não servir HTML para requests de assets estáticos (evita MIME type errors)
// ✅ FIX EIO: Retry + página amigável para erros de I/O pós-republish
app.get("*", (req, res) => {
  const ext = path.extname(req.path).toLowerCase();
  if (ext && ext !== '.html') {
    return res.status(404).end();
  }
  const htmlPath = path.resolve("public/index.html");
  res.sendFile(htmlPath, (err) => {
    if (!err) return;
    // Retry uma vez após 500ms (EIO é transiente pós-deploy)
    setTimeout(() => {
      res.sendFile(htmlPath, (retryErr) => {
        if (!retryErr) return;
        originalConsole.error(`[CATCH-ALL] sendFile falhou após retry:`, retryErr.code || retryErr.message);
        res.status(503).send(getRestartingHtml());
      });
    }, 500);
  });
});

// ====================================================================
// 🛡️ PÁGINA AMIGÁVEL PARA ERROS DE I/O PÓS-DEPLOY
// ====================================================================
function getRestartingHtml() {
  return `<!DOCTYPE html>
<html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="4">
<title>Atualizando...</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#111827;color:#f3f4f6;font-family:'Inter',-apple-system,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh}
.c{text-align:center;padding:2rem}
h1{font-family:'Russo One',sans-serif;font-size:1.5rem;margin-bottom:.75rem;color:#60a5fa}
p{font-size:.95rem;color:#9ca3af;margin-bottom:1.5rem}
.spinner{width:36px;height:36px;border:3px solid #374151;border-top-color:#60a5fa;border-radius:50%;animation:spin .8s linear infinite;margin:0 auto}
@keyframes spin{to{transform:rotate(360deg)}}
</style></head>
<body><div class="c">
<div class="spinner"></div>
<h1 style="margin-top:1.25rem">Servidor reiniciando</h1>
<p>Uma atualização foi aplicada. A pagina sera recarregada automaticamente.</p>
</div></body></html>`;
}

// ====================================================================
// 🛡️ MIDDLEWARE DE ERRO GLOBAL (HARDENING DE PRODUÇÃO)
// ====================================================================
app.use((err, req, res, next) => {
  // Em produção: Ocultar stack trace e detalhes
  if (IS_PRODUCTION) {
    // Log interno para monitoramento (mantém console.error original)
    originalConsole.error(`[ERROR] ${req.method} ${req.path}:`, err.message);

    // ✅ FIX EIO: Para requisições não-API com erro de I/O, retornar HTML amigável com auto-refresh
    const isApiRequest = req.path.startsWith('/api/');
    const isTransientIO = err.code === 'EIO' || err.code === 'ENOENT' || err.code === 'EMFILE';
    if (!isApiRequest && isTransientIO) {
      return res.status(503).send(getRestartingHtml());
    }

    // Resposta genérica ao cliente (rotas API)
    return res.status(err.status || 500).json({
      msg: "Erro interno",
      code: err.code || "INTERNAL_ERROR"
    });
  }

  // Em desenvolvimento: Mostrar detalhes completos
  console.error(`[ERROR] ${req.method} ${req.path}:`, err);

  res.status(err.status || 500).json({
    msg: err.message,
    code: err.code || "INTERNAL_ERROR",
    stack: err.stack,
    details: err.details || null
  });
});

// Inicialização do Servidor
if (process.env.NODE_ENV !== "test") {
  try {
    httpServer = app.listen(PORT, "0.0.0.0", () => {
      // Capturar intervalId do rate limiting após inicialização
      rateLimitCleanupIntervalId = getRateLimitCleanupIntervalId();
      
      // Log de inicialização sempre visível (usa console original)
      const startupLog = IS_PRODUCTION ? originalConsole.log : console.log;

      startupLog(`🚀 SUPER CARTOLA MANAGER RODANDO NA PORTA ${PORT}`);
      startupLog(`🌍 Ambiente: ${IS_PRODUCTION ? 'PRODUÇÃO' : 'DESENVOLVIMENTO'}`);
      startupLog(`📦 Versão: ${APP_VERSION.version} (build ${APP_VERSION.build})`);

      if (IS_DEVELOPMENT) {
        console.log(`💾 Sessões persistentes: ATIVADAS (MongoDB Store)`);
        console.log(`🔐 Autenticação Admin: Replit Auth`);
        console.log(`🔐 Autenticação Participante: Senha do Time`);
        console.log(`🛡️ Segurança: Headers + Rate Limiting ATIVADOS`);
        console.log(`📝 Logs: VERBOSE (desenvolvimento)`);
      } else {
        startupLog(`🔇 Logs: SILENCIADOS (produção)`);
        startupLog(`🛡️ Erros: Mensagens genéricas (sem stack trace)`);
      }
    });
  } catch (err) {
    originalConsole.error("❌ Erro ao conectar ao MongoDB:", err.message);
    process.exit(1);
  }
}

// ====================================================================
// 🔄 SINCRONIZAÇÃO DE ÍNDICES (Mongoose 8.x syncIndexes)
// Remove índices legados e cria índices definidos no schema
// ====================================================================
// ✅ FIX: connectDB() já fez await, conexão já está aberta neste ponto.
// Usar IIFE em vez de .once("open") que nunca dispara (evento já passou).
(async () => {
  console.log("🔧 Sincronizando índices do banco de dados (Mongoose 8.x)...");
  try {
    // Preview das mudanças antes de aplicar
    const diff = await ExtratoFinanceiroCache.diffIndexes();

    if (diff.toDrop.length > 0 || diff.toCreate.length > 0) {
      console.log("📋 Índices a remover:", diff.toDrop);
      console.log("📋 Índices a criar:", diff.toCreate);

      // Sincroniza: remove extras, cria faltantes
      const dropped = await ExtratoFinanceiroCache.syncIndexes();
      if (dropped.length > 0) {
        console.log("✅ Índices removidos:", dropped);
      }
      console.log("✅ Índices sincronizados com sucesso!");
    } else {
      console.log("✅ Índices já estão sincronizados.");
    }
  } catch (error) {
    if (error.codeName !== "NamespaceNotFound") {
      console.error("⚠️ Erro na sincronização de índices (Extrato):", error.message);
    }
  }

  // ✅ Sincronizar índices de Rodada (fix: índice antigo sem temporada)
  try {
    const rodadaDiff = await Rodada.diffIndexes();
    if (rodadaDiff.toDrop.length > 0 || rodadaDiff.toCreate.length > 0) {
      console.log("📋 [Rodada] Índices a remover:", rodadaDiff.toDrop);
      console.log("📋 [Rodada] Índices a criar:", rodadaDiff.toCreate);
      const droppedRodada = await Rodada.syncIndexes();
      if (droppedRodada.length > 0) {
        console.log("✅ [Rodada] Índices removidos:", droppedRodada);
      }
      console.log("✅ [Rodada] Índices sincronizados (multi-temporada)!");
    }
  } catch (error) {
    if (error.codeName !== "NamespaceNotFound") {
      console.error("⚠️ Erro na sincronização de índices (Rodada):", error.message);
    }
  }

  // ✅ SCHEDULER DE CONSOLIDAÇÃO AUTOMÁTICA
  // Roda em qualquer ambiente (DEV e PROD usam o mesmo banco)
  setTimeout(() => {
    console.log(
      `[SERVER] 🚀 Iniciando scheduler de consolidação (${process.env.NODE_ENV || "development"})...`,
    );
    consolidacaoIntervalId = iniciarSchedulerConsolidacao();
  }, 10000);

  // 🎯 Inicializar Round-Market Orchestrator (15s após boot para garantir DB)
  setTimeout(async () => {
    try {
      console.log('[SERVER] 🎯 Iniciando Round-Market Orchestrator v1.0.0...');
      await orchestrator.iniciar();
      console.log('[SERVER] 🎯 Orchestrator ativo e monitorando mercado');
    } catch (err) {
      console.error('[SERVER] ⚠️ Orchestrator falhou ao iniciar (não-crítico):', err.message);
    }
  }, 15000);

  // 🔔 CRON: Limpeza de push subscriptions expiradas
  // Toda segunda-feira às 3h da manhã
  cron.schedule("0 3 * * 1", async () => {
    console.log("[CRON] Executando limpeza de push subscriptions...");
    try {
      const removidas = await cleanExpiredSubscriptions();
      console.log(`[CRON] Limpeza concluída: ${removidas} subscriptions removidas`);
    } catch (erro) {
      console.error("[CRON] Erro na limpeza de subscriptions:", erro.message);
    }
  });
  console.log("[SERVER] 🔔 Cron de limpeza de push subscriptions agendado (seg 3h)");

  // 🔔 CRON: Notificação de escalação pendente v2.0 (INTELIGENTE)
  // Sistema inteligente baseado em MarketGate que calcula horários dinâmicos
  // Notifica 2h, 1h e 30min antes do fechamento REAL do mercado
  // Roda a cada 15 minutos para detectar os intervalos corretos
  const cronEscalacaoInteligente = cron.schedule("*/15 * * * *", async () => {
    try {
      await verificarENotificarEscalacao();
    } catch (erro) {
      console.error("[CRON] Erro ao verificar escalações:", erro.message);
    }
  });
  cronJobs.push(cronEscalacaoInteligente);
  console.log("[SERVER] 🔔 Cron de escalação INTELIGENTE agendado (a cada 15min, notifica 2h/1h/30min antes)");

  // 🔔 CRON: Limpeza de cache de notificações (diário às 4h)
  const cronLimpezaCache = cron.schedule("0 4 * * *", async () => {
    try {
      limparCacheNotificacoes();
    } catch (erro) {
      console.error("[CRON] Erro na limpeza de cache:", erro.message);
    }
  });
  cronJobs.push(cronLimpezaCache);
  console.log("[SERVER] 🔔 Cron de limpeza de cache agendado (diário 4h)");
})();

// ====================================================================
// 🛑 GRACEFUL SHUTDOWN - Fecha recursos antes de encerrar processo
// ====================================================================
async function gracefulShutdown(signal) {
  const logShutdown = IS_PRODUCTION ? originalConsole.log : console.log;
  logShutdown(`\n[SHUTDOWN] Recebido sinal ${signal}, encerrando gracefully...`);
  
  const SHUTDOWN_TIMEOUT = 10000; // 10 segundos
  let forcedExit = false;
  
  // Força encerramento após timeout
  const forceExitTimer = setTimeout(() => {
    forcedExit = true;
    const logError = IS_PRODUCTION ? originalConsole.error : console.error;
    logError("[SHUTDOWN] ⚠️ Timeout excedido, forçando encerramento...");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT);
  
  try {
    // 1. Parar de aceitar novas conexões HTTP
    if (httpServer) {
      logShutdown("[SHUTDOWN] Fechando servidor HTTP...");
      await new Promise((resolve) => {
        httpServer.close(resolve);
      });
      logShutdown("[SHUTDOWN] ✅ Servidor HTTP fechado");
    }
    
    // 2. Parar todos os cron jobs
    if (cronJobs.length > 0) {
      logShutdown(`[SHUTDOWN] Parando ${cronJobs.length} cron jobs...`);
      cronJobs.forEach(job => job.stop());
      logShutdown("[SHUTDOWN] ✅ Cron jobs parados");
    }
    
    // 3. Limpar timer de consolidação
    if (consolidacaoIntervalId) {
      logShutdown("[SHUTDOWN] Parando scheduler de consolidação...");
      clearInterval(consolidacaoIntervalId);
      logShutdown("[SHUTDOWN] ✅ Scheduler de consolidação parado");
    }
    
    // 3.5. Parar Round-Market Orchestrator
    try {
      logShutdown("[SHUTDOWN] Parando Round-Market Orchestrator...");
      await orchestrator.parar();
      logShutdown("[SHUTDOWN] ✅ Orchestrator parado");
    } catch (e) {
      logShutdown("[SHUTDOWN] ⚠️ Erro ao parar orchestrator: " + e.message);
    }

    // 4. Limpar timer de rate limiting
    if (rateLimitCleanupIntervalId) {
      logShutdown("[SHUTDOWN] Parando limpeza de rate limiting...");
      clearInterval(rateLimitCleanupIntervalId);
      logShutdown("[SHUTDOWN] ✅ Rate limiting cleanup parado");
    }
    
    // 5. Fechar conexão MongoDB
    if (mongoose.connection.readyState === 1) {
      logShutdown("[SHUTDOWN] Fechando conexão MongoDB...");
      await mongoose.connection.close();
      logShutdown("[SHUTDOWN] ✅ MongoDB desconectado");
    }
    
    clearTimeout(forceExitTimer);
    
    if (!forcedExit) {
      logShutdown("[SHUTDOWN] 🎉 Encerramento graceful completo");
      process.exit(0);
    }
  } catch (erro) {
    const logError = IS_PRODUCTION ? originalConsole.error : console.error;
    logError("[SHUTDOWN] ❌ Erro durante shutdown:", erro);
    clearTimeout(forceExitTimer);
    process.exit(1);
  }
}

// ====================================================================
// 📡 SIGNAL HANDLERS - Intercepta sinais de encerramento
// ====================================================================
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGQUIT", () => gracefulShutdown("SIGQUIT"));

// ====================================================================
// 🛡️ GLOBAL ERROR HANDLERS - Captura erros não tratados
// ====================================================================
process.on("unhandledRejection", (reason, promise) => {
  const logError = IS_PRODUCTION ? originalConsole.error : console.error;
  logError("[UNHANDLED_REJECTION] Promise rejeitada sem catch:", reason?.message || reason);
  if (reason?.stack && !IS_PRODUCTION) {
    logError("[UNHANDLED_REJECTION] Stack:", reason.stack);
  }
});

process.on("uncaughtException", (error) => {
  const logError = IS_PRODUCTION ? originalConsole.error : console.error;
  logError("[UNCAUGHT_EXCEPTION] Erro nao capturado:", error.message);
  logError("[UNCAUGHT_EXCEPTION] Stack:", error.stack);
  // Encerrar gracefully - uncaughtException deixa o processo em estado instavel
  gracefulShutdown("UNCAUGHT_EXCEPTION");
});

export default app;


// Webhook para GitHub Actions
app.post('/github-sync', express.json(), (req, res) => {
  console.log('🔔 Webhook do GitHub recebido:', req.body);
  
  exec('bash scripts/sync-replit.sh', (error, stdout, stderr) => {
    if (error) {
      console.error('❌ Erro no sync:', error);
      return res.status(500).json({ error: error.message });
    }
    
    console.log('✅ Sync concluído:', stdout);
    res.json({ 
      success: true, 
      message: 'Sync executado',
      timestamp: new Date().toISOString()
    });
  });
});
