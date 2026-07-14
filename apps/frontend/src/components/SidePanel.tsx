import React from "react";
import styles from "./SidePanel.module.css";
import { TickNode, TickLink } from "./graph/canvasRenderer";

interface SidePanelProps {
  nodeId: string | null;
  nodes: TickNode[];
  links: TickLink[];
  onClose: () => void;
}

export default function SidePanel({
  nodeId,
  nodes,
  links,
  onClose,
}: SidePanelProps) {
  if (!nodeId) return null;

  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return null;

  const outgoing = links
    .filter((l) => l.source === nodeId)
    .map((l) => {
      return nodes.find((n) => n.id === l.target);
    })
    .filter(Boolean) as TickNode[];

  const incoming = links
    .filter((l) => l.target === nodeId)
    .map((l) => {
      return nodes.find((n) => n.id === l.source);
    })
    .filter(Boolean) as TickNode[];

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <h2 className={styles.title}>{node.name}</h2>
          <button
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close inspector panel"
            title="Close inspector"
          >
            ×
          </button>
        </div>
        <div className={styles.path}>{node.id}</div>
        <div className={styles.stats}>
          <span className={styles.badge}>{node.type.toUpperCase()}</span>
          <span className={styles.badge}>
            {(node.size / 1024).toFixed(1)} KB
          </span>
        </div>
      </div>

      <div className={styles.content}>
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Imports ({outgoing.length})</h3>
          <ul className={styles.list}>
            {outgoing.map((n) => (
              <li key={n.id} className={styles.listItem}>
                {n.name}
              </li>
            ))}
            {outgoing.length === 0 && <li className={styles.empty}>None</li>}
          </ul>
        </div>

        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>
            Imported By ({incoming.length})
          </h3>
          <ul className={styles.list}>
            {incoming.map((n) => (
              <li key={n.id} className={styles.listItem}>
                {n.name}
              </li>
            ))}
            {incoming.length === 0 && <li className={styles.empty}>None</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
