import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./BrainGraph.css";

function hashText(value) {
  let hash = 2166136261;
  for (const char of String(value || "")) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

function buildNodes(memories) {
  const nodes = memories.map((memory, index) => {
    const seed = hashText(memory.id || memory.title || index);
    const angle = (seed % 360) * Math.PI / 180;
    const radius = 65 + ((seed >>> 8) % 330);
    return {
      ...memory,
      x: 500 + Math.cos(angle) * radius,
      y: 390 + Math.sin(angle) * radius * 0.72,
      tags: Array.isArray(memory.tags) ? memory.tags.map(tag => String(tag).toLowerCase()) : []
    };
  });

  const edges = [];
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i];
      const b = nodes[j];
      const sharedTags = a.tags.filter(tag => b.tags.includes(tag)).length;
      const wordsA = new Set(String(a.title || a.content || "").toLowerCase().match(/[a-z0-9\u00c0-\u024f]{4,}/g) || []);
      const wordsB = new Set(String(b.title || b.content || "").toLowerCase().match(/[a-z0-9\u00c0-\u024f]{4,}/g) || []);
      let overlap = 0;
      for (const word of wordsA) if (wordsB.has(word)) overlap += 1;
      if (sharedTags > 0 || overlap >= 2) edges.push({ from: a.id, to: b.id, strength: sharedTags + overlap * 0.35 });
    }
  }
  return { nodes, edges };
}

export default function BrainGraph({ onBack }) {
  const [memories, setMemories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef(null);

  const loadMemories = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/brain/memories?limit=250", { credentials: "same-origin", cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Gagal memuat memori.");
      setMemories(Array.isArray(data.memories) ? data.memories : []);
    } catch (err) {
      setError(err.message || "Gagal memuat Second Brain.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadMemories(); }, [loadMemories]);

  const graph = useMemo(() => buildNodes(memories), [memories]);
  const nodeById = useMemo(() => new Map(graph.nodes.map(node => [node.id, node])), [graph.nodes]);
  const visibleLabels = zoom >= 1.35;

  const handleWheel = event => {
    event.preventDefault();
    setZoom(current => Math.max(0.55, Math.min(3.2, current * (event.deltaY < 0 ? 1.12 : 0.89))));
  };
  const handlePointerDown = event => {
    if (event.target.closest?.(".brain-graph-node")) return;
    dragRef.current = { x: event.clientX - offset.x, y: event.clientY - offset.y };
    setDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const handlePointerMove = event => {
    if (!dragRef.current) return;
    setOffset({ x: event.clientX - dragRef.current.x, y: event.clientY - dragRef.current.y });
  };
  const handlePointerUp = () => { dragRef.current = null; setDragging(false); };
  const resetView = () => { setZoom(1); setOffset({ x: 0, y: 0 }); setSelected(null); };

  return (
    <section className="second-brain" aria-label="Second Brain graph">
      <header className="brain-fullscreen-header">
        <button type="button" className="brain-back-button" onClick={onBack} aria-label="Kembali ke AXMchat">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
        </button>
        <span className="brain-small-title">Second Brain</span>
      </header>

      <svg className={`brain-graph-canvas ${dragging ? "is-dragging" : ""}`} viewBox="0 0 1000 780" preserveAspectRatio="xMidYMid meet"
        onWheel={handleWheel} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp}>
        <g transform={`translate(${offset.x} ${offset.y}) translate(500 390) scale(${zoom}) translate(-500 -390)`}>
          {graph.edges.map((edge, index) => {
            const from = nodeById.get(edge.from);
            const to = nodeById.get(edge.to);
            if (!from || !to) return null;
            return <line key={`${edge.from}-${edge.to}-${index}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y}
              className="brain-graph-edge" style={{ opacity: Math.min(.5, .12 + edge.strength * .07) }} />;
          })}
          {graph.nodes.map((node, index) => (
            <g key={node.id || index} className={`brain-graph-node ${selected?.id === node.id ? "selected" : ""}`}
              role="button" tabIndex={0} aria-label={node.title || "Memori tanpa tajuk"}
              onClick={event => { event.stopPropagation(); setSelected(node); }}
              onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(node); } }}>
              <circle cx={node.x} cy={node.y} r={selected?.id === node.id ? 9 : 5.2} className="brain-node-halo" />
              <circle cx={node.x} cy={node.y} r={selected?.id === node.id ? 4.8 : 2.8} className="brain-node-core" />
              {visibleLabels && <text x={node.x + 11} y={node.y - 10} className="brain-node-label">{node.title || "Memori tanpa tajuk"}</text>}
            </g>
          ))}
        </g>
      </svg>

      {loading && <div className="brain-graph-state" role="status">Memuat memori…</div>}
      {!loading && memories.length === 0 && !error && (
        <div className="brain-graph-state"><strong>Belum ada memori</strong><span>Memori yang disimpan akan muncul di sini.</span></div>
      )}
      {error && <div className="brain-graph-error" role="alert">{error}</div>}

      {selected && (
        <aside className="brain-memory-detail" aria-label="Butiran memori">
          <div className="brain-memory-detail-top">
            <div><span>MEMORY NODE</span><h3>{selected.title || "Memori tanpa tajuk"}</h3></div>
            <button type="button" onClick={() => setSelected(null)} aria-label="Tutup butiran">×</button>
          </div>
          <p>{selected.content}</p>
          <div className="brain-memory-detail-meta">
            <span>{selected.type || "memory"}</span>
            <span>{selected.updated ? new Date(selected.updated).toLocaleString() : "Tarikh tidak tersedia"}</span>
            {selected.tags?.length > 0 && <span>{selected.tags.join(" · ")}</span>}
          </div>
        </aside>
      )}
    </section>
  );
}
