import React, { useState, useEffect, useRef } from 'react';
import Header from './components/Header';
import CalendarView from './components/CalendarView';
import ListView from './components/ListView';
import DiaryCanvas from './components/DiaryCanvas';
import AdminPage from './components/AdminPage';
import { INITIAL_DIARIES } from './constants';
import {
  loginWithGoogle,
  logoutUser,
  subscribeToAuthChanges,
  subscribeToUserDiaries,
  saveDiaryToCloud,
  deleteDiaryFromCloud,
  syncLocalDiariesToCloud,
  subscribeToUserSettings,
  saveDiaryNameToCloud,
} from './firebase';

// 이전 기본 샘플 더미 데이터 ID (초기 무데이터 상태를 위해 자동 필터링)
const LEGACY_SAMPLE_IDS = new Set(['entry-2026-11-15', 'entry-2026-11-17']);

// 로컬 타임존 기준 오늘 날짜 문자열 반환 (YYYY-MM-DD)
function getTodayDateStr() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function App() {
  const [pathname, setPathname] = useState(() => window.location.pathname);

  useEffect(() => {
    const handlePopState = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // 주소창에 /admin을 직접 입력해 접근했을 때만 독립된 관리자 페이지 렌더링
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    return <AdminPage />;
  }

  return <DiaryMainApp />;
}

function DiaryMainApp() {
  // 로컬스토리지에서 일기 불러오기 (기본값: 아무 데이터도 없는 빈 배열 [])
  const [diaries, setDiaries] = useState(() => {
    const saved = localStorage.getItem('analog_diaries');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter(d => !LEGACY_SAMPLE_IDS.has(String(d?.id)));
        }
      } catch (e) {
        console.error('Failed to parse diaries', e);
      }
    }
    return INITIAL_DIARIES;
  });

  // 현재 뷰: 'calendar' | 'list' | 'editor'
  const [currentView, setCurrentView] = useState('calendar');
  const [selectedDiary, setSelectedDiary] = useState(null);

  // 다이어리 이름 상태 (로컬스토리지 연동)
  const [diaryName, setDiaryName] = useState(() => {
    return localStorage.getItem('analog_diary_name') || 'RIM’S DIARY';
  });

  // Firebase 인증 및 클라우드 동기화 상태 (새로고침 시에도 즉시 자동로그인 상태 유지)
  const [user, setUser] = useState(() => {
    const cached = localStorage.getItem('analog_diary_auth_user');
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {
        return null;
      }
    }
    return null;
  });
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [authError, setAuthError] = useState(null);

  // 팝업 모달 상태: (1) 앱 최초 실행 시 계정 연동 여부 팝업, (2) 로그아웃 시 데이터 삭제 안내 팝업
  const [isAccountPromptOpen, setIsAccountPromptOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

  // 최신 로컬 일기 참조 (로그인 시 로컬 -> 클라우드 초기 병합용)
  const diariesRef = useRef(diaries);
  useEffect(() => {
    diariesRef.current = diaries;
  }, [diaries]);

  // 로컬스토리지 동기화 (오프라인 캐시 역할 겸용)
  useEffect(() => {
    localStorage.setItem('analog_diaries', JSON.stringify(diaries));
  }, [diaries]);

  // 1. Firebase 인증 상태 감지 및 자동 로그인 유지 / 최초 실행 시 계정 연동 확인 팝업 표시
  useEffect(() => {
    const unsubscribeAuth = subscribeToAuthChanges((currentUser) => {
      if (currentUser) {
        const userSnapshot = {
          uid: currentUser.uid,
          displayName: currentUser.displayName || '',
          email: currentUser.email || '',
          photoURL: currentUser.photoURL || '',
        };
        localStorage.setItem('analog_diary_auth_user', JSON.stringify(userSnapshot));
        localStorage.setItem('analog_diary_account_prompt_seen', 'true');
        setUser(currentUser);
        setIsAccountPromptOpen(false);
      } else {
        localStorage.removeItem('analog_diary_auth_user');
        setUser(null);
        const hasSeenPrompt = localStorage.getItem('analog_diary_account_prompt_seen');
        if (!hasSeenPrompt) {
          setIsAccountPromptOpen(true);
        }
      }
      setIsAuthLoading(false);
    });
    return () => unsubscribeAuth();
  }, []);

  // 2. 로그인된 사용자의 Firestore 실시간 동기화 (일기 목록 + 다이어리 이름)
  useEffect(() => {
    if (!user) return;

    let unsubscribeDiaries = () => {};
    let unsubscribeSettings = () => {};
    let isCancelled = false;

    const initCloudSync = async () => {
      setIsSyncing(true);
      try {
        // 비로그인 상태에서 작성된 로컬 일기가 있다면 클라우드로 먼저 병합
        await syncLocalDiariesToCloud(user.uid, diariesRef.current);

        if (isCancelled) return;

        // 클라우드 일기 실시간 구독
        unsubscribeDiaries = subscribeToUserDiaries(
          user.uid,
          (cloudDiaries) => {
            setDiaries(cloudDiaries);
            setIsSyncing(false);
          },
          () => {
            setIsSyncing(false);
          }
        );

        // 클라우드 다이어리 이름 설정 실시간 구독
        unsubscribeSettings = subscribeToUserSettings(user.uid, (settings) => {
          if (settings?.diaryName) {
            setDiaryName(settings.diaryName);
            localStorage.setItem('analog_diary_name', settings.diaryName);
          }
        });
      } catch (err) {
        console.error('[Cloud Sync] 초기화 오류:', err);
        setIsSyncing(false);
      }
    };

    initCloudSync();

    return () => {
      isCancelled = true;
      unsubscribeDiaries();
      unsubscribeSettings();
    };
  }, [user]);

  // 구글 로그인 핸들러
  const handleGoogleLogin = async () => {
    setAuthError(null);
    localStorage.setItem('analog_diary_account_prompt_seen', 'true');
    setIsAccountPromptOpen(false);
    try {
      await loginWithGoogle();
    } catch (err) {
      console.error('[Auth] 구글 로그인 실패:', err);
      const code = err?.code || '';
      let message = err?.message || '로그인 중 오류가 발생했습니다.';

      if (code === 'auth/user-cancelled' || code === 'auth/popup-closed-by-user') {
        return;
      } else if (code === 'auth/operation-not-allowed' || code === 'auth/configuration-not-found') {
        message =
          'Firebase 콘솔(Authentication > Sign-in method)에서 "Google" 로그인 제공업체를 먼저 [사용 설정] 후 저장해 주세요.';
      } else if (code === 'auth/unauthorized-domain') {
        message =
          '현재 접속한 도메인이 Firebase 콘솔(Authentication > Settings > 승인된 도메인)에 등록되어 있지 않습니다.';
      }

      setAuthError(message);
      alert(message);
    }
  };

  // 앱 최초 실행 시 계정 연동 없이 시작하기 핸들러
  const handleSkipAccountPrompt = () => {
    localStorage.setItem('analog_diary_account_prompt_seen', 'true');
    setIsAccountPromptOpen(false);
  };

  // 로그아웃 버튼 클릭 시 안내 팝업 열기
  const handleRequestLogout = () => {
    setIsLogoutModalOpen(true);
  };

  // 안내 팝업에서 최종 로그아웃 확인 시: 로그아웃 수행 및 저장된 모든 데이터 삭제
  const handleConfirmLogout = async () => {
    setAuthError(null);
    setIsLogoutModalOpen(false);
    try {
      await logoutUser();
    } catch (err) {
      console.error('[Auth] 로그아웃 실패:', err);
      setAuthError(err.message || '로그아웃 중 오류가 발생했습니다.');
    } finally {
      // 저장된 로컬 데이터 및 화면 상태 모두 초기화(삭제)
      diariesRef.current = [];
      setUser(null);
      setDiaries([]);
      setSelectedDiary(null);
      setCurrentView('calendar');
      setDiaryName('RIM’S DIARY');
      localStorage.removeItem('analog_diary_auth_user');
      localStorage.removeItem('analog_diaries');
      localStorage.removeItem('analog_diary_name');
    }
  };

  // 다이어리 이름 변경 핸들러 (로컬 + 클라우드 동시 반영)
  const handleUpdateDiaryName = async (newName) => {
    setDiaryName(newName);
    localStorage.setItem('analog_diary_name', newName);
    if (user) {
      try {
        await saveDiaryNameToCloud(user.uid, newName);
      } catch (err) {
        console.error('[Firestore] 다이어리 이름 저장 오류:', err);
      }
    }
  };

  // 새 일기 작성 시작 (기본값: 실제 오늘 날짜)
  const handleNewDiary = (targetDate = getTodayDateStr()) => {
    const existing = diaries.find(d => d.date === targetDate);
    if (existing) {
      setSelectedDiary(existing);
    } else {
      setSelectedDiary({
        id: `entry-${targetDate}-${Date.now()}`,
        date: targetDate,
        title: '',
        weather: '',
        paperStyle: 'lined',
        thumbnailMood: '',
        textBlocks: [],
        stickers: [],
        strokes: []
      });
    }
    setCurrentView('editor');
  };

  // 특정 일기 선택
  const handleSelectDiary = (diary) => {
    setSelectedDiary(diary);
    setCurrentView('editor');
  };

  // 일기 삭제 (로컬 상태 반영 + 로그인 시 Firestore 삭제)
  const handleDeleteDiary = async (id) => {
    setDiaries(prev => prev.filter(d => d.id !== id));
    if (user) {
      try {
        await deleteDiaryFromCloud(user.uid, id);
      } catch (err) {
        console.error('[Firestore] 일기 삭제 오류:', err);
      }
    }
  };

  // 일기 저장 처리 (로컬 상태 반영 + 로그인 시 Firestore 저장)
  const handleSaveDiary = async (updatedDiary) => {
    setDiaries(prev => {
      const exists = prev.some(d => d.id === updatedDiary.id);
      if (exists) {
        return prev.map(d => d.id === updatedDiary.id ? updatedDiary : d);
      }
      return [updatedDiary, ...prev];
    });

    if (user) {
      try {
        await saveDiaryToCloud(user.uid, updatedDiary);
      } catch (err) {
        console.error('[Firestore] 일기 저장 오류:', err);
      }
    }

    setCurrentView('calendar');
    setSelectedDiary(null);
  };

  return (
    <div className="min-h-screen bg-stone-100 flex flex-col items-center justify-start sm:p-4 font-sans text-stone-800">
      {/* 
        모바일 ~ 태블릿 ~ PC 완전 반응형 레이아웃
        - 모바일: 가로 100%, 세로 화면 100% 핏
        - 태블릿/PC: 보기 편안한 너비(max-w-2xl ~ max-w-3xl)로 자연스럽게 확장
      */}
      <div className="w-full max-w-3xl h-screen sm:h-[92vh] bg-[#fafafa] flex flex-col sm:rounded-3xl sm:shadow-lg sm:border sm:border-stone-200/90 overflow-hidden relative">
        
        {/* 상단 네비게이션 헤더 (에디터 화면이 아닐 때) */}
        {currentView !== 'editor' && (
          <Header
            currentView={currentView}
            setCurrentView={setCurrentView}
            onNewDiary={() => handleNewDiary(getTodayDateStr())}
            diaryName={diaryName}
            setDiaryName={handleUpdateDiaryName}
            user={user}
            isAuthLoading={isAuthLoading}
            isSyncing={isSyncing}
            authError={authError}
            onLogin={handleGoogleLogin}
            onLogout={handleRequestLogout}
          />
        )}

        {/* 메인 뷰 컨텐츠 */}
        <main className="flex-1 overflow-hidden relative">
          {currentView === 'calendar' && (
            <CalendarView
              diaries={diaries}
              onSelectDiary={handleSelectDiary}
              onNewDiaryForDate={handleNewDiary}
            />
          )}

          {currentView === 'list' && (
            <ListView
              diaries={diaries}
              onSelectDiary={handleSelectDiary}
              onDeleteDiary={handleDeleteDiary}
              onNewDiary={() => handleNewDiary(getTodayDateStr())}
            />
          )}

          {currentView === 'editor' && (
            <DiaryCanvas
              diary={selectedDiary}
              onSave={handleSaveDiary}
              onDelete={async (id) => {
                if (id) {
                  await handleDeleteDiary(id);
                }
                setCurrentView('calendar');
                setSelectedDiary(null);
              }}
              onBack={() => {
                setCurrentView('calendar');
                setSelectedDiary(null);
              }}
            />
          )}
        </main>

        {/* (1) 앱 최초 실행 시: 구글 계정 연동 여부 확인 팝업 */}
        {!isAuthLoading && isAccountPromptOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-fadeIn">
            <div className="bg-white w-full max-w-xs sm:max-w-sm rounded-3xl shadow-2xl border border-stone-200 p-6 flex flex-col items-center text-center">
              <h3 className="text-base sm:text-lg font-black text-black tracking-tight">
                계정 연동 안내
              </h3>
              <p className="text-xs sm:text-sm text-stone-500 mt-2 leading-relaxed">
                구글 계정을 연동하면 작성한 다이어리가 클라우드에 안전하게 자동 저장되고 동기화됩니다.
              </p>
              <div className="flex items-center space-x-2.5 w-full mt-6">
                <button
                  type="button"
                  onClick={handleSkipAccountPrompt}
                  className="flex-1 py-2.5 px-3 rounded-xl border border-stone-200 bg-stone-100 hover:bg-stone-200 active:scale-95 text-stone-700 text-xs font-bold transition"
                >
                  연동 없이 시작
                </button>
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-black hover:bg-stone-800 active:scale-95 text-white text-xs font-bold transition shadow-xs"
                >
                  구글 계정 연동
                </button>
              </div>
            </div>
          </div>
        )}

        {/* (2) 로그아웃 시: 모든 데이터 삭제 안내 팝업 */}
        {isLogoutModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-fadeIn">
            <div className="bg-white w-full max-w-xs sm:max-w-sm rounded-3xl shadow-2xl border border-stone-200 p-6 flex flex-col items-center text-center">
              <h3 className="text-base sm:text-lg font-black text-black tracking-tight">
                로그아웃 안내
              </h3>
              <p className="text-xs sm:text-sm text-stone-500 mt-2 leading-relaxed">
                로그아웃하면 현재 저장된 모든 다이어리 데이터가 삭제됩니다. 정말 로그아웃 하시겠습니까?
              </p>
              <div className="flex items-center space-x-2.5 w-full mt-6">
                <button
                  type="button"
                  onClick={() => setIsLogoutModalOpen(false)}
                  className="flex-1 py-2.5 px-3 rounded-xl border border-stone-200 bg-stone-100 hover:bg-stone-200 active:scale-95 text-stone-700 text-xs font-bold transition"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleConfirmLogout}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-black hover:bg-stone-800 active:scale-95 text-white text-xs font-bold transition shadow-xs"
                >
                  로그아웃
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
