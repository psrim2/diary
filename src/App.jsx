import React, { useState, useEffect, useRef, useMemo } from 'react';
import Header from './components/Header';
import CalendarView from './components/CalendarView';
import ListView from './components/ListView';
import DiaryCanvas from './components/DiaryCanvas';
import AdminPage from './components/AdminPage';
import { INITIAL_DIARIES } from './constants';
import {
  loginWithGoogle,
  handleRedirectLoginResult,
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

// 날짜별 단일 일기 원칙: 동일한 날짜(YYYY-MM-DD)를 가진 중복 일기를 1개로 병합/정리 (최신 수정본 updatedAt 우선)
function deduplicateDiariesByDate(diaryList) {
  if (!Array.isArray(diaryList)) return [];
  const map = new Map();
  diaryList.forEach((diary) => {
    if (!diary || !diary.date) return;
    const dateKey = String(diary.date).trim();
    const existing = map.get(dateKey);
    if (!existing) {
      map.set(dateKey, diary);
    } else {
      const existingTime = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
      const currentTime = new Date(diary.updatedAt || diary.createdAt || 0).getTime();

      if (currentTime > existingTime) {
        map.set(dateKey, diary);
      } else if (currentTime < existingTime) {
        // 기존 문서가 더 최신이므로 유지
      } else {
        // 타임스탬프가 동일하거나 없는 경우 컨텐츠 점수 기준 비교
        const existingScore =
          (existing.textBlocks?.length || 0) * 10 +
          (existing.strokes?.length || 0) * 2 +
          (existing.stickers?.length || 0) * 5 +
          (existing.weather ? 2 : 0) +
          (existing.summary ? 5 : 0);
        const currentScore =
          (diary.textBlocks?.length || 0) * 10 +
          (diary.strokes?.length || 0) * 2 +
          (diary.stickers?.length || 0) * 5 +
          (diary.weather ? 2 : 0) +
          (diary.summary ? 5 : 0);

        if (currentScore >= existingScore) {
          map.set(dateKey, diary);
        }
      }
    }
  });
  return Array.from(map.values()).sort((a, b) =>
    (b.date || '').localeCompare(a.date || '')
  );
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
  // 로컬스토리지에서 일기 불러오기 (기본값: 아무 데이터도 없는 빈 배열 [] & 날짜별 중복 자동 정리)
  const [diaries, setDiaries] = useState(() => {
    const saved = localStorage.getItem('analog_diaries');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const validDiaries = parsed.filter(d => !LEGACY_SAMPLE_IDS.has(String(d?.id)));
          return deduplicateDiariesByDate(validDiaries);
        }
      } catch (e) {
        console.error('Failed to parse diaries', e);
      }
    }
    return INITIAL_DIARIES;
  });

  // 현재 뷰: 'calendar' | 'list' | 'editor'
  const [currentView, setCurrentView] = useState('calendar');
  const [previousView, setPreviousView] = useState('calendar');
  const [selectedDiary, setSelectedDiary] = useState(null);

  // 다이어리 이름 상태 (로컬스토리지 연동, 기본값: 'Diary')
  const [diaryName, setDiaryName] = useState(() => {
    const saved = localStorage.getItem('analog_diary_name');
    if (!saved || saved === 'RIM’S DIARY' || saved === "RIM'S DIARY") {
      return 'Diary';
    }
    return saved;
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

    // 모바일/PWA 리디렉션 로그인 복귀 시 결과 처리
    handleRedirectLoginResult()
      .then((redirectUser) => {
        if (redirectUser) {
          const userSnapshot = {
            uid: redirectUser.uid,
            displayName: redirectUser.displayName || '',
            email: redirectUser.email || '',
            photoURL: redirectUser.photoURL || '',
          };
          localStorage.setItem('analog_diary_auth_user', JSON.stringify(userSnapshot));
          localStorage.setItem('analog_diary_account_prompt_seen', 'true');
          setUser(redirectUser);
          setIsAccountPromptOpen(false);
        }
      })
      .catch((err) => {
        console.warn('[Auth] 리디렉션 로그인 결과 확인:', err);
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
        // 비로그인(게스트) 상태에서 새로 작성된 로컬 일기가 있는 경우에만 클라우드로 1회 업로드 병합
        // (이미 로그인된 계정은 Firestore가 Single Source of Truth이므로 다른 기기의 옛 캐시로 인한 부활 원천 차단)
        const hasUnsyncedGuest = localStorage.getItem('analog_diary_has_unsynced_guest_data') === 'true';
        if (hasUnsyncedGuest) {
          await syncLocalDiariesToCloud(user.uid, diariesRef.current);
          localStorage.removeItem('analog_diary_has_unsynced_guest_data');
        }

        if (isCancelled) return;

        // 클라우드 일기 실시간 구독 (날짜별 중복 자동 정리)
        unsubscribeDiaries = subscribeToUserDiaries(
          user.uid,
          async (cloudDiaries) => {
            const deduped = deduplicateDiariesByDate(cloudDiaries);
            setDiaries(deduped);
            setIsSyncing(false);

            // Firestore에 동일 날짜로 생성된 불필요한 중복 문서가 남아있다면 원격에서도 자동 정리
            if (cloudDiaries.length > deduped.length) {
              const keepIds = new Set(deduped.map((d) => d.id));
              const duplicateDocs = cloudDiaries.filter((d) => !keepIds.has(d.id));
              for (const dup of duplicateDocs) {
                if (dup?.id) {
                  deleteDiaryFromCloud(user.uid, dup.id).catch(() => {});
                }
              }
            }
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
    try {
      const loggedInUser = await loginWithGoogle();
      if (loggedInUser) {
        localStorage.setItem('analog_diary_account_prompt_seen', 'true');
        setIsAccountPromptOpen(false);
        setUser(loggedInUser);
      }
    } catch (err) {
      console.error('[Auth] 구글 로그인 실패:', err);
      const code = String(err?.code || '').toLowerCase();
      const message = String(err?.message || '').toLowerCase();

      // 사용자가 팝업 창을 직접 닫은 경우는 불필요한 경고창 없이 무시
      if (
        code.includes('user-cancelled') ||
        code.includes('popup-closed-by-user') ||
        message.includes('popup-closed-by-user')
      ) {
        return;
      }

      let userMsg = '구글 로그인 중 오류가 발생했습니다.';

      if (code.includes('unauthorized-domain') || message.includes('unauthorized-domain')) {
        const currentHost = typeof window !== 'undefined' ? window.location.hostname : '현재 도메인';
        userMsg = `[Firebase 승인된 도메인 등록 필요]\n현재 도메인("${currentHost}")이 Firebase 승인 목록에 없습니다.\n\n해결 방법:\n1. Firebase 콘솔(console.firebase.google.com) 접속\n2. Authentication > Settings(설정) > Authorized domains(승인된 도메인)\n3. [도메인 추가] 클릭 후 "${currentHost}" 입력 및 저장`;
      } else if (
        code.includes('operation-not-allowed') ||
        code.includes('configuration-not-found') ||
        message.includes('operation-not-allowed')
      ) {
        userMsg =
          'Firebase 콘솔(Authentication > Sign-in method)에서 "Google" 로그인 제공업체가 활성화되어 있는지 확인해 주세요.';
      } else if (code.includes('popup-blocked') || message.includes('popup-blocked')) {
        userMsg =
          '브라우저에서 로그인 팝업이 차단되었습니다. 팝업 차단을 해제하거나 잠시 후 다시 시도해 주세요.';
      } else if (code.includes('network-request-failed') || message.includes('network-request-failed')) {
        userMsg = '인터넷 연결이 불안정합니다. 네트워크 상태를 확인해 주세요.';
      } else if (err?.message) {
        userMsg = `구글 로그인 실패: ${err.message}`;
      }

      setAuthError(userMsg);
      alert(userMsg);
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
      setDiaryName('Diary');
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
    setPreviousView(currentView === 'editor' ? (previousView || 'calendar') : currentView);
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
    setPreviousView(currentView === 'editor' ? (previousView || 'calendar') : currentView);
    setSelectedDiary(diary);
    setCurrentView('editor');
  };

  // 일기 삭제 (로컬 상태 반영 + 로그인 시 Firestore 삭제)
  const handleDeleteDiary = async (id) => {
    // 1. 로컬 상태 및 localStorage에서 즉시 삭제
    setDiaries(prev => {
      const updated = prev.filter(d => d.id !== id);
      try {
        localStorage.setItem('analog_diary_entries', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });

    if (selectedDiary?.id === id) {
      const remainingDate = selectedDiary.date || getTodayDateStr();
      setSelectedDiary({
        id: `entry-${remainingDate}-${Date.now()}`,
        date: remainingDate,
        title: '',
        weather: '',
        paperStyle: 'lined',
        thumbnailMood: '',
        textBlocks: [],
        stickers: [],
        strokes: []
      });
    }
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setCurrentView(previousView || 'calendar');
    }
    if (user) {
      try {
        await deleteDiaryFromCloud(user.uid, id);
      } catch (err) {
        console.error('[Firestore] 일기 삭제 오류:', err);
      }
    }
  };

  // 일기 저장 처리 (날짜별 1개 일기 원칙: 중복 방지, 로컬 반영 + 로그인 시 Firestore 동기화)
  const handleSaveDiary = async (updatedDiary) => {
    // 1. 같은 날짜(date)를 가진 기존 일기가 있는지 확인
    const sameDateDiary = diaries.find(
      (d) => d.date === updatedDiary.date && d.id !== updatedDiary.id
    );

    // 2. 같은 날짜에 다른 ID의 일기가 존재했다면, 기존 ID를 유지하여 Firestore 중복 문서 생성 방지
    const targetId = sameDateDiary?.id || updatedDiary.id;
    const finalDiaryToSave = {
      ...updatedDiary,
      id: targetId,
      updatedAt: new Date().toISOString(),
    };

    // 비로그인 상태에서 작성된 경우 게스트 동기화 플래그 설정
    if (!user) {
      localStorage.setItem('analog_diary_has_unsynced_guest_data', 'true');
    }

    setDiaries((prev) => {
      // 동일 id 또는 동일 date를 가진 기존 항목을 모두 제거 후 신규 저장본 추가
      const filtered = prev.filter(
        (d) => d.id !== finalDiaryToSave.id && d.date !== finalDiaryToSave.date
      );
      const updated = deduplicateDiariesByDate([finalDiaryToSave, ...filtered]);
      try {
        localStorage.setItem('analog_diary_entries', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });

    if (user) {
      try {
        // 기존과 다른 ID로 임시 생성되었던 경우, 구 중복 문서 정리
        if (updatedDiary.id && updatedDiary.id !== targetId) {
          await deleteDiaryFromCloud(user.uid, updatedDiary.id);
        }
        await saveDiaryToCloud(user.uid, finalDiaryToSave);
      } catch (err) {
        console.error('[Firestore] 일기 저장 오류:', err);
      }
    }

    setSelectedDiary(finalDiaryToSave);

    // 모바일 1분할 화면에서는 저장 후 캘린더/목록으로 복귀
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setCurrentView(previousView || 'calendar');
    }
  };

  // 2분할 뷰(태블릿 가로/PC)에서 우측에 보여줄 활성 다이어리 계산
  const activeEditorDiary = useMemo(() => {
    if (selectedDiary) {
      const latest = diaries.find(d => d.id === selectedDiary.id || d.date === selectedDiary.date);
      return latest || selectedDiary;
    }
    const todayStr = getTodayDateStr();
    const existingToday = diaries.find(d => d.date === todayStr);
    if (existingToday) return existingToday;
    return {
      id: `entry-${todayStr}-${Date.now()}`,
      date: todayStr,
      title: '',
      weather: '',
      paperStyle: 'lined',
      thumbnailMood: '',
      textBlocks: [],
      stickers: [],
      strokes: []
    };
  }, [selectedDiary, diaries]);

  return (
    <div className="w-full h-[100dvh] flex flex-col items-center justify-start font-sans text-stone-800 relative p-0 overflow-hidden bg-[#fafafa]">
      {/* 
        모바일 & 태블릿 세로(<1024px): 100% 전체화면 핏 (100dvh, 테두리 없음), 단일 화면 전환식 (달력/목록 ↔ 작성창)
        - 다이어리 상세 입력창은 최대 크기(max-w-2xl) 유지 및 가로 중앙 정렬
        태블릿 가로 & PC(>=1024px): 라운드 테두리 없는 전체화면 2분할 뷰 (좌: 캘린더/목록, 우: 다이어리 상세/작성창 동시 노출)
      */}
      <div className="w-full h-full lg:h-screen flex flex-col lg:flex-row overflow-hidden bg-[#fafafa]">
        
        {/* ================================================================ */}
        {/* [좌측 패널] 캘린더 / 목록 (모바일 & 태블릿 세로에서는 editor 모드일 때 숨김, 와이드 대화면은 가변 40vw로 표시) */}
        {/* ================================================================ */}
        <div className={`h-full flex-col bg-[#fafafa] overflow-hidden ${
          currentView === 'editor' ? 'hidden lg:flex' : 'flex'
        } w-full lg:w-[40vw] lg:shrink-0 lg:border-r lg:border-stone-200/90`}>
          <div className="w-full flex-1 flex flex-col h-full overflow-hidden">
            {/* 상단 네비게이션 헤더 */}
            <Header
              currentView={currentView === 'editor' ? (previousView || 'calendar') : currentView}
              setCurrentView={(view) => {
                setCurrentView(view);
                setPreviousView(view);
              }}
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

            {/* 메인 뷰: 캘린더 또는 목록 */}
            <div className="flex-1 overflow-hidden relative">
              {(currentView === 'calendar' || (currentView === 'editor' && (previousView || 'calendar') === 'calendar')) && (
                <CalendarView
                  diaries={diaries}
                  onSelectDiary={handleSelectDiary}
                  onNewDiaryForDate={handleNewDiary}
                  selectedDate={activeEditorDiary?.date}
                />
              )}

              {(currentView === 'list' || (currentView === 'editor' && previousView === 'list')) && (
                <ListView
                  diaries={diaries}
                  onSelectDiary={handleSelectDiary}
                  onDeleteDiary={handleDeleteDiary}
                  onNewDiary={() => handleNewDiary(getTodayDateStr())}
                  selectedDiaryId={activeEditorDiary?.id}
                  selectedDate={activeEditorDiary?.date}
                />
              )}
            </div>
          </div>
        </div>

        {/* ================================================================ */}
        {/* [우측 패널] 다이어리 상세 작성창 (모바일 & 태블릿 세로는 editor 모드일 때만 표시, 태블릿 가로/PC는 항상 2분할로 표시) */}
        {/* ================================================================ */}
        <div className={`h-full flex-col min-w-0 bg-[#fafafa] overflow-hidden ${
          currentView === 'editor' ? 'flex flex-1 w-full' : 'hidden lg:flex lg:flex-1'
        }`}>
          <DiaryCanvas
            key={activeEditorDiary?.id || activeEditorDiary?.date}
            diary={activeEditorDiary}
            diaryName={diaryName}
            onSave={handleSaveDiary}
            onDelete={async (id) => {
              if (id) {
                await handleDeleteDiary(id);
              }
            }}
            onBack={() => {
              setCurrentView(previousView || 'calendar');
              setSelectedDiary(null);
            }}
          />
        </div>
      </div>

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
    );
  }
