// Local transcripts use the same verified-owner cache as the rest of the app.
(() => {
  const key = 'chef_chat';
  function normalize(value) {
    if (!Array.isArray(value)) return [];
    const messages = [];
    let size = 0;
    for (const message of value.slice(-60).reverse()) {
      if (!message || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string' ||
          !message.content.trim() || message.content.length > 24000 || typeof message.context !== 'boolean') return [];
      size += message.content.length;
      if (size > 250000) break;
      messages.push({ role: message.role, content: message.content, context: message.context });
    }
    return messages.reverse();
  }
  window.NutriChefChatCache = {
    read(uid) {
      try {
        const value = window.NutriSecurity.readCache(uid, key, Infinity);
        return value?.version === 1 ? normalize(value.messages) : [];
      } catch { return []; }
    },
    write(uid, messages) {
      try { return window.NutriSecurity.writeCache(uid, key, { version: 1, messages: normalize(messages) }); }
      catch { return false; }
    },
    clear(uid) { return this.write(uid, []); },
  };
})();
