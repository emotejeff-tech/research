'use client'

import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Handle,
  type Node,
  type Edge,
  Position,
  MarkerType,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  Brain,
  Search,
  FileText,
  ShieldCheck,
  Sparkles,
  Flag,
  Link2,
} from 'lucide-react'
import { useOrchestrator, type Phase } from '@/lib/orchestrator-store'

type NodeKind =
  | 'coordinator'
  | 'subquery'
  | 'source'
  | 'synthesis'
  | 'critic'
  | 'evolution'
  | 'final'

const KIND_META: Record<
  NodeKind,
  { color: string; glow: string; icon: typeof Brain; label: string }
> = {
  coordinator: { color: '#34d399', glow: 'glow-emerald', icon: Brain, label: 'Coordinator' },
  subquery: { color: '#5eead4', glow: '', icon: Search, label: 'Sub-query' },
  source: { color: '#94a3b8', glow: '', icon: Link2, label: 'Source' },
  synthesis: { color: '#fbbf24', glow: 'glow-amber', icon: FileText, label: 'Synthesis' },
  critic: { color: '#fb7185', glow: 'glow-rose', icon: ShieldCheck, label: 'Critic' },
  evolution: { color: '#fb923c', glow: 'glow-amber', icon: Sparkles, label: 'Evolution' },
  final: { color: '#34d399', glow: 'glow-emerald', icon: Flag, label: 'Final' },
}

function AgentNode({ data }: { data: any }) {
  const meta = KIND_META[data.kind as NodeKind]
  const Icon = meta.icon
  const active = data.active
  return (
    <div
      className={`glass glass-hover relative rounded-2xl px-3 py-2 min-w-[150px] max-w-[220px] ${active ? meta.glow : ''}`}
      style={{
        borderColor: active ? meta.color : undefined,
        boxShadow: active ? `0 0 0 1px ${meta.color}, 0 0 26px -6px ${meta.color}` : undefined,
      }}
    >
      {/* Hidden handles so reactflow can connect edges without warnings */}
      <Handle type="target" position={Position.Top} style={{ opacity: 0, width: 1, height: 1 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0, width: 1, height: 1 }} />
      <div className="flex items-center gap-2">
        <span
          className="relative flex h-7 w-7 items-center justify-center rounded-lg"
          style={{ background: `${meta.color}22`, color: meta.color }}
        >
          {active && (
            <span
              className="pulse-ring absolute inset-0 rounded-lg"
              style={{ color: meta.color }}
            />
          )}
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-white/45">
            {meta.label}
          </div>
          <div className="truncate text-xs font-medium text-white/90" title={data.label}>
            {data.label}
          </div>
        </div>
      </div>
    </div>
  )
}

const nodeTypes = { agent: AgentNode }

export default function WorkflowGraph() {
  const {
    phase,
    subQueries,
    sources,
    currentIteration,
    plugin,
    finalReport,
    critiqueRounds,
  } = useOrchestrator()

  const { nodes, edges } = useMemo(() => {
    const ns: Node[] = []
    const es: Edge[] = []
    const colX = 360
    const baseY = 0

    const isActive = (...kinds: NodeKind[]) => {
      const map: Record<Phase, NodeKind[]> = {
        idle: [],
        planning: ['coordinator'],
        discovery: ['subquery', 'source'],
        synthesis: ['synthesis'],
        critique: ['critic'],
        generation: ['evolution'],
        final: ['final'],
        error: [],
      }
      return kinds.some((k) => (map[phase] || []).includes(k))
    }

    // Coordinator
    ns.push({
      id: 'coordinator',
      type: 'agent',
      position: { x: colX, y: baseY },
      data: { kind: 'coordinator', label: 'Coordinator · Planner', active: phase === 'planning' },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
      draggable: false,
    })

    // Subqueries
    const n = Math.max(subQueries.length, 1)
    const subIds: string[] = []
    const subSpacing = 230
    const subY = baseY + 150
    subQueries.forEach((sq, i) => {
      const id = `sq-${i}`
      subIds.push(id)
      const x = colX + (i - (n - 1) / 2) * subSpacing
      ns.push({
        id,
        type: 'agent',
        position: { x, y: subY },
        data: { kind: 'subquery', label: sq, active: phase === 'discovery' },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
        draggable: false,
      })
      es.push({
        id: `e-coord-${id}`,
        source: 'coordinator',
        target: id,
        type: 'smoothstep',
        animated: phase === 'discovery' || phase === 'planning',
        style: { stroke: '#5eead4', strokeWidth: 2 },
      })
    })

    // Sources under each subquery
    let sourcesBlockHeight = 0
    subQueries.forEach((sq, i) => {
      const subId = subIds[i]
      const x = colX + (i - (n - 1) / 2) * subSpacing
      const subSources = sources.filter((s) => s.query === sq)
      subSources.slice(0, 3).forEach((src, j) => {
        const id = `src-${src.id}`
        const y = subY + 120 + j * 64
        sourcesBlockHeight = Math.max(sourcesBlockHeight, y)
        ns.push({
          id,
          type: 'agent',
          position: { x, y },
          data: { kind: 'source', label: src.host || src.title.slice(0, 28), active: phase === 'discovery' },
          sourcePosition: Position.Bottom,
          targetPosition: Position.Top,
          draggable: false,
        })
        es.push({
          id: `e-${subId}-${id}`,
          source: subId,
          target: id,
          type: 'smoothstep',
          style: { stroke: '#64748b', strokeWidth: 1.5 },
        })
      })
    })

    const synthY = Math.max(subY + 150, sourcesBlockHeight + 80)

    // Synthesis (Actor)
    ns.push({
      id: 'synthesis',
      type: 'agent',
      position: { x: colX, y: synthY },
      data: {
        kind: 'synthesis',
        label: `Synthesis · Actor${currentIteration ? ` (i${currentIteration})` : ''}`,
        active: phase === 'synthesis',
      },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
      draggable: false,
    })
    // edges from each subquery to synthesis
    subIds.forEach((sid) => {
      es.push({
        id: `e-${sid}-synth`,
        source: sid,
        target: 'synthesis',
        type: 'smoothstep',
        animated: phase === 'synthesis',
        style: { stroke: '#fbbf24', strokeWidth: 2 },
      })
    })

    // Critic
    const criticY = synthY + 150
    const lastRound = critiqueRounds[critiqueRounds.length - 1]
    const criticLabel =
      critiqueRounds.length === 0
        ? 'Critic · Verifier'
        : `Critic · i${critiqueRounds.length} ${lastRound?.verdict === 'pass' ? '✓' : '↻'}`
    ns.push({
      id: 'critic',
      type: 'agent',
      position: { x: colX, y: criticY },
      data: { kind: 'critic', label: criticLabel, active: phase === 'critique' },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
      draggable: false,
    })
    es.push({
      id: 'e-synth-critic',
      source: 'synthesis',
      target: 'critic',
      type: 'smoothstep',
      animated: phase === 'critique',
      style: { stroke: '#fb7185', strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#fb7185' },
    })
    // loop back edge (revise) — 'default' is the bezier type in reactflow v11
    es.push({
      id: 'e-critic-synth',
      source: 'critic',
      target: 'synthesis',
      type: 'default',
      animated: lastRound?.verdict === 'revise',
      label: lastRound?.verdict === 'revise' ? 'revise' : '',
      labelStyle: { fill: '#fb7185', fontWeight: 600, fontSize: 11 },
      labelBgStyle: { fill: 'rgba(0,0,0,0.4)' },
      style: { stroke: '#fb7185', strokeDasharray: '5 4', strokeWidth: 2 },
    })

    // Evolution
    const evoY = criticY + 150
    ns.push({
      id: 'evolution',
      type: 'agent',
      position: { x: colX, y: evoY },
      data: {
        kind: 'evolution',
        label: plugin ? `Evolution · ${plugin.name}` : 'Evolution · Plugin',
        active: phase === 'generation',
      },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
      draggable: false,
    })
    es.push({
      id: 'e-critic-evo',
      source: 'critic',
      target: 'evolution',
      type: 'smoothstep',
      animated: phase === 'generation',
      style: { stroke: '#fb923c', strokeWidth: 2 },
    })

    // Final
    const finalY = evoY + 150
    ns.push({
      id: 'final',
      type: 'agent',
      position: { x: colX, y: finalY },
      data: { kind: 'final', label: 'Final Report', active: phase === 'final' },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
      draggable: false,
    })
    es.push({
      id: 'e-evo-final',
      source: 'evolution',
      target: 'final',
      type: 'smoothstep',
      animated: phase === 'final',
      style: { stroke: '#34d399', strokeWidth: 2 },
    })

    return { nodes: ns, edges: es }
  }, [phase, subQueries, sources, currentIteration, plugin, critiqueRounds, finalReport])

  return (
    <div className="relative h-[560px] w-full overflow-hidden rounded-2xl">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        proOptions={{ hideAttribution: true }}
        nodesConnectable={false}
        nodesDraggable={false}
        panOnDrag
        zoomOnScroll={false}
        minZoom={0.4}
        maxZoom={1.6}
      >
        <Background color="#ffffff08" gap={28} size={1} />
        <Controls
          showInteractive={false}
          className="!border-white/10 !bg-white/5 !backdrop-blur-md"
        />
        <MiniMap
          nodeColor={(n) => {
            const kind = (n.data as any)?.kind
            const colors: Record<string, string> = {
              coordinator: '#34d399',
              subquery: '#5eead4',
              source: '#94a3b8',
              synthesis: '#a78bfa',
              critic: '#f59e0b',
              evolution: '#ec4899',
              final: '#34d399',
            }
            return colors[kind] || '#64748b'
          }}
          maskColor="rgba(0,0,0,0.4)"
          className="!rounded-lg !border !border-white/10 !bg-black/60"
          pannable
          zoomable
        />
      </ReactFlow>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/40 px-3 py-1 text-[10px] uppercase tracking-widest text-white/60 backdrop-blur"
      >
        Live Execution Graph
      </motion.div>
    </div>
  )
}
