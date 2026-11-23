import React, { useRef, useEffect } from 'react';
import { PRESET_GIF_STICKERS } from '../constants/presetGifStickers';

// 표준 다이어리 규격 캔버스 해상도 (모든 디바이스 공통 가상 뷰포트)
export const CANONICAL_WIDTH = 360;
export const CANONICAL_HEIGHT = 520;

// 스티커 에셋 캐시 맵 (ID, 이름, 파일명으로 이미지 URL 복원)
let cachedStickersMap = null;
let lastStickerCacheTimestamp = 0;

export function getKnownStickersMap(forceRefresh = false) {
  const now = Date.now();
  if (cachedStickersMap && !forceRefresh && now - lastStickerCacheTimestamp < 3000) {
    return cachedStickersMap;
  }
  const map = new Map();

  // 1. 프리셋 GIF 및 애니메이션 스티커
  try {
    if (Array.isArray(PRESET_GIF_STICKERS)) {
      PRESET_GIF_STICKERS.forEach((item) => {
        if (!item || !item.imageUrl) return;
        if (item.id) map.set(item.id, item.imageUrl);
        if (item.name) map.set(item.name, item.imageUrl);
        if (item.label) map.set(item.label, item.imageUrl);
      });
    }
  } catch {}

  // 2. 사용자가 직접 등록한 MY 스티커 (로컬스토리지 analog_my_stickers)
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = localStorage.getItem('analog_my_stickers');
      if (raw) {
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          list.forEach((item) => {
            if (!item || !item.imageUrl) return;
            if (item.id) map.set(item.id, item.imageUrl);
            if (item.name) map.set(item.name, item.imageUrl);
            if (item.fileName) map.set(item.fileName, item.imageUrl);
            if (item.label) map.set(item.label, item.imageUrl);
            if (item.name && typeof item.name === 'string') {
              const clean = item.name.replace(/\.[^/.]+$/, '').trim();
              if (clean) map.set(clean, item.imageUrl);
            }
            if (item.fileName && typeof item.fileName === 'string') {
              const clean = item.fileName.replace(/\.[^/.]+$/, '').trim();
              if (clean) map.set(clean, item.imageUrl);
            }
          });
        }
      }
    }
  } catch {}

  cachedStickersMap = map;
  lastStickerCacheTimestamp = now;
  return map;
}

/**
 * 스티커의 실제 이미지 URL을 확인 및 복원(hydration).
 * 용량 초과로 imageUrl이 비어있는 경우에도 analog_my_stickers 및 프리셋에서 찾아 복구
 */
export function resolveStickerImage(st) {
  if (!st || typeof st !== 'object') return '';
  if (typeof st.imageUrl === 'string' && st.imageUrl.trim().length > 0) {
    return st.imageUrl.trim();
  }
  const map = getKnownStickersMap();
  const keysToTry = [
    st.decorationId,
    st.id,
    st.name,
    st.fileName,
    st.label,
  ].filter((k) => typeof k === 'string' && k.trim().length > 0);

  for (const key of keysToTry) {
    const cleanKey = key.trim();
    if (map.has(cleanKey)) {
      return map.get(cleanKey);
    }
    const noExt = cleanKey.replace(/\.[^/.]+$/, '').trim();
    if (map.has(noExt)) {
      return map.get(noExt);
    }
  }
  return '';
}

/**
 * 스티커가 순수 이모지/날씨 텍스트인지 판별.
 * 이미지 스티커의 파일명/라벨(예: "moomi")이 화면에 큰 텍스트로 노출되는 현상을 원천 방지
 */
export function isEmojiSticker(st) {
  if (!st || typeof st !== 'object') return false;
  // 이미지 스티커 관련 속성이 있거나 테이프인 경우 절대 이모지가 아님
  if (
    st.imageUrl ||
    st.decorationId ||
    st.category === 'sticker' ||
    st.category === 'my' ||
    st.category === 'gif' ||
    st.category === 'character' ||
    st.category === 'emotion' ||
    st.category === 'daily' ||
    st.type === 'sticker' ||
    st.type === 'tape' ||
    st.isGif
  ) {
    return false;
  }
  if (st.type === 'emoji' || st.isEmoji === true) {
    return true;
  }
  const val = st.content || st.icon;
  if (typeof val === 'string' && val.length > 0 && val.length <= 4) {
    // 영문/숫자 단어(예: "moomi", "cat", "dog", "moo|")는 라벨이므로 텍스트로 렌더링하지 않음
    if (/^[a-zA-Z0-9_\-|\s]+$/.test(val)) {
      return false;
    }
    return true;
  }
  return false;
}

// 기존 데이터에 layerOrder가 없는 경우 순차적인 생성 순서 부여 & 레거시 좌표 정규화 & 스티커 이미지 복원
export function normalizeDiaryLayers(diary) {
  if (!diary || typeof diary !== 'object') {
    return { strokes: [], textBlocks: [], stickers: [], maxOrder: 0 };
  }

  const toSafeArray = (items) => {
    if (!items) return [];
    if (Array.isArray(items)) return items.filter(item => item && typeof item === 'object');
    if (typeof items === 'object') return Object.values(items).filter(item => item && typeof item === 'object');
    return [];
  };

  let order = 1;
  let strokes = toSafeArray(diary.strokes).map((s) => ({
    ...s,
    layerOrder: typeof s.layerOrder === 'number' ? s.layerOrder : order++,
  }));
  let textBlocks = toSafeArray(diary.textBlocks).map((t) => ({
    ...t,
    layerOrder: typeof t.layerOrder === 'number' ? t.layerOrder : order++,
  }));
  let stickers = toSafeArray(diary.stickers).map((st) => {
    const resolvedUrl = resolveStickerImage(st);
    return {
      ...st,
      imageUrl: resolvedUrl || st.imageUrl || '',
      layerOrder: typeof st.layerOrder === 'number' ? st.layerOrder : order++,
    };
  });

  // 레거시 데이터 호환: 과거 PC 넓은 화면(>380px)에서 작성되어 좌표가 벗어난 경우 360x520 영역 내로 비율 자동 보정
  let maxX = 0;
  strokes.forEach((s) => s.points?.forEach((p) => { if (p?.x > maxX) maxX = p.x; }));
  stickers.forEach((st) => { if (st?.x > maxX) maxX = st.x; });
  textBlocks.forEach((tb) => { if (tb?.x > maxX) maxX = tb.x; });

  if (maxX > 380) {
    const scaleFactor = 330 / maxX;
    strokes = strokes.map((s) => ({
      ...s,
      size: Math.max(1, Number(((s.size || 2) * scaleFactor).toFixed(1))),
      points: s.points?.map((p) => ({
        x: Math.round(p.x * scaleFactor),
        y: Math.round(p.y * scaleFactor),
      })),
    }));
    stickers = stickers.map((st) => ({
      ...st,
      x: Math.round((st.x || 0) * scaleFactor),
      y: Math.round((st.y || 0) * scaleFactor),
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
      // 반응형 가로·세로 찌그러짐 방지: 가로 너비 기준의 균일 정비율(Uniform Scaling) 적용
      const uniformScale = currentW > 0 ? currentW / CANONICAL_WIDTH : 1;
      ctx.scale(
        dpr * uniformScale,
        dpr * uniformScale
      );

      (band?.operations || []).forEach((stroke) => {
        if (!stroke?.points || stroke.points.length === 0) return;
        ctx.save();

        if (stroke.tool === 'eraser') {
          ctx.globalCompositeOperation = 'destination-out';
          ctx.strokeStyle = '#000000';
          ctx.fillStyle = '#000000';
          ctx.lineWidth = stroke.size;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
        } else if (stroke.tool === 'highlighter') {
          ctx.globalCompositeOperation = 'source-over';
          ctx.strokeStyle = stroke.color;
          ctx.fillStyle = stroke.color;
          ctx.lineWidth = stroke.size;
          ctx.globalAlpha = 0.35;
          ctx.lineCap = 'square';
        } else {
          ctx.globalCompositeOperation = 'source-over';
          ctx.strokeStyle = stroke.color;
          ctx.fillStyle = stroke.color;
          ctx.lineWidth = stroke.size;
          ctx.globalAlpha = stroke.tool === 'pencil' ? 0.8 : 1.0;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
        }

        const pts = stroke.points;
        if (pts.length === 1) {
          ctx.beginPath();
          ctx.arc(pts[0].x, pts[0].y, Math.max(1, stroke.size / 2), 0, Math.PI * 2);
          ctx.fill();
        } else if (pts.length === 2) {
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          ctx.lineTo(pts[1].x, pts[1].y);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length - 1; i++) {
            const xc = (pts[i].x + pts[i + 1].x) / 2;
            const yc = (pts[i].y + pts[i + 1].y) / 2;
            ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
          }
          const lastIdx = pts.length - 1;
          ctx.quadraticCurveTo(
            pts[lastIdx - 1].x,
            pts[lastIdx - 1].y,
            pts[lastIdx].x,
            pts[lastIdx].y
          );
          ctx.stroke();
        }

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
