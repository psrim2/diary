import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import YearlyCalendarModal from './YearlyCalendarModal';
import { resolveStickerImage, upgradePresetSvgUrl } from '../utils/canvasLayers';
import { getKoreanHoliday } from '../utils/holidays';

const MONTH_NAMES_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function CalendarView({ 
  diaries, 
  onSelectDiary, 
  onNewDiaryForDate, 
  selectedDate,
  onMonthChange,
  initialDate,
  onOpenYearView
}) {
  // 실제 오늘 날짜 기준
  const todayRef = new Date();
  const [currentDate, setCurrentDate] = useState(
    () => initialDate ? new Date(initialDate.getFullYear(), initialDate.getMonth(), 1) : new Date(todayRef.getFullYear(), todayRef.getMonth(), 1)
  );

  // 내부 스와이프/네비게이션으로 월 변경 시 부모와의 무한 루프 및 이전 월 깜박임(stale prop) 방지 ref
  const internalMonthUpdateRef = useRef(false);

  useEffect(() => {
    if (initialDate) {
      const initY = initialDate.getFullYear();
      const initM = initialDate.getMonth();
      const currY = currentDate.getFullYear();
      const currM = currentDate.getMonth();

      // 이미 동일한 연/월이면 상태를 재설정하지 않음 (깜박임 원천 차단)
      if (currY === initY && currM === initM) {
        internalMonthUpdateRef.current = false;
        return;
      }

      // 내부에서 방금 변경한 경우 부모가 보낸 이전 월 prop 무시
      if (internalMonthUpdateRef.current) {
        internalMonthUpdateRef.current = false;
        return;
      }

      setCurrentDate(new Date(initY, initM, 1));
    }
  }, [initialDate?.getFullYear(), initialDate?.getMonth()]);

  // 1년 단위 연력(Yearly Calendar) 모달 열림 상태 & 조회 연도
  const [isYearViewOpen, setIsYearViewOpen] = useState(false);
  const [yearViewYear, setYearViewYear] = useState(() => todayRef.getFullYear());

  const handleGoToToday = () => {
    const now = new Date();
    setCurrentDate(new Date(now.getFullYear(), now.getMonth(), 1));
    setYearViewYear(now.getFullYear());
  };

  // 연력(YearView) 터치 스와이프 및 마우스 드래그로 연도 변경
  const yearTouchStartXRef = useRef(0);
  const yearTouchStartYRef = useRef(0);
  const yearTouchDeltaXRef = useRef(0);
  const yearTouchDeltaYRef = useRef(0);

  const handleYearTouchStart = (e) => {
    if (e.touches && e.touches[0]) {
      yearTouchStartXRef.current = e.touches[0].clientX;
      yearTouchStartYRef.current = e.touches[0].clientY;
      yearTouchDeltaXRef.current = 0;
      yearTouchDeltaYRef.current = 0;
    }
  };

  const handleYearTouchMove = (e) => {
    if (e.touches && e.touches[0]) {
      yearTouchDeltaXRef.current = e.touches[0].clientX - yearTouchStartXRef.current;
      yearTouchDeltaYRef.current = e.touches[0].clientY - yearTouchStartYRef.current;
    }
  };

  const handleYearTouchEnd = () => {
    const dx = yearTouchDeltaXRef.current;
    const dy = yearTouchDeltaYRef.current;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      if (dx < 0) {
        setYearViewYear(prev => prev + 1);
      } else {
        setYearViewYear(prev => prev - 1);
      }
    }
    yearTouchStartXRef.current = 0;
    yearTouchStartYRef.current = 0;
    yearTouchDeltaXRef.current = 0;
    yearTouchDeltaYRef.current = 0;
  };

  const yearMouseStartXRef = useRef(null);
  const handleYearMouseDown = (e) => {
    yearMouseStartXRef.current = e.clientX;
  };
  const handleYearMouseUp = (e) => {
    if (yearMouseStartXRef.current !== null) {
      const dx = e.clientX - yearMouseStartXRef.current;
      if (Math.abs(dx) > 50) {
        if (dx < 0) {
          setYearViewYear(prev => prev + 1);
        } else {
          setYearViewYear(prev => prev - 1);
        }
      }
      yearMouseStartXRef.current = null;
    }
  };
  
  // 실시간 드래그 오프셋 & 전환 애니메이션 상태
  const [dragOffset, setDragOffset] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [animClass, setAnimClass] = useState('');

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // 제스처 감지용 ref
  const touchStartXRef = useRef(0);
  const touchStartYRef = useRef(0);
  const currentDeltaXRef = useRef(0);
  const isInteractingRef = useRef(false);
  const isHorizontalSwipeRef = useRef(false);

  // 애니메이션 타이머 ref 관리 (중복 실행 및 타이머 꼬임 방지)
  const animTimeoutRef = useRef(null);
  const animFrameRef1 = useRef(null);
  const animFrameRef2 = useRef(null);
  const animFinishTimeoutRef = useRef(null);

  const clearAnimationTimers = () => {
    if (animTimeoutRef.current) clearTimeout(animTimeoutRef.current);
    if (animFinishTimeoutRef.current) clearTimeout(animFinishTimeoutRef.current);
    if (animFrameRef1.current) cancelAnimationFrame(animFrameRef1.current);
    if (animFrameRef2.current) cancelAnimationFrame(animFrameRef2.current);
  };

  useEffect(() => {
    return () => clearAnimationTimers();
  }, []);

  // 월이 변경되거나 최초 마운트 시 드래그 오프셋 및 제스처 상태 초기화
  useEffect(() => {
    setDragOffset(0);
    isInteractingRef.current = false;
    currentDeltaXRef.current = 0;
    isHorizontalSwipeRef.current = false;
  }, [currentDate]);

  // 달력 계산
  const firstDayIndex = new Date(year, month, 1).getDay(); // 0 is Sunday
  const lastDay = new Date(year, month + 1, 0).getDate();

  // 월 전환 처리 (단일 트랜잭션으로 깜박임 및 직전 달력 역전 현상 원천 차단)
  const handleMonthTransition = (targetDate, direction) => {
    internalMonthUpdateRef.current = true;
    clearAnimationTimers();
    setIsAnimating(true);
    setDragOffset(0);

    // 부모 App에 변경 통보하여 헤더 동기화
    onMonthChange?.(targetDate);

    // 날짜 상태 즉시 갱신
    setCurrentDate(targetDate);

    // 방향에 따른 슬라이드 인 애니메이션 적용
    const slideClass = direction === 'next' ? 'anim-month-slide-in-right' : 'anim-month-slide-in-left';
    setAnimClass(slideClass);

    animTimeoutRef.current = setTimeout(() => {
      setAnimClass('');
      setIsAnimating(false);
    }, 240);
  };

  // 다음 달로 넘기기
  const triggerNextMonth = () => {
    const nextDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
    handleMonthTransition(nextDate, 'next');
  };

  // 이전 달로 넘기기
  const triggerPrevMonth = () => {
    const prevDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
    handleMonthTransition(prevDate, 'prev');
  };

  // 터치 제스처
  const handleTouchStart = (e) => {
    if (isAnimating) return;
    isInteractingRef.current = true;
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
    currentDeltaXRef.current = 0;
    isHorizontalSwipeRef.current = false;
  };

  const handleTouchMove = (e) => {
    if (!isInteractingRef.current || isAnimating) return;
    const clientX = e.touches[0].clientX;
    const clientY = e.touches[0].clientY;
    const deltaX = clientX - touchStartXRef.current;
    const deltaY = clientY - touchStartYRef.current;

    // 가로 스와이프 판단 (가로 움직임이 세로보다 크고 6px 이상 움직였을 때)
    if (!isHorizontalSwipeRef.current) {
      if (Math.abs(deltaX) > 6 && Math.abs(deltaX) > Math.abs(deltaY)) {
        isHorizontalSwipeRef.current = true;
      } else if (Math.abs(deltaY) > 8) {
        // 세로 스크롤 의도시 무시
        return;
      }
    }

    if (isHorizontalSwipeRef.current) {
      currentDeltaXRef.current = deltaX;
      // 저항감(Damping) 있는 자연스러운 실시간 이동
      const dampedOffset = deltaX * 0.75;
      setDragOffset(dampedOffset);
    }
  };

  const handleTouchEnd = () => {
    if (!isInteractingRef.current) return;
    isInteractingRef.current = false;

    const deltaX = currentDeltaXRef.current;
    currentDeltaXRef.current = 0;
    isHorizontalSwipeRef.current = false;

    if (deltaX < -45) {
      // 왼쪽으로 45px 이상 스와이프 -> 다음 달
      triggerNextMonth();
    } else if (deltaX > 45) {
      // 오른쪽으로 45px 이상 스와이프 -> 이전 달
      triggerPrevMonth();
    } else {
      // 미달 시 제자리로 부드러운 스프링 복귀
      setIsAnimating(true);
      setAnimClass('transition-transform duration-200 ease-out');
      setDragOffset(0);
      animFinishTimeoutRef.current = setTimeout(() => {
        setIsAnimating(false);
        setAnimClass('');
      }, 200);
    }
  };

  const handleTouchCancel = () => {
    isInteractingRef.current = false;
    currentDeltaXRef.current = 0;
    isHorizontalSwipeRef.current = false;
    setDragOffset(0);
    setIsAnimating(false);
    setAnimClass('');
  };

  // 마우스 제스처 (PC 지원)
  const handleMouseDown = (e) => {
    if (isAnimating) return;
    isInteractingRef.current = true;
    touchStartXRef.current = e.clientX;
    touchStartYRef.current = e.clientY;
    currentDeltaXRef.current = 0;
    isHorizontalSwipeRef.current = false;
  };

  const handleMouseMove = (e) => {
    if (!isInteractingRef.current || isAnimating) return;
    const deltaX = e.clientX - touchStartXRef.current;
    const deltaY = e.clientY - touchStartYRef.current;

    if (!isHorizontalSwipeRef.current && Math.abs(deltaX) > 5) {
      isHorizontalSwipeRef.current = true;
    }

    if (isHorizontalSwipeRef.current) {
      currentDeltaXRef.current = deltaX;
      setDragOffset(deltaX * 0.75);
    }
  };

  const handleMouseUp = () => {
    if (!isInteractingRef.current) return;
    handleTouchEnd();
  };

  // 화면 밖으로 터치/마우스가 벗어나거나 앱 전환 시 오프셋이 걸려 멈추는 현상 원천 차단
  useEffect(() => {
    const handleGlobalEnd = () => {
      if (isInteractingRef.current) {
        handleTouchEnd();
      }
    };
    const handleGlobalCancel = () => {
      handleTouchCancel();
    };

    window.addEventListener('mouseup', handleGlobalEnd);
    window.addEventListener('touchend', handleGlobalEnd);
    window.addEventListener('touchcancel', handleGlobalCancel);
    window.addEventListener('blur', handleGlobalCancel);

    return () => {
      window.removeEventListener('mouseup', handleGlobalEnd);
      window.removeEventListener('touchend', handleGlobalEnd);
      window.removeEventListener('touchcancel', handleGlobalCancel);
      window.removeEventListener('blur', handleGlobalCancel);
    };
  }, []);

  // 날짜 포맷
  const formatDateStr = (d) => {
    const mm = String(month + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    return `${year}-${mm}-${dd}`;
  };

  const diaryMap = {};
  diaries.forEach((d) => {
    diaryMap[d.date] = d;
  });

  const diaryByDateMap = useMemo(() => {
    const map = new Map();
    (diaries || []).forEach((d) => {
      if (d?.date) {
        map.set(d.date, d);
      }
    });
    return map;
  }, [diaries]);

  // 1년 단위 연력 데이터 계산 (12개월)
  const yearMonths = useMemo(() => {
    return Array.from({ length: 12 }, (_, monthIdx) => {
      const firstDayOfWeek = new Date(yearViewYear, monthIdx, 1).getDay();
      const daysCount = new Date(yearViewYear, monthIdx + 1, 0).getDate();

      const cells = [];
      for (let i = 0; i < firstDayOfWeek; i++) {
        cells.push(null);
      }
      for (let d = 1; d <= daysCount; d++) {
        const dateStr = `${yearViewYear}-${String(monthIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
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
  }, [yearViewYear, diaryByDateMap]);

  const daysOfWeek = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  // 날짜 셀 묶기
  const weeks = [];
  let currentWeek = [];

  for (let i = 0; i < firstDayIndex; i++) {
    currentWeek.push(null);
  }

  for (let day = 1; day <= lastDay; day++) {
    const dateStr = formatDateStr(day);
    currentWeek.push({
      day,
      dateStr,
      diary: diaryMap[dateStr]
    });

    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }

  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) {
      currentWeek.push(null);
    }
    weeks.push(currentWeek);
  }

  const isToday = (day) => {
    const now = new Date();
    return (
      year === now.getFullYear() &&
      month === now.getMonth() &&
      day === now.getDate()
    );
  };

  return (
    <div 
      className="flex flex-col h-full bg-[#fafafa] px-6 pb-6 select-none overflow-hidden touch-none"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* 
        ================================================================
        [월 헤더]
        ================================================================
      */}
      <div className="pt-2 pb-1 shrink-0">
        <div className="flex items-end justify-between">
          <div className="text-5xl sm:text-6xl font-black text-black leading-none tracking-tight">
            {month + 1}
          </div>

          <div className="pb-1">
            {/* 2026 November 클릭 시 1년 단위 연력 모달 표출 */}
            <button
              type="button"
              onClick={() => {
                if (onOpenYearView) {
                  onOpenYearView(year);
                } else {
                  setYearViewYear(year);
                  setIsYearViewOpen(true);
                }
              }}
              className="text-right group cursor-pointer hover:opacity-75 transition-opacity select-none focus:outline-none"
              title="1년 연력(전체 달력) 보기"
            >
              <div className="text-sm font-bold text-black leading-tight group-hover:underline">
                {year}
              </div>
              <div className="text-xs sm:text-sm font-bold text-black leading-tight group-hover:underline">
                {MONTH_NAMES_EN[month]}
              </div>
            </button>
          </div>
        </div>

        {/* 상단 블랙 가로 구분선 */}
        <div className="w-full h-[1.5px] bg-black mt-3" />

        {/* 요일 헤더: S(오렌지)  M  T  W  T  F  S(오렌지) */}
        <div className="grid grid-cols-7 gap-1 pt-3 pb-2 text-center border-b border-black/80">
          {daysOfWeek.map((day, idx) => (
            <div
              key={idx}
              className={`text-sm sm:text-base font-bold ${
                idx === 0 || idx === 6 ? 'text-[#ff6b00]' : 'text-black'
              }`}
            >
              {day}
            </div>
          ))}
        </div>
      </div>

      {/* 
        ================================================================
        [달력 날짜 그리드 - 실시간 제스처 연동 & 날짜 세로 정렬 일치]
        ================================================================
      */}
      <div 
        className="flex-1 flex flex-col justify-between py-2 sm:py-3 cursor-grab active:cursor-grabbing relative overflow-hidden"
      >
        <div 
          className={`flex-1 flex flex-col justify-between ${animClass}`}
          style={
            !isAnimating && dragOffset !== 0
              ? { transform: `translateX(${dragOffset}px)` }
              : undefined
          }
        >
          {weeks.map((week, weekIdx) => (
            <div 
              key={weekIdx} 
              className="grid grid-cols-7 gap-1 flex-1 items-start"
            >
              {week.map((cell, colIdx) => {
                if (!cell) {
                  return <div key={`empty-${colIdx}`} className="h-full" />;
                }

                const hasDiary = !!cell.diary;
                const today = isToday(cell.day);
                const isWeekend = colIdx === 0 || colIdx === 6;
                const holiday = getKoreanHoliday(cell.dateStr);
                const isHolidayOrWeekend = isWeekend || !!holiday;

                // 날짜 옆 대표 스티커/날씨로 지정한 값만 달력 아이콘으로 표출 (본문 속지 스티커와 분리)
                const rawSticker = upgradePresetSvgUrl(
                  cell.diary?.thumbnailMood ||
                  cell.diary?.weather ||
                  ''
                );

                let stickerVal = '';
                let isStickerImage = false;

                if (typeof rawSticker === 'string' || typeof rawSticker === 'number') {
                  stickerVal = upgradePresetSvgUrl(String(rawSticker));
                } else if (rawSticker && typeof rawSticker === 'object') {
                  const resolvedImg = resolveStickerImage(rawSticker);
                  if (resolvedImg) {
                    stickerVal = upgradePresetSvgUrl(resolvedImg);
                    stickerVal = resolvedImg;
                  } else if (rawSticker.icon && typeof rawSticker.icon === 'string' && rawSticker.icon.length <= 4) {
                    stickerVal = rawSticker.icon;
                  } else if (rawSticker.content && typeof rawSticker.content === 'string' && rawSticker.content.length <= 4) {
                    stickerVal = rawSticker.content;
                  }
                }

                isStickerImage =
                  typeof stickerVal === 'string' &&
                  (stickerVal.startsWith('data:') ||
                    stickerVal.startsWith('http://') ||
                    stickerVal.startsWith('https://') ||
                    stickerVal.startsWith('/') ||
                    stickerVal.startsWith('blob:'));

                // 영문 단어 라벨(예: "moomi", "cat" 등)이 달력 날짜 아래에 텍스트로 노출되는 현상 완전 방지
                const isShortEmojiOrSymbol =
                  !isStickerImage &&
                  typeof stickerVal === 'string' &&
                  stickerVal.length > 0 &&
                  stickerVal.length <= 4 &&
                  !/^[a-zA-Z0-9_\-|\s]+$/.test(stickerVal);

                return (
                  <div
                    key={cell.dateStr}
                    onClick={(e) => {
                      // 드래그 중이 아닐 때만 날짜 클릭 동작 (스와이프 오작동 방지)
                      if (Math.abs(currentDeltaXRef.current) > 5) return;
                      if (hasDiary) {
                        onSelectDiary(cell.diary);
                      } else {
                        onNewDiaryForDate(cell.dateStr);
                      }
                    }}
                    className="flex flex-col items-center justify-start cursor-pointer transition-transform active:scale-95 group h-full py-0.5"
                  >
                    {/* 1. 날짜 숫자 컨테이너 - 오늘과 일반 날짜 모두 동일한 높이(w-8 h-8 sm:w-9 sm:h-9)를 보장하여 날짜를 수평 일직선으로 완벽 정렬 */}
                    <div className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center shrink-0 relative">
                      {/* 선택된 날짜 표시: 오늘 표시 원과 동일한 크기의 스트로크(stroke) (모바일 버전에서는 미표시, 2분할 뷰 lg에서만 표시) */}
                      {cell.dateStr === selectedDate && !today && (
                        <div className="hidden lg:block absolute inset-0 rounded-full border-2 border-black pointer-events-none" />
                      )}
                      {cell.dateStr === selectedDate && today && (
                        <div className="hidden lg:block absolute -inset-0.5 rounded-full border-2 border-black pointer-events-none" />
                      )}

                      {today ? (
                        <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#1e1e1e] text-white flex items-center justify-center font-bold text-sm sm:text-base shadow-xs">
                          {cell.day}
                        </div>
                      ) : (
                        <span
                          className={`text-base sm:text-lg font-bold leading-none ${
                            isHolidayOrWeekend ? 'text-[#ff6b00]' : 'text-black'
                          }`}
                        >
                          {cell.day}
                        </span>
                      )}
                    </div>

                    {/* 2. 휴일명 슬롯 (날짜 바로 아래) - 14px 고정 슬롯으로 휴일이 없는 날도 동일한 간격 유지하여 행 전체 정렬 보장 */}
                    <div className="w-full h-[14px] sm:h-[15px] flex items-center justify-center shrink-0 overflow-hidden leading-none my-0.5">
                      {holiday ? (
                        <span className="text-[9px] sm:text-[10px] font-semibold text-[#ff6b00] truncate max-w-full px-0.5 select-none text-center">
                          {holiday.name}
                        </span>
                      ) : (
                        <div className="h-[14px] sm:h-[15px]" />
                      )}
                    </div>

                    {/* 3. 일기 작성 스티커 / dot 슬롯 - 날짜 -> 휴일명 -> 스티커 순으로 배치 */}
                    <div className="w-full h-[32px] sm:h-[34px] flex items-center justify-center shrink-0 overflow-visible">
                      {hasDiary ? (
                        isStickerImage ? (
                          <img
                            src={stickerVal}
                            alt=""
                            style={{ width: '80%', maxWidth: '32px', maxHeight: '32px', height: 'auto' }}
                            className="w-[80%] max-w-[32px] max-h-[32px] h-auto object-contain select-none pointer-events-none"
                          />
                        ) : isShortEmojiOrSymbol ? (
                          <span className="text-base sm:text-lg leading-none filter drop-shadow-2xs select-none">
                            {stickerVal}
                          </span>
                        ) : (
                          <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-[#84cc16] select-none block shadow-2xs" />
                        )
                      ) : (
                        <div className="w-1 h-1" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* 1년 단위 연간 달력 (Yearly Calendar) 모달 */}
      {!onOpenYearView && (
        <YearlyCalendarModal
          isOpen={isYearViewOpen}
          onClose={() => setIsYearViewOpen(false)}
          initialYear={yearViewYear}
          diaries={diaries}
          onSelectMonth={(y, mIdx) => {
            setCurrentDate(new Date(y, mIdx, 1));
            setIsYearViewOpen(false);
          }}
          onSelectDiary={(d) => {
            onSelectDiary(d);
            setIsYearViewOpen(false);
          }}
          onGoToToday={handleGoToToday}
        />
      )}
    </div>
  );
}
