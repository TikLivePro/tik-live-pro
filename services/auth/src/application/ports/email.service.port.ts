export interface WelcomeEmailOptions {
  to: string;
  displayName: string;
  locale?: string;
}

export interface IEmailService {
  sendWelcome(options: WelcomeEmailOptions): Promise<void>;
}
