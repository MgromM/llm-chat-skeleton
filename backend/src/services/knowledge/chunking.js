const DEFAULT_CHUNK_SIZE = 1200;
const DEFAULT_OVERLAP = 150;

/**
 * Splits text into overlapping chunks for embedding, preferring paragraph
 * boundaries so a chunk doesn't cut a sentence in half; falls back to a hard
 * split at `size` chars for paragraphs longer than that on their own.
 */
export function chunkText(text, { size = DEFAULT_CHUNK_SIZE, overlap = DEFAULT_OVERLAP } = {}) {
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let current = '';

  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = '';
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > size) {
      flush();
      for (let i = 0; i < paragraph.length; i += size - overlap) {
        chunks.push(paragraph.slice(i, i + size));
      }
      continue;
    }

    if (current.length + paragraph.length + 2 > size) {
      flush();
    }
    current = current ? `${current}\n\n${paragraph}` : paragraph;
  }
  flush();

  return chunks;
}
