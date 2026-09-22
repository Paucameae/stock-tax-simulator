// Split out of Portfolio.tsx so that recharts (~250 kB with its d3 deps) is
// fetched only when a portfolio actually has something to break down, instead
// of riding along with the Portfolio chunk.
import { Treemap, ResponsiveContainer } from 'recharts';
import { formatEUR } from '../lib/utils';

// A type alias, not an interface: recharts' `data` prop requires an implicit
// index signature, which TS only grants to aliases.
export type TreemapBucket = {
  key: string;
  name: string;
  /** Human-readable form of `name`, used by the text alternative, not by the tiles. */
  label: string;
  code: string;
  value: number;
  count: number;
  shares: number;
  gainLoss: number;
  fill: string;
};

interface TreemapTileNodeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  index?: number;
  // Recharts spreads bucket props at top level (name, value, fill, plus our own
  // custom fields like `code`) onto the content component.
  name?: string;
  value?: number;
  fill?: string;
  code?: string;
  [key: string]: unknown;
}

// Custom tile renderer for the allocation treemap. Text is rendered through a
// `<foreignObject>` so the browser uses its native font rasteriser (much
// crisper than SVG `<text>`). A native `title` attribute provides a tooltip on
// hover for every tile, including slivers too small to show any inline text.
function TreemapTile({ total, ...nodeProps }: { total: number } & TreemapTileNodeProps) {
  const { x = 0, y = 0, width = 0, height = 0 } = nodeProps;
  const name = nodeProps.name ?? '';
  const code = nodeProps.code ?? name;
  const value = nodeProps.value ?? 0;
  const fill = nodeProps.fill ?? '#888';
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const tooltip = `${name} · ${formatEUR(value)} · ${pct} %`;

  // Choose what fits inside the rectangle. For unusable sizes we still render
  // the rect (and keep the tooltip via `title`) so the colour stays visible.
  const showFull = width > 70 && height > 36;
  const showAmount = width > 90 && height > 56;
  const showCodeOnly = !showFull && width > 26 && height > 18;

  return (
    <g>
      <title>{tooltip}</title>
      <rect x={x} y={y} width={width} height={height} fill={fill} stroke="#fff" strokeWidth={2} />
      {(showFull || showCodeOnly) && (
        <foreignObject x={x} y={y} width={width} height={height} style={{ pointerEvents: 'none' }}>
          <div
            style={{
              width: '100%',
              height: '100%',
              boxSizing: 'border-box',
              padding: showFull ? '6px 8px' : '0',
              color: '#fff',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: showFull ? 'flex-start' : 'center',
              alignItems: showFull ? 'flex-start' : 'center',
              fontFamily: 'inherit',
              lineHeight: 1.2,
              userSelect: 'none',
            }}
          >
            {showFull ? (
              <>
                <div style={{ fontSize: '12px', fontWeight: 600 }}>
                  {name} <span style={{ fontWeight: 400, opacity: 0.85, marginLeft: 4 }}>{pct} %</span>
                </div>
                {showAmount && (
                  <div style={{ fontSize: '11px', opacity: 0.9, marginTop: 2 }}>
                    {formatEUR(value)}
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: '11px', fontWeight: 600 }}>{code}</div>
            )}
          </div>
        </foreignObject>
      )}
    </g>
  );
}

export default function PortfolioTreemap({ data, total }: { data: TreemapBucket[]; total: number }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <Treemap
        data={data}
        dataKey="value"
        aspectRatio={4 / 3}
        stroke="#fff"
        isAnimationActive={false}
        content={<TreemapTile total={total} />}
      />
    </ResponsiveContainer>
  );
}
