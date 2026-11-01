import { fileURLToPath } from "node:url";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";

export interface StreamMessage {
  id: string;
  type: number;
  text: string;
  publishedAt: string;
  authorId: string;
  author: string;
}

interface StreamResponse {
  next_page_token?: string;
  items?: { id?: string; snippet?: { type?: number; display_message?: string; published_at?: string }; author_details?: { channel_id?: string; display_name?: string } }[];
}

const PROTO = fileURLToPath(new URL("../proto/live_chat.proto", import.meta.url));
let client: grpc.Client & { StreamList: (request: object, metadata: grpc.Metadata) => grpc.ClientReadableStream<StreamResponse> };

// Calls onBatch for each batch of messages and resolves when YouTube closes the stream. The key stays in a header.
export function openChatStream(key: string, liveChatId: string, pageToken: string | null, onBatch: (messages: StreamMessage[], token: string | undefined) => void): Promise<void> {
  if (!client) {
    const definition = protoLoader.loadSync(PROTO, { keepCase: true, enums: Number, defaults: false });
    const api = (grpc.loadPackageDefinition(definition) as unknown as { youtube: { api: { v3: { V3DataLiveChatMessageService: new (address: string, credentials: grpc.ChannelCredentials) => typeof client } } } }).youtube.api.v3;
    client = new api.V3DataLiveChatMessageService("youtube.googleapis.com:443", grpc.credentials.createSsl());
  }
  const metadata = new grpc.Metadata();
  metadata.set("x-goog-api-key", key);
  const request = { live_chat_id: liveChatId, part: ["id", "snippet", "authorDetails"], ...(pageToken ? { page_token: pageToken } : {}) };
  return new Promise((resolve, reject) => {
    const stream = client.StreamList(request, metadata);
    stream.on("data", (response: StreamResponse) => {
      const messages = (response.items ?? []).map((item) => ({
        id: item.id ?? "",
        type: item.snippet?.type ?? 0,
        text: item.snippet?.display_message ?? "",
        publishedAt: item.snippet?.published_at ?? "",
        authorId: item.author_details?.channel_id ?? "",
        author: item.author_details?.display_name ?? "",
      }));
      onBatch(messages, response.next_page_token);
    });
    stream.on("end", resolve);
    stream.on("error", (error: grpc.ServiceError) => reject(new Error(`YouTube chat stream ${grpc.status[error.code] ?? error.code}`)));
  });
}
