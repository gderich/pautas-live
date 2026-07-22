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

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error:
          "GEMINI_API_KEY não configurada no Netlify. Vá em Site settings > Environment variables e adicione essa chave.",
      }),
    };
  }

  const GEMINI_MODEL = "gemini-3.6-flash";

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: SYSTEM_PROMPT }],
          },
          contents: [
            {
              role: "user",
              parts: [{ text: "Monte a pauta de hoje." }],
            },
          ],
          tools: [{ google_search: {} }],
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({
          error: "Erro da API do Gemini",
          details: data,
        }),
      };
    }

    const parts =
      (data.candidates &&
        data.candidates[0] &&
        data.candidates[0].content &&
        data.candidates[0].content.parts) ||
      [];
    const textBlocks = parts.filter((p) => p.text).map((p) => p.text);
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
