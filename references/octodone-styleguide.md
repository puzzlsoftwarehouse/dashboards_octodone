# Styleguide do Octodone

A fonte da verdade é o código do Octodone, clonado em **`D:\Dev\Octodone`** (o usuário autorizou a leitura). O dashboard precisa parecer parte do produto.

## Primeira execução: extrair e registrar

Se a seção "Tokens extraídos do repositório" abaixo estiver vazia, explore o repo antes de construir:

1. Identifique o stack do front-end (ex.: `package.json`, pastas `src/`, `app/`, `frontend/`, `web/`).
2. Procure a definição de tema/tokens: arquivos de tema (`theme`, `tokens`, `colors`, `palette`, `variables`), configuração do Tailwind (`tailwind.config.*`), CSS com `:root { --... }`, SCSS (`_variables.scss`), ou o tema da biblioteca de componentes (MUI/Chakra/Ant etc.).
3. Procure os componentes equivalentes aos do dashboard: botão, input/date picker, select/multiselect, tabela, abas, card, tooltip, toast, estados vazio/carregando. Anote raio, borda, espaçamento, tipografia, estados (hover, foco, desabilitado) e ícones usados.
4. Procure o logo/ícone e o padrão de cabeçalho dos embedded tools/insights, se existir.
5. **Grave o resultado aqui embaixo** (valores e caminho de cada arquivo-fonte) para as próximas execuções. Se a extração divergir dos tokens de fallback, vale a extração.

Se `D:\Dev\Octodone` não estiver acessível, use os tokens de fallback e avise na entrega que o alinhamento com o repo ficou pendente.

## Tokens extraídos do repositório

_(vazio — preencher na primeira execução, com os caminhos de origem)_

## Tokens de fallback (do dashboard Time Tracker aprovado)

```css
:root{
  --bg:#323233; --topbar:#29292A; --card:#3A3A3C; --card-2:#424245; --field:#2C2C2D;
  --line:#4A4A4E; --line-soft:#404043;
  --ink:#F2F2F3; --ink-2:#C9C9CE; --muted:#9C9CA3; --faint:#76767D;
  --primary:#00BCF2; --primary-hover:#1FC8F8; --primary-ink:#FFFFFF; --brand-blue:#427DFD;
  --row-hover:#434347; --danger:#E5484D;
  --radius:10px; --radius-sm:7px; --shadow:0 8px 28px rgba(0,0,0,.28);
  --font:'Inter',system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  /* séries categóricas para superfície escura */
  --s1:#3987e5; --s2:#d95926; --s3:#199e70; --s4:#c98500;
  --s5:#d55181; --s6:#008300; --s7:#9085e9; --s8:#e66767; --s-other:#6B6B72;
  color-scheme:dark;
}
```

- Fonte: Inter 400–700, embutida em base64 (woff2).
- Logo: hexágono SVG em `#427DFD` com detalhe `#00BCF2`; subtítulo "Octodone · Insights".
- Números sempre com `font-variant-numeric: tabular-nums`.
