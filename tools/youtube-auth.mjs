// Gets the refresh token for the daily Shorts upload and the chat reminder. Run it on a computer with a browser:
//   node tools/youtube-auth.mjs <client id> <client secret>
// The OAuth client is a "Desktop app" of a Google Cloud project with the YouTube Data API enabled.
import { createServer } from "node:http";

const [clientId, clientSecret] = process.argv.slice(2);
if (!clientId || !clientSecret) {
  console.error("Usage: node tools/youtube-auth.mjs <client id> <client secret>");
  process.exit(1);
}
const redirect = "http://127.0.0.1:8765/";
const consent = new URL("https://accounts.google.com/o/oauth2/v2/auth");
consent.search = new URLSearchParams({
  client_id: clientId,
  redirect_uri: redirect,
  response_type: "code",
  scope: "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.force-ssl",
  access_type: "offline",
  prompt: "consent",
}).toString();
console.log(`Open this page, signed in as the channel's owner:\n\n${consent}\n`);

const server = createServer(async (request, response) => {
  const code = new URL(request.url, redirect).searchParams.get("code");
  if (!code) {
    response.writeHead(400).end("No code in this request.");
    return;
  }
  const result = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirect, grant_type: "authorization_code" }),
  });
  const body = await result.json();
  response.writeHead(200, { "Content-Type": "text/plain" }).end(body.refresh_token ? "Done, back to the terminal." : "Failed, see the terminal.");
  console.log(body.refresh_token ? `YOUTUBE_REFRESH_TOKEN=${body.refresh_token}` : body);
  server.close();
});
server.listen(8765, "127.0.0.1");
