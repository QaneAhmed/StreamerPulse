type TokenRow = {
  name: string;
  count: number;
};

type TopTokensCardProps = {
  tokens: TokenRow[];
  emotes: TokenRow[];
};

function renderList(items: TokenRow[], emptyLabel: string) {
  if (items.length === 0) {
    return (
      <li className="flex items-center justify-between rounded-lg border border-dashed border-slate-800 bg-slate-900/30 px-3 py-2 text-xs text-slate-500">
        {emptyLabel}
      </li>
    );
  }

  return items.map((item) => (
    <li
      key={item.name}
      className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/30 px-3 py-2 text-sm"
    >
      <span className="text-slate-200">{item.name}</span>
      <span className="text-slate-500">{item.count.toLocaleString()}</span>
    </li>
  ));
}

export default function TopTokensCard({ tokens, emotes }: TopTokensCardProps) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
      <h2 className="text-xl font-semibold text-slate-100">Top tokens &amp; emotes</h2>
      <p className="mt-1 text-xs text-slate-500">
        Rolling window aggregation. Update cadence depends on ingestion throughput.
      </p>
      <div className="mt-5 grid gap-6 md:grid-cols-2">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Tokens</p>
          <ul className="mt-3 space-y-2">
            {renderList(tokens, "No token activity yet.")}
          </ul>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Emotes</p>
          <ul className="mt-3 space-y-2">
            {renderList(emotes, "No emote surges yet.")}
          </ul>
        </div>
      </div>
    </div>
  );
}
