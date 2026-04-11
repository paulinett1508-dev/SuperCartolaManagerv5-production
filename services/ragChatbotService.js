/**
 * RAG CHATBOT SERVICE v2.0 — "Big Cartola IA"
 * Pipeline com 2 modos de operacao:
 *   - Modo Basico: pattern matching + contexto dinamico (sem LLM, funciona SEMPRE)
 *   - Modo Completo: contexto dinamico + vector search + LLM (requer OPENAI_API_KEY)
 *
 * Env: OPENAI_API_KEY (opcional — modo basico funciona sem ela)
 * Cache: NodeCache 30min para respostas identicas
 * Multi-tenant: liga_id via session
 */

import NodeCache from 'node-cache';
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { MongoDBAtlasVectorSearch } from '@langchain/mongodb';
import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const cache = new NodeCache({ stdTTL: 1800 }); // 30 minutos
const LOG_PREFIX = '[RAG-CHATBOT]';

// =====================================================================
// CONFIG
// =====================================================================
const CONFIG = {
    model: () => process.env.RAG_MODEL || 'gpt-4o-mini',
    embeddingModel: () => process.env.RAG_EMBEDDING_MODEL || 'text-embedding-3-small',
    maxTokens: () => parseInt(process.env.RAG_MAX_TOKENS || '500', 10),
    temperature: () => parseFloat(process.env.RAG_TEMPERATURE || '0.3'),
    topK: () => parseInt(process.env.RAG_TOP_K || '5', 10),
    collectionName: 'rag_embeddings',
    indexName: 'vector_index',
};

const SYSTEM_PROMPT = `Voce e o Big Cartola IA, assistente oficial do Super Cartola Manager.
Responda com base nos DADOS DA LIGA (contexto dinamico em tempo real) e nos DOCUMENTOS DE REGRAS fornecidos.
Os dados da liga (rankings, rodada, modulos) sao dados REAIS e atualizados — use-os com confianca para responder sobre estado atual.
Os documentos de regras descrevem como cada modulo funciona — use-os para perguntas sobre regras e funcionamento.
Se a pergunta nao pode ser respondida com nenhum dos contextos, diga: "Nao encontrei essa informacao. Tente perguntar de outra forma."
Responda sempre em portugues brasileiro, de forma clara e objetiva.
Nao invente informacoes. Nao responda sobre assuntos fora do Super Cartola Manager.
Use formatacao simples (sem markdown complexo). Seja conciso.`;

// =====================================================================
// VERIFICAR DISPONIBILIDADE
// =====================================================================
function getApiKey() {
    return process.env.OPENAI_API_KEY || null;
}

/**
 * Retorna o modo de operacao do chatbot.
 * @returns {'basico'|'llm'} 'llm' se OPENAI_API_KEY configurada, 'basico' caso contrario
 */
function getModoDisponivel() {
    return getApiKey() ? 'llm' : 'basico';
}

/**
 * Chatbot esta sempre disponivel (modo basico funciona sem API key).
 */
function isDisponivel() {
    return true;
}

/**
 * Verifica se o modo LLM esta disponivel (OPENAI_API_KEY configurada).
 */
function isLLMDisponivel() {
    return !!getApiKey();
}

// =====================================================================
// CLIENTES LANGCHAIN (lazy init)
// =====================================================================
let _llm = null;
let _embeddings = null;
let _vectorStore = null;
let _indexacaoIniciada = false;

function getLLM() {
    if (!_llm) {
        _llm = new ChatOpenAI({
            modelName: CONFIG.model(),
            temperature: CONFIG.temperature(),
            maxTokens: CONFIG.maxTokens(),
            openAIApiKey: getApiKey(),
        });
    }
    return _llm;
}

function getEmbeddings() {
    if (!_embeddings) {
        _embeddings = new OpenAIEmbeddings({
            modelName: CONFIG.embeddingModel(),
            openAIApiKey: getApiKey(),
        });
    }
    return _embeddings;
}

/**
 * Cria MongoClient standalone (usado apenas pelo script CLI de indexacao).
 * Para o pipeline normal, usar o `db` do Mongoose passado pelo controller.
 */
async function criarMongoClientStandalone() {
    const uri = process.env.MONGO_URI;
    if (!uri) throw new Error('MONGO_URI nao configurada');
    const client = new MongoClient(uri);
    await client.connect();
    return client;
}

/**
 * Retorna vector store usando a conexao db compartilhada.
 * @param {Object} db - MongoDB database reference (mongoose.connection.db)
 */
function getVectorStore(db) {
    if (!_vectorStore) {
        const collection = db.collection(CONFIG.collectionName);
        _vectorStore = new MongoDBAtlasVectorSearch(getEmbeddings(), {
            collection,
            indexName: CONFIG.indexName,
            textKey: 'content',
            embeddingKey: 'embedding',
        });
    }
    return _vectorStore;
}

// =====================================================================
// INDEXACAO DE DOCUMENTOS
// =====================================================================

/**
 * Carrega e parseia arquivos de regras JSON de /config/rules/
 */
function carregarRegrasJSON() {
    const rulesDir = path.join(ROOT_DIR, 'config', 'rules');
    const docs = [];

    if (!fs.existsSync(rulesDir)) {
        console.warn(`${LOG_PREFIX} Diretorio ${rulesDir} nao encontrado`);
        return docs;
    }

    const arquivos = fs.readdirSync(rulesDir).filter(f => f.endsWith('.json'));

    for (const arquivo of arquivos) {
        try {
            const conteudo = JSON.parse(fs.readFileSync(path.join(rulesDir, arquivo), 'utf-8'));
            const nome = conteudo.nome || arquivo.replace('.json', '');
            const descricao = conteudo.descricao || '';

            // Serializar regras de forma legivel
            let texto = `MODULO: ${nome}\n`;
            if (descricao) texto += `Descricao: ${descricao}\n`;

            if (conteudo.regras) {
                texto += `\nRegras:\n${JSON.stringify(conteudo.regras, null, 2)}`;
            }
            if (conteudo.wizard) {
                texto += `\nConfiguracoes disponiveis:\n`;
                if (conteudo.wizard.perguntas) {
                    for (const p of conteudo.wizard.perguntas) {
                        texto += `- ${p.label || p.campo}: ${p.descricao || p.help || ''}\n`;
                    }
                }
            }

            docs.push({
                content: texto,
                metadata: { source: `config/rules/${arquivo}`, tipo: 'regra', modulo: nome },
            });
        } catch (err) {
            console.warn(`${LOG_PREFIX} Erro ao ler ${arquivo}: ${err.message}`);
        }
    }

    console.log(`${LOG_PREFIX} Carregadas ${docs.length} regras JSON`);
    return docs;
}

/**
 * Carrega arquivos markdown de docs/references/ e docs/architecture/
 */
function carregarDocsMarkdown() {
    const dirs = [
        path.join(ROOT_DIR, 'docs', 'references'),
        path.join(ROOT_DIR, 'docs', 'architecture'),
    ];
    const docs = [];

    for (const dir of dirs) {
        if (!fs.existsSync(dir)) continue;

        const arquivos = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
        for (const arquivo of arquivos) {
            try {
                const conteudo = fs.readFileSync(path.join(dir, arquivo), 'utf-8');
                const relativePath = path.relative(ROOT_DIR, path.join(dir, arquivo));
                docs.push({
                    content: conteudo,
                    metadata: { source: relativePath, tipo: 'documentacao' },
                });
            } catch (err) {
                console.warn(`${LOG_PREFIX} Erro ao ler ${arquivo}: ${err.message}`);
            }
        }
    }

    console.log(`${LOG_PREFIX} Carregados ${docs.length} docs markdown`);
    return docs;
}

/**
 * Indexa todos os documentos no MongoDB Atlas Vector Search.
 * @param {Object} options - { force: boolean, dryRun: boolean, db: Object }
 *   db: se fornecido, usa essa conexao. Se nao, cria MongoClient standalone (CLI).
 * @returns {Object} { total, chunks, duracao }
 */
async function indexarDocumentos(options = {}) {
    const { force = false, dryRun = false, db: dbParam = null } = options;

    if (!isLLMDisponivel()) {
        throw new Error('OPENAI_API_KEY nao configurada');
    }

    console.log(`${LOG_PREFIX} Iniciando indexacao... (force=${force}, dryRun=${dryRun})`);
    const inicio = Date.now();

    // 1. Carregar documentos
    const regras = carregarRegrasJSON();
    const docs = carregarDocsMarkdown();
    const todosDocumentos = [...regras, ...docs];

    console.log(`${LOG_PREFIX} Total de documentos fonte: ${todosDocumentos.length}`);

    // 2. Chunkar
    const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
    });

    const chunks = [];
    for (const doc of todosDocumentos) {
        const parts = await splitter.splitText(doc.content);
        for (const part of parts) {
            chunks.push({ content: part, metadata: doc.metadata });
        }
    }

    console.log(`${LOG_PREFIX} Total de chunks: ${chunks.length}`);

    if (dryRun) {
        console.log(`${LOG_PREFIX} [DRY RUN] Nao salvando. Exemplo de chunk:`);
        if (chunks[0]) console.log(chunks[0].content.substring(0, 200) + '...');
        return { total: todosDocumentos.length, chunks: chunks.length, duracao: Date.now() - inicio, dryRun: true };
    }

    // 3. Obter collection (usa db do Mongoose ou cria MongoClient standalone para CLI)
    let standaloneClient = null;
    let collection;
    if (dbParam) {
        collection = dbParam.collection(CONFIG.collectionName);
    } else {
        standaloneClient = await criarMongoClientStandalone();
        collection = standaloneClient.db().collection(CONFIG.collectionName);
    }

    try {
        if (force) {
            const deleted = await collection.deleteMany({});
            console.log(`${LOG_PREFIX} Collection limpa: ${deleted.deletedCount} docs removidos`);
        }

        // 4. Gerar embeddings e salvar
        const embeddings = getEmbeddings();
        const BATCH_SIZE = 20;

        for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
            const batch = chunks.slice(i, i + BATCH_SIZE);
            const textos = batch.map(c => c.content);
            const vetores = await embeddings.embedDocuments(textos);

            const documentos = batch.map((chunk, idx) => ({
                content: chunk.content,
                embedding: vetores[idx],
                metadata: chunk.metadata,
                indexadoEm: new Date(),
            }));

            await collection.insertMany(documentos);
            console.log(`${LOG_PREFIX} Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(chunks.length / BATCH_SIZE)} indexado`);
        }

        const duracao = Date.now() - inicio;
        console.log(`${LOG_PREFIX} Indexacao concluida em ${duracao}ms. ${chunks.length} chunks salvos.`);

        // Reset vector store para recarregar
        _vectorStore = null;

        return { total: todosDocumentos.length, chunks: chunks.length, duracao };
    } finally {
        if (standaloneClient) {
            await standaloneClient.close().catch(() => {});
        }
    }
}

// =====================================================================
// CONTEXTO DINAMICO (dados live do MongoDB)
// =====================================================================

/**
 * Retorna as fases do mata-mata para o tamanho do torneio.
 * Espelho da funcao getFasesParaTamanho em mata-mata-backend.js.
 */
function _getFasesMataMata(totalTimes) {
    if (totalTimes >= 32) return ['primeira', 'oitavas', 'quartas', 'semis', 'final'];
    if (totalTimes >= 16) return ['oitavas', 'quartas', 'semis', 'final'];
    if (totalTimes >= 8)  return ['quartas', 'semis', 'final'];
    return ['semis', 'final'];
}

const _FASE_LABEL = {
    primeira: 'Primeira Fase',
    oitavas:  'Oitavas de Final',
    quartas:  'Quartas de Final',
    semis:    'Semifinal',
    final:    'Final',
};

/**
 * Busca contexto especifico do modulo Mata-Mata para a liga.
 * @param {string} ligaId
 * @param {number|null} rodadaAtual - numero da rodada atual do mercado
 * @param {number} temporada
 * @param {Object} db
 * @returns {string}
 */
async function buscarContextoMataMata(ligaId, rodadaAtual, temporada, db) {
    try {
        const { ObjectId } = await import('mongodb');
        const config = await db.collection('moduleconfigs').findOne(
            { liga_id: new ObjectId(ligaId), modulo: 'mata_mata', temporada },
            { projection: { calendario_override: 1, regras_override: 1 } }
        );

        if (!config || !Array.isArray(config.calendario_override) || config.calendario_override.length === 0) {
            return '';
        }

        const totalTimes = config.regras_override?.total_times || 16;
        const fases = _getFasesMataMata(totalTimes);

        const linhas = [`MATA-MATA (${totalTimes} times, ${fases.length} fases):`];

        for (const ed of config.calendario_override) {
            const { edicao, nome, rodada_inicial: ri, rodada_final: rf } = ed;
            if (!ri || !rf) continue;

            let statusEdicao;
            if (!rodadaAtual || rodadaAtual < ri) {
                statusEdicao = `aguardando inicio (começa na R${ri})`;
            } else if (rodadaAtual > rf) {
                statusEdicao = 'encerrada';
            } else {
                const indice = rodadaAtual - ri;
                const faseAtual = fases[Math.min(indice, fases.length - 1)];
                statusEdicao = `EM ANDAMENTO — fase atual: ${_FASE_LABEL[faseAtual] || faseAtual} (R${rodadaAtual} de R${ri}-R${rf})`;
            }

            linhas.push(`- Edicao ${edicao}${nome ? ` "${nome}"` : ''}: ${statusEdicao}`);
        }

        return linhas.join('\n');
    } catch {
        return '';
    }
}

// -- HELPERS DE MODULOS (um por modulo, chamados em paralelo) --

async function buscarContextoRankingGeral(ligaId, temporada, db) {
    try {
        const { ObjectId } = await import('mongodb');
        const cache = await db.collection('rankinggeralcaches').findOne(
            { ligaId: new ObjectId(ligaId), temporada },
            { projection: { ranking: { $slice: 3 }, rodadaFinal: 1 } }
        );
        if (!cache || !Array.isArray(cache.ranking) || cache.ranking.length === 0) return '';

        const linhas = [`RANKING GERAL (ate R${cache.rodadaFinal || '?'}):`];
        cache.ranking.slice(0, 3).forEach((t, i) => {
            linhas.push(`- ${i + 1}o ${t.nome_cartola || t.nome_time}: ${t.pontos_totais} pts`);
        });
        return linhas.join('\n');
    } catch { return ''; }
}

async function buscarContextoRankingRodada(ligaId, rodadaAtual, temporada, db) {
    try {
        if (!rodadaAtual) return '';
        const { ObjectId } = await import('mongodb');
        const docs = await db.collection('rodadas').find(
            { ligaId: new ObjectId(ligaId), rodada: rodadaAtual, temporada },
            { projection: { timeId: 1, nome_cartola: 1, pontos: 1, posicao: 1 } }
        ).sort({ posicao: 1 }).limit(3).toArray();

        if (!docs.length) return '';
        const linhas = [`RANKING RODADA ${rodadaAtual} (top 3):`];
        docs.forEach(t => {
            linhas.push(`- ${t.posicao}o ${t.nome_cartola}: ${t.pontos} pts`);
        });
        return linhas.join('\n');
    } catch { return ''; }
}

async function buscarContextoPontosCorridos(ligaId, temporada, db) {
    try {
        const cache = await db.collection('pontoscorridoscaches').findOne(
            { liga_id: ligaId, temporada },
            { projection: { classificacao: { $slice: 3 }, rodada_consolidada: 1 } }
        );
        if (!cache || !Array.isArray(cache.classificacao) || cache.classificacao.length === 0) return '';

        const linhas = [`PONTOS CORRIDOS (ate R${cache.rodada_consolidada || '?'}):`];
        cache.classificacao.slice(0, 3).forEach(t => {
            linhas.push(`- ${t.posicao}o ${t.nome_cartola || t.nome}: ${t.pontos} pts (${t.vitorias}V ${t.empates}E ${t.derrotas}D)`);
        });
        return linhas.join('\n');
    } catch { return ''; }
}

async function buscarContextoTop10(ligaId, temporada, db) {
    try {
        const cache = await db.collection('top10caches').findOne(
            { liga_id: ligaId, temporada },
            { projection: { mitos: 1, micos: 1, rodada_consolidada: 1 } }
        );
        if (!cache) return '';

        const linhas = [`TOP 10 (R${cache.rodada_consolidada || '?'}):`];
        if (Array.isArray(cache.mitos) && cache.mitos.length > 0) {
            const top = cache.mitos[0];
            linhas.push(`- Mito #1: ${top.nome_cartola || top.nome_time} — ${top.pontos} pts (R${top.rodada})`);
        }
        if (Array.isArray(cache.micos) && cache.micos.length > 0) {
            const last = cache.micos[cache.micos.length - 1];
            linhas.push(`- Mico #10: ${last.nome_cartola || last.nome_time} — ${last.pontos} pts (R${last.rodada})`);
        }
        return linhas.join('\n');
    } catch { return ''; }
}

async function buscarContextoMelhorMes(ligaId, temporada, db) {
    try {
        const { ObjectId } = await import('mongodb');
        const cache = await db.collection('melhor_mes_cache').findOne(
            { ligaId: new ObjectId(ligaId), temporada },
            { projection: { edicoes: 1 } }
        );
        if (!cache || !Array.isArray(cache.edicoes) || cache.edicoes.length === 0) return '';

        const linhas = ['MELHOR MES:'];
        for (const ed of cache.edicoes) {
            if (ed.status === 'em_andamento') {
                const lider = Array.isArray(ed.ranking) && ed.ranking[0];
                linhas.push(`- ${ed.nome || `Edicao ${ed.id}`}: EM ANDAMENTO (R${ed.inicio}-R${ed.fim})${lider ? ` — Lider: ${lider.nome_cartola || lider.nome_time} (${lider.pontos_total} pts)` : ''}`);
            } else if (ed.status === 'consolidado' && ed.campeao) {
                linhas.push(`- ${ed.nome || `Edicao ${ed.id}`}: Encerrada — Campeao: ${ed.campeao.nome_cartola || ed.campeao.nome_time}`);
            }
        }
        return linhas.length > 1 ? linhas.join('\n') : '';
    } catch { return ''; }
}

async function buscarContextoTurnoReturno(ligaId, temporada, db) {
    try {
        const { ObjectId } = await import('mongodb');
        const turnos = await db.collection('rankingturnos').find(
            { ligaId: new ObjectId(ligaId), temporada, turno: { $in: ['1', '2'] } },
            { projection: { turno: 1, status: 1, rodada_inicio: 1, rodada_fim: 1, ranking: { $slice: 1 } } }
        ).toArray();

        if (!turnos.length) return '';

        const linhas = ['TURNO/RETURNO:'];
        for (const t of turnos.sort((a, b) => a.turno.localeCompare(b.turno))) {
            const label = t.turno === '1' ? '1o Turno' : '2o Turno';
            const range = `R${t.rodada_inicio}-R${t.rodada_fim}`;
            const lider = Array.isArray(t.ranking) && t.ranking[0];
            if (t.status === 'em_andamento') {
                linhas.push(`- ${label} (${range}): EM ANDAMENTO${lider ? ` — Lider: ${lider.nome_cartola || lider.nome_time} (${lider.pontos} pts)` : ''}`);
            } else if (t.status === 'consolidado') {
                linhas.push(`- ${label} (${range}): Encerrado${lider ? ` — Campeao: ${lider.nome_cartola || lider.nome_time}` : ''}`);
            }
        }
        return linhas.length > 1 ? linhas.join('\n') : '';
    } catch { return ''; }
}

async function buscarContextoArtilheiro(ligaId, temporada, db) {
    try {
        const cache = await db.collection('artilheirocampeao').findOne(
            { ligaId: ligaId, temporada },
            { projection: { dados: { $slice: 3 }, rodadaAtual: 1 } }
        );
        if (!cache || !Array.isArray(cache.dados) || cache.dados.length === 0) return '';

        const linhas = [`ARTILHEIRO (ate R${cache.rodadaAtual || '?'}) — gols dos atletas escalados:`];
        cache.dados.slice(0, 3).forEach((t, i) => {
            linhas.push(`- ${i + 1}o ${t.nomeCartoleiro || t.nomeTime}: ${t.golsPro} gols pro, saldo ${t.saldoGols}`);
        });
        return linhas.join('\n');
    } catch { return ''; }
}

async function buscarContextoCapitaoLuxo(ligaId, temporada, db) {
    try {
        const { ObjectId } = await import('mongodb');
        const docs = await db.collection('capitaocaches').find(
            { ligaId: new ObjectId(ligaId), temporada },
            { projection: { nome_cartola: 1, nome_time: 1, pontuacao_total: 1, media_capitao: 1 } }
        ).sort({ pontuacao_total: -1 }).limit(3).toArray();

        if (!docs.length) return '';

        const linhas = ['CAPITAO DE LUXO (top 3):'];
        docs.forEach((t, i) => {
            linhas.push(`- ${i + 1}o ${t.nome_cartola || t.nome_time}: ${t.pontuacao_total} pts (media ${(t.media_capitao || 0).toFixed(1)})`);
        });
        return linhas.join('\n');
    } catch { return ''; }
}

async function buscarContextoLuvaOuro(ligaId, temporada, db) {
    try {
        const pipeline = [
            { $match: { ligaId: ligaId, temporada, rodadaConcluida: true } },
            { $group: {
                _id: '$participanteId',
                participanteNome: { $first: '$participanteNome' },
                pontosTotais: { $sum: '$pontos' },
                rodadasJogadas: { $sum: 1 },
            }},
            { $sort: { pontosTotais: -1 } },
            { $limit: 3 },
        ];
        const docs = await db.collection('goleiros').aggregate(pipeline).toArray();
        if (!docs.length) return '';

        const linhas = ['LUVA DE OURO (top 3 em pontos de goleiros):'];
        docs.forEach((t, i) => {
            const media = t.rodadasJogadas > 0 ? (t.pontosTotais / t.rodadasJogadas).toFixed(1) : '0.0';
            linhas.push(`- ${i + 1}o ${t.participanteNome}: ${t.pontosTotais} pts (${t.rodadasJogadas} rodadas, media ${media})`);
        });
        return linhas.join('\n');
    } catch { return ''; }
}

async function buscarContextoTiroCerto(ligaId, temporada, db) {
    try {
        const edicoes = await db.collection('tirocertocaches').find(
            { liga_id: ligaId, temporada },
            { projection: { edicao: 1, nome: 1, status: 1, rodadaAtual: 1, rodadaFinal: 1, vivosCount: 1, eliminadosCount: 1 } }
        ).sort({ edicao: 1 }).toArray();

        if (!edicoes.length) return '';

        const linhas = ['TIRO CERTO:'];
        for (const ed of edicoes) {
            if (ed.status === 'em_andamento') {
                linhas.push(`- ${ed.nome || `Edicao ${ed.edicao}`}: EM ANDAMENTO (R${ed.rodadaAtual}) — ${ed.vivosCount ?? '?'} vivos, ${ed.eliminadosCount ?? '?'} eliminados`);
            } else if (ed.status === 'finalizada') {
                linhas.push(`- ${ed.nome || `Edicao ${ed.edicao}`}: Finalizada`);
            } else if (ed.status === 'pendente') {
                linhas.push(`- ${ed.nome || `Edicao ${ed.edicao}`}: Aguardando inicio (ate R${ed.rodadaFinal})`);
            }
        }
        return linhas.length > 1 ? linhas.join('\n') : '';
    } catch { return ''; }
}

async function buscarContextoRestaUm(ligaId, temporada, db) {
    try {
        const edicoes = await db.collection('restaumcaches').find(
            { liga_id: ligaId, temporada },
            { projection: { edicao: 1, nome: 1, status: 1, rodadaAtual: 1, rodadaInicial: 1, rodadaFinal: 1, participantes: 1 } }
        ).sort({ edicao: 1 }).toArray();

        if (!edicoes.length) return '';

        const linhas = ['RESTA UM:'];
        for (const ed of edicoes) {
            const participantes = Array.isArray(ed.participantes) ? ed.participantes : [];
            const vivos = participantes.filter(p => p.status === 'vivo' || p.status === 'zona_perigo');
            const emZona = participantes.filter(p => p.status === 'zona_perigo');
            const campeao = participantes.find(p => p.status === 'campeao');

            if (ed.status === 'em_andamento') {
                let info = `EM ANDAMENTO (R${ed.rodadaAtual}, de R${ed.rodadaInicial}-R${ed.rodadaFinal})`;
                if (vivos.length > 0) info += ` — ${vivos.length} vivos`;
                if (emZona.length > 0) info += `, ${emZona.length} na zona de perigo`;
                linhas.push(`- ${ed.nome || `Edicao ${ed.edicao}`}: ${info}`);
            } else if (ed.status === 'finalizada') {
                linhas.push(`- ${ed.nome || `Edicao ${ed.edicao}`}: Finalizada${campeao ? ` — Campeao: ${campeao.nomeCartoleiro || campeao.nomeTime}` : ''}`);
            } else if (ed.status === 'pendente') {
                linhas.push(`- ${ed.nome || `Edicao ${ed.edicao}`}: Aguardando inicio (R${ed.rodadaInicial})`);
            }
        }
        return linhas.length > 1 ? linhas.join('\n') : '';
    } catch { return ''; }
}

/**
 * Busca dados atuais da liga e rodada para injetar no prompt.
 * @param {string} ligaId - ID da liga
 * @param {Object} db - Mongoose connection (passado pelo controller)
 * @returns {string} Texto de contexto formatado
 */
async function buscarContextoDinamico(ligaId, db) {
    try {
        const { ObjectId } = await import('mongodb');
        const liga = await db.collection('ligas').findOne(
            { _id: new ObjectId(ligaId) },
            { projection: { nome: 1, temporada: 1, participantes: 1, modulos_ativos: 1, status: 1 } }
        );

        if (!liga) return 'Contexto da liga nao disponivel.';

        const temporada = liga.temporada || new Date().getFullYear();
        let rodadaAtualNum = null;

        // Buscar status do mercado/rodada via CalendarioRodada
        let rodadaInfo = '';
        try {
            const calendario = await db.collection('calendariorodadas').findOne(
                { temporada },
                { sort: { 'rodadas.rodada': -1 } }
            );
            if (calendario && calendario.rodadas) {
                const agora = new Date();
                const rodadaAtual = calendario.rodadas.find(r => {
                    const inicio = new Date(r.inicio);
                    const fim = new Date(r.fim);
                    return agora >= inicio && agora <= fim;
                });
                if (rodadaAtual) {
                    rodadaInfo = `Rodada atual: ${rodadaAtual.rodada}`;
                    rodadaAtualNum = rodadaAtual.rodada;
                } else {
                    // Pegar a mais recente passada
                    const passadas = calendario.rodadas
                        .filter(r => new Date(r.fim) < agora)
                        .sort((a, b) => b.rodada - a.rodada);
                    if (passadas[0]) {
                        rodadaInfo = `Ultima rodada encerrada: ${passadas[0].rodada}`;
                        rodadaAtualNum = passadas[0].rodada;
                    }
                }
            }
        } catch {
            // CalendarioRodada pode nao existir
        }

        // Buscar mercado status
        let mercadoStatus = '';
        try {
            const mercado = await db.collection('mercadostatus').findOne({});
            if (mercado) {
                const statusMap = { 1: 'aberto', 2: 'fechado (rodada em andamento)', 4: 'encerrado' };
                mercadoStatus = `Mercado: ${statusMap[mercado.status_mercado] || 'desconhecido'}`;
                if (mercado.rodada_atual) {
                    rodadaInfo = `Rodada atual: ${mercado.rodada_atual}`;
                    rodadaAtualNum = mercado.rodada_atual;
                }
            }
        } catch {
            // Fallback silencioso
        }

        const modulosAtivos = liga.modulos_ativos
            ? Object.entries(liga.modulos_ativos)
                .filter(([, v]) => v === true)
                .map(([k]) => k)
                .join(', ')
            : 'nao definidos';

        const qtdParticipantes = Array.isArray(liga.participantes)
            ? liga.participantes.filter(p => p.ativo !== false).length
            : 0;

        const linhas = [
            `CONTEXTO ATUAL DA LIGA:`,
            `- Liga: "${liga.nome}" | Status: ${liga.status || 'ativa'}`,
            `- Temporada: ${temporada}`,
            `- ${rodadaInfo || 'Rodada: nao identificada'}`,
            `- ${mercadoStatus || 'Mercado: status nao disponivel'}`,
            `- Participantes ativos: ${qtdParticipantes}`,
            `- Modulos ativos: ${modulosAtivos}`,
        ];

        // Contexto especifico de modulos ativos — chamadas em paralelo
        const ma = liga.modulos_ativos || {};
        const moduloHelpers = [
            ma.ranking_geral   && buscarContextoRankingGeral(ligaId, temporada, db),
            ma.ranking_rodada  && buscarContextoRankingRodada(ligaId, rodadaAtualNum, temporada, db),
            ma.pontos_corridos && buscarContextoPontosCorridos(ligaId, temporada, db),
            ma.mata_mata       && buscarContextoMataMata(ligaId, rodadaAtualNum, temporada, db),
            ma.top_10          && buscarContextoTop10(ligaId, temporada, db),
            ma.melhor_mes      && buscarContextoMelhorMes(ligaId, temporada, db),
            ma.turno_returno   && buscarContextoTurnoReturno(ligaId, temporada, db),
            ma.artilheiro      && buscarContextoArtilheiro(ligaId, temporada, db),
            ma.capitao_luxo    && buscarContextoCapitaoLuxo(ligaId, temporada, db),
            ma.luva_ouro       && buscarContextoLuvaOuro(ligaId, temporada, db),
            ma.tiro_certo      && buscarContextoTiroCerto(ligaId, temporada, db),
            ma.resta_um        && buscarContextoRestaUm(ligaId, temporada, db),
        ].filter(Boolean);

        if (moduloHelpers.length > 0) {
            const resultados = await Promise.allSettled(moduloHelpers);
            for (const r of resultados) {
                if (r.status === 'fulfilled' && r.value) linhas.push('', r.value);
            }
        }

        return linhas.join('\n');
    } catch (error) {
        console.warn(`${LOG_PREFIX} Erro ao buscar contexto dinamico: ${error.message}`);
        return 'Contexto dinamico indisponivel.';
    }
}

// =====================================================================
// MODO BASICO — Pattern matching (funciona sem LLM)
// =====================================================================

/**
 * Mapa de keywords → secoes do contexto dinamico.
 * Chave = regex pattern (case insensitive), valor = header da secao no contexto.
 */
const KEYWORD_SECOES = [
    { pattern: /ranking\s*geral|classifica[cç][aã]o\s*geral|quem\s*lidera|primeiro\s*lugar/i, secao: 'RANKING GERAL', modulo: 'ranking_geral' },
    { pattern: /ranking\s*(da\s*)?rodada|melhor\s*da\s*rodada|top\s*rodada/i, secao: 'RANKING RODADA', modulo: 'ranking_rodada' },
    { pattern: /pontos?\s*corridos?|tabela|campeonato\s*pontos/i, secao: 'PONTOS CORRIDOS', modulo: 'pontos_corridos' },
    { pattern: /mata[\s-]*mata|eliminat[oó]ria|bracket|chave(amento)?/i, secao: 'MATA-MATA', modulo: 'mata_mata' },
    { pattern: /top\s*10|mito|mico|melhor\s*pontua/i, secao: 'TOP 10', modulo: 'top_10' },
    { pattern: /melhor\s*m[eê]s/i, secao: 'MELHOR MES', modulo: 'melhor_mes' },
    { pattern: /turno|returno|primeiro\s*turno|segundo\s*turno/i, secao: 'TURNO/RETURNO', modulo: 'turno_returno' },
    { pattern: /artilheir[oa]|gol(s)?|goleador/i, secao: 'ARTILHEIRO', modulo: 'artilheiro' },
    { pattern: /capit[aã]o|luxo/i, secao: 'CAPITAO DE LUXO', modulo: 'capitao_luxo' },
    { pattern: /luva\s*(de\s*)?ouro|goleir[oa]/i, secao: 'LUVA DE OURO', modulo: 'luva_ouro' },
    { pattern: /tiro\s*certo|palpite/i, secao: 'TIRO CERTO', modulo: 'tiro_certo' },
    { pattern: /resta\s*um|eliminad[oa]|sobreviv|vivo/i, secao: 'RESTA UM', modulo: 'resta_um' },
    { pattern: /rodada|mercado|aberto|fechado|quando\s*(abre|fecha)/i, secao: 'CONTEXTO ATUAL', modulo: null },
    { pattern: /m[oó]dulo|ativo|desativado|quais\s*m[oó]dulos/i, secao: 'CONTEXTO ATUAL', modulo: null },
    { pattern: /liga|participante|quantos|time/i, secao: 'CONTEXTO ATUAL', modulo: null },
];

/**
 * Carrega regras de um modulo especifico para resposta legivel.
 * @param {string} moduloId - ID do modulo (ex: 'ranking_geral', 'mata_mata')
 * @returns {string} Texto legivel com nome, descricao e regras
 */
function carregarRegraModulo(moduloId) {
    try {
        const filePath = path.join(ROOT_DIR, 'config', 'rules', `${moduloId}.json`);
        if (!fs.existsSync(filePath)) return '';

        const conteudo = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const linhas = [];

        linhas.push(`MODULO: ${conteudo.nome || moduloId}`);
        if (conteudo.descricao) linhas.push(`Descricao: ${conteudo.descricao}`);

        if (conteudo.regras) {
            if (conteudo.regras.calculo) {
                linhas.push(`Calculo: ${conteudo.regras.calculo.metodo || 'nao especificado'}`);
            }
            if (conteudo.regras.desempate?.criterios) {
                linhas.push(`Desempate: ${conteudo.regras.desempate.criterios.join(', ')}`);
            }
            if (conteudo.regras.ordenacao) {
                linhas.push(`Ordenacao: ${conteudo.regras.ordenacao.criterio_principal || ''} ${conteudo.regras.ordenacao.direcao || ''}`);
            }
        }

        if (conteudo.wizard?.perguntas) {
            linhas.push('Configuracoes:');
            for (const p of conteudo.wizard.perguntas) {
                linhas.push(`- ${p.label || p.campo}: ${p.descricao || p.help || ''}`);
            }
        }

        return linhas.join('\n');
    } catch (err) {
        console.warn(`${LOG_PREFIX} Erro ao ler regra ${moduloId}: ${err.message}`);
        return '';
    }
}

/**
 * Extrai secao relevante do contexto dinamico baseado em header.
 * @param {string} contexto - Texto completo do contexto dinamico
 * @param {string} secaoHeader - Header da secao (ex: 'RANKING GERAL')
 * @returns {string} Secao extraida ou ''
 */
function extrairSecaoDoContexto(contexto, secaoHeader) {
    if (secaoHeader === 'CONTEXTO ATUAL') {
        // Retornar a parte geral do contexto (antes das secoes de modulos)
        const primeiraSecao = contexto.indexOf('\n\n');
        if (primeiraSecao === -1) return contexto;

        // Pegar ate a primeira secao de modulo
        const linhas = contexto.split('\n');
        const secaoGeral = [];
        for (const linha of linhas) {
            // Secoes de modulos comecam com titulo em UPPERCASE seguido de ':'
            if (secaoGeral.length > 0 && /^[A-Z][A-Z\s/()-]+:/.test(linha) && !linha.startsWith('CONTEXTO ATUAL')) {
                break;
            }
            secaoGeral.push(linha);
        }
        return secaoGeral.join('\n');
    }

    // Buscar secao especifica
    const idx = contexto.indexOf(secaoHeader);
    if (idx === -1) return '';

    // Pegar desde o header ate a proxima secao ou fim
    const resto = contexto.substring(idx);
    const linhas = resto.split('\n');
    const resultado = [linhas[0]];

    for (let i = 1; i < linhas.length; i++) {
        const linha = linhas[i];
        // Nova secao detectada (uppercase com :)
        if (/^[A-Z][A-Z\s/()-]+:/.test(linha)) break;
        resultado.push(linha);
    }

    return resultado.join('\n').trim();
}

/**
 * Responde pergunta usando modo basico (sem LLM).
 * Pattern matching + contexto dinamico + regras JSON.
 * @param {string} pergunta
 * @param {string} ligaId
 * @param {Object} db
 * @returns {Object} { resposta, fontes }
 */
async function responderSemLLM(pergunta, ligaId, db) {
    const perguntaLower = pergunta.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // remover acentos para matching

    // 1. Buscar contexto dinamico
    const contextoDinamico = await buscarContextoDinamico(ligaId, db);

    // 2. Detectar intencao via keyword matching
    const matches = KEYWORD_SECOES.filter(ks => ks.pattern.test(perguntaLower));

    if (matches.length === 0) {
        // Sem match — verificar se e uma pergunta sobre regras genericas
        const perguntaSobreRegras = /regra|como\s*funciona|o\s*que\s*[eé]/i.test(pergunta);
        if (perguntaSobreRegras) {
            // Tentar identificar qual modulo pela pergunta
            const modulos = carregarRegrasJSON();
            const moduloMatch = modulos.find(m => {
                const nome = (m.metadata.modulo || '').toLowerCase();
                return perguntaLower.includes(nome.replace(/_/g, ' '));
            });

            if (moduloMatch) {
                return {
                    resposta: moduloMatch.content,
                    fontes: [moduloMatch.metadata.source],
                };
            }
        }

        // Fallback: mostrar contexto geral + topicos disponiveis
        const contextoGeral = extrairSecaoDoContexto(contextoDinamico, 'CONTEXTO ATUAL');
        return {
            resposta: `${contextoGeral}\n\nPosso responder sobre: Ranking Geral, Ranking da Rodada, Pontos Corridos, Mata-Mata, Top 10, Melhor Mes, Turno/Returno, Artilheiro, Capitao de Luxo, Luva de Ouro, Tiro Certo, Resta Um, rodada atual e modulos ativos.`,
            fontes: [],
        };
    }

    // 3. Montar resposta com secoes relevantes
    const partes = [];
    const fontes = [];

    for (const match of matches) {
        // Extrair dados live do contexto dinamico
        const secaoLive = extrairSecaoDoContexto(contextoDinamico, match.secao);
        if (secaoLive) {
            partes.push(secaoLive);
        }

        // Carregar regras do modulo se existir e a pergunta pedir sobre regras/funcionamento
        if (match.modulo && /regra|como\s*funciona|o\s*que\s*[eé]|explica/i.test(pergunta)) {
            const regraTexto = carregarRegraModulo(match.modulo);
            if (regraTexto) {
                partes.push(`\n${regraTexto}`);
                fontes.push(`config/rules/${match.modulo}.json`);
            }
        }
    }

    if (partes.length === 0) {
        // Match nos keywords mas sem dados disponiveis
        const contextoGeral = extrairSecaoDoContexto(contextoDinamico, 'CONTEXTO ATUAL');
        return {
            resposta: `${contextoGeral}\n\nNao encontrei dados especificos para sua pergunta. O modulo pode nao estar ativo nesta liga.`,
            fontes: [],
        };
    }

    return {
        resposta: partes.join('\n\n'),
        fontes,
    };
}

/**
 * Carrega regras relevantes como contexto textual para o LLM (Tier 2 fallback).
 * @param {string} pergunta
 * @returns {string|null} Texto das regras relevantes ou null
 */
function carregarRegrasComoContexto(pergunta) {
    const perguntaLower = pergunta.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    const matches = KEYWORD_SECOES.filter(ks => ks.pattern.test(perguntaLower) && ks.modulo);
    if (matches.length === 0) return null;

    const textos = [];
    for (const match of matches) {
        const regra = carregarRegraModulo(match.modulo);
        if (regra) textos.push(regra);
    }

    return textos.length > 0 ? textos.join('\n\n---\n\n') : null;
}

// =====================================================================
// PIPELINE RAG — PERGUNTAR
// =====================================================================

/**
 * Responde uma pergunta com fallback em 3 tiers:
 *   Tier 1 (basico): pattern matching + contexto dinamico (sem LLM)
 *   Tier 2 (llm sem RAG): contexto dinamico + regras diretas + LLM
 *   Tier 3 (llm + RAG): contexto dinamico + vector search + LLM
 *
 * @param {string} pergunta - Pergunta do usuario
 * @param {string} ligaId - ID da liga (multi-tenant)
 * @param {Object} db - MongoDB database reference
 * @returns {Object} { resposta, fontes, cached, modo }
 */
async function perguntarBot(pergunta, ligaId, db) {
    // Cache check (funciona para todos os modos)
    const cacheKey = `rag_${crypto.createHash('md5').update(`${pergunta}_${ligaId}`).digest('hex')}`;
    const cached = cache.get(cacheKey);
    if (cached) {
        console.log(`${LOG_PREFIX} Cache hit para: "${pergunta.substring(0, 50)}..."`);
        return { ...cached, cached: true };
    }

    const modo = getModoDisponivel();
    const inicio = Date.now();

    // TIER 1: Modo basico (sem LLM)
    if (modo === 'basico') {
        console.log(`${LOG_PREFIX} [BASICO] Processando: "${pergunta.substring(0, 80)}..."`);
        try {
            const resultado = await responderSemLLM(pergunta, ligaId, db);
            cache.set(cacheKey, resultado);
            console.log(`${LOG_PREFIX} [BASICO] Resposta gerada em ${Date.now() - inicio}ms`);
            return { ...resultado, cached: false, modo: 'basico' };
        } catch (error) {
            console.error(`${LOG_PREFIX} [BASICO] Erro: ${error.message}`);
            return { resposta: 'Desculpe, ocorreu um erro ao buscar os dados. Tente novamente.', fontes: [], cached: false, modo: 'basico' };
        }
    }

    // TIER 2/3: Modo LLM
    try {
        console.log(`${LOG_PREFIX} [LLM] Processando: "${pergunta.substring(0, 80)}..."`);

        // Auto-indexacao lazy: na primeira pergunta, verificar se knowledge base esta vazia
        if (!_indexacaoIniciada) {
            _indexacaoIniciada = true;
            try {
                const totalChunks = await db.collection(CONFIG.collectionName).countDocuments();
                if (totalChunks === 0) {
                    console.log(`${LOG_PREFIX} Knowledge base vazia. Disparando indexacao em background...`);
                    indexarDocumentos({ force: false, db }).catch(err => {
                        console.warn(`${LOG_PREFIX} Auto-indexacao falhou: ${err.message}`);
                    });
                }
            } catch (err) {
                console.warn(`${LOG_PREFIX} Erro ao verificar knowledge base: ${err.message}`);
            }
        }

        // 1. Buscar contexto dinamico
        const contextoDinamico = await buscarContextoDinamico(ligaId, db);

        // 2. Vector search — tentar buscar chunks relevantes (Tier 3)
        let chunksRelevantes = [];
        let fontes = [];
        try {
            const vectorStore = getVectorStore(db);
            const resultados = await vectorStore.similaritySearch(pergunta, CONFIG.topK());
            chunksRelevantes = resultados.map(r => r.pageContent);
            fontes = [...new Set(resultados.map(r => r.metadata?.source).filter(Boolean))];
        } catch (vectorError) {
            console.warn(`${LOG_PREFIX} Vector search indisponivel: ${vectorError.message}`);
            // Tier 2 fallback: carregar regras diretamente como contexto
            const regrasTexto = carregarRegrasComoContexto(pergunta);
            if (regrasTexto) {
                chunksRelevantes = [regrasTexto];
                fontes = ['config/rules (carregamento direto)'];
            }
        }

        // 3. Montar prompt
        const contextChunks = chunksRelevantes.length > 0
            ? `\n\nDOCUMENTOS DE REGRAS:\n${chunksRelevantes.join('\n\n---\n\n')}`
            : '';

        const mensagens = [
            { role: 'system', content: `${SYSTEM_PROMPT}\n\n${contextoDinamico}${contextChunks}` },
            { role: 'user', content: pergunta },
        ];

        // 4. Chamar LLM
        const llm = getLLM();
        const resposta = await llm.invoke(mensagens);
        const textoResposta = resposta.content || 'Desculpe, nao consegui gerar uma resposta.';

        const resultado = { resposta: textoResposta, fontes };

        // 5. Cachear
        cache.set(cacheKey, resultado);

        const tier = chunksRelevantes.length > 0 && fontes.some(f => !f.includes('carregamento direto')) ? 3 : 2;
        console.log(`${LOG_PREFIX} [LLM Tier ${tier}] Resposta gerada em ${Date.now() - inicio}ms (${textoResposta.length} chars, ${fontes.length} fontes)`);
        return { ...resultado, cached: false, modo: `llm-tier${tier}` };

    } catch (error) {
        // LLM falhou: fallback para modo basico
        console.error(`${LOG_PREFIX} [LLM] Erro, fallback para basico: ${error.message}`);
        try {
            const resultado = await responderSemLLM(pergunta, ligaId, db);
            cache.set(cacheKey, resultado);
            return { ...resultado, cached: false, modo: 'basico-fallback' };
        } catch (fallbackError) {
            console.error(`${LOG_PREFIX} [BASICO-FALLBACK] Erro: ${fallbackError.message}`);
            return { resposta: 'Desculpe, ocorreu um erro ao processar sua pergunta. Tente novamente.', fontes: [], cached: false, modo: 'erro' };
        }
    }
}

// =====================================================================
// STATUS & UTILIDADES
// =====================================================================

/**
 * Retorna status do chatbot.
 * @param {Object} [db] - MongoDB database reference (opcional para modo basico)
 */
async function getStatus(db) {
    const modo = getModoDisponivel();
    let indexado = false;
    let totalChunks = 0;

    if (modo === 'llm' && db) {
        try {
            const collection = db.collection(CONFIG.collectionName);
            totalChunks = await collection.countDocuments();
            indexado = totalChunks > 0;
        } catch (err) {
            console.warn(`${LOG_PREFIX} Erro ao verificar chunks: ${err.message}`);
        }
    }

    return {
        disponivel: true,
        modo,
        indexado,
        totalChunks,
        modelo: modo === 'llm' ? CONFIG.model() : 'local',
        embeddingModel: modo === 'llm' ? CONFIG.embeddingModel() : null,
    };
}

function limparCache() {
    cache.flushAll();
    console.log(`${LOG_PREFIX} Cache limpo`);
}

export default {
    isDisponivel,
    isLLMDisponivel,
    getModoDisponivel,
    indexarDocumentos,
    perguntarBot,
    buscarContextoDinamico,
    getStatus,
    limparCache,
};
