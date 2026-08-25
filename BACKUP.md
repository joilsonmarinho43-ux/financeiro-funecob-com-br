# BACKUP e RESTORE — FUNecob

Todos os comandos atuam **somente** nos recursos do FUNecob (projeto Compose `funecob`
e volumes `funecob_*`). Nenhum dado de outro projeto da VPS é lido ou alterado.

## Backup

```bash
./deploy/backup.sh
```

Gera `backups/AAAA-MM-DD_HHMMSS/`:

| Arquivo             | Conteúdo                                        |
| ------------------- | ----------------------------------------------- |
| `postgres.sql.gz`   | `pg_dumpall` completo (auth, public, storage)   |
| `storage.tar.gz`    | arquivos dos buckets `logos` e `receipts`       |
| `evolution.tar.gz`  | instâncias/sessões do Evolution API             |
| `mongodb.archive.gz`| base do Evolution API                           |
| `env.enc` / `env.bak` | cópia do `.env`                               |
| `config/`           | `docker-compose.yml`, `Caddyfile`, `kong.yml`   |
| `MANIFEST.txt`      | inventário, commit e status dos containers      |

### Cifrar o `.env` no backup

```bash
export BACKUP_PASSPHRASE='uma-senha-forte'
./deploy/backup.sh          # grava env.enc em vez de env.bak
```

Decifrar:

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -in env.enc -out .env -pass pass:'uma-senha-forte'
```

### Retenção

Backups com mais de 30 dias são removidos automaticamente.
Ajuste com `BACKUP_RETENTION_DAYS` no `.env`.

### Agendamento diário

```bash
crontab -e
# 03:00 todo dia
0 3 * * * cd /root/funecob && BACKUP_PASSPHRASE='...' ./deploy/backup.sh >> /var/log/funecob-backup.log 2>&1
```

### Cópia externa (recomendado)

```bash
rsync -az --delete /root/funecob/backups/ usuario@servidor-remoto:/backups/funecob/
```

## Restore

**Operação destrutiva.** Substitui banco, Storage, Evolution e MongoDB do FUNecob.

```bash
./deploy/restore.sh backups/2026-08-25_120000
```

O script:

1. mostra o `MANIFEST.txt` do backup escolhido;
2. exige que você digite `RESTAURAR` para confirmar;
3. gera um backup de segurança do estado atual **antes** de qualquer alteração;
4. para os serviços de aplicação (o banco continua de pé);
5. restaura PostgreSQL, Storage, Evolution e MongoDB;
6. sobe tudo de novo e roda o healthcheck.

### Restaurar apenas o banco

```bash
docker compose -p funecob stop funecob-rest funecob-edge-functions funecob-web
gunzip -c backups/<pasta>/postgres.sql.gz | \
  docker compose -p funecob exec -T funecob-db psql -U postgres -d postgres
docker compose -p funecob up -d
```

### Restaurar apenas o Storage

```bash
docker run --rm -v funecob_storage_data:/data -v "$PWD/backups/<pasta>":/in:ro alpine \
  sh -c 'rm -rf /data/* && tar xzf /in/storage.tar.gz -C /data'
docker compose -p funecob restart funecob-storage
```

## Teste de restauração

Valide o backup pelo menos uma vez por mês, restaurando em uma VPS de teste
com o mesmo `git clone` + `./deploy/install.sh` + `./deploy/restore.sh`.
Nunca teste restore em produção.
