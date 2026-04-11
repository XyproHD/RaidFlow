/**
 * Minimal sanitization for guild-internal planner HTML (contentEditable output).
 */
export function sanitizePlannerLeaderHtml(input: string): string {
  let s = input.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
  s = s.replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, '');
  s = s.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  return s;
}
