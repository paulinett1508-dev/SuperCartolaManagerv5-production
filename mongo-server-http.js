#!/usr/bin/env node

/**
 * MCP Server para MongoDB - Super Cartola Manager (HTTP/SSE)
 *
 * Versão remota do mongo-server.js para uso no Claude Code Web.
 * Usa StreamableHTTPServerTransport para suportar clientes remotos.
 *
 * Ferramentas disponíveis:
 * - list_collections: Lista todas as coleções do banco
 * - find_documents: Busca documentos em uma coleção
 * - insert_document: Insere um documento em uma coleção
 * - get_collection_schema: Analisa a estrutura de uma coleção
 */

import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import dns from 'dns';

dns.setServers(['8.8.8.8', '8.8.4.4']);

import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { MongoClient } from 'mongodb';
import { z } from 'zod';

// =========================================================================
// Configuração
// =========================================================================

const MONGODB_URI = process.env.MONGO_URI;
const MCP_SECRET_TOKEN = process.env.MCP_SECRET_TOKEN;
const MCP_PORT = parseInt(process.env.MCP_PORT || '3099', 10);

if (!MONGODB_URI) {
  console.error('❌ [MCP MongoDB HTTP] ERRO: MONGO_URI não configurada!');
  process.exit(1);
}

if (!MCP_SECRET_TOKEN) {
  console.error('❌ [MCP MongoDB HTTP] ERRO: MCP_SECRET_TOKEN não configurado!');
  process.exit(1);
}

console.error('✅ [MCP MongoDB HTTP] Iniciando servidor na porta', MCP_PORT);

// =========================================================================
// MongoDB (conexão lazy)
// =========================================================================

let client = null;
let db = null;

async function getDatabase() {
  if (!client) {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db();
    console.error(`[MCP MongoDB HTTP] Conectado ao banco: ${db.databaseName}`);
  }
  return db;
}

// =========================================================================
// Helpers de schema
// =========================================================================

function getValueType(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) {
    if (value.length === 0) return 'array (vazio)';
    return `array<${getValueType(value[0])}>`;
  }
  if (value instanceof Date) return 'Date';
  if (typeof value === 'object') {
    if (value._bsontype === 'ObjectId' || value.constructor?.name === 'ObjectId') return 'ObjectId';
    return 'object';
  }
  return typeof value;
}

function extractSchema(doc, maxDepth = 3, currentDepth = 0) {
  if (currentDepth >= maxDepth) return '(max depth)';
  if (doc === null || doc === undefined) return getValueType(doc);
  if (Array.isArray(doc)) {
    if (doc.length === 0) return [];
    const sample = doc[0];
    if (typeof sample === 'object' && sample !== null) {
      return [extractSchema(sample, maxDepth, currentDepth + 1)];
    }
    return [getValueType(sample)];
  }
  if (typeof doc === 'object') {
    const schema = {};
    for (const [key, value] of Object.entries(doc)) {
      const isObjectId = value?._bsontype === 'ObjectId' || value?.constructor?.name === 'ObjectId';
      if (typeof value === 'object' && value !== null && !Array.isArray(value) && !isObjectId && !(value instanceof Date)) {
        schema[key] = extractSchema(value, maxDepth, currentDepth + 1);
      } else {
        schema[key] = getValueType(value);
      }
    }
    return schema;
  }
  return getValueType(doc);
}

// =========================================================================
// Factory: cria um McpServer com todas as tools
// =========================================================================

function createServer() {
  const server = new McpServer({
    name: 'mongodb-server-http',
    version: '1.0.0',
  });

  // TOOL: list_collections
  server.tool('list_collections', 'Lista todas as coleções do banco de dados MongoDB', {}, async () => {
    try {
      const database = await getDatabase();
      const collections = await database.listCollections().toArray();
      return {
        content: [{ type: 'text', text: JSON.stringify(collections.map(c => ({ name: c.name, type: c.type })), null, 2) }]
      };
    } catch (error) {
      return { content: [{ type: 'text', text: `Erro ao listar coleções: ${error.message}` }], isError: true };
    }
  });

  // TOOL: find_documents
  server.tool(
    'find_documents',
    'Busca documentos em uma coleção do MongoDB. Use query em formato JSON para filtrar.',
    {
      collection: z.string().describe('Nome da coleção'),
      query: z.string().default('{}').describe('Query em formato JSON (ex: {"nome": "João"})'),
      limit: z.number().default(10).describe('Número máximo de documentos a retornar')
    },
    async ({ collection, query, limit }) => {
      try {
        const database = await getDatabase();
        let parsedQuery;
        try {
          parsedQuery = JSON.parse(query);
        } catch (e) {
          return { content: [{ type: 'text', text: `Erro ao parsear query JSON: ${e.message}` }], isError: true };
        }
        const documents = await database.collection(collection).find(parsedQuery).limit(limit).toArray();
        return { content: [{ type: 'text', text: JSON.stringify(documents, null, 2) }] };
      } catch (error) {
        return { content: [{ type: 'text', text: `Erro ao buscar documentos: ${error.message}` }], isError: true };
      }
    }
  );

  // TOOL: insert_document
  server.tool(
    'insert_document',
    'Insere um novo documento em uma coleção do MongoDB',
    {
      collection: z.string().describe('Nome da coleção'),
      document: z.string().describe('Documento em formato JSON a ser inserido')
    },
    async ({ collection, document }) => {
      try {
        const database = await getDatabase();
        let parsedDocument;
        try {
          parsedDocument = JSON.parse(document);
        } catch (e) {
          return { content: [{ type: 'text', text: `Erro ao parsear documento JSON: ${e.message}` }], isError: true };
        }
        const result = await database.collection(collection).insertOne(parsedDocument);
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: true, insertedId: result.insertedId, acknowledged: result.acknowledged }, null, 2) }]
        };
      } catch (error) {
        return { content: [{ type: 'text', text: `Erro ao inserir documento: ${error.message}` }], isError: true };
      }
    }
  );

  // TOOL: get_collection_schema
  server.tool(
    'get_collection_schema',
    'Analisa a estrutura de uma coleção lendo documentos de amostra e retornando as chaves e tipos de dados',
    {
      collection: z.string().describe('Nome da coleção'),
      sampleSize: z.number().default(5).describe('Número de documentos de amostra para analisar')
    },
    async ({ collection, sampleSize }) => {
      try {
        const database = await getDatabase();
        const samples = await database.collection(collection).find({}).limit(sampleSize).toArray();
        if (samples.length === 0) {
          return { content: [{ type: 'text', text: `A coleção "${collection}" está vazia ou não existe.` }] };
        }
        const totalCount = await database.collection(collection).countDocuments();
        const schema = extractSchema(samples[0]);
        const allKeys = new Set();
        samples.forEach(doc => Object.keys(doc).forEach(key => allKeys.add(key)));
        const indexes = await database.collection(collection).indexes();
        const result = {
          collection,
          totalDocuments: totalCount,
          sampledDocuments: samples.length,
          schema,
          allKeys: Array.from(allKeys),
          indexes: indexes.map(idx => ({ name: idx.name, key: idx.key, unique: idx.unique || false })),
          sampleDocument: samples[0]
        };
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return { content: [{ type: 'text', text: `Erro ao analisar schema: ${error.message}` }], isError: true };
      }
    }
  );

  return server;
}

// =========================================================================
// Express + MCP HTTP
// =========================================================================

const app = express();
app.use(express.json());

// Auth middleware — Bearer token ou header X-MCP-Token
app.use('/mcp', (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const tokenHeader = req.headers['x-mcp-token'];
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const token = bearerToken || tokenHeader;

  if (token !== MCP_SECRET_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// Sessões ativas
const transports = {};

// POST /mcp — nova sessão ou request existente
app.post('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  try {
    if (sessionId && transports[sessionId]) {
      await transports[sessionId].handleRequest(req, res, req.body);
      return;
    }

    if (!sessionId && isInitializeRequest(req.body)) {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          transports[id] = transport;
          console.error(`[MCP MongoDB HTTP] Sessão iniciada: ${id}`);
        }
      });

      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid && transports[sid]) {
          delete transports[sid];
          console.error(`[MCP MongoDB HTTP] Sessão encerrada: ${sid}`);
        }
      };

      const server = createServer();
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    res.status(400).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Bad Request: sem session ID válido' }, id: null });
  } catch (error) {
    console.error('[MCP MongoDB HTTP] Erro no POST /mcp:', error);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
    }
  }
});

// GET /mcp — SSE streaming
app.get('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  if (!sessionId || !transports[sessionId]) {
    return res.status(400).send('Session ID inválido ou ausente');
  }
  await transports[sessionId].handleRequest(req, res);
});

// DELETE /mcp — encerrar sessão
app.delete('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  if (!sessionId || !transports[sessionId]) {
    return res.status(400).send('Session ID inválido ou ausente');
  }
  try {
    await transports[sessionId].handleRequest(req, res);
  } catch (error) {
    console.error('[MCP MongoDB HTTP] Erro ao encerrar sessão:', error);
    if (!res.headersSent) res.status(500).send('Erro ao encerrar sessão');
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', sessions: Object.keys(transports).length });
});

// =========================================================================
// Start
// =========================================================================

app.listen(MCP_PORT, '0.0.0.0', (err) => {
  if (err) {
    console.error('[MCP MongoDB HTTP] Falha ao iniciar:', err);
    process.exit(1);
  }
  console.error(`[MCP MongoDB HTTP] Servidor rodando na porta ${MCP_PORT}`);
});

// Cleanup ao encerrar
async function shutdown() {
  console.error('[MCP MongoDB HTTP] Encerrando...');
  for (const id of Object.keys(transports)) {
    try { await transports[id].close(); } catch {}
  }
  if (client) await client.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
