import { useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";
import { motion, useMotionValue } from "motion/react";
import type { CardPosition, Note } from "../domain";
import { firstImage } from "../images";
import { preview, when } from "./util";

type Props = {
  note: Note;
  index: number;
  color: string;
  position?: CardPosition;
  boardRef: RefObject<HTMLElement>;
  onOpen: () => void;
  onPlace: (position: CardPosition) => Promise<boolean>;
};

export function clampOffset(offset: number, origin: number, itemSize: number, boardSize: number) {
  return Math.min(Math.max(offset, -origin), Math.max(-origin, boardSize - origin - itemSize));
}

export function DraggableCard({ note, index, color, position, boardRef, onOpen, onPlace }: Props) {
  const cardRef = useRef<HTMLButtonElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const suppressClick = useRef(false);
  const image = firstImage(note.rich);
  const text = preview(note);

  // Saved coordinates are relative to the board, so sorting and column changes do not move placed cards.
  const alignTo = (saved?: CardPosition) => {
    const board = boardRef.current;
    const card = cardRef.current;
    if (!board || !card) return;
    const originX = card.offsetLeft;
    const originY = card.offsetTop;
    x.set(clampOffset(saved ? saved.x - originX : 0, originX, card.offsetWidth, board.clientWidth));
    y.set(clampOffset(saved ? saved.y - originY : 0, originY, card.offsetHeight, board.clientHeight));
  };
  useLayoutEffect(() => {
    let observer: ResizeObserver | undefined;
    let cancelled = false;
    const attach = () => {
      if (cancelled) return;
      const board = boardRef.current;
      const card = cardRef.current;
      if (!board || !card) return;
      const keepVisible = () => alignTo(position);
      observer = new ResizeObserver(keepVisible);
      observer.observe(board);
      observer.observe(card);
      keepVisible();
    };
    attach();
    // On Home → board, child layout effects can run before the new board's ref is attached.
    if (!observer) queueMicrotask(attach);
    return () => { cancelled = true; observer?.disconnect(); };
  });

  const place = async () => {
    const board = boardRef.current;
    const card = cardRef.current;
    if (!board || !card) return;
    if (!await onPlace({ x: card.offsetLeft + x.get(), y: card.offsetTop + y.get(), z: Date.now() % 2_000_000_000 })) alignTo(position);
  };

  return (
    <motion.button ref={cardRef} className={`db-card ${color}`} type="button"
      aria-label={`Open ${note.title}. Drag to move; Alt plus arrow keys also move this card.`}
      aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight"
      onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } onOpen(); }}
      onKeyDown={e => {
        if (!e.altKey || note.deletedAt !== null) return;
        const step = e.shiftKey ? 80 : 24;
        const delta = e.key === "ArrowLeft" ? [-step, 0] : e.key === "ArrowRight" ? [step, 0] : e.key === "ArrowUp" ? [0, -step] : e.key === "ArrowDown" ? [0, step] : null;
        if (!delta) return;
        e.preventDefault();
        const board = boardRef.current;
        const card = cardRef.current;
        if (!board || !card) return;
        x.set(clampOffset(x.get() + delta[0], card.offsetLeft, card.offsetWidth, board.clientWidth));
        y.set(clampOffset(y.get() + delta[1], card.offsetTop, card.offsetHeight, board.clientHeight));
        void place();
      }}
      drag={note.deletedAt === null}
      dragConstraints={boardRef}
      dragElastic={0}
      dragMomentum={false}
      onDragStart={() => { suppressClick.current = true; cardRef.current?.classList.add("is-dragging"); }}
      onDragEnd={() => { cardRef.current?.classList.remove("is-dragging"); window.setTimeout(() => { suppressClick.current = false; }, 400); void place(); }}
      style={{ x, y, zIndex: position?.z ?? 0 }}
      initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
      whileHover={{ rotate: index % 2 ? 0.5 : -0.5 }} transition={{ type: "spring", stiffness: 380, damping: 30 }}>
      <b>{note.title}</b>
      {image && <img className="db-thumb" src={image} alt="" />}
      {(text || (!note.body.trim() && !note.checklist.length && !image)) && <span className="db-pre">{text || "Empty note"}</span>}
      {note.checklist.length > 0 && <span className="db-prog" aria-label={`${note.checklist.filter(c => c.done).length} of ${note.checklist.length} done`}>{note.checklist.map(c => <i key={c.id} className={c.done ? "d" : ""} />)}</span>}
      <time>{note.folder && <em className="db-fold">{note.folder.replace(/\//g, " / ")}</em>}{when(note.updatedAt)}</time>
    </motion.button>
  );
}
