import type { ResearchMainNode } from './api';

export interface SavedMap {
  id: string;
  root: string;
  children: ResearchMainNode[];
  nodes?: any[];   // full React Flow node state (including expanded nodes)
  edges?: any[];   // full edge state
  savedAt: number;
}

const KEY = 'rm_saved';

export const loadMaps = (): SavedMap[] => {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
  catch { return []; }
};

export const saveMap = (
  root: string,
  children: ResearchMainNode[],
  nodes?: any[],
  edges?: any[],
): SavedMap => {
  const map: SavedMap = { id: Date.now().toString(), root, children, nodes, edges, savedAt: Date.now() };
  const maps = [map, ...loadMaps()].slice(0, 12);
  localStorage.setItem(KEY, JSON.stringify(maps));
  return map;
};

export const deleteMap = (id: string): void => {
  localStorage.setItem(KEY, JSON.stringify(loadMaps().filter(m => m.id !== id)));
};

export const formatDate = (ts: number): string => {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
};
