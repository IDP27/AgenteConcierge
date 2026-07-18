import type { ServerResponse } from "node:http";
import type { AgentEvent } from "@concierge/shared";
import type { ChannelAdapter } from "./channel-adapter.js";

/**
 * Canal web: traduz AgentEvents para Server-Sent Events (ADR-005).
 * O widget consome via fetch + ReadableStream (POST não funciona com EventSource).
 */
export class WebChatAdapter implements ChannelAdapter {
  constructor(private readonly raw: ServerResponse) {
    raw.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
  }

  send(event: AgentEvent): void {
    if (this.raw.writableEnded) return;
    this.raw.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  close(): void {
    if (!this.raw.writableEnded) this.raw.end();
  }
}
