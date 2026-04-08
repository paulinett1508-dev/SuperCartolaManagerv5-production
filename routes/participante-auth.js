import express from "express";
import bcrypt from "bcryptjs";
import Liga from "../models/Liga.js";

const router = express.Router();


// Middleware para verificar sessão de participante ativo
function verificarSessaoParticipante(req, res, next) {
    if (!req.session || !req.session.participante) {
        return res.status(401).json({
            error: "Sessão expirada ou inválida",
            needsLogin: true,
        });
    }
    next();
}

// =====================================================================
// GET /check-assinante/:timeId - Verifica se time e assinante
// =====================================================================
router.get("/check-assinante/:timeId", async (req, res) => {
    try {
        const { timeId } = req.params;

        if (!timeId || isNaN(parseInt(timeId))) {
            return res.status(400).json({ assinante: false, error: "ID invalido" });
        }

        const { default: Time } = await import("../models/Time.js");
        const time = await Time.findOne({ id: parseInt(timeId) }).select("assinante nome_cartola");

        res.json({
            assinante: time?.assinante === true,
            nomeCartola: time?.nome_cartola || null
        });

    } catch (error) {
        console.error("[PARTICIPANTE-AUTH] Erro ao verificar assinante:", error);
        res.json({ assinante: false });
    }
});

// LOGIN OTIMIZADO - Busca Direta no MongoDB (Sem carregar tudo na memória)
router.post("/login", async (req, res) => {
    try {
        const { timeId, senha, lembrar } = req.body;

        console.log('[PARTICIPANTE-AUTH] 🔐 Tentativa de login:', { timeId, lembrar });

        if (!timeId || !senha) {
            return res.status(400).json({
                error: "ID do time e senha são obrigatórios",
            });
        }

        const { default: Liga } = await import("../models/Liga.js");

        // ⚡ OTIMIZAÇÃO: Busca apenas a liga que contém este participante
        // Procura em qualquer liga onde 'participantes.time_id' seja igual ao timeId fornecido
        const ligaEncontrada = await Liga.findOne({
            "participantes.time_id": parseInt(timeId),
        });

        if (!ligaEncontrada) {
            console.log('[PARTICIPANTE-AUTH] ❌ Time não encontrado em nenhuma liga');
            return res.status(404).json({
                error: "Time não encontrado em nenhuma liga cadastrada",
            });
        }

        // Extrair o participante do array da liga
        const participanteEncontrado = ligaEncontrada.participantes.find(
            (p) => String(p.time_id) === String(timeId),
        );

        if (!participanteEncontrado) {
            // Caso raro onde o índice achou mas o find não (segurança extra)
            console.log('[PARTICIPANTE-AUTH] ❌ Erro ao localizar participante no array');
            return res
                .status(404)
                .json({ error: "Erro ao localizar dados do participante" });
        }

        // 🔒 SEC-FIX: Validar senha com bcrypt (retrocompatível com plaintext)
        const senhaArmazenada = participanteEncontrado.senha_acesso || '';
        const isBcryptHash = senhaArmazenada.startsWith('$2a$') || senhaArmazenada.startsWith('$2b$');

        let senhaValida = false;
        if (isBcryptHash) {
            // Senha já migrada para bcrypt
            senhaValida = await bcrypt.compare(senha, senhaArmazenada);
        } else {
            // Senha ainda em plaintext - comparar diretamente
            senhaValida = senhaArmazenada === senha;

            // Auto-rehash: migrar para bcrypt no login bem-sucedido
            if (senhaValida && senha) {
                try {
                    const senhaHash = await bcrypt.hash(senha, 10);
                    const { default: Liga } = await import("../models/Liga.js");
                    await Liga.updateOne(
                        { _id: ligaEncontrada._id, "participantes.time_id": parseInt(timeId) },
                        { $set: { "participantes.$.senha_acesso": senhaHash } }
                    );
                    console.log(`[PARTICIPANTE-AUTH] 🔒 Senha migrada para bcrypt (time ${timeId})`);
                } catch (rehashErr) {
                    console.error('[PARTICIPANTE-AUTH] Erro ao migrar senha:', rehashErr.message);
                }
            }
        }

        if (!senhaValida) {
            console.log('[PARTICIPANTE-AUTH] Senha incorreta');
            return res.status(401).json({
                error: "Senha incorreta",
            });
        }

        // ✅ BUSCAR DADOS REAIS DO TIME DA API CARTOLA
        // ✅ v2.3: Incluir fallback para nome_cartoleiro (campo alternativo no schema)
        let dadosReais = {
            nome_cartola: participanteEncontrado.nome_cartola || participanteEncontrado.nome_cartoleiro || 'Cartoleiro',
            nome_time: participanteEncontrado.nome_time || 'Meu Time',
            foto_perfil: participanteEncontrado.foto_perfil || '',
            foto_time: participanteEncontrado.foto_time || '',
            clube_id: participanteEncontrado.clube_id || null
        };

        try {
            const { default: Time } = await import("../models/Time.js");
            // ✅ v2.3: Corrigido - campo correto é 'id', não 'time_id'
            const timeReal = await Time.findOne({ id: parseInt(timeId) }).lean();

            if (timeReal) {
                dadosReais = {
                    nome_cartola: timeReal.nome_cartola || timeReal.nome_cartoleiro || participanteEncontrado.nome_cartola || 'Cartoleiro',
                    nome_time: timeReal.nome_time || timeReal.nome || participanteEncontrado.nome_time || 'Meu Time',
                    foto_perfil: timeReal.foto_perfil || participanteEncontrado.foto_perfil || '',
                    foto_time: timeReal.url_escudo_png || timeReal.foto_time || participanteEncontrado.foto_time || '',
                    clube_id: timeReal.clube_id || participanteEncontrado.clube_id || null
                };
                console.log('[PARTICIPANTE-AUTH] ✅ Dados reais encontrados:', dadosReais);
            } else {
                console.warn('[PARTICIPANTE-AUTH] ⚠️ Time não encontrado no banco, usando dados da liga');
            }
        } catch (error) {
            console.error('[PARTICIPANTE-AUTH] ❌ Erro ao buscar dados do time:', error);
        }

        // 🔐 LÓGICA DE SESSÃO DINÂMICA (Manter Conectado)
        // Se o usuário marcou "Manter conectado": 365 dias
        // Se não marcou: 24 horas (padrão de segurança)
        const ONE_YEAR = 1000 * 60 * 60 * 24 * 365;
        const ONE_DAY = 1000 * 60 * 60 * 24;

        req.session.cookie.maxAge = lembrar ? ONE_YEAR : ONE_DAY;

        console.log('[PARTICIPANTE-AUTH] ⏰ Cookie maxAge definido:', lembrar ? '365 dias' : '24 horas');

        // Criar sessão com dados reais
        req.session.participante = {
            timeId: timeId,
            ligaId: ligaEncontrada._id.toString(),
            participante: dadosReais,
        };

        console.log('[PARTICIPANTE-AUTH] 💾 Sessão criada para:', { timeId, ligaId: ligaEncontrada._id.toString() });

        // Forçar salvamento da sessão
        req.session.save((err) => {
            if (err) {
                console.error("[PARTICIPANTE-AUTH] ❌ Erro ao salvar sessão:", err);
                return res.status(500).json({ error: "Erro ao criar sessão" });
            }

            console.log('[PARTICIPANTE-AUTH] ✅ Sessão salva com sucesso');
            console.log('[PARTICIPANTE-AUTH] Session ID:', req.sessionID);

            // ✅ Adicionar headers de cache-control
            res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.set('Pragma', 'no-cache');
            res.set('Expires', '0');

            res.json({
                success: true,
                message: "Login realizado com sucesso",
                participante: {
                    // ✅ v2.3: Usar dadosReais que já tem fallbacks corretos
                    nome: dadosReais.nome_cartola,
                    time: dadosReais.nome_time,
                },
            });
        });
    } catch (error) {
        console.error("[PARTICIPANTE-AUTH] ❌ Erro no login:", error);
        res.status(500).json({ error: "Erro interno ao processar login" });
    }
});

// GET - Verificar sessão (Mais robusto)
router.get("/session", async (req, res) => {
    try {
        console.log('[PARTICIPANTE-AUTH] Verificando sessão:');
        console.log('  - Session ID:', req.sessionID);
        console.log('  - Session participante:', req.session?.participante ? '✅ EXISTE' : '❌ NÃO EXISTE');
        console.log('  - Session data:', JSON.stringify(req.session?.participante || {}));

        if (!req.session || !req.session.participante) {
            console.log('[PARTICIPANTE-AUTH] ❌ Sessão inválida/expirada');
            return res.status(401).json({
                authenticated: false,
                message: "Não autenticado",
            });
        }

        // Buscar dados atualizados do time (opcional, mas bom para UX)
        const { default: Time } = await import("../models/Time.js");
        const timeId = req.session.participante.timeId;

        let timeData = null;
        if (timeId) {
            // ✅ v2.4: Converter timeId para Number explicitamente (campo id no schema é Number)
            const timeIdNum = Number(timeId);
            console.log('[PARTICIPANTE-AUTH] Buscando time no banco:', { timeId, timeIdNum, isNaN: isNaN(timeIdNum) });

            if (!isNaN(timeIdNum)) {
                timeData = await Time.findOne({ id: timeIdNum }).select(
                    "nome nome_time nome_cartola nome_cartoleiro clube_id url_escudo_png assinante",
                );
                console.log('[PARTICIPANTE-AUTH] Time encontrado:', timeData ? '✅ SIM' : '❌ NÃO', timeData ? { nome_time: timeData.nome_time, nome_cartola: timeData.nome_cartola, nome_cartoleiro: timeData.nome_cartoleiro } : null);
            }
        }

        // ✅ Adicionar headers de cache-control para evitar cache agressivo
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');

        // ✅ v2.4: Construir dados com fallbacks robustos
        const sessionData = req.session.participante;
        const dadosParticipante = sessionData.participante || {};

        // ✅ v2.4: Log detalhado para debug
        console.log('[PARTICIPANTE-AUTH] 📊 Dados para composição:', {
            timeId,
            timeDataEncontrado: !!timeData,
            timeData_nome_time: timeData?.nome_time,
            timeData_nome_cartola: timeData?.nome_cartola,
            timeData_nome_cartoleiro: timeData?.nome_cartoleiro,
            sessao_nome_time: dadosParticipante.nome_time,
            sessao_nome_cartola: dadosParticipante.nome_cartola
        });

        // Priorizar dados do banco (frescos) sobre dados da sessão (podem estar desatualizados)
        const nomeCartola = timeData?.nome_cartola || timeData?.nome_cartoleiro ||
                            dadosParticipante.nome_cartola || dadosParticipante.nome_cartoleiro || "Cartoleiro";
        const nomeTime = timeData?.nome_time || timeData?.nome ||
                         dadosParticipante.nome_time || dadosParticipante.nome || "Meu Time";

        console.log('[PARTICIPANTE-AUTH] ✅ Sessão válida - retornando:', { timeId, nomeTime, nomeCartola });
        const clubeId = timeData?.clube_id || dadosParticipante.clube_id || null;

        res.json({
            authenticated: true,
            participante: {
                ...sessionData,
                // ✅ v2.3: Sobrescrever dados do participante com valores atualizados
                participante: {
                    ...dadosParticipante,
                    nome_cartola: nomeCartola,
                    nome_time: nomeTime,
                    clube_id: clubeId,
                    foto_time: timeData?.url_escudo_png || dadosParticipante.foto_time || ""
                },
                assinante: timeData?.assinante || false,
                time: timeData
                    ? {
                          nome: nomeTime,
                          nome_cartola: nomeCartola,
                          nome_time: nomeTime,
                          clube_id: clubeId,
                          url_escudo_png: timeData.url_escudo_png,
                      }
                    : null,
            },
        });
    } catch (error) {
        console.error("Erro ao verificar sessão:", error);
        // Não retornar 500 aqui para não quebrar o frontend, apenas deslogar
        res.status(401).json({
            authenticated: false,
            error: "Sessão inválida",
        });
    }
});

// Buscar todas as ligas que o participante faz parte
router.get("/minhas-ligas", verificarSessaoParticipante, async (req, res) => {
    try {
        const { timeId } = req.session.participante;

        if (!timeId) {
            return res
                .status(400)
                .json({ error: "Time ID não encontrado na sessão" });
        }

        const { default: Liga } = await import("../models/Liga.js");

        // Busca otimizada: Retorna apenas ID, nome e descrição
        const ligas = await Liga.find({
            "participantes.time_id": parseInt(timeId),
        })
            .select("_id nome descricao status ativa logo")
            .lean();

        res.json({
            success: true,
            ligas: ligas.map((liga) => ({
                id: liga._id.toString(),
                nome: liga.nome,
                descricao: liga.descricao || "",
                status: liga.status || (liga.ativa !== false ? 'ativa' : 'aposentada'),
                ativa: liga.ativa !== false,
                logo: liga.logo || null,
            })),
        });
    } catch (error) {
        console.error("[PARTICIPANTE-AUTH] Erro ao buscar ligas:", error);
        res.status(500).json({ error: "Erro ao buscar ligas" });
    }
});

// Trocar de liga (atualizar sessão)
router.post("/trocar-liga", verificarSessaoParticipante, async (req, res) => {
    try {
        const { ligaId } = req.body;
        const { timeId } = req.session.participante;

        if (!ligaId)
            return res.status(400).json({ error: "Liga ID não fornecido" });

        const { default: Liga } = await import("../models/Liga.js");
        const liga = await Liga.findById(ligaId);

        if (!liga)
            return res.status(404).json({ error: "Liga não encontrada" });

        const participante = liga.participantes.find(
            (p) => String(p.time_id) === String(timeId),
        );

        if (!participante) {
            return res
                .status(403)
                .json({ error: "Você não participa desta liga" });
        }

        // Atualizar sessão
        req.session.participante.ligaId = ligaId;

        req.session.save((err) => {
            if (err)
                return res
                    .status(500)
                    .json({ error: "Erro ao salvar troca de liga" });

            res.json({
                success: true,
                message: "Liga alterada com sucesso",
                ligaNome: liga.nome,
            });
        });
    } catch (error) {
        console.error("[PARTICIPANTE-AUTH] Erro ao trocar liga:", error);
        res.status(500).json({ error: "Erro ao trocar liga" });
    }
});

// Rota para verificar status (Simplified Check)
router.get("/check", (req, res) => {
    if (req.session && req.session.participante) {
        res.json({
            authenticated: true,
            participante: {
                timeId: req.session.participante.timeId,
                nome: req.session.participante.participante.nome_cartola,
                time: req.session.participante.participante.nome_time,
            },
        });
    } else {
        res.json({ authenticated: false, needsLogin: true });
    }
});

// Logout Otimizado
router.post("/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error("Erro ao destruir sessão:", err);
            return res.status(500).json({ error: "Erro ao fazer logout" });
        }
        res.clearCookie("connect.sid"); // Limpar cookie no navegador
        res.json({ success: true, message: "Logout realizado com sucesso" });
    });
});

export { verificarSessaoParticipante };
export default router;
