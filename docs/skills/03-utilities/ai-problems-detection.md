---
name: ai-problems-detection
description: Protocolo de autodiagnostico contra os 5 problemas mais comuns da IA ao programar. Detecta overengineering, codigo duplicado, reinvencao da roda, falta de documentacao e arquivos monoliticos. Use SEMPRE antes de implementar, ao planejar mudancas, quando criar funcoes novas, ao escrever codigo, para revisar implementacoes. Palavras-chave - simples, duplicado, repetido, existe, separar, modular, documentacao, complexo, refatorar, engenharia demais, roda, reutilizar.
allowed-tools: Read, Grep, Glob, Bash, mcp__context7__resolve-library-id, mcp__context7__query-docs, mcp__perplexity__perplexity_ask, mcp__perplexity__perplexity_search
---

# AI Problems Detection - Protocolo Anti-Erros da IA

## MISSAO

Executar 5 verificacoes OBRIGATORIAS antes de escrever qualquer codigo novo. Cada verificacao corresponde a um problema cronico da IA ao programar. Se qualquer verificacao falhar, PARAR e corrigir antes de prosseguir.

---

## REGRA DE OURO

```
╔═══════════════════════════════════════════════════════════════════╗
║  ANTES DE ESCREVER CODIGO, PERGUNTE:                              ║
║                                                                    ║
║  1. Tem um jeito mais simples?          (Overengineering)          ║
║  2. Alguem ja fez isso?                 (Reinventando a roda)      ║
║  3. Tem documentacao pra isso?          (Nao sabe fazer)           ║
║  4. Esse codigo ja existe no projeto?   (Codigo duplicado)         ║
║  5. Deveria separar em mais arquivos?   (Tudo no mesmo lugar)      ║
║                                                                    ║
║  Se respondeu SIM a qualquer uma → PARAR e resolver primeiro       ║
╚═══════════════════════════════════════════════════════════════════╝
```

---

## CHECKLIST RAPIDO (Usar antes de CADA implementacao)

```markdown
□ SIMPLICIDADE: A solucao mais simples que funciona foi considerada?
□ REUTILIZACAO: Busquei no codebase por codigo similar existente?
□ DOCUMENTACAO: Consultei docs oficiais da lib/API envolvida?
□ DUPLICACAO: Verifiquei se funcao/logica similar ja existe no projeto?
□ MODULARIDADE: O arquivo destino ja esta grande demais (>300 linhas)?
```

---

## PROBLEMA 1: OVERENGINEERING

### Sintomas
- Criar abstracoes para uso unico
- Adicionar configurabilidade desnecessaria
- Implementar patterns (Factory, Strategy, Observer) onde um `if` bastaria
- Criar classes onde funcoes simples resolveriam
- Adicionar camadas de indirection sem beneficio claro
- Preparar para "requisitos futuros" que ninguem pediu

### Protocolo de Deteccao

ANTES de implementar, responder:

```markdown
## TESTE DE SIMPLICIDADE

1. NECESSIDADE REAL
   - Quantos lugares vao usar isso? → Se 1, nao abstrair
   - Existe requisito futuro CONCRETO? → Se nao, YAGNI
   - O stakeholder pediu isso? → Se nao, nao fazer

2. ALTERNATIVA SIMPLES
   - Consegue resolver com uma funcao simples? → Preferir
   - Consegue resolver com 3 linhas inline? → Melhor ainda
   - Precisa de classe/pattern? → Provavelmente nao

3. TESTE DO "E SE EU NAO FIZER?"
   - O que acontece se eu NAO criar essa abstração? → Se nada, nao crie
   - O codigo funciona sem essa camada extra? → Se sim, remova
```

### Exemplos Concretos (Super Cartola)

```javascript
// OVERENGINEERED: Factory pattern para criar um tipo de objeto
class ParticipanteFactory {
  static create(type, data) {
    switch(type) {
      case 'normal': return new Participante(data);
      case 'admin': return new AdminParticipante(data);
      default: throw new Error('Unknown type');
    }
  }
}

// SIMPLES: Funcao direta que resolve
function criarParticipante(data) {
  return { ...data, ativo: true, temporada: getCurrentTemporada() };
}
```

```javascript
// OVERENGINEERED: Middleware configuravel generico
function createValidator(schema, options = {}) {
  return (req, res, next) => {
    const { strict = true, partial = false, transform = false } = options;
    // 50 linhas de logica generica...
  };
}

// SIMPLES: Validacao direta no controller
function validarAcertoFinanceiro(req, res, next) {
  const { valor, tipo } = req.body;
  if (!valor || !tipo) return res.status(400).json({ error: 'Campos obrigatorios' });
  next();
}
```

### Comando de Verificacao

```bash
# Detectar sinais de overengineering no codigo que estou escrevendo:

# Classes com um unico metodo (funcao bastava)
grep -rn "class.*{" [arquivo] | while read line; do
  file=$(echo "$line" | cut -d: -f1)
  methods=$(grep -c "async\|function\|=>" "$file" 2>/dev/null)
  if [ "$methods" -le 2 ]; then
    echo "  Classe com poucos metodos (funcao bastava?): $file"
  fi
done

# Patterns desnecessarios
grep -rn "Factory\|Strategy\|Observer\|Singleton\|Builder" --include="*.js" .

# Arquivos de config com uma unica opcao
find . -name "config*.js" -exec wc -l {} \; | awk '$1 < 10'
```

---

## PROBLEMA 2: REINVENTANDO A RODA

### Sintomas
- Implementar manualmente o que uma lib ja faz
- Criar funcoes utilitarias que o JS nativo ja tem
- Reescrever logica de formatacao/validacao existente
- Implementar HTTP client custom quando fetch/axios existe
- Criar sistema de cache quando ja existe no projeto

### Protocolo de Deteccao

ANTES de implementar, verificar em 3 niveis:

```markdown
## TESTE DE REUTILIZACAO

### NIVEL 1: JavaScript Nativo
Verificar se o JS/Node ja tem:
- Array methods: map, filter, reduce, find, some, every, flat, flatMap
- Object methods: entries, keys, values, assign, fromEntries
- String methods: includes, startsWith, padStart, replaceAll
- Date: toLocaleDateString, Intl.DateTimeFormat
- Estruturas: Map, Set, WeakMap, WeakRef
- Utils: structuredClone, crypto.randomUUID, URL, URLSearchParams

### NIVEL 2: Dependencias do Projeto
Verificar no package.json o que JA esta instalado:
```bash
cat package.json | jq '.dependencies, .devDependencies'
```

### NIVEL 3: Documentacao Externa
Se precisa de algo que nao tem no projeto:
```javascript
// Buscar docs oficiais
mcp__context7__resolve_library_id({ query: "[funcionalidade]", libraryName: "[lib]" })
mcp__context7__query_docs({ libraryId: "[id]", query: "[funcionalidade especifica]" })

// Buscar alternativas existentes
mcp__perplexity__perplexity_ask({
  messages: [{ role: "user", content: "Node.js: melhor forma de fazer [X] sem reinventar a roda" }]
})
```
```

### Exemplos Concretos

```javascript
// REINVENTANDO: Funcao custom de deep clone
function deepClone(obj) {
  if (typeof obj !== 'object') return obj;
  const clone = Array.isArray(obj) ? [] : {};
  for (const key in obj) {
    clone[key] = deepClone(obj[key]);
  }
  return clone;
}

// JA EXISTE: JS nativo
const clone = structuredClone(obj);
```

```javascript
// REINVENTANDO: Formatar moeda manualmente
function formatarMoeda(valor) {
  return 'R$ ' + valor.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// JA EXISTE: Intl nativo
const formatarMoeda = (valor) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
```

```javascript
// REINVENTANDO: Rate limiter custom
const requests = {};
function checkRateLimit(ip) {
  if (!requests[ip]) requests[ip] = { count: 0, lastReset: Date.now() };
  // 30 linhas de logica...
}

// JA EXISTE NO PROJETO: express-rate-limit (package.json)
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
```

### Comandos de Verificacao

```bash
# Verificar se funcao que vou criar ja existe como metodo nativo
# Buscar no MDN/Node.js docs via Context7

# Verificar dependencias instaladas
cat package.json | jq -r '.dependencies | keys[]' 2>/dev/null

# Buscar funcoes utilitarias ja existentes no projeto
grep -rn "function format\|function parse\|function valid\|function calc" \
  --include="*.js" utils/ helpers/ services/ lib/ 2>/dev/null

# Verificar se padrao ja implementado
grep -rn "module.exports" utils/ helpers/ lib/ 2>/dev/null | head -20
```

---

## PROBLEMA 3: NAO SABE FAZER (E INVENTA)

### Sintomas
- Usar API/metodo com parametros errados
- Implementar com base em "memoria" ao inves de docs
- Confundir versoes de frameworks
- Assumir comportamento sem verificar
- Gerar codigo que parece certo mas nao funciona

### Protocolo de Deteccao

ANTES de usar qualquer API/lib/metodo desconhecido:

```markdown
## TESTE DE CONHECIMENTO

1. SEI EXATAMENTE como isso funciona?
   - SIM com certeza → Prosseguir
   - ACHO que sei → PARAR, consultar docs
   - NAO sei → PARAR, pesquisar antes

2. QUAL a versao da lib no projeto?
   ```bash
   cat package.json | jq '.dependencies["[lib]"]'
   ```

3. CONSULTAR documentacao oficial:
   ```javascript
   // Docs de frameworks (Context7)
   mcp__context7__resolve_library_id({ query: "[funcionalidade]", libraryName: "[lib]" })
   mcp__context7__query_docs({ libraryId: "[id]", query: "[uso especifico]" })
   ```

4. CONSULTAR informacoes nao-documentadas:
   ```javascript
   // API Cartola, comportamentos especificos (Perplexity)
   mcp__perplexity__perplexity_ask({
     messages: [{ role: "user", content: "[pergunta tecnica especifica]" }]
   })
   ```
```

### Exemplos Concretos

```javascript
// INVENTADO: Parametros errados do MongoDB
await collection.findOneAndUpdate(
  { _id: id },
  { $set: data },
  { returnOriginal: false }  // ERRADO: opcao obsoleta
);

// VERIFICADO NA DOC: Opcao correta
await collection.findOneAndUpdate(
  { _id: id },
  { $set: data },
  { returnDocument: 'after' }  // CORRETO: driver v4+
);
```

```javascript
// INVENTADO: Assume que fetch retorna JSON direto
const data = await fetch('/api/dados');
console.log(data.nome); // undefined! fetch retorna Response, nao JSON

// VERIFICADO: Uso correto
const response = await fetch('/api/dados');
const data = await response.json();
console.log(data.nome);
```

### Sinais de Alerta (Parar e Verificar)

```markdown
PARAR IMEDIATAMENTE quando perceber:
- Usando metodo que "acho" que existe
- Passando parametros "que devem estar certos"
- Copiando pattern de outro projeto sem adaptar
- Usando sintaxe que "lembro" mas nao tenho certeza
- Escrevendo try/catch "por garantia" sem saber o erro
```

### Comandos de Verificacao

```bash
# Verificar versao real das dependencias
node -e "console.log(require('[lib]/package.json').version)"

# Verificar como o projeto JA usa determinada lib
grep -rn "require.*[lib]\|from.*[lib]" --include="*.js" . | head -10

# Ver exemplos reais de uso no codebase
grep -rn "[metodo]" --include="*.js" controllers/ services/ | head -10
```

---

## PROBLEMA 4: CODIGO DUPLICADO

### Sintomas
- Copiar-colar funcoes entre arquivos
- Reescrever logica que ja existe em outro modulo
- Criar helpers identicos em diferentes partes
- Repetir validacoes em multiplos controllers
- Duplicar queries MongoDB com pequenas variacoes

### Protocolo de Deteccao

ANTES de escrever qualquer funcao nova:

```markdown
## TESTE DE DUPLICACAO

1. BUSCAR funcao similar no projeto:
   ```bash
   # Por nome de funcao similar
   grep -rn "function [nomeSimilar]\|[nomeSimilar]\s*=" --include="*.js" .

   # Por logica similar (palavras-chave do que a funcao faz)
   grep -rn "[palavraChave1].*[palavraChave2]" --include="*.js" .

   # Por operacao similar no MongoDB
   grep -rn "\.find\|\.aggregate\|\.updateMany" --include="*.js" . | grep "[collection]"
   ```

2. SE ENCONTRAR codigo similar:
   - E identico? → REUTILIZAR (importar)
   - E 80% similar? → GENERALIZAR em funcao compartilhada
   - E 50% similar? → Avaliar se vale extrair parte comum
   - E <50% similar? → OK criar nova funcao

3. ONDE COLOCAR codigo compartilhado:
   - Logica de negocio → services/
   - Utilitarios puros → utils/ ou helpers/
   - Validacoes → middleware/
   - Formatacao → utils/formatters.js
```

### Exemplos Concretos (Super Cartola)

```javascript
// DUPLICADO: Mesmo calculo em 3 controllers diferentes
// controllers/rankingController.js
function calcularPontos(rodadas) {
  return rodadas.reduce((acc, r) => acc + (r.pontos || 0), 0);
}

// controllers/participanteController.js
function somarPontos(listaRodadas) {
  return listaRodadas.reduce((total, rod) => total + (rod.pontos || 0), 0);
}

// SOLUCAO: Extrair para utils compartilhado
// utils/calculos.js
function calcularPontosTotal(rodadas) {
  return rodadas.reduce((acc, r) => acc + (r.pontos || 0), 0);
}
module.exports = { calcularPontosTotal };
```

```javascript
// DUPLICADO: Query MongoDB repetida com pequenas variacoes
// Em 5 controllers diferentes:
const participantes = await db.collection('times').find({
  liga_id: ligaId,
  temporada: temporada,
  ativo: true
}).toArray();

// SOLUCAO: Funcao no service
// services/participanteService.js
async function getParticipantesAtivos(ligaId, temporada) {
  return await db.collection('times').find({
    liga_id: ligaId,
    temporada: temporada,
    ativo: true
  }).toArray();
}
```

### Comandos de Verificacao

```bash
# Buscar funcoes com nomes similares ao que vou criar
grep -rn "function.*[palavraChave]" --include="*.js" . | grep -v node_modules

# Buscar logica de calculo similar
grep -rn "reduce\|forEach\|map" --include="*.js" controllers/ services/ | grep "[operacao]"

# Buscar queries MongoDB similares
grep -rn "\.find(\|\.findOne(\|\.aggregate(" --include="*.js" . | grep "[collection]"

# Detectar duplicacao com ferramentas (se disponivel)
npx jscpd --min-lines 5 --min-tokens 50 controllers/ services/ 2>/dev/null
```

---

## PROBLEMA 5: TUDO NO MESMO LUGAR

### Sintomas
- Arquivo crescendo alem de 300 linhas
- Misturar UI, logica de negocio e acesso a dados
- Controller fazendo tudo (rota + validacao + query + resposta)
- Frontend com fetch + calculo + DOM manipulation no mesmo lugar
- Funcoes que nao se relacionam juntas no mesmo arquivo

### Protocolo de Deteccao

ANTES de adicionar codigo a um arquivo existente:

```markdown
## TESTE DE MODULARIDADE

1. TAMANHO DO ARQUIVO DESTINO:
   ```bash
   wc -l [arquivo-destino]
   ```
   - < 200 linhas → OK adicionar
   - 200-300 linhas → Avaliar se pertence ali
   - 300-500 linhas → Considerar separar ANTES de adicionar
   - > 500 linhas → OBRIGATORIO separar (usar skill Refactor-Monolith)

2. RESPONSABILIDADES NO ARQUIVO:
   ```bash
   # Contar tipos de operacao no arquivo
   echo "=== ANALISE DE RESPONSABILIDADES ==="
   echo "Manipulacao DOM: $(grep -c 'getElementById\|querySelector\|innerHTML\|classList' [arquivo])"
   echo "Fetch/API: $(grep -c 'fetch\|axios\|XMLHttp' [arquivo])"
   echo "Calculo/Logica: $(grep -c 'function calc\|function process\|function compute\|reduce\|Math\.' [arquivo])"
   echo "Event handlers: $(grep -c 'addEventListener\|onclick\|onchange' [arquivo])"
   echo "MongoDB: $(grep -c '\.find\|\.insert\|\.update\|\.delete\|\.aggregate' [arquivo])"
   ```
   - Se > 2 tipos de responsabilidade → Candidato a separacao

3. A FUNCAO QUE VOU ADICIONAR:
   - Pertence a MESMA responsabilidade do arquivo? → OK
   - E uma responsabilidade DIFERENTE? → Criar arquivo separado
   - Sera usada por OUTROS arquivos? → Colocar em local compartilhado
```

### Exemplos Concretos

```javascript
// MONOLITO: Controller fazendo TUDO
router.post('/acerto', async (req, res) => {
  // Validacao (deveria ser middleware)
  if (!req.body.valor) return res.status(400).json({ error: 'Valor obrigatorio' });

  // Logica de negocio (deveria ser service)
  const saldo = await calcularSaldoAtual(req.params.ligaId, req.body.timeId);
  const novoSaldo = saldo + req.body.valor;

  // Acesso a dados (deveria ser repository/model)
  await db.collection('acertofinanceiros').insertOne({
    liga_id: req.params.ligaId,
    time_id: req.body.timeId,
    valor: req.body.valor,
    data: new Date()
  });

  // Formatacao de resposta (deveria ser separado)
  res.json({
    sucesso: true,
    saldoAnterior: formatarMoeda(saldo),
    saldoAtual: formatarMoeda(novoSaldo)
  });
});

// SEPARADO: Cada camada com sua responsabilidade
// middleware/validators.js → validarAcerto
// services/acertoService.js → registrarAcerto
// controllers/acertoController.js → orquestrar
router.post('/acerto', validarAcerto, acertoController.registrar);
```

### Quando Separar vs Quando Manter Junto

```markdown
## DECISAO: SEPARAR OU NAO?

### SEPARAR QUANDO:
- Arquivo > 300 linhas
- > 2 responsabilidades distintas
- Funcao reutilizada em 2+ lugares
- Equipes diferentes mexem no mesmo arquivo
- Teste unitario fica dificil

### MANTER JUNTO QUANDO:
- Arquivo < 200 linhas
- Tudo fortemente acoplado
- Unico consumidor
- Separar criaria mais complexidade que simplificaria
- So 1 pessoa mexe no arquivo

### NUNCA:
- Criar arquivo com 1 funcao de 10 linhas
- Separar por "padrao" sem beneficio concreto
- Criar camada de abstração que so repassa chamadas
```

### Comandos de Verificacao

```bash
# Listar arquivos grandes (candidatos a separacao)
find . -name "*.js" ! -path "./node_modules/*" -exec wc -l {} \; | \
  sort -rn | awk '$1 > 300 {print "  " $1 " linhas: " $2}' | head -15

# Analisar responsabilidades de um arquivo especifico
echo "=== RADIOGRAFIA: [arquivo] ==="
echo "Total linhas: $(wc -l < [arquivo])"
echo "Funcoes: $(grep -c 'function\|=>' [arquivo])"
echo "DOM: $(grep -c 'getElementById\|querySelector\|innerHTML' [arquivo])"
echo "API: $(grep -c 'fetch\|axios' [arquivo])"
echo "DB: $(grep -c '\.find\|\.insert\|\.update\|\.aggregate' [arquivo])"
echo "Events: $(grep -c 'addEventListener\|on[A-Z]' [arquivo])"
```

---

## FLUXO COMPLETO DE VERIFICACAO

### Antes de Escrever Qualquer Codigo Novo

```
┌─────────────────────────────────┐
│  RECEBEU TAREFA DE IMPLEMENTAR  │
└──────────────┬──────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│  1. SIMPLICIDADE                  │
│  Tem jeito mais simples?          │
│  → Se SIM: usar o mais simples    │
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│  2. EXISTENCIA NO PROJETO         │
│  Ja existe algo similar?          │
│  → Se SIM: reutilizar/adaptar     │
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│  3. DOCUMENTACAO                  │
│  Sei como fazer ou preciso docs?  │
│  → Se NAO SEI: consultar antes    │
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│  4. DUPLICACAO                    │
│  Vou repetir codigo existente?    │
│  → Se SIM: extrair pra compartilhar│
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│  5. MODULARIDADE                  │
│  Arquivo destino esta grande?     │
│  → Se SIM: separar primeiro       │
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│  TODAS AS 5 VERIFICACOES OK?      │
│  → AGORA pode escrever codigo     │
└──────────────────────────────────┘
```

---

## INTEGRACAO COM OUTRAS SKILLS

| Problema Detectado | Skill para Resolver |
|-------------------|---------------------|
| Arquivo > 500 linhas | `/Refactor-Monolith` |
| Nao sei como API funciona | `/fact-checker` + Context7 |
| Codigo com vulnerabilidades | `/code-inspector` |
| Preciso de docs da API Cartola | `/cartola-api` |
| Feature complexa precisa planejamento | `/workflow` → `/pesquisa` → `/spec` → `/code` |
| Frontend precisa de padrao | `/frontend-crafter` |

---

## METRICAS DE QUALIDADE

### Indicadores de que o protocolo esta funcionando
- Zero funcoes duplicadas criadas
- Zero libs reinventadas
- Zero APIs usadas com parametros errados
- Todos arquivos < 500 linhas
- Toda funcao nova justificada (nao e overengineering)

### Indicadores de que o protocolo FALHOU
- `grep -rn` encontrou funcao quase identica em outro arquivo
- Erro em producao por API/metodo usado errado
- Arquivo cresceu 200+ linhas de uma vez
- Criou abstraction layer que ninguem usa
- Implementou algo que `npm install [lib]` resolvia

---

## PROBLEMA 6: ALUCINACAO DE APIs E FUNCOES (Novo - agnostic-core)

### Sintomas
- IA inventa funcoes, metodos ou parametros que nao existem na lib/framework
- Codigo parece correto mas falha em runtime
- Usa versao de API desatualizada ou inexistente
- Parametros opcionais inventados com nomes plausíveis

### Protocolo de Deteccao

```markdown
## TESTE DE VERACIDADE DE API

- [ ] Toda funcao/metodo gerado foi verificado na documentacao oficial
- [ ] Parametros opcionais verificados (IA frequentemente inventa nomes plausiveis)
- [ ] Versao da biblioteca confirmada (package.json vs docs)
- [ ] Testes executados (nao apenas "parece certo")
```

### Exemplos Concretos (Super Cartola)

```javascript
// ALUCINADO: Parametro que nao existe no MongoDB driver v6
await collection.findOneAndUpdate(
  { _id: id },
  { $set: data },
  { returnOriginal: false }  // OBSOLETO no driver v4+
);

// VERIFICADO NA DOC: Opcao correta
await collection.findOneAndUpdate(
  { _id: id },
  { $set: data },
  { returnDocument: 'after' }  // CORRETO
);
```

```javascript
// ALUCINADO: Metodo inventado do Express
app.useAsync(middleware);  // NAO EXISTE

// CORRETO: Express nao tem async nativo, usar wrapper
import 'express-async-errors'; // Pacote que trata promises
app.use(middleware);
```

### Comandos de Verificacao

```bash
# Verificar versao real da dependencia
node -e "console.log(require('mongoose/package.json').version)"
node -e "console.log(require('express/package.json').version)"

# Verificar como o projeto JA usa determinado metodo
grep -rn "findOneAndUpdate\|findByIdAndUpdate" --include="*.js" controllers/ services/

# Consultar docs via Context7 MCP
# mcp__context7__query_docs({ libraryId: "mongoose", query: "findOneAndUpdate options" })
```

---

## PROBLEMA 7: SEGURANCA E DADOS SENSIVEIS (Novo - agnostic-core)

### Sintomas
- Credenciais hardcoded no codigo
- Dados sensiveis expostos em logs (CPF, email, senhas)
- Queries vulneraveis a injection
- Input do usuario usado sem sanitizacao

### Protocolo de Deteccao

```markdown
## TESTE DE SEGURANCA

- [ ] Alguma string parece uma credencial real (token, key, senha)?
- [ ] Logs incluem dados sensiveis (emails de admin, tokens de sessao)?
- [ ] Input do usuario usado em queries MongoDB sem sanitizacao?
- [ ] req.body/req.params usado diretamente em $where, eval, new RegExp?
```

### Exemplos Concretos (Super Cartola)

```javascript
// INSEGURO: Log expoe dado sensivel
console.log(`Login admin: ${req.session.usuario.email} senha: ${senha}`);

// SEGURO: Log sem dados sensiveis
logger.info(`Login admin: ${req.session.usuario.email} - sucesso`);
```

```javascript
// INSEGURO: RegExp injection via query string
const regex = new RegExp(req.query.busca);  // busca = ".*" retorna tudo
const times = await Time.find({ nome_time: regex, liga_id: ligaId });

// SEGURO: Escapar caracteres especiais
const escaped = req.query.busca.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const regex = new RegExp(escaped, 'i');
const times = await Time.find({ nome_time: regex, liga_id: ligaId });
```

### Comandos de Verificacao

```bash
# Detectar possiveis credenciais hardcoded
grep -rn "api_key\s*=\s*['\"]" --include="*.js" . | grep -v node_modules | grep -v ".example"
grep -rn "password\s*=\s*['\"]" --include="*.js" . | grep -v node_modules | grep -v ".example"

# Detectar logs com dados sensiveis
grep -rn "console\.log.*email\|console\.log.*senha\|console\.log.*token" --include="*.js" controllers/

# Detectar RegExp sem escape
grep -rn "new RegExp(req\." --include="*.js" controllers/ routes/
```

---

## CHECKLIST DE REVISAO DE CODIGO GERADO POR IA (Novo - agnostic-core)

Antes de aceitar qualquer bloco de codigo gerado por IA em producao:

```markdown
□ APIs e metodos verificados na documentacao oficial da versao instalada
□ Sem abstracoes desnecessarias para o caso de uso atual
□ Funcionalidade existente no projeto nao foi duplicada
□ Todo try/catch trata erros de forma adequada (sem catch vazio)
□ Sem credenciais, tokens ou dados sensiveis hardcoded
□ Inputs de usuario validados antes de qualquer operacao
□ Queries MongoDB sanitizadas (sem $where, sem RegExp direto do input)
□ Toda query inclui liga_id (multi-tenant)
□ Pontos truncados com truncarPontosNum, nunca arredondados
□ Material Icons em vez de emojis no HTML
□ Variaveis CSS em vez de cores hardcoded
□ Testes executados (nao apenas revisao visual)
□ Codigo segue convencoes do projeto (nomenclatura PT-BR, .lean() em reads)
```

---

## CHECKLIST DE NOVO ARQUIVO (Novo - agnostic-core)

Antes de criar qualquer arquivo novo no projeto:

```markdown
## PRE-CRIACAO

1. NECESSIDADE
   - [ ] Existe arquivo similar no projeto? (Grep antes de criar)
   - [ ] A funcionalidade pode ser adicionada a arquivo existente?
   - [ ] Se for CSS/HTML → rodar anti-frankenstein ANTES

2. CONVENCOES
   - [ ] Nome em kebab-case? (ex: `saldo-calculator.js`, nao `SaldoCalculator.js`)
   - [ ] Diretorio correto? (controller em controllers/, util em utils/, etc.)
   - [ ] Se frontend → seguir pattern de modulo existente (participante-*.js)

3. VALIDACAO
   - [ ] Arquivo tem menos de 300 linhas?
   - [ ] Single responsibility (uma preocupacao por arquivo)?
   - [ ] Todas dependencias existem no projeto?
```

---

## RED FLAGS DE PRE-IMPLEMENTACAO (Novo - agnostic-core)

Frases que indicam problema iminente — PARAR e reconsiderar:

| Frase | Red Flag | Acao |
|-------|----------|------|
| "Vou criar uma classe base generica..." | Overengineering | Precisa mesmo? Quantos filhos tera? |
| "Vou copiar esse trecho e adaptar..." | Duplicacao | Extrair funcao compartilhada |
| "Depois a gente testa..." | Risco | Testar ANTES de mergear |
| "Acho que esse metodo aceita..." | Alucinacao | Verificar docs ANTES de usar |
| "Vou adicionar nesse arquivo mesmo..." | Monolito | Checar wc -l antes |
| "Vou criar um utils pra isso..." | Duplicacao | Ja existe utils similar? Grep primeiro |

---

**STATUS:** AI PROBLEMS DETECTION - SELF-DIAGNOSTIC PROTOCOL ACTIVE

**Versao:** 2.0 (Enriquecido com anti-patterns do agnostic-core)

**Principio:** "Codigo que nao precisa existir e o melhor codigo."
