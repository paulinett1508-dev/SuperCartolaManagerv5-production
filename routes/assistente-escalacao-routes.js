// =====================================================================
// ASSISTENTE ESCALACAO ROUTES - Endpoints Multi-Fonte
// =====================================================================

import express from "express";
import assistenteService from "../services/assistenteEscalacaoService.js";
import { sugerirModo, listarModos } from "../services/estrategia-sugestao.js";

const router = express.Router();

// =====================================================================
// MIDDLEWARE: Verificar Sessao de Participante
// =====================================================================
function verificarSessaoParticipante(req, res, next) {
    if (!req.session || !req.session.participante) {
        return res.status(401).json({
            success: false,
            error: "Sessao expirada. Faca login novamente.",
            needsLogin: true,
        });
    }
    next();
}

// Aplicar middleware de autenticação em todas as rotas
router.use(verificarSessaoParticipante);

// =====================================================================
// GET /cenarios - Gera 3 cenarios de escalacao (Mitar/Equilibrado/Valorizar)
// =====================================================================
router.get("/cenarios", async (req, res) => {
    try {
        const patrimonio = parseFloat(req.query.patrimonio) || 100;
        const esquemaId = parseInt(req.query.esquema) || 3;

        if (patrimonio < 30) {
            return res.status(400).json({
                success: false,
                error: "Patrimonio minimo C$ 30.00",
            });
        }

        const resultado = await assistenteService.gerarCenarios(patrimonio, esquemaId);
        res.json(resultado);
    } catch (error) {
        console.error("[ASSISTENTE] Erro ao gerar cenarios:", error.message);
        res.status(500).json({
            success: false,
            error: error.message || "Erro ao gerar cenarios",
        });
    }
});

// =====================================================================
// GET /contexto/:timeId - Contexto do participante (time atual)
// =====================================================================
router.get("/contexto/:timeId", async (req, res) => {
    try {
        const timeId = parseInt(req.params.timeId);
        if (!timeId) {
            return res.status(400).json({ success: false, error: "timeId invalido" });
        }

        const contexto = await assistenteService.buscarContextoParticipante(timeId);

        if (!contexto) {
            return res.status(404).json({
                success: false,
                error: "Nao foi possivel buscar dados do time",
            });
        }

        res.json({ success: true, ...contexto });
    } catch (error) {
        console.error("[ASSISTENTE] Erro ao buscar contexto:", error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =====================================================================
// GET /fontes - Lista fontes de dados disponiveis e seus status
// =====================================================================
router.get("/fontes", async (req, res) => {
    try {
        const fontes = await assistenteService.listarFontesDisponiveis();
        res.json({ success: true, fontes });
    } catch (error) {
        console.error("[ASSISTENTE] Erro ao listar fontes:", error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =====================================================================
// GET /modos - Lista modos de estrategia disponíveis
// =====================================================================
router.get("/modos", (req, res) => {
    res.json({ success: true, modos: listarModos() });
});

// =====================================================================
// GET /modo-sugerido - Sugere modo baseado no patrimonio
// =====================================================================
router.get("/modo-sugerido", (req, res) => {
    const patrimonio = parseFloat(req.query.patrimonio) || 100;
    const sugestao = sugerirModo(patrimonio);
    res.json({ success: true, ...sugestao });
});

export default router;
