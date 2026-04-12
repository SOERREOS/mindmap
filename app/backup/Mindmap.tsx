'use client';
import {
  createContext, forwardRef, useCallback, useContext,
  useEffect, useImperativeHandle, useRef, useState,
} from 'react';
import {
  Background, MiniMap, ReactFlow, ReactFlowProvider,
  getBezierPath, getStraightPath, useEdgesState, useNodesState, useReactFlow,
  type Edge, type EdgeProps, type Node, type NodeMouseHandler, type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { ResearchMainNode } from '@/lib/api';
import { expandNode } from '@/lib/api';

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

// ── 파티클 엣지 (parent-child, 단방향) ────────────────────────
function ParticleEdge({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style }: EdgeProps) {
  const [path] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const len = Math.sqrt((targetX - sourceX) ** 2 + (targetY - sourceY) ** 2);
  const dur = Math.max(0.8, len / 240);
  const op = (style?.opacity as number) ?? 1;
  const color = (style?.stroke as string) ?? 'rgba(255,255,255,0.3)';
  const width = (style?.strokeWidth as number) ?? 1;
  return (
    <g>
      <path d={path} stroke={color} strokeWidth={width * 5} fill="none" opacity={op * 0.09} />
      <path d={path} stroke={color} strokeWidth={width} fill="none" opacity={op} />
      {op > 0.04 && (
        <circle r="2.8" fill="rgba(255,255,255,0.85)">
          <animateMotion dur={`${dur}s`} repeatCount="indefinite" path={path} />
        </circle>
      )}
    </g>
  );
}

// ── 네트워크 엣지 (얇은 점선 웹 — 항상 보임) ─────────────────
function NetworkEdge({ sourceX, sourceY, targetX, targetY }: EdgeProps) {
  const [path] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  const len = Math.sqrt((targetX - sourceX) ** 2 + (targetY - sourceY) ** 2);
  const dur = Math.max(1.2, len / 200);
  return (
    <g>
      <path d={path} stroke="rgba(180,200,255,0.28)" strokeWidth={0.8}
        fill="none" strokeDasharray="4 10" />
      <circle r="2" fill="rgba(255,255,255,0.55)">
        <animateMotion dur={`${dur}s`} repeatCount="indefinite" path={path} />
      </circle>
    </g>
  );
}

// ── 신호 엣지 (굵은 컬러 빔 — 메인 노드 간 IoT 신호) ─────────
function SignalEdge({ sourceX, sourceY, targetX, targetY, style }: EdgeProps) {
  const [path] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  const len = Math.sqrt((targetX - sourceX) ** 2 + (targetY - sourceY) ** 2);
  const durA = Math.max(0.5, len / 260);
  const durB = Math.max(0.8, len / 210);
  const color = (style?.stroke as string) ?? '#4dd0e1';
  const width = (style?.strokeWidth as number) ?? 2;
  const op    = (style?.opacity  as number) ?? 0.55;
  if (op < 0.03) return null;
  return (
    <g>
      {/* 글로우 */}
      <path d={path} stroke={color} strokeWidth={width * 5} fill="none" opacity={op * 0.18} />
      {/* 코어 선 */}
      <path d={path} stroke={color} strokeWidth={width} fill="none" opacity={op} />
      {/* 전진 파티클 A */}
      <circle r="4" fill="white" opacity="0.92">
        <animateMotion dur={`${durA}s`} repeatCount="indefinite" path={path} />
      </circle>
      {/* 후진 파티클 B */}
      <circle r="3.2" fill="white" opacity="0.75">
        <animateMotion dur={`${durB}s`} repeatCount="indefinite" path={path}
          keyPoints="1;0" keyTimes="0;1" calcMode="linear" />
      </circle>
      {/* 컬러 파티클 C (오프셋) */}
      <circle r="2.5" fill={color} opacity="1">
        <animateMotion dur={`${durA * 1.6}s`} repeatCount="indefinite" path={path}
          begin={`-${(durA * 0.55).toFixed(2)}s`} />
      </circle>
    </g>
  );
}

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
  network: NetworkEdge as any,
  signal: SignalEdge as any,
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

  // ── IoT ①: 메인↔메인 굵은 컬러 신호 빔 (signal 타입) ───────
  for (let i = 0; i < data.length; i++) {
    for (let j = i + 1; j < data.length; j++) {
      const color = GROUP_COLORS[i % GROUP_COLORS.length];
      edges.push({
        id: `sig-m${i}-m${j}`, source: `m${i}`, target: `m${j}`, type: 'signal',
        style: { stroke: color, strokeWidth: 2.2, opacity: 0.58 },
      });
    }
  }

  // ── IoT ②: 서브↔서브 얇은 점선 웹 (network 타입) ──────────
  // 인접 그룹 링 연결 (모든 서브노드 포함)
  for (let i = 0; i < data.length; i++) {
    const subCount = data[i].children?.length ?? 0;
    for (let si = 0; si < subCount; si++) {
      const nextG  = (i + 1) % data.length;
      const nextN  = data[nextG]?.children?.length ?? 0;
      if (nextN > 0) {
        edges.push({
          id: `net-adj-${i}-${si}`,
          source: `s${i}-${si}`, target: `s${nextG}-${si % nextN}`,
          type: 'network',
        });
      }
      // 건너뛰기 그룹 (짝수 서브노드만)
      if (si % 2 === 0) {
        const skipG = (i + 2) % data.length;
        const skipN = data[skipG]?.children?.length ?? 0;
        if (skipN > 0) {
          edges.push({
            id: `net-skip-${i}-${si}`,
            source: `s${i}-${si}`, target: `s${skipG}-${(si + 1) % skipN}`,
            type: 'network',
          });
        }
      }
    }
  }

  // ── IoT ③: 메인↔서브 크로스 그룹 signal ─────────────────────
  for (let i = 0; i < data.length; i++) {
    const nextG = (i + 1) % data.length;
    const color = GROUP_COLORS[i % GROUP_COLORS.length];
    edges.push({
      id: `sig-ms-${i}`,
      source: `m${i}`, target: `s${nextG}-0`,
      type: 'signal',
      style: { stroke: color, strokeWidth: 1.3, opacity: 0.38 },
    });
  }

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
}>(function MindmapContent({ rootLabel, childrenData, exportMode, savedNodes, savedEdges }, ref) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandingId, setExpandingId] = useState<string | null>(null);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    expandedRef.current.clear();
    expandingRef.current.clear();

    if (savedNodes && savedNodes.length > 0) {
      // 저장된 상태 복원 (확장 노드 포함)
      const es = savedEdges ?? [];
      setNodes(savedNodes);
      setEdges(es);
      originalEdgesRef.current = es;
      // expandedRef 복원
      savedNodes.forEach(n => { if (n.data?.expanded) expandedRef.current.add(n.id); });
    } else {
      const { nodes: n, edges: e } = buildGraph(rootLabel, childrenData);
      originalEdgesRef.current = e;
      setNodes(n);
      setEdges(e);
    }
    setTimeout(() => fitView({ duration: 2200, padding: 0.14 }), 350);
  }, [rootLabel]); // rootLabel 변경 = 새 검색

  // ── 엣지 선택 반응 ──────────────────────────────────────────
  useEffect(() => {
    const selGroup = selectedId ? getGroup(selectedId) : -1;
    setEdges(originalEdgesRef.current.map(e => {
      if (!selectedId || exportMode) return e;
      const sg = getGroup(e.source); const tg = getGroup(e.target);
      const inGroup = sg === selGroup || tg === selGroup;
      const direct = e.source === selectedId || e.target === selectedId;
      const isIoT = e.type === 'signal' || e.type === 'network';
      return {
        ...e,
        style: {
          ...e.style,
          opacity: inGroup
            ? (direct ? 1 : isIoT ? 0.55 : 0.65)
            : (isIoT ? 0.08 : 0.02),  // IoT 선은 선택 시 희미하게 유지
          strokeWidth: direct && !isIoT
            ? ((e.style?.strokeWidth as number ?? 1) * 2.0)
            : e.style?.strokeWidth,
        },
      };
    }));
  }, [selectedId, exportMode, setEdges]);

  // ── 그룹 오라 (위치 버그 수정: nodeOrigin=[0.5,0.5] 기준) ──
  useEffect(() => {
    setNodes(prev => {
      const base = prev.filter(n => n.type !== 'oura');
      if (!selectedId) return base;
      const group = getGroup(selectedId);
      if (group === -1) return base;
      const gNodes = base.filter(n => getGroup(n.id) === group);
      if (!gNodes.length) return base;
      // nodeOrigin=[0.5,0.5]: position = 노드 중심 → 오라도 중심 기준으로
      const cx = gNodes.reduce((s, n) => s + n.position.x, 0) / gNodes.length;
      const cy = gNodes.reduce((s, n) => s + n.position.y, 0) / gNodes.length;
      return [...base, {
        id: `oura-${group}`, type: 'oura',
        data: { groupIdx: group },
        position: { x: cx, y: cy }, // 중심 좌표 직접 사용 (offset 없음)
        zIndex: -20,
      }];
    });
  }, [selectedId, setNodes]);

  // ── 키보드 단축키 ───────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'Escape') setSelectedId(null);
      if (e.key === 'f' || e.key === 'F') fitView({ duration: 850, padding: 0.14 });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fitView]);

  // ── 노드 확장 (더블클릭) ────────────────────────────────────
  const handleExpand = useCallback(async (node: Node) => {
    if (node.type === 'oura' || node.type === 'root') return;
    if (expandedRef.current.has(node.id)) return;
    if (expandingRef.current.has(node.id)) return;

    expandingRef.current.add(node.id);
    setExpandingId(node.id);

    try {
      const subs = await expandNode(node.data.label as string);
      expandedRef.current.add(node.id);
      const groupIdx = (node.data.groupIdx as number) ?? 0;
      const parentDepth = (node.data.depth as number) ?? 0.5;
      const color = GROUP_COLORS[groupIdx % GROUP_COLORS.length];

      const rawNew: Node[] = subs.map((sub, i) => {
        const angle = (i / subs.length) * Math.PI * 2 - Math.PI / 2;
        const depth = parentDepth * (0.42 + (i % 3) * 0.15);
        return {
          id: `exp-${node.id}-${i}`, type: 'sub',
          data: { label: sub.label, summary: sub.summary, depth, groupIdx, floatClass: SUB_FLOATS[(groupIdx * 5 + i) % SUB_FLOATS.length] },
          position: { x: node.position.x + Math.cos(angle) * 290, y: node.position.y + Math.sin(angle) * 290 },
          zIndex: Math.round(depth * 60),
        };
      });

      setNodes(prev => {
        const spread = spreadNodes(rawNew, prev, 220);
        return [
          ...prev.map(n => n.id === node.id ? { ...n, data: { ...n.data, expanded: true } } : n),
          ...spread,
        ];
      });

      const newEdges: Edge[] = subs.map((_, i) => ({
        id: `exp-e-${node.id}-${i}`,
        source: node.id, target: `exp-${node.id}-${i}`, type: 'particle',
        style: { stroke: color, strokeWidth: 0.8, opacity: 0.28 },
      }));

      setEdges(prev => {
        const updated = [...prev, ...newEdges];
        originalEdgesRef.current = updated;
        return updated;
      });

      // 확장 후 전체 보기로 축소
      setTimeout(() => fitView({ duration: 900, padding: 0.20 }), 120);
    } catch {
      expandingRef.current.delete(node.id);
    }
    setExpandingId(null);
  }, [setNodes, setEdges, fitView]);

  // ── 클릭 (싱글: 확대 + 선택 / 더블: 확장) ──────────────────
  const handleNodeClick: NodeMouseHandler = useCallback((_, node) => {
    if (node.type === 'oura') return;

    if (lastClickRef.current === node.id && clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
      lastClickRef.current = null;
      handleExpand(node);
      return;
    }

    lastClickRef.current = node.id;
    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = null;
      lastClickRef.current = null;
      if (selectedIdRef.current === node.id) {
        setSelectedId(null);
        // 해제 시 카메라 유지 (사용자가 있던 위치 그대로)
      } else {
        setSelectedId(node.id);
        // 클릭 시 해당 노드로 부드럽게 이동 + 적당한 확대
        setCenter(node.position.x, node.position.y, { duration: 650, zoom: 1.55 });
      }
    }, 260);
  }, [handleExpand, setCenter]);

  const handlePaneClick = useCallback(() => {
    setSelectedId(null);
  }, []);

  return (
    <SelectCtx.Provider value={{ selectedId, exportMode, expandingId }}>
      <div className="h-full w-full">
        <ReactFlow
          nodes={nodes} edges={edges}
          nodeTypes={nodeTypes} edgeTypes={edgeTypes}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick} onPaneClick={handlePaneClick}
          nodesDraggable={false} nodesConnectable={false} elementsSelectable={false}
          nodeOrigin={[0.5, 0.5]} colorMode="dark"
          minZoom={0.06} maxZoom={3}
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
        <div className="absolute bottom-6 left-6 text-white/14 text-[12px] tracking-[0.25em] pointer-events-none">
          ESC 해제 · F 전체보기 · 더블클릭 확장
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
}>(function Mindmap(props, ref) {
  return (
    <ReactFlowProvider>
      <MindmapContent
        ref={ref}
        rootLabel={props.rootLabel}
        childrenData={props.childrenData}
        exportMode={props.exportMode ?? false}
        savedNodes={props.savedNodes}
        savedEdges={props.savedEdges}
      />
    </ReactFlowProvider>
  );
});

export default Mindmap;
