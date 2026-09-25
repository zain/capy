import {
  compactMoney,
  el,
  money,
  mount,
  openButton,
  percent,
  price,
  shares,
  startApp,
  stat,
  table,
  type ToolResult,
} from "./common";

type Round = {
  companyId: string;
  asOf: string;
  preMoney: string;
  investment: string;
  postMoney: string;
  pricePerShare: string;
  newShares: string;
  fullyDilutedBefore: string;
  afterRound: string;
  convertedShares: string;
  convertibles: number;
  rows: {
    key: string;
    name: string;
    beforePercent: string;
    afterConversionPercent: string;
    afterRoundPercent: string;
  }[];
  rowCount: number;
  assumptions: string;
  link: string;
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const preMoney = $<HTMLInputElement>("preMoney"),
  investment = $<HTMLInputElement>("investment"),
  run = $<HTMLButtonElement>("run"),
  error = $<HTMLParagraphElement>("error");
let companyId: string | undefined;

const grouped = (value: string) => {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: 2 }) : value;
};
const clean = (value: string) => value.replace(/[\s,$]/g, "");

function render(data: Record<string, unknown>) {
  const r = data as unknown as Round;
  companyId = r.companyId;
  preMoney.value = grouped(r.preMoney);
  investment.value = grouped(r.investment);
  error.textContent = "";
  $("subtitle").textContent =
    `${compactMoney(r.preMoney)} pre-money · ${compactMoney(r.investment)} invested · snapshot ${r.asOf}`;
  mount($("open"), openButton(app, "Open in Capy", r.link));
  const change = (before: string, after: string) => {
    const d = Number(after) - Number(before);
    return el(
      "span",
      { class: d > 0 ? "up" : "down" },
      `${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.abs(d).toFixed(2)}`,
    );
  };
  mount(
    $("root"),
    el(
      "dl",
      { class: "stats" },
      stat("Price per share", price(r.pricePerShare)),
      stat("Post-money", compactMoney(r.postMoney)),
      stat("New investor shares", shares(r.newShares)),
      stat("Fully diluted after", shares(r.afterRound)),
    ),
    r.convertibles > 0
      ? el(
          "p",
          { class: "muted", style: "margin-top:8px" },
          `${r.convertibles} SAFEs and notes convert into ${shares(r.convertedShares)} shares.`,
        )
      : null,
    el("h2", {}, "Ownership (% of fully diluted)"),
    table(
      [["Holder"], ["Before", true], ["After round", true], ["Change (pts)", true]],
      r.rows.map((x) => [
        x.name,
        percent(x.beforePercent),
        percent(x.afterRoundPercent),
        change(x.beforePercent, x.afterRoundPercent),
      ]),
    ),
    r.rowCount > r.rows.length
      ? el("p", { class: "muted" }, `Showing ${r.rows.length} of ${r.rowCount} holders.`)
      : null,
    el("p", { class: "muted", style: "margin-top:12px" }, r.assumptions, " Nothing is saved."),
  );
}

const app = startApp("capy-round", render);
app.ontoolinput = ({ arguments: args }) => {
  const a = (args ?? {}) as { preMoney?: unknown; investment?: unknown };
  if (a.preMoney !== undefined) preMoney.value = grouped(String(a.preMoney));
  if (a.investment !== undefined) investment.value = grouped(String(a.investment));
};

/** A model run from the view never reaches the conversation, so tell the model what the user sees. */
async function tellModel(r: Round) {
  const text = [
    `The user re-ran the round model in the Capy view (snapshot ${r.asOf}). It now shows ${money(r.preMoney)} pre-money, ${money(r.investment)} invested, ${money(r.postMoney)} post-money, ${price(r.pricePerShare)} per share and ${shares(r.newShares)} new investor shares.`,
    "Ownership of fully diluted shares, before and after the round:",
    ...r.rows
      .slice(0, 15)
      .map((x) => `- ${x.name}: ${percent(x.beforePercent)} → ${percent(x.afterRoundPercent)}`),
    "Use these figures instead of the earlier model_round result.",
  ].join("\n");
  try {
    if (!app.getHostCapabilities()?.updateModelContext) throw new Error("unsupported");
    await app.updateModelContext({ content: [{ type: "text", text }] });
  } catch {
    $("subtitle").append(" · The assistant hasn’t seen these figures; ask it to model this round.");
  }
}

// Sandboxed hosts block form submission, so the button and Enter key run the model directly.
async function update() {
  const pre = clean(preMoney.value),
    inv = clean(investment.value);
  if (!/^\d+(\.\d+)?$/.test(pre) || !/^\d+(\.\d+)?$/.test(inv) || Number(pre) <= 0) {
    error.textContent =
      "Enter the pre-money valuation and investment as dollar amounts, like 20,000,000.";
    return;
  }
  run.disabled = true;
  run.textContent = "Updating…";
  try {
    const result = (await app.callServerTool({
      name: "model_round",
      arguments: { ...(companyId ? { companyId } : {}), preMoney: pre, investment: inv },
    })) as ToolResult;
    if (result.isError || !result.structuredContent)
      error.textContent =
        ((result.content ?? [])[0] as { text?: string } | undefined)?.text ??
        "Capy couldn’t model that round.";
    else {
      render(result.structuredContent);
      await tellModel(result.structuredContent as unknown as Round);
    }
  } catch {
    error.textContent = "Capy couldn’t model that round. Try again.";
  } finally {
    run.disabled = false;
    run.textContent = "Update";
  }
}
run.addEventListener("click", () => void update());
for (const input of [preMoney, investment])
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") void update();
  });
