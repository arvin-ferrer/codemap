import React, { useState, useEffect, useRef } from 'react';
import styles from './SearchBar.module.css';
import { TickNode } from './GraphVisualizer';

interface SearchBarProps {
  nodes: TickNode[];
  onSelectNode: (nodeId: string) => void;
}

export default function SearchBar({ nodes, onSelectNode }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const results = query
    ? nodes.filter(n => n.name.toLowerCase().includes(query.toLowerCase())).slice(0, 10)
    : [];

  return (
    <div className={styles.container} ref={containerRef}>
      <input
        type="text"
        className={styles.input}
        placeholder="Search files..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
      />
      {isOpen && results.length > 0 && (
        <ul className={styles.dropdown}>
          {results.map(n => (
            <li
              key={n.id}
              className={styles.resultItem}
              onClick={() => {
                setQuery('');
                setIsOpen(false);
                onSelectNode(n.id);
              }}
            >
              <div className={styles.resultName}>{n.name}</div>
              <div className={styles.resultPath}>{n.id}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
