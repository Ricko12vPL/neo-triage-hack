export function toSlackMarkdown(briefing: string): string {
  return briefing
    .replace(/^##\s+(.*)$/gm, "*$1*")
    .replace(/^###\s+(.*)$/gm, "*$1*")
    .replace(/\*\*([^*]+)\*\*/g, "*$1*");
}
