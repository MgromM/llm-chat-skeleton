import { getSecret } from '../../config/secrets.js';

const EMBEDDING_MODEL = process.env.KNOWLEDGE_EMBEDDING_MODEL ?? 'voyage-3-lite';
const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings';

/**
 * Embeds a batch of texts via Voyage AI (Anthropic's recommended embedding
 * partner — Claude itself has no embeddings endpoint). `inputType` follows
 * Voyage's convention for asymmetric retrieval: 'document' when indexing
 * knowledge chunks, 'query' when embedding a search question.
 */
export async function embedTexts(texts, { inputType = 'document' } = {}) {
  const apiKey = await getSecret('VOYAGE_API_KEY');
  const response = await fetch(VOYAGE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ input: texts, model: EMBEDDING_MODEL, input_type: inputType }),
  });

  if (!response.ok) {
    throw new Error(`Voyage embeddings request failed (${response.status}): ${await response.text()}`);
  }

  const { data } = await response.json();
  return data.map((d) => d.embedding);
}

export async function embedQuery(text) {
  const [embedding] = await embedTexts([text], { inputType: 'query' });
  return embedding;
}
