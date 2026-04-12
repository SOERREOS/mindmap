'use client';
import { useEffect, useRef } from 'react';

interface Point {
  x: number; y: number; size: number;
  opacity: number; baseOpacity: number;
  phase: number; speed: number;
  vx: number; vy: number;
  color: string;
}

export default function NetworkBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -9999, y: -9999 });
  const pointsRef = useRef<Point[]>([]);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const COUNT = 100;
    const colors = ['#4dd0e1', '#c084fc', '#4ade80', '#fb923c'];
    pointsRef.current = Array.from({ length: COUNT }, () => {
      const base = Math.random() * 0.4 + 0.1;
      return {
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        size: Math.random() * 2.0 + 0.5,
        opacity: base, baseOpacity: base,
        phase: Math.random() * Math.PI * 2,
        speed: Math.random() * 0.006 + 0.002,
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.15,
        color: colors[Math.floor(Math.random() * colors.length)],
      };
    });

    const onMove = (e: MouseEvent) => { mouseRef.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener('mousemove', onMove);

    let t = 0;
    const draw = () => {
      t += 1;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const points = pointsRef.current;

      // Draw background Arcs
      ctx.lineWidth = 0.6;
      ctx.strokeStyle = 'rgba(100,200,255,0.04)';
      points.slice(0, 3).forEach((p, i) => {
         ctx.beginPath();
         ctx.arc(p.x, p.y, 400 + i * 200, 0, Math.PI * 2);
         ctx.stroke();
      });

      // Draw lines
      ctx.lineWidth = 0.5;
      for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
           const dx = points[i].x - points[j].x;
           const dy = points[i].y - points[j].y;
           const dist2 = dx * dx + dy * dy;
           if (dist2 < 25000) { // 158px
             const op = (1 - Math.sqrt(dist2) / 158) * 0.08;
             ctx.strokeStyle = `rgba(180,220,255,${op})`;
             ctx.beginPath();
             ctx.moveTo(points[i].x, points[i].y);
             ctx.lineTo(points[j].x, points[j].y);
             ctx.stroke();
           }
        }
      }

      points.forEach(p => {
        p.opacity = p.baseOpacity + Math.sin(t * p.speed + p.phase) * 0.1;
        p.x += p.vx; p.y += p.vy;

        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        const op = Math.max(0, Math.min(1, p.opacity));
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${op})`;
        ctx.fill();
        
        // Aura
        if (p.size > 1.8) {
           ctx.beginPath();
           ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
           ctx.fillStyle = `${p.color}11`;
           ctx.fill();
        }
      });

      rafRef.current = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0, mixBlendMode: 'screen', opacity: 0.8 }}
    />
  );
}
