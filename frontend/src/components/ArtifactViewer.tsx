'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import type { Artifact } from '@/lib/api';

/**
 * Renders an artifact's current content — HTML/SVG artifacts get a live
 * preview in a sandboxed iframe (scripts allowed, but no `allow-same-origin`,
 * so generated code can't reach the app's cookies/localStorage or
 * `window.parent`); markdown artifacts render as before. Shared between the
 * in-chat side panel and the public, unauthenticated share page so both stay
 * in sync.
 */
export function ArtifactViewer({ artifact, mode = 'preview' }: { artifact: Artifact; mode?: 'preview' | 'source' }) {
  if (artifact.type === 'html' && artifact.previewContent && mode === 'preview') {
    return (
      <iframe
        title={artifact.title}
        srcDoc={artifact.previewContent}
        sandbox="allow-scripts"
        className="h-full min-h-[400px] w-full flex-1 rounded-lg border border-brand-border bg-white"
      />
    );
  }

  return (
    <div className="prose prose-sm max-w-none text-brand-dark">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeHighlight, rehypeKatex]}>
        {artifact.content}
      </ReactMarkdown>
    </div>
  );
}
