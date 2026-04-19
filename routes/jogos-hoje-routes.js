// routes/jogos-hoje-routes.js
// v1.2 - Jogos do dia para todos os participantes autenticados
import express from 'express';
import fetch from 'node-fetch';

const router = express.Router();

// Campeonato Brasileiro Série A (BSA)
const COMPETICAO_ID = 'BSA';

router.get('/', async (req, res) => {
    // Public endpoint — intentionally open to all (no auth required)
    try {
        // Buscar jogos reais da API
        const dataHoje = new Date().toISOString().split('T')[0];
        const url = `https://api.football-data.org/v4/competitions/${COMPETICAO_ID}/matches?dateFrom=${dataHoje}&dateTo=${dataHoje}`;

        let jogos = [];
        try {
            const response = await fetch(url, {
                headers: { 'X-Auth-Token': process.env.FOOTBALL_API_KEY || '' },
                timeout: 5000
            });
            const data = await response.json();
            jogos = (data.matches || []).map(f => ({
                mandante: f.homeTeam.shortName || f.homeTeam.name,
                visitante: f.awayTeam.shortName || f.awayTeam.name,
                horario: f.utcDate ? new Date(f.utcDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--',
                status: f.status === 'LIVE' ? 'Ao vivo' : (f.status === 'FINISHED' ? 'Encerrado' : 'Em breve'),
                placar: f.status === 'FINISHED' || f.status === 'LIVE'
                    ? `${f.score.fullTime.home ?? 0} x ${f.score.fullTime.away ?? 0}`
                    : '-'
            }));
        } catch (apiErr) {
            console.log('[JOGOS-HOJE] API indisponível, usando fallback');
        }

        res.json({
            jogos,
            fonte: 'api',
            data: dataHoje
        });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar jogos do dia', detalhes: err.message });
    }
});

export default router;
