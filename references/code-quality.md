# Padrões de código

- **Fonte de edição + build**: edite `src/<slug>.src.html` (leve, sem as bibliotecas); gere o `<slug>.html` final com `build.ps1`. Nunca edite à mão o HTML gerado de 1,2 MB.
- Script inteiro numa **IIFE com `'use strict'`**; nada no escopo global.
- **Ordem das seções** (como no template): 1 configuração · 2 DEV_DATA · 3 SNAPSHOT · 4 específico do dashboard (queries, lookups, normalize, DIMS, METRIC) · 5 infra · 6 visões · 7 abas/atualizar/exportação. O que é específico fica em 2, 3, 4 e 6; a infra só muda se houver bug — e aí corrija também o template da skill.
- **Constantes nomeadas no topo** (`PER_PAGE`, `META_BATCH`, `TZ`, `MIN_DAY`...). Nada de número mágico solto. Valor não confirmado → `// TODO: confirmar`.
- **Escape de HTML** (`esc`) em todo texto vindo de dados antes de ir para `innerHTML`. Atributos também.
- **Erros** via `ApiError` com mensagem final para o usuário; erros inesperados viram "Não foi possível carregar os dados: ...".
- **Desempenho**: formatadores `Intl` criados uma vez; caches (datas por extenso, dia por hora, métricas por dimensão por aba); agregações com `Map`; `pool()` para concorrência e `chunks()` para lotes; tabela paginada (nunca renderizar milhares de `<tr>`).
- **Comentários em português**, explicando regra de negócio e decisões não óbvias (o "porquê"), não o óbvio.
- `localStorage` só para conveniência (aba ativa), sempre em `try/catch`.
- Sem dependências externas em tempo de execução: nada de CDN, fontes do Google ou `fetch` fora de `/__octodone/*`.
- Acessibilidade básica: `role="tablist"/"tab"` + `aria-selected`, `aria-label` em campos e botões só-ícone, `role="status"` nas mensagens.
