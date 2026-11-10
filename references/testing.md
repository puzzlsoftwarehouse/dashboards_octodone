# Ambiente de teste

## Estrutura do projeto de cada dashboard

```
<pasta-do-dashboard>/
  src/<slug>.src.html        ← fonte de edição (cópia adaptada de assets/template.src.html)
  <slug>.html                ← gerado pelo build (o que o usuário publica)
  .claude/
    build.ps1  serve.ps1  mock-gateway.ps1  launch.json   ← de scripts/ da skill
    vendor.html                                           ← de assets/ da skill
    mock-answer.ps1          ← opcional (paginação/lotes realistas)
    fixtures/<Entidade>.json ← respostas reais tiradas com o MCP
```

Preencha os `{{...}}` do `launch.json` (caminho com `/`, como `C:/Users/.../meu-painel`).

## Build

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .claude\build.ps1 -Src src\<slug>.src.html -Out <slug>.html
```

Falha se: faltar o marcador `<!-- @@VENDOR@@ -->`, sobrar `{{...}}` na fonte, ou `DATA_MODE` não for `dev` e o `DEV_DATA` ainda tiver amostra.

## Fase 1 (dev)

`serve.ps1 -File <slug>.html` (porta 8766) e abrir no preview. Não precisa de gateway.

## Fase 2 (live)

`mock-gateway.ps1 -File <slug>.html` (porta 8767). O mock:
- exige `X-Octodone-Embed: 1` (403 sem ele, como o gateway real);
- `/__octodone/session` → `company_id: 1`;
- GraphQL respondido por `mock-answer.ps1` (se existir) ou `fixtures/<Entidade>.json`.
- `-Mode expired` (401), `error` (500), `empty` (listas vazias), `slow` (+1,5 s) para testar os estados.

Para testar paginação e carga incremental de verdade, escreva um `mock-answer.ps1` que filtra pela data e respeita `perPage/page` e as listas de ids — modelo em `assets/reference-mock-answer.ps1`.

## Checklist antes de entregar

- [ ] Abre sem erro no console, nos dois modos usados (dev e o final).
- [ ] Números conferidos contra uma query do MCP (e contra o relatório antigo, se houver).
- [ ] Período: padrão do mês, troca de datas invertidas, ampliar período busca só o que falta (ver log do mock).
- [ ] Cada filtro de cada aba; filtros independentes entre abas; aba lembrada ao recarregar.
- [ ] Ordenação e paginação das tabelas; estado vazio.
- [ ] Gráficos em todas as abas (inclusive abrindo uma aba depois de mudar o filtro).
- [ ] CSV e XLSX da aba atual, com os filtros aplicados, abrindo certo no Excel.
- [ ] Mock `expired`, `error`, `empty`, `slow`: mensagens corretas, página não quebra.
- [ ] 390px de largura: sem rolagem horizontal da página, botões só-ícone.
- [ ] Nada externo: buscar no HTML final por `http://`/`https://` em `src=`/`href=`/`fetch(` (só `/__octodone/*`).
- [ ] Nenhum `{{...}}`; `TODO: confirmar` listados na entrega.
