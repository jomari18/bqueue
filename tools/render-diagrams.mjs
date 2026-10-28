// Renders docs/diagrams/*.png from Mermaid definitions, as in the other portfolio projects.
// Run: node tools/render-diagrams.mjs
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const diagrams = {
  "context-diagram": `flowchart LR
    R(["Resident"]) -- "document requests,<br/>a number from home" --> S(("B.Queue"))
    S -- "request status, place in line,<br/>'your turn' alerts" --> R
    W(["Walk-in at the kiosk"]) -- "a lane tap" --> S
    S -- "a number and a QR to follow it" --> W
    T(["Barangay staff"]) -- "forward or reject, call next,<br/>release with ID and OR" --> S
    S -- "new requests, the line,<br/>the A4 document" --> T
    K(["Punong Barangay"]) -- "approve and sign, revoke,<br/>fees, counters, staff" --> S
    S -- "approvals, reports" --> K
    S -- "numbers called, voice" --> TV(["Hall TV"])
    A(["Anyone with a document"]) -- "verification code" --> S
    S -- "valid, expired or revoked" --> A
    G(["GitHub Actions"]) -- "daily cleanup" --> S
    S -- "queries through Prisma" --> D[("Neon PostgreSQL")]
    D -- "rows" --> S`,
  "data-flow-diagram": `flowchart TB
    V(["Visitor"]) -- "Try the demo" --> P1(("P1 · Demo barangay"))
    P1 -- "three logins, TV and kiosk links" --> V
    P1 -- "a seeded barangay" --> D1[("D1 · Barangays, users, keys")]
    R(["Resident"]) -- "type and purpose" --> P2(("P2 · Requests"))
    P2 <-- "requests and their events" --> D2[("D2 · Requests")]
    T(["Staff"]) -- "forward, reject, release" --> P2
    K(["Kapitan"]) -- "approve and sign, revoke" --> P2
    R -- "lane" --> P3(("P3 · Queue"))
    W(["Kiosk"]) -- "lane, with the kiosk key" --> P3
    T -- "call next, call again, served, missed" --> P3
    P3 <-- "tickets, counters, sequences" --> D3[("D3 · Queue")]
    P3 -- "versioned events" --> P4(("P4 · Real-time"))
    P2 -- "request events" --> P4
    P4 -- "queue:changed, queue:called" --> TV(["TV display"])
    P4 -- "ticket:updated" --> R
    P4 -- "request:updated" --> R
    A(["Anyone"]) -- "code" --> P5(("P5 · Verify"))
    D2 -- "type, name, dates, barangay" --> P5
    P5 -- "valid, expired or revoked" --> A
    D2 & D3 --> P6(("P6 · Reports"))
    P6 -- "released, fees, waits, no-shows" --> K`,
  "request-flowchart": `flowchart TD
    A([Resident submits a request]) --> S[Submitted]
    S -- "Resident cancels" --> C[Cancelled]
    S -- "Staff reject with a reason" --> X[Rejected]
    S -- "Staff forward" --> F[For approval]
    F -- "Kapitan rejects with a reason" --> X
    F -- "Kapitan approves and signs" --> RP[Ready for pickup]
    RP -- "Resident takes a Documents number" --> Q["Called at the counter"]
    Q -- "ID shown, OR number if there is a fee" --> RL[Released: print with QR]
    RL -- "Kapitan revokes with a reason" --> RV[Revoked: the QR check says so]
    RL --> Z([Verify page says Valid until it expires])`,
  "call-next-sequence": `sequenceDiagram
    autonumber
    actor Staff
    participant N as Netlify proxy
    participant A as API (NestJS)
    participant P as PostgreSQL
    participant E as Events
    participant IO as Socket.io
    participant TV as Hall TV
    Staff->>N: POST /api/counters/c2/call-next
    N->>A: same request, signed
    A->>P: lock the next WAITING ticket (FOR UPDATE SKIP LOCKED)
    P-->>A: ticket, version + 1
    A-->>N: { ticket }
    N-->>Staff: shows D-012
    A->>E: publish(version)
    E->>IO: queue:changed, queue:called, ticket:updated
    IO->>TV: queue:called (D-012, Counter 2)
    TV->>TV: chime, then "Numero D, sero, isa, dalawa, sa Counter 2."
    Note over TV,IO: A version gap makes the TV fetch GET /api/queue/state`,
};

// Sora, the app's heading typeface, embedded so Mermaid measures the labels with the font it draws them in.
const font = readFileSync(new URL("../node_modules/@fontsource/sora/files/sora-latin-400-normal.woff2", import.meta.url)).toString("base64");

mkdirSync("docs/diagrams", { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });

for (const [name, definition] of Object.entries(diagrams)) {
  await page.setContent(`<!doctype html><meta charset="utf-8">
    <style>@font-face { font-family: Sora; src: url(data:font/woff2;base64,${font}) format("woff2"); }</style>
    <body style="margin:0;padding:32px;background:#fff;font-family:Sora,Arial,sans-serif">
    <pre class="mermaid">${definition.replace(/</g, "&lt;")}</pre>
    <script src="https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js"></script>
    <script>
      mermaid.initialize({ startOnLoad: false, securityLevel: "loose", theme: "base",
        themeVariables: { fontFamily: "Sora, Arial, sans-serif", primaryColor: "#E2F1E8", primaryBorderColor: "#1F7A4D",
          primaryTextColor: "#1A1A1A", lineColor: "#5F5E5A", fontSize: "16px",
          edgeLabelBackground: "#ffffff", clusterBkg: "#F8F7F4", clusterBorder: "#E4E1DA",
          actorBkg: "#E2F1E8", actorBorder: "#1F7A4D", signalColor: "#1A1A1A", noteBkgColor: "#F1EFEA", noteBorderColor: "#E4E1DA" },
        flowchart: { htmlLabels: true, curve: "basis" } });
      document.fonts.load("16px Sora").then(() => mermaid.run()).then(() => (document.body.dataset.done = "1"));
    </script></body>`);
  await page.waitForFunction(() => document.body.dataset.done === "1");
  await page.locator("pre.mermaid svg").screenshot({ path: `docs/diagrams/${name}.png` });
  console.log(`wrote docs/diagrams/${name}.png`);
}
await browser.close();
