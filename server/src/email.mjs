/**
 * Transactional email for verification codes.
 *
 * With RESEND_API_KEY the code is emailed and never returned to the caller.
 * Without it the emailer reports unavailable and the API falls back to the
 * clearly labelled demo `devCode`.
 */

export const EMAIL_MODE = "demo";

export function createEmailer(env = process.env) {
  if (!env.RESEND_API_KEY) {
    return { name: "none", available: false, async send() { return false; } };
  }
  const key = env.RESEND_API_KEY;
  const from = env.EMAIL_FROM ?? "Nervix World <no-reply@nervix.world>";
  return {
    name: "resend",
    available: true,
    async send({ to, subject, text }) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({ from, to: [to], subject, text }),
      });
      if (!res.ok) throw new Error(`email provider ${res.status}`);
      return true;
    },
  };
}

export function verificationEmail(code) {
  return {
    subject: "Your Nervix World code",
    text: `Your Nervix World verification code is ${code}. It expires in 10 minutes and can be used once.`,
  };
}