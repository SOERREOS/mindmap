'use client';
import {
  createContext, forwardRef, useCallback, useContext,
  useEffect, useImperativeHandle, useRef, useState,
} from 'react';
import {
  Background, MiniMap, ReactFlow, ReactFlowProvider,
  getBezierPath, getStraightPath, useEdgesState, useNodesState, useReactFlow,
  Handle, Position, addEdge,
  type Edge, type EdgeProps, type Node, type NodeMouseHandler, type NodeTypes, type OnConnect,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { motion, AnimatePresence } from 'framer-motion';
import type { ResearchMainNode, ResearchSubNode } from '@/lib/api';
import { expandNode, steeredExpandNode, bridgeIdeas } from '@/lib/api';

// ── 그룹 색상 ──────────────────────────────────────────────────
export const GROUP_COLORS = ['#4dd0e1', '#c084fc', '#4ade80', '#fb923c', '#f472b6'];
const hexRgb = (hex: string) => {
  const m = hex.match(/[a-f\d]{2}/gi);
  return m ? m.map(x => parseInt(x, 16)).join(',') : '255,255,255';
};
export const getGroup = (id: string): number => {
  if (id === 'root') return -1;
  if (id.startsWith('m')) return parseInt(id.slice(1));
  if (id.startsWith('s')) return parseInt(id.split('-')[0].slice(1));
  if (id.startsWith('exp-')) {
    const inner = id.slice(4);
    return getGroup(inner.substring(0, inner.lastIndexOf('-')));
  }
  return -1;
};

const MAIN_FLOATS = ['node-float-a','node-float-b','node-float-c','node-float-d','node-float-e','node-float-f'];
const SUB_FLOATS  = ['node-float-sa','node-float-sb','node-float-sc','node-float-sd','node-float-se','node-float-sf'];

// ── 컨텍스트 ───────────────────────────────────────────────────
const SelectCtx = createContext<{
  selectedId: string | null;
  exportMode: boolean;
  expandingId: string | null;
}>({ selectedId: null, exportMode: false, expandingId: null });

// ── 파티클 엣지 (얇은 베이스 선 + 느린 빛의 구체) ────────────────
function ParticleEdge({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style }: EdgeProps) {
  const [path] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const len = Math.sqrt((targetX - sourceX) ** 2 + (targetY - sourceY) ** 2);
  
  // 속도 대폭 감속 (기본보다 약 2.5~3배 느리게)
  const dur = Math.max(2.4, len / 85); 
  
  const op = (style?.opacity as number) ?? 1;
  const color = (style?.stroke as string) ?? 'rgba(255,255,255,0.3)';
  const width = (style?.strokeWidth as number) ?? 0.8;

  return (
    <g>
      {/* 베이스 가이드 선: 아주 얇고 희미하게 */}
      <path d={path} stroke={color} strokeWidth={0.5} fill="none" opacity={op * 0.12} />
      
      {/* 빛의 신호 (Particle) */}
      {op > 0.04 && (
        <g>
          {/* 빛의 잔상/글로우 */}
          <circle r="4.5" fill={color} opacity={op * 0.3}>
            <animateMotion dur={`${dur}s`} repeatCount="indefinite" path={path} />
          </circle>
          {/* 핵심 빛 (Core) */}
          <circle r="2.2" fill="#fff" opacity={op * 0.95} style={{ filter: 'drop-shadow(0 0 4px #fff)' }}>
            <animateMotion dur={`${dur}s`} repeatCount="indefinite" path={path} />
          </circle>
        </g>
      )}
    </g>
  );
}

// NetworkEdge and SignalEdge removed for minimalist design

// ── 오라 노드 ──────────────────────────────────────────────────
function OuraNode({ data }: { data: any }) {
  const color = GROUP_COLORS[data.groupIdx % GROUP_COLORS.length];
  const c = hexRgb(color);
  return (
    <div style={{
      width: 1100, height: 1100, borderRadius: '50%',
      background: `radial-gradient(circle, rgba(${c},0.10) 0%, rgba(${c},0.035) 40%, transparent 68%)`,
      pointerEvents: 'none',
    }} />
  );
}

// ── 루트 노드 (고정) ───────────────────────────────────────────
function RootNode({ data, id }: { data: any; id: string }) {
  const { selectedId, exportMode } = useContext(SelectCtx);
  const isFaded = !exportMode && selectedId !== null && selectedId !== id;
  return (
    <div style={{
      background: 'rgba(255,255,255,0.96)', color: '#000',
      borderRadius: '60px', padding: '20px 56px',
      fontWeight: 900, fontSize: '28px', letterSpacing: '0.08em',
      boxShadow: '0 0 80px rgba(255,255,255,0.45), 0 0 200px rgba(255,255,255,0.15)',
      opacity: isFaded ? 0.12 : 1,
      filter: isFaded ? 'blur(3px)' : 'none',
      transition: 'opacity 0.6s ease, filter 0.6s ease',
      whiteSpace: 'nowrap', userSelect: 'none', cursor: 'default',
    }}>
      {data.label}
      <Handle type="source" position={Position.Top} style={{ top: '50%', left: '50%', opacity: 0, pointerEvents: 'none' }} />
      <Handle type="target" position={Position.Top} style={{ top: '50%', left: '50%', opacity: 0, pointerEvents: 'none' }} />
    </div>
  );
}

// ── 메인 노드 ──────────────────────────────────────────────────
function MainNode({ data, id }: { data: any; id: string }) {
  const { selectedId, exportMode, expandingId } = useContext(SelectCtx);
  const [hov, setHov] = useState(false);
  const color = GROUP_COLORS[data.groupIdx % GROUP_COLORS.length];
  const c = hexRgb(color);
  const d: number = data.depth ?? 0.8;

  const isSel = selectedId === id;
  const selGroup = selectedId ? getGroup(selectedId) : -1;
  const isSameGroup = !isSel && selGroup === data.groupIdx;
  const isFaded = !exportMode && selectedId !== null && !isSel && !isSameGroup;
  const isExpanding = expandingId === id;

  let scale = 0.86 + d * 0.14;
  if (isSel) scale = 1.15;
  else if (isFaded) scale = (0.86 + d * 0.14) * 0.5;
  if (hov && !isSel) scale *= 1.07;

  const op = exportMode ? 1 : isSel ? 1 : isFaded ? 0.07 : 0.93;
  const blurPx = exportMode ? 0 : isFaded ? 5 : 0;
  const floatClass = (data.floatClass as string) ?? '';

  return (
    <div className={floatClass} style={{ display: 'inline-block', position: 'relative' }}>
      {/* Running light border */}
      <div
        className={isExpanding ? 'node-border-spin-fast' : 'node-border-spin'}
        style={{
          position: 'absolute', inset: '-2px', borderRadius: '30px', pointerEvents: 'none',
          background: `conic-gradient(from var(--rota, 0deg), transparent 0%, rgba(${c},${isExpanding ? 1 : isSel ? 0.9 : 0.65}) 9%, transparent 24%)`,
          opacity: isFaded ? 0 : 1,
          transition: 'opacity 0.5s ease',
        }}
      />
      {/* Search pulse ring */}
      {isExpanding && (
        <div style={{
          position: 'absolute', inset: '-7px', borderRadius: '36px', pointerEvents: 'none',
          border: `1.5px solid rgba(${c},0.75)`,
          animation: 'search-pulse 1.0s ease-in-out infinite',
        }} />
      )}
      <div
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{
          position: 'relative',
          transform: `scale(${scale})`, transformOrigin: 'center',
          background: isSel || hov ? `rgba(${c},0.2)` : 'rgba(5,5,14,0.92)',
          border: `1px solid rgba(${c},${isSel ? 0 : hov ? 0.65 : 0.40 + d * 0.20})`,
          color: isSel || hov ? `rgb(${c})` : `rgba(${c},0.95)`,
          borderRadius: '28px', padding: '15px 34px',
          fontSize: '20px', fontWeight: 700, backdropFilter: 'blur(16px)',
          boxShadow: isSel
            ? `0 0 60px rgba(${c},0.85), 0 0 140px rgba(${c},0.3)`
            : isExpanding ? `0 0 40px rgba(${c},0.6)`
            : hov ? `0 0 32px rgba(${c},0.4)` : 'none',
          filter: `blur(${blurPx}px)`, opacity: op,
          transition: 'transform 0.6s cubic-bezier(0.16,1,0.3,1), opacity 0.5s ease, filter 0.5s ease, background 0.3s ease, box-shadow 0.35s ease, color 0.3s ease',
          cursor: 'pointer', userSelect: 'none',
          whiteSpace: isSel ? 'normal' : 'nowrap',
          maxWidth: isSel ? 280 : undefined,
        }}
      >
        <div style={{ fontSize: '13px', opacity: 0.5, marginBottom: '6px', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
          {data.category}
        </div>
        <div>{data.label}</div>
        {isSel && data.summary && (
          <div style={{
            marginTop: 11, paddingTop: 11,
            borderTop: `1px solid rgba(${c},0.2)`,
            fontSize: '15px', fontWeight: 400, lineHeight: 1.65,
            color: `rgba(${c},0.75)`, whiteSpace: 'normal',
          }}>
            {data.summary as string}
          </div>
        )}
        {isExpanding && (
          <div style={{ marginTop: 7, fontSize: '12px', letterSpacing: '0.22em', opacity: 0.55 }}>탐색 중...</div>
        )}
        {data.expanded && !isSel && !isExpanding && (
          <span style={{ marginLeft: 7, fontSize: 12, opacity: 0.4 }}>✦</span>
        )}
        <Handle type="source" position={Position.Top} style={{ top: '50%', left: '50%', opacity: 0, pointerEvents: 'none' }} />
        <Handle type="target" position={Position.Top} style={{ top: '50%', left: '50%', opacity: 0, pointerEvents: 'none' }} />
      </div>
    </div>
  );
}

// ── 서브 노드 ──────────────────────────────────────────────────
function SubNode({ data, id }: { data: any; id: string }) {
  const { selectedId, exportMode, expandingId } = useContext(SelectCtx);
  const [hov, setHov] = useState(false);
  const color = GROUP_COLORS[data.groupIdx % GROUP_COLORS.length];
  const c = hexRgb(color);
  const d: number = data.depth ?? 0.5;

  const isSel = selectedId === id;
  const selGroup = selectedId ? getGroup(selectedId) : -1;
  const isSameGroup = !isSel && selGroup === data.groupIdx;
  const isParentSel = selectedId === `m${data.groupIdx}`;
  const isFaded = !exportMode && selectedId !== null && !isSel && !isSameGroup;
  const isExpanding = expandingId === id;

  let scale = 0.78 + d * 0.22;
  if (isSel) scale = 1.1;
  else if (isParentSel) scale = 0.96;
  else if (isFaded) scale = (0.78 + d * 0.22) * 0.5;
  if (hov && !isSel) scale *= 1.08;

  const op = exportMode ? 1 : isSel ? 1 : isFaded ? 0.06 : isSameGroup ? 1 : 0.82;
  const blurPx = exportMode ? 0 : isFaded ? 5 : 0;
  const floatClass = (data.floatClass as string) ?? '';

  return (
    <div className={floatClass} style={{ display: 'inline-block', position: 'relative' }}>
      {isExpanding && (
        <>
          <div className="node-border-spin-fast" style={{
            position: 'absolute', inset: '-2px', borderRadius: '18px', pointerEvents: 'none',
            background: `conic-gradient(from var(--rota, 0deg), transparent 0%, rgba(${c},0.9) 11%, transparent 26%)`,
          }} />
          <div style={{
            position: 'absolute', inset: '-6px', borderRadius: '22px', pointerEvents: 'none',
            border: `1.5px solid rgba(${c},0.75)`,
            animation: 'search-pulse 1.0s ease-in-out infinite',
          }} />
        </>
      )}
      <div
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{
          position: 'relative',
          transform: `scale(${scale})`, transformOrigin: 'center',
          background: isSel || hov ? `rgba(${c},0.18)` : isParentSel ? `rgba(${c},0.10)` : 'rgba(5,5,14,0.70)',
          border: `1px solid rgba(${c},${isSel ? 0.85 : hov ? 0.55 : isParentSel ? 0.48 : 0.22 + d * 0.18})`,
          color: isSel || hov ? `rgba(${c},0.95)` : isParentSel ? `rgba(${c},0.88)` : `rgba(255,255,255,${0.65 + d * 0.25})`,
          borderRadius: '16px', padding: '10px 20px', fontSize: '17px',
          backdropFilter: 'blur(8px)',
          boxShadow: isSel ? `0 0 28px rgba(${c},0.6), 0 0 70px rgba(${c},0.2)`
            : isParentSel ? `0 0 18px rgba(${c},0.28)`
            : hov ? `0 0 16px rgba(${c},0.35)` : 'none',
          filter: `blur(${blurPx}px)`, opacity: op,
          transition: 'transform 0.6s cubic-bezier(0.16,1,0.3,1), opacity 0.5s ease, filter 0.5s ease, background 0.3s ease, box-shadow 0.35s ease, color 0.3s ease',
          cursor: 'pointer', userSelect: 'none',
          whiteSpace: isSel ? 'normal' : 'nowrap',
          maxWidth: isSel ? 240 : undefined,
        }}
      >
        <div>{data.label}</div>
        {isSel && data.summary && (
          <div style={{
            marginTop: 9, paddingTop: 9,
            borderTop: `1px solid rgba(${c},0.2)`,
            fontSize: '13px', fontWeight: 400, lineHeight: 1.6,
            color: `rgba(${c},0.72)`, whiteSpace: 'normal',
          }}>
            {data.summary as string}
          </div>
        )}
        {isExpanding && (
          <div style={{ marginTop: 5, fontSize: '12px', letterSpacing: '0.22em', opacity: 0.55 }}>탐색 중...</div>
        )}
        <Handle type="source" position={Position.Top} style={{ top: '50%', left: '50%', opacity: 0, pointerEvents: 'none' }} />
        <Handle type="target" position={Position.Top} style={{ top: '50%', left: '50%', opacity: 0, pointerEvents: 'none' }} />
      </div>
    </div>
  );
}

const nodeTypes: NodeTypes = {
  root: RootNode as any, main: MainNode as any,
  sub: SubNode as any, oura: OuraNode as any,
};
const edgeTypes = {
  particle: ParticleEdge as any,
};

// ── 겹침 방지 (force spread) ───────────────────────────────────
function spreadNodes(newNodes: Node[], existingNodes: Node[], minDist = 220): Node[] {
  const pos = newNodes.map(n => ({ id: n.id, x: n.position.x, y: n.position.y }));
  const fixed = existingNodes.map(n => ({ x: n.position.x, y: n.position.y }));
  for (let iter = 0; iter < 140; iter++) {
    let totalMove = 0;
    for (let i = 0; i < pos.length; i++) {
      const n = pos[i];
      const others = [...fixed, ...pos.filter((_, j) => j !== i)];
      for (const m of others) {
        const dx = n.x - m.x; const dy = n.y - m.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
        if (dist < minDist) {
          const push = ((minDist - dist) / dist) * 0.42;
          n.x += dx * push; n.y += dy * push;
          totalMove += push;
        }
      }
    }
    if (totalMove < 0.4) break;
  }
  return newNodes.map((n, i) => ({ ...n, position: { x: pos[i].x, y: pos[i].y } }));
}

// ── 레이아웃 빌더 ─────────────────────────────────────────────
const MAIN_DEPTHS = [1.0, 0.55, 0.82, 0.65, 0.42];

function buildGraph(rootLabel: string, data: ResearchMainNode[]) {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  nodes.push({ id: 'root', type: 'root', data: { label: rootLabel }, position: { x: 0, y: 0 }, zIndex: 200 });

  data.forEach((main, i) => {
    const angle = (i / data.length) * Math.PI * 2 - Math.PI / 2;
    const depth = MAIN_DEPTHS[i % MAIN_DEPTHS.length];
    const mainRadius = 490 + depth * 90 + Math.sin(i * 2.3) * 55;
    const mx = Math.cos(angle) * mainRadius;
    const my = Math.sin(angle) * mainRadius;
    const mainId = `m${i}`;
    const color = GROUP_COLORS[i % GROUP_COLORS.length];
    const c = hexRgb(color);

    nodes.push({
      id: mainId, type: 'main',
      data: { label: main.label, category: main.category, summary: main.summary, depth, groupIdx: i, floatClass: MAIN_FLOATS[i % MAIN_FLOATS.length] },
      position: { x: mx, y: my }, zIndex: Math.round(depth * 100),
    });

    edges.push({
      id: `er${i}`, source: 'root', target: mainId, type: 'particle',
      style: { stroke: color, strokeWidth: 1.4 + depth * 1.6, opacity: 0.24 + depth * 0.14 },
    });

    main.children?.forEach((sub, j) => {
      const count = main.children.length;
      const fanAngle = angle + (j - (count - 1) / 2) * 0.60;
      const subRadius = 290 + (j % 2) * 65 + depth * 38;
      const subDepth = depth * (0.40 + (j % 3) * 0.17);
      const sx = mx + Math.cos(fanAngle) * subRadius + Math.cos(angle) * 50;
      const sy = my + Math.sin(fanAngle) * subRadius + Math.sin(angle) * 50;
      const subId = `s${i}-${j}`;

      nodes.push({
        id: subId, type: 'sub',
        data: { label: sub.label, summary: sub.summary, depth: subDepth, groupIdx: i, floatClass: SUB_FLOATS[(i * 5 + j) % SUB_FLOATS.length] },
        position: { x: sx, y: sy }, zIndex: Math.round(subDepth * 60),
      });

      edges.push({
        id: `e${i}-${j}`, source: mainId, target: subId, type: 'particle',
        style: { stroke: color, strokeWidth: 0.8 + subDepth * 0.5, opacity: 0.17 + subDepth * 0.11 },
      });
    });
  });

  return { nodes, edges };
}

// ── Mindmap Handle (ref로 외부에서 접근) ──────────────────────
export interface MindmapHandle {
  getState: () => { nodes: Node[]; edges: Edge[] };
}

// ── MindmapContent ─────────────────────────────────────────────
const MindmapContent = forwardRef<MindmapHandle, {
  rootLabel: string;
  childrenData: ResearchMainNode[];
  exportMode: boolean;
  savedNodes?: Node[];
  savedEdges?: Edge[];
  userRole: string;
  onSelectNode: (node: (ResearchSubNode | ResearchMainNode) | null) => void;
}>(function MindmapContent({ rootLabel, childrenData, exportMode, savedNodes, savedEdges, userRole, onSelectNode }, ref) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandingId, setExpandingId] = useState<string | null>(null);
  const [cmdValue, setCmdValue] = useState('');
  const { fitView, setCenter } = useReactFlow();

  const originalEdgesRef = useRef<Edge[]>([]);
  const expandedRef = useRef<Set<string>>(new Set());
  const expandingRef = useRef<Set<string>>(new Set());
  const selectedIdRef = useRef<string | null>(null);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastClickRef = useRef<string | null>(null);
  const nodesRef = useRef<Node[]>([]);

  // 노드 ref 동기화 (저장용)
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

  // 외부에서 getState() 호출 가능하도록
  useImperativeHandle(ref, () => ({
    getState: () => ({
      nodes: nodesRef.current.filter(n => n.type !== 'oura'),
      edges: originalEdgesRef.current,
    }),
  }));

  // ── 초기 그래프 ─────────────────────────────────────────────
  useEffect(() => {
    expandedRef.current.clear();
    expandingRef.current.clear();

    if (savedNodes && savedNodes.length > 0) {
      const es = savedEdges ?? [];
      setNodes(savedNodes);
      setEdges(es);
      originalEdgesRef.current = es;
      savedNodes.forEach(n => { if (n.data?.expanded) expandedRef.current.add(n.id); });
    } else {
      const { nodes: n, edges: e } = buildGraph(rootLabel, childrenData);
      originalEdgesRef.current = e;
      setNodes(n);
      setEdges(e);
    }
    setTimeout(() => fitView({ duration: 2200, padding: 0.14 }), 350);
  }, [rootLabel]);

  // ── 엣지 및 그룹 오라 효과 ──────────────────────────────────────
  useEffect(() => {
    const selGroup = selectedId ? getGroup(selectedId) : -1;
    setEdges(originalEdgesRef.current.map(e => {
      if (!selectedId || exportMode) return e;
      const sg = getGroup(e.source); const tg = getGroup(e.target);
      const inGroup = sg === selGroup || tg === selGroup;
      const direct = e.source === selectedId || e.target === selectedId;
      return {
        ...e,
        style: {
          ...e.style,
          opacity: inGroup ? (direct ? 1 : 0.72) : 0.06,
          strokeWidth: direct ? ((e.style?.strokeWidth as number ?? 0.8) * 1.5) : e.style?.strokeWidth,
        },
      };
    }));
  }, [selectedId, exportMode, setEdges]);

  useEffect(() => {
    setNodes(prev => {
      const base = prev.filter(n => n.type !== 'oura');
      if (!selectedId) return base;
      const group = getGroup(selectedId);
      if (group === -1) return base;
      const gNodes = base.filter(n => getGroup(n.id) === group);
      if (!gNodes.length) return base;
      const cx = gNodes.reduce((s, n) => s + n.position.x, 0) / gNodes.length;
      const cy = gNodes.reduce((s, n) => s + n.position.y, 0) / gNodes.length;
      return [...base, {
        id: `oura-${group}`, type: 'oura',
        data: { groupIdx: group },
        position: { x: cx, y: cy },
        zIndex: -20,
      }];
    });
  }, [selectedId, setNodes]);

  // ── 아이디어 브릿징 (Idea Bridging) ──────────────────────────
  const onConnect: OnConnect = useCallback(async (params) => {
    const sourceNode = nodesRef.current.find(n => n.id === params.source);
    const targetNode = nodesRef.current.find(n => n.id === params.target);
    if (!sourceNode || !targetNode) return;

    const newEdge = { 
      ...params, 
      id: `bridge-${params.source}-${params.target}-${Date.now()}`, 
      type: 'particle', 
      style: { stroke: '#ffffff', strokeWidth: 2, opacity: 0.6 } 
    } as Edge;
    setEdges(prev => { const upd = addEdge(newEdge, prev); originalEdgesRef.current = upd; return upd; });
    
    setExpandingId(params.source);
    try {
      const results = await bridgeIdeas(sourceNode.data.label, targetNode.data.label, userRole);
      const midX = (sourceNode.position.x + targetNode.position.x) / 2;
      const midY = (sourceNode.position.y + targetNode.position.y) / 2;
      
      const newNodes: Node[] = results.map((b, i) => ({
        id: `bridge-n-${params.source}-${params.target}-${i}`, type: 'sub',
        data: { ...b, depth: 0.6, groupIdx: sourceNode.data.groupIdx, floatClass: 'node-float-sa' },
        position: { x: midX + (i - 1) * 200, y: midY + 200 },
      }));

      setNodes(prev => [...prev, ...spreadNodes(newNodes, prev)]);
      const bEdges: Edge[] = newNodes.map(bn => ({ 
        id: `be-${bn.id}`, 
        source: params.source!, 
        target: bn.id, 
        type: 'particle', 
        style: { stroke: '#4dd0e1', opacity: 0.3 } 
      } as Edge));
      setEdges(prev => { const upd = [...prev, ...bEdges]; originalEdgesRef.current = upd; return upd; });
    } finally { setExpandingId(null); }
  }, [userRole, setNodes, setEdges]);

  // ── 리서치 확장 ──────────────────────────────────────────────
  const handleExpand = useCallback(async (node: Node, customPrompt?: string) => {
    if (node.type === 'oura' || node.type === 'root') return;
    if (expandingRef.current.has(node.id)) return;

    expandingRef.current.add(node.id);
    setExpandingId(node.id);

    try {
      const subs = customPrompt 
        ? await steeredExpandNode(node.data.label as string, customPrompt, userRole)
        : await expandNode(node.data.label as string, userRole);
      
      expandedRef.current.add(node.id);
      const groupIdx = (node.data.groupIdx as number) ?? 0;
      const parentDepth = (node.data.depth as number) ?? 0.5;
      const color = GROUP_COLORS[groupIdx % GROUP_COLORS.length];

      const rawNew: Node[] = subs.map((sub, i) => ({
        id: `exp-${node.id}-${Date.now()}-${i}`, type: 'sub',
        data: { ...sub, depth: parentDepth * 0.6, groupIdx, floatClass: SUB_FLOATS[(groupIdx * 5 + i) % SUB_FLOATS.length] },
        position: { x: node.position.x + Math.cos(i) * 300, y: node.position.y + Math.sin(i) * 300 },
        zIndex: 60,
      }));

      setNodes(prev => {
        const spread = spreadNodes(rawNew, prev, 220);
        return [...prev.map(n => n.id === node.id ? { ...n, data: { ...n.data, expanded: true } } : n), ...spread];
      });

      const newEdges: Edge[] = rawNew.map(n => ({
        id: `e-${node.id}-${n.id}`, source: node.id, target: n.id, type: 'particle', style: { stroke: color, strokeWidth: 0.8, opacity: 0.28 },
      }));

      setEdges(prev => { const updated = [...prev, ...newEdges]; originalEdgesRef.current = updated; return updated; });
      setTimeout(() => fitView({ duration: 900, padding: 0.20 }), 120);
    } catch {
      expandingRef.current.delete(node.id);
    }
    setExpandingId(null);
  }, [userRole, setNodes, setEdges, fitView]);

  // ── 클릭 핸들러 ──────────────────────────────────────────────
  const selectedNode = nodes.find(n => n.id === selectedId);

  return (
    <SelectCtx.Provider value={{ selectedId, exportMode, expandingId }}>
      <div className="h-full w-full relative">
        <ReactFlow
          nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
          onNodeClick={handleNodeClick} onPaneClick={() => { setSelectedId(null); onSelectNode(null); }}
          nodesDraggable={false} nodesConnectable={true} elementsSelectable={false}
          nodeOrigin={[0.5, 0.5]} colorMode="dark" minZoom={0.06} maxZoom={3}
        >
          <Background color="#16162a" gap={80} size={1} />
          <MiniMap
            style={{ background: 'rgba(3,3,12,0.75)', border: '1px solid rgba(255,255,255,0.06)' }}
            nodeColor={(n) => {
              if (n.type === 'root') return '#fff';
              if (n.type === 'oura') return 'transparent';
              return GROUP_COLORS[(n.data?.groupIdx as number ?? 0) % GROUP_COLORS.length];
            }}
            maskColor="rgba(0,0,10,0.55)"
          />
        </ReactFlow>

        {/* Command Input Overlay */}
        <AnimatePresence>
          {selectedId && !expandingId && selectedNode && selectedNode.type !== 'root' && (
            <motion.div
              initial={{ opacity: 0, y: 15, x: '-50%', scale: 0.95 }}
              animate={{ opacity: 1, y: 0, x: '-50%', scale: 1 }}
              exit={{ opacity: 0, y: 15, x: '-50%', scale: 0.95 }}
              className="absolute bottom-10 left-1/2 z-[200] w-[500px]"
            >
              <div className="bg-[#0f0f23]/80 backdrop-blur-xl border border-white/10 rounded-full p-2 flex items-center shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
                <input
                  autoFocus value={cmdValue}
                  onChange={(e) => setCmdValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && cmdValue.trim()) { handleExpand(selectedNode, cmdValue); setCmdValue(''); } }}
                  placeholder={`${selectedNode.data.label}에 대해 [${userRole}] 관점에서 무엇을 더 찾아볼까요?`}
                  className="flex-1 bg-transparent border-none outline-none text-white px-6 py-3 text-sm placeholder:text-white/20"
                />
                <button
                  onClick={() => { if (cmdValue.trim()) { handleExpand(selectedNode, cmdValue); setCmdValue(''); } }}
                  className="bg-white/10 hover:bg-white/20 text-white px-6 py-3 rounded-full text-xs font-bold tracking-widest transition-all uppercase"
                >
                  Expand
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="absolute bottom-6 left-6 text-white/10 text-[10px] tracking-[0.4em] pointer-events-none uppercase">
          드래그 연결: 아이디어 융합 · 더블클릭: 자동 확장 · 싱글클릭: 리서치 데이터
        </div>
      </div>
    </SelectCtx.Provider>
  );
});

const Mindmap = forwardRef<MindmapHandle, {
  rootLabel: string;
  childrenData: ResearchMainNode[];
  exportMode?: boolean;
  savedNodes?: Node[];
  savedEdges?: Edge[];
  userRole: string;
  onSelectNode: (node: (ResearchSubNode | ResearchMainNode) | null) => void;
}>(function Mindmap(props, ref) {
  return (
    <ReactFlowProvider>
      <MindmapContent
        {...props}
        ref={ref}
        exportMode={props.exportMode ?? false}
      />
    </ReactFlowProvider>
  );
});

export default Mindmap;
