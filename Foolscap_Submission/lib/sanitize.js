const sanitizeHtmlLib = require('sanitize-html');

const MAX_CONTENT_LENGTH = 500_000;

// Allowlist matching what the toolbar can produce (plus <br> and <div> that
// contenteditable emits). No attributes, no links, no images, no styles.
const OPTIONS = {
  allowedTags: ['p', 'br', 'div', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'u'],
  allowedAttributes: {},
  disallowedTagsMode: 'discard',
  // Drop the *contents* of dangerous containers instead of leaking their text.
  nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'iframe', 'object', 'embed', 'svg', 'math']
};

function sanitizeHtml(html) {
  return sanitizeHtmlLib(String(html ?? '').slice(0, MAX_CONTENT_LENGTH), OPTIONS);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

module.exports = { sanitizeHtml, escapeHtml, MAX_CONTENT_LENGTH };
