// Detects whether an assistant reply carries an embeddable live preview
// (HTML/SVG) inside its markdown, so artifact commands get a real rendered
// preview "for free" whenever the model happens to answer with a code block,
// without having to rewrite any of the 4 commands' prompts.
const FENCE_RE = /```(?:html|svg)\s*\n([\s\S]*?)```/i;
const RAW_HTML_RE = /^\s*(<!doctype html|<html|<svg)/i;

export function extractArtifact(replyText) {
  const text = replyText ?? '';
  const fenceMatch = text.match(FENCE_RE);
  if (fenceMatch) {
    return { type: 'html', previewContent: fenceMatch[1].trim() };
  }
  if (RAW_HTML_RE.test(text)) {
    return { type: 'html', previewContent: text.trim() };
  }
  return { type: 'markdown', previewContent: null };
}
