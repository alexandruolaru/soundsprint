import { useEffect, useState } from "react";

export function useDominantColor(imageUrl?: string) {
  const [color, setColor] = useState<string>("rgba(15, 23, 42, 0.65)"); 

  useEffect(() => {
    if (!imageUrl) return;

    let cancelled = false;

    const img = new Image();
    img.crossOrigin = "anonymous"; 
    img.src = imageUrl;

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const w = 32;
        const h = 32;
        canvas.width = w;
        canvas.height = h;

        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h).data;

        let r = 0, g = 0, b = 0;
        let count = 0;

        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3];
          if (a < 20) continue; 
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          count++;
        }

        if (!count) return;

        r = Math.round(r / count);
        g = Math.round(g / count);
        b = Math.round(b / count);

        const tint = `rgba(${r}, ${g}, ${b}, 0.55)`;

        if (!cancelled) setColor(tint);
      } catch {
  
      }
    };

    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  return color;
}
