import { connect } from "cloudflare:sockets";

const UUID = "4f4e7d82-b7e1-4c92-a1b5-6d8f2a3e9c71";
const WS_PATH = "/assets/ws";
const PROXY_IP = "cdn-all.v2ray.com";

function isValidUUID(buf) {
  const id = new TextDecoder().decode(buf.slice(1, 17));
  return id === UUID;
}

export default {
  async fetch(request) {
    try {
      const url = new URL(request.url);

      // Fake normal website
      if (request.headers.get("Upgrade") !== "websocket" || url.pathname !== WS_PATH) {
        return new Response(
          "<html><body><h1>It works</h1></body></html>",
          {
            headers: {
              "Content-Type": "text/html",
              "Server": "cloudflare"
            }
          }
        );
      }

      const ua = request.headers.get("User-Agent") || "";
      if (!ua.includes("Mozilla")) {
        return new Response(null, { status: 404 });
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.accept();

      server.addEventListener("message", async (event) => {
        const data = new Uint8Array(event.data);

        if (data[0] !== 0x00) return;
        if (!isValidUUID(data)) {
          server.close();
          return;
        }

        const addrType = data[17];
        let offset = 18;
        let port;

        if (addrType === 1) offset = 22;
        if (addrType === 2) offset = 19 + data[18];

        port = (data[offset] << 8) | data[offset + 1];

        const socket = connect({
          hostname: PROXY_IP,
          port
        });

        const writer = socket.writable.getWriter();
        await writer.write(data.slice(offset + 2));
        writer.releaseLock();

        socket.readable.pipeTo(
          new WritableStream({
            write(chunk) {
              server.send(chunk);
            }
          })
        );
      });

      return new Response(null, { status: 101, webSocket: client });
    } catch {
      return new Response(null, { status: 404 });
    }
  }
};
