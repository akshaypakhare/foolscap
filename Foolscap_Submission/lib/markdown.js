const { escapeHtml } = require('./sanitize');

// Minimal Markdown subset: #/##/### headings, -/* bullets, "1." numbered items,
// **bold**, *italic*. Everything is HTML-escaped first, then the inline markers
// are converted, so no raw HTML from the file can survive.
function inline(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<em>$2</em>');
}

function markdownToHtml(md) {
  const out = [];
  let list = null; // 'ul' | 'ol'
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  const openList = type => { if (list !== type) { closeList(); out.push(`<${type}>`); list = type; } };

  for (const line of String(md).split(/\r?\n/)) {
    let m;
    if ((m = line.match(/^(#{1,3}) +(.*)$/))) { closeList(); out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); }
    else if ((m = line.match(/^[-*] +(.*)$/))) { openList('ul'); out.push(`<li>${inline(m[1])}</li>`); }
    else if ((m = line.match(/^\d+\. +(.*)$/))) { openList('ol'); out.push(`<li>${inline(m[1])}</li>`); }
    else if (!line.trim()) closeList(); // blank line = paragraph break
    else { closeList(); out.push(`<p>${inline(line)}</p>`); }
  }
  closeList();
  return out.join('');
}

function textToHtml(text) {
  return String(text).split(/\r?\n/).map(line => `<p>${line.trim() ? escapeHtml(line) : '<br>'}</p>`).join('');
}

module.exports = { markdownToHtml, textToHtml };
