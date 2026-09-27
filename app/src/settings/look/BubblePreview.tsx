import { useEffect, useRef } from 'react';
import { t } from '../../i18n';
import { shorten } from '../../bubbles/pick';
import { drawBubble, measureBubble } from '../../renderer/bubble';
import { accentFor } from '../../stage/sceneFor';
import type { Agent, Look } from '../../types';

const W = 460, H = 132;

/** Dymki w wybranym stylu: krótkie, jak pojawiają się same, i rozwinięte, jak po najechaniu na zwierzaka. */
export function BubblePreview({ look, agent }: { look: Look; agent: Agent }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current, x = c?.getContext('2d');
    if (!c || !x) return;
    const d = devicePixelRatio || 1;
    c.width = W * d; c.height = H * d;
    x.setTransform(d, 0, 0, d, 0, 0);
    x.clearRect(0, 0, W, H);
    const accent = accentFor({ agent, agent_name: null });
    const q = t().look.bubbleQuestion, a = t().look.bubbleAction;
    const short = measureBubble(x, shorten(q), look, 1, d);
    drawBubble(x, 8, 8, shorten(q), 'question', look, 24, 1, d, accent);
    drawBubble(x, 16 + short.w, 8, a, 'action', look, 24, 1, d, accent);
    const wide = measureBubble(x, q, look, 1, d, true);
    drawBubble(x, 8, H - wide.h - 4, q, 'question', look, 24, 1, d, accent, true);
  }, [look.style, look.motion, agent]);
  return <canvas ref={ref} className="bubble-preview" width={W} height={H} style={{ width: `${W}px`, height: `${H}px` }} aria-label={t().look.bubblesTitle} />;
}
