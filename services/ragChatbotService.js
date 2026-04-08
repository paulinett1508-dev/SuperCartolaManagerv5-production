/**
 * RAG CHATBOT SERVICE v1.0 — "Big Cartola IA"
 * Pipeline RAG com LangChain.js para responder perguntas sobre o app.
 *
 * Arquitetura:
 *   1. Indexacao (one-time): docs + rules → chunks → embeddings → MongoDB
 *   2. Query (per-request): pergunta → contexto dinamico + vector search → LLM → resposta
 *
 * Env: OPENAI_API_KEY (obrigatorio), RAG_MODEL, RAG_EMBEDDING_MODEL, RAG_TOP_K
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
Responda APENAS com base nos documentos fornecidos como contexto e nos dados dinamicos da liga.
Se a pergunta nao pode ser respondida com o contexto disponivel, diga: "Nao encontrei essa informacao nas regras do app."
Responda sempre em portugues brasileiro, de forma clara e objetiva.
Nao invente informacoes. Nao responda sobre assuntos fora do Super Cartola Manager.
Use formatacao simples (sem markdown complexo). Seja conciso.`;

// =====================================================================
// VERIFICAR DISPONIBILIDADE
// =====================================================================
function getApiKey() {
    return process.env.OPENAI_API_KEY || null;
}

function isDisponivel() {
    return !!getApiKey();
}

// =====================================================================
// CLIENTES LANGCHAIN (lazy init)
// =====================================================================
let _llm = null;
let _embeddings = null;
let _mongoClient = null;
let _vectorStore = null;

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

async function getMongoClient() {
    if (!_mongoClient) {
        const uri = process.env.MONGO_URI;
        if (!uri) throw new Error('MONGO_URI nao configurada');
        _mongoClient = new MongoClient(uri);
        await _mongoClient.connect();
    }
    return _mongoClient;
}

async function getVectorStore() {
    if (!_vectorStore) {
        const client = await getMongoClient();
        const collection = client.db().collection(CONFIG.collectionName);
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
 * @param {Object} options - { force: boolean, dryRun: boolean }
 * @returns {Object} { total, chunks, duracao }
 */
async function indexarDocumentos(options = {}) {
    const { force = false, dryRun = false } = options;

    if (!isDisponivel()) {
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

    // 3. Limpar collection se force
    const client = await getMongoClient();
    const collection = client.db().collection(CONFIG.collectionName);

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
}

// =====================================================================
// CONTEXTO DINAMICO (dados live do MongoDB)
// =====================================================================

/**
 * Busca dados atuais da liga e rodada para injetar no prompt.
 * @param {string} ligaId - ID da liga
 * @param {Object} db - Mongoose connection (passado pelo controller)
 * @returns {string} Texto de contexto formatado
 */
async function buscarContextoDinamico(ligaId, db) {
    try {
        const liga = await db.collection('ligas').findOne(
            { _id: new (await import('mongodb')).ObjectId(ligaId) },
            { projection: { nome: 1, temporada: 1, participantes: 1, modulos_ativos: 1, status: 1 } }
        );

        if (!liga) return 'Contexto da liga nao disponivel.';

        const temporada = liga.temporada || new Date().getFullYear();

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
                } else {
                    // Pegar a mais recente passada
                    const passadas = calendario.rodadas
                        .filter(r => new Date(r.fim) < agora)
                        .sort((a, b) => b.rodada - a.rodada);
                    if (passadas[0]) rodadaInfo = `Ultima rodada encerrada: ${passadas[0].rodada}`;
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
                if (mercado.rodada_atual) rodadaInfo = `Rodada atual: ${mercado.rodada_atual}`;
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

        return [
            `CONTEXTO ATUAL DA LIGA:`,
            `- Liga: "${liga.nome}" | Status: ${liga.status || 'ativa'}`,
            `- Temporada: ${temporada}`,
            `- ${rodadaInfo || 'Rodada: nao identificada'}`,
            `- ${mercadoStatus || 'Mercado: status nao disponivel'}`,
            `- Participantes ativos: ${qtdParticipantes}`,
            `- Modulos ativos: ${modulosAtivos}`,
        ].join('\n');
    } catch (error) {
        console.warn(`${LOG_PREFIX} Erro ao buscar contexto dinamico: ${error.message}`);
        return 'Contexto dinamico indisponivel.';
    }
}

// =====================================================================
// PIPELINE RAG — PERGUNTAR
// =====================================================================

/**
 * Responde uma pergunta usando RAG (vector search + contexto dinamico + LLM).
 * @param {string} pergunta - Pergunta do usuario
 * @param {string} ligaId - ID da liga (multi-tenant)
 * @param {Object} db - MongoDB database reference
 * @returns {Object} { resposta, fontes, cached }
 */
async function perguntarBot(pergunta, ligaId, db) {
    if (!isDisponivel()) {
        return { resposta: 'O Big Cartola IA nao esta disponivel no momento (chave de API nao configurada).', fontes: [], cached: false };
    }

    // Cache check
    const cacheKey = `rag_${crypto.createHash('md5').update(`${pergunta}_${ligaId}`).digest('hex')}`;
    const cached = cache.get(cacheKey);
    if (cached) {
        console.log(`${LOG_PREFIX} Cache hit para: "${pergunta.substring(0, 50)}..."`);
        return { ...cached, cached: true };
    }

    try {
        console.log(`${LOG_PREFIX} Processando pergunta: "${pergunta.substring(0, 80)}..."`);

        // 1. Buscar contexto dinamico
        const contextoDinamico = await buscarContextoDinamico(ligaId, db);

        // 2. Vector search — buscar chunks relevantes
        let chunksRelevantes = [];
        let fontes = [];
        try {
            const vectorStore = await getVectorStore();
            const resultados = await vectorStore.similaritySearch(pergunta, CONFIG.topK());
            chunksRelevantes = resultados.map(r => r.pageContent);
            fontes = [...new Set(resultados.map(r => r.metadata?.source).filter(Boolean))];
        } catch (vectorError) {
            console.warn(`${LOG_PREFIX} Vector search falhou (index pode nao existir): ${vectorError.message}`);
            // Continuar sem RAG — responde apenas com contexto dinamico
        }

        // 3. Montar prompt
        const contextChunks = chunksRelevantes.length > 0
            ? `\n\nDOCUMENTOS RELEVANTES:\n${chunksRelevantes.join('\n\n---\n\n')}`
            : '\n\n(Nenhum documento relevante encontrado na base de conhecimento)';

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

        console.log(`${LOG_PREFIX} Resposta gerada (${textoResposta.length} chars, ${fontes.length} fontes)`);
        return { ...resultado, cached: false };

    } catch (error) {
        console.error(`${LOG_PREFIX} Erro no pipeline RAG: ${error.message}`);
        return { resposta: 'Desculpe, ocorreu um erro ao processar sua pergunta. Tente novamente.', fontes: [], cached: false };
    }
}

// =====================================================================
// STATUS & UTILIDADES
// =====================================================================

async function getStatus() {
    const disponivel = isDisponivel();
    let indexado = false;
    let totalChunks = 0;

    if (disponivel) {
        try {
            const client = await getMongoClient();
            const collection = client.db().collection(CONFIG.collectionName);
            totalChunks = await collection.countDocuments();
            indexado = totalChunks > 0;
        } catch {
            // Collection pode nao existir ainda
        }
    }

    return {
        disponivel,
        indexado,
        totalChunks,
        modelo: CONFIG.model(),
        embeddingModel: CONFIG.embeddingModel(),
    };
}

function limparCache() {
    cache.flushAll();
    console.log(`${LOG_PREFIX} Cache limpo`);
}

export default {
    isDisponivel,
    indexarDocumentos,
    perguntarBot,
    buscarContextoDinamico,
    getStatus,
    limparCache,
};
