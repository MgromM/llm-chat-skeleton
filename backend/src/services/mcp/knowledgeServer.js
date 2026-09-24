import { embedQuery } from '../knowledge/embeddings.js';
import { searchKnowledge } from '../knowledge/knowledgeStore.js';

export const knowledgeSearchTool = {
  name: 'search_knowledge_base',
  description:
    'Szukaj w firmowej bazie wiedzy (wytyczne brandowe, procedury, dokumenty wewnętrzne). Użyj gdy pytanie może być odpowiedziane treścią wgranych dokumentów firmowych.',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Pytanie lub temat do wyszukania w bazie wiedzy.' },
    },
    required: ['query'],
  },
};

export async function runKnowledgeSearchTool({ query: searchQuery }) {
  const embedding = await embedQuery(searchQuery);
  const results = await searchKnowledge(embedding);
  if (results.length === 0) return 'Baza wiedzy nie zawiera jeszcze żadnych dokumentów.';
  return results.map((r) => `[${r.document_title}]\n${r.content}`).join('\n\n---\n\n');
}
