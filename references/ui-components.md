# Estrutura da página e componentes

Todos já implementados em `assets/template.src.html`. Antes de usar, confira contra o styleguide do repo (`octodone-styleguide.md`): **se o componente do Octodone for diferente, vale o do Octodone** (cores, raio, altura, estados, ícones). O visual do Time Tracker é o ponto de partida, não a regra.

## Esqueleto

```
topbar (sticky, 60px): logo hexágono + título + "Octodone · Insights" | abas | Atualizar · Planilha · CSV (primário)
loadbar (3px, cor primária, progresso real)
main.page
  loadmsg (spinner + texto de progresso / erro)
  section.view#view-<id>   (uma por aba)
    .head      h1 + descrição curta + carimbo [data-stamp]
    .filters   grid auto-fit (min 210px): Período (2 colunas) + MultiSelects
    .kpi       número principal grande + metas (registros, pessoas, dias...)
    .panel     título + contador | tabela ou gráfico
toast
```

- Breakpoints: **900px** (topbar quebra, abas em linha própria, botões só com ícone) e **700px** (período empilhado). Sem rolagem horizontal da página em 390px; tabelas rolam dentro do painel.
- Botões só-ícone no mobile mantêm `title` e `aria-label`.

## MultiSelect (filtro de dimensão)

- Botão mostra "Todos", o item único, ou "primeiro +N" com badge de contagem.
- Popover: busca, "Selecionar visíveis", "Limpar", contador de opções/selecionados.
- Cada opção mostra a métrica do período (ex.: horas) quando `metric: true`.
- Ordem: selecionados primeiro, depois maior métrica, depois alfabética pt-BR.
- Fecha com clique fora ou Esc; reposiciona para a direita perto da borda.
- Opções vêm dos dados do período atual (+ os já selecionados).

## Table

- Cabeçalho fixo; clique ordena (numéricas começam decrescente), seta na cor primária.
- Ordenação com `Intl.Collator('pt-BR', { numeric: true })`; `sortKey` separado do rótulo quando a célula é formatada (datas).
- Paginação 50/100/250/500 (padrão 100), "Mostrando a–b de N linhas".
- Estado vazio: "Nenhum registro para os filtros selecionados."
- Números alinhados à direita, `tabular-nums`; colunas secundárias com `muted`.
- Datas com dia da semana; fim de semana e feriado em vermelho (`dayCell`).

## KPI

- Um número principal (`kpiHtml(label, valor, metas)`) e metas contextuais. Horas: decimal + HH:MM:SS.

## Gráficos (Chart.js 4.4.1)

- Padrões globais: cor `--muted`, fonte da página, `animation: false`, grade `#424246`.
- Cores: primária para série única; `--s1..--s8` para categóricas; `--s-other` para "Outros".
- Barra horizontal (`hBar` + `fillBar`): altura = itens × 24px + 60 (mín. 160), painel com rolagem (máx. 720px), rótulos truncados com tooltip completo.
- Combo barra + linha com dois eixos: ver `comboChart` em `assets/reference-timetracker.js`.
- Tooltip escuro padronizado (`tooltipBase`).
- Gráfico só renderiza em aba visível (ver `update`/`dirty`).

## Feedback

- `busy(on, texto, fração)`: loadbar + loadmsg + página com opacidade + botão Atualizar girando e desabilitado.
- `fail(err)`: mensagem de erro no loadmsg.
- `toast(msg)`: confirmação curta (exportações).
- Carimbo: "Dados ao vivo do Octodone · atualizados às HH:MM" / "Dados de dd/mm/aaaa, HH:MM" (snapshot) / "Dados de desenvolvimento (...)" (dev).
