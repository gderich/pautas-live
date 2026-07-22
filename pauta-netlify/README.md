# Pauta do Dia — deploy no Netlify

## Estrutura
- `public/index.html` — a página (front-end)
- `netlify/functions/pauta.js` — function que chama a API do Gemini (Google) com a chave em segredo
- `netlify.toml` — configuração do build

## Passo a passo

1. **Suba esta pasta pro Netlify**
   - Mais fácil: entre em https://app.netlify.com, clique em "Add new site" > "Deploy manually" e arraste esta pasta inteira (`pauta-netlify`).
   - Ou, se preferir Git: suba esta pasta pra um repositório e conecte o repo no Netlify.

2. **Configure a variável de ambiente com sua chave da API**
   - No painel do site no Netlify: **Site configuration > Environment variables > Add a variable**
   - Nome: `GEMINI_API_KEY`
   - Valor: sua chave da API do Gemini, gerada gratuitamente em https://aistudio.google.com/apikey
   - Depois de adicionar, vá em **Deploys** e clique em **Trigger deploy > Deploy site** pra aplicar a variável.

3. **Pronto.** O site vai gerar uma URL tipo `https://seu-site.netlify.app`. Abra e clique em "Atualizar pauta".

## Por que isso funciona (e o jeito antigo não)
No chat do Claude, o botão "Atualizar pauta" funcionava porque o próprio claude.ai interceptava a chamada e usava sua sessão logada pra falar com a API. Isso só existe dentro do ambiente autenticado do chat — um artifact publicado (ou qualquer site fora do claude.ai) não tem esse acesso.

Aqui, quem fala com a API do Gemini é a Netlify Function (`pauta.js`), rodando no servidor da Netlify, usando a chave guardada como variável de ambiente. O navegador do visitante só fala com essa function (`/.netlify/functions/pauta`), nunca com o Google diretamente — então a chave nunca fica exposta no código do site.

## Custos
O modelo usado aqui é o `gemini-3.6-flash`. Se sua chave for de conta gratuita e esse modelo não estiver disponível, troque a constante `GEMINI_MODEL` em `netlify/functions/pauta.js` para `gemini-3.5-flash-lite` (mais rápido e mais barato, também com tier gratuito). Para ver os limites de uso e consumo, confira https://aistudio.google.com/apikey e https://ai.google.dev/gemini-api/docs/rate-limits.
