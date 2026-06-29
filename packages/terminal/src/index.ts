export * from './persistent-shell.js';
// Re-export command classification so callers can gate terminal commands.
export { classifyCommand, type CommandClass } from '@forgewright/tools';
