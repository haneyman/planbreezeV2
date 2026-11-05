export const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );

/** Disabled until explicitly enabled, so local review cannot accidentally send mail. */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text: string,
) {
  if (process.env.EMAIL_ENABLED !== "true") {
    console.info("Email skipped: EMAIL_ENABLED is not true.");
    return;
  }
  const key = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN;
  const from = process.env.EMAIL_FROM;
  const region = process.env.MAILGUN_REGION ?? "US";
  if (!key || !domain || !from)
    throw new Error(
      "Mailgun requires MAILGUN_API_KEY, MAILGUN_DOMAIN and EMAIL_FROM.",
    );
  if (region !== "US" && region !== "EU")
    throw new Error("MAILGUN_REGION must be US or EU.");
  const body = new FormData();
  for (const [name, value] of Object.entries({
    from,
    to,
    subject: subject.replace(/[\r\n]/g, " "),
    html,
    text,
  }))
    body.set(name, value);
  if (process.env.EMAIL_REPLY_TO)
    body.set("h:Reply-To", process.env.EMAIL_REPLY_TO);
  const host = region === "EU" ? "api.eu.mailgun.net" : "api.mailgun.net";
  const response = await fetch(
    `https://${host}/v3/${encodeURIComponent(domain)}/messages`,
    {
      method: "POST",
      signal: AbortSignal.timeout(20000),
      headers: { Authorization: `Basic ${btoa(`api:${key}`)}` },
      body,
    },
  );
  // Provider responses can contain message contents or addresses; do not log them.
  if (!response.ok)
    throw new Error(`Mailgun rejected email (HTTP ${response.status}).`);
}
