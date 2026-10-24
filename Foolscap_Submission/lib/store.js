const fs = require('node:fs');
const path = require('node:path');

// JSON-file store. All operations are synchronous, so within one Node process a
// read-modify-write cycle cannot interleave with another request. Writes go to
// a temp file that is then renamed over the real one (atomic on POSIX).
function createStore(dataDir, seed) {
  const file = path.join(dataDir, 'store.json');

  function write(data) {
    fs.mkdirSync(dataDir, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, file);
  }

  function read() {
    if (!fs.existsSync(file)) { const fresh = seed(); write(fresh); return fresh; }
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!data || !Array.isArray(data.documents)) throw new Error('missing documents array');
      return data;
    } catch (err) {
      // Never silently replace a damaged file: keep a copy and fail loudly.
      const backup = `${file}.corrupt-${Date.now()}`;
      try { fs.copyFileSync(file, backup); } catch { /* best effort */ }
      throw new Error(`Data file is unreadable (${err.message}). A copy was saved to ${path.basename(backup)}.`);
    }
  }

  return { read, write, file };
}

module.exports = { createStore };
