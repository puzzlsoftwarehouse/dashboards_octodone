# Camada de dados

## Princípio

O dashboard final fala **direto com o gateway dos embedded tools**. O MCP do Octodone é só ferramenta de desenvolvimento: descobrir schema (`get_graphql_schema`), testar queries e tirar amostras (`run_graphql_query`), conferir números.

## Gateway

| Item | Valor |
|---|---|
| GraphQL | `POST /__octodone/graphql` com `{ "query": "..." }` |
| Sessão | `GET /__octodone/session` → `{ user_id, company_id, menu_id }` |
| Header obrigatório | `X-Octodone-Embed: 1` (sem ele o gateway responde 403) |
| Credenciais | `credentials: 'same-origin'` — cookie `__Host-octo-embed` da sessão de quem abriu a ferramenta pelo menu |

- **Permissões = usuário logado.** Nada de token, chave ou usuário de serviço no HTML.
- `company_id` vem **sempre** da sessão. Se não vier, é erro (mensagem pedindo para reabrir pelo menu) — nunca um valor padrão.
- Quando a API não devolve uma entidade relacionada (sem permissão), guarde `null` no lookup e deixe o registro de fora ou com rótulo neutro — decidir com o usuário.

## Modos (`DATA_MODE`)

Os três modos usam **o mesmo formato de item da API**, então a troca muda só a origem.

| Modo | Quando | Origem | Botão Atualizar |
|---|---|---|---|
| `dev` | Fase 1, enquanto o usuário avalia | `DEV_DATA` hardcoded: amostra real do MCP, mesmo formato dos `items` da query | oculto |
| `live` | Fase 2, padrão | gateway, carga incremental por período | visível |
| `snapshot` | Fase 2, quando o usuário disser que outra rotina vai gerar os dados | `SNAPSHOT` injetado no lugar de `/*@@SNAPSHOT@@*/null` com `{ generatedAt, items, lookups }` | oculto |

- Fase 1: tire a amostra com o MCP usando **exatamente** a query que a página vai usar (mesmos campos). Amostra pequena o bastante para o arquivo ficar leve (algumas centenas a poucos milhares de itens), grande o bastante para os gráficos fazerem sentido. Não invente dados.
- Fase 2: `DATA_MODE = 'live'`, `DEV_DATA.items = []`, `DEV_DATA.lookups = {}`. O `build.ps1` recusa gerar `live`/`snapshot` com amostra.
- Snapshot: documente na entrega o contrato do objeto (`generatedAt` ISO, `items`, `lookups`) para quem for escrever a rotina. O carimbo da página mostra "Dados de dd/mm/aaaa, HH:MM" em vez de "ao vivo".

## Paginação, lotes e carga incremental (padrão do Time Tracker)

- Entidade principal: `all(perPage: 5000, page: N, startDate, endDate)` com `totalCount`. Página 1 primeiro, depois as demais com **3 em paralelo** (`pool`).
- Entidades relacionadas: só os ids que ainda não estão no lookup, em **lotes** (`chunks`) via argumento de ids (ex.: `userIds: [...]` 250 por lote, `deliverableIds: [...]` 130 por lote), **2 lotes em paralelo**. Ajuste o tamanho do lote ao limite da query/URL.
- **Carga incremental**: guarda `loadedFrom/loadedTo`; ao ampliar o período, busca só os dias que faltam. As cargas entram numa fila (`chain`) para nunca rodarem duas ao mesmo tempo.
- Cada busca pede **1 dia de folga em cada ponta**, para não depender do fuso que a API usa no filtro. O recorte exato é feito no cliente pelo `day` do registro.
- Registros com `deletedAt` são removidos do store (inclusive se já estavam carregados).
- Atualizar: limpa store e lookups e recarrega o período já carregado até hoje.

## Fuso horário

- Chave de dia (`day`, `'AAAA-MM-DD'`) calculada em **`America/Sao_Paulo`** com `Intl.DateTimeFormat` (cache por hora). Nunca `toISOString().slice(0,10)` em timestamp — isso é UTC e joga trabalho noturno para o dia seguinte.
- "Hoje" (`MAX_DAY`) também no fuso de Brasília.
- Só use outro fuso (ex.: UTC para bater com um relatório antigo) se o usuário pedir, e comente o motivo.

## Regras de negócio

- Ficam todas em `normalize()` (e nos lookups), cada uma com comentário em português dizendo o quê e por quê.
- Se o dashboard substitui um relatório existente (Looker, planilha, SQL), documente no topo do bloco a paridade: qual regra replica qual trecho da fonte antiga, e confira os totais contra ela antes de entregar.
- Nada de regra inventada: o que o usuário não disse vira `// TODO: confirmar` e é listado na entrega.

## Erros

- `ApiError` com mensagens para o usuário final, em português:
  - sem rede: "Sem conexão com a API do Octodone."
  - 401/403: "A sessão do Octodone expirou ou não tem acesso (...). Reabra esta ferramenta pelo menu do Octodone."
  - outros status: "A API do Octodone respondeu com erro N (...)."
  - `errors` do GraphQL: "Erro na consulta à API do Octodone: ..."
- Erro aparece no `loadmsg` (borda `--danger`), a página continua utilizável com o que já foi carregado.
