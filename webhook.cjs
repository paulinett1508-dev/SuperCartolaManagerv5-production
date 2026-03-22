/**
 * Webhook Server - GitHub Auto Deploy
 * Recebe push events do GitHub e executa deploy.sh
 * Porta: 9000
 */

const http = require('http');
const crypto = require('crypto');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

// Carregar .env manualmente (sem dependência externa)
const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) envVars[match[1].trim()] = match[2].trim();
});

const PORT = 9000;
const SECRET = envVars.GITHUB_WEBHOOK_SECRET;
const DEPLOY_SCRIPT = path.join(__dirname, 'deploy.sh');
const LOG_FILE = path.join(__dirname, 'webhook.log');

function log(message) {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ${message}\n`;
    console.log(logLine.trim());
    fs.appendFileSync(LOG_FILE, logLine);
}

function verifySignature(payload, signature) {
    if (!signature) return false;
    const hmac = crypto.createHmac('sha256', SECRET);
    const digest = 'sha256=' + hmac.update(payload).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}

const server = http.createServer((req, res) => {
    // Health check
    if (req.method === 'GET' && req.url === '/webhook/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
        return;
    }

    // Webhook endpoint
    if (req.method === 'POST' && req.url === '/webhook/deploy') {
        let body = '';

        req.on('data', chunk => { body += chunk; });

        req.on('end', () => {
            const signature = req.headers['x-hub-signature-256'];
            const event = req.headers['x-github-event'];

            // Validar assinatura HMAC
            if (!verifySignature(body, signature)) {
                log(`REJECTED: Invalid signature from ${req.socket.remoteAddress}`);
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid signature' }));
                return;
            }

            // Ping event (GitHub testa conexão)
            if (event === 'ping') {
                log('PING: GitHub webhook configured successfully');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ message: 'pong' }));
                return;
            }

            // Apenas push events
            if (event !== 'push') {
                log(`IGNORED: Event type '${event}' not handled`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ message: 'Event ignored' }));
                return;
            }

            // Parse payload
            let payload;
            try {
                payload = JSON.parse(body);
            } catch (e) {
                log('ERROR: Invalid JSON payload');
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid JSON' }));
                return;
            }

            // Verificar branch (apenas main)
            const branch = payload.ref;
            if (branch !== 'refs/heads/main') {
                log(`IGNORED: Push to ${branch} (not main)`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ message: 'Branch ignored' }));
                return;
            }

            // Extrair info do commit
            const pusher = payload.pusher?.name || 'unknown';
            const commitMsg = payload.head_commit?.message?.split('\n')[0] || 'no message';

            log(`DEPLOY STARTED: Push by ${pusher} - "${commitMsg}"`);

            // Responder imediatamente (deploy roda em background)
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                message: 'Deploy started',
                pusher,
                commit: commitMsg
            }));

            // Executar deploy em background (execFile é mais seguro que exec)
            execFile('/bin/bash', [DEPLOY_SCRIPT], { cwd: __dirname }, (error, stdout, stderr) => {
                if (error) {
                    log(`DEPLOY FAILED: ${error.message}`);
                    log(`STDERR: ${stderr}`);
                } else {
                    log('DEPLOY COMPLETED successfully');
                }
            });
        });

        return;
    }

    // 404 para outras rotas
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
    log(`Webhook server started on port ${PORT}`);
    log(`Endpoint: POST /webhook/deploy`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    log('Received SIGTERM, shutting down...');
    server.close(() => process.exit(0));
});
