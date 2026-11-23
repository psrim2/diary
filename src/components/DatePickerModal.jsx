import React, { useState, useMemo, useEffect } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { triggerHaptic } from '../utils/haptics';

const MONTH_NAMES_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function DatePickerModal({
  isOpen,
  onClose,
  onSelectDate,
  existingDates = [],
  currentDate = null,
  title = '새 일기 작성할 날짜 선택'
}) {
  const today = useMemo(() => new Date(), []);
  
  // 기준 년/월 상태
  const [viewYear, setViewYear] = useState(() => {
    if (currentDate) {
      const parts = String(currentDate).split('-');
      const y = parseInt(parts[0], 10);
      if (!isNaN(y)) return y;
    }
    return today.getFullYear();
  });

  const [viewMonth, setViewMonth] = useState(() => {
    if (currentDate) {
      const parts = String(currentDate).split('-');
      const m = parseInt(parts[1], 10) - 1;
      if (!isNaN(m)) return m;
    }
    return today.getMonth();
  });

  // 이미 작성된 날짜 Set (빠른 조회)
  const existingSet = useMemo(() => {
    return new Set((existingDates || []).filter(Boolean));
  }, [existingDates]);

  // 이전 달로 이동
  const handlePrevMonth = () => {
    setViewMonth((prev) => {
      if (prev === 0) {
        setViewYear((y) => y - 1);
        return 11;
      }
      return prev - 1;
    });
  };

  // 다음 달로 이동
  const handleNextMonth = () => {
    setViewMonth((prev) => {
      if (prev === 11) {
        setViewYear((y) => y + 1);
        return 0;
      }
      return prev + 1;
    });
  };

  // 오늘 날짜로 점프
  const handleGoToToday = () => {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
  };

  // 달력 날짜 셀 계산
  const calendarCells = useMemo(() => {
    const firstDayIndex = new Date(viewYear, viewMonth, 1).getDay(); // 0: Sun
    const totalDays = new Date(viewYear, viewMonth + 1, 0).getDate();

    const cells = [];
    // 첫 주 빈칸
    for (let i = 0; i < firstDayIndex; i++) {
      cells.push(null);
    }
    // 날짜 채우기
    for (let day = 1; day <= totalDays; day++) {
      const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isAlreadyWritten = existingSet.has(dateStr);
      const isToday =
        viewYear === today.getFullYear() &&
        viewMonth === today.getMonth() &&
        day === today.getDate();

      cells.push({
        day,
        dateStr,
        isAlreadyWritten,
        isToday,
      });
    }
    return cells;
  }, [viewYear, viewMonth, existingSet, today]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-fadeIn select-none"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 상단 헤더: 타이틀 & 닫기 */}
        <div className="flex items-center justify-between pb-3 border-b border-stone-100">
          <div>
            <h3 className="text-base font-extrabold text-stone-900 tracking-tight">
              {title}
            </h3>
            <p className="text-[11px] text-stone-400 mt-0.5">
              이미 작성된 날짜는 선택할 수 없어요
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-stone-400 hover:text-stone-800 hover:bg-stone-100 active:scale-95 transition cursor-pointer"
            title="닫기"
          >
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>

        {/* 연/월 내비게이션 & 오늘 버튼 */}
        <div className="flex items-center justify-between pt-3 pb-2">
          <div className="flex items-center space-x-1.5">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                handlePrevMonth();
              }}
              className="p-1 rounded-full text-stone-500 hover:text-black hover:bg-stone-100 active:scale-95 transition cursor-pointer"
              title="이전 달"
            >
              <ChevronLeft size={18} strokeWidth={2.5} />
            </button>
            <div className="text-base font-bold text-black tracking-tight">
              {viewYear}년 {viewMonth + 1}월
              <span className="text-xs font-semibold text-stone-400 ml-1.5">
                {MONTH_NAMES_EN[viewMonth]}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                handleNextMonth();
              }}
              className="p-1 rounded-full text-stone-500 hover:text-black hover:bg-stone-100 active:scale-95 transition cursor-pointer"
              title="다음 달"
            >
              <ChevronRight size={18} strokeWidth={2.5} />
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              handleGoToToday();
            }}
            className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-700 active:scale-95 transition cursor-pointer"
          >
            오늘
          </button>
        </div>

        {/* 요일 헤더 */}
        <div className="grid grid-cols-7 text-center py-1.5 text-[11px] font-bold text-stone-400">
          <span className="text-red-500">일</span>
          <span>월</span>
          <span>화</span>
          <span>수</span>
          <span>목</span>
          <span>금</span>
          <span className="text-blue-500">토</span>
        </div>

        {/* 날짜 그리드 */}
        <div className="grid grid-cols-7 gap-1 pt-1 pb-2">
          {calendarCells.map((cell, idx) => {
            if (!cell) {
              return <div key={`empty-${idx}`} className="h-10" />;
            }

            const colIndex = idx % 7;
            const isWeekend = colIndex === 0 || colIndex === 6;

            if (cell.isAlreadyWritten) {
              return (
                <div
                  key={cell.dateStr}
                  className="h-10 rounded-2xl flex flex-col items-center justify-center opacity-30 bg-stone-100 cursor-not-allowed select-none relative"
                  title={`${cell.dateStr} (이미 작성된 일기가 있습니다)`}
                >
                  <span className="text-xs font-bold text-stone-400 line-through">
                    {cell.day}
                  </span>
                  <span className="text-[9px] text-stone-400 leading-none scale-90">
                    작성됨
                  </span>
                </div>
              );
            }

            return (
              <button
                key={cell.dateStr}
                type="button"
                onClick={() => {
                  triggerHaptic('medium');
                  onSelectDate(cell.dateStr);
                  onClose();
                }}
                className={`h-10 rounded-2xl flex flex-col items-center justify-center transition-all active:scale-90 cursor-pointer ${
                  cell.isToday
                    ? 'bg-black text-white font-bold shadow-xs'
                    : isWeekend
                    ? 'hover:bg-stone-100 text-[#ff6b00] font-bold'
                    : 'hover:bg-stone-100 text-stone-900 font-bold'
                }`}
                title={`${cell.dateStr} 선택`}
              >
                <span className="text-xs leading-none">
                  {cell.day}
                </span>
                {cell.isToday && (
                  <span className="text-[8px] leading-none opacity-80 mt-0.5">
                    오늘
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* 안내 문구 */}
        <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-400">
          <div className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-stone-300 inline-block" />
            <span>회색 취소선: 이미 작성된 날짜</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-500 hover:text-black font-semibold cursor-pointer"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
