import "server-only";

import nodemailer from "nodemailer";

type MailConfig = {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
};

function getRequiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} in environment`);
  return v;
}

function getMailConfig(): MailConfig {
  return {
    host: getRequiredEnv("SMTP_HOST"),
    port: Number(getRequiredEnv("SMTP_PORT")),
    user: getRequiredEnv("SMTP_USER"),
    pass: getRequiredEnv("SMTP_PASS"),
    from: getRequiredEnv("SMTP_FROM"),
  };
}

type GlobalMailerState = {
  __attandanceMailer?: ReturnType<typeof nodemailer.createTransport>;
};

const globalMailer = globalThis as unknown as GlobalMailerState;

function getTransport() {
  if (globalMailer.__attandanceMailer) return globalMailer.__attandanceMailer;
  const cfg = getMailConfig();
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.pass },
  });
  globalMailer.__attandanceMailer = transport;
  return transport;
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<void> {
  const cfg = getMailConfig();
  const transport = getTransport();

  await transport.sendMail({
    from: cfg.from,
    to: params.to,
    subject: params.subject,
    text: params.text,
    html: params.html,
  });
}

