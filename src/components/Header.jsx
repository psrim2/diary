import React, { useState, useRef, useEffect } from 'react';
import { Edit2, Menu, LayoutGrid } from 'lucide-react';
import { triggerHaptic } from '../utils/haptics';
import SideMenuDrawer from './SideMenuDrawer';

export default function Header({ 
  currentView, 
  setCurrentView, 
  onNewDiary,
  onGoToToday,
  diaryName,
  setDiaryName,
  user,
  isAuthLoading,
  isSyncing,
  authError,
  onLogin,
  onLogout,
  onOpenAdmin,
  isThumbnailView,
  onToggleThumbnailView,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [tempName, setTempName] = useState(diaryName);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    setTempName(diaryName);
  }, [diaryName]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleFinishEditing = () => {
    setIsEditing(false);
    const trimmed = tempName.trim();
    if (trimmed) {
      setDiaryName(trimmed);
      localStorage.setItem('analog_diary_name', trimmed);
    } else {
      setTempName(diaryName);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleFinishEditing();
    } else if (e.key === 'Escape') {
      setTempName(diaryName);
      setIsEditing(false);
    }
  };

  return (
    <header className="px-6 pt-[calc(1.25rem+env(safe-area-inset-top,0px))] pb-2 shrink-0 bg-[#fafafa]">
      {/* 1. 최상단: [맨 왼쪽 3선(☰) 메뉴 버튼] ── [타이틀 (클릭 시 수정)] */}
      <div className="flex items-center justify-between">
        <div className="flex items-center flex-1">
          {/* 삼선버튼: 맨 왼쪽, 타이틀 시작 왼쪽에 배치 */}
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setIsDrawerOpen(true);
            }}
            className="-ml-1.5 mr-2.5 p-1.5 rounded-xl text-stone-900 hover:bg-stone-200/70 active:scale-95 transition cursor-pointer shrink-0 flex items-center justify-center"
            title="메뉴 열기"
            aria-label="메뉴 열기"
          >
            <Menu size={24} strokeWidth={2.4} />
          </button>

          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              onBlur={handleFinishEditing}
              onKeyDown={handleKeyDown}
              maxLength={24}
              className="text-2xl sm:text-3xl font-black text-[#000000] tracking-tight leading-normal bg-transparent border-0 border-b-2 border-black focus:outline-hidden focus:ring-0 p-0 w-full"
            />
          ) : (
            <div
              onClick={() => setIsEditing(true)}
              className="group inline-flex items-center space-x-1.5 cursor-pointer"
              title="클릭하여 다이어리 이름 변경"
            >
              <h1 className="text-2xl sm:text-3xl font-black text-[#000000] tracking-tight leading-normal select-none">
                {diaryName}
              </h1>
              <span className="opacity-0 group-hover:opacity-60 transition-opacity text-stone-400 shrink-0">
                <Edit2 size={16} />
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 2. 탭: 달력  목록  ───── [오늘] 라운드 버튼 */}
      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => {
              triggerHaptic('light');
              setCurrentView('calendar');
            }}
            className={`text-base pb-1 transition-all select-none cursor-pointer ${
              currentView === 'calendar'
                ? 'font-black text-black border-b-2 border-black'
                : 'font-semibold text-stone-400 hover:text-stone-700 border-b-2 border-transparent'
            }`}
          >
            달력
          </button>

          <button
            onClick={() => {
              triggerHaptic('light');
              setCurrentView('list');
            }}
            className={`text-base pb-1 transition-all select-none cursor-pointer ${
              currentView === 'list'
                ? 'font-black text-black border-b-2 border-black'
                : 'font-semibold text-stone-400 hover:text-stone-700 border-b-2 border-transparent'
            }`}
          >
            목록
          </button>
        </div>

        {/* 우측 버튼 그룹: [썸네일 격자 보기 토글 아이콘 버튼 (목록 뷰일 때)] + [오늘] 버튼 */}
        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
          {currentView === 'list' && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onToggleThumbnailView?.();
              }}
              className={`h-7 px-2.5 sm:px-3 rounded-full border transition-all flex items-center justify-center cursor-pointer select-none shrink-0 active:scale-95 ${
                isThumbnailView
                  ? 'bg-black text-white border-black shadow-xs'
                  : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-50 shadow-2xs'
              }`}
              title={isThumbnailView ? '일반 목록으로 보기' : '썸네일 격자로 보기'}
              aria-label="썸네일 격자 보기 토글"
              aria-pressed={isThumbnailView}
            >
              <LayoutGrid size={14} strokeWidth={2.3} />
            </button>
          )}

          {/* 오늘 버튼: 달력, 목록 라인의 맨 끝(우측)에 위치, 높이는 달력/목록 높이에 맞춤 (라운드 버튼) */}
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onGoToToday();
            }}
            className="h-7 px-3.5 rounded-full bg-white border border-stone-300 shadow-2xs hover:bg-stone-50 active:scale-95 transition-all flex items-center justify-center font-bold text-xs text-stone-800 cursor-pointer select-none shrink-0"
            title="오늘 날짜로 이동"
          >
            오늘
          </button>
        </div>
      </div>

      {/* 3선 버튼 사이드 메뉴 드로어 */}
      <SideMenuDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        user={user}
        diaryName={diaryName}
        onLogin={onLogin}
        onLogout={onLogout}
        onOpenAdmin={onOpenAdmin}
      />
    </header>
  );
}
