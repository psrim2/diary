import React, { useState, useRef } from 'react';
import { Search, Trash2 } from 'lucide-react';
import { PAPER_STYLES } from '../constants';
import { normalizeDiaryLayers, buildStrokeBands, StrokeBandCanvas } from '../utils/canvasLayers';

const MONTH_NAMES_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const DAY_NAMES_EN = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

// 낱개 독립 슬라이딩 삭제 카드 컴포넌트
function DiaryCard({ diary, onSelect, onDelete }) {
  const [translateX, setTranslateX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const currentDeltaXRef = useRef(0);
  const isHorizontalRef = useRef(false);
  const canvasRef = useRef(null);

  // 날짜 안전 파싱
  const dateParts = diary.date ? diary.date.split('-') : ['2026', '11', '17'];
  const year = parseInt(dateParts[0], 10);
  const month = parseInt(dateParts[1], 10) - 1;
  const day = parseInt(dateParts[2], 10);

  const dateObj = new Date(year, month, day);
  const dayNum = String(day).padStart(2, '0');
  const dayEn = DAY_NAMES_EN[dateObj.getDay()];
  const mood = diary.thumbnailMood || diary.weather || '';
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

  // 작성된 모든 내용(펜 드로잉, 스티커, 글상자)이 잘리지 않고 모두 보이도록 최소 높이 계산
  const computedMinHeight = React.useMemo(() => {
    let maxY = 220;

    if (Array.isArray(diary.strokes)) {
      diary.strokes.forEach((stroke) => {
        stroke.points?.forEach((pt) => {
          if (pt && typeof pt.y === 'number') {
            maxY = Math.max(maxY, pt.y + 40);
          }
        });
      });
    }

    if (Array.isArray(diary.stickers)) {
      diary.stickers.forEach((st) => {
        if (st && typeof st.y === 'number') {
          maxY = Math.max(maxY, st.y + 80);
        }
      });
    }

    if (Array.isArray(diary.textBlocks)) {
      diary.textBlocks.forEach((tb) => {
        const lines = (tb?.text || '').split('\n').length;
        const blockBottom = (tb?.y || 20) + lines * 32 + 36;
        maxY = Math.max(maxY, blockBottom);
      });
    }

    return Math.ceil(maxY);
  }, [diary.strokes, diary.stickers, diary.textBlocks]);

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
        className={`relative z-10 bg-white rounded-3xl border border-stone-200/90 p-4 sm:p-5 shadow-xs cursor-pointer transition-transform ${
          isSwiping ? '' : 'duration-200 ease-out'
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

        {/* 박스 본문: 작성된 모든 내용이 생성 순서(layerOrder)대로 온전히 보이는 종이 속지 */}
        <div
          style={{ minHeight: `${computedMinHeight}px` }}
          className={`w-full rounded-2xl border border-stone-200/60 p-4 relative isolate overflow-hidden ${paperClass}`}
        >
          {/* 생성 순서(layerOrder)별 드로잉 밴드 캔버스 */}
          {strokeBands.map((band) => (
            <StrokeBandCanvas key={band.id} band={band} />
          ))}

          {/* 텍스트 블록 전체 (인스타그램 스토리 스타일 배지 및 정렬 반영) */}
          {normalizedLayers.textBlocks?.map((block, idx) => {
            let bgClass = '';
            let textColor = block.color || '#111111';
            let customBgStyle = undefined;

            if (block.bgStyle === 'light') {
              bgClass = 'bg-white/95 text-stone-900 shadow-xs rounded-xl px-3 py-1';
            } else if (block.bgStyle === 'dark') {
              bgClass = 'bg-black/90 text-white shadow-xs rounded-xl px-3 py-1';
              textColor = '#ffffff';
            } else if (block.bgStyle === 'color') {
              bgClass = 'text-white shadow-xs rounded-xl px-3 py-1';
              customBgStyle = { backgroundColor: block.color || '#111111' };
              textColor = '#ffffff';
            }

            return (
              <div
                key={block.id}
                style={{
                  fontFamily: block.fontFamily || "'Gaegu', cursive",
                  fontSize: `${block.fontSize || 20}px`,
                  color: textColor,
                  textAlign: block.textAlign || 'left',
                  lineHeight: '30px',
                  zIndex: typeof block.layerOrder === 'number' ? block.layerOrder : idx + 1,
                  marginTop: idx === 0 && block.y > 24 ? `${block.y - 16}px` : undefined,
                  transform:
                    block.rotation || (block.scale && block.scale !== 1)
                      ? `rotate(${block.rotation || 0}deg) scale(${block.scale || 1})`
                      : undefined,
                  transformOrigin: 'center center',
                  ...customBgStyle,
                }}
                className={`relative w-[90%] mx-auto whitespace-pre-wrap break-words select-none mb-3 ${bgClass}`}
              >
                {block.text}
              </div>
            );
          })}

          {(!normalizedLayers.textBlocks || normalizedLayers.textBlocks.length === 0) &&
            diary.summary &&
            diary.summary !== '기록된 일기' && (
              <div
                style={{ fontFamily: "'Gaegu', cursive", zIndex: 1 }}
                className="text-stone-700 text-lg leading-relaxed relative w-[90%] mx-auto whitespace-pre-wrap break-words"
              >
                {diary.summary}
              </div>
            )}

          {/* 스티커 & 마스킹 테이프 */}
          {normalizedLayers.stickers?.map((sticker, idx) => (
            <div
              key={sticker.id}
              style={{
                left: `${sticker.x || 0}px`,
                top: `${sticker.y || 0}px`,
                zIndex: typeof sticker.layerOrder === 'number' ? sticker.layerOrder : idx + 1,
                transform: `rotate(${sticker.rotation || 0}deg) scale(${sticker.scale || 1})`,
              }}
              className="absolute select-none pointer-events-none"
            >
              {sticker.imageUrl ? (
                <img
                  src={sticker.imageUrl}
                  alt={sticker.label || sticker.category || 'decoration'}
                  draggable={false}
                  className={
                    sticker.category === 'tape' || sticker.type === 'tape'
                      ? 'w-24 h-auto object-contain select-none pointer-events-none block'
                      : 'w-12 h-12 object-contain select-none pointer-events-none block'
                  }
                />
              ) : sticker.type === 'tape' ? (
                <div
                  className="w-24 h-5 rounded shadow-2xs relative overflow-hidden"
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
                />
              ) : (
                <span className="text-2xl sm:text-3xl filter drop-shadow-2xs block">
                  {sticker.content}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ListView({ diaries, onSelectDiary, onDeleteDiary, onNewDiary }) {
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
    const parts = diary.date ? diary.date.split('-') : ['2026', '11', '17'];
    const key = `${parts[0]}-${parts[1]}`;
    if (!groupedByMonth[key]) {
      groupedByMonth[key] = {
        year: parseInt(parts[0], 10),
        month: parseInt(parts[1], 10),
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
            const monthName = MONTH_NAMES_EN[group.month - 1];

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
