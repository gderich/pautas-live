// netlify/functions/pauta.js
// Esta function roda no servidor da Netlify, não no navegador.
// A chave da API fica só aqui (variável de ambiente), nunca é exposta ao público.
//
// Estratégia (100% free tier, sem precisar de billing no Google):
// 1. Busca as manchetes do dia direto no Google News RSS (gratuito, sem API key).
// 2. Manda essa lista de manchetes pro Gemini (só geração de texto, SEM a tool de
//    busca do Google, que é paga) pra ele escolher as melhores e escrever o "gancho".

const GEMINI_MODEL = "gemini-3.5-flash-lite";

const CATEGORY_FEEDS = [
  {
    category: "politica",
    url: "https://news.google.com/rss/search?q=pol%C3%ADtica%20Brasil%20when:2d&hl=pt-BR&gl=BR&ceid=BR:pt-BR",
  },
  {
    category: "noticias",
    url: "https://news.google.com/rss/search?q=Brasil%20when:1d&hl=pt-BR&gl=BR&ceid=BR:pt-BR",
  },
  {
    category: "tech",
    url: "https://news.google.com/rss/search?q=tecnologia%20when:2d&hl=pt-BR&gl=BR&ceid=BR:pt-BR",
  },
];

const ITEMS_PER_FEED = 8;

function decodeEntities(str) {
  return (str || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .trim();
}

function parseRssItems(xml, category) {
  const items = [];
  const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/g) || [];

  for (const block of itemBlocks.slice(0, ITEMS_PER_FEED)) {
    const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/);
    const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/);
    const sourceMatch = block.match(/<source url="([^"]*)"[^>]*>([\s\S]*?)<\/source>/);

    if (!titleMatch) continue;

    const rawTitle = decodeEntities(titleMatch[1]);
    const sourceName = sourceMatch ? decodeEntities(sourceMatch[2]) : null;
    // O título do Google News vem como "Manchete - Nome do Veículo"; tira o veículo do fim se bater com o <source>.
    let headline = rawTitle;
    if (sourceName && rawTitle.endsWith(sourceName)) {
      headline = rawTitle.slice(0, rawTitle.length - sourceName.length).replace(/-\s*$/, "").trim();
    }

    items.push({
      category,
      headline,
      source_name: sourceName || "Google News",
      source_url: linkMatch ? decodeEntities(linkMatch[1]) : "",
    });
  }

  return items;
}

async function fetchCandidateHeadlines() {
  const results = await Promise.all(
    CATEGORY_FEEDS.map(async (feed) => {
      const res = await fetch(feed.url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; PautaBot/1.0)" },
      });
      if (!res.ok) return [];
      const xml = await res.text();
      return parseRssItems(xml, feed.category);
    })
  );
  return results.flat();
}

function buildPrompt(candidates) {
  const list = candidates
    .map(
      (c, i) =>
        `${i + 1}. [${c.category}] ${c.headline} (fonte: ${c.source_name}, url: ${c.source_url})`
    )
    .join("\n");

  return `Você é um produtor de pauta para uma live diária no Brasil. O apresentador joga games ao vivo e comenta, entre uma partida e outra, política brasileira, notícias gerais/atualidades e tecnologia.

Abaixo está uma lista de manchetes reais coletadas hoje, já divididas em 3 categorias: "politica" (política brasileira), "noticias" (atualidades gerais, Brasil e mundo), "tech" (tecnologia).

${list}

Escolha 2 a 3 itens por categoria (total 6 a 9 itens), priorizando o que parece mais relevante e comentável ao vivo. Use exatamente o source_name e source_url fornecidos para cada item escolhido — não invente URLs.

Responda APENAS com um array JSON puro, sem markdown, sem texto antes ou depois, no formato:
[
  {
    "category": "politica" | "noticias" | "tech",
    "headline": "manchete curta e direta, no máximo 12 palavras, reescrita se necessário",
    "gancho": "1-2 frases em tom de conversa, dando ao apresentador um ângulo ou opinião pra puxar assunto ao vivo, sem citar texto de matérias diretamente",
    "source_name": "nome do veículo (copiado da lista acima)",
    "source_url": "url da fonte (copiada da lista acima)"
  }
]`;
}

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

  try {
    const candidates = await fetchCandidateHeadlines();

    if (candidates.length === 0) {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({
          error: "Não foi possível buscar manchetes no Google News agora.",
        }),
      };
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: buildPrompt(candidates) }],
            },
          ],
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
