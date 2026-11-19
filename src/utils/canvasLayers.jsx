import React, { useRef, useEffect } from 'react';

// 표준 다이어리 규격 캔버스 해상도 (모든 디바이스 공통 가상 뷰포트)
export const CANONICAL_WIDTH = 360;
export const CANONICAL_HEIGHT = 520;

// 기존 데이터에 layerOrder가 없는 경우 순차적인 생성 순서 부여 & 레거시 좌표 정규화
export function normalizeDiaryLayers(diary) {
  let order = 1;
  let strokes = (diary?.strokes || []).map((s) => ({
    ...s,
    layerOrder: typeof s.layerOrder === 'number' ? s.layerOrder : order++,
  }));
  let textBlocks = (diary?.textBlocks || []).map((t) => ({
    ...t,
    layerOrder: typeof t.layerOrder === 'number' ? t.layerOrder : order++,
  }));
  let stickers = (diary?.stickers || []).map((st) => ({
    ...st,
    layerOrder: typeof st.layerOrder === 'number' ? st.layerOrder : order++,
  }));

  // 레거시 데이터 호환: 과거 PC 넓은 화면(>380px)에서 작성되어 좌표가 벗어난 경우 360x520 영역 내로 비율 자동 보정
  let maxX = 0;
  strokes.forEach((s) => s.points?.forEach((p) => { if (p?.x > maxX) maxX = p.x; }));
  stickers.forEach((st) => { if (st?.x > maxX) maxX = st.x; });
  textBlocks.forEach((tb) => { if (tb?.x > maxX) maxX = tb.x; });

  if (maxX > 380) {
    const scaleFactor = 330 / maxX;
    strokes = strokes.map((s) => ({
      ...s,
      size: Math.max(1, Number((s.size * scaleFactor).toFixed(1))),
      points: s.points?.map((p) => ({
        x: Math.round(p.x * scaleFactor),
        y: Math.round(p.y * scaleFactor),
      })),
    }));
    stickers = stickers.map((st) => ({
      ...st,
      x: Math.round(st.x * scaleFactor),
      y: Math.round(st.y * scaleFactor),
      scale: Math.max(0.4, Number(((st.scale || 1) * scaleFactor).toFixed(2))),
    }));
    textBlocks = textBlocks.map((tb) => ({
      ...tb,
      x: Math.round((tb.x || 0) * scaleFactor),
      y: Math.round((tb.y || 0) * scaleFactor),
      fontSize: Math.max(12, Math.round((tb.fontSize || 20) * scaleFactor)),
    }));
  }

  const allOrders = [
    ...strokes.map((s) => s.layerOrder || 0),
    ...textBlocks.map((t) => t.layerOrder || 0),
    ...stickers.map((st) => st.layerOrder || 0),
  ];
  const maxOrder = allOrders.length > 0 ? Math.max(...allOrders) : 0;
  return { strokes, textBlocks, stickers, maxOrder };
}

// 생성 순서(layerOrder)에 따라 드로잉 획들을 밴드 단위로 묶어 스티커/텍스트와 정확한 레이어 순서로 교차 렌더링
export function buildStrokeBands(activeStrokes = [], textBlocks = [], stickers = []) {
  if (!Array.isArray(activeStrokes) || activeStrokes.length === 0) return [];

  const indexedStrokes = activeStrokes.map((s, idx) => ({
    ...s,
    layerOrder: typeof s.layerOrder === 'number' ? s.layerOrder : idx + 1,
  }));

  const erasers = indexedStrokes
    .filter((s) => s.tool === 'eraser')
    .sort((a, b) => a.layerOrder - b.layerOrder);

  const drawStrokes = indexedStrokes
    .filter((s) => s.tool !== 'eraser')
    .sort((a, b) => a.layerOrder - b.layerOrder);

  if (drawStrokes.length === 0) return [];

  const domOrders = [
    ...(textBlocks || []).map((t) => (typeof t.layerOrder === 'number' ? t.layerOrder : 0)),
    ...(stickers || []).map((st) => (typeof st.layerOrder === 'number' ? st.layerOrder : 0)),
  ]
    .filter((o) => o > 0)
    .sort((a, b) => a - b);

  const rawBands = [];
  let currentBand = null;

  drawStrokes.forEach((stroke) => {
    if (!currentBand) {
      currentBand = {
        layerOrder: stroke.layerOrder,
        maxOrder: stroke.layerOrder,
        strokes: [stroke],
      };
      rawBands.push(currentBand);
    } else {
      const hasInterveningDomObject = domOrders.some(
        (o) => o > currentBand.maxOrder && o < stroke.layerOrder
      );
      if (hasInterveningDomObject) {
        currentBand = {
          layerOrder: stroke.layerOrder,
          maxOrder: stroke.layerOrder,
          strokes: [stroke],
        };
        rawBands.push(currentBand);
      } else {
        currentBand.strokes.push(stroke);
        currentBand.maxOrder = Math.max(currentBand.maxOrder, stroke.layerOrder);
      }
    }
  });

  return rawBands.map((band, idx) => {
    const applicableErasers = erasers.filter((e) => e.layerOrder > band.layerOrder);
    const operations = [...band.strokes, ...applicableErasers].sort(
      (a, b) => a.layerOrder - b.layerOrder
    );
    return {
      id: `band-${band.layerOrder}-${idx}`,
      layerOrder: band.layerOrder,
      operations,
    };
  });
}

export function StrokeBandCanvas({ band }) {
  const bandCanvasRef = useRef(null);

  useEffect(() => {
    const canvas = bandCanvasRef.current;
    if (!canvas) return;

    const renderBand = () => {
      const rect = canvas.getBoundingClientRect();
      const currentW = rect.width;
      const currentH = rect.height;
      if (currentW === 0 || currentH === 0) return;

      const dpr = window.devicePixelRatio || 1;
      const targetW = Math.round(currentW * dpr);
      const targetH = Math.round(currentH * dpr);

      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      const ctx = canvas.getContext('2d');
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.scale(
        dpr * (currentW / CANONICAL_WIDTH),
        dpr * (currentH / CANONICAL_HEIGHT)
      );

      (band?.operations || []).forEach((stroke) => {
        if (!stroke?.points || stroke.points.length < 2) return;
        ctx.save();
        ctx.beginPath();

        if (stroke.tool === 'eraser') {
          ctx.globalCompositeOperation = 'destination-out';
          ctx.lineWidth = stroke.size;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
        } else if (stroke.tool === 'highlighter') {
          ctx.globalCompositeOperation = 'source-over';
          ctx.strokeStyle = stroke.color;
          ctx.lineWidth = stroke.size;
          ctx.globalAlpha = 0.35;
          ctx.lineCap = 'square';
        } else {
          ctx.globalCompositeOperation = 'source-over';
          ctx.strokeStyle = stroke.color;
          ctx.lineWidth = stroke.size;
          ctx.globalAlpha = stroke.tool === 'pencil' ? 0.8 : 1.0;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
        }

        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i++) {
          const midPoint = {
            x: (stroke.points[i - 1].x + stroke.points[i].x) / 2,
            y: (stroke.points[i - 1].y + stroke.points[i].y) / 2,
          };
          ctx.quadraticCurveTo(
            stroke.points[i - 1].x,
            stroke.points[i - 1].y,
            midPoint.x,
            midPoint.y
          );
        }
        ctx.stroke();
        ctx.restore();
      });

      ctx.restore();
    };

    renderBand();
    const ro = new ResizeObserver(() => renderBand());
    ro.observe(canvas.parentElement || canvas);
    return () => ro.disconnect();
  }, [band]);

  return (
    <canvas
      ref={bandCanvasRef}
      style={{
        zIndex: band.layerOrder,
      }}
      className="absolute inset-0 w-full h-full pointer-events-none block"
    />
  );
}
