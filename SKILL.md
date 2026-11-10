---
name: octodone-dashboard
description: Cria dashboards HTML autocontidos para o Octodone (embedded tools) seguindo o styleguide do repositório do Octodone, com dados via gateway /__octodone/graphql, filtros, gráficos e exportação CSV/XLSX. Use sempre que pedirem um dashboard, painel, relatório interativo ou "embedded tool" do Octodone/Octo.
---

# Dashboards Octodone

Gera **apenas os arquivos** do dashboard (HTML final + ambiente de teste). A publicação é feita pelo usuário: **nunca publique e nunca chame `publish_embedded_tool_site`**. Na entrega, diga só que está "pronto para você publicar".

Tudo parte de um dashboard aprovado (Time Tracker). O que está aqui já incorpora as correções decididas depois dele.

## O que a skill traz

| Arquivo | Uso |
|---|---|
| `assets/template.src.html` | Ponto de partida de todo dashboard: CSS do tema, componentes, infra de dados (dev/live/snapshot), exportação. Edite as seções marcadas como específicas. |
| `assets/vendor.html` | Bloco embutido (Inter base64 + Chart.js 4.4.1 + SheetJS 0.18.5) que o build injeta. Não abra nem edite (1,1 MB). |
| `assets/reference-timetracker.js` | Script completo do Time Tracker: exemplo real de queries, lookups em lote, várias abas, gráfico combo. Consulte quando precisar de um padrão que o template não mostra. |
| `assets/reference-mock-answer.ps1` | Exemplo real de mock com paginação e lotes. |
| `scripts/` | `build.ps1`, `serve.ps1`, `mock-gateway.ps1`, `launch.json` → copiar para `.claude/` do projeto. |
| `references/` | Regras detalhadas (abaixo). |

## Antes de construir: o que perguntar

Pergunte de uma vez (AskUserQuestion quando disponível) só o que não estiver no pedido:

1. **Fonte de dados**: entidades/queries do Octodone e campos.
2. **Modo final**: `live` (padrão — a página consulta o gateway) ou `snapshot` (outra rotina gera os dados periodicamente).
3. **Regras de negócio**: filtros fixos, agregações, exclusões, como contar; se substitui um relatório existente, qual.
4. **Abas/visões**, filtros de cada uma, KPIs e gráficos.
5. **Exportação**: existe sempre; só pergunte se o usuário indicar que não quer.

Não invente regras de negócio nem valores fixos (datas mínimas, `company_id`, ids). O que não foi dito vira constante no topo com `// TODO: confirmar` e é listado na entrega.

## Fluxo

1. **Styleguide** — leia `references/octodone-styleguide.md`. Se a seção de tokens extraídos estiver vazia, extraia do repositório `D:\Dev\Octodone` como o arquivo descreve e **grave o resultado nele** (em `~/.claude/skills/octodone-dashboard/references/`), para as próximas execuções. Aplique os tokens e ajuste os componentes do template ao que o Octodone usa.
2. **Projeto** — crie a pasta do dashboard: `src/<slug>.src.html` (cópia do template), `.claude/` com `scripts/*` + `assets/vendor.html`. Ver `references/testing.md`.
3. **Schema e amostra** — com o MCP do Octodone (`get_graphql_schema`, `run_graphql_query`) descubra tipos, argumentos e paginação, e tire uma amostra real com a mesma query que a página vai usar. O MCP é só para desenvolvimento: o dashboard final fala direto com o gateway.
4. **Fase 1 (dev)** — `DATA_MODE = 'dev'`, amostra em `DEV_DATA` (formato idêntico ao da API). Implemente `normalize`, lookups, `DIMS`, `METRIC` e as visões. Build + `serve.ps1`, verifique e mostre ao usuário para ele testar.
5. **Fase 2 (fonte real)** — com o aval do usuário: `DATA_MODE = 'live'` (ou `'snapshot'`), esvazie `DEV_DATA`, salve respostas reais em `.claude/fixtures/` e teste com `mock-gateway.ps1` em todos os modos.
6. **Verificação** — checklist de `references/testing.md` completo, números conferidos contra o MCP.
7. **Entrega** — `<slug>.html` + `src/` + `.claude/`. Resposta curta: o que foi feito, decisões tomadas, `TODO: confirmar` pendentes.

## Regras fixas

- **Um único `.html` autocontido.** Nenhum CDN, fonte externa ou `fetch` fora de `/__octodone/*` (o gateway pode bloquear recursos externos). Sempre gerado pelo `build.ps1`.
- **Só tema escuro**, com os tokens do Octodone.
- **Permissões = usuário logado** (cookie da sessão do embedded tool); `company_id` sempre de `/__octodone/session`.
- **Fuso `America/Sao_Paulo`** para agrupar datas e para "hoje", salvo pedido explícito.
- **Exportação CSV e XLSX** em todo dashboard, da aba atual com os filtros atuais.
- **Rótulos em português e legíveis**; sem nomes técnicos de coluna na interface, salvo pedido.
- **Mensagens coerentes com o código**: nenhum texto para situação que não pode acontecer.
- Infra do template (seção 5 e 7) só muda para corrigir bug; se corrigir, avise o usuário que o template da skill também deveria ser atualizado.

## Referências

- `references/octodone-styleguide.md` — como extrair do repo + tokens de fallback.
- `references/data-layer.md` — gateway, modos, paginação, lotes, carga incremental, fuso, erros.
- `references/ui-components.md` — esqueleto da página e componentes.
- `references/ux-rules.md` — período, abas, datas, feriados, exportação.
- `references/code-quality.md` — padrões de código.
- `references/testing.md` — estrutura do projeto, build, servidor, mock, checklist.
