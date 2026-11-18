import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  ArrowLeft, 
  Check, 
  Type, 
  PenTool, 
  Sparkles, 
  LayoutGrid, 
  Plus, 
  Trash2, 
  RotateCw, 
  RotateCcw, 
  Maximize2,
  X
} from 'lucide-react';
import { PEN_TOOLS, PAPER_STYLES, FONTS } from '../constants';
import { subscribeToDecorations } from '../firebase';
import StickerPalette from './StickerPalette';
import PaperSelectModal from './PaperSelectModal';

function isImageAsset(val) {
  if (typeof val !== 'string') return false;
  return (
    val.startsWith('data:') ||
    val.startsWith('http://') ||
    val.startsWith('https://') ||
    val.startsWith('/') ||
    val.startsWith('blob:')
  );
}

// 고정 기본 프리셋 컬러 (검은색, 회색, 흰색, 빨, 주, 노, 초, 파, 남, 보)
const FIXED_PRESET_COLORS = [
  { name: '검은색', value: '#111111' },
  { name: '회색', value: '#888888' },
  { name: '흰색', value: '#ffffff' },
  { name: '빨강', value: '#ef4444' },
  { name: '주황', value: '#f97316' },
  { name: '노랑', value: '#facc15' },
  { name: '초록', value: '#22c55e' },
  { name: '파랑', value: '#3b82f6' },
  { name: '남색', value: '#1e3a8a' },
  { name: '보라', value: '#8b5cf6' },
];

const WEATHER_OPTIONS = [
  { icon: '☀️', label: '맑음' },
  { icon: '⛅️', label: '구름' },
  { icon: '🌧️', label: '비' },
  { icon: '❄️', label: '눈' },
  { icon: '🍃', label: '바람' },
  { icon: '🌙', label: '밤하늘' },
  { icon: '✨', label: '기분좋음' },
  { icon: '☕️', label: '휴식' },
];

const DAY_NAMES_EN = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function getLocalTodayStr() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// 기존 데이터에 layerOrder가 없는 경우 순차적인 생성 순서 부여
export function normalizeDiaryLayers(diary) {
  let order = 1;
  const strokes = (diary?.strokes || []).map((s) => ({
    ...s,
    layerOrder: typeof s.layerOrder === 'number' ? s.layerOrder : order++,
  }));
  const textBlocks = (diary?.textBlocks || []).map((t) => ({
    ...t,
    layerOrder: typeof t.layerOrder === 'number' ? t.layerOrder : order++,
  }));
  const stickers = (diary?.stickers || []).map((st) => ({
    ...st,
    layerOrder: typeof st.layerOrder === 'number' ? st.layerOrder : order++,
  }));
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
      if (rect.width === 0 || rect.height === 0) return;

      const dpr = window.devicePixelRatio || 1;
      const targetW = Math.round(rect.width * dpr);
      const targetH = Math.round(rect.height * dpr);

      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      const ctx = canvas.getContext('2d');
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.scale(dpr, dpr);

      band.operations.forEach((stroke) => {
        if (!stroke.points || stroke.points.length < 2) return;
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
    const observer = new ResizeObserver(() => renderBand());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [band]);

  return (
    <canvas
      ref={bandCanvasRef}
      style={{ zIndex: band.layerOrder }}
      className="absolute inset-0 w-full h-full pointer-events-none block"
    />
  );
}

export default function DiaryCanvas({ diary, onSave, onDelete, onBack }) {
  const initialNormalized = React.useMemo(() => normalizeDiaryLayers(diary), [diary]);
  const layerOrderCounterRef = useRef(initialNormalized.maxOrder);

  const getNextLayerOrder = () => {
    layerOrderCounterRef.current += 1;
    return layerOrderCounterRef.current;
  };
  // 현재 일기 상태 (기본 스티커 없음: '')
  const [title, setTitle] = useState(diary?.title || '');
  const [date, setDate] = useState(diary?.date || getLocalTodayStr());
  const [weather, setWeather] = useState(() => {
    const initial = diary?.weather || diary?.thumbnailMood || '';
    return initial === '☀️' ? '' : initial;
  });
  const [paperStyle, setPaperStyle] = useState(diary?.paperStyle || 'lined');
  
  // 하단 툴바 활성 모드: 'none' | 'text' | 'pen' | 'sticker' | 'paper'
  const [activeToolMode, setActiveToolMode] = useState('pen');

  // 모달 상태
  const [isWeatherOpen, setIsWeatherOpen] = useState(false);
  const [repCategoryTab, setRepCategoryTab] = useState('sticker'); // 'sticker' | 'weather' (마스킹테이프 제외)
  const [isPaperModalOpen, setIsPaperModalOpen] = useState(false);
  const [isStickerPaletteOpen, setIsStickerPaletteOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  // Firestore decorations 목록 (날짜 옆 대표 아이콘 선택용)
  const [decorations, setDecorations] = useState([]);

  useEffect(() => {
    const unsubscribe = subscribeToDecorations((items) => {
      setDecorations(items);
    });
    return () => unsubscribe();
  }, []);

  // 텍스트 블록
  const [textBlocks, setTextBlocks] = useState(initialNormalized.textBlocks);
  const [selectedTextId, setSelectedTextId] = useState(null);

  // 스티커
  const [stickers, setStickers] = useState(initialNormalized.stickers);
  const [selectedStickerId, setSelectedStickerId] = useState(null);

  // 다른 툴(드로잉, 타이핑, 속지 등)로 전환 시 선택된 스티커/글상자 선택 해제
  useEffect(() => {
    if (activeToolMode !== 'sticker') {
      setSelectedStickerId(null);
    }
    if (activeToolMode !== 'text') {
      setSelectedTextId(null);
    }
  }, [activeToolMode]);

  // 펜 드로잉 & 컬러
  const [activePenTool, setActivePenTool] = useState('pen');
  const [penColor, setPenColor] = useState('#111111');
  const [customColor, setCustomColor] = useState('#d97706'); // 사용자가 컬러 피커로 고른 커스텀 색상
  const [penSize, setPenSize] = useState(2.2);
  const [strokesHistory, setStrokesHistory] = useState(initialNormalized.strokes);
  const [historyIndex, setHistoryIndex] = useState(
    initialNormalized.strokes.length ? initialNormalized.strokes.length - 1 : -1
  );

  // diary prop이 변경될 때 (다른 날짜 선택 시) 상태 완벽 동기화
  useEffect(() => {
    if (diary) {
      const normalized = normalizeDiaryLayers(diary);
      layerOrderCounterRef.current = normalized.maxOrder;
      setTitle(diary.title || '');
      setDate(diary.date || getLocalTodayStr());
      const nextWeather = diary.weather || diary.thumbnailMood || '';
      setWeather(nextWeather === '☀️' ? '' : nextWeather);
      setPaperStyle(diary.paperStyle || 'lined');
      setTextBlocks(normalized.textBlocks);
      setStickers(normalized.stickers);
      setStrokesHistory(normalized.strokes);
      setHistoryIndex(normalized.strokes.length ? normalized.strokes.length - 1 : -1);
      setSelectedTextId(null);
      setSelectedStickerId(null);
    }
  }, [diary]);

  // 컬러 피커 인풋 레퍼런스
  const colorPickerInputRef = useRef(null);

  // 레퍼런스
  const editorRootRef = useRef(null);
  const canvasRef = useRef(null);
  const canvasContainerRef = useRef(null);
  const isDrawingRef = useRef(false);
  const currentStrokeRef = useRef(null);

  // 모바일/태블릿 가상 키보드 높이 감지 (툴바가 키보드 위로 올라오도록 오프셋 계산)
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const updateKeyboardPosition = () => {
      const visibleBottom = vv.offsetTop + vv.height;
      const windowDiff = Math.max(0, window.innerHeight - visibleBottom);

      let containerDiff = 0;
      if (editorRootRef.current) {
        const rootRect = editorRootRef.current.getBoundingClientRect();
        containerDiff = Math.max(0, rootRect.bottom - visibleBottom);
      }

      const nextOffset = Math.max(windowDiff, containerDiff);
      setKeyboardOffset(nextOffset > 40 ? nextOffset : 0);
    };

    updateKeyboardPosition();
    vv.addEventListener('resize', updateKeyboardPosition);
    vv.addEventListener('scroll', updateKeyboardPosition);
    window.addEventListener('resize', updateKeyboardPosition);
    window.addEventListener('focusin', updateKeyboardPosition);
    window.addEventListener('focusout', updateKeyboardPosition);

    return () => {
      vv.removeEventListener('resize', updateKeyboardPosition);
      vv.removeEventListener('scroll', updateKeyboardPosition);
      window.removeEventListener('resize', updateKeyboardPosition);
      window.removeEventListener('focusin', updateKeyboardPosition);
      window.removeEventListener('focusout', updateKeyboardPosition);
    };
  }, []);

  // 드래그 및 크기조절/회전 상태
  const [draggingItem, setDraggingItem] = useState(null);
  const [transformingItem, setTransformingItem] = useState(null);

  // 날짜 계산 (2026, 11.17 THU)
  const dateObj = new Date(date + 'T00:00:00');
  const validDate = isNaN(dateObj) ? new Date() : dateObj;
  const yearNum = validDate.getFullYear();
  const monthNum = String(validDate.getMonth() + 1).padStart(2, '0');
  const dayNum = String(validDate.getDate()).padStart(2, '0');
  const dayEn = DAY_NAMES_EN[validDate.getDay()];

  // 활성 입력 오버레이 캔버스 초기화
  const clearOverlayCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }, []);

  // 생성 순서(layerOrder) 기준 드로잉 밴드 계산
  const activeStrokes = React.useMemo(
    () => strokesHistory.slice(0, historyIndex + 1),
    [strokesHistory, historyIndex]
  );

  const strokeBands = React.useMemo(
    () => buildStrokeBands(activeStrokes, textBlocks, stickers),
    [activeStrokes, textBlocks, stickers]
  );

  // 캔버스 크기 업데이트
  const updateCanvasDimensions = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const targetWidth = Math.round(rect.width * dpr);
    const targetHeight = Math.round(rect.height * dpr);

    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      clearOverlayCanvas();
    }
  }, [clearOverlayCanvas]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    updateCanvasDimensions();

    const resizeObserver = new ResizeObserver(() => {
      updateCanvasDimensions();
    });

    resizeObserver.observe(canvas);
    if (canvasContainerRef.current) {
      resizeObserver.observe(canvasContainerRef.current);
    }

    window.addEventListener('resize', updateCanvasDimensions);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateCanvasDimensions);
    };
  }, [updateCanvasDimensions]);

  useEffect(() => {
    const timer = setTimeout(() => {
      updateCanvasDimensions();
    }, 40);
    return () => clearTimeout(timer);
  }, [activeToolMode, updateCanvasDimensions]);

  // 좌표 계산
  const getCoordinates = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
    const clientY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : 0);

    const scaleX = (canvas.width / dpr) / rect.width;
    const scaleY = (canvas.height / dpr) / rect.height;

    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    return { x, y };
  };

  // 드로잉 이벤트
  const handlePointerDown = (e) => {
    if (activeToolMode !== 'pen') return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (e.target.setPointerCapture && e.pointerId) {
      try {
        e.target.setPointerCapture(e.pointerId);
      } catch (err) {}
    }

    const { x, y } = getCoordinates(e);

    isDrawingRef.current = true;
    currentStrokeRef.current = {
      tool: activePenTool,
      color: penColor,
      size: penSize,
      layerOrder: getNextLayerOrder(),
      points: [{ x, y }]
    };
  };

  const handlePointerMove = (e) => {
    if (!isDrawingRef.current || activeToolMode !== 'pen') return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const { x, y } = getCoordinates(e);
    currentStrokeRef.current.points.push({ x, y });

    const ctx = canvas.getContext('2d');
    const pts = currentStrokeRef.current.points;
    if (pts.length < 2) return;

    ctx.save();
    if (activePenTool === 'eraser') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = 'rgba(250, 250, 250, 0.85)';
      ctx.lineWidth = penSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    } else if (activePenTool === 'highlighter') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = penColor;
      ctx.lineWidth = penSize;
      ctx.globalAlpha = 0.35;
      ctx.lineCap = 'square';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = penColor;
      ctx.lineWidth = penSize;
      ctx.globalAlpha = activePenTool === 'pencil' ? 0.8 : 1.0;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }

    ctx.beginPath();
    const p1 = pts[pts.length - 2];
    const p2 = pts[pts.length - 1];
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.restore();
  };

  const handlePointerUp = (e) => {
    if (!isDrawingRef.current || activeToolMode !== 'pen') return;
    isDrawingRef.current = false;

    if (e.target.releasePointerCapture && e.pointerId) {
      try {
        e.target.releasePointerCapture(e.pointerId);
      } catch (err) {}
    }

    clearOverlayCanvas();

    if (currentStrokeRef.current && currentStrokeRef.current.points.length > 1) {
      const newHistory = strokesHistory.slice(0, historyIndex + 1);
      newHistory.push(currentStrokeRef.current);
      setStrokesHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    }
    currentStrokeRef.current = null;
  };

  const handleUndo = () => {
    if (historyIndex >= 0) setHistoryIndex(historyIndex - 1);
  };

  const handleRedo = () => {
    if (historyIndex < strokesHistory.length - 1) setHistoryIndex(historyIndex + 1);
  };

  const handleClearStrokes = () => {
    if (strokesHistory.length === 0) return;
    if (confirm('손글씨와 드로잉을 모두 지우시겠습니까?')) {
      setStrokesHistory([]);
      setHistoryIndex(-1);
    }
  };

  // 컬러 피커에서 새 색상 선택 시
  // (기존 프리셋들은 전혀 변경하지 않고, 오직 customColor와 penColor만 갱신)
  const handleCustomColorChange = (e) => {
    const selectedHex = e.target.value;
    setCustomColor(selectedHex);
    setPenColor(selectedHex);
  };

  // 텍스트 블록 (기본 서체: 개구체, 기본 텍스트 없음, 가로 반응형 90% 및 좌우 마진 5%, 생성 순서 layerOrder 부여)
  const handleAddTextBlock = () => {
    const newId = `t-${Date.now()}`;
    const newBlock = {
      id: newId,
      text: '',
      fontFamily: "'Gaegu', cursive",
      fontSize: 20,
      color: penColor || '#111111',
      x: null,
      y: 20 + textBlocks.length * 40,
      width: '90%',
      rotation: 0,
      scale: 1,
      layerOrder: getNextLayerOrder(),
    };
    setTextBlocks([...textBlocks, newBlock]);
    setSelectedTextId(newId);
    setSelectedStickerId(null);
    setActiveToolMode('text');
  };

  const updateTextBlock = (id, fields) => {
    setTextBlocks(prev => prev.map(t => t.id === id ? { ...t, ...fields } : t));
  };

  const deleteTextBlock = (id) => {
    setTextBlocks(prev => prev.filter(t => t.id !== id));
    if (selectedTextId === id) setSelectedTextId(null);
  };

  // 스티커 (꾸미기 에셋: 날씨, 스티커, 마스킹테이프 - 생성 순서 layerOrder 부여)
  const handleAddSticker = (item) => {
    const newId = `s-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newSticker = {
      id: newId,
      ...item,
      x: 120,
      y: 100,
      rotation: 0,
      scale: 1,
      layerOrder: getNextLayerOrder(),
    };
    setStickers(prev => [...prev, newSticker]);
    setSelectedStickerId(newId);
    setSelectedTextId(null);
    setActiveToolMode('sticker');
  };

  const updateSticker = (id, fields) => {
    setStickers(prev => prev.map(s => s.id === id ? { ...s, ...fields } : s));
  };

  const deleteSticker = (id) => {
    setStickers(prev => prev.filter(s => s.id !== id));
    if (selectedStickerId === id) setSelectedStickerId(null);
  };

  // 드래그 이동 (마우스 및 모바일 터치 지원 - 글상자 및 스티커 상하좌우 이동)
  const handleItemDragStart = (e, type, id, currentX, currentY) => {
    e.stopPropagation();

    const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
    const clientY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : 0);

    let resolvedOrigX = currentX;
    if (typeof resolvedOrigX !== 'number') {
      const boxEl = e.currentTarget.closest('[data-object-box="true"]');
      resolvedOrigX = boxEl
        ? boxEl.offsetLeft
        : Math.round((canvasContainerRef.current?.clientWidth || 340) * 0.05);
    }

    setDraggingItem({
      type,
      id,
      startX: clientX,
      startY: clientY,
      origX: resolvedOrigX,
      origY: currentY || 0,
    });

    if (type === 'text') {
      setSelectedTextId(id);
      setSelectedStickerId(null);
      setActiveToolMode('text');
    } else {
      setSelectedStickerId(id);
      setSelectedTextId(null);
      setActiveToolMode('sticker');
    }
  };

  // 오브젝트(스티커/텍스트) 직접 크기조절(resize) 및 회전(rotate) 시작 핸들러
  const handleTransformStart = (e, mode, itemType, item) => {
    e.stopPropagation();
    if (e.cancelable) e.preventDefault();

    const boxEl = e.currentTarget.closest('[data-object-box="true"]');
    if (!boxEl) return;

    const rect = boxEl.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
    const clientY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : 0);

    const startAngle = Math.atan2(clientY - centerY, clientX - centerX) * (180 / Math.PI);
    const startDist = Math.max(12, Math.hypot(clientX - centerX, clientY - centerY));

    setDraggingItem(null);
    setTransformingItem({
      mode, // 'rotate' | 'resize'
      itemType, // 'sticker' | 'text'
      id: item.id,
      centerX,
      centerY,
      startAngle,
      startDist,
      origRotation: item.rotation || 0,
      origScale: item.scale || 1,
    });

    if (itemType === 'text') {
      setSelectedTextId(item.id);
      setSelectedStickerId(null);
      setActiveToolMode('text');
    } else {
      setSelectedStickerId(item.id);
      setSelectedTextId(null);
      setActiveToolMode('sticker');
    }
  };

  const handleContainerPointerMove = (e) => {
    const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
    const clientY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : 0);

    // 1) 크기 조절 또는 회전 중일 때
    if (transformingItem) {
      if (transformingItem.mode === 'rotate') {
        const currentAngle =
          Math.atan2(clientY - transformingItem.centerY, clientX - transformingItem.centerX) *
          (180 / Math.PI);
        const newRotation = Math.round(
          transformingItem.origRotation + (currentAngle - transformingItem.startAngle)
        );
        if (transformingItem.itemType === 'text') {
          updateTextBlock(transformingItem.id, { rotation: newRotation });
        } else {
          updateSticker(transformingItem.id, { rotation: newRotation });
        }
      } else if (transformingItem.mode === 'resize') {
        const currentDist = Math.hypot(
          clientX - transformingItem.centerX,
          clientY - transformingItem.centerY
        );
        const ratio = currentDist / transformingItem.startDist;
        const newScale = Math.min(
          4.0,
          Math.max(0.35, Number((transformingItem.origScale * ratio).toFixed(2)))
        );
        if (transformingItem.itemType === 'text') {
          updateTextBlock(transformingItem.id, { scale: newScale });
        } else {
          updateSticker(transformingItem.id, { scale: newScale });
        }
      }
      return;
    }

    // 2) 드래그 위치 이동 중일 때 (글상자 및 스티커 모두 상하좌우 자유 이동)
    if (!draggingItem) return;

    const deltaX = clientX - draggingItem.startX;
    const deltaY = clientY - draggingItem.startY;

    const newX = draggingItem.origX + deltaX;
    const newY = Math.max(0, draggingItem.origY + deltaY);

    if (draggingItem.type === 'text') {
      updateTextBlock(draggingItem.id, { x: newX, y: newY });
    } else if (draggingItem.type === 'sticker') {
      updateSticker(draggingItem.id, { x: Math.max(0, newX), y: newY });
    }
  };

  const handleContainerPointerUp = () => {
    if (draggingItem) setDraggingItem(null);
    if (transformingItem) setTransformingItem(null);
  };

  // 저장
  const handleSaveDiary = () => {
    const finalDiary = {
      id: diary?.id || `entry-${date}-${Date.now()}`,
      title: title || `${yearNum}.${monthNum}.${dayNum} 기록`,
      date,
      weather,
      thumbnailMood: weather,
      paperStyle,
      textBlocks,
      stickers,
      strokes: strokesHistory.slice(0, historyIndex + 1),
      summary: textBlocks.map(t => t.text).filter(Boolean).join('\n') || ''
    };

    onSave(finalDiary);
  };

  const currentPaperClass = PAPER_STYLES.find(p => p.id === paperStyle)?.class || 'paper-minimal-lined';
  const selectedText = textBlocks.find(t => t.id === selectedTextId);
  const selectedSticker = stickers.find(s => s.id === selectedStickerId);

  return (
    <div 
      ref={editorRootRef}
      className="flex flex-col h-full bg-[#fafafa] select-none overflow-hidden relative"
      onPointerMove={handleContainerPointerMove}
      onPointerUp={handleContainerPointerUp}
      onTouchMove={handleContainerPointerMove}
      onTouchEnd={handleContainerPointerUp}
    >
      {/* 
        ================================================================
        [상단] 1. 뒤로가기 + Daily Planner 레이블 ─── [ ✔ ] (검은색 원형 완료 버튼)
        ================================================================
      */}
      <div className="px-6 pt-5 pb-2 shrink-0 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <button
            onClick={onBack}
            className="text-black hover:opacity-70 transition p-1 -ml-1"
            title="뒤로가기"
          >
            <ArrowLeft size={22} strokeWidth={2.5} />
          </button>
          <span className="text-xs sm:text-sm font-semibold text-stone-400 tracking-tight">
            Daily Planner
          </span>
        </div>

        {/* 우측 상단: [ ✔ ] 검은색 원형 저장 완료 버튼 */}
        <button
          onClick={handleSaveDiary}
          className="w-11 h-11 rounded-full bg-black hover:bg-stone-800 active:scale-95 text-white transition flex items-center justify-center shadow-xs"
          title="다이어리 저장 완료"
        >
          <Check size={20} strokeWidth={3} />
        </button>
      </div>

      {/* 
        ================================================================
        [상단] 2. 날짜 헤더:
                 2026
                 11.17 THU                  [ ○ ] (날씨/기분 스탬프 원형 버튼)
                 ────────────────────────────────
        ================================================================
      */}
      <div className="px-6 pt-1 pb-3 shrink-0">
        <div className="flex items-end justify-between">
          {/* 날짜 헤더 (탭하면 날짜 변경 가능) */}
          <div className="relative cursor-pointer group" title="날짜 변경">
            <div className="text-base sm:text-lg font-black text-black leading-tight tracking-tight">
              {yearNum}
            </div>

            <div className="text-3xl sm:text-4xl font-black text-black tracking-tight leading-none mt-0.5 group-hover:opacity-75 transition-opacity">
              {monthNum}.{dayNum} {dayEn}
            </div>

            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              title="날짜 변경"
            />
          </div>

          {/* 우측 대표 스티커 아이콘 버튼 (선택 전: 플러스 버튼 / 선택 시: 배경 동그라미 없이 w-11 h-11 스티커 표시) */}
          <div className="relative pb-0.5">
            <button
              type="button"
              onClick={() => setIsWeatherOpen(!isWeatherOpen)}
              className="w-11 h-11 bg-transparent border-0 p-0 active:scale-95 transition flex items-center justify-center"
              title="대표 스티커 선택"
            >
              {weather ? (
                isImageAsset(weather) ? (
                  <img
                    src={weather}
                    alt="대표 아이콘"
                    className="w-11 h-11 object-contain block select-none"
                  />
                ) : (
                  <span className="text-4xl leading-none select-none">{weather}</span>
                )
              ) : (
                <Plus size={24} strokeWidth={2.5} className="text-black" />
              )}
            </button>

            {isWeatherOpen && (
              <div 
                className="absolute right-0 top-full mt-2 bg-white border border-stone-200 rounded-2xl shadow-xl overflow-hidden z-50 w-60 animate-fadeIn"
                onClick={(e) => e.stopPropagation()}
              >
                {/* 카테고리 탭: 스티커 / 날씨 (마스킹테이프 제외) */}
                <div className="flex border-b border-stone-100">
                  <button
                    type="button"
                    onClick={() => setRepCategoryTab('sticker')}
                    className={`flex-1 py-2 text-xs font-medium border-b-2 transition ${
                      repCategoryTab === 'sticker'
                        ? 'border-black font-bold text-black'
                        : 'border-transparent text-stone-400 hover:text-stone-700'
                    }`}
                  >
                    스티커
                  </button>
                  <button
                    type="button"
                    onClick={() => setRepCategoryTab('weather')}
                    className={`flex-1 py-2 text-xs font-medium border-b-2 transition ${
                      repCategoryTab === 'weather'
                        ? 'border-black font-bold text-black'
                        : 'border-transparent text-stone-400 hover:text-stone-700'
                    }`}
                  >
                    날씨
                  </button>
                </div>

                {/* 선택된 탭의 스티커 그리드 */}
                <div className="p-2.5 max-h-60 overflow-y-auto">
                  {decorations.filter((item) => item.category === repCategoryTab).length > 0 ? (
                    <div className="grid grid-cols-4 gap-2">
                      {decorations
                        .filter((item) => item.category === repCategoryTab)
                        .map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              setWeather(item.imageUrl);
                              setIsWeatherOpen(false);
                            }}
                            className={`flex flex-col items-center justify-center p-1.5 rounded-xl hover:bg-stone-100 transition ${
                              weather === item.imageUrl ? 'bg-stone-200/80 font-bold' : ''
                            }`}
                            title={item.name || item.fileName}
                          >
                            <img
                              src={item.imageUrl}
                              alt={item.name || item.category}
                              className="w-9 h-9 object-contain block select-none"
                            />
                          </button>
                        ))}
                    </div>
                  ) : (
                    <p className="text-xs text-stone-400 text-center py-6">
                      등록된 {repCategoryTab === 'weather' ? '날씨' : '스티커'} 항목이 없습니다.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 선명한 블랙 가로 구분선 */}
        <div className="w-full h-[1.5px] bg-black mt-2.5" />
      </div>

      {/* 
        ================================================================
        [본문] 속지의 줄무늬/모눈 배경 컬러는 바탕색(#fafafa) 일체 유지
        ================================================================
      */}
      <div 
        ref={canvasContainerRef}
        onClick={() => {
          if (activeToolMode !== 'pen') {
            setSelectedTextId(null);
            setSelectedStickerId(null);
          }
        }}
        className={`flex-1 mx-4 sm:mx-6 mb-48 sm:mb-52 relative isolate overflow-hidden ${currentPaperClass} transition-colors duration-200`}
      >
        {/* (1-A) 생성 순서(layerOrder)별 드로잉 밴드 캔버스 레이어 */}
        {strokeBands.map((band) => (
          <StrokeBandCanvas key={band.id} band={band} />
        ))}

        {/* (1-B) 현재 그리는 중인 획을 입력받는 최상단 인터랙티브 드로잉 캔버스 */}
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className={`absolute inset-0 w-full h-full block ${
            activeToolMode === 'pen' ? 'cursor-crosshair touch-none' : 'pointer-events-none'
          }`}
          style={{
            zIndex: activeToolMode === 'pen' ? 9999 : 0,
            touchAction: 'none',
          }}
        />

        {/* (2) 텍스트 블록 레이어 (만들어진 순서 layerOrder 기준 zIndex 적용) */}
        {textBlocks.map((block, idx) => {
          const isSelected = selectedTextId === block.id;
          const blockScale = block.scale || 1;
          const blockRotation = block.rotation || 0;
          const invScale = 1 / blockScale;
          const blockZIndex = typeof block.layerOrder === 'number' ? block.layerOrder : idx + 1;

          return (
            <div
              key={block.id}
              data-object-box="true"
              style={{
                left: typeof block.x === 'number' ? `${block.x}px` : '5%',
                top: `${block.y}px`,
                width: '90%',
                zIndex: blockZIndex,
                transform: `rotate(${blockRotation}deg) scale(${blockScale})`,
                transformOrigin: 'center center',
              }}
              className={`absolute select-text transition-shadow ${
                isSelected
                  ? 'ring-1.5 ring-dashed ring-stone-800 bg-white/70 backdrop-blur-2xs rounded-lg p-1.5'
                  : 'p-1'
              }`}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedTextId(block.id);
                setSelectedStickerId(null);
                setActiveToolMode('text');
              }}
            >
              {/* 선택 시 상단 이동 바 및 모서리 직접 조작 핸들(삭제 / 회전 / 크기조절) */}
              {isSelected && (
                <>
                  {/* 상단 드래그 이동 핸들 바 (상하좌우 이동) */}
                  <div
                    onPointerDown={(e) => handleItemDragStart(e, 'text', block.id, block.x, block.y)}
                    onTouchStart={(e) => handleItemDragStart(e, 'text', block.id, block.x, block.y)}
                    style={{ touchAction: 'none' }}
                    className="w-full h-3.5 bg-stone-400/20 hover:bg-stone-400/40 rounded-t cursor-move flex items-center justify-center mb-1 touch-none"
                    title="드래그하여 상하좌우 이동"
                  >
                    <div className="w-7 h-0.5 bg-stone-500 rounded-full" />
                  </div>

                  {/* 좌측 상단: 삭제 버튼 */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteTextBlock(block.id);
                    }}
                    style={{ transform: `scale(${invScale})` }}
                    className="absolute -top-3 -left-3 w-6 h-6 rounded-full bg-stone-800 text-white shadow flex items-center justify-center z-30"
                    title="글상자 삭제"
                  >
                    <X size={12} />
                  </button>

                  {/* 우측 상단: 직접 회전(Rotate) 드래그 핸들 */}
                  <div
                    onPointerDown={(e) => handleTransformStart(e, 'rotate', 'text', block)}
                    onTouchStart={(e) => handleTransformStart(e, 'rotate', 'text', block)}
                    style={{ transform: `scale(${invScale})`, touchAction: 'none' }}
                    className="absolute -top-3 -right-3 w-6 h-6 rounded-full bg-black text-white shadow flex items-center justify-center cursor-grab active:cursor-grabbing z-30 touch-none"
                    title="드래그하여 회전"
                  >
                    <RotateCw size={12} />
                  </div>

                  {/* 우측 하단: 직접 크기조절(Resize) 드래그 핸들 */}
                  <div
                    onPointerDown={(e) => handleTransformStart(e, 'resize', 'text', block)}
                    onTouchStart={(e) => handleTransformStart(e, 'resize', 'text', block)}
                    style={{ transform: `scale(${invScale})`, touchAction: 'none' }}
                    className="absolute -bottom-3 -right-3 w-6 h-6 rounded-full bg-black text-white shadow flex items-center justify-center cursor-nwse-resize z-30 touch-none"
                    title="드래그하여 크기 조절"
                  >
                    <Maximize2 size={12} />
                  </div>
                </>
              )}

              <textarea
                autoFocus={isSelected}
                value={block.text}
                onFocus={() => {
                  setSelectedTextId(block.id);
                  setSelectedStickerId(null);
                  setActiveToolMode('text');
                }}
                onChange={(e) => updateTextBlock(block.id, { text: e.target.value })}
                style={{
                  fontFamily: block.fontFamily || "'Gaegu', cursive",
                  fontSize: `${block.fontSize || 20}px`,
                  color: block.color,
                  lineHeight: '30px', // 줄노트 간격(30px)과 완벽 일치!
                }}
                className="w-full bg-transparent border-0 focus:ring-0 p-0 resize-none overflow-hidden outline-hidden"
                rows={Math.max(2, (block.text || '').split('\n').length)}
              />
            </div>
          );
        })}

        {/* (3) 스티커 / 꾸미기 에셋 레이어 (만들어진 순서 layerOrder 기준 zIndex 적용) */}
        {stickers.map((sticker, idx) => {
          const isSelected = selectedStickerId === sticker.id;
          const stickerScale = sticker.scale || 1;
          const stickerRotation = sticker.rotation || 0;
          const invScale = 1 / stickerScale;
          const stickerZIndex = typeof sticker.layerOrder === 'number' ? sticker.layerOrder : idx + 1;

          return (
            <div
              key={sticker.id}
              data-object-box="true"
              onPointerDown={(e) => handleItemDragStart(e, 'sticker', sticker.id, sticker.x, sticker.y)}
              onTouchStart={(e) => handleItemDragStart(e, 'sticker', sticker.id, sticker.x, sticker.y)}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedStickerId(sticker.id);
                setSelectedTextId(null);
                setActiveToolMode('sticker');
              }}
              style={{
                left: `${sticker.x}px`,
                top: `${sticker.y}px`,
                zIndex: stickerZIndex,
                transform: `rotate(${stickerRotation}deg) scale(${stickerScale})`,
                transformOrigin: 'center center',
                touchAction: 'none',
              }}
              className={`absolute cursor-move select-none touch-none p-1 ${
                isSelected
                  ? 'ring-1.5 ring-dashed ring-stone-800 rounded-lg bg-white/20'
                  : ''
              }`}
            >
              {/* 선택된 스티커 모서리 직접 조작 핸들 (삭제 / 회전 / 크기조절) */}
              {isSelected && (
                <>
                  {/* 좌측 상단: 삭제 버튼 */}
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSticker(sticker.id);
                    }}
                    style={{ transform: `scale(${invScale})` }}
                    className="absolute -top-3 -left-3 w-6 h-6 rounded-full bg-stone-800 text-white shadow flex items-center justify-center z-30"
                    title="스티커 삭제"
                  >
                    <X size={12} />
                  </button>

                  {/* 우측 상단: 직접 회전(Rotate) 드래그 핸들 */}
                  <div
                    onPointerDown={(e) => handleTransformStart(e, 'rotate', 'sticker', sticker)}
                    onTouchStart={(e) => handleTransformStart(e, 'rotate', 'sticker', sticker)}
                    style={{ transform: `scale(${invScale})`, touchAction: 'none' }}
                    className="absolute -top-3 -right-3 w-6 h-6 rounded-full bg-black text-white shadow flex items-center justify-center cursor-grab active:cursor-grabbing z-30 touch-none"
                    title="드래그하여 회전"
                  >
                    <RotateCw size={12} />
                  </div>

                  {/* 우측 하단: 직접 크기조절(Resize) 드래그 핸들 */}
                  <div
                    onPointerDown={(e) => handleTransformStart(e, 'resize', 'sticker', sticker)}
                    onTouchStart={(e) => handleTransformStart(e, 'resize', 'sticker', sticker)}
                    style={{ transform: `scale(${invScale})`, touchAction: 'none' }}
                    className="absolute -bottom-3 -right-3 w-6 h-6 rounded-full bg-black text-white shadow flex items-center justify-center cursor-nwse-resize z-30 touch-none"
                    title="드래그하여 크기 조절"
                  >
                    <Maximize2 size={12} />
                  </div>
                </>
              )}

              {sticker.imageUrl ? (
                <img
                  src={sticker.imageUrl}
                  alt={sticker.label || sticker.category || 'decoration'}
                  draggable={false}
                  className={
                    sticker.category === 'tape' || sticker.type === 'tape'
                      ? 'w-28 h-auto object-contain select-none pointer-events-none block'
                      : 'w-14 h-14 object-contain select-none pointer-events-none block'
                  }
                />
              ) : sticker.type === 'tape' ? (
                <div
                  className="w-28 h-6 rounded shadow-xs relative overflow-hidden"
                  style={{
                    backgroundColor: sticker.color,
                    backgroundImage:
                      sticker.pattern === 'dots'
                        ? 'radial-gradient(rgba(0,0,0,0.15) 1px, transparent 1px)'
                        : sticker.pattern === 'stripes'
                        ? 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(0,0,0,0.08) 4px, rgba(0,0,0,0.08) 8px)'
                        : 'none',
                    backgroundSize: sticker.pattern === 'dots' ? '6px 6px' : 'auto',
                  }}
                >
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-white/40" />
                  <div className="absolute right-0 top-0 bottom-0 w-1 bg-black/10" />
                </div>
              ) : (
                <span className="text-3xl sm:text-4xl filter drop-shadow-xs block leading-none">
                  {sticker.content}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* 
        ================================================================
        [하단 도구 모음 통합 컨테이너 - 두 툴 박스 간격 정확히 10px]
        (모바일 키보드 자판 활성화 시 키보드 높이만큼 자동으로 위로 올라옴)
        ================================================================
      */}
      <div
        style={{ bottom: `${16 + keyboardOffset}px` }}
        className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-40 w-11/12 max-w-md flex flex-col space-y-[10px] pointer-events-none transition-[bottom] duration-150 ease-out"
      >
        
        {/* (1) 위쪽 상세 컨트롤 패널 - 라운드 20px (펜/텍스트/속지 모드일 때만 표시) */}
        {(activeToolMode === 'pen' || activeToolMode === 'text' || activeToolMode === 'paper') && (
        <div className="pointer-events-auto bg-[#f4f4f4]/95 backdrop-blur-md border border-stone-200/70 rounded-[20px] p-3 sm:p-3.5 shadow-md flex flex-col justify-center overflow-visible">
          
          {/* 펜 모드 상세 컨트롤 */}
          {activeToolMode === 'pen' && (
            <div className="flex flex-col space-y-2.5 animate-fadeIn">
              {/* 상단: 펜 종류 & 되돌리기 */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1 bg-white/80 p-0.5 rounded-xl text-xs border border-stone-200/50">
                  {PEN_TOOLS.map(tool => (
                    <button
                      key={tool.id}
                      onClick={() => {
                        setActivePenTool(tool.id);
                        if (tool.size) setPenSize(tool.size);
                      }}
                      className={`px-2.5 py-1 rounded-lg font-medium transition ${
                        activePenTool === tool.id ? 'bg-black text-white shadow-xs font-bold' : 'text-stone-600 hover:text-black'
                      }`}
                    >
                      {tool.name}
                    </button>
                  ))}
                </div>

                <div className="flex items-center space-x-1 text-stone-600">
                  <button 
                    onClick={handleUndo} 
                    disabled={historyIndex < 0}
                    className="p-1.5 rounded-lg hover:bg-white disabled:opacity-30 transition"
                    title="되돌리기"
                  >
                    <RotateCcw size={15} />
                  </button>
                  <button 
                    onClick={handleRedo} 
                    disabled={historyIndex >= strokesHistory.length - 1}
                    className="p-1.5 rounded-lg hover:bg-white disabled:opacity-30 transition"
                    title="다시 실행"
                  >
                    <RotateCw size={15} />
                  </button>
                  <button 
                    onClick={handleClearStrokes} 
                    className="p-1.5 rounded-lg hover:bg-red-50 text-stone-400 hover:text-red-500 transition"
                    title="모두 지우기"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {/* 하단: 스크롤바 없는 완벽한 한 줄 컬러 스와치 & 굵기 슬라이더 */}
              {activePenTool !== 'eraser' && (
                <div className="flex items-center justify-between pt-1 border-t border-stone-200/50">
                  
                  {/* 컬러 스와치 영역 (사이즈 확대 없이 보더 스타일로 선택 표시 & 일렬 반듯 정렬) */}
                  {/* 컬러 스와치 영역 (간격을 오밀조밀하게 좁혀 콤팩트하게 정렬) */}
                  <div className="flex items-center space-x-[3px] overflow-x-auto no-scrollbar py-1">
                    {/* 1. 고정 기본 10대 컬러: 검, 회, 흰, 빨, 주, 노, 초, 파, 남, 보 */}
                    {FIXED_PRESET_COLORS.map((c) => {
                      const isSelected = penColor.toLowerCase() === c.value.toLowerCase();
                      return (
                        <button
                          key={c.value}
                          onClick={() => setPenColor(c.value)}
                          className={`w-5 h-5 rounded-full shrink-0 flex items-center justify-center p-[2px] box-border transition-all ${
                            isSelected
                              ? 'border-2 border-black'
                              : 'border-2 border-transparent hover:opacity-80'
                          }`}
                          title={c.name}
                        >
                          <span
                            className={`w-full h-full rounded-full block ${
                              c.value === '#ffffff' ? 'border border-stone-300' : ''
                            }`}
                            style={{ backgroundColor: c.value }}
                          />
                        </button>
                      );
                    })}

                    {/* 2. 구분 얇은 선 */}
                    <div className="w-[1px] h-3.5 bg-stone-300 shrink-0 mx-0.5" />

                    {/* 3. 내가 컬러피커에서 직접 고른 커스텀 컬러 칩 */}
                    <button
                      onClick={() => setPenColor(customColor)}
                      className={`w-5 h-5 rounded-full shrink-0 flex items-center justify-center p-[2px] box-border transition-all ${
                        penColor.toLowerCase() === customColor.toLowerCase()
                          ? 'border-2 border-black'
                          : 'border-2 border-transparent hover:opacity-80'
                      }`}
                      title={`직접 고른 색상: ${customColor}`}
                    >
                      <span
                        className="w-full h-full rounded-full block shadow-2xs"
                        style={{ backgroundColor: customColor }}
                      />
                    </button>

                    {/* 4. 무지개 컬러 피커 버튼 */}
                    <div className="relative flex items-center shrink-0">
                      <button
                        onClick={() => colorPickerInputRef.current && colorPickerInputRef.current.click()}
                        className="w-5 h-5 rounded-full border border-stone-300 shadow-2xs hover:opacity-80 active:scale-95 transition flex items-center justify-center box-border p-[2px]"
                        style={{
                          background: 'conic-gradient(from 90deg, #ff0000, #ff8000, #ffff00, #00ff00, #00ffff, #0000ff, #8000ff, #ff0080, #ff0000)'
                        }}
                        title="컬러 차트에서 색상 직접 선택"
                      >
                        <div className="w-1.5 h-1.5 rounded-full bg-white/80" />
                      </button>

                      {/* 보이지 않는 시스템 컬러 인풋 */}
                      <input
                        ref={colorPickerInputRef}
                        type="color"
                        value={customColor}
                        onChange={handleCustomColorChange}
                        className="opacity-0 absolute inset-0 w-full h-full cursor-pointer pointer-events-none"
                      />
                    </div>
                  </div>

                  {/* 굵기 조절 */}
                  <div className="flex items-center space-x-1.5 shrink-0 pl-1">
                    <span className="text-[10px] text-stone-500 font-medium">굵기</span>
                    <input
                      type="range"
                      min={activePenTool === 'highlighter' ? 8 : 1}
                      max={activePenTool === 'highlighter' ? 32 : 8}
                      value={penSize}
                      onChange={(e) => setPenSize(Number(e.target.value))}
                      className="w-14 sm:w-16 accent-black cursor-pointer"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 타이핑 모드 상세 컨트롤 */}
          {activeToolMode === 'text' && (
            <div className="flex items-center justify-between animate-fadeIn text-xs">
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleAddTextBlock}
                  className="flex items-center space-x-1.5 bg-black text-white px-3 py-1.5 rounded-xl hover:bg-stone-800 transition font-medium shadow-2xs"
                >
                  <Plus size={14} />
                  <span>글상자 추가</span>
                </button>

                {selectedText && (
                  <div className="flex items-center space-x-1.5 border-l border-stone-300 pl-2">
                    <select
                      value={selectedText.fontFamily}
                      onChange={(e) => updateTextBlock(selectedText.id, { fontFamily: e.target.value })}
                      className="bg-white rounded-lg border border-stone-200 px-2 py-1 text-xs cursor-pointer outline-hidden"
                    >
                      {FONTS.map(f => (
                        <option key={f.id} value={f.family}>{f.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <span className="text-[11px] text-stone-400">
                원하는 곳으로 드래그
              </span>
            </div>
          )}

          {/* 속지 모드 상세 컨트롤 */}
          {activeToolMode === 'paper' && (
            <div className="flex items-center justify-between animate-fadeIn text-xs">
              <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar w-full">
                {PAPER_STYLES.map(style => (
                  <button
                    key={style.id}
                    onClick={() => setPaperStyle(style.id)}
                    className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-medium transition ${
                      paperStyle === style.id
                        ? 'bg-black text-white shadow-2xs'
                        : 'bg-white/80 text-stone-700 hover:bg-white border border-stone-200/50'
                    }`}
                  >
                    {style.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        )}

        {/* (2) 아래쪽 아이콘 독 툴박스 - 라운드 20px (위 박스와 정확히 10px 간격 유지) */}
        <div className="pointer-events-auto bg-[#f4f4f4]/95 backdrop-blur-md border border-stone-200/80 rounded-[20px] px-7 py-3.5 shadow-md flex items-center justify-between">
          
          {/* 1. 타이핑 아이콘 (Type) */}
          <button
            onClick={() => {
              setSelectedStickerId(null);
              setActiveToolMode(activeToolMode === 'text' ? 'none' : 'text');
            }}
            className={`p-1.5 rounded-full transition-all ${
              activeToolMode === 'text'
                ? 'text-black scale-110'
                : 'text-stone-400 hover:text-stone-700'
            }`}
            title="타이핑"
          >
            <Type size={21} strokeWidth={activeToolMode === 'text' ? 2.6 : 2} />
          </button>

          {/* 2. 손글씨/펜 아이콘 (PenTool) */}
          <button
            onClick={() => {
              setSelectedStickerId(null);
              setSelectedTextId(null);
              setActiveToolMode(activeToolMode === 'pen' ? 'none' : 'pen');
            }}
            className={`p-1.5 rounded-full transition-all ${
              activeToolMode === 'pen'
                ? 'text-black scale-110'
                : 'text-stone-400 hover:text-stone-700'
            }`}
            title="손글씨/펜"
          >
            <PenTool size={20} strokeWidth={activeToolMode === 'pen' ? 2.6 : 2} />
          </button>

          {/* 3. 스티커 아이콘 (Sparkles) - 클릭 시 드로잉 모드를 해제하고 즉시 스티커 선택 팝업 열기 */}
          <button
            onClick={() => {
              setSelectedTextId(null);
              setActiveToolMode('sticker');
              setIsStickerPaletteOpen(true);
            }}
            className={`p-1.5 rounded-full transition-all ${
              activeToolMode === 'sticker' || isStickerPaletteOpen
                ? 'text-black scale-110'
                : 'text-stone-400 hover:text-stone-700'
            }`}
            title="스티커 꾸미기"
          >
            <Sparkles size={21} strokeWidth={activeToolMode === 'sticker' || isStickerPaletteOpen ? 2.6 : 2} />
          </button>

          {/* 4. 속지 아이콘 (LayoutGrid) */}
          <button
            onClick={() => {
              setSelectedStickerId(null);
              setSelectedTextId(null);
              setActiveToolMode(activeToolMode === 'paper' ? 'none' : 'paper');
            }}
            className={`p-1.5 rounded-full transition-all ${
              activeToolMode === 'paper'
                ? 'text-black scale-110'
                : 'text-stone-400 hover:text-stone-700'
            }`}
            title="속지 설정"
          >
            <LayoutGrid size={20} strokeWidth={activeToolMode === 'paper' ? 2.6 : 2} />
          </button>

          {/* 5. 일기 삭제 휴지통 아이콘 (Trash2) */}
          <button
            onClick={() => setIsDeleteModalOpen(true)}
            className="p-1.5 rounded-full transition-all text-stone-400 hover:text-red-500 active:scale-95"
            title="일기 삭제"
          >
            <Trash2 size={20} strokeWidth={2} />
          </button>
        </div>

      </div>

      {/* 일기 삭제 확인 팝업 모달 */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white w-full max-w-xs sm:max-w-sm rounded-3xl shadow-2xl border border-stone-200 p-6 flex flex-col items-center text-center">
            <h3 className="text-base sm:text-lg font-black text-black tracking-tight">
              삭제하시겠습니까?
            </h3>
            <p className="text-xs sm:text-sm text-stone-500 mt-2 leading-relaxed">
              작성 중인 일기가 영구적으로 삭제되며 복구할 수 없습니다.
            </p>
            <div className="flex items-center space-x-2.5 w-full mt-6">
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                className="flex-1 py-2.5 px-3 rounded-xl border border-stone-200 bg-stone-100 hover:bg-stone-200 active:scale-95 text-stone-700 text-xs font-bold transition"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  if (onDelete) {
                    onDelete(diary?.id);
                  } else if (onBack) {
                    onBack();
                  }
                }}
                className="flex-1 py-2.5 px-3 rounded-xl bg-black hover:bg-stone-800 active:scale-95 text-white text-xs font-bold transition shadow-xs"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 스티커 보관함 모달 */}
      <StickerPalette
        isOpen={isStickerPaletteOpen}
        onClose={() => setIsStickerPaletteOpen(false)}
        onAddSticker={handleAddSticker}
      />

      {/* 속지 선택 팝업 모달 */}
      <PaperSelectModal
        isOpen={isPaperModalOpen}
        onClose={() => setIsPaperModalOpen(false)}
        selectedStyle={paperStyle}
        onSelectStyle={setPaperStyle}
      />
    </div>
  );
}
