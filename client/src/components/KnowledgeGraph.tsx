import { useRef, useEffect, useState, useCallback } from 'react';
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceX, forceCollide, SimulationNodeDatum, SimulationLinkDatum } from 'd3-force';
import { zoom, zoomIdentity, ZoomBehavior } from 'd3-zoom';
import { select } from 'd3-selection';
import type { GraphNode, GraphEdge, GraphData } from '../api';

interface Props {
  data: GraphData;
  onNodeClick?: (node: GraphNode) => void;
  className?: string;
}

interface GraphSimNode extends SimulationNodeDatum {
  id: string;
  type: 'source' | 'article' | 'cluster';
  label: string;
  bias?: string;
  credibility?: number;
  articleCount?: number;
  blindspot?: string[];
  coverage?: Record<string, number>;
  publishedAt?: string;
  sourceId?: string;
  sourceName?: string;
  url?: string;
}

interface GraphSimLink extends SimulationLinkDatum<GraphSimNode> {
  type: 'published_by' | 'contains';
}

const BIAS_COLORS: Record<string, string> = {
  'left': '#3B82F6',
  'lean-left': '#22C55E',
  'center': '#9CA3AF',
  'lean-right': '#F97316',
  'right': '#EF4444',
};

const BIAS_X_POSITIONS: Record<string, number> = {
  'left': -300,
  'lean-left': -150,
  'center': 0,
  'lean-right': 150,
  'right': 300,
};

const NODE_SIZES: Record<string, { min: number; max: number }> = {
  source: { min: 8, max: 20 },
  article: { min: 3, max: 6 },
  cluster: { min: 15, max: 40 },
};

function getNodeSize(node: GraphSimNode): number {
  const range = NODE_SIZES[node.type];
  if (node.type === 'cluster') {
    const count = node.articleCount || 1;
    return range.min + Math.min(count * 2, range.max - range.min);
  }
  if (node.type === 'source') {
    const count = node.articleCount || 1;
    return range.min + Math.min(count * 0.5, range.max - range.min);
  }
  const cred = node.credibility || 0.5;
  return range.min + cred * (range.max - range.min);
}

function getNodeColor(node: GraphSimNode): string {
  return BIAS_COLORS[node.bias || 'center'] || BIAS_COLORS.center;
}

function getNodeAlpha(node: GraphSimNode): number {
  if (node.type === 'cluster') return 0.85;
  if (node.type === 'source') return 0.9;
  const cred = node.credibility || 0.5;
  return 0.3 + cred * 0.5;
}

function drawNode(ctx: CanvasRenderingContext2D, node: GraphSimNode, isHovered: boolean, isHighlighted: boolean) {
  const size = getNodeSize(node);
  const color = getNodeColor(node);
  const alpha = isHighlighted ? 1 : isHovered ? 1 : getNodeAlpha(node);

  ctx.save();
  ctx.globalAlpha = alpha;

  if (node.type === 'cluster') {
    ctx.beginPath();
    ctx.arc(node.x!, node.y!, size, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    if (node.blindspot && node.blindspot.length > 0) {
      ctx.strokeStyle = '#FBBF24';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    if (isHovered) {
      ctx.beginPath();
      ctx.arc(node.x!, node.y!, size + 4, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  } else if (node.type === 'source') {
    const s = size * 1.2;
    ctx.beginPath();
    ctx.arc(node.x!, node.y!, s, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();

    if (isHovered) {
      ctx.beginPath();
      ctx.arc(node.x!, node.y!, s + 4, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.max(8, s * 0.8)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const abbr = (node.label || '').split(' ').map(w => w[0]).join('').slice(0, 3).toUpperCase();
    ctx.fillText(abbr, node.x!, node.y!);
  } else {
    ctx.beginPath();
    ctx.arc(node.x!, node.y!, size, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    if (isHovered) {
      ctx.beginPath();
      ctx.arc(node.x!, node.y!, size + 3, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  ctx.restore();
}

function drawEdge(ctx: CanvasRenderingContext2D, source: GraphSimNode, target: GraphSimNode, type: string) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(source.x!, source.y!);
  ctx.lineTo(target.x!, target.y!);

  if (type === 'contains') {
    ctx.strokeStyle = 'rgba(150,150,150,0.15)';
    ctx.lineWidth = 0.5;
  } else {
    const color = BIAS_COLORS[target.bias || 'center'] || BIAS_COLORS.center;
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    ctx.strokeStyle = `rgba(${r},${g},${b},0.12)`;
    ctx.lineWidth = 0.5;
  }

  ctx.stroke();
  ctx.restore();
}

export default function KnowledgeGraph({ data, onNodeClick, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<any>(null);
  const nodesRef = useRef<GraphSimNode[]>([]);
  const linksRef = useRef<GraphSimLink[]>([]);
  const zoomRef = useRef<ZoomBehavior<HTMLCanvasElement, unknown> | null>(null);
  const transformRef = useRef({ x: 0, y: 0, k: 1 });
  const animFrameRef = useRef<number>(0);
  const hoveredNodeRef = useRef<string | null>(null);

  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; node: GraphNode } | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600, cssWidth: 800, cssHeight: 600 });

  const getNodeAtPosition = useCallback((mx: number, my: number): GraphSimNode | null => {
    const t = transformRef.current;
    const nodes = nodesRef.current;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i];
      const size = getNodeSize(node);
      const dx = (mx - t.x) / t.k;
      const dy = (my - t.y) / t.k;
      const dist = Math.sqrt((node.x! - dx) ** 2 + (node.y! - dy) ** 2);
      if (dist <= size + 4) return node;
    }
    return null;
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const dpr = window.devicePixelRatio || 1;
        setDimensions({ width: width * dpr, height: height * dpr, cssWidth: width, cssHeight: height });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const simNodes: GraphSimNode[] = data.nodes.map(n => ({
      ...n,
      x: (BIAS_X_POSITIONS[n.bias || 'center'] || 0) + (Math.random() - 0.5) * 100,
      y: (Math.random() - 0.5) * 200,
    }));

    const nodeIdSet = new Set(simNodes.map(n => n.id));
    const simLinks: GraphSimLink[] = data.edges
      .filter(e => nodeIdSet.has(e.source as string) && nodeIdSet.has(e.target as string))
      .map(e => ({
        source: e.source as string,
        target: e.target as string,
        type: e.type,
      }));

    nodesRef.current = simNodes;
    linksRef.current = simLinks;

    const simulation = forceSimulation(simNodes)
      .force('link', forceLink<GraphSimNode, GraphSimLink>(simLinks)
        .id(d => d.id)
        .distance(d => d.type === 'contains' ? 60 : 40)
        .strength(d => d.type === 'contains' ? 0.3 : 0.2))
      .force('charge', forceManyBody<GraphSimNode>()
        .strength(d => d.type === 'cluster' ? -200 : d.type === 'source' ? -100 : -20)
        .distanceMax(400))
      .force('center', forceCenter(0, 0).strength(0.05))
      .force('x', forceX<GraphSimNode>()
        .x(d => BIAS_X_POSITIONS[d.bias || 'center'] || 0)
        .strength(d => d.type === 'source' ? 0.15 : d.type === 'cluster' ? 0.08 : 0.03))
      .force('collide', forceCollide<GraphSimNode>()
        .radius(d => getNodeSize(d) + 3)
        .strength(0.5))
      .alphaDecay(0.02)
      .velocityDecay(0.3);

    simulationRef.current = simulation;

    const zoomBehavior = zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.1, 5])
      .on('zoom', (event) => {
        transformRef.current = event.transform;
      });

    zoomRef.current = zoomBehavior;
    select(canvas).call(zoomBehavior);

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('mouseleave', handleMouseLeave);

    function handleMouseMove(event: MouseEvent) {
      const rect = canvas!.getBoundingClientRect();
      const mx = event.clientX - rect.left;
      const my = event.clientY - rect.top;
      const node = getNodeAtPosition(mx, my);

      if (node) {
        hoveredNodeRef.current = node.id;
        setHoveredNode(node.id);
        setTooltip({
          x: event.clientX,
          y: event.clientY,
          node: node as unknown as GraphNode,
        });
        canvas!.style.cursor = 'pointer';
      } else {
        hoveredNodeRef.current = null;
        setHoveredNode(null);
        setTooltip(null);
        canvas!.style.cursor = 'grab';
      }
    }

    function handleClick(event: MouseEvent) {
      const rect = canvas!.getBoundingClientRect();
      const mx = event.clientX - rect.left;
      const my = event.clientY - rect.top;
      const node = getNodeAtPosition(mx, my);

      if (node && onNodeClick) {
        onNodeClick(node as unknown as GraphNode);
      }
    }

    function handleMouseLeave() {
      hoveredNodeRef.current = null;
      setHoveredNode(null);
      setTooltip(null);
    }

    return () => {
      simulation.stop();
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('click', handleClick);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [data, onNodeClick, getNodeAtPosition]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    function render() {
      const t = transformRef.current;
      ctx!.clearRect(0, 0, dimensions.cssWidth, dimensions.cssHeight);
      ctx!.save();
      ctx!.translate(t.x, t.y);
      ctx!.scale(t.k, t.k);

      for (const link of linksRef.current) {
        const source = link.source as unknown as GraphSimNode;
        const target = link.target as unknown as GraphSimNode;
        if (source.x !== undefined && target.x !== undefined) {
          drawEdge(ctx!, source, target, link.type);
        }
      }

      for (const node of nodesRef.current) {
        if (node.x !== undefined && node.y !== undefined) {
          const hoveredId = hoveredNodeRef.current;
          const isHovered = hoveredId === node.id;
          const isHighlighted = hoveredId
            ? linksRef.current.some(l => {
                const s = l.source as unknown as GraphSimNode;
                const tgt = l.target as unknown as GraphSimNode;
                return (s.id === hoveredId && tgt.id === node.id) ||
                       (tgt.id === hoveredId && s.id === node.id);
              })
            : false;
          drawNode(ctx!, node, isHovered, isHighlighted || isHovered);
        }
      }

      ctx!.restore();
      animFrameRef.current = requestAnimationFrame(render);
    }

    animFrameRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [dimensions.cssWidth, dimensions.cssHeight]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const container = containerRef.current;
    if (!container) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.scale(dpr, dpr);

    if (zoomRef.current) {
      const initialTransform = zoomIdentity
        .translate(rect.width / 2, rect.height / 2)
        .scale(0.8);
      select(canvas).call(zoomRef.current.transform, initialTransform);
    }
  }, [dimensions]);

  return (
    <div ref={containerRef} className={`relative w-full h-full ${className || ''}`}>
      <canvas ref={canvasRef} className="block w-full h-full" />

      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-3 max-w-[280px]"
          style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}
        >
          {tooltip.node.type === 'source' && (
            <>
              <div className="flex items-center gap-2 mb-1">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: BIAS_COLORS[tooltip.node.bias || 'center'] }}
                />
                <span className="font-bold text-sm text-gray-900 dark:text-gray-100">
                  {tooltip.node.label}
                </span>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {tooltip.node.bias?.replace('-', ' ').toUpperCase()} · {tooltip.node.articleCount} articles
              </div>
              {tooltip.node.credibility !== undefined && (
                <div className="text-xs text-gray-400 mt-1">
                  Credibility: {Math.round(tooltip.node.credibility * 100)}%
                </div>
              )}
            </>
          )}
          {tooltip.node.type === 'article' && (
            <>
              <div className="font-semibold text-xs text-gray-900 dark:text-gray-100 mb-1 line-clamp-2">
                {tooltip.node.label}
              </div>
              <div className="flex items-center gap-2 text-[10px] text-gray-500 dark:text-gray-400">
                <span
                  className="px-1.5 py-0.5 rounded-full font-bold"
                  style={{
                    backgroundColor: BIAS_COLORS[tooltip.node.bias || 'center'] + '20',
                    color: BIAS_COLORS[tooltip.node.bias || 'center'],
                  }}
                >
                  {tooltip.node.bias?.replace('-', ' ').toUpperCase()}
                </span>
                <span>{tooltip.node.sourceName}</span>
              </div>
            </>
          )}
          {tooltip.node.type === 'cluster' && (
            <>
              <div className="font-bold text-sm text-gray-900 dark:text-gray-100 mb-1 line-clamp-2">
                {tooltip.node.label}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                {tooltip.node.articleCount} articles across {Object.keys(tooltip.node.coverage || {}).length} sources
              </div>
              {tooltip.node.blindspot && tooltip.node.blindspot.length > 0 && (
                <div className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                  Blindspots: {tooltip.node.blindspot.map(b => b.replace('-', ' ')).join(', ')}
                </div>
              )}
              <div className="flex gap-1 mt-1.5">
                {Object.entries(tooltip.node.coverage || {}).map(([bias, count]) => (
                  <div
                    key={bias}
                    className="flex items-center gap-0.5 text-[10px]"
                    style={{ color: BIAS_COLORS[bias] }}
                  >
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: BIAS_COLORS[bias] }} />
                    {count as number}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div className="absolute bottom-4 left-4 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-3">
        <div className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
          Legend
        </div>
        <div className="space-y-1.5">
          {Object.entries(BIAS_COLORS).map(([bias, color]) => (
            <div key={bias} className="flex items-center gap-2 text-xs">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-gray-600 dark:text-gray-300 capitalize">{bias.replace('-', ' ')}</span>
            </div>
          ))}
          <div className="border-t border-gray-200 dark:border-gray-600 pt-1.5 mt-1.5">
            <div className="flex items-center gap-2 text-xs">
              <div className="w-4 h-4 rounded-full border-2 border-gray-300 dark:border-gray-500" />
              <span className="text-gray-600 dark:text-gray-300">Source</span>
            </div>
            <div className="flex items-center gap-2 text-xs mt-1">
              <div className="w-3 h-3 rounded-full bg-gray-400" />
              <span className="text-gray-600 dark:text-gray-300">Article</span>
            </div>
            <div className="flex items-center gap-2 text-xs mt-1">
              <div className="w-5 h-5 rounded-full bg-gray-400 border-2 border-amber-400" />
              <span className="text-gray-600 dark:text-gray-300">Story (blindspot)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
