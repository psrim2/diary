import React, { useState, useRef, useEffect } from 'react';
import { Plus, Edit2 } from 'lucide-react';

export default function Header({ 
  currentView, 
  setCurrentView, 
  onNewDiary,
  diaryName,
  setDiaryName,
  user,
  isAuthLoading,
  isSyncing,
  authError,
  onLogin,
  onLogout
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [tempName, setTempName] = useState(diaryName);
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
    <header className="px-6 pt-5 pb-2 shrink-0 bg-[#fafafa]">
      {/* 1. 최상단: [타이틀 (클릭 시 수정)] ─── [+] 버튼 (저장버튼과 동일한 w-11 h-11 규격) */}
      <div className="flex items-center justify-between">
        <div className="flex-1 mr-3">
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              onBlur={handleFinishEditing}
              onKeyDown={handleKeyDown}
              maxLength={24}
              className="text-2xl sm:text-3xl font-black text-black tracking-tight leading-none bg-transparent border-0 border-b-2 border-black focus:outline-hidden focus:ring-0 p-0 w-full"
            />
          ) : (
            <div
              onClick={() => setIsEditing(true)}
              className="group inline-flex items-center space-x-2 cursor-pointer"
              title="클릭하여 다이어리 이름 변경"
            >
              <h1 className="text-2xl sm:text-3xl font-black text-black tracking-tight leading-none select-none group-hover:opacity-75 transition-opacity">
                {diaryName}
              </h1>
              <span className="opacity-0 group-hover:opacity-60 transition-opacity text-stone-400">
                <Edit2 size={16} />
              </span>
            </div>
          )}
        </div>

        {/* 구글 로그인 / 로그아웃 버튼 */}
        {user ? (
          <button
            type="button"
            onClick={onLogout}
            className="mr-2.5 px-3.5 py-2 rounded-full border border-stone-200 bg-white text-stone-700 hover:bg-stone-100 active:scale-95 transition text-xs font-bold shadow-2xs shrink-0"
          >
            로그아웃
          </button>
        ) : (
          <button
            type="button"
            onClick={onLogin}
            className="mr-2.5 px-3.5 py-2 rounded-full bg-black text-white hover:bg-stone-800 active:scale-95 transition text-xs font-bold shadow-xs shrink-0"
          >
            구글 로그인
          </button>
        )}

        {/* 새 일기 작성 [+] 버튼 (다이어리 작성 화면의 저장버튼과 동일한 w-11 h-11) */}
        <button
          onClick={onNewDiary}
          className="w-11 h-11 rounded-full bg-black text-white hover:bg-stone-800 active:scale-95 transition flex items-center justify-center shadow-xs shrink-0"
          title="새 일기 쓰기"
        >
          <Plus size={22} strokeWidth={2.8} />
        </button>
      </div>

      {/* 2. 탭: 달력  목록 (텍스트 밑줄 스타일) */}
      <div className="flex items-center space-x-4 mt-3">
        <button
          onClick={() => setCurrentView('calendar')}
          className={`text-base pb-1 transition-all select-none ${
            currentView === 'calendar'
              ? 'font-black text-black border-b-2 border-black'
              : 'font-semibold text-stone-400 hover:text-stone-700 border-b-2 border-transparent'
          }`}
        >
          달력
        </button>

        <button
          onClick={() => setCurrentView('list')}
          className={`text-base pb-1 transition-all select-none ${
            currentView === 'list'
              ? 'font-black text-black border-b-2 border-black'
              : 'font-semibold text-stone-400 hover:text-stone-700 border-b-2 border-transparent'
          }`}
        >
          목록
        </button>
      </div>
    </header>
  );
}
