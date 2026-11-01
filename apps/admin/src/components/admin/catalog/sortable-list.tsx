"use client";

import { useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Lightweight reorderable list: HTML5 drag-and-drop on desktop plus up/down buttons for
 * keyboard and touch users. Calls `onReorder` with the new id order after each move.
 */
export function SortableList<T>({
  items,
  getId,
  renderItem,
  onReorder,
  disabled,
  className,
}: {
  items: T[];
  getId: (item: T) => string;
  renderItem: (item: T, index: number) => ReactNode;
  onReorder: (ids: string[]) => void | Promise<unknown>;
  disabled?: boolean;
  className?: string;
}) {
  const [order, setOrder] = useState(items);
  const [sourceItems, setSourceItems] = useState(items);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  // Re-sync when the server sends a new list (adjusting state during render, per React docs).
  if (sourceItems !== items) {
    setSourceItems(items);
    setOrder(items);
  }

  function commit(next: T[]) {
    setOrder(next);
    void onReorder(next.map(getId));
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= order.length || from === to) return;
    const next = [...order];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    commit(next);
  }

  return (
    <ul className={cn("grid gap-2", className)}>
      {order.map((item, index) => {
        const id = getId(item);
        return (
          <li
            key={id}
            draggable={!disabled}
            onDragStart={(e) => {
              setDragId(id);
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", id);
            }}
            onDragOver={(e) => {
              if (!dragId) return;
              e.preventDefault();
              setOverId(id);
            }}
            onDragLeave={() => setOverId((o) => (o === id ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              const from = order.findIndex((x) => getId(x) === dragId);
              setDragId(null);
              setOverId(null);
              if (from >= 0) move(from, index);
            }}
            onDragEnd={() => {
              setDragId(null);
              setOverId(null);
            }}
            className={cn(
              "flex items-center gap-2 rounded-xl border border-border bg-card p-2 pr-3 transition-colors",
              dragId === id && "opacity-50",
              overId === id && dragId !== id && "border-gold ring-1 ring-gold/50",
            )}
          >
            <span className="hidden cursor-grab text-muted-foreground active:cursor-grabbing sm:block" aria-hidden>
              <GripVertical className="size-4" />
            </span>
            <div className="flex flex-col">
              <Button type="button" variant="ghost" size="icon-xs" disabled={disabled || index === 0} onClick={() => move(index, index - 1)} aria-label="Move up">
                <ArrowUp />
              </Button>
              <Button type="button" variant="ghost" size="icon-xs" disabled={disabled || index === order.length - 1} onClick={() => move(index, index + 1)} aria-label="Move down">
                <ArrowDown />
              </Button>
            </div>
            <div className="min-w-0 flex-1">{renderItem(item, index)}</div>
          </li>
        );
      })}
    </ul>
  );
}
