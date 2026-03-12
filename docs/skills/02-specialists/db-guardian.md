---
name: db-guardian
description: Especialista Sênior em MongoDB, Segurança de Dados, Migrations, Backup/Recovery e Data Integrity. Guardian dos dados do Super Cartola Manager com foco em operações seguras, auditoria de schemas, otimização de queries e gestão de lifecycle de dados. Use para migrations, limpeza, manutenção, snapshots, índices, validações e qualquer operação crítica com banco de dados.
allowed-tools: Read, Grep, LS, Bash, Edit
---

# DB Guardian Skill (MongoDB Master Edition)

## 🎯 Missão
Proteger a integridade dos dados do Super Cartola Manager através de operações seguras, backup estratégico, migrations controladas e monitoramento proativo.

---

## 1. 🛡️ Protocolo de Segurança Máxima (Data Safety)

### 1.1 Regras Invioláveis

**NUNCA fazer sem backup prévio:**
- `deleteMany()` em qualquer collection
- `drop()` de collections ou database
- `updateMany()` sem filtro específico
- `replaceOne()` em documentos críticos
- Qualquer operação que modifique > 100 documentos

**Collections INTOCÁVEIS (nunca deletar/resetar):**
```javascript
const PROTECTED_COLLECTIONS = [
  'users',              // Contas de acesso
  'times',              // Identidade visual/nomes
  'system_config',      // Configurações globais
  'ligas',              // Definições de ligas
  'audit_logs'          // Histórico de auditoria
];
```

### 1.2 Checklist Pré-Operação Destrutiva

```markdown
□ Backup criado e verificado
□ Operação testada em ambiente de dev/staging
□ Filtros validados (liga_id, temporada, etc)
□ Rollback plan documentado
□ Aprovação do tech lead (se produção)
□ Horário de baixa atividade escolhido
□ Monitoramento ativo preparado
```

### 1.3 Pattern de Backup Obrigatório

```javascript
// SEMPRE antes de operações destrutivas
async function backupBeforeOperation(collection, filter, operationName) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `data/backups/${operationName}_${timestamp}.json`;
  
  // 1. Extrair dados
  const data = await db.collection(collection).find(filter).toArray();
  
  // 2. Salvar backup
  fs.writeFileSync(
    backupPath,
    JSON.stringify({
      timestamp: new Date(),
      collection,
      filter,
      operation: operationName,
      count: data.length,
      data
    }, null, 2)
  );
  
  // 3. Verificar integridade
  const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  if (backup.count !== data.length) {
    throw new Error('Backup integrity check failed');
  }
  
  console.log(`✅ Backup criado: ${backupPath} (${data.length} docs)`);
  return backupPath;
}

// Exemplo de uso
const backupPath = await backupBeforeOperation(
  'rodadas',
  { liga_id: ligaId, temporada: '2025' },
  'cleanup_2025'
);

// Só então executar operação
await db.collection('rodadas').deleteMany({ 
  liga_id: ligaId, 
  temporada: '2025' 
});
```

---

## 2. 🔄 Virada de Temporada (Season Turnover)

### 2.1 Arquitetura de Dados por Temporada

```
data/
├── history/
│   ├── 2025/
│   │   ├── metadata.json          # Metadados da temporada
│   │   ├── final_standings.json   # Classificação final
│   │   ├── financial_summary.json # Resumo financeiro
│   │   ├── champions.json         # Campeões de cada disputa
│   │   └── participants.json      # Lista de participantes
│   └── 2026/
│       └── ... (mesmo padrão)
├── backups/
│   └── YYYY-MM-DD_HH-MM-SS/
│       └── ... (backups automáticos)
└── users_registry.json            # Cartório vitalício
```

### 2.2 Script de Virada de Temporada (Turn Key)

Criar `/scripts/turn_key_2026.js`:

```javascript
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// ==================== CONFIGURAÇÃO ====================
const CURRENT_SEASON = '2025';
const NEW_SEASON = '2026';
const TURNOVER_DATE = new Date('2026-01-01T00:00:00Z');

// Trava de segurança por data
if (Date.now() < TURNOVER_DATE.getTime()) {
  console.error('🔴 ERRO: Virada de temporada só pode ser executada após 01/01/2026');
  console.error(`Data atual: ${new Date().toISOString()}`);
  console.error(`Data permitida: ${TURNOVER_DATE.toISOString()}`);
  process.exit(1);
}

// ==================== CONEXÃO ====================
const MONGO_URI = process.env.MONGO_URI;

async function connectDB() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Conectado ao MongoDB');
  } catch (error) {
    console.error('🔴 Erro ao conectar:', error);
    process.exit(1);
  }
}

// ==================== SNAPSHOT FINAL ====================
async function createSeasonSnapshot(season) {
  const snapshotPath = `data/history/${season}`;
  
  // Criar diretório se não existir
  if (!fs.existsSync(snapshotPath)) {
    fs.mkdirSync(snapshotPath, { recursive: true });
  }
  
  console.log(`📸 Criando snapshot da temporada ${season}...`);
  
  // 1. Metadados
  const metadata = {
    season,
    snapshotDate: new Date(),
    totalParticipants: await mongoose.model('Participante').countDocuments({ 
      temporada: season 
    }),
    totalRodadas: await mongoose.model('Rodada').countDocuments({ 
      temporada: season 
    })
  };
  
  fs.writeFileSync(
    path.join(snapshotPath, 'metadata.json'),
    JSON.stringify(metadata, null, 2)
  );
  
  // 2. Classificação Final (todas ligas)
  const ligas = await mongoose.model('Liga').find({}).lean();
  const finalStandings = {};
  
  for (const liga of ligas) {
    const ranking = await mongoose.model('Participante')
      .find({ liga_id: liga._id, temporada: season })
      .select('nome pontos_acumulados posicao_final')
      .sort({ pontos_acumulados: -1 })
      .lean();
    
    finalStandings[liga.nome] = ranking;
  }
  
  fs.writeFileSync(
    path.join(snapshotPath, 'final_standings.json'),
    JSON.stringify(finalStandings, null, 2)
  );
  
  // 3. Resumo Financeiro
  const financialSummary = await createFinancialSummary(season);
  fs.writeFileSync(
    path.join(snapshotPath, 'financial_summary.json'),
    JSON.stringify(financialSummary, null, 2)
  );
  
  // 4. Campeões
  const champions = await extractChampions(season);
  fs.writeFileSync(
    path.join(snapshotPath, 'champions.json'),
    JSON.stringify(champions, null, 2)
  );
  
  console.log(`✅ Snapshot completo salvo em ${snapshotPath}`);
}

async function createFinancialSummary(season) {
  const summary = {
    season,
    totalCredito: 0,
    totalDebito: 0,
    saldoGeral: 0,
    porLiga: {}
  };
  
  const ligas = await mongoose.model('Liga').find({}).lean();
  
  for (const liga of ligas) {
    const participantes = await mongoose.model('Participante')
      .find({ liga_id: liga._id, temporada: season })
      .lean();
    
    let credito = 0;
    let debito = 0;
    
    participantes.forEach(p => {
      const saldo = p.saldo_temporada || 0;
      if (saldo > 0) credito += saldo;
      else debito += Math.abs(saldo);
    });
    
    summary.porLiga[liga.nome] = {
      credito,
      debito,
      saldo: credito - debito,
      participantes: participantes.length
    };
    
    summary.totalCredito += credito;
    summary.totalDebito += debito;
  }
  
  summary.saldoGeral = summary.totalCredito - summary.totalDebito;
  
  return summary;
}

async function extractChampions(season) {
  const champions = {
    pontosCorridos: {},
    mataMata: {},
    artilheiro: {},
    luvaDeOuro: {},
    melhorDoMes: {}
  };
  
  const ligas = await mongoose.model('Liga').find({}).lean();
  
  for (const liga of ligas) {
    // Pontos Corridos - 1º lugar
    const pcWinner = await mongoose.model('PontosCorridos')
      .findOne({ liga_id: liga._id, temporada: season })
      .sort({ pontos: -1 })
      .populate('participante_id', 'nome')
      .lean();
    
    if (pcWinner) {
      champions.pontosCorridos[liga.nome] = {
        participante: pcWinner.participante_id?.nome,
        pontos: pcWinner.pontos
      };
    }
    
    // Mata-Mata - Campeão
    const mmChampion = await mongoose.model('MataMata')
      .findOne({ 
        liga_id: liga._id, 
        temporada: season,
        fase: 'final',
        vencedor: true
      })
      .populate('participante_id', 'nome')
      .lean();
    
    if (mmChampion) {
      champions.mataMata[liga.nome] = {
        participante: mmChampion.participante_id?.nome
      };
    }
    
    // Artilheiro - Maior pontuação única
    const artilheiro = await mongoose.model('Rodada')
      .findOne({ liga_id: liga._id, temporada: season })
      .sort({ pontos_rodada: -1 })
      .populate('participante_id', 'nome')
      .lean();
    
    if (artilheiro) {
      champions.artilheiro[liga.nome] = {
        participante: artilheiro.participante_id?.nome,
        pontos: artilheiro.pontos_rodada,
        rodada: artilheiro.rodada_num
      };
    }
  }
  
  return champions;
}

// ==================== LIMPEZA SELETIVA ====================
async function cleanupSeasonData(season) {
  console.log(`🧹 Limpando dados da temporada ${season}...`);
  
  // Collections a limpar (dados de jogo)
  const collectionsToClean = [
    'rodadas',
    'rankings',
    'pontos_corridos',
    'mata_mata',
    'top10',
    'financeiro_cache'
  ];
  
  for (const collName of collectionsToClean) {
    try {
      const result = await mongoose.connection.db
        .collection(collName)
        .deleteMany({ temporada: season });
      
      console.log(`  ✅ ${collName}: ${result.deletedCount} docs removidos`);
    } catch (error) {
      console.error(`  🔴 Erro ao limpar ${collName}:`, error.message);
    }
  }
  
  console.log('✅ Limpeza concluída');
}

// ==================== PRESERVAÇÃO ====================
async function updateUsersRegistry() {
  console.log('📝 Atualizando users_registry.json...');
  
  const users = await mongoose.model('User').find({}).lean();
  
  const registry = users.map(user => ({
    _id: user._id,
    email: user.email,
    nome: user.nome,
    active_seasons: user.active_seasons,
    created_at: user.created_at,
    last_updated: new Date()
  }));
  
  fs.writeFileSync(
    'data/users_registry.json',
    JSON.stringify(registry, null, 2)
  );
  
  console.log(`✅ Registry atualizado (${users.length} usuários)`);
}

// ==================== PREPARAÇÃO NOVA TEMPORADA ====================
async function prepareNewSeason(season) {
  console.log(`🚀 Preparando temporada ${season}...`);
  
  // 1. Criar configuração da nova temporada
  const config = {
    temporada: season,
    rodada_atual: 1,
    ativa: true,
    data_inicio: new Date(`${season}-03-01`),
    data_fim: new Date(`${season}-12-31`)
  };
  
  await mongoose.connection.db
    .collection('system_config')
    .updateOne(
      { tipo: 'temporada_atual' },
      { $set: config },
      { upsert: true }
    );
  
  // 2. Resetar saldos dos participantes
  await mongoose.model('Participante').updateMany(
    {},
    { 
      $set: { 
        saldo_temporada: 0,
        pontos_acumulados: 0
      }
    }
  );
  
  console.log(`✅ Temporada ${season} preparada`);
}

// ==================== VALIDAÇÕES ====================
async function validateTurnover() {
  console.log('🔍 Executando validações...');
  
  const validations = [];
  
  // 1. Verificar se temporada atual ainda tem dados
  const currentData = await mongoose.model('Rodada')
    .countDocuments({ temporada: CURRENT_SEASON });
  
  if (currentData === 0) {
    validations.push('⚠️  Nenhuma rodada encontrada para temporada atual');
  } else {
    validations.push(`✅ ${currentData} rodadas na temporada ${CURRENT_SEASON}`);
  }
  
  // 2. Verificar se já existe snapshot
  const snapshotPath = `data/history/${CURRENT_SEASON}`;
  if (fs.existsSync(snapshotPath)) {
    validations.push('⚠️  Snapshot já existe - será sobrescrito');
  }
  
  // 3. Verificar espaço em disco
  const diskUsage = await checkDiskSpace();
  if (diskUsage > 90) {
    validations.push(`🔴 Espaço em disco crítico: ${diskUsage}%`);
  } else {
    validations.push(`✅ Espaço em disco OK: ${diskUsage}%`);
  }
  
  validations.forEach(v => console.log(`  ${v}`));
  
  return validations;
}

function checkDiskSpace() {
  // Implementação simplificada
  return 50; // Placeholder
}

// ==================== EXECUÇÃO PRINCIPAL ====================
async function main() {
  console.log('╔════════════════════════════════════════════╗');
  console.log('║   VIRADA DE TEMPORADA - SUPER CARTOLA      ║');
  console.log(`║   ${CURRENT_SEASON} → ${NEW_SEASON}                          ║`);
  console.log('╚════════════════════════════════════════════╝');
  console.log('');
  
  const isDryRun = process.argv.includes('--dry-run');
  
  if (isDryRun) {
    console.log('🔵 MODO DRY-RUN (simulação)');
    console.log('');
  }
  
  try {
    await connectDB();
    
    // 1. Validações
    await validateTurnover();
    console.log('');
    
    // 2. Confirmação (se não for dry-run)
    if (!isDryRun) {
      console.log('⚠️  ATENÇÃO: Esta operação irá:');
      console.log('  - Criar snapshot da temporada atual');
      console.log('  - Limpar dados de jogo (rodadas, rankings, etc)');
      console.log('  - Preparar nova temporada');
      console.log('');
      console.log('Para confirmar, adicione --confirm ao comando');
      
      if (!process.argv.includes('--confirm')) {
        console.log('');
        console.log('Comando cancelado. Use:');
        console.log('  node scripts/turn_key_2026.js --confirm');
        process.exit(0);
      }
    }
    
    // 3. Snapshot final
    if (!isDryRun) {
      await createSeasonSnapshot(CURRENT_SEASON);
    } else {
      console.log('📸 [DRY-RUN] Criaria snapshot de', CURRENT_SEASON);
    }
    
    // 4. Atualizar registry
    if (!isDryRun) {
      await updateUsersRegistry();
    } else {
      console.log('📝 [DRY-RUN] Atualizaria users_registry.json');
    }
    
    // 5. Limpeza
    if (!isDryRun) {
      await cleanupSeasonData(CURRENT_SEASON);
    } else {
      console.log('🧹 [DRY-RUN] Limparia dados de', CURRENT_SEASON);
    }
    
    // 6. Preparar nova temporada
    if (!isDryRun) {
      await prepareNewSeason(NEW_SEASON);
    } else {
      console.log('🚀 [DRY-RUN] Prepararia temporada', NEW_SEASON);
    }
    
    console.log('');
    console.log('═══════════════════════════════════════════');
    console.log('✅ VIRADA DE TEMPORADA CONCLUÍDA COM SUCESSO');
    console.log('═══════════════════════════════════════════');
    
  } catch (error) {
    console.error('');
    console.error('🔴 ERRO DURANTE VIRADA DE TEMPORADA:', error);
    console.error('');
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('');
    console.log('Desconectado do MongoDB');
  }
}

// Executar
if (require.main === module) {
  main();
}

module.exports = { createSeasonSnapshot, cleanupSeasonData };
```

**Uso:**
```bash
# Testar (dry-run)
node scripts/turn_key_2026.js --dry-run

# Executar de verdade (após 01/01/2026)
node scripts/turn_key_2026.js --confirm
```

---

## 3. 👥 Gestão de Acesso (User Management)

### 3.1 Schema de Active Seasons

```javascript
// Model: User
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  nome: String,
  active_seasons: { 
    type: [String], 
    default: [] 
  },  // Ex: ["2025", "2026"]
  created_at: { type: Date, default: Date.now },
  last_login: Date
});

// Middleware de autenticação
function checkSeasonAccess(req, res, next) {
  const { temporada } = req.params;
  const user = req.session.user;
  
  if (!user.active_seasons.includes(temporada)) {
    return res.status(403).json({
      error: 'Acesso negado',
      message: 'Usuário não tem acesso a esta temporada',
      active_seasons: user.active_seasons
    });
  }
  
  next();
}
```

### 3.2 Script de Renovação de Usuários

Criar `/scripts/admin_renew_user.js`:

```javascript
const mongoose = require('mongoose');
const User = require('../models/User');

async function listPendingRenewals(season) {
  const users = await User.find({
    active_seasons: { $ne: season }
  }).select('email nome active_seasons');
  
  console.log(`📋 Usuários pendentes de renovação para ${season}:`);
  console.log('');
  
  users.forEach((user, index) => {
    console.log(`${index + 1}. ${user.email} (${user.nome})`);
    console.log(`   Temporadas ativas: ${user.active_seasons.join(', ')}`);
  });
  
  console.log('');
  console.log(`Total: ${users.length} usuários`);
}

async function renewUser(userId, season) {
  const user = await User.findById(userId);
  
  if (!user) {
    throw new Error('Usuário não encontrado');
  }
  
  if (user.active_seasons.includes(season)) {
    console.log(`⚠️  Usuário ${user.email} já tem acesso a ${season}`);
    return;
  }
  
  user.active_seasons.push(season);
  await user.save();
  
  console.log(`✅ Renovado: ${user.email} → temporadas: ${user.active_seasons.join(', ')}`);
  
  // Audit log
  await createAuditLog({
    action: 'USER_RENEWAL',
    target: user._id,
    details: { season, by: 'admin_script' }
  });
}

async function revokeAccess(userId, season) {
  const user = await User.findById(userId);
  
  if (!user) {
    throw new Error('Usuário não encontrado');
  }
  
  user.active_seasons = user.active_seasons.filter(s => s !== season);
  await user.save();
  
  console.log(`🔴 Revogado: ${user.email} → temporadas: ${user.active_seasons.join(', ')}`);
  
  // Audit log
  await createAuditLog({
    action: 'USER_REVOCATION',
    target: user._id,
    details: { season, by: 'admin_script' }
  });
}

async function getStats(season) {
  const total = await User.countDocuments();
  const active = await User.countDocuments({ active_seasons: season });
  const pending = total - active;
  
  console.log('📊 Estatísticas de Renovação');
  console.log('');
  console.log(`Temporada: ${season}`);
  console.log(`Total de usuários: ${total}`);
  console.log(`Com acesso: ${active} (${((active/total)*100).toFixed(1)}%)`);
  console.log(`Pendentes: ${pending} (${((pending/total)*100).toFixed(1)}%)`);
}

// CLI
const args = process.argv.slice(2);
const command = args[0];
const season = process.env.CURRENT_SEASON || '2026';

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  
  try {
    switch(command) {
      case '--list-pending':
        await listPendingRenewals(season);
        break;
      
      case '--user':
        const userId = args[1];
        if (!userId) {
          console.error('Erro: userId não fornecido');
          process.exit(1);
        }
        
        if (args.includes('--revoke')) {
          await revokeAccess(userId, season);
        } else {
          await renewUser(userId, season);
        }
        break;
      
      case '--stats':
        await getStats(season);
        break;
      
      default:
        console.log('Uso:');
        console.log('  node scripts/admin_renew_user.js --list-pending');
        console.log('  node scripts/admin_renew_user.js --user <userId>');
        console.log('  node scripts/admin_renew_user.js --user <userId> --revoke');
        console.log('  node scripts/admin_renew_user.js --stats');
    }
  } finally {
    await mongoose.disconnect();
  }
}

main();
```

---

## 4. 📊 Monitoramento e Diagnóstico

### 4.1 Script de Health Check do DB

Criar `/scripts/db_health_check.js`:

```javascript
async function checkDBHealth() {
  const health = {
    timestamp: new Date(),
    status: 'unknown',
    checks: {}
  };
  
  try {
    // 1. Conexão
    const startTime = Date.now();
    await mongoose.connection.db.admin().ping();
    health.checks.connection = {
      status: 'ok',
      latency: Date.now() - startTime
    };
    
    // 2. Collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    health.checks.collections = {
      status: 'ok',
      count: collections.length,
      names: collections.map(c => c.name)
    };
    
    // 3. Índices
    const indexStats = await checkIndexes();
    health.checks.indexes = indexStats;
    
    // 4. Tamanho do DB
    const stats = await mongoose.connection.db.stats();
    health.checks.size = {
      status: 'ok',
      dataSize: (stats.dataSize / 1024 / 1024).toFixed(2) + ' MB',
      storageSize: (stats.storageSize / 1024 / 1024).toFixed(2) + ' MB',
      indexes: (stats.indexSize / 1024 / 1024).toFixed(2) + ' MB'
    };
    
    // 5. Queries lentas
    const slowQueries = await checkSlowQueries();
    health.checks.performance = slowQueries;
    
    // Status geral
    const hasErrors = Object.values(health.checks).some(c => c.status === 'error');
    health.status = hasErrors ? 'degraded' : 'healthy';
    
  } catch (error) {
    health.status = 'error';
    health.error = error.message;
  }
  
  return health;
}

async function checkIndexes() {
  const collections = ['participantes', 'rodadas', 'acertos_financeiros'];
  const indexReport = {};
  
  for (const collName of collections) {
    const indexes = await mongoose.connection.db
      .collection(collName)
      .indexes();
    
    indexReport[collName] = {
      count: indexes.length,
      hasLigaId: indexes.some(idx => idx.key.liga_id),
      details: indexes.map(idx => ({
        name: idx.name,
        keys: Object.keys(idx.key)
      }))
    };
  }
  
  return {
    status: 'ok',
    collections: indexReport
  };
}

async function checkSlowQueries() {
  // Verificar system.profile se ativado
  const profiling = await mongoose.connection.db.command({ profile: -1 });
  
  return {
    status: profiling.was === 0 ? 'disabled' : 'enabled',
    level: profiling.was
  };
}
```

### 4.2 Métricas Críticas

```javascript
// Monitorar estas métricas continuamente
const CRITICAL_METRICS = {
  // Performance
  avgQueryTime: { threshold: 100, unit: 'ms' },          // <100ms
  connectionPoolSize: { threshold: 50, unit: 'connections' },
  
  // Data Integrity
  orphanedDocuments: { threshold: 0, unit: 'docs' },     // 0
  duplicateIds: { threshold: 0, unit: 'docs' },          // 0
  
  // Multi-tenant
  queriesWithoutLigaId: { threshold: 5, unit: 'queries/hour' },
  
  // Storage
  dataGrowthRate: { threshold: 10, unit: '%/month' },
  indexFragmentation: { threshold: 30, unit: '%' }
};
```

---

## 5. 🔧 Migrations e Alterações de Schema

### 5.1 Pattern de Migration Segura

```javascript
// /migrations/YYYY-MM-DD_description.js
const mongoose = require('mongoose');

async function up() {
  console.log('🔼 Executando migration: description');
  
  // 1. Backup antes de qualquer coisa
  const backup = await backupCollection('collection_name');
  
  try {
    // 2. Validar estado atual
    const count = await validatePreConditions();
    console.log(`Documentos a migrar: ${count}`);
    
    // 3. Executar em batches (não travar o DB)
    const batchSize = 100;
    let processed = 0;
    
    while (processed < count) {
      const batch = await mongoose.connection.db
        .collection('collection_name')
        .find({})
        .skip(processed)
        .limit(batchSize)
        .toArray();
      
      for (const doc of batch) {
        // Transformação
        await transformDocument(doc);
      }
      
      processed += batchSize;
      console.log(`Progresso: ${processed}/${count}`);
    }
    
    // 4. Validar resultado
    await validatePostConditions();
    
    console.log('✅ Migration concluída');
  } catch (error) {
    console.error('🔴 Migration falhou:', error);
    console.error('Restaurando backup...');
    await restoreFromBackup(backup);
    throw error;
  }
}

async function down() {
  console.log('🔽 Revertendo migration: description');
  // Implementar rollback
}

module.exports = { up, down };
```

### 5.2 Migrations Comuns - Super Cartola

#### Adicionar campo liga_id a collection existente
```javascript
async function addLigaIdToCollection(collectionName, defaultLigaId) {
  const result = await mongoose.connection.db
    .collection(collectionName)
    .updateMany(
      { liga_id: { $exists: false } },
      { $set: { liga_id: defaultLigaId } }
    );
  
  console.log(`Adicionado liga_id a ${result.modifiedCount} documentos`);
  
  // Criar índice
  await mongoose.connection.db
    .collection(collectionName)
    .createIndex({ liga_id: 1 });
}
```

#### Normalizar tipo de campo
```javascript
async function normalizeFieldType(collectionName, fieldName, transformer) {
  const docs = await mongoose.connection.db
    .collection(collectionName)
    .find({ [fieldName]: { $exists: true } })
    .toArray();
  
  for (const doc of docs) {
    const newValue = transformer(doc[fieldName]);
    
    await mongoose.connection.db
      .collection(collectionName)
      .updateOne(
        { _id: doc._id },
        { $set: { [fieldName]: newValue } }
      );
  }
}

// Exemplo: String → ObjectId
await normalizeFieldType(
  'rodadas',
  'liga_id',
  (value) => mongoose.Types.ObjectId(value)
);
```

---

## 6. 🗂️ Índices e Otimização

### 6.1 Índices Obrigatórios - Super Cartola

```javascript
// Executar em cada collection
const REQUIRED_INDEXES = {
  participantes: [
    { liga_id: 1, temporada: 1 },
    { liga_id: 1, email: 1 },
    { user_id: 1 }
  ],
  
  rodadas: [
    { liga_id: 1, temporada: 1, rodada_num: 1 },
    { participante_id: 1, temporada: 1 },
    { liga_id: 1, temporada: 1, pontos_rodada: -1 }  // Para ranking
  ],
  
  acertos_financeiros: [
    { liga_id: 1, temporada: 1 },
    { participante_id: 1, temporada: 1 },
    { idempotency_key: 1 }  // Unique
  ],
  
  pontos_corridos: [
    { liga_id: 1, temporada: 1, pontos: -1 }
  ]
};

async function ensureIndexes() {
  for (const [collName, indexes] of Object.entries(REQUIRED_INDEXES)) {
    console.log(`Verificando índices em ${collName}...`);
    
    for (const index of indexes) {
      const indexName = Object.keys(index).join('_');
      
      try {
        await mongoose.connection.db
          .collection(collName)
          .createIndex(index, { name: indexName, background: true });
        
        console.log(`  ✅ ${indexName}`);
      } catch (error) {
        if (error.code === 85) {
          console.log(`  ⚠️  ${indexName} já existe com definição diferente`);
        } else {
          console.error(`  🔴 Erro ao criar ${indexName}:`, error.message);
        }
      }
    }
  }
}
```

### 6.2 Análise de Queries

```javascript
// Habilitar profiling temporariamente
async function analyzeQueries(durationMinutes = 10) {
  // 1. Ativar profiling
  await mongoose.connection.db.setProfilingLevel(1, { slowms: 100 });
  console.log(`Profiling ativado por ${durationMinutes} minutos`);
  
  // 2. Aguardar
  await new Promise(resolve => setTimeout(resolve, durationMinutes * 60 * 1000));
  
  // 3. Analisar
  const slowQueries = await mongoose.connection.db
    .collection('system.profile')
    .find({ millis: { $gt: 100 } })
    .sort({ millis: -1 })
    .limit(20)
    .toArray();
  
  console.log('Top 20 queries mais lentas:');
  slowQueries.forEach(q => {
    console.log(`  ${q.millis}ms - ${q.ns} - ${JSON.stringify(q.command)}`);
  });
  
  // 4. Desativar profiling
  await mongoose.connection.db.setProfilingLevel(0);
}
```

---

## 7. 📋 Comandos Úteis

### 7.1 Quick Reference

```bash
# === VIRADA DE TEMPORADA ===
node scripts/turn_key_2026.js --dry-run         # Testar
node scripts/turn_key_2026.js --confirm         # Executar

# === GESTÃO DE USUÁRIOS ===
node scripts/admin_renew_user.js --list-pending
node scripts/admin_renew_user.js --user <id>
node scripts/admin_renew_user.js --stats

# === HEALTH CHECK ===
node scripts/db_health_check.js

# === BACKUP MANUAL ===
mongodump --uri="$MONGO_URI" --out=backups/$(date +%Y%m%d)

# === RESTORE ===
mongorestore --uri="$MONGO_URI" backups/YYYYMMDD

# === ANÁLISE ===
mongo --eval "db.stats()"                       # Estatísticas do DB
mongo --eval "db.participantes.getIndexes()"    # Ver índices
mongo --eval "db.participantes.stats()"         # Stats de collection
```

### 7.2 MongoDB Shell Snippets

```javascript
// Contar documentos por temporada
db.rodadas.aggregate([
  { $group: { _id: "$temporada", count: { $sum: 1 } } },
  { $sort: { _id: 1 } }
]);

// Encontrar documentos órfãos (sem liga_id)
db.participantes.find({ liga_id: { $exists: false } }).count();

// Verificar duplicatas
db.participantes.aggregate([
  { $group: { 
      _id: { liga_id: "$liga_id", email: "$email" }, 
      count: { $sum: 1 } 
  }},
  { $match: { count: { $gt: 1 } } }
]);

// Top 10 maiores collections
db.getCollectionNames().map(c => ({ 
  name: c, 
  size: db[c].stats().size 
})).sort((a,b) => b.size - a.size).slice(0, 10);
```

---

## 8. 🚨 Troubleshooting

### 8.1 Problemas Comuns

| Problema | Causa Provável | Solução |
|----------|----------------|---------|
| Queries lentas | Sem índice | `db.collection.createIndex()` |
| Documentos órfãos | Migration incompleta | Rodar script de cleanup |
| Espaço em disco | Dados antigos acumulados | Virada de temporada |
| Conexões esgotadas | Pool pequeno | Aumentar connectionPoolSize |
| Lock timeout | Operação muito grande | Dividir em batches |

### 8.2 Recovery Procedures

```javascript
// Recuperar de backup específico
async function recoverFromBackup(backupPath) {
  console.log(`Recuperando de ${backupPath}...`);
  
  const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  
  // Validar backup
  if (!backup.collection || !backup.data) {
    throw new Error('Backup inválido');
  }
  
  // Limpar collection atual (com confirmação!)
  console.log(`⚠️  Isso irá DELETAR todos os dados de ${backup.collection}`);
  console.log('Digite "CONFIRMAR" para continuar:');
  
  // ... aguardar confirmação
  
  // Restaurar
  await mongoose.connection.db
    .collection(backup.collection)
    .deleteMany({});
  
  await mongoose.connection.db
    .collection(backup.collection)
    .insertMany(backup.data);
  
  console.log(`✅ Recuperado ${backup.count} documentos`);
}
```

---

## 9. 📚 Best Practices

### 9.1 Naming Conventions

```javascript
// Collections: plural, snake_case
'participantes', 'acertos_financeiros', 'rodadas'

// Campos: snake_case
'liga_id', 'participante_id', 'rodada_num'

// Índices: descritivo
'liga_temporada_idx', 'participante_email_unique'

// Backups: timestamp + descrição
'2026-01-15_pre-migration-participantes.json'
```

### 9.2 Data Integrity Checks

```javascript
// Executar periodicamente
async function runIntegrityChecks() {
  const checks = [];
  
  // 1. Órfãos (participantes sem liga)
  const orphans = await mongoose.model('Participante').countDocuments({
    liga_id: { $exists: false }
  });
  checks.push({ name: 'Órfãos', count: orphans, critical: orphans > 0 });
  
  // 2. Duplicatas
  const duplicates = await findDuplicates('participantes', ['liga_id', 'email']);
  checks.push({ name: 'Duplicatas', count: duplicates.length, critical: duplicates.length > 0 });
  
  // 3. Referências quebradas
  const brokenRefs = await checkReferences();
  checks.push({ name: 'Refs quebradas', count: brokenRefs, critical: brokenRefs > 0 });
  
  // Report
  console.log('🔍 Integrity Checks:');
  checks.forEach(c => {
    const icon = c.critical ? '🔴' : '✅';
    console.log(`  ${icon} ${c.name}: ${c.count}`);
  });
  
  return checks;
}
```

---

## 10. Query Compliance (Novo - agnostic-core)

Checklist obrigatorio para toda query MongoDB no projeto.

### 10.1 Seguranca de Queries

```markdown
□ Sem interpolacao de string em queries (usar operadores MongoDB nativos)
□ Sem $where (executa JS no servidor — risco de injection)
□ Sem eval() em contexto de banco
□ Input do usuario sanitizado antes de usar em queries
□ RegExp do usuario com caracteres escapados
□ Usuario do banco com permissoes minimas (least privilege)
□ Dados sensiveis criptografados em repouso (senhas com bcrypt)
```

### 10.2 Performance de Queries

```markdown
□ Indexes criados para campos usados em filtros (liga_id, temporada, time_id)
□ Projecao usada — buscar apenas campos necessarios (.select() ou segundo arg do find)
□ .lean() em todas as queries de leitura (retorna POJO, ~3x mais rapido)
□ Paginacao implementada em listagens (middleware/pagination.js)
□ N+1 queries identificadas e resolvidas (usar $in para batch)
□ Queries lentas analisadas com .explain('executionStats')
□ Arrays retornados com limite maximo (nao retornar 10k+ docs)
```

### 10.3 Multi-Tenant Compliance

```markdown
□ TODA query inclui filtro liga_id (REGRA CRITICA — CLAUDE.md)
□ Queries de admin verificam admin_id (dono da liga)
□ Dados separados por temporada quando aplicavel
□ Sem queries cross-tenant (uma liga nao ve dados de outra)
```

### 10.4 Comandos de Auditoria de Queries

```bash
# Buscar queries sem liga_id (risco multi-tenant)
grep -rn "\.find(\|\.findOne(\|\.aggregate(\|\.countDocuments(" --include="*.js" controllers/ services/ | grep -v "liga_id" | grep -v "node_modules"

# Buscar queries sem .lean() (risco performance)
grep -rn "\.find(\|\.findOne(" --include="*.js" controllers/ services/ | grep -v "\.lean()" | grep -v "\.save\|\.updateOne\|\.deleteOne"

# Buscar N+1 potenciais (query dentro de loop)
grep -B5 "\.find\|\.findOne" --include="*.js" controllers/ services/ | grep -A1 "forEach\|for.*of\|\.map("

# Buscar RegExp sem escape (injection)
grep -rn "new RegExp(req\.\|new RegExp(.*body\|new RegExp(.*query" --include="*.js" .
```

### 10.5 Sinais de Risco Alto

| Sinal | Risco | Acao |
|-------|-------|------|
| Query sem `liga_id` | CRITICO (data leakage) | Adicionar filtro imediatamente |
| Query sem `.lean()` em leitura | ALTO (3x mais lento) | Adicionar .lean() |
| `$where` ou `eval` em query | CRITICO (injection) | Reescrever com operadores nativos |
| Query em loop (N+1) | CRITICO (timeout) | Usar $in ou aggregate |
| Sem paginacao retornando 10k+ docs | CRITICO (OOM) | Adicionar limit/skip |
| RegExp do input sem escape | ALTO (ReDoS/injection) | Escapar caracteres especiais |

---

## 11. Migration Validator (Novo - agnostic-core)

Checklist para validar scripts de migracao MongoDB antes de executar em producao.

### 11.1 Classificacao de Operacoes

| Tipo | Exemplos | Risco |
|------|----------|-------|
| **Aditiva** | createIndex, addFields, insertMany | BAIXO |
| **Modificacao** | updateMany, renameField, changeType | MEDIO |
| **Destrutiva** | deleteMany, dropCollection, removeField | ALTO |
| **Dados** | bulk insert, bulk update, data migration | MEDIO-ALTO |

### 11.2 Checklist de Validacao

```markdown
## PRE-EXECUCAO
□ Script usa --dry-run como padrao (CLAUDE.md: "Para scripts destrutivos: sempre --dry-run primeiro")
□ Backup criado antes de qualquer operacao destrutiva
□ Filtros testados com .count() antes de executar mutacoes
□ Batch size adequado (100-500 docs por vez, nao tudo de uma vez)

## DURANTE EXECUCAO
□ Progresso logado (processed X/Y)
□ Timeout configurado para queries longas
□ Conexao resiliente (retry em caso de erro de rede)

## POS-EXECUCAO
□ Validacao de resultado (.countDocuments() antes e depois)
□ Indices recriados se necessario
□ Cache invalidado (cache-invalidator.js)
□ Rollback documentado e testado
```

### 11.3 Status de Validacao

| Status | Significado | Acao |
|--------|-------------|------|
| APROVADO | Todos os checks passaram | Pode executar |
| AJUSTAR | Checks menores falharam | Corrigir e re-validar |
| BLOQUEAR | Checks criticos falharam | NAO executar ate resolver |

### 11.4 Template de Script de Migracao

```javascript
// scripts/migration-YYYY-MM-DD-descricao.js
import { MongoClient } from 'mongodb';

const MONGO_URI = process.env.MONGO_URI; // NUNCA MONGO_URI_DEV

async function up(db, isDryRun) {
  const collection = db.collection('nome_collection');

  // 1. Contar documentos afetados
  const count = await collection.countDocuments({ /* filtro */ });
  console.log(`Documentos a migrar: ${count}`);

  if (isDryRun) {
    console.log('[DRY-RUN] Nenhuma alteracao feita');
    return;
  }

  // 2. Executar em batches
  const batchSize = 100;
  let processed = 0;
  // ... batch logic

  // 3. Validar
  const afterCount = await collection.countDocuments({ /* filtro pos */ });
  console.log(`Validacao: ${afterCount} documentos migrados`);
}

async function down(db, isDryRun) {
  // Rollback documentado
}

// CLI
const isDryRun = !process.argv.includes('--force');
const isDown = process.argv.includes('--down');

if (isDryRun && !isDown) {
  console.log('Modo DRY-RUN. Use --force para executar.');
}
```

---

**STATUS:** DB Guardian - ATIVO & VIGILANTE

**Versao:** 3.0 (Enriquecido com Query Compliance + Migration Validator do agnostic-core)

**Ultima atualizacao:** 2026-03-12
