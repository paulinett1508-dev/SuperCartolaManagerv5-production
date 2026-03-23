
# Configuração de Consolidação Automática (VPS)

## Visão Geral

Configura o cron da VPS para executar automaticamente a consolidação de rodadas.

---

## Configuração via crontab

### 1. Editar crontab do root

```bash
crontab -e
```

### 2. Adicionar o job

```cron
# Consolidação de rodadas — toda segunda-feira às 9h (horário de Brasília)
0 9 * * 1 cd /var/www/cartola && docker exec scm-prod node scripts/cron-consolidar-rodadas.js >> /var/log/cron-consolidar.log 2>&1
```

### 3. Confirmar timezone da VPS

```bash
timedatectl | grep "Time zone"
# Deve ser: America/Sao_Paulo
```

Se necessário, ajustar:
```bash
timedatectl set-timezone America/Sao_Paulo
```

---

## Schedules Recomendados

### Consolidação Semanal (Recomendado)
```cron
0 9 * * 1   # Toda segunda-feira às 9h
```

### Consolidação Diária (Alta Frequência)
```cron
0 2 * * *   # Todo dia às 2h da manhã
```

### Sob Demanda
```
POST /api/consolidacao/ligas/:id/rodadas/:rodada/consolidar
```

---

## Monitoramento

### Ver logs
```bash
tail -f /var/log/cron-consolidar.log
```

### Status esperado
```
[CRON-CONSOLIDAÇÃO] Iniciando execução automática...
MongoDB conectado
Mercado FECHADO
Rodada a consolidar: 35
Consolidando rodada 35...
Consolidação concluída com sucesso!
Processo concluído com sucesso!
```

---

## Troubleshooting

### Erro: "LIGA_ID_PRINCIPAL não definida"
- Confirme que a variável está no `.env` e que o container foi reiniciado após a mudança

### Erro: "MongoDB connection failed"
- Verifique `MONGO_URI` no `.env`
- Confirme que o IP da VPS está na whitelist do MongoDB Atlas

### Job não está rodando
```bash
# Ver últimas execuções do cron
grep CRON /var/log/syslog | tail -20

# Listar crons ativos
crontab -l
```

---

## Referências

- [Cron Expression Generator](https://crontab.guru/)
