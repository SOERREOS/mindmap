'use client';
import { useEffect, useRef } from 'react';

interface Star {
  x: number; y: number; size: number;
  opacity: number; baseOpacity: number;
  phase: number; speed: number;
  vx: number; vy: number;
}

export default function StarField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -9999, y: -9999 });
  const starsRef = useRef<Star[]>([]);
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

    const COUNT = 160;
    starsRef.current = Array.from({ length: COUNT }, () => {
      const base = Math.random() * 0.45 + 0.05;
      return {
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        size: Math.random() * 1.4 + 0.2,
        opacity: base, baseOpacity: base,
        phase: Math.random() * Math.PI * 2,
        speed: Math.random() * 0.008 + 0.003,
        vx: 0, vy: 0,
      };
    });

    const onMove = (e: MouseEvent) => { mouseRef.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener('mousemove', onMove);

    let t = 0;
    const draw = () => {
      t += 1;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      starsRef.current.forEach(star => {
        // Twinkle
        star.opacity = star.baseOpacity + Math.sin(t * star.speed + star.phase) * 0.15;

        // Mouse repulsion (gentle)
        const dx = star.x - mouseRef.current.x;
        const dy = star.y - mouseRef.current.y;
        const dist2 = dx * dx + dy * dy;
        if (dist2 < 14400) { // 120px radius
          const dist = Math.sqrt(dist2);
          const force = (120 - dist) / 120 * 0.018;
          star.vx += (dx / dist) * force;
          star.vy += (dy / dist) * force;
        }

        star.vx *= 0.94;
        star.vy *= 0.94;
        star.x += star.vx;
        star.y += star.vy;

        // Wrap
        if (star.x < 0) star.x = canvas.width;
        if (star.x > canvas.width) star.x = 0;
        if (star.y < 0) star.y = canvas.height;
        if (star.y > canvas.height) star.y = 0;

        // Draw
        const op = Math.max(0, Math.min(1, star.opacity));
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${op})`;
        ctx.fill();
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
      style={{ zIndex: 0, mixBlendMode: 'screen', opacity: 0.7 }}
    />
  );
}
