Di seguito trovi un **Documento di Implementazione** “Detox-first” per un **MCP Server** che controlla un’app **Expo/React Native** su **iOS Simulator**, con: boot simulator, start Expo/Metro, log realtime, azioni UI (tap/swipe/type/waitFor/assert), screenshot + visual regression, macro flow runner, e integrazione pronta per **Claude Code / Codex / Cursor** (transport **stdio**). MCP usa JSON-RPC e raccomanda stdio per integrazioni locali.

Detox “actions” ufficiali (tap/type/swipe/scroll) sono documentate da Wix.

Screenshot via xcrun simctl io booted screenshot è documentato da Apple.

---

# **Documento di Implementazione — MCP iOS Simulator + Expo + Detox**

## **0) Obiettivo e vincoli**

### **Obiettivo**

Costruire un **server MCP locale** che permetta agli LLM tools (Cursor/Claude Code/Codex) di:

- gestire iOS Simulator (simctl)
- avviare Expo/Metro (e opzionalmente Dev Client)
- eseguire azioni UI e assert tramite **Detox**
- produrre **artifacts** (screenshot/video/diff/report)
- fornire **log** strutturati e interrogabili

### **Vincoli chiave**

- Detox non è “driver interattivo” stile Appium; è un **framework di test**. Quindi implementiamo un **Detox Action Runner** che esegue _micro-test_ generati dinamicamente e restituisce output JSON.
- Per screenshot/video/log di sistema: usiamo simctl (sempre disponibile). Screenshot CLI è supportato e documentato.

---

## **1) Prerequisiti (macOS)**

- Xcode + Command Line Tools (xcrun, simctl, iOS Simulator)
- Node.js 18+ (consigliato 20+)
- Un progetto Expo/RN con Detox già integrato (come hai detto)
- Installazioni utili:
  - watchman (spesso aiuta su RN)
  - idbcompanion **non necessario** per questa architettura
- Detox config funzionante per iOS Simulator (es. ios.sim.debug)

---

## **2) Stack consigliato**

### **MCP**

- SDK TypeScript ufficiale: @modelcontextprotocol/sdk
- Transport: **stdio** (raccomandato per client locali).
- Validazione input: zod

### **Simulator control**

- xcrun simctl (boot/install/launch/screenshot/recordVideo/log stream). Screenshot doc Apple:

### **UI Automation**

- Detox CLI + Jest runner (o runner programmatico se preferisci, ma CLI è più semplice e stabile)

### **Visual regression**

- pngjs + pixelmatch (+ opzionale sharp per normalizzare)

---

## **3) Repository layout**

```
mcp-ios-detox/
  package.json
  tsconfig.json
  README.md
  mcp.config.json              # config runtime del server
  scripts/
    verify-env.ts
    detox-action-template.ejs   # template micro-test Detox
  src/
    index.ts                    # entrypoint MCP stdio
    config/
      schema.ts
      load.ts
    mcp/
      server.ts                 # tool registry + resources + prompts
      schemas.ts                # zod schemas (input/output)
    core/
      state.ts                  # state machine globale
      errors.ts                 # error taxonomy + mapping
      logger.ts                 # structured logger + ring buffer
      artifacts.ts              # pathing + manifest
    simulator/
      simctl.ts                 # wrapper xcrun simctl
      devices.ts
      logs.ts
      screenshots.ts
      video.ts
    expo/
      expo.ts                   # start/stop Metro/Expo
      metro.ts
      logs.ts
    detox/
      runner.ts                 # esegue detox test + micro-test generation
      actions.ts                # mapping tool -> snippet detox
      selectors.ts              # selector mapping
      output.ts                 # parsing output JSON da stdout
    visual/
      diff.ts                   # pixelmatch pipeline
      baseline.ts
  artifacts/
    .gitkeep
```

---

## **4) Configurazione runtime**

### **mcp.config.json**

###  **(esempio)**

```
{
  "projectPath": "/ABS/PATH/to/expo-app",
  "artifactsRoot": "/ABS/PATH/to/mcp-ios-detox/artifacts",
  "defaultDeviceName": "iPhone 15",
  "detox": {
    "configuration": "ios.sim.debug",
    "reuseSession": true,
    "jestBinary": "node_modules/.bin/jest",
    "detoxBinary": "node_modules/.bin/detox",
    "testTimeoutMs": 120000
  },
  "expo": {
    "startCommand": "npx expo start --ios",
    "clearCacheFlag": "--clear"
  },
  "visual": {
    "baselineDir": "/ABS/PATH/to/mcp-ios-detox/artifacts/baselines",
    "thresholdDefault": 0.02
  },
  "logs": {
    "ringBufferLines": 20000
  }
}
```

---

## **5) State machine (fondamentale per stabilità)**

Definisci uno stato globale:

```
type SimulatorState = "unknown" | "booting" | "booted" | "shutdown";
type ExpoState = "stopped" | "starting" | "running" | "crashed";
type DetoxState = "idle" | "starting" | "ready" | "running" | "failed";

interface GlobalState {
  simulator: { state: SimulatorState; udid?: string; deviceName?: string };
  expo: { state: ExpoState; processId?: string; metroUrl?: string };
  detox: { state: DetoxState; sessionId?: string; configuration?: string };
}
```

Regole:

- ui.\* richiede: simulator.booted + detox.ready
- detox.session.start può fare “auto-boot” simulator se necessario
- expo.start è indipendente, ma detox in debug spesso beneficia di Metro running

---

## **6) Error taxonomy (LLM-friendly)**

Esempi:

- SIM_NOT_BOOTED
- SIMCTL_FAILED
- EXPO_NOT_RUNNING
- DETOX_NOT_READY
- DETOX_TEST_FAILED
- ELEMENT_NOT_FOUND
- TIMEOUT
- VISUAL_DIFF_TOO_HIGH

Ogni errore include:

- code
- details (string)
- remediation (string suggerita)
- evidence (paths di log/screenshot)

---

## **7) MCP Server: tools/resources/prompts**

### **7.1 Transport stdio**

MCP definisce stdio come trasporto standard e raccomandato per integrazioni locali.

### **7.2 Tools principali**

- simulator.\* (simctl)
- expo.\*
- detox.session.\*
- ui.\* (che sotto usa Detox)
- visual.\*
- flow.run

### **7.3 Resources (read-only quick context)**

- resource://state
- resource://logs/expo/latest
- resource://logs/simulator/latest
- resource://logs/detox/latest
- resource://artifacts/latest

### **7.4 Prompts (opzionali ma utili)**

MCP prevede prompt templates scopribili dal client.

Esempi:

- prompt://repro_and_collect_evidence
- prompt://ui_regression_check

---

## **8) Implementazione MCP con** 

## **@modelcontextprotocol/sdk**

### **package.json**

###  **(essenziale)**

```
{
  "name": "mcp-ios-detox",
  "type": "module",
  "private": true,
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "dev": "tsx src/index.ts",
    "verify": "tsx scripts/verify-env.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^<latest>",
    "zod": "^3.24.0",
    "execa": "^9.5.0",
    "pino": "^9.0.0",
    "pngjs": "^7.0.0",
    "pixelmatch": "^5.3.0"
  },
  "devDependencies": {
    "tsx": "^4.19.0",
    "typescript": "^5.6.0"
  }
}
```

> Nota: @modelcontextprotocol/sdk è la distribuzione npm del TypeScript SDK ufficiale.

### **src/index.ts**

###  **(entrypoint stdio)**

```
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./mcp/server.js";

async function main() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  // IMPORTANT: non scrivere su stdout (riservato a JSON-RPC)
  // logga su stderr
  console.error(err);
  process.exit(1);
});
```

### **src/mcp/server.ts**

###  **(tool registry)**

Pseudo-structure (nomi possono variare nel SDK, ma concetto identico):

- crea server
- registra tools con input schema
- implementa handler che chiama i moduli (simctl/expo/detox/visual)

---

## **9) Simulator controller (simctl)**

### **9.1 Wrapper esecuzione comandi**

Usa execa per:

- timeout
- cattura stdout/stderr
- error mapping

Esempio:

```
import { execa } from "execa";

export async function simctl(args: string[], timeoutMs = 60000) {
  const cmd = "xcrun";
  const fullArgs = ["simctl", ...args];

  const res = await execa(cmd, fullArgs, {
    timeout: timeoutMs,
    reject: false,
  });

  return {
    exitCode: res.exitCode,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
  };
}
```

### **9.2 Screenshot**

Apple documenta: xcrun simctl io booted screenshot <file>

Implementazione:

- determina target booted o udid
- calcola path artifacts (artifacts/screenshots/<name>\_<ts>.png)
- esegue simctl e ritorna artifact

---

## **10) Expo orchestrator**

### **10.1 Start Metro/Expo**

- avvia un processo long-lived (npx expo start --ios)
- cattura stdout/stderr in ring buffer
- detect “Metro ready” (regex su output) + salva metroUrl se visibile

### **10.2 Stop**

- kill process tree (SIGTERM, poi SIGKILL se necessario)

### **10.3 Nota pratica Detox + Expo**

- se usi Dev Client, Detox gira su build nativa; Metro serve per caricare bundle in debug.
- Il server non deve “capire Expo a fondo”: deve solo orchestrare processi e log.

---

## **11) Detox Action Runner (cuore)**

### **11.1 Idea base**

Per ogni tool ui.\*:

1. genera un file test (Jest) in una cartella temporanea (o in artifacts/tmp)
2. esegue detox test con:

   - --configuration ios.sim.debug
   - --testNamePattern per isolare un singolo test

3. cattura stdout/stderr
4. parsifica un JSON marker prodotto dal test
5. ritorna risultato MCP

Detox documenta esplicitamente che “matchers + actions” sono il modello, e fornisce le azioni ufficiali.

### **11.2 Template micro-test Detox (EJS)**

script/detox-action-template.ejs:

```
/* eslint-disable */
const { device, element, by, expect, waitFor } = require('detox');

function mcpPrint(obj) {
  // marker facilmente parsabile
  process.stdout.write(`\n[MCP_RESULT]${JSON.stringify(obj)}[/MCP_RESULT]\n`);
}

describe('mcp_action', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: false });
  });

  it('run', async () => {
    const startedAt = Date.now();

    // <<<ACTION_SNIPPET>>>

    mcpPrint({
      ok: true,
      elapsedMs: Date.now() - startedAt
    });
  });
});
```

### **11.3 Generazione snippet per ciascun tool UI**

#### **Selector mapping**

Supporta:

- by.id(testID) (il principale)
- by.text("...")
- by.label("...")

Esempio:

```
export function selectorToDetoxExpr(sel: Selector): string {
  switch (sel.by) {
    case "id": return `by.id(${JSON.stringify(sel.value)})`;
    case "text": return `by.text(${JSON.stringify(sel.value)})`;
    case "label": return `by.label(${JSON.stringify(sel.value)})`;
    default: throw new Error("Unsupported selector");
  }
}
```

#### **tap**

Snippet:

```
await element(<MATCHER>).tap();
```

#### **type**

Snippet (con workaround comune)

Detox ha azioni per input; in alcuni casi su iOS può essere più affidabile by.label o strategie alternate (hai probabilmente già pattern in repo).

Snippet:

```
const el = element(<MATCHER>);
await el.tap();
await el.clearText();
await el.typeText("...");
```

#### **swipe/scroll**

Detox actions ufficiali includono swipe/scroll.

### **11.4 Esecuzione detox test**

Comando tipico:

```
npx detox test --configuration ios.sim.debug --testNamePattern "^mcp_action run$" --cleanup
```

> Suggerimento: evita che Detox esegua _tutti_ i test del repo. Genera il micro-test in una cartella dedicata e passa --testPathPattern se necessario.

### **11.5 Parsing output**

Nel server:

- cerca marker [MCP_RESULT]...[/MCP_RESULT]
- JSON.parse
- se non presente → errore DETOX_TEST_FAILED + allega log

---

## **12) Implementazione tool MCP** 

## **ui.\***

##  **sopra Detox**

### **12.1** 

### **detox.session.start**

Scopo:

- validare config
- assicurare simulator booted
- (opzionale) warmup Detox: esegui un micro-test “noop” per assicurare pipeline pronta

Output:

- sessionId (uuid interno server)
- configuration
- device info (udid, name)

### **12.2** 

### **ui.wait_for**

Snippet:

```
await waitFor(element(<MATCHER>)).toBeVisible().withTimeout(30000);
```

### **12.3** 

### **ui.screenshot**

Opzione A (consigliata per uniformità): simulator.screenshot con simctl (semplice e affidabile).

Opzione B: device.takeScreenshot("name") (se preferisci screenshot “in contesto test”).

---

## **13) Visual regression**

### **13.1 Baseline store**

Struttura:

```
artifacts/
  baselines/
    ios.sim.debug/
      iPhone_15/
        after-login.png
```

### **13.2 Compare pipeline**

Passi:

1. carica baseline + actual
2. se dimensioni diverse → fall con remediation (o normalizza con sharp se decidi)
3. pixelmatch → diff.png
4. calcola mismatchPercent e compara con threshold

Output MCP:

- pass: boolean
- mismatchPercent
- artifacts: actual.png, baseline.png, diff.png

---

## **14) Logs & evidenze**

### **14.1 Ring buffer**

Mantieni 3 ring buffer:

- expo
- simulator log stream
- detox

Esporre:

- expo.logs.tail(lines)
- resource://logs/expo/latest etc.

### **14.2 In caso di errore UI**

Sempre allegare:

- screenshot (auto)
- ultimi 150–300 log lines detox + expo
- suggerimento remediation (es. “testID mancante”, “elemento non visibile”, “timeout busy resources”)

---

## **15) Tool list finale (implementazione)**

### **Simulator (simctl)**

- simulator.list_devices
- simulator.boot
- simulator.shutdown
- simulator.erase
- simulator.screenshot
- simulator.record_video.start|stop
- simulator.log_stream.start|stop

### **Expo**

- expo.start
- expo.stop
- expo.logs.tail

### **Detox/session**

- detox.session.start
- detox.session.stop
- detox.healthcheck

### **UI (Detox micro-tests)**

- ui.tap
- ui.long_press
- ui.swipe
- ui.scroll
- ui.type
- ui.press_key (mapping a tapReturnKey / tapBackspaceKey se ti serve)
- ui.wait_for
- ui.assert_text
- ui.screenshot (delegato a simctl o detox)

### **Visual**

- visual.baseline.save
- visual.compare

### **Macro**

- flow.run

---

## **16) Integrazione Cursor (MCP stdio)**

Cursor documenta configurazione per MCP stdio e file mcp.json.

Esempio ~/.cursor/mcp.json (indicativo):

```
{
  "servers": {
    "mcp-ios-detox": {
      "type": "stdio",
      "command": "node",
      "args": ["/ABS/PATH/mcp-ios-detox/dist/index.js"],
      "env": {
        "MCP_CONFIG": "/ABS/PATH/mcp-ios-detox/mcp.config.json"
      }
    }
  }
}
```

---

## **17) Piano di implementazione (sequenza consigliata)**

### **Phase 1 — Skeleton MCP + simctl (2–3 giorni)**

- server stdio
- list/boot/screenshot
- artifacts manager
- log ring buffer base

### **Phase 2 — Detox runner (3–6 giorni)**

- micro-test generator + runner
- implementa detox.session.start + ui.tap + ui.wait_for + ui.type
- parsing output marker
- error mapping + auto-screenshot su failure

### **Phase 3 — Expo orchestrator (2–4 giorni)**

- start/stop expo start –ios
- log capture + metro readiness
- flow.run con steps base

### **Phase 4 — Visual regression (2–4 giorni)**

- baseline.save + compare + diff artifacts
- report JSON + markdown

### **Phase 5 — Harden & DX (ongoing)**

- concurrency lock (evita 2 comandi simultanei su stesso simulator)
- timeouts & retry
- prompt templates MCP (opzionale)

---

## **18) “Definition of Done” per tool UI**

Ogni tool ui.\* è “DONE” quando:

- funziona su una demo screen
- in caso di failure produce:
  - error.code coerente
  - screenshot allegato
  - log excerpt
  - remediation hint

---

## **19) Note pragmatiche Detox (già utili in implementazione)**

- **TextInput**: su iOS alcuni casi richiedono usare accessibilityLabel o strategie di focus/tap prima di typeText (se hai già workaround nelle tue suite, riusali).
- Preferisci by.id(testID) ovunque; fallback by.label per input problematici.
- Aggiungi un “Debug panel” in app (solo debug) per accelerare diagnosi (route/state/version).
