import React, { useRef, useMemo, useState, useEffect } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { getKoreanHoliday } from '../utils/holidays';

const MONTH_NAMES_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function YearlyCalendarModal({
  isOpen,
  onClose,
  initialYear,
  diaries = [],
  onSelectMonth,
  onSelectDiary,
  onGoToToday,
}) {
  const todayRef = new Date();
  const todayYear = todayRef.getFullYear();
  const todayMonth = todayRef.getMonth();
  const todayDate = todayRef.getDate();
  const localTodayStr = `${todayYear}-${String(todayMonth + 1).padStart(2, '0')}-${String(todayDate).padStart(2, '0')}`;
  const [currentYear, setCurrentYear] = useState(() => initialYear || todayYear);

  useEffect(() => {
    if (initialYear) {
      setCurrentYear(initialYear);
    }
  }, [initialYear]);

  // 터치 스와이프 & 마우스 드래그로 연도 변경
  const touchStartXRef = useRef(0);
  const touchStartYRef = useRef(0);
  const touchDeltaXRef = useRef(0);
  const touchDeltaYRef = useRef(0);

  const handleTouchStart = (e) => {
    if (e.touches && e.touches[0]) {
      touchStartXRef.current = e.touches[0].clientX;
      touchStartYRef.current = e.touches[0].clientY;
      touchDeltaXRef.current = 0;
      touchDeltaYRef.current = 0;
    }
  };

  const handleTouchMove = (e) => {
    if (e.touches && e.touches[0]) {
      touchDeltaXRef.current = e.touches[0].clientX - touchStartXRef.current;
      touchDeltaYRef.current = e.touches[0].clientY - touchStartYRef.current;
    }
  };

  const handleTouchEnd = () => {
    const dx = touchDeltaXRef.current;
    const dy = touchDeltaYRef.current;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      if (dx < 0) {
        setCurrentYear(prev => prev + 1);
      } else {
        setCurrentYear(prev => prev - 1);
      }
    }
    touchStartXRef.current = 0;
    touchStartYRef.current = 0;
    touchDeltaXRef.current = 0;
    touchDeltaYRef.current = 0;
  };

  const mouseStartXRef = useRef(null);
  const handleMouseDown = (e) => {
    mouseStartXRef.current = e.clientX;
  };
  const handleMouseUp = (e) => {
    if (mouseStartXRef.current !== null) {
      const dx = e.clientX - mouseStartXRef.current;
      if (Math.abs(dx) > 50) {
        if (dx < 0) {
          setCurrentYear(prev => prev + 1);
        } else {
          setCurrentYear(prev => prev - 1);
        }
      }
      mouseStartXRef.current = null;
    }
  };

  const diaryByDateMap = useMemo(() => {
    const map = new Map();
    (diaries || []).forEach((d) => {
      if (d?.date) {
        map.set(d.date, d);
      }
    });
    return map;
  }, [diaries]);

  // 12개월 날짜 계산
  const yearMonths = useMemo(() => {
    return Array.from({ length: 12 }, (_, monthIdx) => {
      const firstDayOfWeek = new Date(currentYear, monthIdx, 1).getDay();
      const daysCount = new Date(currentYear, monthIdx + 1, 0).getDate();

      const cells = [];
      for (let i = 0; i < firstDayOfWeek; i++) {
        cells.push(null);
      }
      for (let d = 1; d <= daysCount; d++) {
        const dateStr = `${currentYear}-${String(monthIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        cells.push({
          day: d,
          dateStr,
          diary: diaryByDateMap.get(dateStr),
        });
      }
      return {
        monthIdx,
        monthNameKo: `${monthIdx + 1}월`,
        monthNameEn: MONTH_NAMES_EN[monthIdx],
        cells,
      };
    });
  }, [currentYear, diaryByDateMap]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex flex-col justify-start bg-[#fafafa] text-black px-6 pb-6 select-none overflow-hidden h-[100dvh] animate-fadeIn"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
    >
      {/* 상단 헤더: ← (뒤로가기), 2026 (중앙 연도 및 좌우 화살표), 오늘 (우측 44px 원형 오늘 버튼) */}
      <div className="w-full flex items-center justify-between pt-[calc(0.75rem+env(safe-area-inset-top,0px))] pb-0 shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="p-2 -ml-2 rounded-full hover:bg-black/5 text-black transition active:scale-95 cursor-pointer"
          title="돌아가기"
        >
          <ArrowLeft size={24} strokeWidth={2.5} />
        </button>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setCurrentYear(prev => prev - 1)}
            className="p-1 rounded-full hover:bg-black/5 text-stone-400 hover:text-black transition cursor-pointer"
            title="이전 해"
          >
            <ChevronLeft size={20} strokeWidth={2.5} />
          </button>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-black tracking-tight select-none">
            {currentYear}
          </h2>
          <button
            type="button"
            onClick={() => setCurrentYear(prev => prev + 1)}
            className="p-1 rounded-full hover:bg-black/5 text-stone-400 hover:text-black transition cursor-pointer"
            title="다음 해"
          >
            <ChevronRight size={20} strokeWidth={2.5} />
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            const now = new Date();
            setCurrentYear(now.getFullYear());
            if (onGoToToday) {
              onGoToToday();
            } else if (onSelectMonth) {
              onSelectMonth(now.getFullYear(), now.getMonth());
            }
            onClose();
          }}
          className="w-[44px] h-[44px] rounded-full bg-white border border-stone-300 shadow-xs flex items-center justify-center font-bold text-xs sm:text-sm text-stone-900 active:scale-95 hover:bg-stone-50 transition-all cursor-pointer select-none shrink-0"
          title="오늘 날짜로 이동"
        >
          오늘
        </button>
      </div>

      {/* 12개월 3열 x 4행 그리드: 달력 시작 위의 마진값(marginTop)을 아래 달간의 세로 gap(rowGap)과 100% 동일하게 일치 */}
      <div 
        style={{
          '--month-gap': 'clamp(14px, 2.2vh, 22px)',
          rowGap: 'var(--month-gap)',
          marginTop: 'var(--month-gap)',
        }}
        className="w-full grid grid-cols-3 gap-x-4 sm:gap-x-6 overflow-hidden select-none"
      >
        {yearMonths.map((m) => (
          <div 
            key={m.monthIdx}
            onClick={() => {
              if (onSelectMonth) {
                onSelectMonth(currentYear, m.monthIdx);
              }
              onClose();
            }}
            className="flex flex-col justify-start cursor-pointer group"
            title={`${m.monthIdx + 1}월 달력으로 이동`}
          >
            {/* 월 번호 (01, 02, ...) + 아래 가로 라인 */}
            <div className="select-none">
              <div className="text-sm sm:text-base font-black text-black group-hover:opacity-75 transition-opacity">
                {String(m.monthIdx + 1).padStart(2, '0')}
              </div>
              <div className="w-full h-[1.5px] bg-black mt-0.5 mb-1" />
            </div>

            {/* 7열 날짜 그리드 (S M T W T F S 순서, 요일 라벨 없이 날짜 직결) */}
            <div className="grid grid-cols-7 gap-x-0.5 gap-y-0.5 text-center select-none">
              {m.cells.map((c, cIdx) => {
                if (!c) {
                  return <div key={`empty-${cIdx}`} className="h-4 sm:h-5" />;
                }

                const isCellToday = c.dateStr === localTodayStr;
                const colDayOfWeek = cIdx % 7;
                const isCellWeekend = colDayOfWeek === 0 || colDayOfWeek === 6;
                const isCellHoliday = !!getKoreanHoliday(c.dateStr);
                const isHolidayOrWeekend = isCellWeekend || isCellHoliday;
                const hasDiary = !!c.diary;

                return (
                  <div
                    key={c.dateStr}
                    onClick={(e) => {
                      e.stopPropagation();
                      // 월 클릭 시 또는 날짜 클릭 시 입력이 아닌 해당 달력 보여줌
                      if (onSelectMonth) {
                        onSelectMonth(currentYear, m.monthIdx);
                      }
                      onClose();
                    }}
                    className="h-4 sm:h-5 flex items-center justify-center cursor-pointer transition-transform active:scale-90 relative"
                    title={`${c.dateStr} ${m.monthIdx + 1}월 달력 보기`}
                  >
                    {isCellToday ? (
                      <span 
                        className="w-4 h-4 sm:w-4.5 sm:h-4.5 rounded-full bg-stone-200 flex items-center justify-center select-none shrink-0"
                        title={`${c.dateStr} 오늘${hasDiary ? ' (일기 있음)' : ''}`}
                      >
                        {hasDiary ? (
                          <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-black block select-none shrink-0" />
                        ) : (
                          <span className="font-bold text-[9px] sm:text-[10px] leading-none text-black select-none">
                            {c.day}
                          </span>
                        )}
                      </span>
                    ) : hasDiary ? (
                      <span 
                        className="w-[10px] h-[10px] rounded-full border-[2px] border-black block select-none shrink-0" 
                        title={`${c.dateStr} 일기 있음`}
                      />
                    ) : (
                      <span className={`text-[9px] sm:text-[10px] font-bold leading-none ${isHolidayOrWeekend ? 'text-[#ff6b00]' : 'text-black'}`}>
                        {c.day}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
