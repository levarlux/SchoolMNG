"use client";

import { useEffect, useRef } from "react";

interface AnimatedGradientProps {
  className?: string;
  colors?: string[];
  speed?: number;
}

export function AnimatedGradient({
  className = "",
  colors = ["#3b82f6", "#8b5cf6", "#ec4899", "#06b6d4", "#10b981"],
  speed = 0.5,
}: AnimatedGradientProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let time = 0;

    const resize = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };

    resize();
    window.addEventListener("resize", resize);

    const hexToRgb = (hex: string) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result
        ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16),
          }
        : { r: 0, g: 0, b: 0 };
    };

    const rgbColors = colors.map(hexToRgb);

    const animate = () => {
      time += speed * 0.01;

      const width = canvas.offsetWidth;
      const height = canvas.offsetHeight;

      // Create multiple gradient points that move
      const gradients: { x: number; y: number; radius: number; color: { r: number; g: number; b: number }; alpha: number }[] = [];

      for (let i = 0; i < rgbColors.length; i++) {
        const angle = (i / rgbColors.length) * Math.PI * 2 + time;
        const radius = 0.3 + Math.sin(time * 0.7 + i) * 0.1;

        gradients.push({
          x: width * (0.5 + Math.cos(angle) * radius),
          y: height * (0.5 + Math.sin(angle) * radius),
          radius: Math.max(width, height) * 0.8,
          color: rgbColors[i],
          alpha: 0.15 + Math.sin(time + i) * 0.05,
        });
      }

      // Clear and draw
      ctx.clearRect(0, 0, width, height);

      // Base gradient
      const baseGradient = ctx.createLinearGradient(0, 0, width, height);
      baseGradient.addColorStop(0, "rgba(15, 23, 42, 0.02)");
      baseGradient.addColorStop(1, "rgba(15, 23, 42, 0.05)");
      ctx.fillStyle = baseGradient;
      ctx.fillRect(0, 0, width, height);

      // Animated gradient blobs
      for (const g of gradients) {
        const gradient = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, g.radius);
        gradient.addColorStop(0, `rgba(${g.color.r}, ${g.color.g}, ${g.color.b}, ${g.alpha})`);
        gradient.addColorStop(1, `rgba(${g.color.r}, ${g.color.g}, ${g.color.b}, 0)`);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
      }

      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationId);
    };
  }, [colors, speed]);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 w-full h-full ${className}`}
      style={{ pointerEvents: "none" }}
    />
  );
}
