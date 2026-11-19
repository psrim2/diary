import React, { useState, useRef, useEffect } from 'react';
import { Search, Trash2 } from 'lucide-react';
import { PAPER_STYLES } from '../constants';
import { normalizeDiaryLayers, buildStrokeBands, StrokeBandCanvas, CANONICAL_WIDTH, CANONICAL_HEIGHT } from '../utils/canvasLayers';

const MONTH_NAMES_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const DAY_NAMES_EN = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

// 낱개 독립 슬라이딩 삭제 카드 컴포넌트
function DiaryCard({ diary, onSelect, onDelete, isSelected }) {
  const [translateX, setTranslateX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const currentDeltaXRef = useRef(0);
  const isHorizontalRef = useRef(false);
  const canvasRef = useRef(null);

  // 날짜 안전 파싱
  const dateParts = diary?.date ? String(diary.date).split('-') : [];
  const year = dateParts[0] && !isNaN(parseInt(dateParts[0], 10)) ? parseInt(dateParts[0], 10) : 2026;
  const month = dateParts[1] && !isNaN(parseInt(dateParts[1], 10)) ? parseInt(dateParts[1], 10) - 1 : 10;
  const day = dateParts[2] && !isNaN(parseInt(dateParts[2], 10)) ? parseInt(dateParts[2], 10) : 17;

  const dateObj = new Date(year, month, day);
  const dayNum = String(isNaN(day) ? 17 : day).padStart(2, '0');
  const dayEn = DAY_NAMES_EN[isNaN(dateObj.getDay()) ? 0 : dateObj.getDay()] || 'WED';
  const mood = diary?.thumbnailMood || diary?.weather || '';
  const isMoodImage =
    typeof mood === 'string' &&
    (mood.startsWith('data:') ||
      mood.startsWith('http://') ||
      mood.startsWith('https://') ||
      mood.startsWith('/') ||
      mood.startsWith('blob:'));
  const paperClass = PAPER_STYLES.find(p => p.id === diary.paperStyle)?.class || 'paper-minimal-lined';

  const normalizedLayers = React.useMemo(() => normalizeDiaryLayers(diary), [diary]);
  const strokeBands = React.useMemo(
    () =>
      buildStrokeBands(
        normalizedLayers.strokes,
        normalizedLayers.textBlocks,
        normalizedLayers.stickers
      ),
    [normalizedLayers]
  );

  // 작성된 컨텐츠(손글씨, 텍스트, 스티커)의 실제 세로 최대 범위 계산
  // - 불필요한 아래쪽 빈 종이 여백을 없애고 작성된 내용만 딱 나오도록 카드 세로 크기 동적 최적화
  const canonicalContentHeight = React.useMemo(() => {
    let maxY = 0;
    let hasContent = false;

    // 1) 텍스트 블록 바닥 계산
    (normalizedLayers.textBlocks || []).forEach((block) => {
      if (block.text && block.text.trim()) {
        hasContent = true;
        const lineCount = (block.text.split('\n') || []).length;
        const fontSz = typeof block.fontSize === 'number' ? block.fontSize : 22;
        const approxHeight = Math.max(28, lineCount * fontSz * 1.3) * (block.scale || 1);
        const bottom = (block.y || 0) + approxHeight;
        if (bottom > maxY) maxY = bottom;
      }
    });

    // 2) 스티커/사진 바닥 계산
    // (카드 뷰에서는 캐릭터/GIF 스티커가 w-14/56px로 렌더링되므로 최대 높이를 56px로 엄격히 제한하여 불필요한 빈 여백 방지)
    (normalizedLayers.stickers || []).forEach((sticker) => {
      hasContent = true;
      const isPhoto = sticker.isPhoto || sticker.type === 'photo';
      const isTape = sticker.type === 'tape' || sticker.category === 'tape';
      const defaultH = isPhoto ? 140 : isTape ? 24 : 56;
      const baseH = isPhoto
        ? Math.min(180, typeof sticker.height === 'number' && sticker.height > 0 ? sticker.height : defaultH)
        : isTape
        ? Math.min(28, typeof sticker.height === 'number' && sticker.height > 0 ? sticker.height : defaultH)
        : Math.min(56, typeof sticker.height === 'number' && sticker.height > 0 ? sticker.height : defaultH);
      const approxHeight = baseH * (sticker.scale || 1);
      const bottom = (sticker.y || 0) + approxHeight;
      if (bottom > maxY) maxY = bottom;
    });

    // 3) 지우개 획 영역 감지 (지워진 선 아래쪽의 유령 좌표 제외용)
    const eraserStrokes = (normalizedLayers.strokes || []).filter((s) => s.tool === 'eraser');
    const eraserBoxes = eraserStrokes.map((s) => {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, strokeMaxY = -Infinity;
      (s.points || []).forEach((p) => {
        if (typeof p.x === 'number' && typeof p.y === 'number') {
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.y > strokeMaxY) strokeMaxY = p.y;
        }
      });
      const radius = (s.size || 20) + 16;
      return { minX: minX - radius, maxX: maxX + radius, minY: minY - radius, maxY: strokeMaxY + radius };
    });

    // 4) 유효한 손글씨 스트로크 바닥 계산 (지우개 획 및 오작동 팜 터치 점 제외)
    // - 보이지 않는 투명/흰색 잉크 제외
    // - 본문과 동떨어진 팜 터치 노이즈 점 제외
    const validDrawStrokes = (normalizedLayers.strokes || []).filter((s) => {
      if (s.tool === 'eraser') return false;
      const c = (s.color || '').toLowerCase().trim();
      if (c === '#ffffff' || c === '#fff' || c === 'white' || c === 'transparent') return false;
      return Array.isArray(s.points) && s.points.length > 0;
    });

    const analyzedStrokes = validDrawStrokes.map((stroke) => {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, strokeMaxY = -Infinity;
      let pathLen = 0;
      let unErasedPoints = 0;

      for (let i = 0; i < stroke.points.length; i++) {
        const pt = stroke.points[i];
        if (typeof pt.x === 'number' && typeof pt.y === 'number' && !isNaN(pt.y)) {
          const isErased = eraserBoxes.some(
            (b) => pt.x >= b.minX && pt.x <= b.maxX && pt.y >= b.minY && pt.y <= b.maxY
          );
          if (!isErased) {
            unErasedPoints++;
            if (pt.x < minX) minX = pt.x;
            if (pt.x > maxX) maxX = pt.x;
            if (pt.y < minY) minY = pt.y;
            if (pt.y > strokeMaxY) strokeMaxY = pt.y;
            if (i > 0) {
              const prev = stroke.points[i - 1];
              pathLen += Math.hypot(pt.x - prev.x, pt.y - prev.y);
            }
          }
        }
      }

      const isSubstantial = unErasedPoints >= 3 && (pathLen > 8 || (strokeMaxY - minY) > 5);
      return {
        stroke,
        unErasedPoints,
        minY,
        strokeMaxY,
        isSubstantial,
      };
    }).filter((s) => s.unErasedPoints > 0 && isFinite(s.minY) && isFinite(s.strokeMaxY));

    // 유의미한 본문 컨텐츠(텍스트, 스티커, 실질적 필기 획)의 최대 바닥선 계산
    let coreMaxY = maxY;
    analyzedStrokes.forEach((s) => {
      if (s.isSubstantial) {
        hasContent = true;
        if (s.strokeMaxY > coreMaxY) coreMaxY = s.strokeMaxY;
      }
    });

    // 미세 접촉점(1~2점 단일 탭 / 팜 터치 점)은 유의미한 본문 바닥선(+45px) 이내에 있을 때만 정상 필기(마침표 등)로 인정
    analyzedStrokes.forEach((s) => {
      if (!s.isSubstantial) {
        if (coreMaxY > 0) {
          if (s.strokeMaxY <= coreMaxY + 45) {
            hasContent = true;
            if (s.strokeMaxY > maxY) maxY = s.strokeMaxY;
          }
        } else {
          hasContent = true;
          if (s.strokeMaxY > maxY) maxY = s.strokeMaxY;
        }
      }
    });

    if (coreMaxY > maxY) maxY = coreMaxY;

    if (!hasContent || maxY <= 0) {
      // 작성된 컨텐츠가 거의 없는 경우: 최소 높이 120px로 아담하게 표시
      return 120;
    }

    // 작성된 내용 바로 아래 깔끔한 여백(+20px)을 두어 내용만 딱 나오도록 맞춤 (최소 120px)
    return Math.max(120, Math.round(maxY + 20));
  }, [normalizedLayers]);

  const cardPaperRef = useRef(null);
  const [previewScale, setPreviewScale] = useState(0.85);

  useEffect(() => {
    const el = cardPaperRef.current;
    if (!el) return;
    const updatePreviewScale = () => {
      const w = el.clientWidth;
      if (w > 0) {
        setPreviewScale(Math.min(2.5, Math.max(0.4, Number((w / CANONICAL_WIDTH).toFixed(3)))));
      }
    };
    updatePreviewScale();
    const ro = new ResizeObserver(updatePreviewScale);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 터치 제스처
  const handleTouchStart = (e) => {
    e.stopPropagation();
    startXRef.current = e.touches[0].clientX;
    startYRef.current = e.touches[0].clientY;
    currentDeltaXRef.current = 0;
    isHorizontalRef.current = false;
    setIsSwiping(false);
  };

  const handleTouchMove = (e) => {
    const deltaX = e.touches[0].clientX - startXRef.current;
    const deltaY = e.touches[0].clientY - startYRef.current;

    if (!isHorizontalRef.current) {
      if (Math.abs(deltaX) > 6 && Math.abs(deltaX) > Math.abs(deltaY)) {
        isHorizontalRef.current = true;
        setIsSwiping(true);
      } else if (Math.abs(deltaY) > 6) {
        return;
      }
    }

    if (isHorizontalRef.current) {
      e.stopPropagation();
      const clampedX = Math.min(0, Math.max(-140, deltaX));
      currentDeltaXRef.current = clampedX;
      setTranslateX(clampedX);
    }
  };

  const handleTouchEnd = (e) => {
    if (!isHorizontalRef.current) {
      setTranslateX(0);
      return;
    }
    e.stopPropagation();

    const deltaX = currentDeltaXRef.current;
    if (deltaX < -70) {
      setIsDeleting(true);
      setTimeout(() => {
        onDelete(diary.id);
      }, 250);
    } else {
      setTranslateX(0);
    }
    setIsSwiping(false);
    isHorizontalRef.current = false;
  };

  // 마우스 제스처
  const handleMouseDown = (e) => {
    e.stopPropagation();
    startXRef.current = e.clientX;
    startYRef.current = e.clientY;
    currentDeltaXRef.current = 0;
    isHorizontalRef.current = false;
    setIsSwiping(false);

    const handleMouseMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startXRef.current;
      const deltaY = moveEvent.clientY - startYRef.current;

      if (!isHorizontalRef.current && Math.abs(deltaX) > 5) {
        isHorizontalRef.current = true;
        setIsSwiping(true);
      }

      if (isHorizontalRef.current) {
        const clampedX = Math.min(0, Math.max(-140, deltaX));
        currentDeltaXRef.current = clampedX;
        setTranslateX(clampedX);
      }
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);

      if (currentDeltaXRef.current < -70) {
        setIsDeleting(true);
        setTimeout(() => {
          onDelete(diary.id);
        }, 250);
      } else {
        setTranslateX(0);
      }
      setIsSwiping(false);
      isHorizontalRef.current = false;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div 
      className={`relative rounded-3xl transition-all duration-250 select-none ${
        isDeleting ? 'max-h-0 opacity-0 mb-0 py-0 overflow-hidden' : 'mb-4'
      }`}
    >
      {/* [뒷면 삭제 액션] */}
      <div 
        className="absolute inset-y-0 right-0 w-28 flex items-center justify-center cursor-pointer z-0 pr-3"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(diary.id);
        }}
        title="일기 삭제"
      >
        <div className="flex flex-col items-center space-y-1 text-black hover:opacity-75 transition-opacity">
          <Trash2 size={24} strokeWidth={2.3} />
          <span className="text-xs font-black tracking-tight">삭제</span>
        </div>
      </div>

      {/* [앞면: 박스 묶음 전체 슬라이딩] */}
      <div
        style={{ transform: `translateX(${translateX}px)` }}
        className={`relative z-10 bg-white rounded-3xl p-4 sm:p-5 shadow-xs cursor-pointer transition-all ${
          isSwiping ? '' : 'duration-200 ease-out'
        } ${
          isSelected
            ? 'border border-stone-200/90 lg:border-2 lg:border-black lg:shadow-sm'
            : 'border border-stone-200/90'
        }`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onClick={() => {
          if (Math.abs(translateX) < 6) {
            onSelect(diary);
          }
        }}
      >
        {/* 박스 상단 헤더: [15 SUN] ──────── [대표 스티커] */}
        <div className="flex items-center justify-between pb-3">
          <div className="text-xl sm:text-2xl font-black text-black tracking-tight leading-none">
            {dayNum} {dayEn}
          </div>
          {isMoodImage ? (
            <img
              src={mood}
              alt=""
              className="w-9 h-9 object-contain select-none"
            />
          ) : (
            <span className="text-2xl select-none filter drop-shadow-2xs">
              {mood}
            </span>
          )}
        </div>

        {/* 박스 본문: 작성된 내용 높이에 꼭 맞춰 빈 여백을 최소화한 가변 종이 속지 */}
        <div ref={cardPaperRef} className="w-full flex justify-center overflow-hidden">
          <div
            style={{
              width: `${CANONICAL_WIDTH * previewScale}px`,
              height: `${canonicalContentHeight * previewScale}px`,
            }}
            className="relative shrink-0 overflow-hidden rounded-2xl border border-stone-200/60 shadow-2xs"
          >
            <div
              style={{
                width: `${CANONICAL_WIDTH}px`,
                height: `${canonicalContentHeight}px`,
                transform: `scale(${previewScale})`,
                transformOrigin: 'top left',
              }}
              className={`absolute top-0 left-0 ${paperClass} overflow-hidden`}
            >
              {/* 생성 순서(layerOrder)별 드로잉 밴드 캔버스 */}
              {strokeBands.map((band) => (
                <StrokeBandCanvas
                  key={band.id}
                  band={band}
                  width={CANONICAL_WIDTH}
                  height={canonicalContentHeight}
                />
              ))}

              {/* 텍스트 블록 전체 (인스타그램 스토리 스타일 배지 및 정렬, 작성된 절대 위치 완벽 반영) */}
              {normalizedLayers.textBlocks?.map((block, idx) => {
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

                return (
                  <div
                    key={block.id || `tb-${idx}`}
                    style={{
                      position: 'absolute',
                      left: typeof block.x === 'number' ? `${block.x}px` : '18px',
                      top: `${block.y || 40}px`,
                      maxWidth: '90%',
                      zIndex: typeof block.layerOrder === 'number' ? block.layerOrder : idx + 1,
                      transform: `rotate(${block.rotation || 0}deg) scale(${block.scale || 1})`,
                      transformOrigin: 'center center',
                      fontFamily: block.fontFamily || "'Gaegu', cursive",
                      fontSize: `${block.fontSize || 22}px`,
                      color: textColor,
                      textAlign: block.textAlign || 'center',
                      lineHeight: 1.35,
                      ...customBgStyle,
                    }}
                    className={`whitespace-pre-wrap break-words select-none pointer-events-none p-1 ${bgClass}`}
                  >
                    {block.text}
                  </div>
                );
              })}

              {(!normalizedLayers.textBlocks || normalizedLayers.textBlocks.length === 0) &&
                diary.summary &&
                diary.summary !== '기록된 일기' && (
                  <div
                    style={{
                      position: 'absolute',
                      left: '18px',
                      top: '40px',
                      fontFamily: "'Gaegu', cursive",
                      zIndex: 1,
                    }}
                    className="text-stone-700 text-lg leading-relaxed relative w-[90%] whitespace-pre-wrap break-words"
                  >
                    {diary.summary}
                  </div>
                )}

              {/* 스티커 & 꾸미기 에셋 (작성 화면과 100% 동일한 절대 위치와 크기) */}
              {normalizedLayers.stickers?.map((sticker, idx) => (
                <div
                  key={sticker.id || `st-${idx}`}
                  style={{
                    position: 'absolute',
                    left: `${sticker.x || 0}px`,
                    top: `${sticker.y || 0}px`,
                    zIndex: typeof sticker.layerOrder === 'number' ? sticker.layerOrder : idx + 1,
                    transform: `rotate(${sticker.rotation || 0}deg) scale(${sticker.scale || 1})`,
                    transformOrigin: 'center center',
                  }}
                  className="select-none pointer-events-none p-1"
                >
                  {sticker.imageUrl ? (
                    <img
                      src={sticker.imageUrl}
                      alt=""
                      draggable={false}
                      className={
                        sticker.category === 'tape' || sticker.type === 'tape'
                          ? 'w-28 h-auto object-contain select-none block'
                          : 'w-14 h-14 object-contain select-none block'
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
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ListView({ diaries, onSelectDiary, onDeleteDiary, onNewDiary, selectedDiaryId, selectedDate }) {
  const [searchTerm, setSearchTerm] = useState('');

  // 검색 필터링 & 최신 날짜순 정렬
  const filteredDiaries = [...diaries]
    .filter((d) => {
      const textContent = d.textBlocks?.map((t) => t.text).join(' ') || '';
      const titleMatch = (d.title || '').toLowerCase().includes(searchTerm.toLowerCase());
      const textMatch = textContent.toLowerCase().includes(searchTerm.toLowerCase());
      const dateMatch = (d.date || '').includes(searchTerm);
      return titleMatch || textMatch || dateMatch;
    })
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  // 월별 그룹화 (예: '2026-12', '2026-11' 등)
  const groupedByMonth = {};
  filteredDiaries.forEach((diary) => {
    if (!diary) return;
    const parts = diary.date ? String(diary.date).split('-') : [];
    const safeYear = parts[0] && !isNaN(parseInt(parts[0], 10)) ? parseInt(parts[0], 10) : 2026;
    const safeMonth = parts[1] && !isNaN(parseInt(parts[1], 10)) ? parseInt(parts[1], 10) : 11;
    const key = `${safeYear}-${String(safeMonth).padStart(2, '0')}`;
    if (!groupedByMonth[key]) {
      groupedByMonth[key] = {
        year: safeYear,
        month: safeMonth,
        items: []
      };
    }
    groupedByMonth[key].items.push(diary);
  });

  const monthKeys = Object.keys(groupedByMonth).sort((a, b) => b.localeCompare(a));

  return (
    <div className="flex flex-col h-full bg-[#fafafa] px-6 pb-6 overflow-y-auto no-scrollbar">
      
      {/* 1. 상단 둥근 알약형 검색창 */}
      <div className="relative my-2.5 shrink-0">
        <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-stone-400" size={17} />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="기억하고 싶은 순간, 단어, 날짜 검색..."
          className="w-full pl-11 pr-4 py-2.5 bg-white border border-stone-200/90 rounded-full text-xs sm:text-sm text-stone-800 placeholder-stone-400/80 focus:outline-hidden focus:ring-1 focus:ring-black shadow-2xs transition"
        />
      </div>

      {/* 2. 월별 그룹 일기 카드 피드 */}
      {filteredDiaries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center bg-white rounded-3xl border border-stone-200 p-6 my-auto">
          <span className="text-4xl mb-3">🍂</span>
          <p className="text-sm font-bold text-stone-800">기록된 일기가 없어요</p>
          <p className="text-xs text-stone-400 mt-1">오늘 있었던 작은 순간을 기록해보세요.</p>
          <button
            onClick={onNewDiary}
            className="mt-4 px-4 py-2 bg-black text-white rounded-xl text-xs font-medium hover:bg-stone-800 transition"
          >
            첫 일기 작성하기
          </button>
        </div>
      ) : (
        <div className="pt-1 pb-10 space-y-6">
          {monthKeys.map((key) => {
            const group = groupedByMonth[key];
            const monthName = MONTH_NAMES_EN[Math.max(0, Math.min(11, (group.month || 1) - 1))] || 'November';

            return (
              <div key={key}>
                {/* 월 헤더: 해당 월의 실제 번호와 연도 표기 (예: 12  2026 December) */}
                <div className="pt-2 pb-3 shrink-0">
                  <div className="flex items-end justify-between">
                    <div className="text-5xl sm:text-6xl font-black text-black leading-none tracking-tight">
                      {group.month}
                    </div>

                    <div className="text-right pb-1">
                      <div className="text-sm font-bold text-black leading-tight">
                        {group.year}
                      </div>
                      <div className="text-xs sm:text-sm font-bold text-black leading-tight">
                        {monthName}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 해당 월의 카드 목록 */}
                <div className="space-y-4">
                  {group.items.map((diary) => (
                    <DiaryCard
                      key={diary.id}
                      diary={diary}
                      isSelected={selectedDiaryId === diary.id || (selectedDate && selectedDate === diary.date)}
                      onSelect={onSelectDiary}
                      onDelete={onDeleteDiary}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          <div className="text-center text-[11px] text-stone-400 font-medium pt-2 select-none">
            ← 카드를 좌측으로 슬라이딩하면 삭제할 수 있어요
          </div>
        </div>
      )}
    </div>
  );
}
