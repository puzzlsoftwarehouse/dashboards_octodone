# Regras de UX

## Período
- Padrão: **dia 1 do mês atual até hoje** (no fuso de Brasília).
- `max` = hoje. `min` = `MIN_DAY` só se o usuário definir (senão sem limite, `// TODO: confirmar`).
- Se o início ficar depois do fim, troca as datas (e atualiza os campos).
- Ampliar o período dispara carga incremental (`live`); reduzir só refiltra.

## Abas
- Cada aba tem **filtros independentes** (período e dimensões).
- Aba ativa lembrada em `localStorage` (chave `octo-<slug>-tab`), sempre dentro de `try/catch`.
- Abas ocultas não renderizam: ficam `dirty` e desenham ao abrir (Chart.js precisa de caixa visível).

## Datas e números (pt-BR)
- Datas por extenso ("3 de novembro de 2026") ou `dd/mm/aaaa`, sempre com dia da semana abreviado.
- Fim de semana e **feriados nacionais** em vermelho; feriado com `title` do nome. Feriados calculados: fixos (Lei 662/49, 6.802/80, 14.759/23 — Consciência Negra a partir de 2024) + Sexta-feira Santa pela Páscoa.
- Números com `Intl.NumberFormat('pt-BR')`; moeda em BRL; horas como `1.234,50 h` e `HH:MM:SS`.

## Rótulos
- Português, legíveis, sem nomes técnicos de coluna (`hours_worked`, `work_date`) — salvo pedido do usuário.
- Textos de erro/estado só descrevem situações que podem de fato acontecer no código.

## Exportação (obrigatória, salvo pedido em contrário)
- Botões **Planilha** (.xlsx) e **CSV** (primário) na topbar.
- Exporta a **aba atual com os filtros atuais**, as mesmas linhas da tela (inclusive a ordenação da tabela).
- Cada aba define `exportData(v)` → `[{ name, cols, rows }]`; várias tabelas = várias planilhas no XLSX / blocos com título no CSV.
- CSV: separador `;`, vírgula decimal, BOM UTF-8, CRLF (abre certo no Excel pt-BR).
- XLSX: nome de planilha até 31 caracteres, largura de coluna automática (máx. 60).
- Nome do arquivo: `<Dashboard> - <Aba> - <de> a <até>` sem caracteres inválidos.
- Datas exportadas em `dd/mm/aaaa` (ou ISO se o usuário pedir) + coluna "Dia da semana" quando a data for dimensão.
