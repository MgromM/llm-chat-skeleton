// Anthropic's native web search tool: executed server-side by Anthropic
// itself (no local `runTool` dispatch needed — the API returns
// `server_tool_use` / `web_search_tool_result` blocks already resolved).
export const webSearchTool = {
  type: 'web_search_20250305',
  name: 'web_search',
  max_uses: 5,
};
