// Anthropic's native code execution tool: Claude writes and runs code
// (Python) inside Anthropic's own managed sandbox — no code ever runs on
// our infrastructure. Executed server-side, like `web_search`, so no local
// `runTool` dispatch is needed; results come back as
// `code_execution_tool_result` blocks already resolved.
// Still in beta — requires the `code-execution-2025-05-22` beta header,
// see CODE_EXECUTION_BETA in pipeline.js.
export const codeExecutionTool = {
  type: 'code_execution_20250522',
  name: 'code_execution',
};

export const CODE_EXECUTION_BETA = 'code-execution-2025-05-22';
// Files the sandbox writes out (e.g. a generated .csv/.xlsx report) are
// exposed as Files API objects (`file_id`s) — downloading/inspecting them
// needs this beta enabled alongside the code-execution one.
export const FILES_API_BETA = 'files-api-2025-04-14';
