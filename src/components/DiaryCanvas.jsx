import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  ArrowLeft, 
  Check, 
  Pencil,
  Type, 
  PenTool, 
  Sparkles, 
  LayoutGrid, 
  Plus, 
  Trash2, 
  RotateCw, 
  RotateCcw, 
  Maximize2,
  ArrowLeftRight,
  GripHorizontal,
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
  CANONICAL_HEIGHT,
  resolveStickerImage,
  isEmojiSticker,
  upgradePresetSvgUrl
} from '../utils/canvasLayers';
import StickerPalette from './StickerPalette';
import PaperSelectModal from './PaperSelectModal';
import DatePickerModal from './DatePickerModal';
import { triggerHaptic } from '../utils/haptics';

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

// 디바이스별 기본 활성 도구 모드 결정:
// 모바일 스마트폰(< 640px) -> 타이핑('text')이 기본 Default
// 태블릿(아이패드, 갤럭시탭 등) 및 PC -> 드로잉/손글씨('pen')가 기본 Default
export function getDefaultToolMode() {
  if (typeof window === 'undefined') return 'pen';

  // 1. iPadOS 감지: Safari는 UA가 Macintosh이지만 maxTouchPoints > 1
  const isIPad = /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
  // 2. Android 태블릿 감지: Tablet 키워드가 있거나, Android이면서 Mobile이 없는 경우
  const isAndroidTablet = /Tablet|Android(?!.*Mobile)/i.test(navigator.userAgent);

  // 3. 모바일 스마트폰 판단: 태블릿이 아니면서 화면 가로 폭이 640px 미만인 경우
  const isMobilePhone = !isIPad && !isAndroidTablet && window.innerWidth < 640;

  return isMobilePhone ? 'text' : 'pen';
}

/**
 * 뷰 모드 좌우 스와이프 시 실시간으로 함께 이동하는 정적 다이어리 페이지 컴포넌트
 */
function DiaryStaticPage({ diary, scaleRatio = 1, paperHeightPx = 800 }) {
  const normalized = useMemo(() => normalizeDiaryLayers(diary), [diary]);
  const strokeBands = useMemo(() => buildStrokeBands(normalized.strokes), [normalized.strokes]);

  const dateObj = new Date((diary?.date || '') + 'T00:00:00');
  const validDate = isNaN(dateObj) ? new Date() : dateObj;
  const yearNum = validDate.getFullYear();
  const monthNum = String(validDate.getMonth() + 1).padStart(2, '0');
  const dayNum = String(validDate.getDate()).padStart(2, '0');
  const dayEn = DAY_NAMES_EN[validDate.getDay()] || 'MON';
  const weather = diary?.weather || diary?.thumbnailMood || '';
  const paperClass = PAPER_STYLES.find(p => p.id === diary?.paperStyle)?.class || 'paper-minimal-lined';

  return (
    <div className="w-full h-full flex flex-col bg-[#fafafa] select-none pointer-events-none">
      {/* 날짜 헤더 */}
      <div className="w-full px-6 pt-1 lg:pt-[calc(1.25rem+env(safe-area-inset-top,0px))] pb-3 shrink-0">
        <div className="text-base sm:text-lg font-black text-black leading-tight tracking-tight">
          {yearNum}
        </div>
        <div className="flex items-center justify-between mt-1">
          <div className="text-2xl sm:text-3xl font-black text-black tracking-tight leading-none">
            {monthNum}.{dayNum} {dayEn}
          </div>
          <div className="w-10 h-10 flex items-center justify-center">
            {weather ? (
              isImageAsset(weather) ? (
                <img
                  src={upgradePresetSvgUrl(typeof weather === 'string' ? weather : weather?.imageUrl || '')}
                  alt=""
                  className="w-10 h-10 object-contain block p-0.5 select-none"
                />
              ) : (
                <span className="text-3xl leading-none select-none">
                  {typeof weather === 'string' ? weather : weather?.icon || ''}
                </span>
              )
            ) : null}
          </div>
        </div>
        <div className="w-full h-[1.5px] bg-black mt-3 sm:mt-4" />
      </div>

      {/* 속지 컨텐츠 */}
      <div className="flex-1 w-full overflow-hidden px-3.5 sm:px-6 relative">
        <div 
          style={{ minHeight: `${paperHeightPx}px` }}
          className={`w-full relative isolate ${paperClass}`}
        >
          {/* 드로잉 스트로크 */}
          {strokeBands.map((band) => (
            <StrokeBandCanvas key={band.id} band={band} />
          ))}

          {/* 텍스트 블록 */}
          {(normalized.textBlocks || []).map((block, idx) => {
            const blockScale = block.scale || 1;
            const blockRotation = block.rotation || 0;
            const blockZIndex = typeof block.layerOrder === 'number' ? block.layerOrder : idx + 1;
            const leftPx = Math.round((block.x || 0) * scaleRatio);
            const topPx = Math.round((block.y || 0) * scaleRatio);
            const canonicalW = typeof block.width === 'number' ? block.width : CANONICAL_WIDTH;
            const widthPx = Math.round(canonicalW * scaleRatio);
            const scaledFontSize = Math.max(10, Math.round((block.fontSize || 18) * scaleRatio));
            const scaledLineHeight = Math.max(20, Math.round(28 * scaleRatio));
            const minBoxHeight = scaledLineHeight * 1;
            const textColor = block.color || '#111111';

            return (
              <div
                key={block.id || idx}
                style={{
                  left: `${leftPx}px`,
                  top: `${topPx}px`,
                  width: `${widthPx}px`,
                  minHeight: `${minBoxHeight + 8}px`,
                  zIndex: blockZIndex,
                  transform: `rotate(${blockRotation}deg) scale(${blockScale})`,
                  transformOrigin: 'center center',
                  fontFamily: block.fontFamily || "'Paperlogy', sans-serif",
                  fontWeight: block.fontWeight || (block.fontFamily && !block.fontFamily.includes('Paperlogy') ? 'normal' : 600),
                  fontSize: `${scaledFontSize}px`,
                  color: textColor,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  lineHeight: `${scaledLineHeight}px`,
                }}
                className="absolute p-1.5"
              >
                {block.text || ''}
              </div>
            );
          })}

          {/* 스티커 */}
          {(normalized.stickers || []).filter(Boolean).map((sticker, idx) => {
            const stickerScale = sticker.scale || 1;
            const stickerRotation = sticker.rotation || 0;
            const stickerZIndex = typeof sticker.layerOrder === 'number' ? sticker.layerOrder : idx + 1;
            const leftPercent = ((sticker.x || 0) / CANONICAL_WIDTH) * 100;
            const topPx = Math.round((sticker.y || 0) * scaleRatio);
            const isTape = sticker.category === 'tape' || sticker.type === 'tape';
            const basePixelW = isTape ? 112 : 56;
            const scaledPixelW = Math.max(24, Math.round(basePixelW * scaleRatio));
            const resolvedImg = resolveStickerImage(sticker);

            return (
              <div
                key={sticker.id || idx}
                style={{
                  left: `${leftPercent}%`,
                  top: `${topPx}px`,
                  zIndex: stickerZIndex,
                  transform: `rotate(${stickerRotation}deg) scale(${stickerScale})`,
                  transformOrigin: 'center center',
                }}
                className="absolute select-none p-1 pointer-events-none"
              >
                {resolvedImg ? (
                  <img
                    src={resolvedImg}
                    alt=""
                    draggable={false}
                    className={
                      sticker.category === 'tape' || sticker.type === 'tape'
                        ? 'w-28 h-auto object-contain block'
                        : 'w-14 h-14 object-contain block'
                    }
                  />
                ) : sticker.type === 'tape' || sticker.category === 'tape' ? (
                  <div
                    className="rounded shadow-xs relative overflow-hidden"
                    style={{
                      width: `${scaledPixelW}px`,
                      height: `${Math.round(24 * scaleRatio)}px`,
                      backgroundColor: sticker.color || '#fef08a',
                      backgroundImage:
                        sticker.pattern === 'dots'
                          ? 'radial-gradient(rgba(0,0,0,0.15) 1px, transparent 1px)'
                          : sticker.pattern === 'stripes'
                          ? 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(0,0,0,0.08) 4px, rgba(0,0,0,0.08) 8px)'
                          : 'none',
                      backgroundSize: sticker.pattern === 'dots' ? '6px 6px' : 'auto',
                    }}
                  />
                ) : isEmojiSticker(sticker) ? (
                  <span className="text-3xl sm:text-4xl filter drop-shadow-xs block leading-none">
                    {sticker.content || sticker.icon || ''}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function DiaryCanvas({ 
  diary, 
  diaryName, 
  onSave, 
  onDelete, 
  onBack, 
  diaries = [], 
  initialViewMode = false, 
  onNavigateDiary,
  pageTurnDirection = null
}) {
  const [isViewMode, setIsViewMode] = useState(initialViewMode);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

  // 책장 넘김(달력 플립) / 실시간 스와이프 인터랙션 상태
  const [dragX, setDragX] = useState(0);
  const [isPageDragging, setIsPageDragging] = useState(false);
  const [exitAnimation, setExitAnimation] = useState(null); // 'anim-page-exit-left' | 'anim-page-exit-right' | null
  const [enterAnimation, setEnterAnimation] = useState(() => {
    if (pageTurnDirection === 'next') return 'anim-page-enter-right';
    if (pageTurnDirection === 'prev') return 'anim-page-enter-left';
    return null;
  });

  // 진입 애니메이션 완료 후 클래스 해제
  useEffect(() => {
    if (enterAnimation) {
      const timer = setTimeout(() => {
        setEnterAnimation(null);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [enterAnimation]);

  // 정렬된 일기 목록에서 이전 및 다음 일기 식별 (스와이프 트랙 렌더링용)
  const sortedDiaries = useMemo(() => {
    return [...(diaries || [])].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  }, [diaries]);

  const currentDiaryIndex = useMemo(() => {
    return sortedDiaries.findIndex((d) => d.id === diary?.id || d.date === diary?.date);
  }, [sortedDiaries, diary?.id, diary?.date]);

  const prevDiary = currentDiaryIndex > 0 ? sortedDiaries[currentDiaryIndex - 1] : null;
  const nextDiary = currentDiaryIndex >= 0 && currentDiaryIndex < sortedDiaries.length - 1 ? sortedDiaries[currentDiaryIndex + 1] : null;

  useEffect(() => {
    setIsViewMode(initialViewMode);
  }, [diary?.id, diary?.date, initialViewMode]);

  // 이미 다른 일기가 작성된 날짜 목록 (현재 열려있는 일기의 기존 날짜는 유지 가능하도록 제외)
  const existingDatesForPicker = useMemo(() => {
    return (diaries || [])
      .filter((d) => d.id !== diary?.id && d.date !== diary?.date)
      .map((d) => d.date)
      .filter(Boolean);
  }, [diaries, diary?.id, diary?.date]);

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
    return upgradePresetSvgUrl(diary?.weather || diary?.thumbnailMood || '');
  });
  const [paperStyle, setPaperStyle] = useState(diary?.paperStyle || 'lined');
  
  // 하단 툴바 활성 모드: 'none' | 'text' | 'pen' | 'sticker' | 'paper'
  // 모바일: 타이핑('text') Default / 태블릿 & PC: 드로잉('pen') Default
  const [activeToolMode, setActiveToolMode] = useState(() => getDefaultToolMode());

  // 모달 상태
  const [isWeatherOpen, setIsWeatherOpen] = useState(false);
  const [repCategoryTab, setRepCategoryTab] = useState('weather'); // 날씨 / 스티커 1차 분류
  const [repStickerSubCategory, setRepStickerSubCategory] = useState('sticker'); // 스티커 선택 시 하위 카테고리 (MY, 스티커, 캐릭터 등)
  const [isPaperModalOpen, setIsPaperModalOpen] = useState(false);
  const [isStickerPaletteOpen, setIsStickerPaletteOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Firestore decorations 목록 (날짜 옆 대표 아이콘 선택용)
  const [decorations, setDecorations] = useState([]);

  // 로컬 개인화 스티커 보관 (MY 카테고리)
  const [myStickers, setMyStickers] = useState(() => {
    try {
      const raw = localStorage.getItem('analog_my_stickers');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  // 날씨/대표 스티커 모달 열릴 때 최신 myStickers 갱신
  useEffect(() => {
    if (isWeatherOpen) {
      try {
        const raw = localStorage.getItem('analog_my_stickers');
        if (raw) setMyStickers(JSON.parse(raw));
      } catch {}
    }
  }, [isWeatherOpen]);

  useEffect(() => {
    const unsubscribe = subscribeToDecorations((items) => {
      setDecorations(items);
    });
    return () => unsubscribe();
  }, []);

  // 대표 스티커 선택용 하위 카테고리 목록 (StickerPalette와 동일하게 가로 스크롤 노출)
  const repStickerCategories = useMemo(() => {
    const base = [
      { id: 'my', label: 'MY' },
      { id: 'sticker', label: '스티커' },
      { id: 'character', label: '캐릭터' },
      { id: 'emotion', label: '감정' },
      { id: 'daily', label: '일상' },
      { id: 'tape', label: '마스킹테이프' },
      { id: 'food', label: '음식' },
    ];
    const existing = new Set(base.map((b) => b.id));
    existing.add('weather');
    existing.add('gif');
    const dynamicCats = [];
    (decorations || []).forEach((d) => {
      if (d.category && !existing.has(d.category)) {
        existing.add(d.category);
        dynamicCats.push({ id: d.category, label: d.category });
      }
    });
    return [...base, ...dynamicCats];
  }, [decorations]);

  // 선택된 대표 스티커 하위 카테고리별 에셋 필터링
  const filteredRepStickers = useMemo(() => {
    if (repStickerSubCategory === 'my') {
      const cloudMy = decorations.filter((d) => d.category === 'my' || d.isPersonal);
      const map = new Map();
      myStickers.forEach((s) => map.set(s.id, s));
      cloudMy.forEach((s) => {
        if (!map.has(s.id)) map.set(s.id, s);
      });
      return Array.from(map.values());
    } else if (repStickerSubCategory === 'sticker') {
      const cloud = decorations.filter(
        (d) => d.category === 'sticker' || (!d.category && !d.isPersonal && d.category !== 'weather')
      );
      return [...PRESET_GIF_STICKERS, ...cloud];
    } else {
      return decorations.filter((d) => d.category === repStickerSubCategory);
    }
  }, [repStickerSubCategory, decorations, myStickers]);

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

  // 펜 드로잉 & 컬러 (만년필 기본 굵기: 2.2)
  const [activePenTool, setActivePenTool] = useState('pen');
  const [penColor, setPenColor] = useState('#111111');
  const [customColor, setCustomColor] = useState('#d97706'); // 사용자가 컬러 피커로 고른 커스텀 색상
  const [penSize, setPenSize] = useState(2.2);
  const [strokesHistory, setStrokesHistory] = useState(initialNormalized.strokes);
  const [historyIndex, setHistoryIndex] = useState(
    initialNormalized.strokes.length ? initialNormalized.strokes.length - 1 : -1
  );

  const currentDiaryKeyRef = useRef(diary ? (diary.id || diary.date) : null);

  // diary prop이 변경될 때 (사용자가 다른 날짜나 다른 일기를 선택했을 때만) 상태 초기화
  useEffect(() => {
    if (!diary) return;
    const newKey = diary.id || diary.date;
    // 같은 일기 내에서 background sync나 부모 컴포넌트 리렌더링 시에는 작성 중인 내용을 덮어쓰거나 글상자를 닫지 않음
    if (currentDiaryKeyRef.current !== newKey) {
      currentDiaryKeyRef.current = newKey;
      const normalized = normalizeDiaryLayers(diary);
      layerOrderCounterRef.current = normalized.maxOrder;
      setTitle(diary.title || '');
      setDate(diary.date || getLocalTodayStr());
      setWeather(upgradePresetSvgUrl(diary.weather || diary.thumbnailMood || ''));
      setPaperStyle(diary.paperStyle || 'lined');
      setTextBlocks(normalized.textBlocks);
      setStickers(normalized.stickers);
      setStrokesHistory(normalized.strokes);
      setHistoryIndex(normalized.strokes.length ? normalized.strokes.length - 1 : -1);
      setSelectedTextId(null);
      setSelectedStickerId(null);
      setActiveToolMode(getDefaultToolMode());
    }
  }, [diary?.id, diary?.date]);

  // 컬러 피커 인풋 레퍼런스
  const colorPickerInputRef = useRef(null);

  // 레퍼런스
  const editorRootRef = useRef(null);
  const canvasRef = useRef(null);
  const canvasContainerRef = useRef(null);
  const isDrawingRef = useRef(false);
  const activePointerIdRef = useRef(null);
  const activePointerTypeRef = useRef(null);
  const lastPenTimeRef = useRef(0);
  const currentStrokeRef = useRef(null);
  const wasTransformingRef = useRef(false);
  const twoFingerTransformRef = useRef(null);
  const textareaRefs = useRef({});
  const newlyCreatedBlockIdRef = useRef(null);

  // 새 글상자 생성 시 preventScroll: true로 포커스하여 Safari 윈도우 스크롤 및 뷰포트 밀림 방지
  useEffect(() => {
    if (selectedTextId && newlyCreatedBlockIdRef.current === selectedTextId) {
      newlyCreatedBlockIdRef.current = null;
      const timer = setTimeout(() => {
        const el = textareaRefs.current[selectedTextId];
        if (el) {
          try {
            el.focus({ preventScroll: true });
          } catch {
            el.focus();
          }
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [selectedTextId]);

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

  // 본문 세로 스크롤 컨테이너 ref 및 가시 영역 높이 감지
  const scrollContainerRef = useRef(null);
  const [containerHeight, setContainerHeight] = useState(0);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const updateContainer = () => {
      if (el.clientHeight > 0) {
        setContainerHeight(el.clientHeight);
      }
    };
    updateContainer();
    const ro = new ResizeObserver(updateContainer);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 컨텐츠(필기 스트로크, 스티커, 텍스트)의 가장 아래쪽 Y 좌표 계산 (실제 렌더링 픽셀)
  const contentMaxBottomPx = useMemo(() => {
    let maxY = 0;
    (stickers || []).forEach((s) => {
      if (!s) return;
      const approxH = (s.height || (s.imageUrl ? 240 : 60)) * (s.scale || 1);
      const bottom = ((s.y || 0) + approxH) * scaleRatio;
      if (bottom > maxY) maxY = bottom;
    });
    (textBlocks || []).forEach((t) => {
      if (!t) return;
      const text = t.text || '';
      // 줄바꿈 및 글자수에 따른 동적 높이 계산 (줄바꿈이 길거나 텍스트 박스가 많을 때 잘림 없이 하단 스크롤 확보)
      const lineCount = text.split('\n').reduce((acc, line) => {
        const estWrapped = Math.max(1, Math.ceil((line.length * 12) / (t.width || CANONICAL_WIDTH)));
        return acc + estWrapped;
      }, 0);
      const approxLineH = Math.max(26, Math.round((t.fontSize || 18) * 1.5));
      const approxHeight = Math.max(50, lineCount * approxLineH + 24) * (t.scale || 1);
      const measuredHeight = textareaRefs.current?.[t.id]?.offsetHeight
        ? (textareaRefs.current[t.id].offsetHeight / (scaleRatio || 1))
        : 0;
      const blockH = Math.max(approxHeight, measuredHeight);
      const bottom = ((t.y || 0) + blockH) * scaleRatio;
      if (bottom > maxY) maxY = bottom;
    });
    (strokesHistory || []).forEach((stroke) => {
      if (!stroke) return;
      (stroke.points || []).forEach((pt) => {
        if (!pt) return;
        const bottom = pt.y * scaleRatio;
        if (bottom > maxY) maxY = bottom;
      });
    });
    return maxY;
  }, [stickers, textBlocks, strokesHistory, scaleRatio]);

  // 모바일/태블릿 가상 키보드 높이 감지 (툴바가 키보드 위로 올라오도록 오프셋 계산)
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  // 속지 최소 높이 동적 계산:
  // 1) 기본적으로 화면 높이보다 380px 더 길어서, 항상 하단 플로팅 툴바 위로 넉넉하게 스크롤 가능
  // 2) 컨텐츠(손글씨, 스티커, 사진)가 아래로 내려갈수록 바닥 아래 380px 여유 공간을 두고 무한 확장되어 절대 잘리지 않음
  // 3) 가상 키보드 활성화 시 글상자가 키보드 위로 편안하게 스크롤될 수 있도록 하단 여백 추가 확보
  const paperHeightPx = useMemo(() => {
    const extraBottom = keyboardOffset > 0 ? 460 : 380;
    const baseMin = (containerHeight > 0 ? containerHeight : 700) + extraBottom;
    const contentNeeded = contentMaxBottomPx > 0 ? contentMaxBottomPx + extraBottom : 0;
    return Math.round(Math.max(baseMin, contentNeeded));
  }, [containerHeight, contentMaxBottomPx, keyboardOffset]);

  // 이벤트 리스너 및 타이머 내 최신 상태 동기화용 refs
  const selectedTextIdRef = useRef(selectedTextId);
  useEffect(() => { selectedTextIdRef.current = selectedTextId; }, [selectedTextId]);
  const textBlocksRef = useRef(textBlocks);
  useEffect(() => { textBlocksRef.current = textBlocks; }, [textBlocks]);
  const scaleRatioRef = useRef(scaleRatio);
  useEffect(() => { scaleRatioRef.current = scaleRatio; }, [scaleRatio]);
  const keyboardOffsetRef = useRef(keyboardOffset);
  useEffect(() => { keyboardOffsetRef.current = keyboardOffset; }, [keyboardOffset]);

  // 선택/편집 중인 글상자가 가상 키보드나 하단 툴바에 가려지지 않도록 안전 가시 영역으로 자동 스크롤
  // 모든 동적 값은 ref를 통해 참조하므로 함수 참조가 영구적으로 불변(stable) 유지됨
  const ensureTextBlockVisible = useCallback((blockId, options = {}) => {
    const scrollEl = scrollContainerRef.current;
    if (!scrollEl) return;

    const currentBlocks = Array.isArray(textBlocksRef.current) 
      ? textBlocksRef.current 
      : (Array.isArray(textBlocks) ? textBlocks : []);
    const block = currentBlocks.find(b => b && b.id === blockId);
    if (!block) return;

    const sRatio = scaleRatioRef.current || 1;
    const kbOffset = keyboardOffsetRef.current || 0;

    const topPx = Math.round((block.y || 0) * sRatio);
    const textareaEl = textareaRefs.current ? textareaRefs.current[blockId] : null;
    const blockHeight = textareaEl ? textareaEl.offsetHeight : Math.max(32, Math.round(36 * sRatio));
    const bottomPx = topPx + blockHeight;

    const currentScrollTop = scrollEl.scrollTop;
    const containerH = scrollEl.clientHeight;

    // 하단 툴바(약 60~68px) 및 키보드 감안 안전 영역 하단 한계 (여유 마진 포함)
    const safeBottomMargin = (kbOffset > 0 ? 80 : 70);
    const safeVisibleHeight = Math.max(120, containerH - safeBottomMargin);

    // 1) 텍스트 블록의 하단이 안전 가시 영역보다 아래로 내려간 경우 (툴바/키보드와 겹치거나 가려짐)
    if (bottomPx > currentScrollTop + safeVisibleHeight) {
      // 텍스트 블록 상단이 안전 가시 영역의 약 30% 지점에 여유 있게 위치하도록 부드럽게 스크롤
      const targetScroll = Math.max(0, Math.round(topPx - (safeVisibleHeight * 0.3)));
      scrollEl.scrollTo({
        top: targetScroll,
        behavior: options.instant ? 'auto' : 'smooth'
      });
    }
    // 2) 텍스트 블록 상단이 상단 헤더 뒤로 숨겨진 경우
    else if (topPx < currentScrollTop + 15) {
      const targetScroll = Math.max(0, Math.round(topPx - 20));
      scrollEl.scrollTo({
        top: targetScroll,
        behavior: options.instant ? 'auto' : 'smooth'
      });
    }

    if (window.scrollY > 2 || window.scrollX > 2) {
      window.scrollTo(0, 0);
    }
  }, []);

  useEffect(() => {
    const vv = window.visualViewport;

    const updateKeyboardPosition = () => {
      // iOS Safari에서 창 스크롤이 발생했을 경우 즉시 0으로 원복하여 상단 바 잘림 및 위치 어긋남 방지
      if (window.scrollY !== 0 || window.scrollX !== 0) {
        window.scrollTo(0, 0);
      }
      if (document.body && document.body.scrollTop !== 0) {
        document.body.scrollTop = 0;
      }
      if (document.documentElement && document.documentElement.scrollTop !== 0) {
        document.documentElement.scrollTop = 0;
      }

      if (!window.visualViewport) {
        setKeyboardOffset(0);
        return;
      }

      const viewport = window.visualViewport;
      // 1) 뷰포트 높이 차이로 키보드 활성화 여부 감지
      // window.innerHeight (전체 화면 높이) - viewport.height (실제 보이는 뷰포트 높이)
      const rawDiff = window.innerHeight - viewport.height;

      // 2) 가상 키보드는 최소 150px 이상 (아이폰/아이패드/안드로이드 기준 200~380px)
      // 주소창 최소화 등의 60px 이하 미세 변화는 키보드로 간주하지 않음
      const isKeyboardActive = rawDiff > 60;
      const calculatedOffset = isKeyboardActive ? Math.round(rawDiff) : 0;

      setKeyboardOffset(calculatedOffset);

      if (isKeyboardActive && selectedTextIdRef.current) {
        const tid = selectedTextIdRef.current;
        setTimeout(() => ensureTextBlockVisible(tid), 60);
        setTimeout(() => ensureTextBlockVisible(tid), 200);
      }
    };

    updateKeyboardPosition();

    if (vv) {
      vv.addEventListener('resize', updateKeyboardPosition);
      vv.addEventListener('scroll', updateKeyboardPosition);
    }
    window.addEventListener('resize', updateKeyboardPosition);
    window.addEventListener('scroll', updateKeyboardPosition);

    // 포커스 진입/이탈 시 iOS 키보드 슬라이드 애니메이션(300ms)에 맞춘 다단계 오프셋 보정
    const handleFocusIn = (e) => {
      if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT')) {
        updateKeyboardPosition();
        setTimeout(updateKeyboardPosition, 50);
        setTimeout(updateKeyboardPosition, 150);
        setTimeout(updateKeyboardPosition, 300);
        setTimeout(updateKeyboardPosition, 500);

        if (selectedTextIdRef.current) {
          const tid = selectedTextIdRef.current;
          setTimeout(() => ensureTextBlockVisible(tid), 80);
          setTimeout(() => ensureTextBlockVisible(tid), 250);
          setTimeout(() => ensureTextBlockVisible(tid), 450);
        }
      }
    };

    const handleFocusOut = () => {
      setTimeout(updateKeyboardPosition, 50);
      setTimeout(updateKeyboardPosition, 200);
      setTimeout(updateKeyboardPosition, 400);
    };

    window.addEventListener('focusin', handleFocusIn);
    window.addEventListener('focusout', handleFocusOut);

    return () => {
      if (vv) {
        vv.removeEventListener('resize', updateKeyboardPosition);
        vv.removeEventListener('scroll', updateKeyboardPosition);
      }
      window.removeEventListener('resize', updateKeyboardPosition);
      window.removeEventListener('scroll', updateKeyboardPosition);
      window.removeEventListener('focusin', handleFocusIn);
      window.removeEventListener('focusout', handleFocusOut);
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

  // 태블릿/모바일 터치 환경에서 펜 모드 중에도 2손가락 드래그 시 부드러운 화면 스크롤 지원 및 애플펜슬 롱프레스 툴팁 방지
  useEffect(() => {
    const canvas = canvasRef.current;
    const scrollEl = scrollContainerRef.current;
    if (!canvas || !scrollEl) return;

    let touchStartY = 0;
    let isTwoFingerScroll = false;

    const onTouchStart = (e) => {
      if (e.touches && e.touches.length >= 2) {
        isTwoFingerScroll = true;
        touchStartY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        isDrawingRef.current = false;
        activePointerIdRef.current = null;
        activePointerTypeRef.current = null;
        currentStrokeRef.current = null;
        clearOverlayCanvas();
      } else {
        isTwoFingerScroll = false;
        // 단일 손가락 또는 애플펜슬 필기 시 iOS Safari 롱프레스 툴팁/콜아웃(공유, 복사 등) 즉시 방지
        if (activeToolMode === 'pen' && e.cancelable) {
          e.preventDefault();
        }
      }
    };

    const onTouchMove = (e) => {
      if (isTwoFingerScroll && e.touches && e.touches.length >= 2) {
        if (e.cancelable) e.preventDefault();
        const currentY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const deltaY = currentY - touchStartY;
        touchStartY = currentY;
        scrollEl.scrollTop -= deltaY;
      } else if (activeToolMode === 'pen' && e.cancelable) {
        // 단일 손가락 또는 애플펜슬 필기 시 기본 제스처 억제
        e.preventDefault();
      }
    };

    const onTouchEnd = (e) => {
      if (!e.touches || e.touches.length < 2) {
        isTwoFingerScroll = false;
      }
    };

    // 아이패드 애플펜슬 롱프레스 시 발생하는 Safari 컨텍스트 메뉴(공유/복사 툴팁) 캡처 단계에서 완벽 차단
    const onContextMenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      return false;
    };

    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);
    canvas.addEventListener('touchcancel', onTouchEnd);
    canvas.addEventListener('contextmenu', onContextMenu, { capture: true });

    return () => {
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      canvas.removeEventListener('touchcancel', onTouchEnd);
      canvas.removeEventListener('contextmenu', onContextMenu, { capture: true });
    };
  }, [clearOverlayCanvas, activeToolMode]);

  // 아이패드 및 모바일 기기에서 펜슬 필기 중 롱프레스 시 Safari 시스템 메뉴(공유/복사) 전역 차단
  useEffect(() => {
    const handleGlobalContextMenu = (e) => {
      if (activeToolMode === 'pen') {
        const target = e.target;
        if (editorRootRef.current && editorRootRef.current.contains(target)) {
          if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
            e.preventDefault();
            e.stopPropagation();
            return false;
          }
        }
      }
    };

    window.addEventListener('contextmenu', handleGlobalContextMenu, { capture: true });
    return () => {
      window.removeEventListener('contextmenu', handleGlobalContextMenu, { capture: true });
    };
  }, [activeToolMode]);

  // 좌표 계산 (반응형 찌그러짐 방지: 가로 너비 기준 uniformScale로 x, y 모두 동일 배율 역변환)
  const getCoordinates = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
    const clientY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : 0);

    const uniformScale = rect.width > 0 ? rect.width / CANONICAL_WIDTH : 1;

    const x = (clientX - rect.left) / uniformScale;
    const y = (clientY - rect.top) / uniformScale;
    const maxCanonicalY = rect.height > 0 && uniformScale > 0 ? rect.height / uniformScale : CANONICAL_HEIGHT;

    return {
      x: Math.max(0, Math.min(CANONICAL_WIDTH, x)),
      y: Math.max(0, Math.min(maxCanonicalY, y)),
    };
  };

  // 드로잉 이벤트 (아이패드 애플펜슬 필기 및 모바일/스마트폰 손가락 손글씨 입력 완벽 지원)
  const handlePointerDown = (e) => {
    if (isViewMode || activeToolMode !== 'pen') return;

    // 이미 특정 포인터로 스트로크를 그리는 중인 경우 다른 멀티터치 간섭 차단
    if (isDrawingRef.current && activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) {
      return;
    }

    const isPen = e.pointerType === 'pen';
    const isTouch = e.pointerType === 'touch';

    if (isPen) {
      lastPenTimeRef.current = Date.now();
    }

    // 스마트 팜 리젝션 (Palm Rejection):
    if (isTouch) {
      // 1) 애플펜슬로 필기 중인 도중에 화면에 닿는 손바닥 터치는 100% 무시
      if (isDrawingRef.current && activePointerTypeRef.current === 'pen') {
        return;
      }

      // 2) 최근(1.2초 이내) 애플펜슬을 사용한 상태(아이패드 등)에서 발생하는 손바닥 접촉 차단
      if (Date.now() - lastPenTimeRef.current < 1200) {
        return;
      }

      // 3) 손바닥(Palm) 면적 기반 필터링:
      // 스마트폰이나 태블릿에서 일반 손가락 끝(Fingertip) 필기 터치는 접촉 폭이 약 25~45px 범위입니다.
      // 반면 화면에 닿은 손바닥/손날 면적은 70px 이상으로 매우 넓습니다.
      const contactW = e.width || 0;
      const contactH = e.height || 0;
      const isPalmContact =
        (contactW > 65 && contactH > 65) ||
        contactW > 85 ||
        contactH > 85;

      if (isPalmContact) {
        return;
      }
    }

    if (e.cancelable) {
      e.preventDefault();
    }
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (e.target.setPointerCapture && e.pointerId) {
      try {
        e.target.setPointerCapture(e.pointerId);
      } catch (err) {}
    }

    activePointerIdRef.current = e.pointerId;
    activePointerTypeRef.current = e.pointerType;

    const { x, y } = getCoordinates(e);

    isDrawingRef.current = true;
    currentStrokeRef.current = {
      tool: activePenTool,
      color: penColor,
      size: penSize,
      layerOrder: getNextLayerOrder(),
      points: [{ x, y }]
    };

    // 점 찍기(단일 탭) 시 오버레이 캔버스에 즉각적인 시각 피드백 렌더링
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const uniformScale = rect.width > 0 ? rect.width / CANONICAL_WIDTH : 1;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr * uniformScale, dpr * uniformScale);

    if (activePenTool === 'eraser') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(250, 250, 250, 0.85)';
    } else if (activePenTool === 'highlighter') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = penColor;
      ctx.globalAlpha = 0.35;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = penColor;
      ctx.globalAlpha = activePenTool === 'pencil' ? 0.8 : 1.0;
    }

    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.6, penSize / 2), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  const handlePointerMove = (e) => {
    if (!isDrawingRef.current || activeToolMode !== 'pen') return;
    if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) return;

    if (e.pointerType === 'pen') {
      lastPenTimeRef.current = Date.now();
    }

    if (e.cancelable) {
      e.preventDefault();
    }
    const canvas = canvasRef.current;
    if (!canvas || !currentStrokeRef.current) return;

    // 애플펜슬 고주파수 Coalesced Events 지원 (지원 브라우저에서 중간 지점 누락 방지)
    const events = (typeof e.getCoalescedEvents === 'function' && e.getCoalescedEvents().length > 0)
      ? e.getCoalescedEvents()
      : [e];

    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    // 세로 찌그러짐 방지: 가로 너비 기준의 균일 정비율 스케일링
    const uniformScale = rect.width > 0 ? rect.width / CANONICAL_WIDTH : 1;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr * uniformScale, dpr * uniformScale);

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

    const pts = currentStrokeRef.current.points;

    for (let i = 0; i < events.length; i++) {
      const { x: rawX, y: rawY } = getCoordinates(events[i]);
      const lastPt = pts[pts.length - 1];

      // 1. 미세 센서 노이즈/손떨림 필터링: 직전 좌표와 거리가 1.2px 미만인 미세한 지터는 제외
      const dist = Math.hypot(rawX - lastPt.x, rawY - lastPt.y);
      if (dist < 1.2) continue;

      // 2. 가중 지수 이동 평균(EMA)으로 고주파 떨림을 매끄럽게 흡수
      const smoothedX = lastPt.x * 0.2 + rawX * 0.8;
      const smoothedY = lastPt.y * 0.2 + rawY * 0.8;

      pts.push({ x: smoothedX, y: smoothedY });

      // 3. 실시간 2차 베지어 곡선(Midpoint Quadratic Curve) 렌더링으로 직선 꺾임/지터 원천 제거
      if (pts.length === 2) {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        ctx.lineTo(pts[1].x, pts[1].y);
        ctx.stroke();
      } else if (pts.length > 2) {
        const p0 = pts[pts.length - 3];
        const p1 = pts[pts.length - 2];
        const p2 = pts[pts.length - 1];

        const mid1 = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
        const mid2 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

        ctx.beginPath();
        ctx.moveTo(mid1.x, mid1.y);
        ctx.quadraticCurveTo(p1.x, p1.y, mid2.x, mid2.y);
        ctx.stroke();
      }
    }

    ctx.restore();
  };

  const handlePointerUp = (e) => {
    if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) return;
    if (!isDrawingRef.current || activeToolMode !== 'pen') return;
    if (e.cancelable) {
      e.preventDefault();
    }
    isDrawingRef.current = false;
    activePointerIdRef.current = null;
    activePointerTypeRef.current = null;

    if (e.target.releasePointerCapture && e.pointerId) {
      try {
        e.target.releasePointerCapture(e.pointerId);
      } catch (err) {}
    }

    clearOverlayCanvas();

    if (currentStrokeRef.current) {
      const pts = currentStrokeRef.current.points;
      // 점(Dot)을 찍은 경우에도 정상 보존되도록 단일 점을 최소 2점으로 확장
      if (pts.length === 1) {
        pts.push({ x: pts[0].x + 0.1, y: pts[0].y + 0.1 });
      }

      if (pts.length >= 2) {
        const newHistory = strokesHistory.slice(0, historyIndex + 1);
        newHistory.push(currentStrokeRef.current);
        setStrokesHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
      }
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

  // 텍스트 블록 생성 (드로잉이 있다면 드로잉이 끝나는 Y축 시점에 생성, 기본 폰트: 16px, 가로: 100%)
  const handleAddTextBlock = () => {
    // 0) 이미 내용이 미입력된 빈 글상자가 있다면 새로 아래에 만들지 않고 기존 빈 글상자 위치(동일 위치) 유지 및 포커스
    const selectedBlock = textBlocks.find(tb => tb.id === selectedTextId);
    const isSelectedEmpty = selectedBlock && (!selectedBlock.text || selectedBlock.text.trim().length === 0);

    // 현재 선택된 빈 글상자가 있으면 우선 재사용, 없으면 가장 마지막(최신) 빈 글상자 재사용
    const existingEmptyBlock = isSelectedEmpty 
      ? selectedBlock 
      : [...textBlocks].reverse().find(tb => !tb.text || tb.text.trim().length === 0);

    if (existingEmptyBlock) {
      // 혹시 여러 개의 빈 글상자가 중복 생성되어 있었다면 하나만 남기고 정리
      const cleanedBlocks = textBlocks.filter(
        tb => tb.id === existingEmptyBlock.id || (tb.text && tb.text.trim().length > 0)
      );
      if (cleanedBlocks.length !== textBlocks.length) {
        setTextBlocks(cleanedBlocks);
      }

      setSelectedTextId(existingEmptyBlock.id);
      setSelectedStickerId(null);
      setActiveToolMode('text');

      // 현재 선택된 펜 색상으로 텍스트 색상 동기화
      if (penColor && existingEmptyBlock.color !== penColor) {
        updateTextBlock(existingEmptyBlock.id, { color: penColor });
      }

      // textarea에 포커스 부여
      setTimeout(() => {
        const textareaEl = textareaRefs.current?.[existingEmptyBlock.id];
        if (textareaEl) {
          textareaEl.focus();
        }
      }, 50);

      setTimeout(() => ensureTextBlockVisible(existingEmptyBlock.id), 60);
      setTimeout(() => ensureTextBlockVisible(existingEmptyBlock.id), 250);
      return;
    }

    // 1) 활성 드로잉(손글씨/펜) 중 가장 아래쪽(최대 Y축) 좌표 탐색
    const activeStrokes = strokesHistory.slice(0, historyIndex + 1);
    let maxDrawingY = 0;
    activeStrokes.forEach((stroke) => {
      if (stroke.tool === 'eraser') return;
      (stroke.points || []).forEach((pt) => {
        if (typeof pt.y === 'number' && pt.y > maxDrawingY) {
          maxDrawingY = pt.y;
        }
      });
    });

    // 2) 내용이 있는 기존 텍스트 블록들의 바닥 Y 좌표 계산 (중복 겹침 방지)
    const nonEmptyBlocks = textBlocks.filter((tb) => tb.text && tb.text.trim().length > 0);
    let maxTextBottomY = 0;
    nonEmptyBlocks.forEach((tb) => {
      const lineCount = Math.max(1, (tb.text || '').split('\n').length);
      const approxHeight = Math.max(28, lineCount * (tb.fontSize || 18) * 1.5) * (tb.scale || 1);
      const bottom = (tb.y || 0) + approxHeight;
      if (bottom > maxTextBottomY) {
        maxTextBottomY = bottom;
      }
    });

    let newY = 20;
    if (maxDrawingY > 0) {
      // 드로잉이 끝나는 시점 바로 아래에 생성
      newY = Math.round(maxDrawingY + 12);
      // 만약 이미 그 아래에 작성된 글상자가 있다면 겹치지 않게 그 아래로 배치
      if (maxTextBottomY > newY) {
        newY = Math.round(maxTextBottomY + 12);
      }
    } else {
      if (maxTextBottomY > 0) {
        newY = Math.round(maxTextBottomY + 12);
      } else {
        newY = 20;
      }
    }

    const newId = `t-${Date.now()}`;
    const newBlock = {
      id: newId,
      text: '',
      fontFamily: "'Paperlogy', sans-serif",
      fontWeight: 600,
      fontSize: 18,
      color: penColor || '#111111',
      textAlign: 'left',
      x: 0,
      y: newY,
      width: CANONICAL_WIDTH,
      rotation: 0,
      scale: 1,
      layerOrder: getNextLayerOrder(),
    };
    newlyCreatedBlockIdRef.current = newId;
    setTextBlocks(prev => [...prev.filter(tb => tb.text && tb.text.trim().length > 0), newBlock]);
    setSelectedTextId(newId);
    setSelectedStickerId(null);
    setActiveToolMode('text');
    if (window.scrollY > 2 || window.scrollX > 2) {
      window.scrollTo(0, 0);
    }

    // 새로 생성된 글상자의 textarea에 포커스 전달
    setTimeout(() => {
      const textareaEl = textareaRefs.current?.[newId];
      if (textareaEl) {
        textareaEl.focus();
      }
    }, 50);

    // 새로 생성된 글상자가 키보드나 하단 툴바 뒤에 가려지지 않도록 안전 가시 영역으로 자동 스크롤
    setTimeout(() => ensureTextBlockVisible(newId), 60);
    setTimeout(() => ensureTextBlockVisible(newId), 250);
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
    if (e.cancelable) e.preventDefault();

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
      startScrollTop: scrollContainerRef.current?.scrollTop || 0,
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

  // 오브젝트(스티커/텍스트) 직접 크기조절(resize)/너비조절(width) 및 회전(rotate) 시작 핸들러
  const handleTransformStart = (e, mode, itemType, item) => {
    e.stopPropagation();
    if (e.cancelable) e.preventDefault();

    const boxEl = e.currentTarget.closest('[data-object-box="true"]');
    if (!boxEl) return;

    const { clientX, clientY } = getEventClientCoords(e);

    // 가로 너비 조절 모드 (텍스트 박스 전용: 줄바꿈 변경)
    if (mode === 'width') {
      setDraggingItem(null);
      setTransformingItem({
        mode: 'width',
        itemType, // 'text'
        id: item.id,
        startX: clientX,
        startY: clientY,
        origWidth: item.width || CANONICAL_WIDTH,
        origScale: item.scale || 1,
        origRotation: item.rotation || 0,
        origX: item.x || 0,
      });
      setSelectedTextId(item.id);
      setSelectedStickerId(null);
      setActiveToolMode('text');
      return;
    }

    const rect = boxEl.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

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

        // 1) 가로 너비 조절 (글상자 줄바꿈 변경)
        if (transformingItem.mode === 'width') {
          const paperRect = canvasContainerRef.current?.getBoundingClientRect();
          const uniformScale = paperRect && paperRect.width > 0 ? paperRect.width / CANONICAL_WIDTH : 1;
          const currentScale = transformingItem.origScale || 1;

          // 로컬 회전각 투영 계산 (회전된 글상자에서도 자연스럽게 너비 조절)
          const rad = ((transformingItem.origRotation || 0) * Math.PI) / 180;
          const cos = Math.cos(rad);
          const sin = Math.sin(rad);
          const rawDx = (clientX - transformingItem.startX) / uniformScale;
          const rawDy = (clientY - transformingItem.startY) / uniformScale;
          const localDeltaX = (rawDx * cos + rawDy * sin) / currentScale;

          const minW = 60;
          const maxW = CANONICAL_WIDTH;
          const newWidth = Math.max(minW, Math.min(maxW, Math.round(transformingItem.origWidth + localDeltaX)));
          updateTextBlock(transformingItem.id, { width: newWidth });
          return;
        }

        // 2) 회전 조절
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
          // 3) 전체 확대/축소 (CSS scale 변형으로 줄바꿈은 100% 동일하게 유지)
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
        const uniformScale = paperRect && paperRect.width > 0 ? paperRect.width / CANONICAL_WIDTH : 1;
        const currentScroll = scrollContainerRef.current?.scrollTop || 0;
        const scrollDeltaY = (currentScroll - (draggingItem.startScrollTop || 0)) / uniformScale;
        const deltaX = (clientX - draggingItem.startX) / uniformScale;
        const deltaY = ((clientY - draggingItem.startY) / uniformScale) + scrollDeltaY;
        const maxCanonicalY = paperRect && paperRect.height > 0 && uniformScale > 0 ? paperRect.height / uniformScale : CANONICAL_HEIGHT;

        const newX = Math.max(0, Math.min(CANONICAL_WIDTH - 20, draggingItem.origX + deltaX));
        const newY = Math.max(0, Math.min(maxCanonicalY - 20, draggingItem.origY + deltaY));

        if (draggingItem.type === 'text') {
          updateTextBlock(draggingItem.id, { x: newX, y: newY });

          // 모바일/태블릿 화면 하단(키보드/툴바) 근처로 드래그 시 속지 부드러운 자동 스크롤
          if (scrollContainerRef.current) {
            const containerRect = scrollContainerRef.current.getBoundingClientRect();
            const bottomThreshold = containerRect.bottom - (keyboardOffsetRef.current > 0 ? 85 : 65);
            const topThreshold = containerRect.top + 40;

            if (clientY > bottomThreshold && clientY < containerRect.bottom + 60) {
              const scrollStep = Math.min(20, Math.max(4, (clientY - bottomThreshold) * 0.35));
              scrollContainerRef.current.scrollTop += scrollStep;
            } else if (clientY < topThreshold && clientY > containerRect.top - 40) {
              const scrollStep = Math.min(20, Math.max(4, (topThreshold - clientY) * 0.35));
              scrollContainerRef.current.scrollTop -= scrollStep;
            }
          }
        } else if (draggingItem.type === 'sticker') {
          updateSticker(draggingItem.id, { x: newX, y: newY });
        }
      }
    };

    const handleGlobalUp = () => {
      const finishedDrag = draggingItem;
      if (draggingItem || transformingItem) {
        wasTransformingRef.current = true;
        setTimeout(() => {
          wasTransformingRef.current = false;
        }, 200);
      }
      setDraggingItem(null);
      setTransformingItem(null);

      // 드래그가 끝났을 때 글상자가 하단 키보드/툴바에 가려지지 않도록 안전 가시 영역으로 자동 보정
      if (finishedDrag && finishedDrag.type === 'text') {
        const finishedId = finishedDrag.id;
        setTimeout(() => ensureTextBlockVisible(finishedId), 50);
        setTimeout(() => ensureTextBlockVisible(finishedId), 200);
      }
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

  // 텍스트 블록/스티커 2손가락 핀치 줌(확대/축소) 및 회전 제스처 처리
  useEffect(() => {
    const handleGlobalTouchMove = (e) => {
      if (!twoFingerTransformRef.current) return;
      if (!e.touches || e.touches.length < 2) return;

      if (e.cancelable) e.preventDefault();

      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const currentDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const currentAngle = Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX) * (180 / Math.PI);
      const currentMidX = (t1.clientX + t2.clientX) / 2;
      const currentMidY = (t1.clientY + t2.clientY) / 2;

      const {
        id,
        itemType,
        startDist,
        startAngle,
        startScale,
        startRotation,
        startX,
        startY,
        startMidX,
        startMidY,
      } = twoFingerTransformRef.current;

      // 1) 핀치 줌 (확대/축소: CSS scale 변형으로 줄바꿈은 그대로 유지)
      const ratio = currentDist / Math.max(10, startDist);
      const newScale = Math.min(4.0, Math.max(0.35, Number((startScale * ratio).toFixed(2))));

      // 2) 회전 (두 손가락 각도 변화)
      const deltaAngle = currentAngle - startAngle;
      const newRotation = Math.round((startRotation + deltaAngle) % 360);

      // 3) 이동 (두 손가락 중심점 이동)
      const paperRect = canvasContainerRef.current?.getBoundingClientRect();
      const uniformScale = paperRect && paperRect.width > 0 ? paperRect.width / CANONICAL_WIDTH : 1;
      const deltaX = (currentMidX - startMidX) / uniformScale;
      const deltaY = (currentMidY - startMidY) / uniformScale;
      const maxCanonicalY =
        paperRect && paperRect.height > 0 && uniformScale > 0
          ? paperRect.height / uniformScale
          : CANONICAL_HEIGHT;

      const newX = Math.max(0, Math.min(CANONICAL_WIDTH - 20, startX + deltaX));
      const newY = Math.max(0, Math.min(maxCanonicalY - 20, startY + deltaY));

      if (itemType === 'text') {
        updateTextBlock(id, {
          scale: newScale,
          rotation: newRotation,
          x: newX,
          y: newY,
        });
      } else {
        updateSticker(id, {
          scale: newScale,
          rotation: newRotation,
          x: newX,
          y: newY,
        });
      }
    };

    const handleGlobalTouchEnd = (e) => {
      if (twoFingerTransformRef.current && (!e.touches || e.touches.length < 2)) {
        wasTransformingRef.current = true;
        setTimeout(() => {
          wasTransformingRef.current = false;
        }, 200);
        twoFingerTransformRef.current = null;
      }
    };

    window.addEventListener('touchmove', handleGlobalTouchMove, { passive: false });
    window.addEventListener('touchend', handleGlobalTouchEnd);
    window.addEventListener('touchcancel', handleGlobalTouchEnd);

    return () => {
      window.removeEventListener('touchmove', handleGlobalTouchMove);
      window.removeEventListener('touchend', handleGlobalTouchEnd);
      window.removeEventListener('touchcancel', handleGlobalTouchEnd);
    };
  }, []);

  // 데스크톱 트랙패드 핀치-투-줌 (Ctrl + Wheel) 지원
  useEffect(() => {
    const handleWheel = (e) => {
      if (e.ctrlKey && selectedTextId) {
        e.preventDefault();
        const block = textBlocks.find(b => b.id === selectedTextId);
        if (block) {
          const factor = e.deltaY < 0 ? 1.05 : 0.95;
          const currentScale = block.scale || 1;
          const newScale = Math.min(4.0, Math.max(0.35, Number((currentScale * factor).toFixed(2))));
          updateTextBlock(block.id, { scale: newScale });
        }
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      window.removeEventListener('wheel', handleWheel);
    };
  }, [selectedTextId, textBlocks]);

  // 와이드 화면 저장 완료 토스트 팝업 상태
  const [toastMessage, setToastMessage] = useState('');
  const toastTimerRef = useRef(null);

  const showToast = (message = '저장되었습니다.') => {
    setToastMessage(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage('');
    }, 2400);
  };

  // 현재 일기 인덱스 및 이전/다음 존재 여부 계산
  const { hasNextDiary, hasPrevDiary } = useMemo(() => {
    const sorted = [...(diaries || [])].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const currentIdx = sorted.findIndex(
      (d) => d.id === diary?.id || d.date === date
    );
    return {
      hasNextDiary: currentIdx !== -1 && currentIdx < sorted.length - 1,
      hasPrevDiary: currentIdx > 0,
    };
  }, [diaries, diary?.id, date]);

  // 뷰 모드에서 좌우 스와이프로 이전/이후 일기 탐색 (3D 달력 책장 넘김 전환 및 햅틱 효과)
  const handleSwipeNavigation = (direction) => {
    if (!onNavigateDiary || exitAnimation) return;
    if (direction === 'next') {
      if (hasNextDiary) {
        triggerHaptic('pageTurn');
        setExitAnimation('anim-page-exit-left');
        setTimeout(() => {
          onNavigateDiary('next');
        }, 180);
      } else {
        triggerHaptic('boundary');
        showToast('가장 최근 일기입니다.');
        setDragX(0);
      }
    } else if (direction === 'prev') {
      if (hasPrevDiary) {
        triggerHaptic('pageTurn');
        setExitAnimation('anim-page-exit-right');
        setTimeout(() => {
          onNavigateDiary('prev');
        }, 180);
      } else {
        triggerHaptic('boundary');
        showToast('가장 첫 번째 일기입니다.');
        setDragX(0);
      }
    }
  };

  const viewSwipeTouchStartRef = useRef(null);
  const isSwipingHorizontallyRef = useRef(false);
  const viewSwipeMouseDownRef = useRef(null);

  // 터치 스와이프 시작
  const handleViewTouchStart = (e) => {
    if (!isViewMode || !e.touches || e.touches.length !== 1 || exitAnimation) return;
    viewSwipeTouchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now()
    };
    isSwipingHorizontallyRef.current = false;
  };

  // 터치 스와이프 드래그 (실시간 달력 넘김 이동)
  const handleViewTouchMove = (e) => {
    if (!isViewMode || !viewSwipeTouchStartRef.current || !e.touches || e.touches.length !== 1 || exitAnimation) return;
    const touch = e.touches[0];
    const dx = touch.clientX - viewSwipeTouchStartRef.current.x;
    const dy = touch.clientY - viewSwipeTouchStartRef.current.y;

    if (!isSwipingHorizontallyRef.current && Math.abs(dx) > 10) {
      if (Math.abs(dx) > Math.abs(dy) * 1.2) {
        isSwipingHorizontallyRef.current = true;
        setIsPageDragging(true);
      }
    }

    if (isSwipingHorizontallyRef.current) {
      if (e.cancelable) e.preventDefault();
      // 경계 도달 시 고무줄 저항감 (Rubber-band effect)
      let effectiveDx = dx;
      if (dx < 0 && !hasNextDiary) effectiveDx = dx * 0.25;
      if (dx > 0 && !hasPrevDiary) effectiveDx = dx * 0.25;
      setDragX(effectiveDx);
    }
  };

  // 터치 스와이프 종료 (임계값 도달 시 책장 넘김 전환 및 햅틱)
  const handleViewTouchEnd = () => {
    if (!isViewMode || !viewSwipeTouchStartRef.current) {
      viewSwipeTouchStartRef.current = null;
      isSwipingHorizontallyRef.current = false;
      setIsPageDragging(false);
      setDragX(0);
      return;
    }
    viewSwipeTouchStartRef.current = null;
    const wasSwiping = isSwipingHorizontallyRef.current;
    isSwipingHorizontallyRef.current = false;
    setIsPageDragging(false);

    if (!wasSwiping) {
      setDragX(0);
      return;
    }

    const currentDx = dragX;
    if (currentDx < -50) {
      if (hasNextDiary) {
        triggerHaptic('pageTurn');
        setExitAnimation('anim-page-exit-left');
        setDragX(-window.innerWidth);
        setTimeout(() => {
          onNavigateDiary?.('next');
        }, 180);
      } else {
        triggerHaptic('boundary');
        showToast('가장 최근 일기입니다.');
        setDragX(0);
      }
    } else if (currentDx > 50) {
      if (hasPrevDiary) {
        triggerHaptic('pageTurn');
        setExitAnimation('anim-page-exit-right');
        setDragX(window.innerWidth);
        setTimeout(() => {
          onNavigateDiary?.('prev');
        }, 180);
      } else {
        triggerHaptic('boundary');
        showToast('가장 첫 번째 일기입니다.');
        setDragX(0);
      }
    } else {
      setDragX(0);
    }
  };

  // 마우스 드래그 시작
  const handleViewMouseDown = (e) => {
    if (!isViewMode || e.button !== 0 || exitAnimation) return;
    viewSwipeMouseDownRef.current = {
      x: e.clientX,
      y: e.clientY,
      time: Date.now()
    };
    isSwipingHorizontallyRef.current = false;
  };

  // 마우스 드래그 이동
  const handleViewMouseMove = (e) => {
    if (!isViewMode || !viewSwipeMouseDownRef.current || exitAnimation) return;
    const dx = e.clientX - viewSwipeMouseDownRef.current.x;
    const dy = e.clientY - viewSwipeMouseDownRef.current.y;

    if (!isSwipingHorizontallyRef.current && Math.abs(dx) > 10) {
      if (Math.abs(dx) > Math.abs(dy) * 1.2) {
        isSwipingHorizontallyRef.current = true;
        setIsPageDragging(true);
      }
    }

    if (isSwipingHorizontallyRef.current) {
      let effectiveDx = dx;
      if (dx < 0 && !hasNextDiary) effectiveDx = dx * 0.25;
      if (dx > 0 && !hasPrevDiary) effectiveDx = dx * 0.25;
      setDragX(effectiveDx);
    }
  };

  // 마우스 드래그 종료
  const handleViewMouseUp = () => {
    if (!isViewMode || !viewSwipeMouseDownRef.current) {
      viewSwipeMouseDownRef.current = null;
      isSwipingHorizontallyRef.current = false;
      setIsPageDragging(false);
      setDragX(0);
      return;
    }
    viewSwipeMouseDownRef.current = null;
    const wasSwiping = isSwipingHorizontallyRef.current;
    isSwipingHorizontallyRef.current = false;
    setIsPageDragging(false);

    if (!wasSwiping) {
      setDragX(0);
      return;
    }

    const currentDx = dragX;
    if (currentDx < -50) {
      if (hasNextDiary) {
        triggerHaptic('pageTurn');
        setExitAnimation('anim-page-exit-left');
        setDragX(-window.innerWidth);
        setTimeout(() => {
          onNavigateDiary?.('next');
        }, 180);
      } else {
        triggerHaptic('boundary');
        showToast('가장 최근 일기입니다.');
        setDragX(0);
      }
    } else if (currentDx > 50) {
      if (hasPrevDiary) {
        triggerHaptic('pageTurn');
        setExitAnimation('anim-page-exit-right');
        setDragX(window.innerWidth);
        setTimeout(() => {
          onNavigateDiary?.('prev');
        }, 180);
      } else {
        triggerHaptic('boundary');
        showToast('가장 첫 번째 일기입니다.');
        setDragX(0);
      }
    } else {
      setDragX(0);
    }
  };

  // 저장할 내용(텍스트, 손글씨 드로잉, 스티커, 날씨/대표기분 등)이 존재하는지 판단
  const hasContent = useMemo(() => {
    const hasText = (textBlocks || []).some(
      (t) => t && t.text && t.text.trim().length > 0
    );
    const activeStrokes = strokesHistory.slice(0, historyIndex + 1);
    const hasStrokes = activeStrokes.some(
      (s) => s && s.tool !== 'eraser' && Array.isArray(s.points) && s.points.length > 0
    );
    const hasStickers = (stickers || []).length > 0;
    const hasWeather = Boolean(weather);
    const hasCustomTitle = Boolean(title && title.trim());
    return hasText || hasStrokes || hasStickers || hasWeather || hasCustomTitle;
  }, [textBlocks, strokesHistory, historyIndex, stickers, weather, title]);

  // 저장 (저장 완료 후 뷰 모드로 전환 및 편집 아이콘 노출)
  const handleSaveDiary = () => {
    if (isSaving || !hasContent) return;
    setIsSaving(true);
    const sanitizedTextBlocks = (textBlocks || []).filter(t => t && t.text && t.text.trim().length > 0);
    setTextBlocks(sanitizedTextBlocks);

    const upgradedWeather = upgradePresetSvgUrl(weather);
    const finalDiary = {
      id: diary?.id || `entry-${date}-${Date.now()}`,
      title: title || `${yearNum}.${monthNum}.${dayNum} 기록`,
      date,
      weather: upgradedWeather,
      thumbnailMood: upgradedWeather,
      paperStyle,
      textBlocks: sanitizedTextBlocks,
      stickers,
      strokes: strokesHistory.slice(0, historyIndex + 1),
      summary: sanitizedTextBlocks.map(t => t.text).filter(Boolean).join('\n') || ''
    };

    onSave(finalDiary);
    setIsViewMode(true);
    triggerHaptic('medium');
    setTimeout(() => setIsSaving(false), 500);

    // 모바일/와이드 모든 화면에서 저장 토스트 알림 표시
    showToast('저장되었습니다.');
  };

  const currentPaperClass = PAPER_STYLES.find(p => p.id === paperStyle)?.class || 'paper-minimal-lined';
  const selectedText = textBlocks.find(t => t.id === selectedTextId);
  const selectedSticker = stickers.find(s => s.id === selectedStickerId);

  return (
    <div 
      ref={editorRootRef}
      style={{ height: 'var(--app-height, 100%)' }}
      className="flex flex-col h-full bg-[#fafafa] select-none overflow-hidden relative"
    >
      {/* 
        ================================================================
        [상단] 1. 모바일 전용 상단 바: 뒤로가기 + 다이어리 이름 레이블 ─── [ ✔ ]
        - 와이드 화면(lg: >=1024px)에서는 이전 버튼 및 다이어리명이 불필요하므로 완전히 숨김(lg:hidden)
        - 이로써 상단 세로 공간을 최소화함
        ================================================================
      */}
      <div className="w-full px-6 pt-[calc(1.25rem+env(safe-area-inset-top,0px))] pb-2 shrink-0 flex lg:hidden items-center justify-between bg-[#fafafa] z-30 relative">
        <div className="flex items-center space-x-2.5">
          <button
            onClick={() => {
              triggerHaptic('light');
              onBack();
            }}
            className="text-black hover:opacity-70 transition p-1.5 -ml-1.5 rounded-full"
            title="뒤로가기"
          >
            <ArrowLeft size={22} strokeWidth={2.5} />
          </button>
          <span className="text-sm font-semibold text-stone-400 tracking-tight">
            {diaryName || 'Diary'}
          </span>
        </div>

        {/* 모바일 화면 전용 상단 우측 버튼: 뷰 모드일 때는 [ 연필(편집) ], 편집 모드일 때는 [ ✔(저장 완료) ] */}
        {isViewMode ? (
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setIsViewMode(false);
            }}
            className="w-11 h-11 rounded-full bg-stone-900 text-white transition flex items-center justify-center shadow-xs hover:bg-stone-800 active:scale-95 cursor-pointer"
            title="일기 편집하기"
          >
            <Pencil size={19} strokeWidth={2.4} />
          </button>
        ) : (
          <button
            type="button"
            disabled={!hasContent || isSaving}
            onClick={handleSaveDiary}
            className={`w-11 h-11 rounded-full bg-black text-white transition flex items-center justify-center shadow-xs ${
              !hasContent
                ? 'opacity-25 cursor-not-allowed pointer-events-none'
                : 'hover:bg-stone-800 active:scale-95 cursor-pointer'
            }`}
            title={hasContent ? "다이어리 저장" : "저장할 내용이 없습니다"}
          >
            <Check size={20} strokeWidth={3} />
          </button>
        )}
      </div>

      {/* 
        ================================================================
        [본문 슬라이더 래퍼]
        - 뷰 모드 좌우 스와이프 시 실제 책장/달력이 사각거리며 넘어가는 3D 전환 애니메이션 적용
        - 스와이프 도중 이전/다음 다이어리를 양옆에 실시간으로 나란히 배치하여 연속적인 페이지 전환 연출
        ================================================================
      */}
      <div className="w-full flex-1 flex flex-col min-h-0 relative overflow-hidden">
        {/* 이전 다이어리 프리뷰 (우측으로 드래그할 때 좌측에서 밀려 들어옴) */}
        {isViewMode && (isPageDragging || exitAnimation === 'anim-page-exit-right') && prevDiary && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              right: 0,
              transform: `translateX(calc(-100% + ${dragX}px))`,
              transition: isPageDragging ? 'none' : 'transform 0.22s cubic-bezier(0.25, 1, 0.5, 1)',
              zIndex: 10,
              boxShadow: '10px 0 25px rgba(0,0,0,0.08)',
            }}
          >
            <DiaryStaticPage diary={prevDiary} scaleRatio={scaleRatio} paperHeightPx={paperHeightPx} />
          </div>
        )}

        {/* 현재 다이어리 페이지 */}
        <div 
          style={{
            transform: (isPageDragging || exitAnimation) && dragX !== 0
              ? `translateX(${dragX}px) rotateY(${dragX * -0.025}deg)`
              : undefined,
            transition: isPageDragging ? 'none' : 'transform 0.22s cubic-bezier(0.25, 1, 0.5, 1), box-shadow 0.22s ease',
            boxShadow: isPageDragging && Math.abs(dragX) > 5
              ? (dragX > 0 ? `${-Math.min(18, dragX * 0.15)}px 0 25px rgba(0,0,0,0.12)` : `${Math.min(18, -dragX * 0.15)}px 0 25px rgba(0,0,0,0.12)`)
              : undefined,
            zIndex: 20,
          }}
          className={`w-full flex-1 flex flex-col min-h-0 relative calendar-page-container ${
            enterAnimation || ''
          }`}
        >
        {/* 
          ================================================================
          [상단] 2. 날짜 헤더: 반응형 가로 100% 풀 핏
                   2026
                   11.17 THU                  [ ○ 스티커 ] [ ✔ 완료 (와이드 전용) ]
                   ────────────────────────────────
                   - 와이드 화면에서는 상단 바가 없으므로 pt-5 pb-3으로 최적화하여 
                     전체 상단 세로 사이즈를 최소화하고, 체크 버튼이 날짜 스티커 옆에 위치
          ================================================================
        */}
        <div className="w-full px-6 pt-1 lg:pt-[calc(1.25rem+env(safe-area-inset-top,0px))] pb-3 shrink-0">
          {/* 1) 연도 (상단) */}
          <div className="text-base sm:text-lg font-black text-black leading-tight tracking-tight">
            {yearNum}
          </div>

          {/* 2) 날짜 행 + 우측 플러스/스티커/체크 버튼 (년도를 제외한 날짜와 세로 중앙 정렬) */}
          <div className="flex items-center justify-between mt-1">
            {/* 날짜 텍스트 (탭하면 날짜 변경 - 이미 작성된 날짜는 선택 불가) */}
            <div 
              className={`relative ${!isViewMode ? 'cursor-pointer group' : 'cursor-default'}`} 
              title={!isViewMode ? "날짜 변경" : undefined}
              onClick={() => {
                if (!isViewMode) {
                  setIsDatePickerOpen(true);
                }
              }}
            >
              <div className={`text-2xl sm:text-3xl font-black text-black tracking-tight leading-none ${!isViewMode ? 'group-hover:opacity-75' : ''} transition-opacity`}>
                {monthNum}.{dayNum} {dayEn}
              </div>
            </div>

            {/* 우측 대표 날씨/스티커 아이콘 버튼 + 와이드 전용 체크 버튼 (날짜와 정확한 세로 중앙 정렬) */}
            <div className="flex items-center space-x-2.5">
              <div className="relative flex items-center">
                <button
                  type="button"
                  disabled={isViewMode}
                  onClick={() => {
                    if (!isViewMode) setIsWeatherOpen(!isWeatherOpen);
                  }}
                  className={`w-10 h-10 bg-transparent border-0 p-0 ${!isViewMode ? 'active:scale-95 cursor-pointer' : 'cursor-default'} transition flex items-center justify-center overflow-visible`}
                  title={!isViewMode ? "날씨 / 대표 스티커 선택" : undefined}
                >
                {weather ? (
                  isImageAsset(weather) ? (
                    <img
                      src={upgradePresetSvgUrl(typeof weather === 'string' ? weather : weather?.imageUrl || '')}
                      alt="대표 아이콘"
                      className="w-10 h-10 object-contain block select-none overflow-visible p-0.5"
                    />
                  ) : (
                    <span className="text-3xl leading-none select-none">
                      {typeof weather === 'string' || typeof weather === 'number'
                        ? String(weather)
                        : (weather?.icon || weather?.label || '')}
                    </span>
                  )
                ) : (
                  <Plus size={24} className="text-black" strokeWidth={2.5} />
                )}
              </button>

              {isWeatherOpen && (
              <div 
                className="absolute right-0 top-full mt-2 bg-white border border-stone-200 rounded-2xl shadow-xl overflow-hidden z-50 w-72 sm:w-80 max-w-[calc(100vw-2rem)] animate-fadeIn flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                {/* 1차 분류 탭: 날씨 / 스티커 */}
                <div className="flex border-b border-stone-100 bg-stone-50/60 shrink-0">
                  <button
                    type="button"
                    onClick={() => setRepCategoryTab('weather')}
                    className={`flex-1 py-2 text-xs font-semibold border-b-2 transition cursor-pointer ${
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
                    className={`flex-1 py-2 text-xs font-semibold border-b-2 transition cursor-pointer ${
                      repCategoryTab === 'sticker'
                        ? 'border-black font-bold text-black bg-white'
                        : 'border-transparent text-stone-400 hover:text-stone-700'
                    }`}
                  >
                    스티커
                  </button>
                </div>

                {/* 2. 스티커 탭 선택 시: 하위 카테고리 가로 스크롤 노출 (스티커 보관함과 동일) */}
                {repCategoryTab === 'sticker' && (
                  <div className="flex border-b border-stone-100 bg-[#f5f5f5]/60 overflow-x-auto no-scrollbar scroll-smooth whitespace-nowrap px-2.5 py-1.5 gap-1 shrink-0">
                    {repStickerCategories.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setRepStickerSubCategory(cat.id)}
                        className={`shrink-0 px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                          repStickerSubCategory === cat.id
                            ? 'font-bold text-black bg-white shadow-2xs border border-stone-200/80'
                            : 'text-stone-400 hover:text-stone-700 hover:bg-stone-200/50'
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                )}

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
                                  className={`flex flex-col items-center justify-center p-1.5 rounded-xl hover:bg-stone-100 transition cursor-pointer ${
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
                              className={`flex flex-col items-center justify-center p-2 rounded-xl hover:bg-stone-100 active:scale-95 transition cursor-pointer ${
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
                            className="text-[11px] text-stone-500 hover:text-red-500 font-medium py-1 px-3 rounded-lg hover:bg-stone-50 transition cursor-pointer"
                          >
                            선택 해제 (기본 + 로 변경)
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* 스티커 탭: 가로 스크롤 카테고리별 스티커 그리드 */
                    <div className="space-y-3">
                      {filteredRepStickers.length === 0 ? (
                        <div className="py-8 text-center text-xs text-stone-400">
                          {repStickerSubCategory === 'my'
                            ? '등록된 내 스티커가 없습니다.'
                            : '해당 카테고리에 등록된 스티커가 없습니다.'}
                        </div>
                      ) : (
                        <div className="grid grid-cols-4 gap-2">
                          {filteredRepStickers.map((item) => {
                            const isGifItem =
                              item.category === 'gif' ||
                              item.isGif ||
                              item.fileName?.toLowerCase().endsWith('.gif') ||
                              item.imageUrl?.startsWith('data:image/svg+xml');

                            return (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => {
                                  setWeather(item.imageUrl);
                                  setIsWeatherOpen(false);
                                }}
                                className={`flex flex-col items-center justify-center p-1.5 rounded-xl hover:bg-stone-100 transition active:scale-95 group relative cursor-pointer ${
                                  weather === item.imageUrl ? 'bg-stone-200/90 ring-1 ring-black' : ''
                                }`}
                                title={item.name || item.fileName || item.category}
                              >
                                {isGifItem && (
                                  <span className="absolute top-1 right-1 text-[7px] px-0.5 bg-stone-900/80 text-white rounded font-bold pointer-events-none">
                                    GIF
                                  </span>
                                )}
                                <img
                                  src={item.imageUrl}
                                  alt={item.name || '스티커'}
                                  className="w-8 h-8 object-contain block select-none group-hover:scale-105 transition-transform"
                                />
                                <span className="text-[8px] text-stone-500 mt-0.5 truncate w-full text-center">
                                  {item.name || item.fileName}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* 스티커 카테고리일 때 추가로 기본 데코 스탬프도 하단에 제공 */}
                      {repStickerSubCategory === 'sticker' && (
                        <div>
                          <div className="text-[10px] font-bold text-stone-400 mb-1.5 px-0.5 pt-2 border-t border-stone-100">
                            기본 데코 스탬프
                          </div>
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
                                className={`flex flex-col items-center justify-center p-2 rounded-xl hover:bg-stone-100 active:scale-95 transition cursor-pointer ${
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
                      )}

                      {/* 선택 해제 버튼 */}
                      {weather && (
                        <div className="pt-2 border-t border-stone-100 flex justify-center">
                          <button
                            type="button"
                            onClick={() => {
                              setWeather('');
                              setIsWeatherOpen(false);
                            }}
                            className="text-[11px] text-stone-500 hover:text-red-500 font-medium py-1 px-3 rounded-lg hover:bg-stone-50 transition cursor-pointer"
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

          {/* 와이드 버전(lg: >=1024px) 전용 [ 연필(편집) / ✔(저장 완료) ] 버튼 */}
          {isViewMode ? (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setIsViewMode(false);
              }}
              className="hidden lg:flex w-10 h-10 rounded-full bg-stone-900 text-white transition items-center justify-center shadow-xs shrink-0 hover:bg-stone-800 active:scale-95 cursor-pointer"
              title="일기 편집하기"
            >
              <Pencil size={18} strokeWidth={2.4} />
            </button>
          ) : (
            <button
              type="button"
              disabled={!hasContent || isSaving}
              onClick={handleSaveDiary}
              className={`hidden lg:flex w-10 h-10 rounded-full bg-black text-white transition items-center justify-center shadow-xs shrink-0 ${
                !hasContent
                  ? 'opacity-25 cursor-not-allowed pointer-events-none'
                  : 'hover:bg-stone-800 active:scale-95 cursor-pointer'
              }`}
              title={hasContent ? "다이어리 저장" : "저장할 내용이 없습니다"}
            >
              <Check size={18} strokeWidth={3} />
            </button>
          )}
        </div>
      </div>

        {/* 선명한 블랙 가로 구분선 */}
        <div className="w-full h-[1.5px] bg-black mt-3 sm:mt-4" />
      </div>

      {/* 
        ================================================================
        [본문 스크롤 영역] 세로로 긴 이미지나 컨텐츠가 있을 때 자유롭게 세로 스크롤 가능
        - 라운드 박스를 감싸는 스트로크(border)를 제거하여 깨끗한 아날로그 종이 질감 연출
        - 뷰 모드일 때는 좌우 터치/마우스 스와이프로 이전/이후 일기로 전환
        ================================================================
      */}
      <div 
        ref={scrollContainerRef}
        onTouchStart={isViewMode ? handleViewTouchStart : undefined}
        onTouchMove={isViewMode ? handleViewTouchMove : undefined}
        onTouchEnd={isViewMode ? handleViewTouchEnd : undefined}
        onMouseDown={isViewMode ? handleViewMouseDown : undefined}
        onMouseMove={isViewMode ? handleViewMouseMove : undefined}
        onMouseUp={isViewMode ? handleViewMouseUp : undefined}
        onMouseLeave={isViewMode ? handleViewMouseUp : undefined}
        onContextMenu={(e) => {
          if (activeToolMode === 'pen') {
            e.preventDefault();
            e.stopPropagation();
            return false;
          }
        }}
        style={{
          WebkitOverflowScrolling: 'touch',
          overscrollBehaviorY: 'contain',
          WebkitTouchCallout: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
        className="flex-1 w-full overflow-y-auto overflow-x-hidden no-scrollbar px-3.5 sm:px-6 relative select-none"
      >
        <div 
          ref={canvasContainerRef}
          onClick={(e) => {
            if (isViewMode || wasTransformingRef.current) return;
            // 빈 속지 배경 또는 캔버스를 직접 클릭했을 때
            const isDirectPaperClick = e.target === canvasContainerRef.current || e.target?.tagName === 'CANVAS';
            if (isDirectPaperClick && activeToolMode !== 'pen') {
              if (activeToolMode === 'text' && !selectedTextId) {
                // 모바일 최초 진입 등 T 모드에서 선택된 글상자가 없을 때 빈 공간 클릭 시 맨 상단에 글상자 생성 및 포커스
                handleAddTextBlock();
              } else {
                setSelectedTextId(null);
                setSelectedStickerId(null);
              }
            }
          }}
          onTouchStart={(e) => {
            if (isViewMode) return;
            if (e.touches && e.touches.length >= 2 && selectedTextId && activeToolMode === 'text') {
              const block = textBlocks.find(b => b.id === selectedTextId);
              if (block) {
                if (e.cancelable) e.preventDefault();
                const t1 = e.touches[0];
                const t2 = e.touches[1];
                const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
                const angle = Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX) * (180 / Math.PI);
                const midX = (t1.clientX + t2.clientX) / 2;
                const midY = (t1.clientY + t2.clientY) / 2;

                twoFingerTransformRef.current = {
                  id: block.id,
                  itemType: 'text',
                  startDist: dist,
                  startAngle: angle,
                  startScale: block.scale || 1,
                  startRotation: block.rotation || 0,
                  startX: block.x || 0,
                  startY: block.y || 0,
                  startMidX: midX,
                  startMidY: midY,
                };
              }
            }
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            return false;
          }}
          style={{
            minHeight: `${paperHeightPx}px`,
            touchAction: !isViewMode && activeToolMode === 'pen' ? 'none' : 'pan-y',
            WebkitTouchCallout: 'none',
            userSelect: 'none',
            WebkitUserSelect: 'none',
          }}
          className={`w-full relative isolate ${currentPaperClass} transition-colors duration-200 select-none`}
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
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            return false;
          }}
          style={{
            zIndex: !isViewMode && activeToolMode === 'pen' ? 9999 : 0,
            touchAction: 'none',
            WebkitTouchCallout: 'none',
            WebkitUserSelect: 'none',
            userSelect: 'none',
            pointerEvents: !isViewMode && activeToolMode === 'pen' ? 'auto' : 'none',
          }}
          className={`absolute inset-0 w-full h-full block ${
            !isViewMode && activeToolMode === 'pen' ? 'cursor-crosshair touch-none' : 'pointer-events-none'
          }`}
        />

        {/* (2) 텍스트 블록 레이어 (캔버스 직접 입력 박스 형태) */}
        {textBlocks.map((block, idx) => {
          const isSelected = selectedTextId === block.id;
          const blockScale = block.scale || 1;
          const blockRotation = block.rotation || 0;
          const invScale = 1 / blockScale;
          const blockZIndex = typeof block.layerOrder === 'number' ? block.layerOrder : idx + 1;

          const leftPx = Math.round((block.x || 0) * scaleRatio);
          const topPx = Math.round((block.y || 0) * scaleRatio);
          const canonicalW = typeof block.width === 'number' ? block.width : CANONICAL_WIDTH;
          const widthPx = Math.round(canonicalW * scaleRatio);
          const scaledFontSize = Math.max(10, Math.round((block.fontSize || 18) * scaleRatio));
          const scaledLineHeight = Math.max(20, Math.round(28 * scaleRatio));
          const minBoxHeight = scaledLineHeight * 1;
          const textColor = block.color || '#111111';

          return (
            <div
              key={block.id}
              data-object-box="true"
              onClick={(e) => {
                if (isViewMode) return;
                e.stopPropagation();
                setSelectedTextId(block.id);
                setSelectedStickerId(null);
                setActiveToolMode('text');
              }}
              onTouchStart={(e) => {
                if (isViewMode) return;
                if (e.touches && e.touches.length >= 2) {
                  if (e.cancelable) e.preventDefault();
                  e.stopPropagation();
                  const t1 = e.touches[0];
                  const t2 = e.touches[1];
                  const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
                  const angle = Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX) * (180 / Math.PI);
                  const midX = (t1.clientX + t2.clientX) / 2;
                  const midY = (t1.clientY + t2.clientY) / 2;

                  twoFingerTransformRef.current = {
                    id: block.id,
                    itemType: 'text',
                    startDist: dist,
                    startAngle: angle,
                    startScale: block.scale || 1,
                    startRotation: block.rotation || 0,
                    startX: block.x || 0,
                    startY: block.y || 0,
                    startMidX: midX,
                    startMidY: midY,
                  };
                  setSelectedTextId(block.id);
                  setSelectedStickerId(null);
                  setActiveToolMode('text');
                }
              }}
              style={{
                left: `${leftPx}px`,
                top: `${topPx}px`,
                width: `${widthPx}px`,
                minHeight: `${minBoxHeight + 8}px`,
                maxWidth: `${Math.max(60, paperWidth - leftPx)}px`,
                zIndex: blockZIndex,
                transform: `rotate(${blockRotation}deg) scale(${blockScale})`,
                transformOrigin: 'center center',
                touchAction: isViewMode ? 'auto' : 'pan-y',
                backgroundColor: 'transparent',
                border: isSelected && !isViewMode ? '1px solid rgba(0, 0, 0, 0.1)' : '1px solid transparent',
                pointerEvents: isViewMode ? 'none' : 'auto',
              }}
              className={`absolute select-text ${isSelected && !isViewMode && draggingItem?.id === block.id ? '' : 'transition-[border,box-shadow]'} p-1.5 rounded-lg`}
            >
              {/* 선택 시 상단 미니멀 이동 바 및 우측 세로 핸들 (배경/원형버튼 제거, 미니멀 디자인) */}
              {isSelected && !isViewMode && (
                <>
                  {/* 상단 중앙: 슬림한 미니 이동 드래그 바 (모바일 터치 편의성을 위해 터치 영역은 넉넉하게 확보) */}
                  <div
                    onPointerDown={(e) => handleItemDragStart(e, 'text', block.id, block.x, block.y)}
                    onTouchStart={(e) => handleItemDragStart(e, 'text', block.id, block.x, block.y)}
                    style={{ transform: `translateX(-50%) scale(${invScale})`, touchAction: 'none' }}
                    className="absolute -top-3 left-1/2 w-12 h-6 flex items-center justify-center cursor-move z-30 touch-none group select-none"
                    title="드래그하여 이동"
                  >
                    <div className="w-8 h-1.5 rounded-full bg-black/25 group-hover:bg-black/60 transition-colors" />
                  </div>

                  {/* 우측 중앙: 세로로 긴 타입의 가로 너비 조절 핸들 (줄바꿈 변경, 정확한 세로 중앙정렬) */}
                  <div
                    onPointerDown={(e) => handleTransformStart(e, 'width', 'text', block)}
                    onTouchStart={(e) => handleTransformStart(e, 'width', 'text', block)}
                    style={{ transform: `translateY(-50%) scale(${invScale})`, touchAction: 'none' }}
                    className="absolute -right-2 top-1/2 w-4 h-8 flex items-center justify-center cursor-ew-resize z-30 touch-none group select-none"
                    title="드래그하여 가로 너비 조절 (줄바꿈 변경)"
                  >
                    <div className="w-1.5 h-5 sm:h-6 rounded-full bg-stone-400/80 group-hover:bg-stone-700 transition-colors shadow-2xs" />
                  </div>
                </>
              )}

              {/* 본문 텍스트에어리어 (기본 1줄 높이 생성, 입력 내용에 따라 자연스럽게 자동 높이 확장) */}
              <textarea
                ref={(el) => {
                  if (el) {
                    textareaRefs.current[block.id] = el;
                    el.style.height = 'auto';
                    el.style.height = `${Math.max(minBoxHeight, el.scrollHeight)}px`;
                  } else {
                    delete textareaRefs.current[block.id];
                  }
                }}
                value={block.text || ''}
                readOnly={isViewMode}
                placeholder={isSelected && !isViewMode ? '텍스트를 입력하세요...' : ''}
                onClick={(e) => e.stopPropagation()}
                onFocus={() => {
                  if (isViewMode) return;
                  setSelectedTextId(block.id);
                  setSelectedStickerId(null);
                  setActiveToolMode('text');
                  if (window.scrollY > 2 || window.scrollX > 2) {
                    window.scrollTo(0, 0);
                  }
                  setTimeout(() => ensureTextBlockVisible(block.id), 80);
                  setTimeout(() => ensureTextBlockVisible(block.id), 250);
                }}
                onChange={(e) => {
                  if (isViewMode) return;
                  updateTextBlock(block.id, { text: e.target.value });
                  e.target.style.height = 'auto';
                  e.target.style.height = `${Math.max(minBoxHeight, e.target.scrollHeight)}px`;
                }}
                style={{
                  fontFamily: block.fontFamily || "'Paperlogy', sans-serif",
                  fontWeight: block.fontWeight || (block.fontFamily && !block.fontFamily.includes('Paperlogy') ? 'normal' : 600),
                  fontSize: `${scaledFontSize}px`,
                  color: textColor,
                  textAlign: block.textAlign || 'left',
                  lineHeight: 1.5,
                  minHeight: `${minBoxHeight}px`,
                  touchAction: 'pan-y',
                }}
                className="w-full bg-transparent border-0 focus:ring-0 p-1 resize-none overflow-hidden outline-none block touch-pan-y"
                rows={1}
              />
            </div>
          );
        })}

        {/* (3) 스티커 / 꾸미기 에셋 레이어 (만들어진 순서 layerOrder 기준 zIndex 적용) */}
        {(stickers || []).filter(Boolean).map((sticker, idx) => {
          const isSelected = selectedStickerId === sticker.id;
          const stickerScale = sticker.scale || 1;
          const stickerRotation = sticker.rotation || 0;
          const invScale = 1 / stickerScale;
          const stickerZIndex = typeof sticker.layerOrder === 'number' ? sticker.layerOrder : idx + 1;

          const leftPercent = ((sticker.x || 0) / CANONICAL_WIDTH) * 100;
          const topPx = Math.round((sticker.y || 0) * scaleRatio);
          const isTape = sticker.category === 'tape' || sticker.type === 'tape';
          const basePixelW = isTape ? 112 : 56;
          const scaledPixelW = Math.max(24, Math.round(basePixelW * scaleRatio));

          return (
            <div
              key={sticker.id}
              data-object-box="true"
              onPointerDown={(e) => {
                if (isViewMode) return;
                handleItemDragStart(e, 'sticker', sticker.id, sticker.x, sticker.y);
              }}
              onTouchStart={(e) => {
                if (isViewMode) return;
                handleItemDragStart(e, 'sticker', sticker.id, sticker.x, sticker.y);
              }}
              onClick={(e) => {
                if (isViewMode) return;
                e.stopPropagation();
                setSelectedStickerId(sticker.id);
                setSelectedTextId(null);
                setActiveToolMode('sticker');
              }}
              style={{
                left: `${leftPercent}%`,
                top: `${topPx}px`,
                zIndex: stickerZIndex,
                transform: `rotate(${stickerRotation}deg) scale(${stickerScale})`,
                transformOrigin: 'center center',
                touchAction: 'none',
                pointerEvents: isViewMode ? 'none' : 'auto',
              }}
              className={`absolute select-none touch-none p-1 ${
                !isViewMode ? 'cursor-move' : ''
              } ${
                isSelected && !isViewMode
                  ? 'ring-1.5 ring-dashed ring-stone-800 rounded-lg bg-white/20'
                  : ''
              }`}
            >
              {/* 선택된 스티커 모서리 직접 조작 핸들 (삭제 / 회전 / 크기조절) */}
              {isSelected && !isViewMode && (
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
                    className="absolute -top-3 -left-3 w-6 h-6 rounded-full bg-white text-stone-900 border border-stone-300 shadow-xs flex items-center justify-center z-30 active:scale-95 hover:bg-stone-50"
                    title="스티커 삭제"
                  >
                    <X size={12} strokeWidth={2.5} />
                  </button>

                  {/* 우측 상단: 직접 회전(Rotate) 드래그 핸들 */}
                  <div
                    onPointerDown={(e) => handleTransformStart(e, 'rotate', 'sticker', sticker)}
                    onTouchStart={(e) => handleTransformStart(e, 'rotate', 'sticker', sticker)}
                    style={{ transform: `scale(${invScale})`, touchAction: 'none' }}
                    className="absolute -top-3 -right-3 w-6 h-6 rounded-full bg-white text-stone-900 border border-stone-300 shadow-xs flex items-center justify-center cursor-grab active:cursor-grabbing z-30 touch-none hover:bg-stone-50"
                    title="드래그하여 회전"
                  >
                    <RotateCw size={12} strokeWidth={2.5} />
                  </div>

                  {/* 우측 하단: 직접 크기조절(Resize) 드래그 핸들 */}
                  <div
                    onPointerDown={(e) => handleTransformStart(e, 'resize', 'sticker', sticker)}
                    onTouchStart={(e) => handleTransformStart(e, 'resize', 'sticker', sticker)}
                    style={{ transform: `scale(${invScale})`, touchAction: 'none' }}
                    className="absolute -bottom-3 -right-3 w-6 h-6 rounded-full bg-white text-stone-900 border border-stone-300 shadow-xs flex items-center justify-center cursor-nwse-resize z-30 touch-none active:scale-110 hover:bg-stone-50"
                    title="드래그하여 크기 조절"
                  >
                    <Maximize2 size={11} strokeWidth={2.5} />
                  </div>
                </>
              )}

              {(() => {
                const resolvedImg = resolveStickerImage(sticker);
                if (resolvedImg) {
                  return (
                    <img
                      src={resolvedImg}
                      alt={sticker.label || sticker.category || 'decoration'}
                      draggable={false}
                      onLoad={(e) => {
                        const naturalW = e.currentTarget.naturalWidth || 1;
                        const naturalH = e.currentTarget.naturalHeight || 1;
                        const isTape = sticker.category === 'tape' || sticker.type === 'tape';
                        const isPhoto = sticker.isPhoto || sticker.type === 'photo';
                        const baseW = isTape ? 112 : isPhoto ? 140 : 56;
                        const maxH = isTape ? 32 : isPhoto ? 180 : 56;
                        const canonicalImgH = Math.min(maxH, Math.round(baseW * (naturalH / naturalW)));
                        if (!sticker.height || Math.abs(sticker.height - canonicalImgH) > 4) {
                          updateSticker(sticker.id, { height: canonicalImgH });
                        }
                      }}
                      style={{ width: `${scaledPixelW}px`, height: 'auto' }}
                      className="object-contain select-none pointer-events-none block"
                    />
                  );
                }
                if (sticker.type === 'tape' || sticker.category === 'tape') {
                  return (
                    <div
                      className="rounded shadow-xs relative overflow-hidden"
                      style={{
                        width: `${scaledPixelW}px`,
                        height: `${Math.round(24 * scaleRatio)}px`,
                        backgroundColor: sticker.color || '#fef08a',
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
                  );
                }
                if (isEmojiSticker(sticker)) {
                  return (
                    <span 
                      style={{ fontSize: `${Math.round(36 * scaleRatio)}px` }}
                      className="filter drop-shadow-xs block leading-none select-none"
                    >
                      {sticker.content || sticker.icon || ''}
                    </span>
                  );
                }
                // 이미지 스티커의 파일명/라벨(예: "moomi")이 화면에 텍스트로 노출되는 현상 완전 방지
                return null;
              })()}
            </div>
          );
        })}
        </div>

        {/* 하단 플로팅 툴바 및 가상 키보드에 가려지지 않도록 보장하는 안전 여백 스페이서 */}
        <div 
          style={{ height: keyboardOffset > 0 ? '360px' : undefined }}
          className="w-full h-44 sm:h-52 shrink-0 pointer-events-none transition-[height] duration-200" 
        />
      </div>
    </div>

        {/* 다음 다이어리 프리뷰 (좌측으로 드래그할 때 우측에서 밀려 들어옴) */}
        {isViewMode && (isPageDragging || exitAnimation === 'anim-page-exit-left') && nextDiary && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              right: 0,
              transform: `translateX(calc(100% + ${dragX}px))`,
              transition: isPageDragging ? 'none' : 'transform 0.22s cubic-bezier(0.25, 1, 0.5, 1)',
              zIndex: 10,
              boxShadow: '-10px 0 25px rgba(0,0,0,0.08)',
            }}
          >
            <DiaryStaticPage diary={nextDiary} scaleRatio={scaleRatio} paperHeightPx={paperHeightPx} />
          </div>
        )}
      </div>

      {/* 
        ================================================================
        [하단 도구 모음 통합 컨테이너] (뷰 모드일 때는 숨김, 편집 모드에서만 노출)
        (Visual Viewport 기준으로 키보드 활성화 시 키보드 바로 위에 완벽 고정)
        ================================================================
      */}
      {!isViewMode && (
        <div
          style={{
            bottom: keyboardOffset > 0 ? '0.75rem' : 'max(1rem, env(safe-area-inset-bottom, 1rem))'
          }}
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
                      min={activePenTool === 'highlighter' ? 8 : 0.5}
                      max={activePenTool === 'highlighter' ? 32 : 8}
                      step={activePenTool === 'highlighter' ? 1 : 0.1}
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
            <div className="flex items-center justify-between w-full gap-1.5 animate-fadeIn text-xs sm:text-sm">
              {!selectedText ? (
                /* 글상자가 선택되지 않은 기본 상태: flex-1로 가로 전체 확장되는 블랙 버튼 */
                <button
                  type="button"
                  onClick={handleAddTextBlock}
                  className="flex-1 w-full py-2 px-4 rounded-xl bg-black text-white hover:bg-stone-800 active:scale-95 transition shadow-2xs flex items-center justify-center space-x-1.5 font-medium text-xs sm:text-sm cursor-pointer"
                  title="새 글상자 추가"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  <span>글상자 추가</span>
                </button>
              ) : (
                /* 글상자가 선택된 편집 상태: 서체/크기/정렬/삭제 툴바 + 블랙 + 추가 버튼 */
                <div className="flex items-center justify-between w-full space-x-1.5 overflow-x-auto no-scrollbar">
                  <button
                    type="button"
                    onClick={handleAddTextBlock}
                    className="w-8 h-8 rounded-xl bg-black text-white hover:bg-stone-800 active:scale-95 transition shadow-2xs flex items-center justify-center shrink-0 cursor-pointer"
                    title="새 글상자 추가"
                  >
                    <Plus className="w-4 h-4 stroke-[2.5]" />
                  </button>

                  {/* 폰트 선택 드롭다운 (기본: 페이퍼로지) */}
                  <select
                    value={selectedText.fontFamily || "'Paperlogy', sans-serif"}
                    onChange={(e) => {
                      const selectedFamily = e.target.value;
                      const fontObj = FONTS.find(f => f.family === selectedFamily);
                      updateTextBlock(selectedText.id, { 
                        fontFamily: selectedFamily,
                        fontWeight: fontObj?.weight || (selectedFamily.includes('Paperlogy') ? 600 : 'normal')
                      });
                    }}
                    className="bg-white rounded-xl border border-stone-200/90 px-2 py-1.5 text-xs text-stone-800 font-medium cursor-pointer shadow-2xs outline-none shrink-0"
                  >
                    {FONTS.map(f => (
                      <option key={f.id} value={f.family}>{f.name}</option>
                    ))}
                  </select>

                  {/* 폰트 크기 드롭다운 (기본: 18px) */}
                  <select
                    value={selectedText.fontSize || 18}
                    onChange={(e) => updateTextBlock(selectedText.id, { fontSize: Number(e.target.value) })}
                    className="bg-white rounded-xl border border-stone-200/90 px-2 py-1.5 text-xs text-stone-800 font-medium cursor-pointer shadow-2xs outline-none shrink-0"
                  >
                    {[12, 14, 16, 18, 20, 24, 28, 32].map(sz => (
                      <option key={sz} value={sz}>{sz}px</option>
                    ))}
                  </select>

                  {/* 정렬 버튼 그룹 */}
                  <div className="flex items-center bg-white rounded-xl border border-stone-200/90 p-0.5 shadow-2xs shrink-0">
                    <button
                      type="button"
                      onClick={() => updateTextBlock(selectedText.id, { textAlign: 'left' })}
                      className={`p-1.5 rounded-lg transition ${(selectedText.textAlign || 'left') === 'left' ? 'bg-black text-white' : 'text-stone-500 hover:text-black'}`}
                      title="왼쪽 정렬"
                    >
                      <AlignLeft size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => updateTextBlock(selectedText.id, { textAlign: 'center' })}
                      className={`p-1.5 rounded-lg transition ${selectedText.textAlign === 'center' ? 'bg-black text-white' : 'text-stone-500 hover:text-black'}`}
                      title="가운데 정렬"
                    >
                      <AlignCenter size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => updateTextBlock(selectedText.id, { textAlign: 'right' })}
                      className={`p-1.5 rounded-lg transition ${selectedText.textAlign === 'right' ? 'bg-black text-white' : 'text-stone-500 hover:text-black'}`}
                      title="오른쪽 정렬"
                    >
                      <AlignRight size={14} />
                    </button>
                  </div>

                  {/* 삭제 버튼 */}
                  <button
                    type="button"
                    onClick={() => deleteTextBlock(selectedText.id)}
                    className="p-1.5 text-stone-500 hover:text-red-500 rounded-lg hover:bg-stone-100 transition shrink-0"
                    title="글상자 삭제"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              )}
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

        {/* (2) 아래쪽 아이콘 독 툴박스 (키보드가 활성화되었을 때는 키보드 위 공간 확보를 위해 숨김) */}
        {keyboardOffset <= 0 && (
          <div className="pointer-events-auto bg-[#f4f4f4]/95 backdrop-blur-md border border-stone-200/80 rounded-2xl sm:rounded-3xl px-6 py-2.5 sm:py-3 shadow-md flex items-center justify-between animate-fadeIn">
            
            {/* 1. 타이핑 아이콘 (Type) */}
            <button
              type="button"
              onClick={() => {
                setSelectedStickerId(null);
                if (activeToolMode !== 'text') {
                  setActiveToolMode('text');
                  if (textBlocks.length === 0) {
                    handleAddTextBlock();
                  } else if (!selectedTextId) {
                    setSelectedTextId(textBlocks[textBlocks.length - 1].id);
                  }
                } else {
                  handleAddTextBlock();
                }
              }}
              className={`p-1.5 rounded-full transition-all ${
                activeToolMode === 'text'
                  ? 'text-black scale-110 font-bold'
                  : 'text-stone-400 hover:text-stone-700'
              }`}
              title="새 글상자 작성"
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
        )}

      </div>
      )}

      {/* 날짜 변경 모달 (이미 작성된 날짜는 선택 불가) */}
      <DatePickerModal
        isOpen={isDatePickerOpen}
        onClose={() => setIsDatePickerOpen(false)}
        currentDate={date}
        onSelectDate={(newDate) => {
          setDate(newDate);
        }}
        existingDates={existingDatesForPicker}
        title="일기 날짜 변경"
      />

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
        와이드 버전(2분할 뷰) 저장 완료 알림 토스트 팝업
        - 모바일은 저장 시 캘린더/목록으로 페이지 전환이 일어나며,
        - 와이드는 페이지 전환이 없으므로 감성적인 플로팅 토스트로 저장 완료를 명확히 안내
        - 하단 도구 모음(툴바)과 겹치지 않고 다이어리 상단 중앙에 우아하게 표시
      */}
      {toastMessage && (
        <div className="absolute top-5 left-1/2 -translate-x-1/2 z-50 pointer-events-none animate-fadeIn transition-all">
          <div className="flex items-center space-x-2 bg-black/90 text-white px-5 py-2.5 rounded-full shadow-lg backdrop-blur-md text-sm font-medium tracking-tight">
            <Check size={16} className="text-emerald-400 stroke-[3]" />
            <span>{toastMessage}</span>
          </div>
        </div>
      )}
    </div>
  );
}
