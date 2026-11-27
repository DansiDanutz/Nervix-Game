/**
 * Replaceable model provider.
 *
 * `localProvider` is deterministic and offline: it answers only from the
 * merchant's approved knowledge and returns null when nothing matches, so the
 * agent says it does not know instead of inventing an answer.
 *
 * `remoteProvider` talks to an OpenAI-compatible endpoint when configured.
 * Credentials stay server-side and are never logged.
 */

const STOPWORDS = new Set(["the", "a", "an", "and", "or", "of", "to", "in", "is", "are", "do", "i", "my", "you", "your", "it", "for", "on", "with", "how", "what", "when", "where"]);

function tokens(text) {
  return new Set(
    String(text)
      .toLowerCase()
      .split(/[^a-z0-9ăâîșț]+/i)
      .filter((t) => t.length > 1 && !STOPWORDS.has(t)),
  );
}

export const localProvider = {
  name: "local",
  complete({ context, message }) {
    const wanted = tokens(message);
    if (wanted.size === 0) return null;
    let best = null;
    let bestScore = 0;
    for (const entry of context.knowledge) {
      const have = tokens(entry.text);
      let overlap = 0;
      for (const t of wanted) {
        let hit = have.has(t);
        if (!hit) {
          for (const h of have) {
            if (h.startsWith(t) || t.startsWith(h)) {
              hit = true;
              break;
            }
          }
        }
        if (hit) overlap += 1;
      }
      const score = overlap / wanted.size;
      if (score > bestScore) {
        bestScore = score;
        best = entry;
      }
    }
    return bestScore >= 0.34 ? best.text : null;
  },
};

export function remoteProvider({ baseUrl, apiKey, model = "gpt-4o-mini" }) {
  if (!baseUrl || !apiKey) throw new Error("remote provider needs baseUrl and apiKey");
  return {
    name: "remote",
    async complete({ system, context, message }) {
      const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: `${system}\nApproved knowledge:\n${context.knowledge.map((k) => `- ${k.text}`).join("\n")}` },
            { role: "user", content: message },
          ],
          temperature: 0.2,
        }),
      });
      if (!res.ok) throw new Error(`provider ${res.status}`);
      const data = await res.json();
      return data.choices?.[0]?.message?.content ?? null;
    },
  };
}

export function createProvider(env = process.env) {
  if (env.AGENT_MODEL_BASE_URL && env.AGENT_MODEL_KEY) {
    return remoteProvider({ baseUrl: env.AGENT_MODEL_BASE_URL, apiKey: env.AGENT_MODEL_KEY, model: env.AGENT_MODEL_MODEL });
  }
  return localProvider;
}