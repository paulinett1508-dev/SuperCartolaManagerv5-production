/**
 * Middleware de Segurança - Super Cartola Manager
 * Headers, Rate Limiting, Proteções
 */

// ====================================================================
// RATE LIMITING - Proteção contra brute force
// ====================================================================
const requestCounts = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minuto
const RATE_LIMIT_MAX_REQUESTS = 500; // ✅ FIX: aumentado de 100 para 500 (app SPA faz muitas requisições legítimas)
const RATE_LIMIT_AUTH_MAX = 10; // máx tentativas de login por minuto

// Limpar contadores antigos periodicamente
const rateLimitCleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, data] of requestCounts.entries()) {
    if (now - data.startTime > RATE_LIMIT_WINDOW) {
      requestCounts.delete(key);
    }
  }
}, RATE_LIMIT_WINDOW);

// Exportar intervalId para graceful shutdown
export function getRateLimitCleanupIntervalId() {
  return rateLimitCleanupInterval;
}

/**
 * Rate Limiter genérico
 */
export function rateLimiter(req, res, next) {
  // ✅ FIX: Excluir assets estáticos do rate limiting
  // Assets (CSS, JS, imagens, fontes) não devem contar no limite
  const path = req.path || req.url;
  const isStaticAsset = /\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|webp|map|html)$/i.test(path) ||
                        path.startsWith('/css/') ||
                        path.startsWith('/js/') ||
                        path.startsWith('/img/') ||
                        path.startsWith('/images/') ||
                        path.startsWith('/escudos/') ||
                        path.startsWith('/participante/css/') ||
                        path.startsWith('/participante/js/') ||
                        path.startsWith('/participante/html/') ||
                        path.startsWith('/participante/img/') ||
                        path.startsWith('/participante/images/') ||
                        path.startsWith('/fronts/');
  
  // Se é asset estático, pular rate limiting
  if (isStaticAsset) {
    return next();
  }

  // ✅ FIX: Obter IP real do cliente, não do proxy/load balancer
  // Prioridade: X-Forwarded-For (real client) > X-Real-IP > req.ip (proxy)
  const forwardedFor = req.headers['x-forwarded-for'];
  const realIp = req.headers['x-real-ip'];
  const ip = forwardedFor ? forwardedFor.split(',')[0].trim() :
             realIp ? realIp :
             req.ip || req.connection.remoteAddress || "unknown";
  
  const now = Date.now();

  if (!requestCounts.has(ip)) {
    requestCounts.set(ip, { count: 1, startTime: now });
    return next();
  }

  const data = requestCounts.get(ip);

  if (now - data.startTime > RATE_LIMIT_WINDOW) {
    requestCounts.set(ip, { count: 1, startTime: now });
    return next();
  }

  data.count++;

  if (data.count > RATE_LIMIT_MAX_REQUESTS) {
    console.log(`[SECURITY] 🚫 Rate limit excedido: ${ip}`);
    return res.status(429).json({
      error: "Muitas requisições",
      message: "Aguarde um momento antes de tentar novamente",
      retryAfter: Math.ceil(
        (RATE_LIMIT_WINDOW - (now - data.startTime)) / 1000,
      ),
    });
  }

  next();
}

/**
 * Rate Limiter específico para autenticação (mais restritivo)
 */
const authAttempts = new Map();

export function authRateLimiter(req, res, next) {
  // ✅ FIX: Mesma lógica de IP real para auth
  const forwardedFor = req.headers['x-forwarded-for'];
  const realIp = req.headers['x-real-ip'];
  const ip = forwardedFor ? forwardedFor.split(',')[0].trim() :
             realIp ? realIp :
             req.ip || req.connection.remoteAddress || "unknown";
  
  const now = Date.now();

  if (!authAttempts.has(ip)) {
    authAttempts.set(ip, { count: 1, startTime: now });
    return next();
  }

  const data = authAttempts.get(ip);

  if (now - data.startTime > RATE_LIMIT_WINDOW) {
    authAttempts.set(ip, { count: 1, startTime: now });
    return next();
  }

  data.count++;

  if (data.count > RATE_LIMIT_AUTH_MAX) {
    console.log(`[SECURITY] 🚫 Auth rate limit excedido: ${ip}`);
    return res.status(429).json({
      error: "Muitas tentativas de login",
      message: "Aguarde 1 minuto antes de tentar novamente",
      retryAfter: Math.ceil(
        (RATE_LIMIT_WINDOW - (now - data.startTime)) / 1000,
      ),
    });
  }

  next();
}

// ====================================================================
// RATE LIMITING - Matchday endpoints (mais restritivo, alta frequência)
// ====================================================================
const matchdayAttempts = new Map();
const MATCHDAY_RATE_LIMIT_WINDOW = 60 * 1000; // 60 segundos
const MATCHDAY_RATE_LIMIT_MAX = 30; // 30 requests por minuto

// Limpar contadores matchday a cada 5 minutos
const matchdayCleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, data] of matchdayAttempts.entries()) {
    if (now - data.startTime > MATCHDAY_RATE_LIMIT_WINDOW) {
      matchdayAttempts.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * Cria Rate Limiter específico para endpoints matchday
 */
export function createMatchdayRateLimiter() {
  return function matchdayRateLimiter(req, res, next) {
    const forwardedFor = req.headers['x-forwarded-for'];
    const realIp = req.headers['x-real-ip'];
    const ip = forwardedFor ? forwardedFor.split(',')[0].trim() :
               realIp ? realIp :
               req.ip || req.connection.remoteAddress || "unknown";

    const now = Date.now();

    if (!matchdayAttempts.has(ip)) {
      matchdayAttempts.set(ip, { count: 1, startTime: now });
      return next();
    }

    const data = matchdayAttempts.get(ip);

    if (now - data.startTime > MATCHDAY_RATE_LIMIT_WINDOW) {
      matchdayAttempts.set(ip, { count: 1, startTime: now });
      return next();
    }

    data.count++;

    if (data.count > MATCHDAY_RATE_LIMIT_MAX) {
      const retryAfter = Math.ceil(
        (MATCHDAY_RATE_LIMIT_WINDOW - (now - data.startTime)) / 1000,
      );
      console.log(`[SECURITY] Rate limit matchday excedido: ${ip}`);
      res.setHeader('Retry-After', retryAfter);
      return res.status(429).json({
        error: "Muitas requisições matchday",
        message: "Aguarde um momento antes de tentar novamente",
        retryAfter,
      });
    }

    next();
  };
}

// ====================================================================
// SECURITY HEADERS - Proteção via headers HTTP
// ====================================================================
export function securityHeaders(req, res, next) {
  // Prevenir clickjacking
  res.setHeader("X-Frame-Options", "SAMEORIGIN");

  // Prevenir MIME sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");

  // XSS Protection
  res.setHeader("X-XSS-Protection", "1; mode=block");

  // Referrer Policy
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // Permissions Policy (desabilitar recursos não usados)
  res.setHeader(
    "Permissions-Policy",
    "geolocation=(), microphone=(), camera=()",
  );

  // Content Security Policy (produção)
  if (process.env.NODE_ENV === "production") {
    res.setHeader(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net https://cdn.tailwindcss.com https://cdnjs.cloudflare.com https://cdn.quilljs.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com https://cdn.tailwindcss.com https://cdn.jsdelivr.net https://cdn.quilljs.com https://cdnjs.cloudflare.com https://unpkg.com",
        "font-src 'self' https://fonts.gstatic.com https://fonts.googleapis.com https://cdn.jsdelivr.net https://db.onlinewebfonts.com data:",
        "img-src 'self' data: https: blob:",
        "connect-src 'self' https://api.cartolafc.globo.com https://*.globo.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://fonts.googleapis.com https://fonts.gstatic.com https://cdn.tailwindcss.com https://unpkg.com",
        "worker-src 'self'",
        "frame-ancestors 'self'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join("; "),
    );

    // HSTS (apenas em produção com HTTPS)
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }

  next();
}

// ====================================================================
// PROTEÇÃO CONTRA ATAQUES COMUNS
// ====================================================================

/**
 * Sanitizar parâmetros de entrada
 */
export function sanitizeInput(req, res, next) {
  // Limitar tamanho de query strings
  const queryString = req.originalUrl.split("?")[1] || "";
  if (queryString.length > 2000) {
    return res.status(414).json({ error: "URL muito longa" });
  }

  // Bloquear tentativas óbvias de injeção no path
  const suspiciousPatterns = [
    /\.\.\//, // Path traversal
    /<script/i, // XSS
    /javascript:/i, // XSS
    /(?:^|[^a-zA-Z])on[a-z]+\s*=/i, // Event handlers (word boundary to avoid false positives like "patrimonio=")
    /union\s+select/i, // SQL injection
    /exec\s*\(/i, // Command injection
  ];

  const fullUrl = req.originalUrl;
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(fullUrl)) {
      console.log(
        `[SECURITY] 🚨 Tentativa suspeita bloqueada: ${req.ip} - ${fullUrl}`,
      );
      return res.status(400).json({ error: "Requisição inválida" });
    }
  }

  next();
}

/**
 * Log de segurança para tentativas suspeitas
 */
export function securityLogger(req, res, next) {
  // Detectar tentativas de acesso a arquivos sensíveis
  const sensitivePatterns = [
    /\.env/i,
    /\.git/i,
    /\.htaccess/i,
    /wp-admin/i,
    /wp-login/i,
    /phpmyadmin/i,
    /admin\.php/i,
    /config\.php/i,
  ];

  for (const pattern of sensitivePatterns) {
    if (pattern.test(req.path)) {
      console.log(`[SECURITY] 🔍 Scan detectado: ${req.ip} - ${req.path}`);
      return res.status(404).send("Not Found");
    }
  }

  next();
}

// ====================================================================
// MIDDLEWARE COMBINADO
// ====================================================================
export function setupSecurity(app) {
  // Ordem importa!
  app.use(securityHeaders);
  app.use(sanitizeInput);
  app.use(securityLogger);
  app.use(rateLimiter);

  console.log("[SECURITY] 🛡️ Middlewares de segurança ativados");
}

export default {
  rateLimiter,
  authRateLimiter,
  createMatchdayRateLimiter,
  securityHeaders,
  sanitizeInput,
  securityLogger,
  setupSecurity,
};
