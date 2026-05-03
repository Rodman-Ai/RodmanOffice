import type { GoogleClients } from "./client";

export interface SendEmailInput {
  to: string;
  from: string;
  subject: string;
  body: string;
  replyTo?: string;
}

function encodeHeader(value: string) {
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf-8").toString("base64")}?=`;
}

export async function getThreadMessageCount(
  clients: GoogleClients,
  threadId: string,
): Promise<{ count: number; latestFrom: string; latestDate: string }> {
  const res = await clients.gmail.users.threads.get({
    userId: "me",
    id: threadId,
    format: "metadata",
    metadataHeaders: ["From", "Date"],
  });
  const messages = res.data.messages ?? [];
  const last = messages[messages.length - 1];
  const headers = last?.payload?.headers ?? [];
  const from =
    headers.find((h) => h.name?.toLowerCase() === "from")?.value ?? "";
  const date =
    headers.find((h) => h.name?.toLowerCase() === "date")?.value ?? "";
  return { count: messages.length, latestFrom: from, latestDate: date };
}

export async function sendEmail(
  clients: GoogleClients,
  input: SendEmailInput,
): Promise<{ id: string; threadId: string }> {
  const headers = [
    `To: ${input.to}`,
    `From: ${input.from}`,
    `Subject: ${encodeHeader(input.subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 7bit",
  ];
  if (input.replyTo) headers.push(`Reply-To: ${input.replyTo}`);

  const raw = `${headers.join("\r\n")}\r\n\r\n${input.body}`;
  const encoded = Buffer.from(raw, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const res = await clients.gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encoded },
  });
  return {
    id: res.data.id ?? "",
    threadId: res.data.threadId ?? "",
  };
}
