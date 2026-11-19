import React, { useState, useRef, useEffect } from 'react';
import { Plus, Edit2, Maximize2, X, Smartphone, Monitor, Share2 } from 'lucide-react';

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
  const [showPwaGuide, setShowPwaGuide] = useState(false);
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

        {/* 전체화면 / 홈 화면 앱 추가 안내 버튼 */}
        <button
          type="button"
          onClick={() => setShowPwaGuide(true)}
          className="mr-2 p-2 rounded-full border border-stone-200/90 bg-white text-stone-700 hover:bg-stone-100 active:scale-95 transition shadow-2xs shrink-0"
          title="전체화면 / 주소창 제거 앱 모드 안내"
        >
          <Maximize2 size={16} strokeWidth={2.2} />
        </button>

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

      {/* 전체화면 / 주소창 제거 앱 모드 안내 모달 */}
      {showPwaGuide && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => setShowPwaGuide(false)}
        >
          <div
            className="bg-white rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl space-y-5 border border-stone-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <div className="flex items-center space-x-2">
                <Smartphone className="w-5 h-5 text-black" />
                <h3 className="text-lg font-black text-black tracking-tight">
                  전체화면(주소창 없는 앱) 설정
                </h3>
              </div>
              <button
                onClick={() => setShowPwaGuide(false)}
                className="p-1 rounded-full text-stone-400 hover:text-black hover:bg-stone-100 transition"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4 text-xs sm:text-sm text-stone-700 leading-relaxed">
              {/* 아이패드 / 아이폰 안내 */}
              <div className="bg-stone-50 p-3.5 rounded-2xl border border-stone-200/70 space-y-1.5">
                <div className="font-black text-black flex items-center space-x-1.5">
                  <span>🍎 아이패드 / 아이폰 (Safari)</span>
                </div>
                <ol className="list-decimal list-inside space-y-1 text-stone-600 pl-0.5">
                  <li>사파리 상단 <strong>[공유 버튼 (네모 위 화살표 ↑)]</strong> 터치</li>
                  <li>메뉴에서 <strong>[홈 화면에 추가]</strong> 터치</li>
                  <li>우측 상단 <strong>[추가]</strong> 터치</li>
                </ol>
                <p className="text-[11px] font-semibold text-stone-500 pt-1">
                  ✨ 홈 화면에 생긴 <strong>'다이어리'</strong> 아이콘으로 실행하시면 상단 주소창이 100% 제거되어 진짜 네이티브 앱처럼 동작합니다!
                </p>
              </div>

              {/* 안드로이드 / 갤럭시 탭 안내 */}
              <div className="bg-stone-50 p-3.5 rounded-2xl border border-stone-200/70 space-y-1.5">
                <div className="font-black text-black flex items-center space-x-1.5">
                  <span>🤖 갤럭시 탭 / 안드로이드 (Chrome / 삼성 인터넷)</span>
                </div>
                <ol className="list-decimal list-inside space-y-1 text-stone-600 pl-0.5">
                  <li>브라우저 우측 상단 <strong>[더보기 (⋮)]</strong> 메뉴 터치</li>
                  <li><strong>[홈 화면에 추가]</strong> 또는 <strong>[앱 설치]</strong> 선택</li>
                </ol>
                <p className="text-[11px] font-semibold text-stone-500 pt-1">
                  ✨ 설치된 앱 아이콘으로 실행하면 상단 툴바가 완전히 사라집니다.
                </p>
              </div>

              {/* PC / 브라우저 전체화면 버튼 */}
              <div className="pt-1 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    if (document.fullscreenElement) {
                      document.exitFullscreen?.();
                    } else if (document.documentElement.requestFullscreen) {
                      document.documentElement.requestFullscreen().catch(() => {});
                    }
                  }}
                  className="w-full py-2.5 px-4 rounded-xl bg-black hover:bg-stone-800 text-white font-bold text-xs flex items-center justify-center space-x-2 transition shadow-xs"
                >
                  <Monitor size={15} />
                  <span>PC 브라우저 전체화면(F11) 전환 토글</span>
                </button>
              </div>
            </div>

            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowPwaGuide(false)}
                className="w-full py-2.5 rounded-xl border border-stone-200 hover:bg-stone-50 text-stone-700 font-bold text-xs transition"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
