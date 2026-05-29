import nodemailer, { type Transporter } from 'nodemailer';
import type { IEmailService, WelcomeEmailOptions } from '../../application/ports/email.service.port.js';
import type { Logger } from '@tik-live-pro/logger';

export type SmtpProvider = 'gmail' | 'sendgrid' | 'custom';

export interface SmtpConfig {
  provider: SmtpProvider;
  user: string;
  pass: string;
  from: string;
  /** Required only when provider === 'custom' */
  host?: string;
  /** Required only when provider === 'custom' */
  port?: number;
  /** Required only when provider === 'custom' */
  secure?: boolean;
}

const PROVIDER_PRESETS: Record<Exclude<SmtpProvider, 'custom'>, { host: string; port: number; secure: boolean }> = {
  gmail: { host: 'smtp.gmail.com', port: 587, secure: false },
  sendgrid: { host: 'smtp.sendgrid.net', port: 587, secure: false },
};

export class SmtpEmailService implements IEmailService {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: SmtpConfig, private readonly logger: Logger) {
    const { host, port, secure } =
      config.provider === 'custom'
        ? { host: config.host ?? 'localhost', port: config.port ?? 587, secure: config.secure ?? false }
        : PROVIDER_PRESETS[config.provider];

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user: config.user, pass: config.pass },
    });
    this.from = config.from;
  }

  async sendWelcome({ to, displayName, locale }: WelcomeEmailOptions): Promise<void> {
    const isFr = locale === 'fr';
    const subject = isFr ? 'Bienvenue sur TikLive Pro !' : 'Welcome to TikLive Pro!';
    const html = isFr
      ? `<p>Bonjour <strong>${displayName}</strong>,</p>
         <p>Votre compte TikLive Pro a été créé avec succès. Vous pouvez maintenant vous connecter et commencer à diffuser en direct.</p>
         <p>— L'équipe TikLive Pro</p>`
      : `<p>Hi <strong>${displayName}</strong>,</p>
         <p>Your TikLive Pro account has been created successfully. You can now sign in and start streaming live.</p>
         <p>— The TikLive Pro team</p>`;

    try {
      await this.transporter.sendMail({ from: this.from, to, subject, html });
      this.logger.info({ to }, 'Welcome email sent');
    } catch (err) {
      this.logger.warn({ err, to }, 'Failed to send welcome email — registration continues');
    }
  }
}
