# Pauta do Dia — deploy no Netlify

## Estrutura
- `public/index.html` — a página (front-end)
- `netlify/functions/pauta.js` — function que chama a API da Anthropic com a chave em segredo
- `netlify.toml` — configuração do build

## Passo a passo

1. **Suba esta pasta pro Netlify**
   - Mais fácil: entre em https://app.netlify.com, clique em "Add new site" > "Deploy manually" e arraste esta pasta inteira (`pauta-netlify`).
   - Ou, se preferir Git: suba esta pasta pra um repositório e conecte o repo no Netlify.

2. **Configure a variável de ambiente com sua chave da API**
   - No painel do site no Netlify: **Site configuration > Environment variables > Add a variable**
   - Nome: `ANTHROPIC_API_KEY`
   - Valor: sua chave da API da Anthropic (começa com `sk-ant-...`), gerada em https://console.anthropic.com/settings/keys
   - Depois de adicionar, vá em **Deploys** e clique em **Trigger deploy > Deploy site** pra aplicar a variável.

3. **Pronto.** O site vai gerar uma URL tipo `https://seu-site.netlify.app`. Abra e clique em "Atualizar pauta".

## Por que isso funciona (e o jeito antigo não)
No chat do Claude, o botão "Atualizar pauta" funcionava porque o próprio claude.ai interceptava a chamada e usava sua sessão logada pra falar com a API. Isso só existe dentro do ambiente autenticado do chat — um artifact publicado (ou qualquer site fora do claude.ai) não tem esse acesso.

Aqui, quem fala com a API da Anthropic é a Netlify Function (`pauta.js`), rodando no servidor da Netlify, usando a chave guardada como variável de ambiente. O navegador do visitante só fala com essa function (`/.netlify/functions/pauta`), nunca com a Anthropic diretamente — então a chave nunca fica exposta no código do site.

## Custos
Cada clique em "Atualizar pauta" faz uma chamada real à API (com busca na web), que é cobrada na sua conta da Anthropic conforme o uso. Não tem limite de cliques do lado do Netlify, mas vale ficar de olho no consumo em https://console.anthropic.com/settings/usage.
