import React, { useState, useEffect, useRef, useMemo } from 'react';
import Header from './components/Header';
import CalendarView from './components/CalendarView';
import ListView from './components/ListView';
import DiaryCanvas from './components/DiaryCanvas';
import AdminPage from './components/AdminPage';
import YearlyCalendarModal from './components/YearlyCalendarModal';
import { INITIAL_DIARIES } from './constants';
import { resolveStickerImage, upgradePresetSvgUrl } from './utils/canvasLayers';
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

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary caught error]:', error, errorInfo);
  }

  handleReset = () => {
    try {
      window.location.reload();
    } catch (e) {}
  };

  handleHardReset = () => {
    try {
      localStorage.removeItem('analog_diaries');
      localStorage.removeItem('analog_diary_entries');
      localStorage.removeItem('analog_diary_auth_user');
      window.location.reload();
    } catch (e) {}
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-[100dvh] flex flex-col items-center justify-center p-6 bg-[#fafafa] text-stone-800 text-center font-sans">
          <div className="max-w-md w-full bg-white p-6 rounded-2xl border border-stone-200 shadow-lg space-y-4">
            <h2 className="text-xl font-bold text-stone-900">다이어리를 불러오는 중 문제가 발생했습니다</h2>
            <p className="text-sm text-stone-600 leading-relaxed">
              최근 저장된 기록 또는 스티커 데이터 처리 중 일시적인 오류가 발생했습니다.<br />
              아래 버튼을 눌러 다시 시도하거나 임시 캐시를 정리하여 정상 복구할 수 있습니다.
            </p>
            {this.state.error && (
              <p className="text-xs text-red-500 font-mono bg-red-50 p-2 rounded-lg text-left overflow-auto max-h-24 break-all">
                {String(this.state.error?.message || this.state.error)}
              </p>
            )}
            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={this.handleReset}
                className="w-full py-2.5 px-4 bg-stone-900 hover:bg-stone-800 text-white font-medium rounded-xl text-sm transition"
              >
                다시 시도 (새로고침)
              </button>
              <button
                type="button"
                onClick={this.handleHardReset}
                className="w-full py-2.5 px-4 bg-stone-100 hover:bg-stone-200 text-stone-700 font-medium rounded-xl text-sm transition"
              >
                임시 캐시 정리 후 앱 복구
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
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

  return (
    <ErrorBoundary>
      <DiaryMainApp />
    </ErrorBoundary>
  );
}

function DiaryMainApp() {
  // 로컬스토리지에서 일기 불러오기 (기본값: 아무 데이터도 없는 빈 배열 [] & 날짜별 중복 자동 정리 & 방어적 파싱)
  const [diaries, setDiaries] = useState(() => {
    let saved = null;
    try {
      saved = localStorage.getItem('analog_diaries') || localStorage.getItem('analog_diary_entries');
    } catch (e) {
      console.warn('Failed to access localStorage:', e);
    }
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const validDiaries = parsed
            .filter((d) => d && typeof d === 'object' && !LEGACY_SAMPLE_IDS.has(String(d?.id)))
            .map((d) => {
              const rawStickers = Array.isArray(d.stickers)
                ? d.stickers
                : (d.stickers && typeof d.stickers === 'object' ? Object.values(d.stickers) : []);
              const rehydratedStickers = rawStickers.map((st) => {
                if (st && (!st.imageUrl || st.imageUrl === '')) {
                  const resolved = resolveStickerImage(st);
                  if (resolved) return { ...st, imageUrl: upgradePresetSvgUrl(resolved) };
                }
                if (st?.imageUrl) {
                  return { ...st, imageUrl: upgradePresetSvgUrl(st.imageUrl) };
                }
                return st;
              });
              const upgradedWeather = upgradePresetSvgUrl(d.weather);
              const upgradedMood = upgradePresetSvgUrl(d.thumbnailMood || d.weather);
              return {
                ...d,
                weather: upgradedWeather,
                thumbnailMood: upgradedMood,
                textBlocks: Array.isArray(d.textBlocks)
                  ? d.textBlocks
                  : (d.textBlocks && typeof d.textBlocks === 'object' ? Object.values(d.textBlocks) : []),
                stickers: rehydratedStickers,
                strokes: Array.isArray(d.strokes)
                  ? d.strokes
                  : (d.strokes && typeof d.strokes === 'object' ? Object.values(d.strokes) : []),
              };
            });
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

  // 현재 달력에서 조회 중인 월/날짜 (목록 탭 전환 시 해당 월로 스크롤 동기화)
  const [calendarViewingDate, setCalendarViewingDate] = useState(() => new Date());

  // 1년 단위 연력(Yearly Calendar) 모달 상태 & 조회 연도
  const [isYearViewOpen, setIsYearViewOpen] = useState(false);
  const [yearViewYear, setYearViewYear] = useState(() => new Date().getFullYear());

  // 목록 뷰 스크롤 위치 복원 상태 (상세 확인 후 목록 복귀 시 기존 스크롤 유지)
  const [savedListScrollTop, setSavedListScrollTop] = useState(0);
  const [isReturningFromEditor, setIsReturningFromEditor] = useState(false);
  const [listScrollTrigger, setListScrollTrigger] = useState(null);

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

  // 로컬스토리지 동기화 (오프라인 캐시 역할 겸용 & QuotaExceededError 완벽 방어)
  useEffect(() => {
    if (!diaries) return;
    try {
      localStorage.setItem('analog_diaries', JSON.stringify(diaries));
    } catch (err) {
      console.warn('[Storage] Quota exceeded or error saving full diaries to localStorage:', err);
      try {
        const lightweight = diaries.map((diary) => {
          if (!diary) return diary;
          const sanitizedStickers = (Array.isArray(diary.stickers) ? diary.stickers : []).map((st) => {
            if (
              st?.imageUrl &&
              typeof st.imageUrl === 'string' &&
              st.imageUrl.startsWith('data:') &&
              st.imageUrl.length > 50000
            ) {
              return {
                ...st,
                decorationId: st.decorationId || st.id || st.name || st.label,
                imageUrl: '',
              };
            }
            return st;
          });
          return {
            ...diary,
            stickers: sanitizedStickers,
          };
        });
        localStorage.setItem('analog_diaries', JSON.stringify(lightweight));
      } catch (e2) {
        console.error('[Storage] Lightweight backup also failed:', e2);
      }
    }
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
        try {
          localStorage.setItem('analog_diary_auth_user', JSON.stringify(userSnapshot));
          localStorage.setItem('analog_diary_account_prompt_seen', 'true');
        } catch (e) {}
        setUser(currentUser);
        setIsAccountPromptOpen(false);
      } else {
        try {
          localStorage.removeItem('analog_diary_auth_user');
        } catch (e) {}
        setUser(null);
        let hasSeenPrompt = null;
        try {
          hasSeenPrompt = localStorage.getItem('analog_diary_account_prompt_seen');
        } catch (e) {}
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
          try {
            localStorage.setItem('analog_diary_auth_user', JSON.stringify(userSnapshot));
            localStorage.setItem('analog_diary_account_prompt_seen', 'true');
          } catch (e) {}
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
  // 계정이 전환되거나 홈 바로가기로 다른 계정에 진입 시 이전 캐시를 안전하게 초기화
  const currentUidRef = useRef(user?.uid);
  useEffect(() => {
    if (user?.uid && currentUidRef.current && currentUidRef.current !== user.uid) {
      setDiaries([]);
      try {
        localStorage.removeItem('analog_diaries');
        localStorage.removeItem('analog_diary_entries');
      } catch (e) {}
    }
    currentUidRef.current = user?.uid;
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;

    let unsubscribeDiaries = () => {};
    let unsubscribeSettings = () => {};
    let isCancelled = false;
    let syncSafetyTimer = null;

    setIsSyncing(true);

    // 네트워크 지연이나 PWA 백그라운드 복귀 시 동기화 스피너가 무한 회전하는 것을 방지하는 안전 타이머 (최대 5초)
    syncSafetyTimer = setTimeout(() => {
      setIsSyncing(false);
    }, 5000);

    // 클라우드 일기 실시간 구독 즉시 개시 (게스트 데이터 업로드 완료 대기 없이 즉시 병렬 시작)
    unsubscribeDiaries = subscribeToUserDiaries(
      user.uid,
      async (cloudDiaries) => {
        if (syncSafetyTimer) clearTimeout(syncSafetyTimer);
        const sanitizedCloud = (cloudDiaries || []).map((d) => {
          const rawStickers = Array.isArray(d?.stickers)
            ? d.stickers
            : (d?.stickers && typeof d.stickers === 'object' ? Object.values(d.stickers) : []);
          const rehydratedStickers = rawStickers.map((st) => {
            if (st && (!st.imageUrl || st.imageUrl === '')) {
              const resolved = resolveStickerImage(st);
              if (resolved) return { ...st, imageUrl: upgradePresetSvgUrl(resolved) };
            }
            if (st?.imageUrl) {
              return { ...st, imageUrl: upgradePresetSvgUrl(st.imageUrl) };
            }
            return st;
          });
          const upgradedWeather = upgradePresetSvgUrl(d?.weather);
          const upgradedMood = upgradePresetSvgUrl(d?.thumbnailMood || d?.weather);
          return {
            ...d,
            weather: upgradedWeather,
            thumbnailMood: upgradedMood,
            textBlocks: Array.isArray(d?.textBlocks)
              ? d.textBlocks
              : (d?.textBlocks && typeof d.textBlocks === 'object' ? Object.values(d.textBlocks) : []),
            stickers: rehydratedStickers,
            strokes: Array.isArray(d?.strokes)
              ? d.strokes
              : (d?.strokes && typeof d.strokes === 'object' ? Object.values(d.strokes) : []),
          };
        });
        const deduped = deduplicateDiariesByDate(sanitizedCloud);
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
        if (syncSafetyTimer) clearTimeout(syncSafetyTimer);
        setIsSyncing(false);
      }
    );

    // 클라우드 다이어리 이름 설정 실시간 구독
    unsubscribeSettings = subscribeToUserSettings(user.uid, (settings) => {
      if (settings?.diaryName) {
        setDiaryName(settings.diaryName);
        try {
          localStorage.setItem('analog_diary_name', settings.diaryName);
        } catch (e) {}
      }
    });

    // 비로그인(게스트) 상태에서 새로 작성된 로컬 일기가 있는 경우 백그라운드에서 병합 업로드
    (async () => {
      try {
        let hasUnsyncedGuest = false;
        try {
          hasUnsyncedGuest = localStorage.getItem('analog_diary_has_unsynced_guest_data') === 'true';
        } catch (e) {}
        if (hasUnsyncedGuest && !isCancelled) {
          await syncLocalDiariesToCloud(user.uid, diariesRef.current);
          try {
            localStorage.removeItem('analog_diary_has_unsynced_guest_data');
          } catch (e) {}
        }
      } catch (err) {
        console.warn('[Cloud Sync] 게스트 데이터 동기화 경고:', err);
      }
    })();

    return () => {
      isCancelled = true;
      if (syncSafetyTimer) clearTimeout(syncSafetyTimer);
      unsubscribeDiaries();
      unsubscribeSettings();
    };
  }, [user?.uid]);

  // 구글 로그인 핸들러
  const handleGoogleLogin = async () => {
    setAuthError(null);
    try {
      const loggedInUser = await loginWithGoogle();
      if (loggedInUser) {
        try {
          localStorage.setItem('analog_diary_account_prompt_seen', 'true');
        } catch (e) {}
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
    try {
      localStorage.setItem('analog_diary_account_prompt_seen', 'true');
    } catch (e) {}
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
      try {
        localStorage.removeItem('analog_diary_auth_user');
        localStorage.removeItem('analog_diaries');
        localStorage.removeItem('analog_diary_entries');
        localStorage.removeItem('analog_diary_name');
      } catch (e) {}
    }
  };

  // 다이어리 이름 변경 핸들러 (로컬 + 클라우드 동시 반영)
  const handleUpdateDiaryName = async (newName) => {
    setDiaryName(newName);
    try {
      localStorage.setItem('analog_diary_name', newName);
    } catch (e) {}
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

  // 특정 일기 선택 (목록에서 진입한 경우 스크롤 복원 플래그 설정)
  const handleSelectDiary = (diary) => {
    const prev = currentView === 'editor' ? (previousView || 'calendar') : currentView;
    setPreviousView(prev);
    if (prev === 'list') {
      setIsReturningFromEditor(true);
    }
    setSelectedDiary(diary);
    setCurrentView('editor');
  };

  // 연력(Yearly Calendar) 모달 열기 출처 ('calendar' 또는 'list')
  const [yearViewSource, setYearViewSource] = useState('calendar');

  // 연력(Yearly Calendar) 모달 열기
  const handleOpenYearView = (year, source = 'calendar') => {
    setYearViewYear(year || new Date().getFullYear());
    setYearViewSource(source);
    setIsYearViewOpen(true);
  };

  // 연력 모달에서 특정 월 선택 시 이동:
  // - 목록에서 연력을 열었다면 목록 뷰를 유지하고 해당 월 목록으로 이동
  // - 달력에서 연력을 열었다면 달력 뷰로 이동
  const handleSelectYearMonth = (year, monthIdx) => {
    const targetDate = new Date(year, monthIdx, 1);
    setCalendarViewingDate(targetDate);
    setIsYearViewOpen(false);

    if (yearViewSource === 'list') {
      setCurrentView('list');
      setPreviousView('list');
      setIsReturningFromEditor(false);
      setListScrollTrigger({ type: 'month', year, monthIdx, timestamp: Date.now() });
    } else {
      setCurrentView('calendar');
      setPreviousView('calendar');
    }
  };

  // 오늘 날짜로 이동 (상단 헤더 오늘 버튼 클릭)
  const handleGoToToday = () => {
    const now = new Date();
    setCalendarViewingDate(new Date(now.getFullYear(), now.getMonth(), 1));
    setIsYearViewOpen(false);
    if (currentView === 'editor') {
      setCurrentView('calendar');
    } else if (currentView === 'list' || yearViewSource === 'list') {
      setCurrentView('list');
      setPreviousView('list');
      setIsReturningFromEditor(false);
      setListScrollTrigger({ type: 'today', timestamp: Date.now() });
    }
  };

  // 일기 삭제 (로컬 상태 반영 + 로그인 시 Firestore 삭제)
  const handleDeleteDiary = async (id) => {
    // 1. 로컬 상태 및 localStorage에서 즉시 삭제
    setDiaries(prev => {
      const updated = prev.filter(d => d.id !== id);
      try {
        localStorage.setItem('analog_diaries', JSON.stringify(updated));
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
      try {
        localStorage.setItem('analog_diary_has_unsynced_guest_data', 'true');
      } catch (e) {}
    }

    setDiaries((prev) => {
      // 동일 id 또는 동일 date를 가진 기존 항목을 모두 제거 후 신규 저장본 추가
      const filtered = prev.filter(
        (d) => d.id !== finalDiaryToSave.id && d.date !== finalDiaryToSave.date
      );
      const updated = deduplicateDiariesByDate([finalDiaryToSave, ...filtered]);
      try {
        localStorage.setItem('analog_diaries', JSON.stringify(updated));
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
              onGoToToday={handleGoToToday}
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
                  onMonthChange={setCalendarViewingDate}
                  initialDate={calendarViewingDate}
                  onOpenYearView={(y) => handleOpenYearView(y, 'calendar')}
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
                  calendarViewingDate={calendarViewingDate}
                  listScrollTrigger={listScrollTrigger}
                  isActive={currentView === 'list'}
                  savedScrollTop={savedListScrollTop}
                  isReturningFromEditor={isReturningFromEditor}
                  onSaveScrollTop={setSavedListScrollTop}
                  onRestoreScrollComplete={() => setIsReturningFromEditor(false)}
                  onOpenYearView={(y) => handleOpenYearView(y, 'list')}
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
              if (previousView === 'list') {
                setIsReturningFromEditor(true);
              }
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
        {/* (3) 연간 달력 (Yearly Calendar) 전체 화면 모달 (달력/목록 공통) */}
        <YearlyCalendarModal
          isOpen={isYearViewOpen}
          onClose={() => setIsYearViewOpen(false)}
          initialYear={yearViewYear}
          diaries={diaries}
          onSelectMonth={handleSelectYearMonth}
          onSelectDiary={(d) => {
            handleSelectDiary(d);
            setIsYearViewOpen(false);
          }}
          onGoToToday={handleGoToToday}
        />
      </div>
    );
  }
