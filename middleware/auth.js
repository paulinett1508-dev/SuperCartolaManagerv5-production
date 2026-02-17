/**
 * Middleware de Autenticação - Super Cartola Manager
 * Destino: /middlewares/auth.js
 * Protege rotas Admin (Google OAuth) e Participante (senha time)
 */

/**
 * Lista de rotas/recursos PÚBLICOS (sem autenticação)
 */
export const ROTAS_PUBLICAS = [
  "/favicon.ico",
  "/favicon.png",
  "/escudos/",
  "/css/",
  "/js/",
  "/img/",
  "/api/admin/auth/",
  "/api/participante/auth/",
  "/api/participante/manutencao/",
  "/api/oauth/callback",
  "/api/cartola/",
  "/api/configuracao/",
  "/api/version",
  // ✅ PWA - Arquivos que precisam ser públicos
  "/participante/manifest.json",
  "/participante/service-worker.js",
  // ✅ CRÍTICO: Assets estáticos do participante (JS, CSS, imagens)
  // Sem isso, o auth middleware redireciona para login e retorna HTML
  "/participante/js/",
  "/participante/css/",
  "/participante/img/",
  "/participante/fronts/",
  // ✅ Push Notifications - VAPID key precisa ser pública
  "/api/notifications/vapid-key",
  // ✅ Admin Mobile - PWA para administradores
  "/admin-mobile/manifest.json",
  "/admin-mobile/service-worker.js",
  "/admin-mobile/js/",
  "/admin-mobile/css/",
  "/admin-mobile/icons/",
  // ✅ Admin - Assets estáticos (CSS, JS)
  "/admin/css/",
  "/admin/js/",
];

/**
 * Lista de páginas HTML ADMIN (requerem sessão admin)
 */
export const PAGINAS_ADMIN = [
  "/painel.html",
  "/detalhe-liga.html",
  "/gerenciar.html",
  "/admin.html",
  "/criar-liga.html",
  "/editar-liga.html",
  "/ferramentas.html",
  "/ferramentas-rodadas.html",
  "/analisar-participantes.html",
  "/admin-consolidacao.html",
  "/gerenciar-modulos.html",
  // ✅ Admin Mobile - Páginas HTML do PWA
  "/admin-mobile/",
  "/admin-mobile/index.html",
  "/admin-mobile/login.html",
  "/layout.html",
  // Páginas adicionadas (estavam sem proteção)
  "/admin-gestao.html",
  "/historico-acessos.html",
  "/auditoria-extratos.html",
  "/fluxo-financeiro.html",
  "/preencher-liga.html",
  // ✅ Notificador - Sistema de avisos in-app
  "/notificador.html",
  // ✅ Fase 1 - Páginas que estavam sem proteção (integradas ao orquestrador)
  "/admin-orchestrator.html",
  "/github-analytics-unified.html",
  "/api-football-analytics.html",
  "/dashboard-saude.html",
  "/dashboard-analytics.html",
  "/admin-analises-ia.html",
  "/admin-validacao-migracao.html",
  "/modo-manutencao-avancado.html",
  "/migrar-localstorage-mongodb.html",
  "/wizard-primeira-liga.html",
];

/**
 * Lista de páginas/rotas PARTICIPANTE (requerem sessão participante)
 */
export const PAGINAS_PARTICIPANTE = [
  "/participante/",
];

/**
 * Verifica se a URL é um recurso público
 */
export function isRotaPublica(url) {
  return ROTAS_PUBLICAS.some((rota) => url.startsWith(rota) || url === rota);
}

/**
 * Verifica se a URL é uma página admin
 */
export function isPaginaAdmin(url) {
  return PAGINAS_ADMIN.some((pagina) => url.includes(pagina));
}

/**
 * Verifica se a URL é uma página de participante
 * ✅ FIX: Não confundir rotas de API com páginas de participante
 */
export function isPaginaParticipante(url) {
  // Rotas de API nunca são páginas de participante
  if (url.startsWith('/api/')) {
    return false;
  }
  return PAGINAS_PARTICIPANTE.some((pagina) => url.includes(pagina));
}

/**
 * ✅ BYPASS DE DESENVOLVIMENTO
 * Injeta sessão admin automaticamente em NODE_ENV=development
 * Não afeta produção (Replit Auth continua funcionando)
 */
export function injetarSessaoDevAdmin(req, res, next) {
  const isDev = process.env.NODE_ENV === 'development';
  const devBypass = process.env.DEV_ADMIN_BYPASS === 'true';

  if (isDev && devBypass && !req.session?.admin) {
    // Usar ObjectId fixo válido para desenvolvimento (24 caracteres hex)
    const devAdminId = process.env.DEV_ADMIN_ID || '000000000000000000000001';
    const devEmail = process.env.DEV_ADMIN_EMAIL || 'dev@localhost';

    req.session.admin = {
      email: devEmail,
      nome: 'Admin Dev',
      _id: devAdminId,  // ObjectId válido para tenant filter
      id: devAdminId,   // Compatibilidade
      isDev: true
    };
    console.log(`[AUTH-DEV] Sessao admin injetada (email: ${devEmail})`);
  }

  next();
}

/**
 * Middleware principal de proteção de rotas
 * Aplica ANTES de servir arquivos estáticos
 */
export function protegerRotas(req, res, next) {
  const url = req.path;

  // 1. Recursos públicos - liberar
  if (isRotaPublica(url)) {
    return next();
  }

  // 2. Landing page (index.html ou /) - liberar
  if (url === "/" || url === "/index.html") {
    // Se admin logado, redirecionar conforme contexto (mobile vs desktop)
    if (req.session?.admin) {
      const ua = req.headers['user-agent'] || '';
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
      return res.redirect(isMobile ? "/admin-mobile/" : "/painel.html");
    }
    // Se participante logado, redirecionar para área participante
    if (req.session?.participante) {
      return res.redirect("/participante/");
    }
    return next();
  }

  // 3. Login participante - liberar
  if (url === "/participante-login.html") {
    // Se já logado como participante, redirecionar
    if (req.session?.participante) {
      return res.redirect("/participante/");
    }
    return next();
  }

  // 4. Páginas ADMIN - verificar sessão admin
  if (isPaginaAdmin(url)) {
    if (!req.session?.admin) {
      console.log(`[AUTH] 🚫 Acesso admin negado (não autenticado): ${url}`);
      return res.redirect("/?error=admin_required");
    }

    // Bloquear participante de acessar admin
    if (req.session?.participante && !req.session?.admin) {
      console.log(`[AUTH] 🚫 Participante bloqueado de admin: ${url}`);
      return res.redirect("/participante/");
    }

    return next();
  }

  // 5. Páginas PARTICIPANTE - verificar sessão participante
  if (isPaginaParticipante(url)) {
    if (!req.session?.participante) {
      console.log(`[AUTH] 🚫 Acesso participante negado: ${url}`);
      return res.redirect("/participante-login.html");
    }
    return next();
  }

  // 6. Demais rotas - liberar (APIs são protegidas individualmente)
  next();
}

/**
 * Middleware para proteger rotas de API admin
 * Usar em rotas específicas que só admin pode acessar
 */
export function verificarAdmin(req, res, next) {
  if (!req.session?.admin) {
    return res.status(401).json({
      error: "Não autorizado",
      message: "Autenticação de administrador necessária",
      needsLogin: true,
    });
  }
  next();
}

/**
 * Middleware para proteger rotas de API participante
 */
export function verificarParticipante(req, res, next) {
  if (!req.session?.participante) {
    return res.status(401).json({
      error: "Sessão expirada",
      message: "Faça login novamente",
      needsLogin: true,
    });
  }
  next();
}

/**
 * Middleware para verificar admin OU participante dono do recurso
 * Usado em rotas onde participante pode acessar/modificar seus próprios dados
 * Requer timeId nos params da rota
 */
export function verificarAdminOuDono(req, res, next) {
  // Admin sempre pode
  if (req.session?.admin) {
    return next();
  }

  // Participante só pode acessar seus próprios dados
  if (req.session?.participante) {
    const timeIdParam = Number(req.params.timeId);
    const timeIdSessao = Number(req.session.participante.time_id);

    if (timeIdParam === timeIdSessao) {
      return next();
    }

    return res.status(403).json({
      error: "Acesso negado",
      message: "Você só pode acessar seus próprios dados",
    });
  }

  // Nenhuma sessão válida
  return res.status(401).json({
    error: "Não autorizado",
    message: "Faça login para continuar",
    needsLogin: true,
  });
}

/**
 * Middleware legado - bloquear participante de admin
 * @deprecated Use protegerRotas no lugar
 */
export function bloquearParticipanteDeAdmin(req, res, next) {
  if (req.session?.participante && !req.session?.admin) {
    const isAdmin = PAGINAS_ADMIN.some((rota) => req.path.includes(rota));
    if (isAdmin) {
      console.log("[AUTH] 🚫 Participante bloqueado (legado):", req.path);
      return res.redirect("/participante/");
    }
  }
  next();
}

/**
 * Middleware legado - manter compatibilidade
 * @deprecated Use protegerRotas no lugar
 */
export function bloquearPaginasAdminParaParticipantes(req, res, next) {
  return protegerRotas(req, res, next);
}

/**
 * Middleware para validar liga_id em rotas de API
 * Verifica se liga_id foi fornecido no query ou body
 * Multi-tenant: todas as queries devem ter liga_id
 */
export function validarLigaId(req, res, next) {
  const liga_id = req.query.liga_id || req.body?.liga_id;

  if (!liga_id) {
    return res.status(400).json({
      success: false,
      error: "liga_id obrigatório",
      message: "Parâmetro liga_id é obrigatório para esta operação",
    });
  }

  // Validar formato (ObjectId ou string não vazia)
  if (typeof liga_id !== "string" || liga_id.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: "liga_id inválido",
      message: "liga_id deve ser uma string não vazia",
    });
  }

  // Disponibilizar liga_id normalizado no req para uso posterior
  req.liga_id = liga_id.trim();
  next();
}