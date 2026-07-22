// netlify/functions/pauta.js
// Esta function roda no servidor da Netlify, não no navegador.
// A chave da API fica só aqui (variável de ambiente), nunca é exposta ao público.

const SYSTEM_PROMPT = `Você é um produtor de pauta para uma live diária no Brasil. O apresentador joga games ao vivo e comenta, entre uma partida e outra, política brasileira, notícias gerais/atualidades e tecnologia.

Use a busca na web para encontrar os assuntos MAIS relevantes e comentados de HOJE nessas 3 categorias: "politica" (política brasileira), "noticias" (atualidades gerais, Brasil e mundo), "tech" (tecnologia).

Selecione 2 a 3 itens por categoria (total 6 a 9 itens), priorizando o que está realmente em alta hoje, com boas fontes.

Responda APENAS com um array JSON puro, sem markdown, sem texto antes ou depois, no formato:
[
  {
    "category": "politica" | "noticias" | "tech",
    "headline": "manchete curta e direta, no máximo 12 palavras",
    "gancho": "1-2 frases em tom de conversa, dando ao apresentador um ângulo ou opinião pra puxar assunto ao vivo, sem citar texto de matérias diretamente",
    "source_name": "nome do veículo",
    "source_url": "url da fonte"
  }
]`;

exports.handler = async function (event) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error:
          "ANTHROPIC_API_KEY não configurada no Netlify. Vá em Site settings > Environment variables e adicione essa chave.",
      }),
    };
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: "Monte a pauta de hoje." }],
        tools: [{ type: "web_search_20250305", name: "web_search" }],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({
          error: "Erro da API da Anthropic",
          details: data,
        }),
      };
    }

    const textBlocks = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text);
    let raw = textBlocks.join("\n").trim();
    raw = raw.replace(/```json/g, "").replace(/```/g, "").trim();

    const firstBracket = raw.indexOf("[");
    const lastBracket = raw.lastIndexOf("]");
    if (firstBracket === -1 || lastBracket === -1) {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({
          error: "Resposta sem JSON reconhecível",
          raw,
        }),
      };
    }
    raw = raw.slice(firstBracket, lastBracket + 1);

    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed) ? parsed.filter((i) => i && i.headline) : [];

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(items),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
