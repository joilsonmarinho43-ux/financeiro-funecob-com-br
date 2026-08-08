# Backup

## O que precisa de backup

| Item | Onde vive | Criticidade | Frequência |
|---|---|---|---|
| Banco Postgres (clientes, faturas, transações, logs) | Supabase | **Crítica** | Diária |
| Storage `receipts` (comprovantes) | Supabase Storage | Alta | Diária |
| Storage `logos` (marca das organizações) | Supabase Storage | Média | Semanal |
| `.env` da VPS | Servidor | **Crítica** | A cada alteração |
| Secrets das Edge Functions | `supabase secrets` | **Crítica** | A cada alteração |
| Sessões da Evolution API | Volume da Evolution | Alta | Diária (evita reparear) |
| Código | GitHub | — | Já versionado |

## Banco

```bash
# Dump completo
pg_dump "$SUPABASE_DB_URL" -Fc -f funecob-$(date +%F).dump

# Restauração
pg_restore -d "$SUPABASE_DB_URL" --clean --if-exists funecob-2026-01-01.dump
```

Em projetos hospedados também é possível solicitar a exportação de dados pelo
painel do backend (Cloud → Advanced settings → Export data).

## Storage

```bash
supabase storage download --recursive ss://receipts ./backup/receipts
supabase storage download --recursive ss://logos    ./backup/logos
```

## Evolution API

Faça backup do volume de sessões do container da Evolution (normalmente
`evolution_instances` / `evolution_store`):

```bash
docker run --rm -v evolution_instances:/data -v $(pwd):/backup alpine \
  tar czf /backup/evolution-$(date +%F).tar.gz -C /data .
```

## Rotina sugerida

1. Cron diário às 03:00 com `pg_dump` + sincronização do Storage.
2. Retenção: 7 diários, 4 semanais, 12 mensais.
3. Cópia off-site (outro provedor ou object storage).
4. Teste de restauração trimestral em ambiente separado.
5. `.env` e secrets guardados em gerenciador de senhas — **nunca** no Git.
