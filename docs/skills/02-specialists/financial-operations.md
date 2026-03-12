---
name: financial-operations
description: Especialista em Operações Financeiras Seguras - Idempotência, Audit Trail (Follow the Money), Atomicidade MongoDB, Validação de Sessão, Cache Invalidation e Cálculo de Saldo. Use para criar/revisar controllers financeiros, ajustes, acertos, inscrições, extrato ou qualquer operação que envolva dinheiro ou pontos de participantes. Keywords: financeiro, saldo, extrato, ajuste, acerto, inscrição, pagamento, cobrança, débito, crédito, idempotência, follow the money, tesouraria
allowed-tools: Read, Grep, Glob, Bash, TodoWrite
---

# Financial Operations Skill (Super Cartola Manager)

## Missao

Garantir que toda operacao financeira do Super Cartola Manager seja segura, rastreavel, idempotente e auditavel. Zero tolerancia a cobranca duplicada, perda de dados ou inconsistencia de saldo.

---

## 1. Principios Inviolaveis

| Principio | Regra | Consequencia de violacao |
|-----------|-------|--------------------------|
| **Idempotencia** | Toda operacao financeira DEVE ter chave de idempotencia | Cobranca duplicada |
| **Audit Trail** | Toda movimentacao DEVE gerar registro rastreavel | Impossivel auditar |
| **Atomicidade** | Operacoes compostas DEVEM usar transacao ou $inc atomico | Saldo inconsistente |
| **Autenticacao** | Sempre verificar `req.session.usuario` antes de operar | Acesso nao autorizado |
| **Multi-tenant** | Toda query DEVE incluir `liga_id` | Dados de outra liga |
| **Truncamento** | Pontos NUNCA arredondados — sempre `truncarPontosNum()` | Pontos inflacionados |

---

## 2. Idempotencia — Padroes de Chave

### 2.1 Conceito

Operacao idempotente = executar 1x ou 100x produz o mesmo resultado. Implementar via chave unica que previne duplicacao.

### 2.2 Geracao de Chaves por Tipo de Operacao

```javascript
// === INSCRICAO DE TEMPORADA ===
// Chave: liga + time + temporada (um time so se inscreve uma vez por temporada)
const idempotencyKey = `inscricao_${liga_id}_${time_id}_${temporada}`;

// === AJUSTE FINANCEIRO (manual pelo admin) ===
// Chave: liga + time + tipo + rodada + timestamp truncado
// O timestamp truncado (minuto) previne duplo-clique mas permite ajustes diferentes
const minuteTs = Math.floor(Date.now() / 60000);
const idempotencyKey = `ajuste_${liga_id}_${time_id}_${tipo}_${rodada || 'null'}_${minuteTs}`;

// === ACERTO FINANCEIRO (pagamento/quitacao) ===
// Chave: liga + time + temporada + tipo acerto
const idempotencyKey = `acerto_${liga_id}_${time_id}_${temporada}_${tipoAcerto}`;

// === PREMIACAO DE MODULO (Artilheiro, Luva, etc.) ===
// Chave: liga + modulo + temporada + time
const idempotencyKey = `premio_${liga_id}_${modulo}_${temporada}_${time_id}`;

// === COBRANCA POR RODADA (Top10, Pontos Corridos, etc.) ===
// Chave: liga + modulo + temporada + rodada + time
const idempotencyKey = `rodada_${liga_id}_${modulo}_${temporada}_${rodada}_${time_id}`;
```

### 2.3 Verificacao Antes de Inserir

```javascript
// Pattern obrigatorio em todo controller financeiro
async function criarAjusteFinanceiro(dados) {
    const { liga_id, time_id, tipo, valor, rodada, descricao } = dados;

    // 1. Gerar chave de idempotencia
    const idempotencyKey = `ajuste_${liga_id}_${time_id}_${tipo}_${rodada || 'null'}`;

    // 2. Verificar se ja existe
    const existente = await db.collection('ajustesfinanceiros').findOne({
        idempotency_key: idempotencyKey,
        liga_id: liga_id  // SEMPRE incluir liga_id
    });

    if (existente) {
        // Retornar o existente sem criar novo (idempotente)
        return { duplicado: true, registro: existente };
    }

    // 3. Inserir com a chave
    const registro = await db.collection('ajustesfinanceiros').insertOne({
        liga_id,
        time_id,
        tipo,
        valor,
        rodada,
        descricao,
        idempotency_key: idempotencyKey,
        criadoEm: new Date(),
        criadoPor: req.session.usuario.email
    });

    return { duplicado: false, registro };
}
```

### 2.4 Indice Unico para Garantir no Banco

```javascript
// Criar indice unico na collection (fazer uma vez, via migration)
await db.collection('ajustesfinanceiros').createIndex(
    { idempotency_key: 1 },
    { unique: true, sparse: true, name: 'idempotency_unique' }
);
```

---

## 3. Audit Trail — Follow the Money

### 3.1 Principio

**Todo centavo que entra ou sai DEVE ter rastro.** Se alguem perguntar "de onde veio esse debito?", a resposta deve estar no sistema.

### 3.2 Collections Financeiras do Projeto

| Collection | Proposito | Campos-chave |
|------------|-----------|--------------|
| `ajustesfinanceiros` | Ajustes manuais do admin (premiacoes, multas, correcoes) | `liga_id`, `time_id`, `tipo`, `valor`, `rodada`, `descricao` |
| `acertosfinanceiros` | Pagamentos/quitacoes de participantes | `liga_id`, `time_id`, `temporada`, `valor`, `tipo` |
| `extratofinanceirocaches` | Cache consolidado do extrato por participante | `liga_id`, `time_id`, `temporada`, `dados` |
| `inscricoestemporada` | Registro de inscricao com status de pagamento | `liga_id`, `time_id`, `temporada`, `pagouInscricao` |

### 3.3 Modelo de Rastreabilidade

```javascript
// Todo registro financeiro DEVE conter:
const registroFinanceiro = {
    // Identidade
    liga_id: ObjectId,           // OBRIGATORIO — multi-tenant
    time_id: Number,             // Quem foi afetado
    temporada: String,           // "2026"

    // Operacao
    tipo: String,                // "CREDITO", "DEBITO", "AJUSTE", "INSCRICAO", "PREMIO"
    valor: Number,               // Sempre positivo — tipo define direcao
    descricao: String,           // Legivel por humano

    // Contexto
    rodada: Number | null,       // null para premiacoes finais
    modulo: String | null,       // "artilheiro", "luvaDeOuro", etc.

    // Rastreabilidade
    idempotency_key: String,     // Previne duplicacao
    criadoEm: Date,              // Quando
    criadoPor: String,           // Email do admin que criou

    // Referencia cruzada (opcional)
    ref_collection: String,      // Collection de origem
    ref_id: ObjectId             // ID do documento de origem
};
```

### 3.4 Cache de Extrato

```javascript
// Referencia: utils/cache-invalidator.js
// Apos QUALQUER operacao financeira, invalidar o cache do extrato

import { invalidateExtratoCache } from '../utils/cache-invalidator.js';

// Apos inserir ajuste:
await invalidateExtratoCache(liga_id, time_id, temporada);
```

---

## 4. Atomicidade — Operacoes Seguras no MongoDB

### 4.1 Operacoes Atomicas Simples

```javascript
// CORRETO — $inc e atomico (safe para concorrencia)
await db.collection('saldos').updateOne(
    { liga_id, time_id, temporada },
    { $inc: { saldo: valorCredito } }
);

// ERRADO — race condition (ler-modificar-gravar)
const doc = await db.collection('saldos').findOne({ liga_id, time_id });
doc.saldo += valorCredito;  // Outro processo pode ter mudado entre read e write
await db.collection('saldos').updateOne({ _id: doc._id }, { $set: { saldo: doc.saldo } });
```

### 4.2 Transacoes para Operacoes Compostas

```javascript
// Quando a operacao envolve MULTIPLAS collections
const session = client.startSession();

try {
    await session.withTransaction(async () => {
        // 1. Inserir ajuste
        await db.collection('ajustesfinanceiros').insertOne({
            liga_id, time_id, tipo: 'DEBITO', valor, ...
        }, { session });

        // 2. Atualizar saldo
        await db.collection('saldos').updateOne(
            { liga_id, time_id, temporada },
            { $inc: { saldo: -valor } },
            { session }
        );

        // 3. Invalidar cache
        await db.collection('extratofinanceirocaches').deleteOne(
            { liga_id, time_id, temporada },
            { session }
        );
    });
} finally {
    await session.endSession();
}
```

### 4.3 Quando Usar Transacao vs $inc Atomico

| Cenario | Abordagem | Justificativa |
|---------|-----------|---------------|
| Atualizar saldo simples | `$inc` atomico | Uma collection, uma operacao |
| Inserir ajuste + atualizar saldo | Transacao | Duas collections, ambas devem ser consistentes |
| Processar rodada inteira (batch) | Transacao ou bulkWrite | Muitas operacoes, rollback necessario em caso de erro |
| Marcar inscricao como paga | `$set` atomico | Uma collection, um campo |

---

## 5. Validacao e Seguranca

### 5.1 Checklist de Controller Financeiro

```javascript
// controllers/ajusteFinanceiroController.js
export async function criarAjuste(req, res) {
    try {
        // 1. AUTENTICACAO — verificar sessao
        if (!req.session?.usuario) {
            return apiUnauthorized(res, 'Sessao invalida');
        }

        // 2. AUTORIZACAO — admin da liga?
        const liga = await db.collection('ligas').findOne({
            _id: ObjectId(req.params.liga_id),
            admin_id: req.session.usuario._id  // IDOR prevention
        });
        if (!liga) {
            return apiError(res, 'Liga nao encontrada ou sem permissao', 403);
        }

        // 3. VALIDACAO de entrada
        const { time_id, tipo, valor, descricao } = req.body;
        if (!time_id || !tipo || valor === undefined) {
            return apiError(res, 'Campos obrigatorios: time_id, tipo, valor', 400);
        }
        if (typeof valor !== 'number' || isNaN(valor) || valor <= 0) {
            return apiError(res, 'Valor deve ser numero positivo', 400);
        }

        // 4. LIGA_ID — sempre da URL, nunca do body (previne IDOR)
        const liga_id = liga._id;

        // 5. IDEMPOTENCIA — verificar duplicata
        // ... (ver secao 2.3)

        // 6. OPERACAO
        // ... (inserir registro)

        // 7. CACHE — invalidar
        await invalidateExtratoCache(liga_id, time_id, temporada);

        // 8. RESPOSTA padronizada
        return apiSuccess(res, { ajuste: registro }, 'Ajuste criado com sucesso');

    } catch (error) {
        // 9. ERRO — nunca expor stack trace
        console.error('[AjusteFinanceiro] Erro:', error);
        return apiServerError(res, 'Erro ao criar ajuste');
    }
}
```

### 5.2 Prevencao de IDOR (Insecure Direct Object Reference)

```javascript
// ERRADO — time_id vem do body, atacante pode alterar
const time_id = req.body.time_id;
const ajuste = await db.collection('ajustesfinanceiros').findOne({ time_id });

// CORRETO — validar que o time pertence a liga do admin
const time = await db.collection('times').findOne({
    id: req.body.time_id,
    liga_id: liga._id  // Liga que o admin possui
});
if (!time) {
    return apiError(res, 'Time nao encontrado nesta liga', 404);
}
```

### 5.3 Referencia: utils/apiResponse.js

| Funcao | Status | Uso |
|--------|--------|-----|
| `apiSuccess(res, data, msg)` | 200 | Operacao bem-sucedida |
| `apiError(res, msg, status)` | 4xx | Erro de validacao/negocio |
| `apiServerError(res, msg)` | 500 | Erro interno (logar detalhes, nao expor) |
| `apiUnauthorized(res, msg)` | 401 | Sessao invalida/expirada |
| `apiConflict(res, msg)` | 409 | Duplicata/conflito |

---

## 6. Calculo de Saldo

### 6.1 Referencia: utils/saldo-calculator.js

O calculo de saldo NUNCA deve ser feito manualmente no controller. Sempre usar `saldo-calculator.js` para garantir consistencia.

```javascript
import { calcularSaldo } from '../utils/saldo-calculator.js';

// Recalcular saldo completo do participante
const saldo = await calcularSaldo(liga_id, time_id, temporada);
```

### 6.2 Regra de Truncamento em Contexto Financeiro

Quando pontos afetam valores financeiros (ex: premio proporcional a pontuacao):

```javascript
import { truncarPontosNum } from '../utils/type-helpers.js';

// Pontos do participante — TRUNCAR (regra do projeto)
const pontos = truncarPontosNum(rawPontos);  // 93.785 → 93.78

// Valores monetarios (R$) — podem usar toFixed(2) normalmente
const valorPremio = (pontos * valorPorPonto).toFixed(2);
```

---

## 7. Cache Invalidation Apos Operacoes Financeiras

### 7.1 Referencia: utils/cache-invalidator.js

```javascript
// OBRIGATORIO apos qualquer operacao financeira:
import { invalidateExtratoCache } from '../utils/cache-invalidator.js';

// Apos inserir/atualizar/deletar ajuste, acerto ou inscricao:
await invalidateExtratoCache(liga_id, time_id, temporada);

// Se afetou TODOS os participantes (ex: processar rodada):
await invalidateAllExtratosCache(liga_id, temporada);
```

### 7.2 Ordem de Operacoes

```
1. Validar entrada e autorizacao
2. Verificar idempotencia
3. Executar operacao (insert/update)
4. Invalidar cache do extrato
5. Retornar resposta de sucesso
```

Se o passo 4 falhar, o cache ficara stale mas sera regenerado na proxima consulta. O dado financeiro ja estara correto no banco.

---

## 8. Sinais de Risco Alto

### 8.1 Red Flags em Code Review

| Sinal | Risco | Acao |
|-------|-------|------|
| Controller financeiro sem `try/catch` | Erro 500 expoe stack trace | Adicionar tratamento com `apiServerError` |
| Query sem `liga_id` | Vazamento de dados entre ligas | BLOQUEAR merge |
| `findOne` sem validar resultado | `undefined.valor` crasheia | Sempre verificar `if (!doc)` |
| `toFixed(2)` em pontos de participante | Arredondamento proibido | Usar `truncarPontosNum()` |
| Sem chave de idempotencia | Cobranca duplicada | Adicionar chave unica |
| `req.body.liga_id` usado na query | IDOR — atacante troca liga_id | Usar `req.params.liga_id` validado contra sessao |
| Saldo calculado manualmente (soma/subtrai no controller) | Inconsistencia entre controllers | Usar `saldo-calculator.js` |
| Cache nao invalidado apos operacao | Extrato exibe dados antigos | Chamar `invalidateExtratoCache` |
| Operacao composta sem transacao | Dados parciais em caso de erro | Usar `session.withTransaction()` |

### 8.2 Checklist Pre-Deploy Financeiro

```markdown
[ ] Idempotencia: toda operacao tem chave unica?
[ ] Audit trail: todo movimento gera registro rastreavel?
[ ] Autenticacao: req.session.usuario verificado?
[ ] Autorizacao: admin so opera na propria liga?
[ ] liga_id: presente em TODA query?
[ ] Validacao: entrada sanitizada e tipada?
[ ] Erro: try/catch com apiServerError (sem stack trace)?
[ ] Cache: invalidado apos operacao?
[ ] Truncamento: pontos usam truncarPontosNum, nao toFixed?
[ ] Atomicidade: operacoes compostas usam transacao?
```

---

## 9. Modulos de Premiacao Final vs Rodada

### 9.1 Regra Critica

**Modulos de premiacao final** (Artilheiro, Luva de Ouro, Capitao de Luxo, Resta Um, Bolao, Melhor Mes, Tiro Certo):
- Premiacoes entram como `tipo: "AJUSTE"` com `rodada: null`
- Aparecem na secao "Ajustes" do extrato, NAO nas rodadas individuais
- NUNCA criar campos por-rodada para esses modulos

**Modulos por rodada** (Top 10, Pontos Corridos, Mata-Mata, Bonus/Onus de posicao):
- Geram transacoes a cada rodada
- Aparecem no extrato vinculadas a rodada especifica
- Usam chave de idempotencia com numero da rodada

---

**STATUS:** Financial Operations Skill — ATIVO

**Versao:** 1.0

**Ultima atualizacao:** 2026-03-12
