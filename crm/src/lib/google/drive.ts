import { Readable } from "node:stream";
import type { GoogleClients } from "./client";

export async function uploadFile(
  clients: GoogleClients,
  folderId: string,
  fileName: string,
  mimeType: string,
  bytes: Buffer,
): Promise<{ id: string; webViewLink: string }> {
  const res = await clients.drive.files.create({
    requestBody: {
      name: fileName,
      parents: folderId ? [folderId] : undefined,
      mimeType,
    },
    media: {
      mimeType,
      body: Readable.from(bytes),
    },
    fields: "id, webViewLink",
  });
  return {
    id: res.data.id ?? "",
    webViewLink: res.data.webViewLink ?? "",
  };
}
