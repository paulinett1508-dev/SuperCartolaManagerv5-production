# Copa de Times SC — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar a Copa de Times SC — torneio eliminatório estilo Copa do Mundo integrado à Liga SuperCartola, com Fase Classificatória (35→32), Grupos (8×4), e Mata-Mata completo até a Final.

**Architecture:** Dois novos models Mongoose (`CopaSCConfig`, `CopaSCMatch`) + serviço de lógica + processador de rodadas + manager no orchestrator. Frontend: botão Regras estático no teaser + módulo completo com 4 abas pós-sorteio.

**Tech Stack:** Node.js, Mongoose ES modules, Express, Vanilla JS ES6 Modules, CSS Custom Properties

**Spec:** `docs/superpowers/specs/2026-04-19-copa-times-sc-design.md`

---

## Task 1: Teaser — Botão Regras + Modal (frontend puro, sem backend)

**Files:**
- Modify: `public/participante/fronts/copa-times-sc.html`
- Modify: `public/participante/css/copa-sc.css`

### Contexto
A tela teaser existe em `copa-times-sc.html` com badge "EM BREVE". Adicionar botão "Regras" discreto (outline, pequeno) + bottom-sheet modal estático com o resumo das regras. Sem backend — conteúdo hardcoded em JS.

- [ ] **Step 1: Inserir botão Regras no HTML**

Em `copa-times-sc.html`, após o `<div class="copa-badge">EM BREVE</div>`, inserir:

```html
<button class="copa-regras-btn" onclick="abrirRegrasModal()">
  <span class="material-icons">menu_book</span>
  Regras
</button>

<!-- Modal de Regras -->
<div class="copa-modal-overlay" id="copaRegrasOverlay" onclick="fecharRegrasModal(event)">
  <div class="copa-modal-sheet" id="copaRegrasSheet">
    <div class="copa-modal-handle"></div>
    <div class="copa-modal-header">
      <span class="material-icons copa-modal-icon">emoji_events</span>
      <h3 class="copa-modal-title">Regras da Copa de Times SC</h3>
      <button class="copa-modal-close" onclick="fecharRegrasModal()">
        <span class="material-icons">close</span>
      </button>
    </div>
    <div class="copa-modal-body">
      <section class="copa-regras-section">
        <h4><span class="material-icons">groups</span> Participantes</h4>
        <p>35 times da Liga SuperCartola. Uma <strong>Fase Classificatória</strong> elimina 3 times → 32 classificados para os grupos.</p>
      </section>
      <section class="copa-regras-section">
        <h4><span class="material-icons">filter_3</span> Fase Classificatória (Rod. 20–23)</h4>
        <p>Os times <strong>33°, 34° e 35°</strong> do Pontos Corridos disputam 2 confrontos eliminatórios (soma de 2 rodadas cada). O sobrevivente se junta aos 31 classificados diretos.</p>
      </section>
      <section class="copa-regras-section">
        <h4><span class="material-icons">table_chart</span> Fase de Grupos (Rod. 24–26)</h4>
        <p><strong>8 grupos de 4 times</strong>. Cada time joga 3 partidas (round-robin), 1 rodada por partida. Os <strong>2 primeiros</strong> de cada grupo avançam. Sem impacto financeiro nessa fase.</p>
        <p class="copa-regras-sub">Classificação: Pontos → Vitórias → Saldo → Pontos marcados → Ranking Geral</p>
      </section>
      <section class="copa-regras-section">
        <h4><span class="material-icons">account_tree</span> Mata-Mata (Rod. 27–34)</h4>
        <p>Oitavas → Quartas → Semis → Final. Cada confronto = soma de <strong>2 rodadas</strong>. Empate: melhor posição no Ranking Geral.</p>
      </section>
      <section class="copa-regras-section">
        <h4><span class="material-icons">emoji_events</span> Premiação</h4>
        <p>Apenas ao encerramento do torneio (após rodada 34). Premiados: <strong>Campeão, Vice e 3° Lugar</strong>. Valores definidos pelo admin antes do início.</p>
      </section>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Adicionar script de controle do modal no HTML**

Antes do `</body>` em `copa-times-sc.html`:

```html
<script>
function abrirRegrasModal() {
  const overlay = document.getElementById('copaRegrasOverlay');
  overlay.classList.add('ativo');
  document.body.style.overflow = 'hidden';
}

function fecharRegrasModal(event) {
  if (event && event.target !== document.getElementById('copaRegrasOverlay') && event.type !== 'click') return;
  if (event && event.currentTarget === document.getElementById('copaRegrasOverlay') && event.target !== event.currentTarget) return;
  const overlay = document.getElementById('copaRegrasOverlay');
  overlay.classList.remove('ativo');
  document.body.style.overflow = '';
}
</script>
```

- [ ] **Step 3: Adicionar estilos ao copa-sc.css**

Append ao final de `public/participante/css/copa-sc.css`:

```css
/* ========================
   Botão Regras (teaser)
   ======================== */
.copa-regras-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  padding: 6px 14px;
  background: transparent;
  border: 1px solid var(--copa-gold, #d4af37);
  border-radius: 20px;
  color: var(--copa-gold, #d4af37);
  font-size: 0.78rem;
  font-family: 'Inter', sans-serif;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}
.copa-regras-btn:hover {
  background: var(--copa-gold, #d4af37);
  color: #1a1a2e;
}
.copa-regras-btn .material-icons {
  font-size: 16px;
}

/* ========================
   Modal de Regras
   ======================== */
.copa-modal-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  z-index: 1000;
  align-items: flex-end;
  justify-content: center;
}
.copa-modal-overlay.ativo {
  display: flex;
}
.copa-modal-sheet {
  background: var(--bg-card, #1e1e2e);
  border-radius: 20px 20px 0 0;
  width: 100%;
  max-width: 560px;
  max-height: 85vh;
  overflow-y: auto;
  padding: 0 0 32px;
  animation: copaSlideUp 0.3s ease;
}
@keyframes copaSlideUp {
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
}
.copa-modal-handle {
  width: 40px;
  height: 4px;
  background: rgba(255,255,255,0.2);
  border-radius: 2px;
  margin: 12px auto 0;
}
.copa-modal-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 20px 12px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}
.copa-modal-icon {
  color: var(--copa-gold, #d4af37);
  font-size: 24px;
}
.copa-modal-title {
  flex: 1;
  font-family: 'Russo One', sans-serif;
  font-size: 1rem;
  color: var(--copa-gold, #d4af37);
  margin: 0;
}
.copa-modal-close {
  background: transparent;
  border: none;
  color: rgba(255,255,255,0.5);
  cursor: pointer;
  padding: 4px;
  line-height: 1;
}
.copa-modal-close:hover { color: #fff; }
.copa-modal-body {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.copa-regras-section h4 {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: 'Inter', sans-serif;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--copa-gold, #d4af37);
  margin: 0 0 6px;
}
.copa-regras-section h4 .material-icons {
  font-size: 18px;
}
.copa-regras-section p {
  font-size: 0.82rem;
  color: rgba(255,255,255,0.75);
  line-height: 1.5;
  margin: 0;
}
.copa-regras-section p + p { margin-top: 4px; }
.copa-regras-sub {
  font-size: 0.75rem !important;
  color: rgba(255,255,255,0.45) !important;
  font-style: italic;
}
```

- [ ] **Step 4: Testar manualmente**

Abrir o app participante na seção da Copa. Verificar:
- Botão "Regras" aparece abaixo do badge "EM BREVE"
- Clicar abre o bottom-sheet com animação slide-up
- Clicar no overlay fecha o modal
- Clicar no X fecha o modal
- Rolar conteúdo dentro do modal funciona
- Dark mode OK

- [ ] **Step 5: Commit**

```bash
git add public/participante/fronts/copa-times-sc.html public/participante/css/copa-sc.css
git commit -m "feat(copa-sc): botão Regras + modal estático no teaser"
```

---

## Task 2: Models — CopaSCConfig e CopaSCMatch

**Files:**
- Create: `models/CopaSCConfig.js`
- Create: `models/CopaSCMatch.js`

- [ ] **Step 1: Criar `models/CopaSCConfig.js`**

```javascript
import mongoose from 'mongoose';
import { CURRENT_SEASON } from '../config/seasons.js';

const standingSchema = new mongoose.Schema({
    participante_id: { type: mongoose.Schema.Types.ObjectId, required: true },
    pontos: { type: Number, default: 0 },
    jogos: { type: Number, default: 0 },
    vitorias: { type: Number, default: 0 },
    empates: { type: Number, default: 0 },
    derrotas: { type: Number, default: 0 },
    pontos_marcados: { type: Number, default: 0 },
    pontos_sofridos: { type: Number, default: 0 },
    saldo: { type: Number, default: 0 }
}, { _id: false });

const grupoSchema = new mongoose.Schema({
    nome: { type: String, required: true },
    times: [{ type: mongoose.Schema.Types.ObjectId }],
    standings: [standingSchema]
}, { _id: false });

const CopaSCConfigSchema = new mongoose.Schema({
    liga_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Liga',
        required: true,
        index: true
    },
    temporada: {
        type: Number,
        required: true,
        default: CURRENT_SEASON,
        index: true
    },
    status: {
        type: String,
        enum: [
            'pre_sorteio', 'classificatorio', 'grupos',
            'oitavas', 'quartas', 'semis',
            'terceiro_lugar', 'final', 'encerrado'
        ],
        default: 'pre_sorteio'
    },
    cabecas_de_chave: [{ type: mongoose.Schema.Types.ObjectId }],
    grupos: [grupoSchema],
    calendario: {
        classificatorio: { type: [Number], default: [20, 21, 22, 23] },
        grupos:          { type: [Number], default: [24, 25, 26] },
        oitavas:         { type: [Number], default: [27, 28] },
        quartas:         { type: [Number], default: [29, 30] },
        semis:           { type: [Number], default: [31, 32] },
        terceiro_lugar:  { type: [Number], default: [33, 34] },
        final:           { type: [Number], default: [33, 34] }
    },
    premiacao: {
        campeao:  { type: Number, default: 0 },
        vice:     { type: Number, default: 0 },
        terceiro: { type: Number, default: 0 }
    },
    sorteio_realizado_em: { type: Date, default: null },
    encerrado_em: { type: Date, default: null }
}, {
    timestamps: { createdAt: 'criado_em', updatedAt: 'atualizado_em' },
    collection: 'copascconfigs'
});

CopaSCConfigSchema.index({ liga_id: 1, temporada: 1 }, { unique: true });

const CopaSCConfig = mongoose.model('CopaSCConfig', CopaSCConfigSchema);
export default CopaSCConfig;
```

- [ ] **Step 2: Criar `models/CopaSCMatch.js`**

```javascript
import mongoose from 'mongoose';
import { CURRENT_SEASON } from '../config/seasons.js';

const CopaSCMatchSchema = new mongoose.Schema({
    liga_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Liga',
        required: true,
        index: true
    },
    temporada: {
        type: Number,
        required: true,
        default: CURRENT_SEASON,
        index: true
    },
    fase: {
        type: String,
        enum: ['classificatorio', 'grupos', 'oitavas', 'quartas', 'semis', 'terceiro_lugar', 'final'],
        required: true,
        index: true
    },
    rodadas_cartola: [{ type: Number }],
    grupo: { type: String, default: null },
    confronto_num: { type: Number, default: 1 },
    jornada: { type: Number, default: null },
    mandante_id: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    visitante_id: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    pontos: {
        mandante:  { type: [Number], default: [] },
        visitante: { type: [Number], default: [] }
    },
    total: {
        mandante:  { type: Number, default: 0 },
        visitante: { type: Number, default: 0 }
    },
    vencedor_id: { type: mongoose.Schema.Types.ObjectId, default: null },
    status: {
        type: String,
        enum: ['agendado', 'em_andamento', 'finalizado'],
        default: 'agendado',
        index: true
    }
}, {
    timestamps: { createdAt: 'criado_em', updatedAt: 'atualizado_em' },
    collection: 'copascmatches'
});

CopaSCMatchSchema.index({ liga_id: 1, temporada: 1, fase: 1 });
CopaSCMatchSchema.index({ liga_id: 1, temporada: 1, status: 1 });

const CopaSCMatch = mongoose.model('CopaSCMatch', CopaSCMatchSchema);
export default CopaSCMatch;
```

- [ ] **Step 3: Verificar importações**

```bash
node --input-type=module <<'EOF'
import './models/CopaSCConfig.js';
import './models/CopaSCMatch.js';
console.log('Models OK');
EOF
```

Expected: `Models OK`

- [ ] **Step 4: Commit**

```bash
git add models/CopaSCConfig.js models/CopaSCMatch.js
git commit -m "feat(copa-sc): models CopaSCConfig e CopaSCMatch"
```

---

## Task 3: Copa SC Service (lógica de negócio)

**Files:**
- Create: `services/copaSCService.js`

### Contexto
Toda a lógica de negócio: sorteio, cálculo de standings, geração de chaveamento, desempate por Ranking Geral, premiação financeira. Ranking Geral é buscado via `RankingGeral` model.

- [ ] **Step 1: Criar `services/copaSCService.js`**

```javascript
import mongoose from 'mongoose';
import CopaSCConfig from '../models/CopaSCConfig.js';
import CopaSCMatch from '../models/CopaSCMatch.js';
import RankingGeral from '../models/RankingGeral.js';
import AjusteFinanceiro from '../models/AjusteFinanceiro.js';
import { invalidarExtratoCache } from './extratoService.js';
import { CURRENT_SEASON } from '../config/seasons.js';

// =============================================================================
// HELPERS
// =============================================================================

function _shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

async function _getRankingMap(ligaId, temporada) {
    const rankings = await RankingGeral.find({ liga_id: ligaId, temporada }).lean();
    const map = new Map();
    rankings.forEach(r => map.set(r.participante_id.toString(), r.posicao));
    return map;
}

function _desempatePorRanking(idA, idB, rankingMap) {
    const posA = rankingMap.get(idA.toString()) ?? 9999;
    const posB = rankingMap.get(idB.toString()) ?? 9999;
    return posA - posB;
}

// =============================================================================
// SORTEIO DOS GRUPOS
// =============================================================================

/**
 * Realiza o sorteio dos 8 grupos com cabeças-de-chave.
 * Idempotente: retorna 409 se já realizado.
 */
export async function realizarSorteio(ligaId, temporada = CURRENT_SEASON) {
    const config = await CopaSCConfig.findOne({ liga_id: ligaId, temporada }).lean();
    if (!config) throw { status: 404, message: 'Copa SC não configurada para esta liga.' };
    if (config.sorteio_realizado_em) throw { status: 409, message: 'Sorteio já realizado.' };

    const classificatorioFinalizado = await CopaSCMatch.countDocuments({
        liga_id: ligaId, temporada, fase: 'classificatorio', status: 'finalizado'
    });
    if (classificatorioFinalizado < 2) throw { status: 400, message: 'Fase Classificatória ainda não concluída.' };

    const rankingMap = await _getRankingMap(ligaId, temporada);
    const cabecas = [...config.cabecas_de_chave];
    const todos = await _getClassificados32(ligaId, temporada);

    const restantes = _shuffleArray(
        todos.filter(id => !cabecas.some(c => c.toString() === id.toString()))
    );

    const nomeGrupos = ['A','B','C','D','E','F','G','H'];
    const grupos = nomeGrupos.map((nome, i) => ({
        nome,
        times: [cabecas[i]],
        standings: [{ participante_id: cabecas[i], pontos: 0, jogos: 0, vitorias: 0, empates: 0, derrotas: 0, pontos_marcados: 0, pontos_sofridos: 0, saldo: 0 }]
    }));

    let grupoIdx = 0;
    for (const timeId of restantes) {
        grupos[grupoIdx].times.push(timeId);
        grupos[grupoIdx].standings.push({ participante_id: timeId, pontos: 0, jogos: 0, vitorias: 0, empates: 0, derrotas: 0, pontos_marcados: 0, pontos_sofridos: 0, saldo: 0 });
        grupoIdx = (grupoIdx + 1) % 8;
    }

    // Gerar confrontos da fase de grupos (round-robin 4 times × 3 jornadas)
    const rodadas = config.calendario.grupos;
    // Jornadas fixas para 4 times: [0v3,1v2], [0v2,3v1], [0v1,2v3]
    const jornadasTemplate = [
        [[0,3],[1,2]],
        [[0,2],[3,1]],
        [[0,1],[2,3]]
    ];

    const matchesDraft = [];
    for (const grupo of grupos) {
        const t = grupo.times;
        jornadasTemplate.forEach(([par1, par2], jIdx) => {
            [par1, par2].forEach(([a, b]) => {
                matchesDraft.push({
                    liga_id: ligaId,
                    temporada,
                    fase: 'grupos',
                    rodadas_cartola: [rodadas[jIdx]],
                    grupo: grupo.nome,
                    confronto_num: jIdx + 1,
                    jornada: jIdx + 1,
                    mandante_id: t[a],
                    visitante_id: t[b],
                    pontos: { mandante: [], visitante: [] },
                    total: { mandante: 0, visitante: 0 },
                    vencedor_id: null,
                    status: 'agendado'
                });
            });
        });
    }

    await CopaSCMatch.insertMany(matchesDraft);
    await CopaSCConfig.updateOne(
        { liga_id: ligaId, temporada },
        { $set: { grupos, sorteio_realizado_em: new Date(), status: 'grupos' } }
    );

    return { message: 'Sorteio realizado com sucesso.', grupos };
}

async function _getClassificados32(ligaId, temporada) {
    // Busca IDs dos 32 classificados: 31 diretos + 1 sobrevivente da classificatória
    const config = await CopaSCConfig.findOne({ liga_id: ligaId, temporada }).lean();
    const sobreviventesIds = new Set();
    const matches = await CopaSCMatch.find({ liga_id: ligaId, temporada, fase: 'classificatorio' }).lean();
    matches.forEach(m => { if (m.vencedor_id) sobreviventesIds.add(m.vencedor_id.toString()); });

    const todos32 = [...config.cabecas_de_chave, ...sobreviventesIds].slice(0, 32);
    return todos32.map(id => new mongoose.Types.ObjectId(id));
}

// =============================================================================
// STANDINGS DE GRUPO
// =============================================================================

/**
 * Atualiza standings de um grupo após processamento de confronto.
 */
export async function atualizarStandingsGrupo(ligaId, temporada, grupoNome) {
    const config = await CopaSCConfig.findOne({ liga_id: ligaId, temporada });
    if (!config) return;

    const grupo = config.grupos.find(g => g.nome === grupoNome);
    if (!grupo) return;

    const matches = await CopaSCMatch.find({
        liga_id: ligaId, temporada, fase: 'grupos', grupo: grupoNome, status: 'finalizado'
    }).lean();

    // Reset standings
    grupo.standings.forEach(s => {
        Object.assign(s, { pontos: 0, jogos: 0, vitorias: 0, empates: 0, derrotas: 0, pontos_marcados: 0, pontos_sofridos: 0, saldo: 0 });
    });

    const findStanding = (pid) => grupo.standings.find(s => s.participante_id.toString() === pid.toString());

    for (const m of matches) {
        const sm = findStanding(m.mandante_id);
        const sv = findStanding(m.visitante_id);
        if (!sm || !sv) continue;

        sm.jogos++; sv.jogos++;
        sm.pontos_marcados += m.total.mandante;
        sv.pontos_marcados += m.total.visitante;
        sm.pontos_sofridos += m.total.visitante;
        sv.pontos_sofridos += m.total.mandante;

        if (m.total.mandante > m.total.visitante) {
            sm.pontos += 3; sm.vitorias++;
            sv.derrotas++;
        } else if (m.total.visitante > m.total.mandante) {
            sv.pontos += 3; sv.vitorias++;
            sm.derrotas++;
        } else {
            sm.pontos += 1; sm.empates++;
            sv.pontos += 1; sv.empates++;
        }
    }

    grupo.standings.forEach(s => { s.saldo = s.pontos_marcados - s.pontos_sofridos; });

    await config.save();
}

// =============================================================================
// CLASSIFICADOS DOS GRUPOS
// =============================================================================

/**
 * Retorna os 2 primeiros classificados de cada grupo com desempate por Ranking Geral.
 */
export async function getClassificadosGrupos(ligaId, temporada) {
    const config = await CopaSCConfig.findOne({ liga_id: ligaId, temporada }).lean();
    const rankingMap = await _getRankingMap(ligaId, temporada);

    return config.grupos.map(grupo => {
        const sorted = [...grupo.standings].sort((a, b) => {
            if (a.pontos !== b.pontos) return b.pontos - a.pontos;
            if (a.vitorias !== b.vitorias) return b.vitorias - a.vitorias;
            if (a.saldo !== b.saldo) return b.saldo - a.saldo;
            if (a.pontos_marcados !== b.pontos_marcados) return b.pontos_marcados - a.pontos_marcados;
            return _desempatePorRanking(a.participante_id, b.participante_id, rankingMap);
        });
        return { nome: grupo.nome, classificados: sorted.slice(0, 2), eliminados: sorted.slice(2) };
    });
}

// =============================================================================
// GERAÇÃO DE CONFRONTOS MATA-MATA
// =============================================================================

/**
 * Gera confrontos da fase oitavas a partir dos classificados dos grupos.
 * Chaveamento Copa do Mundo: 1A vs 2B, 1B vs 2A, etc.
 */
export async function gerarOitavas(ligaId, temporada) {
    const grupos = await getClassificadosGrupos(ligaId, temporada);
    const config = await CopaSCConfig.findOne({ liga_id: ligaId, temporada }).lean();
    const rodadas = config.calendario.oitavas;

    // Pares Copa do Mundo: A-B, C-D, E-F, G-H
    const pares = [['A','B'],['C','D'],['E','F'],['G','H']];
    const matches = [];
    let confrontoNum = 1;

    for (const [nomeA, nomeB] of pares) {
        const grupoA = grupos.find(g => g.nome === nomeA);
        const grupoB = grupos.find(g => g.nome === nomeB);
        const primeiro_A = grupoA.classificados[0].participante_id;
        const segundo_A = grupoA.classificados[1].participante_id;
        const primeiro_B = grupoB.classificados[0].participante_id;
        const segundo_B = grupoB.classificados[1].participante_id;

        matches.push(
            { liga_id: ligaId, temporada, fase: 'oitavas', rodadas_cartola: rodadas, grupo: null, confronto_num: confrontoNum++, mandante_id: primeiro_A, visitante_id: segundo_B, pontos: { mandante: [], visitante: [] }, total: { mandante: 0, visitante: 0 }, vencedor_id: null, status: 'agendado' },
            { liga_id: ligaId, temporada, fase: 'oitavas', rodadas_cartola: rodadas, grupo: null, confronto_num: confrontoNum++, mandante_id: primeiro_B, visitante_id: segundo_A, pontos: { mandante: [], visitante: [] }, total: { mandante: 0, visitante: 0 }, vencedor_id: null, status: 'agendado' }
        );
    }

    await CopaSCMatch.insertMany(matches);
    await CopaSCConfig.updateOne({ liga_id: ligaId, temporada }, { $set: { status: 'oitavas' } });
}

/**
 * Gera confrontos da próxima fase mata-mata com base nos vencedores da fase anterior.
 * faseAtual: 'oitavas' | 'quartas' | 'semis'
 * proximaFase: 'quartas' | 'semis' | 'terceiro_lugar'
 */
export async function gerarProximaFaseMM(ligaId, temporada, faseAtual, proximaFase) {
    const config = await CopaSCConfig.findOne({ liga_id: ligaId, temporada }).lean();
    const rankingMap = await _getRankingMap(ligaId, temporada);
    const matchesFase = await CopaSCMatch.find({ liga_id: ligaId, temporada, fase: faseAtual }).sort({ confronto_num: 1 }).lean();

    const vencedores = matchesFase.map(m => m.vencedor_id);
    const perdedores = matchesFase.map(m =>
        m.vencedor_id.toString() === m.mandante_id.toString() ? m.visitante_id : m.mandante_id
    );

    const rodadas = config.calendario[proximaFase] || config.calendario.terceiro_lugar;
    const matchesDraft = [];

    if (proximaFase === 'terceiro_lugar') {
        // 3° lugar: perdedores das semis
        matchesDraft.push({
            liga_id: ligaId, temporada, fase: 'terceiro_lugar',
            rodadas_cartola: config.calendario.terceiro_lugar,
            grupo: null, confronto_num: 1,
            mandante_id: perdedores[0], visitante_id: perdedores[1],
            pontos: { mandante: [], visitante: [] }, total: { mandante: 0, visitante: 0 },
            vencedor_id: null, status: 'agendado'
        });
        // Final: vencedores das semis
        matchesDraft.push({
            liga_id: ligaId, temporada, fase: 'final',
            rodadas_cartola: config.calendario.final,
            grupo: null, confronto_num: 1,
            mandante_id: vencedores[0], visitante_id: vencedores[1],
            pontos: { mandante: [], visitante: [] }, total: { mandante: 0, visitante: 0 },
            vencedor_id: null, status: 'agendado'
        });
        await CopaSCMatch.insertMany(matchesDraft);
        await CopaSCConfig.updateOne({ liga_id: ligaId, temporada }, { $set: { status: 'terceiro_lugar' } });
        return;
    }

    for (let i = 0; i < vencedores.length; i += 2) {
        matchesDraft.push({
            liga_id: ligaId, temporada, fase: proximaFase,
            rodadas_cartola: rodadas, grupo: null, confronto_num: Math.floor(i / 2) + 1,
            mandante_id: vencedores[i], visitante_id: vencedores[i + 1],
            pontos: { mandante: [], visitante: [] }, total: { mandante: 0, visitante: 0 },
            vencedor_id: null, status: 'agendado'
        });
    }
    await CopaSCMatch.insertMany(matchesDraft);
    await CopaSCConfig.updateOne({ liga_id: ligaId, temporada }, { $set: { status: proximaFase } });
}

// =============================================================================
// PREMIAÇÃO FINANCEIRA
// =============================================================================

export async function aplicarPremiacao(ligaId, temporada) {
    const config = await CopaSCConfig.findOne({ liga_id: ligaId, temporada }).lean();
    const { campeao: vCampeao, vice: vVice, terceiro: vTerceiro } = config.premiacao;

    const final = await CopaSCMatch.findOne({ liga_id: ligaId, temporada, fase: 'final', status: 'finalizado' }).lean();
    const terceiroLugar = await CopaSCMatch.findOne({ liga_id: ligaId, temporada, fase: 'terceiro_lugar', status: 'finalizado' }).lean();

    if (!final || !terceiroLugar) return;

    const campeaoId = final.vencedor_id;
    const viceId = campeaoId.toString() === final.mandante_id.toString() ? final.visitante_id : final.mandante_id;
    const terceiroId = terceiroLugar.vencedor_id;

    const premios = [
        { participante_id: campeaoId, valor: vCampeao, descricao: 'Copa SC — Campeão' },
        { participante_id: viceId, valor: vVice, descricao: 'Copa SC — Vice-Campeão' },
        { participante_id: terceiroId, valor: vTerceiro, descricao: 'Copa SC — 3° Lugar' }
    ];

    for (const { participante_id, valor, descricao } of premios) {
        if (!valor || valor <= 0) continue;
        const chave = `copa_sc_${ligaId}_${temporada}_${participante_id}`;
        await AjusteFinanceiro.criar({
            liga_id: ligaId,
            temporada,
            participante_id,
            tipo: 'AJUSTE',
            rodada: null,
            valor,
            descricao,
            chaveIdempotencia: chave
        });
        await invalidarExtratoCache(ligaId, participante_id.toString());
    }

    await CopaSCConfig.updateOne(
        { liga_id: ligaId, temporada },
        { $set: { status: 'encerrado', encerrado_em: new Date() } }
    );
}
```

- [ ] **Step 2: Verificar sintaxe**

```bash
node --input-type=module --eval "import './services/copaSCService.js'; console.log('Service OK');" 2>&1 | head -20
```

Expected: `Service OK` (erros de conexão MongoDB são aceitáveis em dev sem DB)

- [ ] **Step 3: Commit**

```bash
git add services/copaSCService.js
git commit -m "feat(copa-sc): service com sorteio, standings, bracket e premiação"
```

---

## Task 4: Copa SC Processor Service (job pós-rodada)

**Files:**
- Create: `services/copaSCProcessorService.js`

### Contexto
Processa cada rodada do Cartola: atualiza pontos dos confrontos ativos, finaliza confrontos completos, avança fases automaticamente, aciona premiação ao final.

- [ ] **Step 1: Criar `services/copaSCProcessorService.js`**

```javascript
import CopaSCConfig from '../models/CopaSCConfig.js';
import CopaSCMatch from '../models/CopaSCMatch.js';
import RankingGeral from '../models/RankingGeral.js';
import {
    atualizarStandingsGrupo,
    getClassificadosGrupos,
    gerarOitavas,
    gerarProximaFaseMM,
    aplicarPremiacao
} from './copaSCService.js';
import { CURRENT_SEASON } from '../config/seasons.js';

const PROXIMA_FASE = {
    oitavas:  'quartas',
    quartas:  'semis',
    semis:    'terceiro_lugar'
};

async function _getPontosParticipante(ligaId, temporada, rodada, participanteId) {
    const rg = await RankingGeral.findOne({
        liga_id: ligaId, temporada, participante_id: participanteId, rodada_num: rodada
    }).lean();
    return rg?.pontos_rodada ?? 0;
}

export async function processarRodada(rodada, ligaId, temporada = CURRENT_SEASON) {
    const config = await CopaSCConfig.findOne({ liga_id: ligaId, temporada }).lean();
    if (!config || config.status === 'encerrado' || config.status === 'pre_sorteio') return;

    // Buscar confrontos onde esta rodada está incluída e ainda não finalizados
    const confrontosAtivos = await CopaSCMatch.find({
        liga_id: ligaId,
        temporada,
        rodadas_cartola: rodada,
        status: { $in: ['agendado', 'em_andamento'] }
    });

    for (const confronto of confrontosAtivos) {
        const idxRodada = confronto.rodadas_cartola.indexOf(rodada);
        const ptsMandante = await _getPontosParticipante(ligaId, temporada, rodada, confronto.mandante_id);
        const ptsVisitante = await _getPontosParticipante(ligaId, temporada, rodada, confronto.visitante_id);

        confronto.pontos.mandante[idxRodada] = ptsMandante;
        confronto.pontos.visitante[idxRodada] = ptsVisitante;
        confronto.total.mandante = confronto.pontos.mandante.reduce((s, v) => s + (v ?? 0), 0);
        confronto.total.visitante = confronto.pontos.visitante.reduce((s, v) => s + (v ?? 0), 0);
        confronto.status = 'em_andamento';

        // Verificar se todas as rodadas do confronto foram processadas
        const todasProcessadas = confronto.rodadas_cartola.every((r, i) =>
            confronto.pontos.mandante[i] !== undefined && confronto.pontos.mandante[i] !== null
        );

        if (todasProcessadas) {
            if (confronto.total.mandante !== confronto.total.visitante) {
                confronto.vencedor_id = confronto.total.mandante > confronto.total.visitante
                    ? confronto.mandante_id : confronto.visitante_id;
            } else {
                // Desempate por Ranking Geral
                const rankingM = await RankingGeral.findOne({ liga_id: ligaId, temporada, participante_id: confronto.mandante_id }).lean();
                const rankingV = await RankingGeral.findOne({ liga_id: ligaId, temporada, participante_id: confronto.visitante_id }).lean();
                const posM = rankingM?.posicao ?? 9999;
                const posV = rankingV?.posicao ?? 9999;
                confronto.vencedor_id = posM <= posV ? confronto.mandante_id : confronto.visitante_id;
            }
            confronto.status = 'finalizado';
        }

        await confronto.save();
    }

    // Verificar se fase atual foi totalmente concluída
    await _verificarAvancamentoDeFase(ligaId, temporada, config.status);
}

async function _verificarAvancamentoDeFase(ligaId, temporada, status) {
    if (status === 'classificatorio') {
        await _verificarClassificatorio(ligaId, temporada);
    } else if (status === 'grupos') {
        await _verificarGrupos(ligaId, temporada);
    } else if (['oitavas', 'quartas', 'semis'].includes(status)) {
        await _verificarMataMata(ligaId, temporada, status);
    } else if (status === 'terceiro_lugar' || status === 'final') {
        await _verificarFinal(ligaId, temporada);
    }
}

async function _verificarClassificatorio(ligaId, temporada) {
    const total = await CopaSCMatch.countDocuments({ liga_id: ligaId, temporada, fase: 'classificatorio' });
    const finalizados = await CopaSCMatch.countDocuments({ liga_id: ligaId, temporada, fase: 'classificatorio', status: 'finalizado' });
    if (total > 0 && total === finalizados) {
        // Classificatória concluída — admin dispara sorteio manualmente (spec §2.3)
        console.log(`[CopaSC] Classificatória concluída para liga ${ligaId}. Aguardando sorteio admin.`);
    }
}

async function _verificarGrupos(ligaId, temporada) {
    const totalGrupos = 8 * 3 * 2; // 8 grupos × 3 jornadas × 2 confrontos = 48
    const finalizados = await CopaSCMatch.countDocuments({ liga_id: ligaId, temporada, fase: 'grupos', status: 'finalizado' });
    if (finalizados < totalGrupos) return;

    // Atualizar standings de todos os grupos
    const config = await CopaSCConfig.findOne({ liga_id: ligaId, temporada }).lean();
    for (const grupo of config.grupos) {
        await atualizarStandingsGrupo(ligaId, temporada, grupo.nome);
    }

    await gerarOitavas(ligaId, temporada);
}

async function _verificarMataMata(ligaId, temporada, faseAtual) {
    const totalEsperado = { oitavas: 8, quartas: 4, semis: 2 }[faseAtual];
    const finalizados = await CopaSCMatch.countDocuments({ liga_id: ligaId, temporada, fase: faseAtual, status: 'finalizado' });
    if (finalizados < totalEsperado) return;

    const proximaFase = PROXIMA_FASE[faseAtual];
    await gerarProximaFaseMM(ligaId, temporada, faseAtual, proximaFase);
}

async function _verificarFinal(ligaId, temporada) {
    const finalFinalizado = await CopaSCMatch.countDocuments({ liga_id: ligaId, temporada, fase: 'final', status: 'finalizado' });
    const terceiroFinalizado = await CopaSCMatch.countDocuments({ liga_id: ligaId, temporada, fase: 'terceiro_lugar', status: 'finalizado' });
    if (finalFinalizado >= 1 && terceiroFinalizado >= 1) {
        await aplicarPremiacao(ligaId, temporada);
    }
}
```

- [ ] **Step 2: Verificar sintaxe**

```bash
node --input-type=module --eval "import './services/copaSCProcessorService.js'; console.log('Processor OK');" 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add services/copaSCProcessorService.js
git commit -m "feat(copa-sc): processor service para job pós-rodada"
```

---

## Task 5: CopaSCManager + Orchestrator

**Files:**
- Create: `services/orchestrator/managers/CopaSCManager.js`
- Modify: `services/orchestrator/managers/index.js`

### Contexto
Manager integrado ao orchestrator existente. Prioridade 75 (após RestaUmManager=72, antes de ExtratoManager=80). Só executa se módulo copa_sc ativo na liga.

- [ ] **Step 1: Criar `services/orchestrator/managers/CopaSCManager.js`**

```javascript
import BaseManager from './BaseManager.js';
import { processarRodada } from '../../copaSCProcessorService.js';

export default class CopaSCManager extends BaseManager {
    constructor() {
        super({
            id: 'copa_sc',
            nome: 'Copa de Times SC',
            moduloKey: 'copa_sc',
            sempreAtivo: false,
            dependencias: ['ranking_geral'],
            prioridade: 75,
            temColeta: false,
            temFinanceiro: true
        });
    }

    async onConsolidate(ctx) {
        const { rodada, liga, temporada } = ctx;
        const ligaId = liga._id;

        try {
            await processarRodada(rodada, ligaId, temporada);
            this.log(`Copa SC processada — liga ${ligaId} rodada ${rodada}`);
        } catch (err) {
            this.logError(`Erro ao processar Copa SC — liga ${ligaId}:`, err);
        }
    }
}
```

- [ ] **Step 2: Registrar no `services/orchestrator/managers/index.js`**

Adicionar import após os imports existentes:

```javascript
import CopaSCManager from './CopaSCManager.js';
```

Adicionar instância no array `managers` em `criarManagers()`, após `new RestaUmManager()`:

```javascript
new CopaSCManager(),       // 75 - Copa de Times SC
```

- [ ] **Step 3: Verificar sintaxe**

```bash
node --input-type=module --eval "import './services/orchestrator/managers/index.js'; console.log('Managers OK');" 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add services/orchestrator/managers/CopaSCManager.js services/orchestrator/managers/index.js
git commit -m "feat(copa-sc): CopaSCManager integrado ao orchestrator (prioridade 75)"
```

---

## Task 6: Controller + Routes

**Files:**
- Create: `controllers/copaSCController.js`
- Create: `routes/copa-sc-routes.js`

- [ ] **Step 1: Criar `controllers/copaSCController.js`**

```javascript
import CopaSCConfig from '../models/CopaSCConfig.js';
import CopaSCMatch from '../models/CopaSCMatch.js';
import { realizarSorteio, getClassificadosGrupos, aplicarPremiacao } from '../services/copaSCService.js';
import { processarRodada } from '../services/copaSCProcessorService.js';
import { CURRENT_SEASON } from '../config/seasons.js';

function ligaId(req) { return req.params.ligaId; }
function temp(req) { return Number(req.query.temporada) || CURRENT_SEASON; }

export async function getConfig(req, res) {
    try {
        const config = await CopaSCConfig.findOne({ liga_id: ligaId(req), temporada: temp(req) }).lean();
        if (!config) return res.status(404).json({ erro: 'Copa SC não configurada.' });
        res.json(config);
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
}

export async function getGrupos(req, res) {
    try {
        const config = await CopaSCConfig.findOne({ liga_id: ligaId(req), temporada: temp(req) }).lean();
        if (!config) return res.status(404).json({ erro: 'Copa SC não configurada.' });
        res.json({ grupos: config.grupos });
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
}

export async function getBracket(req, res) {
    try {
        const fasesMM = ['oitavas', 'quartas', 'semis', 'terceiro_lugar', 'final'];
        const matches = await CopaSCMatch.find({
            liga_id: ligaId(req), temporada: temp(req), fase: { $in: fasesMM }
        }).sort({ fase: 1, confronto_num: 1 }).lean();
        res.json({ matches });
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
}

export async function getClassificatorio(req, res) {
    try {
        const matches = await CopaSCMatch.find({
            liga_id: ligaId(req), temporada: temp(req), fase: 'classificatorio'
        }).sort({ confronto_num: 1 }).lean();
        res.json({ matches });
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
}

export async function getMinhaCopa(req, res) {
    try {
        const { participanteId } = req.params;
        const config = await CopaSCConfig.findOne({ liga_id: ligaId(req), temporada: temp(req) }).lean();
        if (!config) return res.status(404).json({ erro: 'Copa SC não configurada.' });

        const matches = await CopaSCMatch.find({
            liga_id: ligaId(req), temporada: temp(req),
            $or: [{ mandante_id: participanteId }, { visitante_id: participanteId }]
        }).lean();

        res.json({ config, matches });
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
}

// ---- ADMIN ----

export async function adminConfigurar(req, res) {
    try {
        const { premiacao, calendario, cabecas_de_chave } = req.body;
        await CopaSCConfig.findOneAndUpdate(
            { liga_id: ligaId(req), temporada: temp(req) },
            { $set: { premiacao, calendario, cabecas_de_chave } },
            { upsert: true, new: true, runValidators: true }
        );
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
}

export async function adminSortear(req, res) {
    try {
        const result = await realizarSorteio(ligaId(req), temp(req));
        res.json(result);
    } catch (e) {
        const status = e.status || 500;
        res.status(status).json({ erro: e.message });
    }
}

export async function adminProcessarRodada(req, res) {
    try {
        const rodada = Number(req.params.rodada);
        await processarRodada(rodada, ligaId(req), temp(req));
        res.json({ ok: true, rodada });
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
}
```

- [ ] **Step 2: Criar `routes/copa-sc-routes.js`**

```javascript
import express from 'express';
import { verificarParticipante, verificarAdmin } from '../middleware/auth.js';
import {
    getConfig, getGrupos, getBracket, getClassificatorio, getMinhaCopa,
    adminConfigurar, adminSortear, adminProcessarRodada
} from '../controllers/copaSCController.js';

const router = express.Router();

// Participante
router.get('/:ligaId/config',                      verificarParticipante, getConfig);
router.get('/:ligaId/grupos',                      verificarParticipante, getGrupos);
router.get('/:ligaId/bracket',                     verificarParticipante, getBracket);
router.get('/:ligaId/classificatorio',             verificarParticipante, getClassificatorio);
router.get('/:ligaId/minha-copa/:participanteId',  verificarParticipante, getMinhaCopa);

// Admin
router.post('/:ligaId/admin/configurar',           verificarAdmin, adminConfigurar);
router.post('/:ligaId/admin/sortear',              verificarAdmin, adminSortear);
router.post('/:ligaId/admin/processar/:rodada',    verificarAdmin, adminProcessarRodada);

export default router;
```

- [ ] **Step 3: Commit**

```bash
git add controllers/copaSCController.js routes/copa-sc-routes.js
git commit -m "feat(copa-sc): controller e rotas REST (5 participante + 3 admin)"
```

---

## Task 7: Integração com Módulos Existentes

**Files:**
- Modify: `models/Liga.js`
- Modify: `models/ModuleConfig.js`
- Modify: `config/definitions/index.js`
- Create: `config/definitions/copa_sc_def.json`
- Modify: `services/orchestrator/managers/index.js` *(já modificado na Task 5)*
- Modify: app routes file (buscar via grep)

### Contexto
Registrar `copa_sc` em todos os pontos de integração do sistema de módulos.

- [ ] **Step 1: Adicionar `copaSC: false` em `models/Liga.js`**

No objeto `modulos_ativos.default`, após `restaUm: false` (ou no final da lista de opcionais), adicionar:

```javascript
copaSC: false,
```

- [ ] **Step 2: Adicionar `'copa_sc'` em `models/ModuleConfig.js`**

No array `MODULOS_DISPONIVEIS`, adicionar `'copa_sc'`:

```javascript
export const MODULOS_DISPONIVEIS = [
    'extrato',
    'ranking_geral',
    'ranking_rodada',
    'pontos_corridos',
    'mata_mata',
    'top_10',
    'melhor_mes',
    'turno_returno',
    'luva_ouro',
    'artilheiro',
    'capitao_luxo',
    'raio_x',
    'resta_um',
    'copa_sc'   // ← adicionar
];
```

- [ ] **Step 3: Criar `config/definitions/copa_sc_def.json`**

```json
{
    "id": "copa_sc",
    "nome": "Copa de Times SC",
    "descricao": "Torneio eliminatório estilo Copa do Mundo com 32 times — grupos, oitavas, quartas, semis e final.",
    "versao": "1.0.0",
    "status": "ativo",
    "obrigatorio": false,
    "categoria": "copa",
    "restricoes": {
        "min_participantes": 32,
        "max_participantes": 35,
        "ideal_participantes": [35]
    },
    "parametros": [
        {
            "id": "premiacao_campeao",
            "label": "Prêmio Campeão (R$)",
            "tipo": "number",
            "default": 0,
            "min": 0
        },
        {
            "id": "premiacao_vice",
            "label": "Prêmio Vice (R$)",
            "tipo": "number",
            "default": 0,
            "min": 0
        },
        {
            "id": "premiacao_terceiro",
            "label": "Prêmio 3° Lugar (R$)",
            "tipo": "number",
            "default": 0,
            "min": 0
        }
    ]
}
```

- [ ] **Step 4: Registrar em `config/definitions/index.js`**

Adicionar import após os outros:

```javascript
export const copaSC = loadDefinition('copa_sc_def.json');
```

Adicionar em `allDefinitions`:

```javascript
copaSC,
```

Adicionar em `definitionsByCategory.confronto` (ou criar categoria `copa`):

```javascript
copa: [copaSC],
```

Adicionar em `getDefinitionById()`:

```javascript
'copa_sc': copaSC,
```

Atualizar o log no final de `index.js`:

```javascript
console.log('[DEFINITIONS] ✅ Camada de Definição carregada - 13 módulos disponíveis');
```

- [ ] **Step 5: Registrar rotas Copa SC na aplicação**

Buscar o arquivo de rotas principal:

```bash
grep -r "mata-mata-routes\|resta-um-routes" routes/ app.js server.js index.js 2>/dev/null | head -10
```

No arquivo encontrado, adicionar:

```javascript
import copaSCRoutes from './routes/copa-sc-routes.js';
// ...
app.use('/api/copa-sc', copaSCRoutes);
```

- [ ] **Step 6: Commit**

```bash
git add models/Liga.js models/ModuleConfig.js config/definitions/index.js config/definitions/copa_sc_def.json
git commit -m "feat(copa-sc): integração com sistema de módulos (Liga, ModuleConfig, definitions, rotas)"
```

---

## Task 8: Frontend — Módulo Completo (4 abas, pós-sorteio)

**Files:**
- Modify: `public/participante/js/modules/participante-copa-sc.js`
- Modify: `public/participante/fronts/copa-times-sc.html`
- Modify: `public/participante/css/copa-sc.css`

### Contexto
Após o sorteio ser realizado (status ≠ 'pre_sorteio'), o teaser é substituído pelo módulo completo com 4 abas: Minha Copa, Grupos, Chaveamento, Classificatória.
Toda string de API deve usar `_esc(str)`. Valores numéricos (pontos, ids) são seguros para interpolação direta.

- [ ] **Step 1: Criar helper XSS-safe no início do módulo JS**

Em `participante-copa-sc.js`, adicionar no topo:

```javascript
function _esc(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
}
```

- [ ] **Step 2: Substituir teaser pelo módulo quando Copa ativa**

No método de inicialização do módulo, checar o status da Copa e renderizar condicionalmente:

```javascript
async function inicializarCopa(ligaId, participanteId) {
    try {
        const resp = await fetch(`/api/copa-sc/${ligaId}/config`);
        if (!resp.ok) { renderTeaser(); return; }
        const config = await resp.json();

        if (config.status === 'pre_sorteio') {
            renderTeaser();
        } else {
            renderModuloCompleto(config, ligaId, participanteId);
        }
    } catch (e) {
        renderTeaser();
    }
}

function renderTeaser() {
    // mantém o HTML existente do teaser — não faz nada
}
```

- [ ] **Step 3: Renderizar estrutura das 4 abas**

```javascript
function renderModuloCompleto(config, ligaId, participanteId) {
    const container = document.getElementById('copa-sc-container');
    if (!container) return;

    container.innerHTML = `
        <div class="copa-module-strip">
            <span class="material-icons copa-strip-icon">emoji_events</span>
            <span class="copa-strip-title">Copa de Times SC</span>
            <span class="copa-strip-badge">${_esc(config.status.replace(/_/g,' ').toUpperCase())}</span>
        </div>
        <div class="copa-tabs" role="tablist">
            <button class="copa-tab ativo" data-tab="minha-copa" role="tab">Minha Copa</button>
            <button class="copa-tab" data-tab="grupos" role="tab">Grupos</button>
            <button class="copa-tab" data-tab="chaveamento" role="tab">Chaveamento</button>
            <button class="copa-tab" data-tab="classificatorio" role="tab">Classificatória</button>
        </div>
        <div id="copa-tab-content" class="copa-tab-content"></div>
    `;

    container.querySelectorAll('.copa-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            container.querySelectorAll('.copa-tab').forEach(b => b.classList.remove('ativo'));
            btn.classList.add('ativo');
            carregarAba(btn.dataset.tab, ligaId, participanteId);
        });
    });

    carregarAba('minha-copa', ligaId, participanteId);
}
```

- [ ] **Step 4: Implementar aba Minha Copa**

```javascript
async function renderAbaMinhaCopa(ligaId, participanteId) {
    const content = document.getElementById('copa-tab-content');
    content.innerHTML = '<div class="copa-loading"><span class="material-icons rotating">autorenew</span></div>';

    const resp = await fetch(`/api/copa-sc/${ligaId}/minha-copa/${participanteId}`);
    const { config, matches } = await resp.json();

    const proximo = matches.find(m => m.status !== 'finalizado');
    const historico = matches.filter(m => m.status === 'finalizado');

    content.innerHTML = `
        <div class="copa-minha-copa">
            <div class="copa-card">
                <h4 class="copa-card-title"><span class="material-icons">sports_soccer</span> Próximo Adversário</h4>
                ${proximo ? renderConfrontoCard(proximo, participanteId) : '<p class="copa-empty">Nenhum confronto agendado.</p>'}
            </div>
            <div class="copa-card">
                <h4 class="copa-card-title"><span class="material-icons">history</span> Histórico</h4>
                ${historico.length ? historico.map(m => renderConfrontoCard(m, participanteId)).join('') : '<p class="copa-empty">Nenhum confronto disputado ainda.</p>'}
            </div>
        </div>
    `;
}

function renderConfrontoCard(match, participanteId) {
    const isMandante = match.mandante_id === participanteId;
    const fase = _esc(match.fase.replace(/_/g, ' '));
    const rodadas = match.rodadas_cartola.join(' e ');
    const statusClass = match.status === 'finalizado' ? (match.vencedor_id === participanteId ? 'vitoria' : 'derrota') : 'agendado';

    return `
        <div class="copa-confronto-card copa-status-${_esc(statusClass)}">
            <span class="copa-confronto-fase">${fase} · Rod. ${rodadas}</span>
            <div class="copa-confronto-placar">
                <span>${match.total.mandante}</span>
                <span class="copa-confronto-vs">×</span>
                <span>${match.total.visitante}</span>
            </div>
        </div>
    `;
}
```

- [ ] **Step 5: Implementar aba Grupos**

```javascript
async function renderAbaGrupos(ligaId) {
    const content = document.getElementById('copa-tab-content');
    content.innerHTML = '<div class="copa-loading"><span class="material-icons rotating">autorenew</span></div>';

    const resp = await fetch(`/api/copa-sc/${ligaId}/grupos`);
    const { grupos } = await resp.json();

    content.innerHTML = `
        <div class="copa-grupos-grid">
            ${grupos.map(g => renderGrupoCard(g)).join('')}
        </div>
    `;
}

function renderGrupoCard(grupo) {
    const rows = grupo.standings.map((s, i) => `
        <tr class="${i < 2 ? 'copa-classificado' : ''}">
            <td>${i + 1}</td>
            <td class="copa-nome">${_esc(s.nome || '—')}</td>
            <td>${s.jogos}</td>
            <td>${s.pontos}</td>
            <td>${s.vitorias}</td>
            <td>${s.saldo > 0 ? '+' : ''}${s.saldo}</td>
        </tr>
    `).join('');

    return `
        <div class="copa-grupo-card">
            <h5 class="copa-grupo-nome">Grupo ${_esc(grupo.nome)}</h5>
            <table class="copa-standings-table">
                <thead>
                    <tr><th>#</th><th>Time</th><th>J</th><th>Pts</th><th>V</th><th>Saldo</th></tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    `;
}
```

- [ ] **Step 6: Implementar aba Chaveamento**

```javascript
async function renderAbaChaveamento(ligaId) {
    const content = document.getElementById('copa-tab-content');
    content.innerHTML = '<div class="copa-loading"><span class="material-icons rotating">autorenew</span></div>';

    const resp = await fetch(`/api/copa-sc/${ligaId}/bracket`);
    const { matches } = await resp.json();

    const fases = ['oitavas', 'quartas', 'semis', 'terceiro_lugar', 'final'];
    const nomes = { oitavas: 'Oitavas', quartas: 'Quartas', semis: 'Semifinais', terceiro_lugar: '3° Lugar', final: 'Final' };

    content.innerHTML = `
        <div class="copa-bracket">
            ${fases.map(f => {
                const fase = matches.filter(m => m.fase === f);
                if (!fase.length) return '';
                return `
                    <div class="copa-bracket-fase">
                        <h5 class="copa-bracket-fase-nome">${_esc(nomes[f])}</h5>
                        ${fase.map(m => `
                            <div class="copa-bracket-match copa-status-${_esc(m.status)}">
                                <div class="copa-bracket-time ${m.vencedor_id === m.mandante_id ? 'vencedor' : ''}">${_esc(m.mandante_nome || '?')} <strong>${m.total.mandante}</strong></div>
                                <div class="copa-bracket-time ${m.vencedor_id === m.visitante_id ? 'vencedor' : ''}">${_esc(m.visitante_nome || '?')} <strong>${m.total.visitante}</strong></div>
                            </div>
                        `).join('')}
                    </div>
                `;
            }).join('')}
        </div>
    `;
}
```

- [ ] **Step 7: Implementar aba Classificatória**

```javascript
async function renderAbaClassificatorio(ligaId) {
    const content = document.getElementById('copa-tab-content');
    content.innerHTML = '<div class="copa-loading"><span class="material-icons rotating">autorenew</span></div>';

    const resp = await fetch(`/api/copa-sc/${ligaId}/classificatorio`);
    const { matches } = await resp.json();

    content.innerHTML = `
        <div class="copa-classificatorio">
            <p class="copa-classificatorio-desc">Os times 33°, 34° e 35° do Pontos Corridos disputam 2 confrontos eliminatórios para garantir uma vaga nos grupos.</p>
            ${matches.map((m, i) => `
                <div class="copa-card">
                    <h5 class="copa-card-title">Confronto ${i + 1} — Rod. ${m.rodadas_cartola.join(' e ')}</h5>
                    <div class="copa-confronto-placar">
                        <div>
                            <div class="copa-nome">${_esc(m.mandante_nome || '?')}</div>
                            <div class="copa-pts">${m.total.mandante}</div>
                        </div>
                        <span class="copa-confronto-vs">×</span>
                        <div>
                            <div class="copa-nome">${_esc(m.visitante_nome || '?')}</div>
                            <div class="copa-pts">${m.total.visitante}</div>
                        </div>
                    </div>
                    <p class="copa-status-badge copa-status-${_esc(m.status)}">${_esc(m.status)}</p>
                </div>
            `).join('')}
        </div>
    `;
}
```

- [ ] **Step 8: Roteador de abas**

```javascript
async function carregarAba(tab, ligaId, participanteId) {
    const map = {
        'minha-copa':     () => renderAbaMinhaCopa(ligaId, participanteId),
        'grupos':         () => renderAbaGrupos(ligaId),
        'chaveamento':    () => renderAbaChaveamento(ligaId),
        'classificatorio': () => renderAbaClassificatorio(ligaId)
    };
    if (map[tab]) await map[tab]();
}
```

- [ ] **Step 9: Adicionar estilos do módulo completo ao copa-sc.css**

Append ao final de `copa-sc.css`:

```css
/* ========================
   Module Strip
   ======================== */
.copa-module-strip {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-left: 4px solid var(--copa-gold, #d4af37);
  background: var(--bg-card, #1e1e2e);
  margin-bottom: 12px;
}
.copa-strip-icon { color: var(--copa-gold, #d4af37); }
.copa-strip-title { font-family: 'Russo One', sans-serif; font-size: 1rem; flex: 1; }
.copa-strip-badge {
  font-size: 0.65rem;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--copa-gold, #d4af37);
  color: #1a1a2e;
  letter-spacing: 0.05em;
}

/* ========================
   Tabs
   ======================== */
.copa-tabs {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  padding-bottom: 4px;
  margin-bottom: 12px;
  scrollbar-width: none;
}
.copa-tabs::-webkit-scrollbar { display: none; }
.copa-tab {
  flex: none;
  padding: 7px 14px;
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 20px;
  background: transparent;
  color: rgba(255,255,255,0.6);
  font-size: 0.78rem;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}
.copa-tab.ativo {
  background: var(--copa-gold, #d4af37);
  border-color: var(--copa-gold, #d4af37);
  color: #1a1a2e;
  font-weight: 700;
}

/* ========================
   Cards e Confrontos
   ======================== */
.copa-card {
  background: var(--bg-card, #1e1e2e);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 10px;
}
.copa-card-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--copa-gold, #d4af37);
  margin: 0 0 12px;
}
.copa-card-title .material-icons { font-size: 18px; }
.copa-empty { font-size: 0.8rem; color: rgba(255,255,255,0.4); margin: 0; }

.copa-confronto-card {
  border-radius: 8px;
  padding: 10px 14px;
  margin-bottom: 8px;
  border: 1px solid rgba(255,255,255,0.1);
}
.copa-confronto-fase { font-size: 0.72rem; color: rgba(255,255,255,0.5); text-transform: uppercase; }
.copa-confronto-placar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  font-size: 1.4rem;
  font-weight: 700;
  font-family: 'JetBrains Mono', monospace;
  margin-top: 6px;
}
.copa-confronto-vs { font-size: 0.9rem; color: rgba(255,255,255,0.4); }
.copa-status-vitoria { border-color: #4caf50; }
.copa-status-derrota { border-color: #f44336; }
.copa-status-agendado { border-color: rgba(255,255,255,0.15); }

/* ========================
   Grupos
   ======================== */
.copa-grupos-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}
.copa-grupo-card {
  background: var(--bg-card, #1e1e2e);
  border-radius: 12px;
  padding: 14px;
}
.copa-grupo-nome {
  font-family: 'Russo One', sans-serif;
  color: var(--copa-gold, #d4af37);
  font-size: 0.9rem;
  margin: 0 0 10px;
}
.copa-standings-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.78rem;
}
.copa-standings-table th, .copa-standings-table td {
  padding: 5px 6px;
  text-align: center;
}
.copa-standings-table th { color: rgba(255,255,255,0.4); font-weight: 600; }
.copa-standings-table .copa-nome { text-align: left; max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.copa-standings-table tr.copa-classificado td { color: var(--copa-gold, #d4af37); }

/* ========================
   Bracket / Chaveamento
   ======================== */
.copa-bracket {
  display: flex;
  gap: 16px;
  overflow-x: auto;
  padding-bottom: 8px;
}
.copa-bracket-fase {
  flex: none;
  min-width: 160px;
}
.copa-bracket-fase-nome {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  color: rgba(255,255,255,0.5);
  margin: 0 0 8px;
  letter-spacing: 0.05em;
}
.copa-bracket-match {
  background: var(--bg-card, #1e1e2e);
  border-radius: 8px;
  padding: 8px 10px;
  margin-bottom: 8px;
  border: 1px solid rgba(255,255,255,0.1);
}
.copa-bracket-time {
  display: flex;
  justify-content: space-between;
  font-size: 0.8rem;
  padding: 3px 0;
}
.copa-bracket-time.vencedor { color: var(--copa-gold, #d4af37); font-weight: 700; }

/* ========================
   Classificatória
   ======================== */
.copa-classificatorio-desc {
  font-size: 0.82rem;
  color: rgba(255,255,255,0.6);
  margin: 0 0 14px;
  line-height: 1.5;
}

/* ========================
   Loading
   ======================== */
.copa-loading {
  display: flex;
  justify-content: center;
  padding: 40px;
  color: rgba(255,255,255,0.4);
}
.rotating { animation: copaRotate 1s linear infinite; }
@keyframes copaRotate {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
```

- [ ] **Step 10: Testar manualmente no app**

Verificar:
- Status `pre_sorteio` → teaser com botão Regras
- Status `grupos` ou superior → módulo completo com 4 abas
- Navegar entre abas sem erro de console
- Dados com caracteres especiais não causam XSS

- [ ] **Step 11: Commit**

```bash
git add public/participante/js/modules/participante-copa-sc.js public/participante/fronts/copa-times-sc.html public/participante/css/copa-sc.css
git commit -m "feat(copa-sc): módulo frontend completo com 4 abas (Minha Copa, Grupos, Chaveamento, Classificatória)"
```

---

## Checklist Final

- [ ] Spec coverage: Classificatória ✓, Sorteio ✓, Grupos standings ✓, Mata-mata ✓, 3°lugar+Final ✓, Premiação ✓, Regras modal ✓, Admin APIs ✓, Multi-tenant ✓, Idempotência ✓
- [ ] XSS safety: toda string de API passa por `_esc()`, valores numéricos interpolados diretamente ✓
- [ ] Idempotência: sorteio retorna 409 se já realizado; premiação usa `chaveIdempotencia` ✓
- [ ] Multi-tenant: toda query inclui `liga_id` ✓
- [ ] Prioridade manager: 75 (entre RestaUmManager=72 e ExtratoManager=80) ✓
