import React, { useState, useRef } from 'react';

const MONTH_NAMES_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function CalendarView({ diaries, onSelectDiary, onNewDiaryForDate, selectedDate }) {
  // 실제 오늘 날짜 기준
  const todayRef = new Date();
  const [currentDate, setCurrentDate] = useState(
    () => new Date(todayRef.getFullYear(), todayRef.getMonth(), 1)
  );
  
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

  // 달력 계산
  const firstDayIndex = new Date(year, month, 1).getDay(); // 0 is Sunday
  const lastDay = new Date(year, month + 1, 0).getDate();

  // 다음 달로 넘기기 (부드러운 애니메이션)
  const triggerNextMonth = () => {
    setIsAnimating(true);
    setAnimClass('transition-all duration-200 ease-out -translate-x-full opacity-0');
    
    setTimeout(() => {
      setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
      setDragOffset(0);
      setAnimClass('translate-x-full opacity-0');
      
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setAnimClass('transition-all duration-250 ease-out translate-x-0 opacity-100');
          setTimeout(() => {
            setIsAnimating(false);
            setAnimClass('');
          }, 250);
        });
      });
    }, 200);
  };

  // 이전 달로 넘기기 (부드러운 애니메이션)
  const triggerPrevMonth = () => {
    setIsAnimating(true);
    setAnimClass('transition-all duration-200 ease-out translate-x-full opacity-0');
    
    setTimeout(() => {
      setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
      setDragOffset(0);
      setAnimClass('-translate-x-full opacity-0');
      
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setAnimClass('transition-all duration-250 ease-out translate-x-0 opacity-100');
          setTimeout(() => {
            setIsAnimating(false);
            setAnimClass('');
          }, 250);
        });
      });
    }, 200);
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
    if (!isInteractingRef.current || isAnimating) return;
    isInteractingRef.current = false;

    const deltaX = currentDeltaXRef.current;
    currentDeltaXRef.current = 0;

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
      setTimeout(() => {
        setIsAnimating(false);
        setAnimClass('');
      }, 200);
    }
    isHorizontalSwipeRef.current = false;
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

          <div className="text-right pb-1">
            <div className="text-sm font-bold text-black leading-tight">
              {year}
            </div>
            <div className="text-xs sm:text-sm font-bold text-black leading-tight">
              {MONTH_NAMES_EN[month]}
            </div>
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
        [달력 날짜 그리드 - 실시간 제스처 연동 & 완벽한 세로 사이즈 Fit]
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
              className="grid grid-cols-7 gap-1 flex-1 items-center"
            >
              {week.map((cell, colIdx) => {
                if (!cell) {
                  return <div key={`empty-${colIdx}`} className="h-full" />;
                }

                const hasDiary = !!cell.diary;
                const today = isToday(cell.day);
                const isWeekend = colIdx === 0 || colIdx === 6;

                // 날짜 옆 대표 스티커/날씨로 지정한 값만 달력 아이콘으로 표출 (본문 속지 스티커와 분리)
                const rawSticker =
                  cell.diary?.thumbnailMood ||
                  cell.diary?.weather ||
                  '';

                let stickerVal = '';
                if (typeof rawSticker === 'string' || typeof rawSticker === 'number') {
                  stickerVal = String(rawSticker);
                } else if (rawSticker && typeof rawSticker === 'object') {
                  stickerVal =
                    rawSticker.imageUrl ||
                    rawSticker.icon ||
                    rawSticker.content ||
                    rawSticker.label ||
                    '';
                }

                const isStickerImage =
                  typeof stickerVal === 'string' &&
                  (stickerVal.startsWith('data:') ||
                    stickerVal.startsWith('http://') ||
                    stickerVal.startsWith('https://') ||
                    stickerVal.startsWith('/') ||
                    stickerVal.startsWith('blob:'));

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
                    className="flex flex-col items-center justify-center cursor-pointer transition-transform active:scale-95 group h-full py-0.5"
                  >
                    {/* 날짜 숫자 컨테이너 - 오늘과 일반 날짜 모두 동일한 높이(w-8 h-8 sm:w-9 sm:h-9)를 보장하여 아래 스티커 높이를 완벽히 일치시킴 */}
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
                            isWeekend ? 'text-[#ff6b00]' : 'text-black'
                          }`}
                        >
                          {cell.day}
                        </span>
                      )}
                    </div>

                    {/* 일기 작성 스티커 */}
                    <div className="min-h-[22px] flex items-center justify-center mt-0.5">
                      {hasDiary ? (
                        isStickerImage ? (
                          <img
                            src={stickerVal}
                            alt=""
                            className="w-6 h-6 sm:w-7 sm:h-7 object-contain select-none"
                          />
                        ) : (
                          <span className="text-base sm:text-lg leading-none filter drop-shadow-2xs select-none">
                            {stickerVal || '✓'}
                          </span>
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
    </div>
  );
}
