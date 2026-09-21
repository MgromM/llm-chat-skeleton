/**
 * Zero-dependency "export as PDF": renders the transcript into a dedicated
 * print-only document in a new tab and triggers the browser's native print
 * dialog, where "Save as PDF" is a standard destination on every major
 * browser/OS. Avoids pulling in a PDF-generation library for something the
 * browser already does well.
 */
export function exportConversationAsPdf(title: string, messages: { role: string; content: string }[]) {
  const escapeHtml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const body = messages
    .filter((m) => m.content)
    .map(
      (m) => `
        <div class="msg ${m.role}">
          <div class="role">${m.role === 'user' ? 'Ty' : 'Asystent'}</div>
          <div class="content">${escapeHtml(m.content).replace(/\n/g, '<br>')}</div>
        </div>`,
    )
    .join('\n');

  const html = `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: -apple-system, Segoe UI, sans-serif; color: #1a1a1a; max-width: 700px; margin: 40px auto; padding: 0 20px; }
  h1 { font-size: 18px; margin-bottom: 24px; }
  .msg { margin-bottom: 20px; page-break-inside: avoid; }
  .role { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; color: #888; margin-bottom: 4px; }
  .content { font-size: 13px; line-height: 1.6; white-space: pre-wrap; }
  .msg.user .content { color: #333; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  ${body}
</body>
</html>`;

  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  // Give the new document a tick to lay out before the print dialog opens.
  setTimeout(() => win.print(), 300);
}
