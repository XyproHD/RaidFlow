/**
 * Prüft, ob die Anfrage mit dem Bot-Setup-Secret autorisiert ist (Header oder Body).
 * Verwendung: Bot ruft Webapp-API mit BOT_SETUP_SECRET auf.
 */
export function verifyBotSecret(request: Request): boolean {
  const secret = process.env.BOT_SETUP_SECRET;
  if (!secret) return false;
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7) === secret;
  }
  const xSecret = request.headers.get('x-bot-setup-secret');
  return xSecret === secret;
}
