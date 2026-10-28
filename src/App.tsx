import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  addEdge,
  Background,
  Controls,
  MiniMap,
  useEdgesState,
  useNodesState,
  MarkerType,
  NodeResizer,
  Handle,
  Position,
} from 'reactflow';
import type { Connection, Node, Edge } from 'reactflow';
import 'reactflow/dist/style.css';
import './App.css';

type Department = {
  id: string;
  number: string;
  rate: number;
};
type Person = {
  id: string;
  name: string;
  departmentId: string;
  defaultAllocation: number;
  startDate?: string;
};
type TaskTemplate = {
  id: string;
  name: string;
  estimatedHours: number;
};
type TaskData = {
  label: string;
  personId?: string;
  estimatedHours?: number;
  percentComplete?: number;
};
type ScheduledTask = {
  id: string;
  label: string;
  personId?: string;
  start: string;
  finish: string;
  hours: number;
  pct: number;
};
type Baseline = {
  id: string;
  name: string;
  date: string;
  tasks: ScheduledTask[];
};

const STORAGE_KEY = 'project-tracker-v1';

const defaultDepartments: Department[] = [
  { id: 'd1', number: '100', rate: 85 },
  { id: 'd2', number: '200', rate: 70 },
];
const defaultPeople: Person[] = [
  { id: 'p1', name: 'Alex', departmentId: 'd1', defaultAllocation: 0.8, startDate: '2026-01-06' },
  { id: 'p2', name: 'Jordan', departmentId: 'd2', defaultAllocation: 1.0, startDate: '2026-01-06' },
];
const defaultTemplates: TaskTemplate[] = [
  { id: 't1', name: 'Design Review', estimatedHours: 8 },
  { id: 't2', name: 'Code Module', estimatedHours: 16 },
];

function PhaseNode({ data, selected }: { data: TaskData; selected: boolean }) {
  return (
    <>
      <NodeResizer color="#4a6cf7" isVisible={selected} minWidth={300} minHeight={200} />
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div style={{ padding: 8, height: '100%', whiteSpace: 'pre-line' }}>{data.label}</div>
    </>
  );
}

function BlockNode({ data, selected }: { data: TaskData; selected: boolean }) {
  return (
    <>
      <NodeResizer color="#666" isVisible={selected} minWidth={180} minHeight={80} />
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div style={{ padding: 6, height: '100%', whiteSpace: 'pre-line' }}>{data.label}</div>
    </>
  );
}

const nodeTypes = { phase: PhaseNode, block: BlockNode };

const defaultNodes: Node<TaskData>[] = [
  {
    id: 'phase-1',
    type: 'phase',
    data: { label: 'Phase 1' },
    position: { x: 40, y: 40 },
    style: { width: 900, height: 550, background: '#f0f4ff', border: '2px solid #4a6cf7' },
  },
];

let nextId = 100;

function isWeekend(dateStr: string): boolean {
  const d = new Date(dateStr + 'T00:00:00');
  const dow = d.getDay();
  return dow === 0 || dow === 6;
}

function addWorkingDays(dateStr: string, days: number): string {
  if (days <= 0) return dateStr;
  let d = new Date(dateStr + 'T00:00:00');
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return d.toISOString().slice(0, 10);
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function nowDateTime(): string {
  const d = new Date();
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00');
  const db = new Date(b + 'T00:00:00');
  return Math.round((db.getTime() - da.getTime()) / (1000 * 60 * 60 * 24));
}

function nextWorkDays(n: number): string[] {
  const days: string[] = [];
  let d = new Date();
  while (days.length < n) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) days.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function getDaysInRange(start: string, end: string): string[] {
  const days: string[] = [];
  let d = new Date(start + 'T00:00:00');
  const endD = new Date(end + 'T00:00:00');
  while (d <= endD) {
    days.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

const barColors = ['#f97316', '#22c55e', '#a855f7', '#ef4444', '#3b82f6', '#eab308'];

function loadSaved() {
  if (typeof window !== 'undefined' && (window as any).electronAPI?.loadData) {
    return null;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export default function App() {
  const saved = loadSaved();
  const [nodes, setNodes, onNodesChange] = useNodesState(saved?.nodes || defaultNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(saved?.edges || []);
  const [departments, setDepartments] = useState<Department[]>(saved?.departments || defaultDepartments);
  const [people, setPeople] = useState<Person[]>(saved?.people || defaultPeople);
  const [templates, setTemplates] = useState<TaskTemplate[]>(saved?.templates || defaultTemplates);
  const [baselines, setBaselines] = useState<Baseline[]>(saved?.baselines || []);
  const [view, setView] = useState<'diagram' | 'list' | 'people' | 'templates' | 'swim' | 'departments'>('diagram');
  const [swimMode, setSwimMode] = useState<'package' | 'daily' | 'weekly'>('package');
  const [filterPerson, setFilterPerson] = useState<string>('');
  const [filterPhase, setFilterPhase] = useState<string>('');
  const [listFilterPerson, setListFilterPerson] = useState<string>('');
  const [listFilterPhase, setListFilterPhase] = useState<string>('');
  const [listMode, setListMode] = useState<'current' | 'compare'>('current');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [baselineA, setBaselineA] = useState<string>('');
  const [baselineB, setBaselineB] = useState<string>('');
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [pendingPredecessor, setPendingPredecessor] = useState<string | null>(null);
  const [baselineModal, setBaselineModal] = useState(false);
  const [baselineName, setBaselineName] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'node' | 'edge' | 'baseline'; id?: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileMenuRef = useRef<HTMLDivElement>(null);

  const pushHistory = useCallback(() => {
    setHistory((h) => {
      const snap = {
        nodes: JSON.parse(JSON.stringify(nodes)),
        edges: JSON.parse(JSON.stringify(edges)),
        departments: JSON.parse(JSON.stringify(departments)),
        people: JSON.parse(JSON.stringify(people)),
        templates: JSON.parse(JSON.stringify(templates)),
        baselines: JSON.parse(JSON.stringify(baselines)),
      };
      return [...h, snap].slice(-30);
    });
  }, [nodes, edges, departments, people, templates, baselines]);

  const undo = useCallback(() => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setNodes(prev.nodes);
    setEdges(prev.edges);
    setDepartments(prev.departments);
    setPeople(prev.people);
    setTemplates(prev.templates);
    setBaselines(prev.baselines);
    setSelectedId(null);
    setSelectedEdgeId(null);
    setPendingPredecessor(null);
  }, [history, setNodes, setEdges]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (fileMenuRef.current && !fileMenuRef.current.contains(e.target as unknown as globalThis.Node)) {
        setFileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  useEffect(() => {
    const data = { nodes, edges, departments, people, templates, baselines };
    if ((window as any).electronAPI?.saveData) {
      (window as any).electronAPI.saveData(data);
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('Could not save to localStorage', e);
    }
  }, [nodes, edges, departments, people, templates, baselines]);

  useEffect(() => {
    if ((window as any).electronAPI?.loadData) {
      (window as any).electronAPI.loadData().then((data: any) => {
        if (data?.nodes) {
          setNodes(data.nodes);
          setEdges(data.edges || []);
          setDepartments(data.departments || defaultDepartments);
          setPeople(data.people || defaultPeople);
          setTemplates(data.templates || defaultTemplates);
          setBaselines(data.baselines || []);
        }
      });
    }
  }, []);

  const clearSaved = () => {
    if (window.confirm('Clear all saved data and start over?')) {
      localStorage.removeItem(STORAGE_KEY);
      window.location.reload();
    }
  };

  const manualSave = () => {
    const data = { nodes, edges, departments, people, templates, baselines };
    if ((window as any).electronAPI?.saveData) {
      (window as any).electronAPI.saveData(data);
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      alert('Saved.');
    } catch (e) {
      alert('Save failed: ' + (e as Error).message);
    }
  };

  const saveToFile = () => {
    const data = { nodes, edges, departments, people, templates, baselines };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `project-tracker-${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openFromFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (data.nodes && data.edges) {
          setNodes(data.nodes);
          setEdges(data.edges);
          setDepartments(data.departments || defaultDepartments);
          setPeople(data.people || defaultPeople);
          setTemplates(data.templates || defaultTemplates);
          setBaselines(data.baselines || []);
          setSelectedId(null);
          setSelectedEdgeId(null);
          setPendingPredecessor(null);
          alert('File loaded successfully.');
        } else {
          alert('Invalid file format.');
        }
      } catch {
        alert('Could not read file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const onConnect = useCallback(
    (params: Connection) => {
      pushHistory();
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            type: 'smoothstep',
            label: 'P → S',
            style: { stroke: '#222', strokeWidth: 2.5 },
            markerEnd: { type: MarkerType.ArrowClosed },
            zIndex: 2000,
          },
          eds
        )
      );
    },
    [setEdges, pushHistory]
  );

  const getDescendants = useCallback((nodeId: string): string[] => {
    const children = nodes.filter((n) => n.parentNode === nodeId).map((n) => n.id);
    return children.concat(children.flatMap(getDescendants));
  }, [nodes]);

  const performDelete = (type: 'node' | 'edge' | 'baseline', id?: string) => {
    pushHistory();
    if (type === 'edge' && id) {
      setEdges((eds) => eds.filter((e) => e.id !== id));
      setSelectedEdgeId(null);
    } else if (type === 'node' && id) {
      const toDelete = new Set([id, ...getDescendants(id)]);
      setNodes((nds) => nds.filter((n) => !toDelete.has(n.id)));
      setEdges((eds) => eds.filter((e) => !toDelete.has(e.source) && !toDelete.has(e.target)));
      setSelectedId(null);
    } else if (type === 'baseline' && id) {
      setBaselines((bs) => bs.filter((b) => b.id !== id));
      if (baselineA === id) setBaselineA('');
      if (baselineB === id) setBaselineB('');
    }
    setDeleteConfirm(null);
    setPendingPredecessor(null);
  };

  const getEffectivePerson = useCallback((nodeId: string): string | undefined => {
    let current = nodes.find((n) => n.id === nodeId);
    while (current) {
      if (current.data.personId) return current.data.personId;
      if (!current.parentNode) break;
      current = nodes.find((n) => n.id === current!.parentNode);
    }
    return undefined;
  }, [nodes]);

  const getPercentComplete = useCallback((nodeId: string): number => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return 0;
    if (node.id.startsWith('task-')) return node.data.percentComplete ?? 0;
    const children = nodes.filter((n) => n.parentNode === nodeId);
    if (children.length === 0) return 0;
    const sum = children.reduce((s, c) => s + getPercentComplete(c.id), 0);
    return Math.round(sum / children.length);
  }, [nodes]);

  const getRate = (personId?: string) => {
    if (!personId) return 0;
    const person = people.find((p) => p.id === personId);
    if (!person) return 0;
    const dept = departments.find((d) => d.id === person.departmentId);
    return dept?.rate ?? 0;
  };

  const predSuccMap = useMemo(() => {
    const map: Record<string, { isPred: boolean; isSucc: boolean }> = {};
    edges.forEach((e) => {
      if (!map[e.source]) map[e.source] = { isPred: false, isSucc: false };
      if (!map[e.target]) map[e.target] = { isPred: false, isSucc: false };
      map[e.source].isPred = true;
      map[e.target].isSucc = true;
    });
    return map;
  }, [edges]);

  const displayNodes = useMemo(() => {
    return nodes.map((n) => {
      const personId = getEffectivePerson(n.id);
      const person = people.find((p) => p.id === personId);
      const pct = getPercentComplete(n.id);
      const hours = n.data.estimatedHours;
      const ps = predSuccMap[n.id];
      let markers = '';
      if (ps?.isPred) markers += ' [P]';
      if (ps?.isSucc) markers += ' [S]';
      if (pendingPredecessor === n.id) markers += ' (selecting...)';
      const hoursStr = n.id.startsWith('task-') && hours != null ? ` (${hours}h)` : '';
      const label = person
        ? `${n.data.label}${hoursStr}${markers}\n(${person.name}) ${pct}%`
        : `${n.data.label}${hoursStr}${markers}\n${pct}%`;
      return { ...n, data: { ...n.data, label } };
    });
  }, [nodes, people, getEffectivePerson, getPercentComplete, predSuccMap, pendingPredecessor]);

  const totalCost = useMemo(() => {
    return nodes
      .filter((n) => n.id.startsWith('task-'))
      .reduce((sum, t) => {
        const personId = getEffectivePerson(t.id);
        const rate = getRate(personId);
        const hours = t.data.estimatedHours ?? 0;
        const person = people.find((p) => p.id === personId);
        if (!rate || !hours || !person) return sum;
        return sum + rate * hours * (person.defaultAllocation ?? 1);
      }, 0);
  }, [nodes, people, departments, getEffectivePerson]);

  const growToFit = (parentId: string) => {
    setNodes((nds) => {
      const children = nds.filter((n) => n.parentNode === parentId);
      if (children.length === 0) return nds;
      const maxRight = Math.max(...children.map((c) => c.position.x + ((c.style?.width as number) || 200)));
      const maxBottom = Math.max(...children.map((c) => c.position.y + ((c.style?.height as number) || 70)));
      return nds.map((n) => {
        if (n.id !== parentId) return n;
        const curW = (n.style?.width as number) || 300;
        const curH = (n.style?.height as number) || 200;
        return {
          ...n,
          style: {
            ...n.style,
            width: Math.max(maxRight + 80, curW),
            height: Math.max(maxBottom + 80, curH),
          },
        };
      });
    });
  };

  const addPhase = () => {
    pushHistory();
    const id = `phase-${nextId++}`;
    setNodes((nds) =>
      nds.concat({
        id,
        type: 'phase',
        data: { label: 'New Phase' },
        position: { x: 100 + nds.length * 30, y: 60 },
        style: { width: 850, height: 500, background: '#f0f4ff', border: '2px solid #4a6cf7' },
      })
    );
  };

  const addBlock = () => {
    pushHistory();
    const parent =
      selectedId && nodes.find((n) => n.id === selectedId && n.id.startsWith('phase-'))
        ? selectedId
        : nodes.find((n) => n.id.startsWith('phase-'))?.id;
    if (!parent) return;
    const siblings = nodes.filter((n) => n.parentNode === parent && n.id.startsWith('block-'));
    const id = `block-${nextId++}`;
    setNodes((nds) =>
      nds.concat({
        id,
        type: 'block',
        data: { label: 'New Block' },
        position: { x: 50 + (siblings.length % 3) * 340, y: 80 + Math.floor(siblings.length / 3) * 220 },
        parentNode: parent,
        extent: 'parent',
        style: { width: 310, height: 190, background: '#fff', border: '1px solid #888' },
      })
    );
    setTimeout(() => growToFit(parent), 100);
  };

  const addFromTemplate = (template: TaskTemplate, parentId: string) => {
    pushHistory();
    const siblings = nodes.filter((n) => n.parentNode === parentId && n.id.startsWith('task-'));
    const id = `task-${nextId++}`;
    setNodes((nds) =>
      nds.concat({
        id,
        data: { label: template.name, estimatedHours: template.estimatedHours, percentComplete: 0 },
        position: { x: 25 + (siblings.length % 2) * 210, y: 45 + Math.floor(siblings.length / 2) * 75 },
        parentNode: parentId,
        extent: 'parent',
        style: { width: 190, background: '#e8f5e9', whiteSpace: 'pre-line' },
      })
    );
    setTimeout(() => growToFit(parentId), 100);
  };

  const assignPerson = (nodeId: string, personId: string | undefined) => {
    pushHistory();
    const idsToUpdate = [nodeId, ...getDescendants(nodeId)];
    setNodes((nds) =>
      nds.map((n) =>
        idsToUpdate.includes(n.id) ? { ...n, data: { ...n.data, personId } } : n
      )
    );
  };

  const renameNode = (nodeId: string, newLabel: string) => {
    pushHistory();
    setNodes((nds) =>
      nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, label: newLabel } } : n))
    );
  };

  const setPercent = (nodeId: string, pct: number) => {
    pushHistory();
    setNodes((nds) =>
      nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, percentComplete: pct } } : n))
    );
  };

  const selectedNode = nodes.find((n) => n.id === selectedId);

  const scheduledTasks: ScheduledTask[] = useMemo(() => {
    const taskNodes = nodes.filter((n) => n.id.startsWith('task-'));
    if (taskNodes.length === 0) return [];

    const predEdges = edges;

    const mustFinishBefore: Record<string, Set<string>> = {};
    taskNodes.forEach((t) => (mustFinishBefore[t.id] = new Set()));

    const getTasksInside = (nodeId: string): string[] => {
      const direct = nodes.filter((n) => n.parentNode === nodeId);
      const tasks = direct.filter((n) => n.id.startsWith('task-')).map((n) => n.id);
      return tasks.concat(direct.flatMap((c) => getTasksInside(c.id)));
    };

    for (const edge of predEdges) {
      const predTasks = edge.source.startsWith('task-') ? [edge.source] : getTasksInside(edge.source);
      const succTasks = edge.target.startsWith('task-') ? [edge.target] : getTasksInside(edge.target);

      for (const succ of succTasks) {
        for (const pred of predTasks) {
          if (succ !== pred) {
            mustFinishBefore[succ].add(pred);
          }
        }
      }
    }

    const finishMap: Record<string, string> = {};
    const personNext: Record<string, string> = {};
    people.forEach((p) => {
      personNext[p.id] = p.startDate || todayStr();
    });

    const result: ScheduledTask[] = [];
    const done = new Set<string>();

    const isReady = (id: string) => {
      for (const pred of mustFinishBefore[id]) {
        if (!done.has(pred)) return false;
      }
      return true;
    };

    let guard = 0;
    while (done.size < taskNodes.length && guard < taskNodes.length * 5) {
      guard++;
      let scheduledAny = false;
      for (const node of taskNodes) {
        if (done.has(node.id) || !isReady(node.id)) continue;

        const personId = getEffectivePerson(node.id);
        const person = people.find((p) => p.id === personId);
        let start = personId ? personNext[personId] : todayStr();

        while (isWeekend(start)) {
          start = addWorkingDays(start, 1);
        }

        for (const pid of mustFinishBefore[node.id]) {
          const pf = finishMap[pid];
          if (pf && pf > start) start = addWorkingDays(pf, 1);
        }

        const hours = node.data.estimatedHours || 0;
        const alloc = person?.defaultAllocation ?? 1;
        const workDaysNeeded = Math.max(Math.ceil(hours / (8 * Math.max(alloc, 0.1))), 1);
        const finish = addWorkingDays(start, workDaysNeeded - 1);

        finishMap[node.id] = finish;
        if (personId) personNext[personId] = addWorkingDays(finish, 1);

        result.push({
          id: node.id,
          label: node.data.label,
          personId,
          start,
          finish,
          hours,
          pct: node.data.percentComplete ?? 0,
        });
        done.add(node.id);
        scheduledAny = true;
      }
      if (!scheduledAny) break;
    }

    for (const node of taskNodes) {
      if (!done.has(node.id)) {
        const personId = getEffectivePerson(node.id);
        result.push({
          id: node.id,
          label: node.data.label,
          personId,
          start: todayStr(),
          finish: todayStr(),
          hours: node.data.estimatedHours || 0,
          pct: node.data.percentComplete ?? 0,
        });
      }
    }

    return result;
  }, [nodes, edges, people, getEffectivePerson]);

  const confirmCutBaseline = () => {
    const name = baselineName.trim() || `Baseline ${baselines.length + 1}`;
    pushHistory();
    const newBaseline: Baseline = {
      id: `bl-${Date.now()}`,
      name,
      date: nowDateTime(),
      tasks: JSON.parse(JSON.stringify(scheduledTasks)),
    };
    setBaselines((bs) => [...bs, newBaseline]);
    setBaselineModal(false);
    setBaselineName('');
  };

  const filteredScheduled = useMemo(() => {
    const today = todayStr();
    const workDays = nextWorkDays(5);
    return scheduledTasks.filter((t) => {
      if (filterPerson && t.personId !== filterPerson) return false;
      if (filterPhase) {
        let cur = nodes.find((n) => n.id === t.id);
        let inPhase = false;
        while (cur) {
          if (cur.id === filterPhase) inPhase = true;
          if (!cur.parentNode) break;
          cur = nodes.find((n) => n.id === cur.parentNode);
        }
        if (!inPhase) return false;
      }
      if (swimMode === 'daily') return t.start <= today && today <= t.finish;
      if (swimMode === 'weekly') return workDays.some((d) => t.start <= d && d <= t.finish);
      return true;
    });
  }, [scheduledTasks, filterPerson, filterPhase, swimMode, nodes]);

  const tasksByPerson = useMemo(() => {
    const map: Record<string, ScheduledTask[]> = {};
    people.forEach((p) => (map[p.id] = []));
    filteredScheduled.forEach((t) => {
      if (t.personId && map[t.personId]) map[t.personId].push(t);
    });
    Object.values(map).forEach((arr) => arr.sort((a, b) => a.start.localeCompare(b.start)));
    return map;
  }, [filteredScheduled, people]);

  const filteredListTasks = useMemo(() => {
    return scheduledTasks
      .filter((t) => {
        if (listFilterPerson && t.personId !== listFilterPerson) return false;
        if (listFilterPhase) {
          let cur = nodes.find((n) => n.id === t.id);
          let inPhase = false;
          while (cur) {
            if (cur.id === listFilterPhase) inPhase = true;
            if (!cur.parentNode) break;
            cur = nodes.find((n) => n.id === cur.parentNode);
          }
          if (!inPhase) return false;
        }
        return true;
      })
      .sort((a, b) => a.start.localeCompare(b.start));
  }, [scheduledTasks, listFilterPerson, listFilterPhase, nodes]);

  const blA = baselines.find((b) => b.id === baselineA);
  const blB = baselines.find((b) => b.id === baselineB);

  const phases = nodes.filter((n) => n.id.startsWith('phase-'));
  const today = todayStr();
  const workDays = nextWorkDays(5);

  const { minDate, maxDate, totalDays, dayLabels } = useMemo(() => {
    const all = filteredScheduled;
    if (all.length === 0) {
      const t = todayStr();
      return { minDate: t, maxDate: addWorkingDays(t, 20), totalDays: 20, dayLabels: [] };
    }
    const min = all.reduce((m, t) => (t.start < m ? t.start : m), all[0].start);
    const max = all.reduce((m, t) => (t.finish > m ? t.finish : m), all[0].finish);
    const total = Math.max(daysBetween(min, max), 1);
    const labels = total <= 60 ? getDaysInRange(min, max) : [];
    return { minDate: min, maxDate: max, totalDays: total, dayLabels: labels };
  }, [filteredScheduled]);

  const handleNodeClick = (_: any, node: Node) => {
    setSelectedEdgeId(null);
    if (pendingPredecessor && pendingPredecessor !== node.id) {
      pushHistory();
      const newEdge: Edge = {
        id: `e-${pendingPredecessor}-${node.id}-${Date.now()}`,
        source: pendingPredecessor,
        target: node.id,
        type: 'smoothstep',
        label: 'P → S',
        style: { stroke: '#222', strokeWidth: 2.5 },
        markerEnd: { type: MarkerType.ArrowClosed },
        zIndex: 2000,
      };
      setEdges((eds) => addEdge(newEdge, eds));
      setPendingPredecessor(null);
      setSelectedId(node.id);
    } else if (pendingPredecessor === node.id) {
      setPendingPredecessor(null);
      setSelectedId(node.id);
    } else {
      setPendingPredecessor(node.id);
      setSelectedId(node.id);
    }
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '8px 16px', background: '#1e293b', color: 'white', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong>Project Tracker</strong>
        <div ref={fileMenuRef} style={{ position: 'relative' }}>
          <button onClick={() => setFileMenuOpen((o) => !o)}>File</button>
          {fileMenuOpen && (
            <div style={{ position: 'absolute', top: '100%', left: 0, background: 'white', color: 'black', border: '1px solid #ccc', borderRadius: 4, minWidth: 160, zIndex: 100, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
              <div style={{ padding: '8px 12px', cursor: 'pointer' }} onClick={() => { manualSave(); setFileMenuOpen(false); }}>Save Local</div>
              <div style={{ padding: '8px 12px', cursor: 'pointer' }} onClick={() => { saveToFile(); setFileMenuOpen(false); }}>Save to File</div>
              <div style={{ padding: '8px 12px', cursor: 'pointer' }} onClick={() => { fileInputRef.current?.click(); setFileMenuOpen(false); }}>Open File</div>
            </div>
          )}
        </div>
        <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={openFromFile} />
        <button onClick={() => setView('diagram')}>Diagram</button>
        <button onClick={() => setView('swim')}>Swim Lanes</button>
        <button onClick={() => setView('list')}>Tasks</button>
        <button onClick={() => setView('templates')}>Templates</button>
        <button onClick={() => setView('people')}>People</button>
        <button onClick={() => setView('departments')}>Departments</button>
        <button onClick={addPhase}>+ Phase</button>
        <button onClick={addBlock}>+ Block</button>
        <button onClick={undo} disabled={history.length === 0}>Undo</button>
        <button
          onClick={() => {
            if (selectedEdgeId) setDeleteConfirm({ type: 'edge', id: selectedEdgeId });
            else if (selectedId) setDeleteConfirm({ type: 'node', id: selectedId });
          }}
          disabled={!selectedId && !selectedEdgeId}
          style={{ background: '#dc2626', color: 'white' }}
        >
          Delete
        </button>
        <button onClick={() => { setBaselineName(`Baseline ${baselines.length + 1}`); setBaselineModal(true); }}>Cut Baseline</button>
        <button onClick={clearSaved} style={{ marginLeft: 8, background: '#dc2626', color: 'white' }}>Clear Saved</button>
        <span style={{ marginLeft: 'auto' }}>Total Cost: ${totalCost.toFixed(0)}</span>
      </header>

      {view === 'diagram' && (
        <div style={{ flex: 1, display: 'flex' }}>
          <div style={{ flex: 1 }}>
            <div style={{ padding: '4px 8px', background: '#f1f5f9', fontSize: 13 }}>
              Click first item (Predecessor [P]), then click second item (Successor [S]). Predecessor always finishes first. Everything else is ASAP. Ctrl+Z to undo.
              {pendingPredecessor && <span style={{ marginLeft: 12, color: '#4a6cf7' }}>Selecting successor for {nodes.find(n => n.id === pendingPredecessor)?.data.label}...</span>}
            </div>
            <ReactFlow
              nodes={displayNodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={handleNodeClick}
              onEdgeClick={(_, edge) => { setSelectedEdgeId(edge.id); setSelectedId(null); setPendingPredecessor(null); }}
              onPaneClick={() => { setSelectedId(null); setSelectedEdgeId(null); setPendingPredecessor(null); }}
              nodeTypes={nodeTypes}
              nodesResizable
              elevateEdgesOnSelect
              minZoom={0.05}
              maxZoom={2}
              fitView
              {...({} as any)}
            >
              <Background />
              <Controls />
              <MiniMap />
            </ReactFlow>
          </div>
          {selectedId && selectedNode && (
            <div style={{ width: 280, borderLeft: '1px solid #ddd', padding: 12, background: '#fafafa', overflow: 'auto' }}>
              <h3>Selected</h3>
              <label>Name</label>
              <input value={selectedNode.data.label} onChange={(e) => renameNode(selectedId, e.target.value)} style={{ width: '100%', margin: '4px 0 12px' }} />
              {selectedId.startsWith('task-') && (
                <>
                  <label>% Complete</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={selectedNode.data.percentComplete ?? 0}
                    onChange={(e) => setPercent(selectedId, Number(e.target.value))}
                    style={{ width: '100%', margin: '4px 0 12px' }}
                  />
                  <label>Hours</label>
                  <input
                    type="number"
                    min="0"
                    value={selectedNode.data.estimatedHours ?? 0}
                    onChange={(e) => {
                      pushHistory();
                      setNodes((nds) => nds.map((n) => n.id === selectedId ? { ...n, data: { ...n.data, estimatedHours: Number(e.target.value) } } : n));
                    }}
                    style={{ width: '100%', margin: '4px 0 12px' }}
                  />
                </>
              )}
              <label>Assign Person</label>
              <select value={selectedNode.data.personId || ''} onChange={(e) => assignPerson(selectedId, e.target.value || undefined)} style={{ width: '100%', margin: '4px 0 8px' }}>
                <option value="">— none —</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <p style={{ fontSize: 12 }}>
                Effective: {people.find((p) => p.id === getEffectivePerson(selectedId))?.name ?? 'none'}<br />
                % Complete: {getPercentComplete(selectedId)}%
              </p>
              {(selectedId.startsWith('block-') || selectedId.startsWith('phase-')) && (
                <>
                  <h4>Add Task</h4>
                  {templates.map((tmpl) => (
                    <button key={tmpl.id} style={{ display: 'block', width: '100%', margin: '4px 0', textAlign: 'left' }} onClick={() => addFromTemplate(tmpl, selectedId)}>
                      + {tmpl.name} ({tmpl.estimatedHours}h)
                    </button>
                  ))}
                </>
              )}
              <button onClick={() => setDeleteConfirm({ type: 'node', id: selectedId })} style={{ marginTop: 12, background: '#dc2626', color: 'white', width: '100%' }}>Delete Selected</button>
            </div>
          )}
          {selectedEdgeId && (
            <div style={{ width: 280, borderLeft: '1px solid #ddd', padding: 12, background: '#fafafa' }}>
              <h3>Selected Link</h3>
              <p>Predecessor → Successor link selected.</p>
              <button onClick={() => setDeleteConfirm({ type: 'edge', id: selectedEdgeId })} style={{ marginTop: 12, background: '#dc2626', color: 'white', width: '100%' }}>Delete Link</button>
            </div>
          )}
        </div>
      )}

      {view === 'swim' && (
        <div style={{ flex: 1, padding: 16, overflow: 'auto' }}>
          <h2>
            Swim Lanes —{' '}
            {swimMode === 'daily' && `Today (${today})`}
            {swimMode === 'weekly' && `Next 5 Work Days`}
            {swimMode === 'package' && 'Whole Package'}
          </h2>
          <div style={{ marginBottom: 12, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <span>View:</span>
            <button onClick={() => setSwimMode('package')} style={{ fontWeight: swimMode === 'package' ? 'bold' : 'normal' }}>Whole Package</button>
            <button onClick={() => setSwimMode('daily')} style={{ fontWeight: swimMode === 'daily' ? 'bold' : 'normal' }}>Daily (Today)</button>
            <button onClick={() => setSwimMode('weekly')} style={{ fontWeight: swimMode === 'weekly' ? 'bold' : 'normal' }}>Weekly (Next 5 Work Days)</button>
            <select value={filterPerson} onChange={(e) => setFilterPerson(e.target.value)}>
              <option value="">All People</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select value={filterPhase} onChange={(e) => setFilterPhase(e.target.value)}>
              <option value="">All Phases</option>
              {phases.map((p) => <option key={p.id} value={p.id}>{p.data.label}</option>)}
            </select>
          </div>
          {swimMode === 'weekly' && (
            <div style={{ marginBottom: 8, fontSize: 13, color: '#444' }}>
              Work days: {workDays.join(', ')}
            </div>
          )}
          <div style={{ display: 'flex', marginBottom: 4, fontSize: 10, color: '#666' }}>
            <div style={{ width: 160, flexShrink: 0 }} />
            <div style={{ flex: 1, position: 'relative', height: dayLabels.length > 0 ? 28 : 20, overflow: 'hidden' }}>
              {dayLabels.length > 0 ? (
                dayLabels.map((d, i) => (
                  <span
                    key={d}
                    style={{
                      position: 'absolute',
                      left: `${(i / Math.max(dayLabels.length - 1, 1)) * 100}%`,
                      transform: 'translateX(-50%)',
                      fontSize: 9,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {d.slice(5)}
                  </span>
                ))
              ) : (
                <>
                  <span style={{ position: 'absolute', left: 0 }}>{minDate}</span>
                  <span style={{ position: 'absolute', right: 0 }}>{maxDate}</span>
                </>
              )}
            </div>
          </div>
          {people.filter((p) => !filterPerson || p.id === filterPerson).map((p) => {
            const tasks = tasksByPerson[p.id] || [];
            return (
              <div key={p.id} style={{ display: 'flex', marginBottom: 6, alignItems: 'center' }}>
                <div style={{ width: 160, flexShrink: 0, fontSize: 13, paddingRight: 8 }}>
                  <strong>{p.name}</strong>
                  <div style={{ fontSize: 11, color: '#666' }}>
                    Dept {departments.find((d) => d.id === p.departmentId)?.number}
                  </div>
                </div>
                <div style={{ flex: 1, position: 'relative', height: 36, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 4 }}>
                  {tasks.map((t, i) => {
                    const leftPct = (daysBetween(minDate, t.start) / totalDays) * 100;
                    const widthPct = Math.max((daysBetween(t.start, t.finish) / totalDays) * 100, 1.5);
                    return (
                      <div
                        key={t.id}
                        title={`${t.label}\n${t.start} → ${t.finish}\n${t.pct}%`}
                        style={{
                          position: 'absolute',
                          left: `${leftPct}%`,
                          width: `${widthPct}%`,
                          top: 6,
                          height: 24,
                          background: barColors[i % barColors.length],
                          borderRadius: 4,
                          color: 'white',
                          fontSize: 11,
                          display: 'flex',
                          alignItems: 'center',
                          paddingLeft: 6,
                          overflow: 'hidden',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <div
                          style={{
                            position: 'absolute',
                            left: 0,
                            top: 0,
                            bottom: 0,
                            width: `${t.pct}%`,
                            background: 'rgba(0,0,0,0.35)',
                            borderRadius: '4px 0 0 4px',
                          }}
                        />
                        <span style={{ position: 'relative', zIndex: 1 }}>{t.label} {t.pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view === 'list' && (
        <div style={{ flex: 1, padding: 16, overflow: 'auto' }}>
          <h2>Tasks</h2>
          <div style={{ marginBottom: 12, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={() => setListMode('current')} style={{ fontWeight: listMode === 'current' ? 'bold' : 'normal', padding: '6px 12px' }}>Current View</button>
            <button onClick={() => setListMode('compare')} style={{ fontWeight: listMode === 'compare' ? 'bold' : 'normal', padding: '6px 12px' }}>Compare Baselines</button>
            <select value={listFilterPerson} onChange={(e) => setListFilterPerson(e.target.value)}>
              <option value="">All People</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select value={listFilterPhase} onChange={(e) => setListFilterPhase(e.target.value)}>
              <option value="">All Phases</option>
              {phases.map((p) => <option key={p.id} value={p.id}>{p.data.label}</option>)}
            </select>
            {listMode === 'compare' && (
              <>
                <select value={baselineA} onChange={(e) => setBaselineA(e.target.value)}>
                  <option value="">— Baseline A —</option>
                  {baselines.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.date})</option>)}
                </select>
                <select value={baselineB} onChange={(e) => setBaselineB(e.target.value)}>
                  <option value="">— Baseline B —</option>
                  {baselines.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.date})</option>)}
                </select>
              </>
            )}
          </div>

          {listMode === 'current' ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f1f5f9' }}>
                  <th style={{ textAlign: 'left', padding: 6 }}>Task</th>
                  <th style={{ textAlign: 'left', padding: 6 }}>Person</th>
                  <th style={{ textAlign: 'right', padding: 6 }}>Hours</th>
                  <th style={{ textAlign: 'right', padding: 6 }}>%</th>
                  <th style={{ textAlign: 'left', padding: 6 }}>Start</th>
                  <th style={{ textAlign: 'left', padding: 6 }}>Finish</th>
                  <th style={{ textAlign: 'right', padding: 6 }}>Cost</th>
                </tr>
              </thead>
              <tbody>
                {filteredListTasks.map((t) => {
                  const person = people.find((p) => p.id === t.personId);
                  const rate = getRate(t.personId);
                  const cost = rate * t.hours * (person?.defaultAllocation ?? 1);
                  return (
                    <tr key={t.id} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: 6 }}>{t.label}</td>
                      <td style={{ padding: 6 }}>{person?.name ?? '—'}</td>
                      <td style={{ padding: 6, textAlign: 'right' }}>{t.hours}</td>
                      <td style={{ padding: 6, textAlign: 'right' }}>{t.pct}%</td>
                      <td style={{ padding: 6 }}>{t.start}</td>
                      <td style={{ padding: 6 }}>{t.finish}</td>
                      <td style={{ padding: 6, textAlign: 'right' }}>${cost.toFixed(0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f1f5f9' }}>
                  <th style={{ textAlign: 'left', padding: 6 }}>Task</th>
                  <th style={{ textAlign: 'left', padding: 6 }}>Person</th>
                  <th style={{ textAlign: 'right', padding: 6 }}>Hours</th>
                  <th style={{ textAlign: 'right', padding: 6 }}>%</th>
                  <th style={{ textAlign: 'left', padding: 6 }}>Finish</th>
                  <th style={{ textAlign: 'right', padding: 6 }}>Cost</th>
                  {blA && blB && (
                    <>
                      <th style={{ textAlign: 'left', padding: 6 }}>A Finish</th>
                      <th style={{ textAlign: 'left', padding: 6 }}>B Finish</th>
                      <th style={{ textAlign: 'right', padding: 6 }}>Finish Δ</th>
                      <th style={{ textAlign: 'right', padding: 6 }}>A Cost</th>
                      <th style={{ textAlign: 'right', padding: 6 }}>B Cost</th>
                      <th style={{ textAlign: 'right', padding: 6 }}>Cost Δ</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredListTasks.map((t) => {
                  const person = people.find((p) => p.id === t.personId);
                  const rate = getRate(t.personId);
                  const cost = rate * t.hours * (person?.defaultAllocation ?? 1);
                  const aTask = blA?.tasks.find((bt) => bt.id === t.id);
                  const bTask = blB?.tasks.find((bt) => bt.id === t.id);
                  const aCost = aTask ? rate * aTask.hours * (person?.defaultAllocation ?? 1) : 0;
                  const bCost = bTask ? rate * bTask.hours * (person?.defaultAllocation ?? 1) : 0;
                  const finishDelta = aTask && bTask ? daysBetween(aTask.finish, bTask.finish) : 0;
                  const costDelta = bCost - aCost;
                  return (
                    <tr key={t.id} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: 6 }}>{t.label}</td>
                      <td style={{ padding: 6 }}>{person?.name ?? '—'}</td>
                      <td style={{ padding: 6, textAlign: 'right' }}>{t.hours}</td>
                      <td style={{ padding: 6, textAlign: 'right' }}>{t.pct}%</td>
                      <td style={{ padding: 6 }}>{t.finish}</td>
                      <td style={{ padding: 6, textAlign: 'right' }}>${cost.toFixed(0)}</td>
                      {blA && blB && (
                        <>
                          <td style={{ padding: 6 }}>{aTask?.finish ?? '—'}</td>
                          <td style={{ padding: 6 }}>{bTask?.finish ?? '—'}</td>
                          <td style={{ padding: 6, textAlign: 'right', color: finishDelta > 0 ? '#dc2626' : finishDelta < 0 ? '#16a34a' : '#666' }}>
                            {aTask && bTask ? (finishDelta > 0 ? '+' : '') + finishDelta : '—'}
                          </td>
                          <td style={{ padding: 6, textAlign: 'right' }}>{aTask ? `$${aCost.toFixed(0)}` : '—'}</td>
                          <td style={{ padding: 6, textAlign: 'right' }}>{bTask ? `$${bCost.toFixed(0)}` : '—'}</td>
                          <td style={{ padding: 6, textAlign: 'right', color: costDelta > 0 ? '#dc2626' : costDelta < 0 ? '#16a34a' : '#666' }}>
                            {aTask && bTask ? (costDelta > 0 ? '+' : '') + `$${costDelta.toFixed(0)}` : '—'}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          <p style={{ marginTop: 12 }}>Total Cost: ${totalCost.toFixed(0)}</p>

          {baselines.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <h3>Saved Baselines</h3>
              {baselines.map((b) => (
                <div key={b.id} style={{ fontSize: 13, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12, padding: '6px 8px', background: '#f8fafc', borderRadius: 4 }}>
                  <span style={{ flex: 1 }}>
                    <strong>{b.name}</strong> — created {b.date} ({b.tasks.length} tasks)
                  </span>
                  <button onClick={() => setDeleteConfirm({ type: 'baseline', id: b.id })} style={{ background: '#dc2626', color: 'white', fontSize: 12 }}>Delete</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {view === 'templates' && (
        <div style={{ flex: 1, padding: 16 }}>
          <h2>Task Templates</h2>
          {templates.map((tmpl) => (
            <div key={tmpl.id} style={{ marginBottom: 8 }}>
              <input value={tmpl.name} onChange={(e) => setTemplates((ts) => ts.map((x) => x.id === tmpl.id ? { ...x, name: e.target.value } : x))} />
              <input type="number" value={tmpl.estimatedHours} onChange={(e) => setTemplates((ts) => ts.map((x) => x.id === tmpl.id ? { ...x, estimatedHours: Number(e.target.value) } : x))} style={{ width: 60, marginLeft: 8 }} />
              hours
            </div>
          ))}
          <button onClick={() => setTemplates((ts) => [...ts, { id: `tmpl-${nextId++}`, name: 'New', estimatedHours: 8 }])}>+ Template</button>
        </div>
      )}

      {view === 'people' && (
        <div style={{ flex: 1, padding: 16 }}>
          <h2>People</h2>
          {people.map((p) => (
            <div key={p.id} style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input value={p.name} onChange={(e) => setPeople((ps) => ps.map((x) => x.id === p.id ? { ...x, name: e.target.value } : x))} style={{ width: 120 }} />
              <select value={p.departmentId} onChange={(e) => setPeople((ps) => ps.map((x) => x.id === p.id ? { ...x, departmentId: e.target.value } : x))}>
                {departments.map((d) => <option key={d.id} value={d.id}>Dept {d.number}</option>)}
              </select>
              <input type="number" min="0" max="100" value={(p.defaultAllocation * 100).toFixed(0)} onChange={(e) => setPeople((ps) => ps.map((x) => x.id === p.id ? { ...x, defaultAllocation: Number(e.target.value) / 100 } : x))} style={{ width: 60 }} />
              <span>% alloc</span>
              <input type="date" value={p.startDate || ''} onChange={(e) => setPeople((ps) => ps.map((x) => x.id === p.id ? { ...x, startDate: e.target.value } : x))} />
              <span>start</span>
            </div>
          ))}
          <button onClick={() => setPeople((ps) => [...ps, { id: `p-${nextId++}`, name: 'New', departmentId: departments[0]?.id || '', defaultAllocation: 1, startDate: todayStr() }])}>+ Person</button>
        </div>
      )}

      {view === 'departments' && (
        <div style={{ flex: 1, padding: 16 }}>
          <h2>Departments</h2>
          {departments.map((d) => (
            <div key={d.id} style={{ marginBottom: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
              <input value={d.number} onChange={(e) => setDepartments((ds) => ds.map((x) => x.id === d.id ? { ...x, number: e.target.value } : x))} style={{ width: 80 }} />
              <span>rate $</span>
              <input type="number" value={d.rate} onChange={(e) => setDepartments((ds) => ds.map((x) => x.id === d.id ? { ...x, rate: Number(e.target.value) } : x))} style={{ width: 80 }} />
              /h
            </div>
          ))}
          <button onClick={() => setDepartments((ds) => [...ds, { id: `d-${nextId++}`, number: '999', rate: 75 }])}>+ Department</button>
        </div>
      )}

      {baselineModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', padding: 24, borderRadius: 8, minWidth: 300 }}>
            <h3>Cut Baseline</h3>
            <input
              value={baselineName}
              onChange={(e) => setBaselineName(e.target.value)}
              placeholder="Baseline name"
              style={{ width: '100%', padding: 8, margin: '12px 0' }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setBaselineModal(false)}>Cancel</button>
              <button onClick={confirmCutBaseline} style={{ background: '#4a6cf7', color: 'white' }}>Create</button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', padding: 24, borderRadius: 8, minWidth: 280 }}>
            <h3>Confirm Delete</h3>
            <p>
              {deleteConfirm.type === 'node' && 'Delete selected item and all children?'}
              {deleteConfirm.type === 'edge' && 'Delete selected link?'}
              {deleteConfirm.type === 'baseline' && 'Delete this baseline?'}
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button onClick={() => performDelete(deleteConfirm.type, deleteConfirm.id)} style={{ background: '#dc2626', color: 'white' }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}