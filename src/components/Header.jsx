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
    <header className="px-6 pt-[calc(1.25rem+env(safe-area-inset-top,0px))] pb-2 shrink-0 bg-[#fafafa]">
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

        {/* 구글 로그인(원형 구글 로고) / 로그아웃(원형 구글 프로필) 버튼 */}
        {user ? (
          <button
            type="button"
            onClick={onLogout}
            className="mr-2.5 w-11 h-11 rounded-full p-0.5 border border-stone-200 bg-white hover:opacity-85 active:scale-95 transition shadow-2xs shrink-0 overflow-hidden flex items-center justify-center cursor-pointer"
            title={`${user.displayName || user.email || '사용자'} (클릭 시 로그아웃)`}
          >
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName || '구글 프로필'}
                className="w-full h-full object-cover rounded-full select-none"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-full h-full rounded-full bg-stone-100 text-stone-700 flex items-center justify-center font-bold text-sm select-none">
                {(user.displayName || user.email || 'G')[0].toUpperCase()}
              </div>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={onLogin}
            className="mr-2.5 w-11 h-11 rounded-full border border-stone-200 bg-white hover:bg-stone-50 active:scale-95 transition flex items-center justify-center shadow-2xs shrink-0 cursor-pointer"
            title="구글 계정으로 로그인"
          >
            <svg className="w-5 h-5 select-none" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3.03h3.88c2.27-2.09 3.66-5.17 3.66-9.12z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.03c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.27v3.13C3.25 21.31 7.31 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.29c-.25-.72-.38-1.49-.38-2.29s.13-1.57.38-2.29V6.57H1.27C.46 8.19 0 10.04 0 12s.46 3.81 1.27 5.43l4.01-3.14z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.69 1.27 6.57l4.01 3.14c.95-2.83 3.6-4.96 6.72-4.96z"
              />
            </svg>
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
