'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { toPng } from 'html-to-image';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  Background,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
  BaseEdge,
  getBezierPath,
  type EdgeProps,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  pinchCorePoints,
  executeResearch,
  analyzeIdea,
  freeFormAction,
  type CorePinchResponse,
  type ResearchResult,
  type AnalysisResult,
  type FreeFormResult,
  type AnalysisMode,
} from '@/lib/api';

// ── Edge ────────────────────────────────────────────────────────
function ConnectionEdge({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd }: EdgeProps) {
  const [edgePath] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={{ strokeWidth: 1.5, stroke: 'rgba(255,255,255,0.06)' }} />
      <motion.path d={edgePath} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth={1.5}
        initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 1.0, ease: 'easeInOut' }} />
    </>
  );
}

// ── Node Types & Styles ──────────────────────────────────────────
type NodeVariant = 'root' | 'question' | 'suggestion' | 'result' | 'analysis' | 'perspective';

interface PinchNodeData {
  label: string;
  variant: NodeVariant;
  // for result nodes
  summary?: string;
  keyPoints?: string[];
  // for analysis nodes
  sections?: { label: string; emoji: string; points: string[] }[];
  analysisTitle?: string;
  // callbacks
  onPinch?: (parentId: string, question: string) => void;
  onExecuteResearch?: (nodeId: string, topic: string) => void;
  onEdit?: (nodeId: string, newLabel: string) => void;
  executing?: boolean;
}

const VARIANT_STYLES: Record<NodeVariant, { bg: string; border: string; text: string; tag?: string; tagColor?: string; glow?: string }> = {
  root:        { bg: '#ffffff', border: '2px solid #fff', text: '#000', glow: '0 0 50px rgba(255,255,255,0.2)' },
  question:    { bg: 'rgba(12,12,24,0.9)', border: '1px solid rgba(255,255,255,0.14)', text: 'rgba(255,255,255,0.92)', tag: '💡 핵심 질문', tagColor: 'rgba(255,255,255,0.3)' },
  suggestion:  { bg: 'rgba(8,30,60,0.9)', border: '1px solid rgba(14,165,233,0.5)', text: 'rgba(186,230,253,0.95)', tag: '🔍 조사 제안', tagColor: 'rgba(14,165,233,0.7)', glow: '0 0 18px rgba(14,165,233,0.15)' },
  result:      { bg: 'rgba(30,20,4,0.95)', border: '1px solid rgba(251,191,36,0.5)', text: 'rgba(254,243,199,0.95)', tag: '📊 조사 결과', tagColor: 'rgba(251,191,36,0.7)', glow: '0 0 18px rgba(251,191,36,0.12)' },
  analysis:    { bg: 'rgba(20,8,40,0.95)', border: '1px solid rgba(167,139,250,0.45)', text: 'rgba(233,213,255,0.95)', tag: '🧠 분석', tagColor: 'rgba(167,139,250,0.7)', glow: '0 0 18px rgba(167,139,250,0.12)' },
  perspective: { bg: 'rgba(4,22,14,0.95)', border: '1px solid rgba(52,211,153,0.45)', text: 'rgba(167,243,208,0.95)', tag: '💬 AI 견해', tagColor: 'rgba(52,211,153,0.7)', glow: '0 0 18px rgba(52,211,153,0.12)' },
};

// ── PinchNode ────────────────────────────────────────────────────
function PinchNode({ data, id }: NodeProps) {
  const d = (data as unknown) as PinchNodeData;
  const [inputVal, setInputVal] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState('');
  const editRef = useRef<HTMLTextAreaElement>(null);
  const st = VARIANT_STYLES[d.variant];
  const isRoot = d.variant === 'root';
  const isSuggestion = d.variant === 'suggestion';
  const isResult = d.variant === 'result';
  const isAnalysis = d.variant === 'analysis';
  const isQuestion = d.variant === 'question';
  const isPerspective = d.variant === 'perspective';
  const hasInput = (isQuestion || isResult) && !!d.onPinch;

  const handleSubmit = async () => {
    if (!inputVal.trim() || !d.onPinch) return;
    const query = inputVal.trim();
    setHistory(prev => [...prev, query]);
    setSubmitting(true);
    await d.onPinch(id, `${d.label}: ${query}`);
    setInputVal('');
    setSubmitting(false);
    setExpanded(false);
  };

  return (
    <motion.div
      initial={{ scale: 0.72, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 280, damping: 22 }}
      onClick={() => { if (hasInput && !editing) setExpanded(v => !v); }}
      onDoubleClick={e => {
        if (!d.onEdit) return;
        e.stopPropagation();
        setEditVal(d.label);
        setEditing(true);
        setTimeout(() => { editRef.current?.focus(); editRef.current?.select(); }, 30);
      }}
      style={{
        width: isRoot ? 300 : isAnalysis ? 400 : isResult ? 320 : isPerspective ? 340 : 260,
        borderRadius: isRoot ? '20px' : '14px',
        background: st.bg,
        border: expanded ? '1px solid rgba(255,255,255,0.32)' : st.border,
        backdropFilter: 'blur(20px)',
        boxShadow: isRoot ? st.glow : (st.glow ?? '0 4px 20px rgba(0,0,0,0.4)'),
        padding: '16px 18px',
        transition: 'box-shadow 0.3s ease, border 0.2s ease',
        cursor: hasInput ? 'pointer' : 'default',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />

      {/* Tag */}
      {st.tag && (
        <div style={{ fontSize: '9px', letterSpacing: '0.18em', color: st.tagColor, textTransform: 'uppercase', marginBottom: '8px', fontWeight: 600 }}>
          {st.tag}
        </div>
      )}
      {isRoot && (
        <div style={{ fontSize: '9px', letterSpacing: '0.18em', color: 'rgba(0,0,0,0.35)', textTransform: 'uppercase', marginBottom: '8px' }}>
          입력한 아이디어
        </div>
      )}

      {/* Analysis node: 2-column grid layout */}
      {isAnalysis && d.sections ? (
        <div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(233,213,255,0.95)', marginBottom: '12px', letterSpacing: '0.05em' }}>
            {d.analysisTitle}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {d.sections.map((sec, i) => (
              <div key={i} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '8px', padding: '10px 10px 8px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: st.tagColor, marginBottom: '7px' }}>
                  {sec.emoji} {sec.label}
                </div>
                {sec.points.map((pt, j) => (
                  <div key={j} style={{
                    fontSize: '11px',
                    color: 'rgba(233,213,255,0.85)',
                    lineHeight: 1.55,
                    paddingBottom: '5px',
                  }}>
                    · {pt}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : isAnalysis && d.summary ? (
        /* Analysis node without sections: show as rich result */
        <div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(233,213,255,0.95)', marginBottom: '10px', letterSpacing: '0.05em' }}>
            {d.label}
          </div>
          <div style={{ fontSize: '12px', color: 'rgba(233,213,255,0.75)', lineHeight: 1.6, marginBottom: '10px', paddingBottom: '10px', borderBottom: '1px solid rgba(167,139,250,0.15)' }}>
            {d.summary}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {(d.keyPoints ?? []).map((pt, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                <span style={{ color: 'rgba(167,139,250,0.7)', fontSize: '12px', flexShrink: 0, marginTop: '1px' }}>→</span>
                <span style={{ fontSize: '12px', color: 'rgba(233,213,255,0.85)', lineHeight: 1.5 }}>{pt}</span>
              </div>
            ))}
          </div>
        </div>
      ) : isResult && d.summary ? (
        /* Result node: summary headline + arrow keypoints */
        <div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(254,243,199,0.95)', marginBottom: '9px', lineHeight: 1.4 }}>
            {d.label}
          </div>
          <div style={{
            fontSize: '12px',
            color: 'rgba(254,243,199,0.72)',
            lineHeight: 1.6,
            marginBottom: '10px',
            paddingBottom: '10px',
            borderBottom: '1px solid rgba(251,191,36,0.15)',
          }}>
            {d.summary}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {(d.keyPoints ?? []).map((pt, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                <span style={{ color: 'rgba(251,191,36,0.7)', fontSize: '12px', flexShrink: 0, marginTop: '1px' }}>→</span>
                <span style={{ fontSize: '12px', color: 'rgba(254,243,199,0.9)', lineHeight: 1.5 }}>{pt}</span>
              </div>
            ))}
          </div>
        </div>
      ) : isPerspective ? (
        /* AI Perspective node */
        <div style={{ fontSize: '12px', color: 'rgba(167,243,208,0.9)', lineHeight: 1.7, wordBreak: 'keep-all' }}>
          {d.label}
        </div>
      ) : (
        /* Default: label text (double-click to edit if onEdit provided) */
        editing ? (
          <textarea
            ref={editRef}
            value={editVal}
            rows={2}
            onChange={e => setEditVal(e.target.value)}
            onClick={e => e.stopPropagation()}
            onKeyDown={e => {
              e.stopPropagation();
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (editVal.trim()) d.onEdit?.(id, editVal.trim());
                setEditing(false);
              }
              if (e.key === 'Escape') setEditing(false);
            }}
            onBlur={() => {
              if (editVal.trim()) d.onEdit?.(id, editVal.trim());
              setEditing(false);
            }}
            style={{
              width: '100%', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.25)',
              borderRadius: '6px', color: st.text, fontSize: isRoot ? '14px' : '12.5px',
              fontWeight: isRoot ? 700 : 500, lineHeight: 1.5, padding: '4px 6px',
              resize: 'none', outline: 'none', fontFamily: 'inherit',
            }}
          />
        ) : (
          <div
            style={{ fontSize: isRoot ? '14px' : '12.5px', fontWeight: isRoot ? 700 : 500, lineHeight: 1.6, color: st.text, wordBreak: 'keep-all', cursor: d.onEdit ? 'text' : 'inherit' }}
            title={d.onEdit ? '더블클릭하여 편집' : undefined}
          >
            {d.label}
          </div>
        )
      )}

      {/* Suggestion: execute button */}
      {isSuggestion && (
        <div style={{ marginTop: '12px' }}>
          {d.executing ? (
            <div style={{ fontSize: '10px', color: 'rgba(14,165,233,0.6)', fontStyle: 'italic', letterSpacing: '0.1em' }}>
              ⟳ 조사 중...
            </div>
          ) : (
            <button
              onClick={() => d.onExecuteResearch?.(id, d.label)}
              style={{
                padding: '5px 14px',
                background: 'rgba(14,165,233,0.15)',
                border: '1px solid rgba(14,165,233,0.4)',
                borderRadius: '999px',
                color: 'rgba(14,165,233,0.9)',
                fontSize: '10px',
                cursor: 'pointer',
                letterSpacing: '0.1em',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(14,165,233,0.28)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(14,165,233,0.15)'; }}
            >
              ▶ 조사 실행
            </button>
          )}
        </div>
      )}

      {/* Question / Result: click-to-expand input */}
      {hasInput && (
        <AnimatePresence>
          {expanded && (
            <motion.div key="exp" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
              <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: `1px solid ${isResult ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.08)'}` }}>
                {/* 이전 입력 기록 */}
                {history.length > 0 && (
                  <div style={{ marginBottom: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {history.slice(-2).map((h, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '5px' }}>
                        <span style={{ fontSize: '9px', color: isResult ? 'rgba(251,191,36,0.35)' : 'rgba(255,255,255,0.22)', marginTop: '1px', flexShrink: 0 }}>↳</span>
                        <span style={{ fontSize: '10px', color: isResult ? 'rgba(254,243,199,0.5)' : 'rgba(255,255,255,0.4)', lineHeight: 1.4 }}>{h}</span>
                      </div>
                    ))}
                  </div>
                )}
                {submitting ? (
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' }}>⟳ 분석 중...</div>
                ) : (
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end' }}>
                    <textarea
                      autoFocus
                      rows={1}
                      value={inputVal}
                      onChange={e => {
                        setInputVal(e.target.value);
                        e.target.style.height = 'auto';
                        e.target.style.height = e.target.scrollHeight + 'px';
                      }}
                      onKeyDown={e => {
                        e.stopPropagation();
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
                        if (e.key === 'Escape') setExpanded(false);
                      }}
                      onClick={e => e.stopPropagation()}
                      placeholder={isResult ? '이 결과를 바탕으로 파고들기, 아이디어 요청, 분석 등...' : '파고들기, 아이디어, 이미지 묘사 등 자유롭게...'}
                      style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: isResult ? 'rgba(254,243,199,0.75)' : 'rgba(255,255,255,0.75)', fontSize: '11px', resize: 'none', overflow: 'hidden', lineHeight: 1.5, minHeight: '18px' }}
                    />
                    {inputVal.trim() && (
                      <button
                        onClick={e => { e.stopPropagation(); handleSubmit(); }}
                        style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '4px', color: 'rgba(255,255,255,0.7)', fontSize: '10px', padding: '2px 7px', cursor: 'pointer', flexShrink: 0 }}
                      >→</button>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
      {/* hint for expandable nodes when not expanded */}
      {hasInput && !expanded && (
        <div style={{ marginTop: '8px', fontSize: '9px', color: isResult ? 'rgba(251,191,36,0.3)' : 'rgba(255,255,255,0.18)', letterSpacing: '0.1em' }}>
          {history.length > 0
            ? <span>↳ <span style={{ opacity: 0.7 }}>{history[history.length - 1]}</span></span>
            : (isResult ? '클릭하여 추가 탐색 ↓' : '클릭하여 파고들기 ↓')
          }
        </div>
      )}

      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </motion.div>
  );
}

const nodeTypes = { pinch: PinchNode };
const edgeTypes = { connection: ConnectionEdge };

// ── Main Component ───────────────────────────────────────────────
function CorePointPinchingContent({ initialIdea, onReset, initialData }: { initialIdea: string; onReset: () => void; initialData?: { nodes: Node[]; edges: Edge[] } }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const { fitView, getNodes } = useReactFlow();
  const [globalLoading, setGlobalLoading] = useState(false);
  const [initializing, setInitializing] = useState(!initialData);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<{ id: number; text: string; status: 'pending' | 'done' | 'error' }[]>([]);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [sessionHistory, setSessionHistory] = useState<{ idea: string; savedAt: number; storageKey: string }[]>([]);
  const [exporting, setExporting] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  const rootIdeaRef = useRef(initialIdea);
  const undoStack = useRef<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const redoStack = useRef<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const STORAGE_KEY = `pinching-session-${encodeURIComponent(initialIdea).slice(0, 40)}`;
  const HISTORY_KEY = 'pinching-history';

  // ── stateRef: always-current nodes/edges for undo snapshots ──
  const stateRef = useRef<{ nodes: Node[]; edges: Edge[] }>({ nodes: [], edges: [] });

  // ── helpers ──────────────────────────────────────────────────
  const addNodes = useCallback((newNodes: Node[], parentId: string) => {
    const newEdges: Edge[] = newNodes.map(n => ({
      id: `e-${parentId}-${n.id}`,
      source: parentId,
      target: n.id,
      type: 'connection',
    }));
    setNodes(prev => [...prev, ...newNodes]);
    setEdges(prev => [...prev, ...newEdges]);
    setTimeout(() => fitView({ duration: 900, padding: 0.18 }), 120);
  }, [setNodes, setEdges, fitView]);

  // ── pinch (generate questions + suggestions) ─────────────────
  const handlePinch = useCallback(async (parentId: string, idea: string) => {
    setGlobalLoading(true);
    try {
      const currentNodes = getNodes();
      const parent = currentNodes.find(n => n.id === parentId);
      if (!parent) return;
      const res: CorePinchResponse = await pinchCorePoints(idea);

      const n = res.questions.length;
      const ts = Date.now();
      const newNodes: Node[] = [
        ...res.questions.map((q, i) => ({
          id: `q-${ts}-${i}`,
          type: 'pinch' as const,
          position: { x: parent.position.x + (i - (n - 1) / 2) * 310, y: parent.position.y + 300 },
          data: { label: q.description, variant: 'question' as const, onPinch: handlePinch, onEdit: handleEdit },
        })),
        ...res.suggestions.map((s, i) => ({
          id: `s-${ts}-${i}`,
          type: 'pinch' as const,
          position: { x: parent.position.x + (i - (res.suggestions.length - 1) / 2) * 330, y: parent.position.y + 590 },
          data: {
            label: s.description,
            variant: 'suggestion' as const,
            onExecuteResearch: handleExecuteResearch,
            onEdit: handleEdit,
            executing: false,
          },
        })),
        ...(res.aiPerspective ? [{
          id: `perspective-${ts}`,
          type: 'pinch' as const,
          position: { x: parent.position.x + (n + 1) * 170, y: parent.position.y + 150 },
          data: {
            label: res.aiPerspective,
            variant: 'perspective' as const,
            onEdit: handleEdit,
          },
        }] : []),
      ];
      saveSnapshot();
      addNodes(newNodes, parentId);
    } catch (err) { console.error(err); }
    finally { setGlobalLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getNodes, addNodes]);

  // ── execute research on a suggestion node ────────────────────
  const handleExecuteResearch = useCallback(async (nodeId: string, topic: string) => {
    // Mark node as executing
    setNodes(prev => prev.map(n => n.id === nodeId
      ? { ...n, data: { ...n.data, executing: true } }
      : n
    ));

    try {
      const parent = getNodes().find(n => n.id === nodeId);
      if (!parent) return;
      const res: ResearchResult = await executeResearch(topic, rootIdeaRef.current);

      const resultNode: Node = {
        id: `result-${Date.now()}`,
        type: 'pinch',
        position: { x: parent.position.x, y: parent.position.y + 280 },
        data: {
          label: res.title,
          variant: 'result' as const,
          summary: res.summary,
          keyPoints: res.keyPoints,
          onPinch: handlePinch,
          onEdit: handleEdit,
        },
      };
      saveSnapshot();
      addNodes([resultNode], nodeId);
    } catch (err) { console.error(err); }
    finally {
      setNodes(prev => prev.map(n => n.id === nodeId
        ? { ...n, data: { ...n.data, executing: false } }
        : n
      ));
    }
  }, [getNodes, setNodes, addNodes]);

  // ── run structured analysis ──────────────────────────────────
  const handleAnalysis = useCallback(async (mode: AnalysisMode) => {
    setGlobalLoading(true);
    try {
      const res: AnalysisResult = await analyzeIdea(rootIdeaRef.current, mode);
      const xOffset = mode === 'swot' ? -400 : mode === 'feasibility' ? 0 : 400;

      const analysisNode: Node = {
        id: `analysis-${mode}-${Date.now()}`,
        type: 'pinch',
        position: { x: xOffset, y: 900 },
        data: {
          label: res.title,
          variant: 'analysis' as const,
          sections: res.sections,
          analysisTitle: res.title,
        },
      };
      saveSnapshot();
      addNodes([analysisNode], 'root');
    } catch (err) { console.error(err); }
    finally { setGlobalLoading(false); }
  }, [addNodes]);

  // ── free-form chat ────────────────────────────────────────────
  const handleChatSubmit = useCallback(async () => {
    const req = chatInput.trim();
    if (!req) return;
    const histId = Date.now();
    setChatHistory(prev => [...prev, { id: histId, text: req, status: 'pending' }]);
    setChatInput('');
    setChatLoading(true);
    // Scroll history to bottom
    setTimeout(() => { if (historyRef.current) historyRef.current.scrollTop = historyRef.current.scrollHeight; }, 50);
    try {
      const res: FreeFormResult = await freeFormAction(req, rootIdeaRef.current);
      const currentNodes = getNodes();
      // Place below the lowest node, with extra buffer so it clears the chat panel (~220px)
      const maxY = currentNodes.length > 0 ? Math.max(...currentNodes.map(n => n.position.y)) : 0;

      const resultNode: Node = {
        id: `freeform-${histId}`,
        type: 'pinch',
        position: { x: 0, y: maxY + 380 },
        data: {
          label: res.title,
          variant: res.type === 'analysis' ? 'analysis' as const : 'result' as const,
          summary: res.content,
          keyPoints: res.keyPoints,
          onPinch: handlePinch,
          onEdit: handleEdit,
        },
      };
      saveSnapshot();
      addNodes([resultNode], 'root');
      setChatHistory(prev => prev.map(h => h.id === histId ? { ...h, status: 'done' } : h));
    } catch (err) {
      console.error(err);
      setChatHistory(prev => prev.map(h => h.id === histId ? { ...h, status: 'error' } : h));
    } finally { setChatLoading(false); }
  }, [chatInput, getNodes, addNodes]);

  // ── node label editing ───────────────────────────────────────
  const handleEdit = useCallback((nodeId: string, newLabel: string) => {
    setNodes(prev => prev.map(n => n.id === nodeId
      ? { ...n, data: { ...n.data, label: newLabel } }
      : n
    ));
  }, [setNodes]);

  // ── snapshot / undo / redo ───────────────────────────────────
  const saveSnapshot = useCallback(() => {
    undoStack.current = [...undoStack.current.slice(-19), { ...stateRef.current }];
    redoStack.current = [];
  }, []);

  const doRehydrate = useCallback((ns: Node[]) => ns.map(n => {
    const v = (n.data as unknown as PinchNodeData).variant;
    return {
      ...n,
      data: {
        ...n.data,
        onPinch: (v === 'question' || v === 'result') ? handlePinch : undefined,
        onExecuteResearch: v === 'suggestion' ? handleExecuteResearch : undefined,
        onEdit: handleEdit,
      },
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [handleEdit]);

  const undo = useCallback(() => {
    const snap = undoStack.current.pop();
    if (!snap) return;
    redoStack.current = [...redoStack.current, { ...stateRef.current }];
    setNodes(doRehydrate(snap.nodes));
    setEdges(snap.edges);
    setTimeout(() => fitView({ duration: 400, padding: 0.18 }), 50);
  }, [doRehydrate, setNodes, setEdges, fitView]);

  const redo = useCallback(() => {
    const snap = redoStack.current.pop();
    if (!snap) return;
    undoStack.current = [...undoStack.current, { ...stateRef.current }];
    setNodes(doRehydrate(snap.nodes));
    setEdges(snap.edges);
    setTimeout(() => fitView({ duration: 400, padding: 0.18 }), 50);
  }, [doRehydrate, setNodes, setEdges, fitView]);

  // ── PNG export ───────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    const el = document.querySelector('.react-flow') as HTMLElement;
    if (!el) return;
    setExporting(true);
    await new Promise(r => setTimeout(r, 300));
    try {
      const url = await toPng(el, { backgroundColor: '#07070f', pixelRatio: 2 });
      setExporting(false);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pinching-${rootIdeaRef.current.slice(0, 20)}.png`;
      a.click();
    } catch { setExporting(false); }
  }, []);

  // ── session history (localStorage) ───────────────────────────
  const loadSessionHistory = useCallback(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      const list = raw ? JSON.parse(raw) : [];
      setSessionHistory(list);
    } catch { setSessionHistory([]); }
  }, [HISTORY_KEY]);

  const registerSession = useCallback(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      const list: { idea: string; savedAt: number; storageKey: string }[] = raw ? JSON.parse(raw) : [];
      const filtered = list.filter(s => s.storageKey !== STORAGE_KEY);
      const updated = [{ idea: rootIdeaRef.current, savedAt: Date.now(), storageKey: STORAGE_KEY }, ...filtered].slice(0, 30);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
    } catch { /* ignore */ }
  }, [STORAGE_KEY, HISTORY_KEY]);

  // ── init ─────────────────────────────────────────────────────
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    if (initialData) {
      setNodes(doRehydrate(initialData.nodes));
      setEdges(initialData.edges);
      setTimeout(() => fitView({ duration: 800, padding: 0.18 }), 100);
      registerSession();
      return;
    }

    const rootNode: Node = {
      id: 'root',
      type: 'pinch',
      position: { x: 0, y: 0 },
      data: { label: initialIdea, variant: 'root' as const, onPinch: handlePinch, onEdit: handleEdit },
    };
    setNodes([rootNode]);
    setInitializing(true);
    handlePinch('root', initialIdea).finally(() => setInitializing(false));
    registerSession();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── stateRef sync ────────────────────────────────────────────
  useEffect(() => { stateRef.current = { nodes, edges }; }, [nodes, edges]);

  // ── keyboard shortcuts ────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  // ── load session history on mount ────────────────────────────
  useEffect(() => { loadSessionHistory(); }, [loadSessionHistory]);

  // ── render ────────────────────────────────────────────────────
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <ReactFlow
        nodes={nodes} edges={edges}
        nodeTypes={nodeTypes} edgeTypes={edgeTypes}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        fitView colorMode="dark" nodesDraggable nodesConnectable={false}
        minZoom={0.2} maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#080814" gap={40} size={1} />
      </ReactFlow>

      {/* ── TOP BAR ─────────────────────────────────────────── */}
      <div style={{
        position: 'absolute', top: 16, left: 16, right: 16, zIndex: 50,
        display: 'flex', alignItems: 'center', gap: '8px',
        overflowX: 'auto', scrollbarWidth: 'none',
      }}>
        {/* Back */}
        <button onClick={onReset} style={{ ...btnStyle('back'), flexShrink: 0 }}>
          ← 나가기
        </button>

        {/* Save */}
        <button
          onClick={async () => {
            const strip = (ns: Node[]) => ns.map(n => ({
              ...n,
              data: {
                label: (n.data as unknown as PinchNodeData).label,
                variant: (n.data as unknown as PinchNodeData).variant,
                summary: (n.data as unknown as PinchNodeData).summary,
                keyPoints: (n.data as unknown as PinchNodeData).keyPoints,
                sections: (n.data as unknown as PinchNodeData).sections,
                analysisTitle: (n.data as unknown as PinchNodeData).analysisTitle,
              },
            }));
            const strippedNodes = strip(getNodes());
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ nodes: strippedNodes, edges }));
            registerSession();
            const json = JSON.stringify({ nodes: strippedNodes, edges, idea: rootIdeaRef.current, savedAt: Date.now() }, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            if ('showSaveFilePicker' in window) {
              try {
                const handle = await (window as any).showSaveFilePicker({
                  suggestedName: `pinching-${rootIdeaRef.current.slice(0, 20)}.json`,
                  types: [{ description: 'Pinching JSON', accept: { 'application/json': ['.json'] } }],
                });
                const writable = await handle.createWritable();
                await writable.write(blob); await writable.close();
                setSaveMsg('✓ 저장됨'); setTimeout(() => setSaveMsg(null), 2200); return;
              } catch (e: any) { if (e.name === 'AbortError') { setSaveMsg('✓ 저장됨'); setTimeout(() => setSaveMsg(null), 2200); return; } }
            }
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `pinching-${rootIdeaRef.current.slice(0, 20)}.json`; a.click();
            URL.revokeObjectURL(url);
            setSaveMsg('✓ 저장됨'); setTimeout(() => setSaveMsg(null), 2200);
          }}
          style={{ ...btnStyle('save'), flexShrink: 0 }}
        >
          {saveMsg ?? '💾 저장'}
        </button>

        {/* Load from file */}
        <button
          onClick={async () => {
            if ('showOpenFilePicker' in window) {
              try {
                const [handle] = await (window as any).showOpenFilePicker({
                  types: [{ description: 'Pinching JSON', accept: { 'application/json': ['.json'] } }],
                });
                const file = await handle.getFile();
                const parsed = JSON.parse(await file.text());
                if (parsed.root !== undefined && parsed.idea === undefined) {
                  alert('이 파일은 Spatial Research 형식입니다.'); return;
                }
                setNodes(doRehydrate(parsed.nodes));
                setEdges(parsed.edges ?? []);
                setTimeout(() => fitView({ duration: 800, padding: 0.18 }), 100);
                setSaveMsg('✓ 불러옴'); setTimeout(() => setSaveMsg(null), 2000); return;
              } catch (e: any) { if (e.name === 'AbortError') return; }
            }
            const input = document.createElement('input');
            input.type = 'file'; input.accept = '.json';
            input.onchange = async () => {
              const file = input.files?.[0]; if (!file) return;
              try {
                const parsed = JSON.parse(await file.text());
                if (parsed.root !== undefined && parsed.idea === undefined) { alert('이 파일은 Spatial Research 형식입니다.'); return; }
                setNodes(doRehydrate(parsed.nodes));
                setEdges(parsed.edges ?? []);
                setTimeout(() => fitView({ duration: 800, padding: 0.18 }), 100);
                setSaveMsg('✓ 불러옴'); setTimeout(() => setSaveMsg(null), 2000);
              } catch { setSaveMsg('불러오기 오류'); setTimeout(() => setSaveMsg(null), 2000); }
            };
            input.click();
          }}
          style={{ ...btnStyle('save'), flexShrink: 0 }}
        >
          📂 열기
        </button>

        {/* History */}
        <button
          onClick={() => { loadSessionHistory(); setShowHistory(v => !v); }}
          style={{ ...btnStyle('save'), flexShrink: 0 }}
        >
          🕐 히스토리
        </button>

        {/* Export PNG */}
        <button
          onClick={handleExport}
          disabled={exporting}
          style={{ ...btnStyle('save'), flexShrink: 0, opacity: exporting ? 0.5 : 1 }}
        >
          {exporting ? '내보내는 중...' : '🖼️ 내보내기'}
        </button>

        {/* Undo / Redo */}
        <button onClick={undo} title="실행취소 (Ctrl+Z)" style={{ ...btnStyle('save'), flexShrink: 0, fontSize: '14px' }}>↩</button>
        <button onClick={redo} title="다시실행 (Ctrl+Y)" style={{ ...btnStyle('save'), flexShrink: 0, fontSize: '14px' }}>↪</button>

        <div style={{ flex: 1, minWidth: 8 }} />

        {/* Analysis buttons */}
        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
          {([
            { mode: 'swot' as AnalysisMode,        label: '⚖️ SWOT' },
            { mode: 'feasibility' as AnalysisMode, label: '🛠️ 실행가능' },
            { mode: 'competition' as AnalysisMode, label: '🏁 경쟁' },
          ] as const).map(({ mode, label }) => (
            <button
              key={mode}
              onClick={() => { saveSnapshot(); handleAnalysis(mode); }}
              disabled={globalLoading || initializing || nodes.length <= 1}
              style={{ ...btnStyle('analysis'), flexShrink: 0, opacity: (globalLoading || initializing || nodes.length <= 1) ? 0.35 : 1 }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── HISTORY PANEL ───────────────────────────────────────── */}
      {showHistory && (
        <div style={{
          position: 'absolute', top: 64, left: 16, zIndex: 60,
          background: 'rgba(5,5,18,0.92)', backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.1)', borderRadius: '14px',
          padding: '12px', minWidth: '260px', maxWidth: '340px',
          maxHeight: '60vh', overflowY: 'auto',
        }}>
          <div style={{ fontSize: '10px', letterSpacing: '0.2em', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: '10px' }}>
            최근 세션
          </div>
          {sessionHistory.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.25)', padding: '8px 0' }}>저장된 세션 없음</div>
          ) : sessionHistory.map(s => {
            const stored = localStorage.getItem(s.storageKey);
            const canLoad = !!stored;
            return (
              <div
                key={s.storageKey}
                onClick={() => {
                  if (!canLoad) return;
                  try {
                    const parsed = JSON.parse(stored!);
                    setNodes(doRehydrate(parsed.nodes));
                    setEdges(parsed.edges ?? []);
                    setTimeout(() => fitView({ duration: 800, padding: 0.18 }), 100);
                    setShowHistory(false);
                  } catch { /* ignore */ }
                }}
                style={{
                  padding: '8px 10px', borderRadius: '8px', marginBottom: '4px',
                  background: canLoad ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  cursor: canLoad ? 'pointer' : 'default',
                  opacity: canLoad ? 1 : 0.4,
                }}
              >
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.8)', marginBottom: '3px', wordBreak: 'keep-all' }}>
                  {s.idea.slice(0, 40)}{s.idea.length > 40 ? '...' : ''}
                </div>
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>
                  {new Date(s.savedAt).toLocaleDateString('ko-KR')} {new Date(s.savedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                  {!canLoad && ' · 데이터 없음'}
                </div>
              </div>
            );
          })}
          <button
            onClick={() => setShowHistory(false)}
            style={{ ...btnStyle('back'), marginTop: '8px', width: '100%', textAlign: 'center' }}
          >
            닫기
          </button>
        </div>
      )}

      {/* ── BOTTOM CHAT INPUT ────────────────────────────────── */}
      <div style={{
        position: 'absolute', bottom: 28, left: '50%', transform: 'translateX(-50%)',
        zIndex: 50, width: 'min(640px, 90vw)',
      }}>
        {/* Chat History */}
        {chatHistory.length > 0 && (
          <div
            ref={historyRef}
            style={{
              maxHeight: '130px',
              overflowY: 'auto',
              marginBottom: '8px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              scrollbarWidth: 'none',
            }}
          >
            {chatHistory.map(h => (
              <div key={h.id} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(255,255,255,0.06)',
                  backdropFilter: 'blur(12px)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '20px 20px 4px 20px',
                  padding: '6px 12px',
                  maxWidth: '85%',
                }}>
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.75)' }}>{h.text}</span>
                  <span style={{ fontSize: '10px', flexShrink: 0 }}>
                    {h.status === 'pending' ? '⟳' : h.status === 'done' ? '✓' : '✕'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Input Bar */}
        <div style={{
          background: 'rgba(5,5,15,0.75)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: '20px',
          display: 'flex',
          alignItems: 'flex-end',
          padding: '6px 6px 6px 20px',
          gap: '8px',
          boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
        }}>
          <span style={{ fontSize: '14px', opacity: 0.5, paddingBottom: '10px' }}>✦</span>
          <textarea
            rows={1}
            value={chatInput}
            onChange={e => {
              setChatInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = e.target.scrollHeight + 'px';
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey && !chatLoading) {
                e.preventDefault();
                handleChatSubmit();
              }
            }}
            placeholder={globalLoading || chatLoading ? '처리 중...' : '조사해줘, 분석해줘, 아이디어 줘, 이미지로 표현해줘 등 자유롭게 입력하세요'}
            disabled={chatLoading || globalLoading}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'rgba(255,255,255,0.8)',
              fontSize: '13px',
              padding: '10px 0',
              resize: 'none',
              overflow: 'hidden',
              lineHeight: 1.55,
              minHeight: '40px',
            }}
          />
          <button
            onClick={handleChatSubmit}
            disabled={!chatInput.trim() || chatLoading || globalLoading}
            style={{
              padding: '8px 18px',
              background: chatInput.trim() && !chatLoading ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.1)',
              border: 'none',
              borderRadius: '999px',
              color: chatInput.trim() && !chatLoading ? '#000' : 'rgba(255,255,255,0.3)',
              fontSize: '12px',
              fontWeight: 600,
              cursor: chatInput.trim() && !chatLoading ? 'pointer' : 'default',
              transition: 'all 0.2s',
              flexShrink: 0,
            }}
          >
            {chatLoading ? '⟳' : '실행'}
          </button>
        </div>

      </div>

      {/* Initial generating overlay */}
      <AnimatePresence>
        {initializing && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{
              position: 'absolute', inset: 0, zIndex: 55,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(7,7,15,0.75)', backdropFilter: 'blur(6px)',
              gap: '16px', pointerEvents: 'none',
            }}
          >
            <div style={{
              width: 48, height: 48, borderRadius: '50%',
              border: '2px solid rgba(255,255,255,0.08)',
              borderTop: '2px solid rgba(255,255,255,0.6)',
              animation: 'spin 1s linear infinite',
            }} />
            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.3em', textTransform: 'uppercase' }}>
              아이디어 분석 중...
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Global loading overlay (non-initial) */}
      <AnimatePresence>
        {(globalLoading || chatLoading) && !initializing && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{
              position: 'absolute', top: 72, right: 24, zIndex: 60,
              background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px',
              padding: '8px 16px', fontSize: '11px', color: 'rgba(255,255,255,0.5)',
              letterSpacing: '0.2em',
            }}
          >
            ⟳ AI 분석 중...
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Button helper styles ─────────────────────────────────────────
function btnStyle(type: 'back' | 'analysis' | 'save'): React.CSSProperties {
  if (type === 'back') {
    return {
      padding: '9px 20px',
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: '999px',
      color: 'rgba(255,255,255,0.45)',
      fontSize: '11px',
      letterSpacing: '0.15em',
      cursor: 'pointer',
      backdropFilter: 'blur(12px)',
    };
  }
  if (type === 'save') {
    return {
      padding: '9px 16px',
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: '999px',
      color: 'rgba(255,255,255,0.5)',
      fontSize: '11px',
      letterSpacing: '0.05em',
      cursor: 'pointer',
      backdropFilter: 'blur(12px)',
      whiteSpace: 'nowrap' as const,
    };
  }
  return {
    padding: '9px 16px',
    background: 'rgba(167,139,250,0.1)',
    border: '1px solid rgba(167,139,250,0.3)',
    borderRadius: '999px',
    color: 'rgba(220,200,255,0.85)',
    fontSize: '11px',
    letterSpacing: '0.05em',
    cursor: 'pointer',
    backdropFilter: 'blur(12px)',
    whiteSpace: 'nowrap' as const,
  };
}

// ── Export ────────────────────────────────────────────────────────
export default function CorePointPinching({ initialIdea, onReset, initialData }: { initialIdea: string; onReset: () => void; initialData?: { nodes: Node[]; edges: Edge[] } }) {
  return (
    <ReactFlowProvider>
      <CorePointPinchingContent initialIdea={initialIdea} onReset={onReset} initialData={initialData} />
    </ReactFlowProvider>
  );
}
