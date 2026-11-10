# octodone-dashboard

Skill do [Claude Code](https://claude.com/claude-code) que gera **dashboards HTML para o Octodone** (embedded tools / Insights) no padrão visual do produto: dados pelo gateway `/__octodone/graphql`, filtros, KPIs, gráficos e exportação CSV/XLSX.

O ponto de partida é o dashboard **Time Tracker**, já aprovado. Template, regras e scripts incorporam as correções decididas depois dele, então todo dashboard novo já nasce com a mesma base.

## O que ela entrega

Para cada dashboard, a skill cria uma pasta com:

```
<pasta-do-dashboard>/
  <slug>.html            ← arquivo final, único e autocontido (é o que você publica)
  src/<slug>.src.html    ← fonte de edição
  .claude/               ← build, servidor local, mock do gateway, fixtures
```

- **Um único `.html` autocontido**: a fonte Inter, o Chart.js 4.4.1 e o SheetJS 0.18.5 vão embutidos. Nenhum CDN e nenhuma requisição fora de `/__octodone/*`.
- **Sem publicação automática.** A skill nunca chama `publish_embedded_tool_site`; quem publica é o dev.

## Instalação

A pasta da skill precisa se chamar `octodone-dashboard` e ficar dentro de `~/.claude/skills/`.

**Windows (PowerShell):**

```powershell
git clone https://github.com/puzzlsoftwarehouse/dashboards_octodone.git "$env:USERPROFILE\.claude\skills\octodone-dashboard"
```

**macOS / Linux:**

```bash
git clone https://github.com/puzzlsoftwarehouse/dashboards_octodone.git ~/.claude/skills/octodone-dashboard
```

Para usar a skill só em um projeto, clone em `<projeto>/.claude/skills/octodone-dashboard`.

Abra uma nova sessão do Claude Code e confira se `octodone-dashboard` aparece na lista de skills. Para atualizar, rode `git pull` dentro da pasta.

### Pré-requisitos

| Item | Para quê |
|---|---|
| Claude Code (CLI, desktop ou IDE) | Rodar a skill |
| **Conector MCP do Octodone** | Consultar o schema GraphQL e tirar amostras reais durante o desenvolvimento (`get_graphql_schema`, `run_graphql_query`) |
| **Windows PowerShell 5.1+** | Os scripts de build, servidor e mock são `.ps1` |
| Clone do repositório do Octodone *(opcional)* | Extrair os tokens visuais do produto (ver [Styleguide](#styleguide)) |

## Como usar

Peça no Claude Code, por exemplo:

> Crie um dashboard do Octodone com as horas por cliente e por usuário no mês, com filtro de job e exportação.

Também dá para chamar a skill direto com `/octodone-dashboard`.

Antes de construir, a skill pergunta só o que faltar no pedido:

1. **Fonte de dados**: entidades, queries e campos do Octodone.
2. **Modo final**: `live` (a página consulta o gateway, é o padrão) ou `snapshot` (outra rotina gera os dados periodicamente).
3. **Regras de negócio**: filtros fixos, agregações, exclusões, relatório que está sendo substituído.
4. **Abas, filtros, KPIs e gráficos.**
5. **Exportação**: sempre incluída, a não ser que você diga que não quer.

Nada é inventado. Um valor que você não informou (datas mínimas, ids, `company_id`) vira uma constante `// TODO: confirmar` e aparece listado na entrega.

## Fluxo de trabalho

1. **Styleguide**: aplica os tokens visuais do Octodone.
2. **Projeto**: copia o template e os scripts para a pasta do dashboard.
3. **Schema e amostra**: usa o MCP para descobrir tipos e paginação e tirar uma amostra real com a mesma query que a página vai usar.
4. **Fase 1 (dev)**: `DATA_MODE = 'dev'`, com a amostra embutida. Roda localmente na porta 8766 para você testar.
5. **Fase 2 (fonte real)**: com o seu aval, passa para `live` ou `snapshot` e testa contra o mock do gateway (porta 8767), que simula sessão expirada, erro, lista vazia e lentidão.
6. **Verificação**: checklist completo de [`references/testing.md`](references/testing.md), com os números conferidos contra o MCP.
7. **Entrega**: o `.html` final mais a fonte e um resumo com as decisões tomadas e os TODOs pendentes.

### Comandos manuais

Dentro da pasta do dashboard:

```powershell
# build (gera o .html final a partir da fonte)
powershell -NoProfile -ExecutionPolicy Bypass -File .claude\build.ps1 -Src src\<slug>.src.html -Out <slug>.html

# servidor local (fase dev, porta 8766)
powershell -NoProfile -ExecutionPolicy Bypass -File .claude\serve.ps1 -File <slug>.html

# mock do gateway (fase live, porta 8767); -Mode expired | error | empty | slow
powershell -NoProfile -ExecutionPolicy Bypass -File .claude\mock-gateway.ps1 -File <slug>.html
```

## Regras que todo dashboard segue

- Arquivo `.html` único, gerado sempre pelo `build.ps1`.
- Só tema escuro, com os tokens do Octodone.
- Permissões do usuário logado (cookie da sessão do embedded tool). O `company_id` vem sempre de `/__octodone/session`.
- Datas agrupadas e "hoje" calculado no fuso `America/Sao_Paulo`.
- Exportação CSV e XLSX da aba atual, com os filtros aplicados.
- Rótulos em português, sem nomes técnicos de coluna.
- Funciona em 390px de largura sem rolagem horizontal.

## Styleguide

A fonte da verdade visual é o código do Octodone. Em [`references/octodone-styleguide.md`](references/octodone-styleguide.md):

- **Tokens de fallback**: as cores, raios e fonte do Time Tracker, usados quando o repositório não está disponível.
- **Tokens extraídos**: na primeira execução com o repositório acessível, a skill extrai os tokens reais e grava nesse arquivo.

> **Atenção:** o caminho do repositório está fixo como `D:\Dev\Octodone` no `SKILL.md` e no styleguide. Se o seu clone estiver em outro lugar, informe o caminho no pedido. Se os tokens extraídos já estiverem gravados no arquivo, o clone não é necessário.

Quando alguém extrair os tokens, vale abrir um PR com o `octodone-styleguide.md` atualizado, para que todos usem os mesmos valores.

## Estrutura do repositório

```
SKILL.md                          instruções que o Claude carrega
assets/
  template.src.html               ponto de partida de todo dashboard (tema, componentes, dados, exportação)
  vendor.html                     Inter + Chart.js + SheetJS embutidos (1,1 MB, não editar)
  reference-timetracker.js        script completo do Time Tracker, como exemplo real
  reference-mock-answer.ps1       exemplo de mock com paginação e lotes
references/
  octodone-styleguide.md          tokens visuais e como extraí-los do repositório
  data-layer.md                   gateway, modos, paginação, lotes, carga incremental, fuso, erros
  ui-components.md                esqueleto da página e componentes
  ux-rules.md                     período, abas, datas, feriados, exportação
  code-quality.md                 padrões de código
  testing.md                      estrutura do projeto, build, servidor, mock, checklist
scripts/
  build.ps1  serve.ps1  mock-gateway.ps1  launch.json
```

## Contribuindo

- **Bug na infraestrutura do template** (camada de dados, exportação): corrija em `assets/template.src.html` para que os próximos dashboards já nasçam corrigidos.
- **Nova regra ou padrão** decidido em um dashboard: registre no arquivo certo de `references/`.
- O `README.md` é só para pessoas; o Claude lê o `SKILL.md` e os arquivos que ele referencia.
