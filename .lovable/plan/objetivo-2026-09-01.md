## Objetivo
Eliminar os cinco erros restantes do healthcheck da VPS sem alterar a Evolution API ou qualquer recurso do Nexus 33.

## Correções
1. Criar um endpoint interno `/health` no roteador das Edge Functions e testar essa rota pelo Kong, evitando usar uma função de negócio como healthcheck.
2. Tornar a validação REST diagnóstica e estável, usando uma consulta PostgREST real e exibindo o código/corpo quando falhar.
3. Validar Realtime com handshake WebSocket correto, em vez de tratar uma requisição HTTP comum como prova da rota.
4. Adicionar configuração idempotente do proxy Nginx do host para `financeiro.funecob.com.br` e `api.funecob.com.br`, preservando configurações externas e sem tocar na Evolution API.
5. Integrar a correção do proxy ao fluxo de atualização quando `USE_OWN_PROXY=false`, com validação segura e mensagens acionáveis.
6. Validar sintaxe dos scripts/YAML/TypeScript e os cenários dos checks localmente.

## Resultado esperado
`./deploy/update.sh` conclui somente quando REST, Edge Functions, Realtime e os dois endpoints HTTPS responderem corretamente; falhas reais passam a mostrar diagnóstico suficiente para correção, sem falsos negativos.
