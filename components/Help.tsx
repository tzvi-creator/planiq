export default function Help({ title, intro, items }: { title: string; intro?: string; items: [string, string][] }) {
  return (
    <details className="help" open>
      <summary>מדריך למסך: {title}</summary>
      <div className="body">
        {intro && <p>{intro}</p>}
        <dl>
          {items.map(([k, v]) => (
            <div key={k} style={{ display: 'contents' }}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </details>
  );
}
