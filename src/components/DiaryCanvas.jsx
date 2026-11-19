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
  X,
  AlignLeft,
  AlignCenter,
  AlignRight
} from 'lucide-react';
import { PEN_TOOLS, PAPER_STYLES, FONTS } from '../constants';
import { PRESET_GIF_STICKERS } from '../constants/presetGifStickers';
import { subscribeToDecorations } from '../firebase';
import { 
  normalizeDiaryLayers, 
  buildStrokeBands, 
  StrokeBandCanvas, 
  CANONICAL_WIDTH, 
  CANONICAL_HEIGHT 
} from '../utils/canvasLayers';
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

function getEventClientCoords(e) {
  if (e.touches && e.touches.length > 0) {
    return { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
  }
  if (e.clientX !== undefined && e.clientY !== undefined) {
    return { clientX: e.clientX, clientY: e.clientY };
  }
  return { clientX: 0, clientY: 0 };
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
    return diary?.weather || diary?.thumbnailMood || '';
  });
  const [paperStyle, setPaperStyle] = useState(diary?.paperStyle || 'lined');
  
  // 하단 툴바 활성 모드: 'none' | 'text' | 'pen' | 'sticker' | 'paper'
  const [activeToolMode, setActiveToolMode] = useState('pen');

  // 모달 상태
  const [isWeatherOpen, setIsWeatherOpen] = useState(false);
  const [repCategoryTab, setRepCategoryTab] = useState('weather'); // 날짜 옆에는 날씨 먼저 표시 (하단 툴과 차별화)
  const [isPaperModalOpen, setIsPaperModalOpen] = useState(false);
  const [isStickerPaletteOpen, setIsStickerPaletteOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

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

  // 인스타그램 스토리 스타일 텍스트 입력 에디터 상태
  const [isStoryTextOpen, setIsStoryTextOpen] = useState(false);
  const [editingTextId, setEditingTextId] = useState(null);
  const [editingText, setEditingText] = useState('');
  const [editingFont, setEditingFont] = useState("'Gaegu', cursive");
  const [editingSize, setEditingSize] = useState(24);
  const [editingColor, setEditingColor] = useState('#111111');
  const [editingAlign, setEditingAlign] = useState('center'); // 'left' | 'center' | 'right'
  const [editingBgStyle, setEditingBgStyle] = useState('none'); // 'none' | 'light' | 'dark' | 'color'
  const storyTextareaRef = useRef(null);

  // 스토리 텍스트 에디터 열릴 때 오토포커스
  useEffect(() => {
    if (isStoryTextOpen) {
      const timer = setTimeout(() => {
        if (storyTextareaRef.current) {
          storyTextareaRef.current.focus();
          const len = storyTextareaRef.current.value.length;
          storyTextareaRef.current.setSelectionRange(len, len);
        }
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [isStoryTextOpen]);

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
      setWeather(diary.weather || diary.thumbnailMood || '');
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

  // 실제 렌더링된 속지의 가로/세로 픽셀 크기 실시간 측정 (ResizeObserver)
  const [paperWidth, setPaperWidth] = useState(CANONICAL_WIDTH);
  const [paperHeight, setPaperHeight] = useState(CANONICAL_HEIGHT);

  useEffect(() => {
    const el = canvasContainerRef.current;
    if (!el) return;

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setPaperWidth(Math.round(rect.width));
        setPaperHeight(Math.round(rect.height));
      }
    };

    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    window.addEventListener('resize', updateSize);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, []);

  // 가로 너비 기준 유동 스케일 비율 (CANONICAL 360 대비 실제 렌더링 배율)
  const scaleRatio = paperWidth > 0 ? paperWidth / CANONICAL_WIDTH : 1;

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

  // 캔버스 크기 업데이트 (실제 렌더링된 픽셀 크기에 맞춰 해상도 & DPR 동적 동기화)
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
      clearOverlayCanvas();
    }
  }, [clearOverlayCanvas]);

  useEffect(() => {
    updateCanvasDimensions();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(updateCanvasDimensions);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [updateCanvasDimensions]);

  // 좌표 계산 (터치 및 마우스 위치를 CANONICAL 표준 360x520 좌표계로 정밀 역변환)
  const getCoordinates = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
    const clientY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : 0);

    const scaleX = rect.width > 0 ? CANONICAL_WIDTH / rect.width : 1;
    const scaleY = rect.height > 0 ? CANONICAL_HEIGHT / rect.height : 1;

    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    return {
      x: Math.max(0, Math.min(CANONICAL_WIDTH, x)),
      y: Math.max(0, Math.min(CANONICAL_HEIGHT, y)),
    };
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

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const sX = rect.width > 0 ? rect.width / CANONICAL_WIDTH : 1;
    const sY = rect.height > 0 ? rect.height / CANONICAL_HEIGHT : 1;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr * sX, dpr * sY);

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

  // 인스타그램 스토리 스타일 텍스트 입력창 열기 (신규 작성 또는 기존 수정)
  const openStoryTextEditor = (existingBlock = null) => {
    setActiveToolMode('text');
    if (existingBlock) {
      setEditingTextId(existingBlock.id);
      setEditingText(existingBlock.text || '');
      setEditingFont(existingBlock.fontFamily || "'Gaegu', cursive");
      setEditingSize(existingBlock.fontSize || 24);
      setEditingColor(existingBlock.color || penColor || '#111111');
      setEditingAlign(existingBlock.textAlign || 'center');
      setEditingBgStyle(existingBlock.bgStyle || 'none');
    } else {
      const newId = `t-${Date.now()}`;
      setEditingTextId(newId);
      setEditingText('');
      setEditingFont("'Gaegu', cursive");
      setEditingSize(24);
      setEditingColor(penColor || '#111111');
      setEditingAlign('center');
      setEditingBgStyle('none');
    }
    setIsStoryTextOpen(true);
    setSelectedStickerId(null);
  };

  // 인스타그램 스토리 텍스트 입력 완료 ('완료' 클릭 또는 바깥 배경 탭)
  const handleFinishStoryText = () => {
    const rawValue = storyTextareaRef.current?.value ?? editingText;
    const trimmed = (rawValue || '').trim();
    if (!trimmed) {
      // 텍스트가 비어있으면 기존 블록 삭제, 신규면 생성 취소
      if (editingTextId) {
        setTextBlocks(prev => prev.filter(t => t.id !== editingTextId));
      }
      setSelectedTextId(null);
      setIsStoryTextOpen(false);
      return;
    }

    const defaultX = Math.round(CANONICAL_WIDTH * 0.05);

    setTextBlocks(prev => {
      const exists = prev.find(t => t.id === editingTextId);
      if (exists) {
        return prev.map(t =>
          t.id === editingTextId
            ? {
                ...t,
                text: rawValue,
                fontFamily: editingFont,
                fontSize: editingSize,
                color: editingColor,
                textAlign: editingAlign,
                bgStyle: editingBgStyle,
              }
            : t
        );
      } else {
        const newBlock = {
          id: editingTextId,
          text: rawValue,
          fontFamily: editingFont,
          fontSize: editingSize,
          color: editingColor,
          textAlign: editingAlign,
          bgStyle: editingBgStyle,
          x: defaultX,
          y: Math.min(CANONICAL_HEIGHT - 60, 40 + prev.length * 45),
          rotation: 0,
          scale: 1,
          layerOrder: getNextLayerOrder(),
        };
        return [...prev, newBlock];
      }
    });

    setSelectedTextId(editingTextId);
    setActiveToolMode('text');
    setIsStoryTextOpen(false);
  };

  // 레거시 호환용 추가 핸들러
  const handleAddTextBlock = () => {
    openStoryTextEditor(null);
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

    const { clientX, clientY } = getEventClientCoords(e);

    let resolvedOrigX = currentX;
    let resolvedOrigY = currentY;
    if (typeof resolvedOrigX !== 'number' || typeof resolvedOrigY !== 'number') {
      const boxEl = e.currentTarget.closest('[data-object-box="true"]');
      if (boxEl) {
        if (typeof resolvedOrigX !== 'number') resolvedOrigX = boxEl.offsetLeft;
        if (typeof resolvedOrigY !== 'number') resolvedOrigY = boxEl.offsetTop;
      } else {
        if (typeof resolvedOrigX !== 'number') resolvedOrigX = Math.round((canvasContainerRef.current?.clientWidth || 340) * 0.05);
        if (typeof resolvedOrigY !== 'number') resolvedOrigY = 40;
      }
    }

    setDraggingItem({
      type,
      id,
      startX: clientX,
      startY: clientY,
      origX: resolvedOrigX,
      origY: resolvedOrigY,
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

    const { clientX, clientY } = getEventClientCoords(e);

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

  // 전역 윈도우 드래그/변형 트래킹 (마우스가 컨테이너를 벗어나거나 모바일 고속 드래그 시에도 끊김 없이 100% 추적)
  useEffect(() => {
    if (!draggingItem && !transformingItem) return;

    const handleGlobalMove = (e) => {
      const { clientX, clientY } = getEventClientCoords(e);
      if (clientX === 0 && clientY === 0) return;

      if (transformingItem) {
        if (e.cancelable) e.preventDefault();
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

      if (draggingItem) {
        if (e.cancelable) e.preventDefault();
        const paperRect = canvasContainerRef.current?.getBoundingClientRect();
        const sX = paperRect && paperRect.width > 0 ? CANONICAL_WIDTH / paperRect.width : 1;
        const sY = paperRect && paperRect.height > 0 ? CANONICAL_HEIGHT / paperRect.height : 1;
        const deltaX = (clientX - draggingItem.startX) * sX;
        const deltaY = (clientY - draggingItem.startY) * sY;

        const newX = Math.max(0, Math.min(CANONICAL_WIDTH - 20, draggingItem.origX + deltaX));
        const newY = Math.max(0, Math.min(CANONICAL_HEIGHT - 20, draggingItem.origY + deltaY));

        if (draggingItem.type === 'text') {
          updateTextBlock(draggingItem.id, { x: newX, y: newY });
        } else if (draggingItem.type === 'sticker') {
          updateSticker(draggingItem.id, { x: newX, y: newY });
        }
      }
    };

    const handleGlobalUp = () => {
      setDraggingItem(null);
      setTransformingItem(null);
    };

    window.addEventListener('pointermove', handleGlobalMove);
    window.addEventListener('pointerup', handleGlobalUp);
    window.addEventListener('pointercancel', handleGlobalUp);
    window.addEventListener('touchmove', handleGlobalMove, { passive: false });
    window.addEventListener('touchend', handleGlobalUp);

    return () => {
      window.removeEventListener('pointermove', handleGlobalMove);
      window.removeEventListener('pointerup', handleGlobalUp);
      window.removeEventListener('pointercancel', handleGlobalUp);
      window.removeEventListener('touchmove', handleGlobalMove);
      window.removeEventListener('touchend', handleGlobalUp);
    };
  }, [draggingItem, transformingItem]);

  // 저장
  const handleSaveDiary = () => {
    if (isSaving) return;
    setIsSaving(true);
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
    >
      {/* 
        ================================================================
        [상단] 1. 뒤로가기 + Daily Planner 레이블 ─── [ ✔ ] (검은색 원형 완료 버튼)
        ================================================================
      */}
      <div className="px-6 pt-5 pb-2 shrink-0 flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <button
            onClick={onBack}
            className="text-black hover:opacity-70 transition p-1.5 -ml-1.5 rounded-full"
            title="뒤로가기"
          >
            <ArrowLeft size={22} strokeWidth={2.5} />
          </button>
          <span className="text-sm font-semibold text-stone-400 tracking-tight">
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

            <div className="text-2xl sm:text-3xl font-black text-black tracking-tight leading-none mt-1 group-hover:opacity-75 transition-opacity">
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

          {/* 우측 대표 날씨/스티커 아이콘 버튼 */}
          <div className="relative pb-0.5">
            <button
              type="button"
              onClick={() => setIsWeatherOpen(!isWeatherOpen)}
              className="w-11 h-11 bg-transparent border-0 p-0 active:scale-95 transition flex items-center justify-center"
              title="날씨 / 대표 스티커 선택"
            >
              {weather ? (
                isImageAsset(weather) ? (
                  <img
                    src={weather}
                    alt="대표 아이콘"
                    className="w-10 h-10 object-contain block select-none"
                  />
                ) : (
                  <span className="text-3xl leading-none select-none">{weather}</span>
                )
              ) : (
                <Plus size={24} className="text-black" strokeWidth={2.5} />
              )}
            </button>

            {isWeatherOpen && (
              <div 
                className="absolute right-0 top-full mt-2 bg-white border border-stone-200 rounded-2xl shadow-xl overflow-hidden z-50 w-64 animate-fadeIn"
                onClick={(e) => e.stopPropagation()}
              >
                {/* 카테고리 탭: 날씨 / 스티커 (날짜 옆에는 하단 툴과 달리 '날씨'를 먼저 표시) */}
                <div className="flex border-b border-stone-100 bg-stone-50/60">
                  <button
                    type="button"
                    onClick={() => setRepCategoryTab('weather')}
                    className={`flex-1 py-2 text-xs font-semibold border-b-2 transition ${
                      repCategoryTab === 'weather'
                        ? 'border-black font-bold text-black bg-white'
                        : 'border-transparent text-stone-400 hover:text-stone-700'
                    }`}
                  >
                    날씨
                  </button>
                  <button
                    type="button"
                    onClick={() => setRepCategoryTab('sticker')}
                    className={`flex-1 py-2 text-xs font-semibold border-b-2 transition ${
                      repCategoryTab === 'sticker'
                        ? 'border-black font-bold text-black bg-white'
                        : 'border-transparent text-stone-400 hover:text-stone-700'
                    }`}
                  >
                    스티커
                  </button>
                </div>

                {/* 선택된 탭 컨텐츠 */}
                <div className="p-3 max-h-64 overflow-y-auto no-scrollbar">
                  {repCategoryTab === 'weather' ? (
                    <div className="space-y-3">
                      {/* 1. 업로드된 커스텀 날씨 아이콘 */}
                      {decorations.filter((item) => item.category === 'weather').length > 0 && (
                        <div>
                          <div className="text-[10px] font-bold text-stone-400 mb-1.5 px-0.5">커스텀 날씨</div>
                          <div className="grid grid-cols-4 gap-2">
                            {decorations
                              .filter((item) => item.category === 'weather')
                              .map((item) => (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={() => {
                                    setWeather(item.imageUrl);
                                    setIsWeatherOpen(false);
                                  }}
                                  className={`flex flex-col items-center justify-center p-1.5 rounded-xl hover:bg-stone-100 transition ${
                                    weather === item.imageUrl ? 'bg-stone-200/90 ring-1 ring-black' : ''
                                  }`}
                                  title={item.name || item.fileName}
                                >
                                  <img
                                    src={item.imageUrl}
                                    alt={item.name || '날씨'}
                                    className="w-8 h-8 object-contain block select-none"
                                  />
                                </button>
                              ))}
                          </div>
                        </div>
                      )}

                      {/* 2. 기본 날씨 스탬프 (언제나 즉시 선택 가능) */}
                      <div>
                        <div className="text-[10px] font-bold text-stone-400 mb-1.5 px-0.5">기본 날씨 스탬프</div>
                        <div className="grid grid-cols-4 gap-2">
                          {WEATHER_OPTIONS.map((item) => (
                            <button
                              key={item.icon}
                              type="button"
                              onClick={() => {
                                setWeather(item.icon);
                                setIsWeatherOpen(false);
                              }}
                              className={`flex flex-col items-center justify-center p-2 rounded-xl hover:bg-stone-100 active:scale-95 transition ${
                                weather === item.icon ? 'bg-stone-200/90 ring-1 ring-black' : ''
                              }`}
                              title={item.label}
                            >
                              <span className="text-2xl leading-none select-none">{item.icon}</span>
                              <span className="text-[9px] text-stone-500 mt-1 font-medium">{item.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 3. 선택 해제 버튼 */}
                      {weather && (
                        <div className="pt-2 border-t border-stone-100 flex justify-center">
                          <button
                            type="button"
                            onClick={() => {
                              setWeather('');
                              setIsWeatherOpen(false);
                            }}
                            className="text-[11px] text-stone-500 hover:text-red-500 font-medium py-1 px-3 rounded-lg hover:bg-stone-50 transition"
                          >
                            선택 해제 (기본 + 로 변경)
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* 스티커 탭 (움직이는 GIF + 커스텀 스티커 + 기본 데코 스탬프) */
                    <div className="space-y-3">
                      {/* 1. 움직이는 GIF 스티커 프리셋 */}
                      <div>
                        <div className="text-[10px] font-bold text-stone-400 mb-1.5 px-0.5 flex items-center justify-between">
                          <span>움직이는 GIF 스티커</span>
                          <span className="text-[9px] px-1 bg-red-100 text-red-600 rounded font-bold">GIF</span>
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                          {PRESET_GIF_STICKERS.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => {
                                setWeather(item.imageUrl);
                                setIsWeatherOpen(false);
                              }}
                              className={`flex flex-col items-center justify-center p-1.5 rounded-xl hover:bg-stone-100 transition active:scale-95 ${
                                weather === item.imageUrl ? 'bg-stone-200/90 ring-1 ring-black' : ''
                              }`}
                              title={item.name}
                            >
                              <img
                                src={item.imageUrl}
                                alt={item.name}
                                className="w-8 h-8 object-contain block select-none"
                              />
                              <span className="text-[8px] text-stone-500 mt-0.5 truncate w-full text-center">
                                {item.name}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 2. 업로드된 커스텀 스티커 및 GIF */}
                      {decorations.filter((item) => item.category === 'sticker' || item.category === 'gif' || item.isGif).length > 0 && (
                        <div>
                          <div className="text-[10px] font-bold text-stone-400 mb-1.5 px-0.5">내 보관함 스티커</div>
                          <div className="grid grid-cols-4 gap-2">
                            {decorations
                              .filter((item) => item.category === 'sticker' || item.category === 'gif' || item.isGif)
                              .map((item) => (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={() => {
                                    setWeather(item.imageUrl);
                                    setIsWeatherOpen(false);
                                  }}
                                  className={`flex flex-col items-center justify-center p-1.5 rounded-xl hover:bg-stone-100 transition ${
                                    weather === item.imageUrl ? 'bg-stone-200/90 ring-1 ring-black' : ''
                                  }`}
                                  title={item.name || item.fileName}
                                >
                                  <img
                                    src={item.imageUrl}
                                    alt={item.name || '스티커'}
                                    className="w-8 h-8 object-contain block select-none"
                                  />
                                </button>
                              ))}
                          </div>
                        </div>
                      )}

                      {/* 3. 기본 데코 스탬프 */}
                      <div>
                        <div className="text-[10px] font-bold text-stone-400 mb-1.5 px-0.5">기본 데코 스탬프</div>
                        <div className="grid grid-cols-4 gap-2">
                          {[
                            { icon: '☕️', label: '커피' },
                            { icon: '🌿', label: '나뭇잎' },
                            { icon: '✨', label: '반짝임' },
                            { icon: '💖', label: '하트' },
                            { icon: '⭐', label: '별' },
                            { icon: '🌷', label: '꽃' },
                            { icon: '🍀', label: '클로버' },
                            { icon: '🐾', label: '발자국' },
                          ].map((item) => (
                            <button
                              key={item.icon}
                              type="button"
                              onClick={() => {
                                setWeather(item.icon);
                                setIsWeatherOpen(false);
                              }}
                              className={`flex flex-col items-center justify-center p-2 rounded-xl hover:bg-stone-100 active:scale-95 transition ${
                                weather === item.icon ? 'bg-stone-200/90 ring-1 ring-black' : ''
                              }`}
                              title={item.label}
                            >
                              <span className="text-2xl leading-none select-none">{item.icon}</span>
                              <span className="text-[9px] text-stone-500 mt-1 font-medium">{item.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 선택 해제 버튼 */}
                      {weather && (
                        <div className="pt-2 border-t border-stone-100 flex justify-center">
                          <button
                            type="button"
                            onClick={() => {
                              setWeather('');
                              setIsWeatherOpen(false);
                            }}
                            className="text-[11px] text-stone-500 hover:text-red-500 font-medium py-1 px-3 rounded-lg hover:bg-stone-50 transition"
                          >
                            선택 해제 (기본 + 로 변경)
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 선명한 블랙 가로 구분선 */}
        <div className="w-full h-[1.5px] bg-black mt-3 sm:mt-4" />
      </div>

      {/* 
        ================================================================
        [본문] 모든 디바이스에서 100% 동일한 비율과 레이아웃을 보장하는 다이어리 속지
        - 모바일에서는 화면을 시원하게 채우고, 태블릿/PC에서는 캘린더/목록과 동일한 넉넉한 노트 공간 제공
        - 가로 너비 기준 상대 비율(%) 및 scaleRatio를 적용하여 획, 스티커, 텍스트 줄바꿈 위치가 완벽히 일치
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
        className={`flex-1 mx-3.5 sm:mx-6 mb-24 sm:mb-28 relative isolate overflow-hidden rounded-2xl sm:rounded-3xl shadow-xs border border-stone-200/90 ${currentPaperClass} transition-colors duration-200`}
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
          style={{
            zIndex: activeToolMode === 'pen' ? 9999 : 0,
            touchAction: 'none',
          }}
          className={`absolute inset-0 w-full h-full block ${
            activeToolMode === 'pen' ? 'cursor-crosshair touch-none' : 'pointer-events-none'
          }`}
        />

        {/* (2) 텍스트 블록 레이어 (인스타그램 스토리 스티커 스타일) */}
        {textBlocks.map((block, idx) => {
          const isSelected = selectedTextId === block.id;
          const blockScale = block.scale || 1;
          const blockRotation = block.rotation || 0;
          const invScale = 1 / blockScale;
          const blockZIndex = typeof block.layerOrder === 'number' ? block.layerOrder : idx + 1;

          // 배경 배지 스타일
          let bgClass = '';
          let textColor = block.color || '#111111';
          let customBgStyle = undefined;

          if (block.bgStyle === 'light') {
            bgClass = 'bg-white/95 text-stone-900 rounded-2xl shadow-sm px-3.5 py-1.5';
          } else if (block.bgStyle === 'dark') {
            bgClass = 'bg-black/90 text-white rounded-2xl shadow-sm px-3.5 py-1.5';
            textColor = '#ffffff';
          } else if (block.bgStyle === 'color') {
            bgClass = 'text-white rounded-2xl shadow-sm px-3.5 py-1.5';
            customBgStyle = { backgroundColor: block.color || '#111111' };
            textColor = '#ffffff';
          }

          const leftPercent = ((block.x || 0) / CANONICAL_WIDTH) * 100;
          const topPercent = ((block.y || 0) / CANONICAL_HEIGHT) * 100;
          const scaledFontSize = Math.max(12, Math.round((block.fontSize || 22) * scaleRatio));

          return (
            <div
              key={block.id}
              data-object-box="true"
              onPointerDown={(e) => handleItemDragStart(e, 'text', block.id, block.x, block.y)}
              onTouchStart={(e) => handleItemDragStart(e, 'text', block.id, block.x, block.y)}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedTextId(block.id);
                setSelectedStickerId(null);
                setActiveToolMode('text');
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                openStoryTextEditor(block);
              }}
              style={{
                left: `${leftPercent}%`,
                top: `${topPercent}%`,
                maxWidth: '90%',
                zIndex: blockZIndex,
                transform: `rotate(${blockRotation}deg) scale(${blockScale})`,
                transformOrigin: 'center center',
                touchAction: 'none',
              }}
              className={`absolute cursor-move select-none touch-none p-1 transition-shadow ${
                isSelected
                  ? 'ring-1.5 ring-dashed ring-stone-800 rounded-2xl bg-stone-100/40 backdrop-blur-2xs'
                  : ''
              }`}
            >
              {/* 선택 시 상단 이동 바 및 조작 핸들 */}
              {isSelected && (
                <>
                  {/* 상단 드래그 이동 핸들 바 */}
                  <div
                    onPointerDown={(e) => handleItemDragStart(e, 'text', block.id, block.x, block.y)}
                    onTouchStart={(e) => handleItemDragStart(e, 'text', block.id, block.x, block.y)}
                    style={{ touchAction: 'none' }}
                    className="w-full h-4 bg-stone-400/20 hover:bg-stone-400/40 rounded-t-lg cursor-move flex items-center justify-center mb-1 touch-none"
                    title="드래그하여 상하좌우 이동"
                  >
                    <div className="w-8 h-1 bg-stone-500 rounded-full" />
                  </div>

                  {/* 좌측 상단: 삭제 버튼 */}
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteTextBlock(block.id);
                    }}
                    style={{ transform: `scale(${invScale})` }}
                    className="absolute -top-3 -left-3 w-6 h-6 rounded-full bg-stone-800 text-white shadow flex items-center justify-center z-30 active:scale-95"
                    title="글상자 삭제"
                  >
                    <X size={12} />
                  </button>

                  {/* 상단 중앙: 내용 수정(인스타그램 에디터 열기) 버튼 */}
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      openStoryTextEditor(block);
                    }}
                    style={{ transform: `scale(${invScale})` }}
                    className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-2.5 h-5 rounded-full bg-black text-white text-[10px] font-bold shadow flex items-center justify-center space-x-1 z-30 active:scale-95"
                    title="텍스트 내용 수정"
                  >
                    <span>Aa 수정</span>
                  </button>

                  {/* 우측 상단: 직접 회전 핸들 */}
                  <div
                    onPointerDown={(e) => handleTransformStart(e, 'rotate', 'text', block)}
                    onTouchStart={(e) => handleTransformStart(e, 'rotate', 'text', block)}
                    style={{ transform: `scale(${invScale})`, touchAction: 'none' }}
                    className="absolute -top-3 -right-3 w-6 h-6 rounded-full bg-black text-white shadow flex items-center justify-center cursor-grab active:cursor-grabbing z-30 touch-none"
                    title="드래그하여 회전"
                  >
                    <RotateCw size={12} />
                  </div>

                  {/* 우측 하단: 직접 크기조절 핸들 */}
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

              {/* 본문 텍스트 */}
              <div
                style={{
                  fontFamily: block.fontFamily || "'Gaegu', cursive",
                  fontSize: `${scaledFontSize}px`,
                  color: textColor,
                  textAlign: block.textAlign || 'center',
                  lineHeight: 1.35,
                  ...customBgStyle,
                }}
                className={`whitespace-pre-wrap break-words cursor-move ${bgClass}`}
              >
                {block.text || '텍스트를 입력하세요...'}
              </div>
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

          const leftPercent = ((sticker.x || 0) / CANONICAL_WIDTH) * 100;
          const topPercent = ((sticker.y || 0) / CANONICAL_HEIGHT) * 100;
          const isTape = sticker.category === 'tape' || sticker.type === 'tape';
          const basePixelW = isTape ? 112 : 56;
          const scaledPixelW = Math.max(24, Math.round(basePixelW * scaleRatio));

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
                left: `${leftPercent}%`,
                top: `${topPercent}%`,
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
                  style={{ width: `${scaledPixelW}px`, height: 'auto' }}
                  className="object-contain select-none pointer-events-none block"
                />
              ) : sticker.type === 'tape' ? (
                <div
                  className="rounded shadow-xs relative overflow-hidden"
                  style={{
                    width: `${scaledPixelW}px`,
                    height: `${Math.round(24 * scaleRatio)}px`,
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
                <span 
                  style={{ fontSize: `${Math.round(36 * scaleRatio)}px` }}
                  className="filter drop-shadow-xs block leading-none select-none"
                >
                  {sticker.content}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* 
        ================================================================
        [하단 도구 모음 통합 컨테이너]
        (모바일 키보드 자판 활성화 시 키보드 높이만큼 자동으로 위로 올라옴)
        ================================================================
      */}
      <div
        style={{ bottom: `calc(1rem + ${keyboardOffset}px)` }}
        className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-40 w-[92%] max-w-lg flex flex-col space-y-2 pointer-events-none transition-[bottom] duration-150 ease-out"
      >
        
        {/* (1) 위쪽 상세 컨트롤 패널 (펜/텍스트/속지 모드일 때 표시) */}
        {(activeToolMode === 'pen' || activeToolMode === 'text' || activeToolMode === 'paper') && (
        <div className="pointer-events-auto bg-[#f4f4f4]/95 backdrop-blur-md border border-stone-200/70 rounded-2xl sm:rounded-3xl p-2 sm:p-2.5 shadow-md flex flex-col justify-center overflow-visible">
          
          {/* 펜 모드 상세 컨트롤 */}
          {activeToolMode === 'pen' && (
            <div className="flex flex-col space-y-1.5 sm:space-y-2 animate-fadeIn">
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
                      className={`px-2.5 sm:px-3 py-1 rounded-lg font-medium text-xs sm:text-sm transition ${
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
                    <RotateCcw className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                  </button>
                  <button 
                    onClick={handleRedo} 
                    disabled={historyIndex >= strokesHistory.length - 1}
                    className="p-1.5 rounded-lg hover:bg-white disabled:opacity-30 transition"
                    title="다시 실행"
                  >
                    <RotateCw className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                  </button>
                  <button 
                    onClick={handleClearStrokes} 
                    className="p-1.5 rounded-lg hover:bg-red-50 text-stone-400 hover:text-red-500 transition"
                    title="모두 지우기"
                  >
                    <Trash2 className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                  </button>
                </div>
              </div>

              {/* 하단: 스크롤바 없는 완벽한 한 줄 컬러 스와치 & 굵기 슬라이더 */}
              {activePenTool !== 'eraser' && (
                <div className="flex items-center justify-between pt-1 border-t border-stone-200/50">
                  
                  {/* 컬러 스와치 영역 */}
                  <div className="flex items-center space-x-1 sm:space-x-1.5 overflow-x-auto no-scrollbar py-0.5">
                    {/* 1. 고정 기본 10대 컬러 */}
                    {FIXED_PRESET_COLORS.map((c) => {
                      const isSelected = penColor.toLowerCase() === c.value.toLowerCase();
                      return (
                        <button
                          key={c.value}
                          onClick={() => setPenColor(c.value)}
                          className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full shrink-0 flex items-center justify-center p-0.5 box-border transition-all ${
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

                    {/* 3. 커스텀 컬러 칩 */}
                    <button
                      onClick={() => setPenColor(customColor)}
                      className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full shrink-0 flex items-center justify-center p-0.5 box-border transition-all ${
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
                        className="w-5 h-5 sm:w-6 sm:h-6 rounded-full border border-stone-300 shadow-2xs hover:opacity-80 active:scale-95 transition flex items-center justify-center box-border p-0.5"
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
                    <span className="text-xs text-stone-500 font-medium">굵기</span>
                    <input
                      type="range"
                      min={activePenTool === 'highlighter' ? 8 : 1}
                      max={activePenTool === 'highlighter' ? 32 : 8}
                      value={penSize}
                      onChange={(e) => setPenSize(Number(e.target.value))}
                      className="w-16 sm:w-20 accent-black cursor-pointer"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 타이핑 모드 상세 컨트롤 */}
          {activeToolMode === 'text' && (
            <div className="flex items-center justify-between animate-fadeIn text-xs sm:text-sm">
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => openStoryTextEditor(null)}
                  className="flex items-center space-x-1 bg-black text-white px-3 py-1.5 rounded-xl hover:bg-stone-800 active:scale-95 transition font-medium shadow-2xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>새 텍스트</span>
                </button>

                {selectedText && (
                  <button
                    type="button"
                    onClick={() => openStoryTextEditor(selectedText)}
                    className="flex items-center space-x-1 bg-white text-stone-800 border border-stone-200/80 px-3 py-1.5 rounded-xl hover:bg-stone-100 active:scale-95 transition font-medium shadow-2xs"
                  >
                    <Type className="w-4 h-4" />
                    <span>내용 수정</span>
                  </button>
                )}
              </div>

              <span className="text-xs text-stone-400">
                드래그하여 자유 이동
              </span>
            </div>
          )}

          {/* 속지 모드 상세 컨트롤 */}
          {activeToolMode === 'paper' && (
            <div className="flex items-center justify-between animate-fadeIn text-xs sm:text-sm">
              <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar w-full">
                {PAPER_STYLES.map(style => (
                  <button
                    key={style.id}
                    onClick={() => setPaperStyle(style.id)}
                    className={`flex-1 py-1.5 px-2.5 rounded-xl text-xs sm:text-sm font-medium transition ${
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

        {/* (2) 아래쪽 아이콘 독 툴박스 */}
        <div className="pointer-events-auto bg-[#f4f4f4]/95 backdrop-blur-md border border-stone-200/80 rounded-2xl sm:rounded-3xl px-6 py-2.5 sm:py-3 shadow-md flex items-center justify-between">
          
          {/* 1. 타이핑 아이콘 (Type) */}
          <button
            type="button"
            onClick={() => {
              setSelectedStickerId(null);
              setSelectedTextId(null);
              setActiveToolMode('text');
              openStoryTextEditor(null);
            }}
            className={`p-1.5 rounded-full transition-all ${
              activeToolMode === 'text'
                ? 'text-black scale-110 font-bold'
                : 'text-stone-400 hover:text-stone-700'
            }`}
            title="새 텍스트 작성 (인스타그램 스토리 스타일)"
          >
            <Type className="w-5 h-5 sm:w-6 sm:h-6" strokeWidth={activeToolMode === 'text' ? 2.6 : 2} />
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
            <PenTool className="w-5 h-5 sm:w-6 sm:h-6" strokeWidth={activeToolMode === 'pen' ? 2.6 : 2} />
          </button>

          {/* 3. 스티커 아이콘 (Sparkles) */}
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
            <Sparkles className="w-5 h-5 sm:w-6 sm:h-6" strokeWidth={activeToolMode === 'sticker' || isStickerPaletteOpen ? 2.6 : 2} />
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
            <LayoutGrid className="w-5 h-5 sm:w-6 sm:h-6" strokeWidth={activeToolMode === 'paper' ? 2.6 : 2} />
          </button>

          {/* 5. 일기 삭제 휴지통 아이콘 (Trash2) */}
          <button
            onClick={() => setIsDeleteModalOpen(true)}
            className="p-1.5 rounded-full transition-all text-stone-400 hover:text-red-500 active:scale-95"
            title="일기 삭제"
          >
            <Trash2 className="w-5 h-5 sm:w-6 sm:h-6" strokeWidth={2} />
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

      {/* 
        ================================================================
        [인스타그램 스토리 스타일 텍스트 입력 에디터 모달]
        - 화이트 반투명 배경(bg-white/90 backdrop-blur-md)으로 검은색 기본 글씨가 또렷하게 보이도록 개선
        ================================================================
      */}
      {isStoryTextOpen && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-between bg-white/90 backdrop-blur-md p-4 sm:p-6 animate-fadeIn select-none overflow-hidden"
          onClick={handleFinishStoryText}
        >
          {/* 1. 상단 바: [정렬 아이콘] [배경 강조 A] ────── [완료] */}
          <div
            className="flex items-center justify-between z-20 shrink-0 pt-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center space-x-2.5">
              {/* 정렬 버튼 (좌측 / 중앙 / 우측 토글) */}
              <button
                type="button"
                onClick={() => {
                  const nextAlign =
                    editingAlign === 'left'
                      ? 'center'
                      : editingAlign === 'center'
                      ? 'right'
                      : 'left';
                  setEditingAlign(nextAlign);
                }}
                className="w-10 h-10 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-200/90 flex items-center justify-center backdrop-blur-md active:scale-95 transition shadow-2xs"
                title="텍스트 정렬 (좌측/중앙/우측)"
              >
                {editingAlign === 'left' && <AlignLeft size={20} />}
                {editingAlign === 'center' && <AlignCenter size={20} />}
                {editingAlign === 'right' && <AlignRight size={20} />}
              </button>

              {/* 텍스트 배경 하이라이트 토글 (인스타그램 'A' 강조 버튼) */}
              <button
                type="button"
                onClick={() => {
                  const nextBg =
                    editingBgStyle === 'none'
                      ? 'light'
                      : editingBgStyle === 'light'
                      ? 'dark'
                      : editingBgStyle === 'dark'
                      ? 'color'
                      : 'none';
                  setEditingBgStyle(nextBg);
                }}
                className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-sm transition active:scale-95 ${
                  editingBgStyle === 'none'
                    ? 'bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-200/90'
                    : editingBgStyle === 'light'
                    ? 'bg-white text-stone-900 border border-stone-300 shadow-sm ring-1 ring-stone-200'
                    : editingBgStyle === 'dark'
                    ? 'bg-black text-white shadow-sm'
                    : 'text-white shadow-sm'
                }`}
                style={
                  editingBgStyle === 'color'
                    ? { backgroundColor: editingColor }
                    : undefined
                }
                title="텍스트 배경 강조 스타일"
              >
                A
              </button>
            </div>

            {/* 완료 버튼 (블랙 원형/필 버튼 - 모바일 터치 즉각 반응) */}
            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                handleFinishStoryText();
              }}
              onTouchEnd={(e) => {
                e.stopPropagation();
                e.preventDefault();
                handleFinishStoryText();
              }}
              onClick={(e) => {
                e.stopPropagation();
                handleFinishStoryText();
              }}
              className="px-5 py-2 bg-black hover:bg-stone-800 text-white font-black text-sm rounded-full shadow-md active:scale-95 transition cursor-pointer select-none"
            >
              완료
            </button>
          </div>

          {/* 2. 중앙 영역: [좌측 수직 크기 슬라이더] + [중앙 텍스트 입력창] - 바깥 영역 터치 시 작성 완료 */}
          <div
            className="flex-1 flex items-center justify-center relative my-auto px-2 overflow-y-auto no-scrollbar cursor-pointer"
            onClick={handleFinishStoryText}
          >
            {/* 인스타그램 스토리 수직 폰트 크기 슬라이더 (좌측) */}
            <div
              className="absolute left-1 sm:left-4 top-1/2 -translate-y-1/2 flex flex-col items-center z-20 select-none cursor-default"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="text-[13px] text-stone-900 font-black mb-1">A</span>
              <div className="h-44 sm:h-52 flex items-center justify-center">
                <input
                  type="range"
                  min="16"
                  max="44"
                  step="1"
                  value={editingSize}
                  onChange={(e) => setEditingSize(Number(e.target.value))}
                  className="w-36 sm:w-44 accent-black cursor-pointer -rotate-90 origin-center"
                />
              </div>
              <span className="text-[9px] text-stone-400 font-bold mt-1">A</span>
            </div>

            {/* 중앙 텍스트에어리어 (자동 높이 & 실시간 스타일 반영) */}
            <div
              className="w-full max-w-sm sm:max-w-md px-10 flex flex-col items-center justify-center cursor-default"
              onClick={(e) => e.stopPropagation()}
            >
              <textarea
                ref={storyTextareaRef}
                value={editingText}
                onChange={(e) => setEditingText(e.target.value)}
                placeholder="텍스트를 입력하세요..."
                rows={Math.max(1, (editingText || '').split('\n').length)}
                style={{
                  fontFamily: editingFont,
                  fontSize: `${editingSize}px`,
                  color:
                    editingBgStyle === 'dark' || editingBgStyle === 'color'
                      ? '#ffffff'
                      : editingBgStyle === 'light'
                      ? '#111111'
                      : editingColor,
                  textAlign: editingAlign,
                  lineHeight: 1.35,
                  userSelect: 'text',
                  WebkitUserSelect: 'text',
                  backgroundColor:
                    editingBgStyle === 'light'
                      ? '#ffffff'
                      : editingBgStyle === 'dark'
                      ? '#111111'
                      : editingBgStyle === 'color'
                      ? editingColor
                      : 'transparent',
                }}
                className={`w-full border-0 outline-hidden resize-none p-3.5 placeholder-stone-400 overflow-hidden transition-all select-text ${
                  editingBgStyle === 'light'
                    ? 'rounded-2xl shadow-md border border-stone-200/90'
                    : editingBgStyle !== 'none'
                    ? 'rounded-2xl shadow-xl'
                    : ''
                }`}
              />
            </div>
          </div>

          {/* 3. 하단 컨트롤 바: [폰트 선택 캐러셀] + [컬러 스와치 팔레트] */}
          <div
            className="flex flex-col space-y-3 z-20 shrink-0 pb-2"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 폰트 선택 캐러셀 (인스타그램 스토리 폰트 셀렉터) */}
            <div className="flex items-center justify-center space-x-2 overflow-x-auto no-scrollbar py-1">
              {FONTS.map((font) => (
                <button
                  key={font.id}
                  type="button"
                  onClick={() => setEditingFont(font.family)}
                  style={{ fontFamily: font.family }}
                  className={`px-3.5 py-1.5 rounded-full text-xs whitespace-nowrap transition-all ${
                    editingFont === font.family
                      ? 'bg-black text-white font-bold scale-105 shadow-sm'
                      : 'bg-stone-100 text-stone-700 hover:bg-stone-200 border border-stone-200/80 font-medium'
                  }`}
                >
                  {font.name}
                </button>
              ))}
            </div>

            {/* 컬러 스와치 팔레트 */}
            <div className="flex items-center justify-center space-x-2 overflow-x-auto no-scrollbar py-1">
              {FIXED_PRESET_COLORS.map((c) => {
                const isSelected = editingColor.toLowerCase() === c.value.toLowerCase();
                return (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setEditingColor(c.value)}
                    className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center p-[2px] box-border transition-all ${
                      isSelected
                        ? 'border-2 border-stone-900 scale-110 shadow-sm'
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
