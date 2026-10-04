# Network lab: watching the login exchange

Built while working on US-0a (#8). **Drafted by Claude from real runs on 2026-10-04** (curl against the running API, and a tcpdump capture on `lo0`). Vivek: re-run the commands yourself, compare, and correct anything you disagree with. The point of this file is that you can explain it.

## Lab 1: `curl -v` (the HTTP text)
Command: `curl -v -c jar.txt -H 'x-requested-with: handoff-web' -H 'content-type: application/json' -X POST localhost:4000/auth/signup -d '{...}'`

**Request**
- Request line: `POST /auth/signup HTTP/1.1` (method, path, HTTP version).
- Added by curl itself: `Host`, `User-Agent: curl/8.7.1`, `Accept: */*`, and `Content-Length`.
- Added by me: `x-requested-with: handoff-web` (the CSRF header the API requires on every non-GET request) and `content-type: application/json` (so Express parses the body as JSON).
- `Content-Length: 73` is the size of the body in **bytes**. If it were too small, the server would read only that many bytes and see cut-off JSON (a 400). If too large, the server would wait for bytes that never come.

**Response**
- Status line: `HTTP/1.1 201 Created`.
- The session is carried by `Set-Cookie: session=<43 random chars>; Path=/; Expires=<7 days later>; HttpOnly; SameSite=Lax`.
  - `Path=/`: the browser sends the cookie on every path of the site.
  - `Expires`: when the browser should throw it away (7 days, matching the session row's `expires_at`).
  - `HttpOnly`: page JavaScript cannot read the cookie, which limits what an injected script (XSS) can steal.
  - `SameSite=Lax`: the browser does not attach it to cross-site POST requests, the first layer against CSRF.
- No `Secure` appears because `NODE_ENV` is not `production` locally. With `NODE_ENV=production` the flag is added, and the browser then only sends the cookie over HTTPS.

## Lab 2: the cookie jar
- `curl -c` saved: `#HttpOnly_localhost  FALSE  /  FALSE  <expiry as a Unix timestamp>  session  <value>`. The columns are domain, "include subdomains", path, "secure only", expiry, name, value. The `#HttpOnly_` prefix is curl's way of recording the `HttpOnly` flag.
- The cookie is sent back in a request header: `Cookie: session=<value>`.
- Sending it by hand with `-H 'Cookie: session=...'` works exactly like `-b jar.txt`. So **a cookie is just a header that the client promises to repeat**. Nothing magic: anyone who has the value can send it. That is why we keep it `HttpOnly`, send it only over HTTPS in production, expire it, and delete the session on the server at logout.

## Lab 3: packet capture on localhost
Command: `tcpdump -i lo0 -nn -A -s 0 'tcp port 4010'` (needs capture permission; the API was on port 4010 for my run).

- **TCP handshake** (client `::1.50126` to server `::1.4010`):
  1. `Flags [S]`: SYN, "I'd like to open a connection."
  2. `Flags [S.]`: SYN-ACK, "OK, and I'm ready too."
  3. `Flags [.]`: ACK, "Great." Only now can data flow.
- **Request:** one packet with `Flags [P.]` (push, carrying data), length 245 bytes, containing the request line, the headers, and the JSON body, all readable as plain text.
- **Response:** one `[P.]` packet, length 472 bytes: the status line, headers including `Set-Cookie`, and the JSON body.
- **Closing:** `[F.]` (FIN, "I'm done sending") from the client, acknowledged, then `[F.]` from the server, acknowledged.
- Each curl command opened its **own connection** (client ports 50126, 50127, ...), so each request repeated the handshake. Browsers reuse connections (`Connection: keep-alive`).
- **Could I read the password?** Yes. `cap-password-123` appeared in the capture twice (once for signup, once for login), and the session cookie value appeared in the `Set-Cookie` header. Plain HTTP is plain text. In production, **TLS (HTTPS)** encrypts the TCP payload so a capture shows only unreadable bytes, and the `Secure` flag stops the browser sending the cookie over plain HTTP. Localhost traffic never leaves the machine, which is why this is safe here, and why I never type a real password into a dev server.
- **Why `::1`?** `localhost` resolves to both `::1` (IPv6 loopback) and `127.0.0.1` (IPv4). curl tries IPv6 first, and the Node server listens on both.
- **Interface:** `lo0` is the loopback interface (link-type `NULL (BSD loopback)`): a virtual network card for traffic from this machine to itself.

## Lab 4: why the custom header defends against CSRF
- The simulated browser permission check (`OPTIONS` preflight with `Origin: https://evil.example` and `Access-Control-Request-Headers: x-requested-with`) got `200 OK` with `Allow: POST`.
- It had **no `Access-Control-Allow-Origin`** (or any other `Access-Control-Allow-*` header). A browser reads that as "this server has not allowed that origin", so it **never sends the real POST**.
- A normal HTML form on another site can only send a short list of "simple" headers and content types. It cannot add `X-Requested-With`. JavaScript on another site can try to add it, but then the browser must run the preflight above, which we fail on purpose. Our own frontend runs on our origin, so it can add the header freely.
- A form-style POST without the header got `403 Forbidden`.

## Finding: the server advertised its framework
- Every response had `X-Powered-By: Express`. That tells an attacker which framework to look up known vulnerabilities for (information disclosure).
- Fix: `app.disable("x-powered-by")` right after `express()` in `createApp`.
- Test: a test asserts `response.headers.get("x-powered-by")` is `null`. I ran it before the fix (it failed with `expected 'Express' to be null`) and after (it passed).
- Possible follow-up: the `helmet` package sets many security headers at once. Evaluate its size and whether we need it before adding it (dependency rule).

## Layers
| Layer | What it did in this lab |
|---|---|
| Application (browser or curl) | Built the request, stored and replayed the cookie |
| HTTP | The text: request line, headers, blank line, body; status codes; `Set-Cookie` / `Cookie` |
| Cookies | A convention on top of HTTP headers; flags tell the browser how it may use them |
| TCP | Reliable connection: the SYN / SYN-ACK / ACK handshake, data packets, FIN to close |
| IP | Addresses `::1` / `127.0.0.1` |
| Loopback (`lo0`) | A virtual interface: traffic from this machine to itself |
| TLS (not used locally) | Would sit between HTTP and TCP and encrypt the payload |

Labs 1, 2 and 4 looked at HTTP. Lab 3 looked at TCP and IP, and showed why HTTP needs TLS.
