// Reads configuration from environment variables in one place.
function str(name: string, fallback = ''): string {
  const v = process.env[name];
  return v === undefined || v === null ? fallback : String(v).trim();
}

export const env = {
  get port() { return Number(str('PORT', '3000')) || 3000; },
  get nodeEnv() { return str('NODE_ENV', 'development'); },
  get isProd() { return str('NODE_ENV') === 'production'; },
  get databaseUrl() { return str('DATABASE_URL'); },
  get sessionSecret() { return str('SESSION_SECRET'); },
  get appUrl() { return str('APP_URL', `http://localhost:${str('PORT', '3000')}`).replace(/\/+$/, ''); },
  get adminEmail() { return str('ADMIN_EMAIL').toLowerCase(); },
  get adminPassword() { return str('ADMIN_PASSWORD'); },
  get adminPasswordReset() { return /^(1|true|yes)$/i.test(str('ADMIN_PASSWORD_RESET')); },
  get waveToken() { return str('WAVE_API_TOKEN'); },
  get waveBusinessId() { return str('WAVE_BUSINESS_ID'); },
  get resendKey() { return str('RESEND_API_KEY'); },
  get resendFromEmail() { return str('RESEND_FROM_EMAIL'); },
  get resendFromName() { return str('RESEND_FROM_NAME'); },
  get resendReplyTo() { return str('RESEND_REPLY_TO'); },
  get resendWebhookSecret() { return str('RESEND_WEBHOOK_SECRET'); },
  get twilioSid() { return str('TWILIO_ACCOUNT_SID'); },
  get twilioToken() { return str('TWILIO_AUTH_TOKEN'); },
  get twilioFrom() { return str('TWILIO_FROM_NUMBER'); },
  get smsNumber() { return str('SMS_NUMBER'); },
  get uploadDir() { return str('UPLOAD_DIR', './uploads'); },
  get gitCommit() {
    return str('RAILWAY_GIT_COMMIT_SHA') || str('GIT_COMMIT') || 'unknown';
  },
};

export function sessionSecret(): string {
  const s = env.sessionSecret;
  if (s.length >= 16) return s;
  if (env.isProd) {
    console.error('[config] SESSION_SECRET is missing or too short. Sign-in cookies will not survive restarts until you set it.');
  }
  return fallbackSecret;
}
const fallbackSecret = require('crypto').randomBytes(32).toString('hex') as string;
