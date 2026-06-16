const STORAGE_KEY = 'aether_quick_commands';

export function loadCommands() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch { return []; }
}

export function saveCommands(commands) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(commands));
}

export function createCommand(label, command) {
  return { id: Date.now() + Math.random(), label, command };
}
