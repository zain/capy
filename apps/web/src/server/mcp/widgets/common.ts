// Shared runtime for Capy's MCP Apps views: host theme, styles, formatting and small DOM helpers.
import {
  App,
  applyDocumentTheme,
  applyHostStyleVariables,
  type McpUiHostContext,
} from "@modelcontextprotocol/ext-apps";

// Host variables win; the fallbacks follow the host's light/dark theme or the OS setting.
const css = `
:root {
  color-scheme: light;
  --bg: var(--color-background-primary, #fcfcfb);
  --bg2: var(--color-background-secondary, #f4f4f1);
  --ink: var(--color-text-primary, #0b0b0b);
  --ink2: var(--color-text-secondary, #52514e);
  --line: var(--color-border-primary, rgba(11, 11, 11, 0.12));
  --warn-bg: var(--color-background-warning, #fff4dc);
  --warn-ink: var(--color-text-warning, #6b4700);
  --danger-ink: var(--color-text-danger, #a42424);
  --focus: var(--color-ring-primary, #2a78d6);
  --radius: var(--border-radius-md, 8px);
  --font: var(--font-sans, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif);
  --mono: var(--font-mono, ui-monospace, "SF Mono", Menlo, monospace);
  --s1: #2a78d6; --s2: #eb6834; --s3: #1baf7a; --s4: #eda100;
  --s5: #e87ba4; --s6: #008300; --s7: #4a3aa7; --s8: #e34948; --s0: #a3a29c;
}
@media (prefers-color-scheme: dark) {
  :root:where(:not([data-theme="light"])) {
    color-scheme: dark;
    --bg: var(--color-background-primary, #1a1a19);
    --bg2: var(--color-background-secondary, #242422);
    --ink: var(--color-text-primary, #ffffff);
    --ink2: var(--color-text-secondary, #c3c2b7);
    --line: var(--color-border-primary, rgba(255, 255, 255, 0.14));
    --warn-bg: var(--color-background-warning, #3a2c0c);
    --warn-ink: var(--color-text-warning, #fab219);
    --danger-ink: var(--color-text-danger, #e66767);
    --s1: #3987e5; --s2: #d95926; --s3: #199e70; --s4: #c98500;
    --s5: #d55181; --s6: #008300; --s7: #9085e9; --s8: #e66767; --s0: #6b6a65;
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --bg: var(--color-background-primary, #1a1a19);
  --bg2: var(--color-background-secondary, #242422);
  --ink: var(--color-text-primary, #ffffff);
  --ink2: var(--color-text-secondary, #c3c2b7);
  --line: var(--color-border-primary, rgba(255, 255, 255, 0.14));
  --warn-bg: var(--color-background-warning, #3a2c0c);
  --warn-ink: var(--color-text-warning, #fab219);
  --danger-ink: var(--color-text-danger, #e66767);
  --s1: #3987e5; --s2: #d95926; --s3: #199e70; --s4: #c98500;
  --s5: #d55181; --s6: #008300; --s7: #9085e9; --s8: #e66767; --s0: #6b6a65;
}
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--bg); color: var(--ink); }
body { font: 14px/1.45 var(--font); padding: 16px; min-width: 0; }
h1 { font-size: 16px; font-weight: 600; margin: 0; }
h2 { font-size: 13px; font-weight: 600; margin: 20px 0 8px; color: var(--ink2); }
p { margin: 0; }
.muted { color: var(--ink2); font-size: 12px; }
.head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; flex-wrap: wrap; }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; margin: 14px 0 0; }
.stat { background: var(--bg2); border-radius: var(--radius); padding: 8px 10px; min-width: 0; }
.stat dt { font-size: 12px; color: var(--ink2); }
.stat dd { margin: 2px 0 0; font-size: 16px; font-weight: 600; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.scroll { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: 13px; }
th, td { text-align: left; padding: 6px 8px 6px 0; border-bottom: 1px solid var(--line); vertical-align: top; }
th { font-weight: 500; color: var(--ink2); font-size: 12px; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; padding-right: 0; padding-left: 8px; }
tr:last-child td { border-bottom: 0; }
.swatch { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 8px; vertical-align: -1px; }
button, input { font: inherit; color: inherit; }
button { cursor: pointer; border: 1px solid var(--line); background: var(--bg2); border-radius: var(--radius); padding: 6px 12px; font-weight: 500; }
button.primary { background: var(--ink); color: var(--bg); border-color: var(--ink); }
button:disabled { opacity: 0.6; cursor: default; }
button:focus-visible, input:focus-visible, [tabindex]:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
input { background: var(--bg); border: 1px solid var(--line); border-radius: var(--radius); padding: 6px 8px; width: 100%; min-width: 0; font-variant-numeric: tabular-nums; }
label { display: block; font-size: 12px; color: var(--ink2); }
label input { margin-top: 4px; }
.notice { background: var(--warn-bg); color: var(--warn-ink); border-radius: var(--radius); padding: 8px 10px; font-size: 13px; }
.error { color: var(--danger-ink); font-size: 13px; }
.tip { position: fixed; pointer-events: none; background: var(--ink); color: var(--bg); padding: 6px 8px; border-radius: 6px; font-size: 12px; white-space: nowrap; z-index: 10; }
.empty { color: var(--ink2); padding: 12px 0; }
`;

export type ToolResult = {
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
  content?: unknown[];
};

/** Connects to the host, follows its theme, and hands every tool result to `render`. */
export function startApp(name: string, render: (data: Record<string, unknown>) => void) {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.insertBefore(style, document.head.firstChild);
  const app = new App({ name, version: "1.0.0" });
  const theme = (ctx: McpUiHostContext | undefined) => {
    if (ctx?.theme) applyDocumentTheme(ctx.theme);
    if (ctx?.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
  };
  app.onhostcontextchanged = theme;
  app.ontoolresult = (result) => {
    const r = result as ToolResult;
    if (r.isError || !r.structuredContent) showError(r);
    else render(r.structuredContent);
  };
  app.onteardown = async () => ({});
  void app.connect().then(() => theme(app.getHostContext()));
  return app;
}

function showError(result: ToolResult) {
  const first = (result.content ?? [])[0] as { text?: string } | undefined;
  mount(document.body, el("p", { class: "error" }, first?.text ?? "Capy couldn’t load this."));
}

type Child = Node | string | number | null | undefined | false;
/** Replaces an element's children, skipping empty values. */
export function mount(root: Element, ...children: Child[]) {
  root.replaceChildren();
  for (const c of children)
    if (c !== null && c !== undefined && c !== false)
      root.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
}
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | undefined> = {},
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined) node.setAttribute(k, v);
  for (const c of children.flat())
    if (c !== null && c !== undefined && c !== false)
      node.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  return node;
}

const number = (value: unknown) => Number(String(value ?? ""));
export function shares(value: unknown) {
  const n = number(value);
  return Number.isFinite(n) ? Math.round(n).toLocaleString("en-US") : "—";
}
export function money(value: unknown) {
  const n = number(value);
  if (!Number.isFinite(n)) return "—";
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: Number.isInteger(n) ? 0 : 2 });
}
export function compactMoney(value: unknown) {
  const n = number(value);
  if (!Number.isFinite(n)) return "—";
  return "$" + n.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 2 });
}
export function price(value: unknown) {
  const n = number(value);
  return Number.isFinite(n)
    ? "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })
    : "—";
}
export const percent = (value: unknown) => {
  const n = number(value);
  return Number.isFinite(n) ? `${n.toFixed(2)}%` : "—";
};

export function table(headers: [string, boolean?][], rows: (Node | string)[][]) {
  return el(
    "div",
    { class: "scroll" },
    el(
      "table",
      {},
      el(
        "thead",
        {},
        el(
          "tr",
          {},
          headers.map(([h, num]) => el("th", { class: num ? "num" : undefined, scope: "col" }, h)),
        ),
      ),
      el(
        "tbody",
        {},
        rows.map((r) =>
          el(
            "tr",
            {},
            r.map((c, i) => el("td", { class: headers[i]?.[1] ? "num" : undefined }, c)),
          ),
        ),
      ),
    ),
  );
}
export function stat(label: string, value: string) {
  return el("div", { class: "stat" }, el("dt", {}, label), el("dd", {}, value));
}

/** A button that asks the host to open a Capy page in the user's browser. */
export function openButton(app: App, label: string, url: unknown, primary = false) {
  if (typeof url !== "string" || !/^https?:\/\//.test(url)) return null;
  const b = el("button", { type: "button", class: primary ? "primary" : undefined }, label);
  b.addEventListener("click", () => void app.openLink({ url }));
  return b;
}

let tip: HTMLDivElement | null = null;
/** Hover and focus tooltip for chart marks. */
export function tooltip(target: Element, text: string) {
  const show = (x: number, y: number) => {
    tip ??= document.body.appendChild(el("div", { class: "tip", role: "presentation" }));
    tip.textContent = text;
    tip.hidden = false;
    const w = tip.offsetWidth;
    tip.style.left = `${Math.max(4, Math.min(x - w / 2, window.innerWidth - w - 4))}px`;
    tip.style.top = `${Math.max(4, y - 34)}px`;
  };
  const hide = () => tip && (tip.hidden = true);
  target.addEventListener("pointermove", (e) =>
    show((e as PointerEvent).clientX, (e as PointerEvent).clientY),
  );
  target.addEventListener("pointerleave", hide);
  target.addEventListener("focus", () => {
    const r = target.getBoundingClientRect();
    show(r.left + r.width / 2, r.top);
  });
  target.addEventListener("blur", hide);
}
