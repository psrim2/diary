import React, { useState, useEffect } from 'react';
import {
  X,
  LogOut,
  LogIn,
  Info,
  Share2,
  ExternalLink,
  Check,
  User,
  Shield,
  ChevronRight,
} from 'lucide-react';
import { triggerHaptic } from '../utils/haptics';
import { ADMIN_EMAIL } from '../firebase';

export default function SideMenuDrawer({
  isOpen,
  onClose,
  user,
  diaryName,
  onLogin,
  onLogout,
}) {
  const [isVersionModalOpen, setIsVersionModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  // ESC 키로 드로어 닫기
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        if (isVersionModalOpen) {
          setIsVersionModalOpen(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isVersionModalOpen, onClose]);

  // 토스트 메시지 2.5초 후 자동 숨김
  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => {
      setToastMessage(null);
    }, 2500);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  const showToast = (msg) => {
    setToastMessage(msg);
  };

  // 앱 공유 기능 (Web Share API 지원 시 네이티브 시트 호출, 미지원 시 클립보드 복사)
  const handleShareApp = async () => {
    triggerHaptic('light');
    const shareUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const shareData = {
      title: diaryName || '아날로그 다이어리 - My Analog Diary',
      text: '나만의 감성으로 기록하는 아날로그 다이어리',
      url: shareUrl,
    };

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err) {
        if (err.name === 'AbortError') {
          return;
        }
      }
    }

    // 클립보드 복사 폴백
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
        showToast('다이어리 링크가 클립보드에 복사되었습니다!');
      } else {
        showToast('주소를 복사할 수 없습니다.');
      }
    } catch {
      showToast('주소 복사 중 오류가 발생했습니다.');
    }
  };

  if (!isOpen) return null;

  const isAdmin = user && user.email === ADMIN_EMAIL;

  return (
    <>
      {/* 1. 배경 어두운 딤드 오버레이 */}
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-2xs transition-opacity duration-300 animate-fadeIn"
        onClick={() => {
          triggerHaptic('light');
          onClose();
        }}
      />

      {/* 2. 좌측 슬라이드 사이드 드로어 패널 */}
      <div
        role="dialog"
        aria-modal="true"
        className="fixed top-0 left-0 bottom-0 z-50 w-[300px] max-w-[85vw] bg-[#fafafa] shadow-2xl flex flex-col justify-between border-r border-stone-200/90 animate-slideInLeft overflow-hidden"
      >
        {/* 상단 헤더 & 컨텐츠 영역 */}
        <div className="flex-1 flex flex-col overflow-y-auto">
          {/* 드로어 상단 바 (앱 이름 & 닫기 버튼) */}
          <div className="px-5 pt-[calc(1.25rem+env(safe-area-inset-top,0px))] pb-3 flex items-center justify-between border-b border-stone-200/70 shrink-0">
            <div className="flex items-center space-x-2">
              <span className="text-lg">📓</span>
              <span className="font-black text-stone-900 text-sm tracking-tight truncate max-w-[170px]">
                {diaryName || 'My Analog Diary'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onClose();
              }}
              className="w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-600 flex items-center justify-center transition active:scale-95 cursor-pointer"
              title="메뉴 닫기"
            >
              <X size={16} strokeWidth={2.4} />
            </button>
          </div>

          <div className="p-4 space-y-4">
            {/* 1. 상단: 구글 계정 연동 프로필 영역 */}
            {user ? (
              <div className="p-3.5 bg-white rounded-2xl border border-stone-200/80 shadow-2xs flex items-center space-x-3">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || '구글 프로필'}
                    className="w-11 h-11 rounded-full object-cover border border-stone-200 shrink-0 select-none"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-11 h-11 rounded-full bg-stone-100 text-stone-700 font-bold flex items-center justify-center text-sm border border-stone-200 shrink-0 select-none">
                    {(user.displayName || user.email || 'G')[0].toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center space-x-1.5">
                    <span className="text-xs font-bold text-stone-900 truncate block">
                      {user.displayName || 'Google 사용자'}
                    </span>
                    <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold shrink-0">
                      연동됨
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-500 truncate mt-0.5">
                    {user.email}
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-3.5 bg-white rounded-2xl border border-stone-200/80 shadow-2xs space-y-2.5">
                <div className="flex items-center space-x-2.5">
                  <div className="w-9 h-9 rounded-full bg-stone-100 border border-stone-200 flex items-center justify-center shrink-0 text-stone-400">
                    <User size={18} />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-stone-900">게스트 모드</div>
                    <div className="text-[10px] text-stone-400">기기 로컬에 저장 중</div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onLogin();
                    onClose();
                  }}
                  className="w-full py-2 px-3 rounded-xl bg-stone-900 hover:bg-black active:scale-98 transition flex items-center justify-center space-x-2 shadow-2xs cursor-pointer font-bold text-xs text-white"
                >
                  <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24">
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
                  <span>Google 계정 연동하기</span>
                </button>
                <p className="text-[10px] text-stone-400 text-center leading-tight">
                  로그인 시 다른 기기에서도 실시간 동기화됩니다.
                </p>
              </div>
            )}

            {/* 2. 핵심 요청 3가지 메뉴 (로그아웃 / 앱 버전 보기 / 앱 공유) */}
            <div className="space-y-1">
              <div className="text-[10px] font-bold text-stone-400 px-2 pb-1">계정 및 앱 관리</div>

              {/* 2-1. 로그아웃 버튼 (로그인 시 로그아웃, 미로그인 시 로그인) */}
              {user ? (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onClose();
                    onLogout();
                  }}
                  className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-stone-100 transition active:scale-98 text-left text-stone-700 hover:text-red-600 group cursor-pointer"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-lg bg-stone-100 group-hover:bg-red-50 group-hover:text-red-500 flex items-center justify-center transition shrink-0">
                      <LogOut size={16} />
                    </div>
                    <div>
                      <div className="text-xs font-bold">로그아웃</div>
                      <div className="text-[10px] text-stone-400">계정 연동 해제 및 데이터 정리</div>
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-stone-300 group-hover:text-stone-500 shrink-0" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onClose();
                    onLogin();
                  }}
                  className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-stone-100 transition active:scale-98 text-left text-stone-700 hover:text-blue-600 group cursor-pointer"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-lg bg-stone-100 group-hover:bg-blue-50 group-hover:text-blue-500 flex items-center justify-center transition shrink-0">
                      <LogIn size={16} />
                    </div>
                    <div>
                      <div className="text-xs font-bold">Google 계정 로그인</div>
                      <div className="text-[10px] text-stone-400">클라우드 데이터 연동</div>
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-stone-300 group-hover:text-stone-500 shrink-0" />
                </button>
              )}

              {/* 2-2. 앱 버전 보기 버튼 */}
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setIsVersionModalOpen(true);
                }}
                className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-stone-100 transition active:scale-98 text-left text-stone-700 group cursor-pointer"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-lg bg-stone-100 group-hover:bg-stone-200/80 text-stone-600 flex items-center justify-center transition shrink-0">
                    <Info size={16} />
                  </div>
                  <div>
                    <div className="text-xs font-bold">앱 버전 보기</div>
                    <div className="text-[10px] text-stone-400">버전 정보 및 업데이트 내역</div>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-stone-500 bg-stone-200/70 px-2 py-0.5 rounded-full shrink-0">
                  v1.1.0
                </span>
              </button>

              {/* 2-3. 앱 공유 버튼 */}
              <button
                type="button"
                onClick={handleShareApp}
                className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-stone-100 transition active:scale-98 text-left text-stone-700 group cursor-pointer"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-lg bg-stone-100 group-hover:bg-stone-200/80 text-stone-600 flex items-center justify-center transition shrink-0">
                    <Share2 size={16} />
                  </div>
                  <div>
                    <div className="text-xs font-bold">앱 공유하기</div>
                    <div className="text-[10px] text-stone-400">다이어리 링크 전달하기</div>
                  </div>
                </div>
                <ChevronRight size={14} className="text-stone-300 group-hover:text-stone-500 shrink-0" />
              </button>

              {/* 관리자 전용 메뉴 (어드민 페이지 이동) */}
              {isAdmin && (
                <a
                  href="/admin"
                  onClick={() => triggerHaptic('light')}
                  className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-amber-50 text-amber-900 transition active:scale-98 group cursor-pointer mt-2 border-t border-stone-200/60 pt-3"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center transition shrink-0">
                      <Shield size={16} />
                    </div>
                    <div>
                      <div className="text-xs font-bold flex items-center space-x-1">
                        <span>스티커 관리자 페이지</span>
                        <ExternalLink size={11} className="text-amber-700" />
                      </div>
                      <div className="text-[10px] text-amber-600/80">에셋 등록 및 삭제 관리</div>
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-amber-400 group-hover:text-amber-600 shrink-0" />
                </a>
              )}
            </div>
          </div>
        </div>

        {/* 하단 푸터 (버전 정보 및 카피라이트) */}
        <div className="px-5 py-3.5 border-t border-stone-200/70 bg-stone-50/70 shrink-0 text-center">
          <div className="text-[10px] font-bold text-stone-400">
            My Analog Diary • v1.1.0
          </div>
        </div>
      </div>

      {/* 3. 앱 버전 정보 상세 모달 */}
      {isVersionModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/40 backdrop-blur-2xs p-4 animate-fadeIn">
          <div className="bg-white w-full max-w-xs sm:max-w-sm rounded-3xl shadow-2xl border border-stone-200 p-6 flex flex-col items-center text-center animate-scaleUp">
            <div className="w-12 h-12 rounded-2xl bg-stone-100 border border-stone-200 flex items-center justify-center text-2xl mb-3 shadow-2xs">
              📓
            </div>
            <h3 className="text-base sm:text-lg font-black text-black tracking-tight">
              아날로그 다이어리
            </h3>
            <div className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-stone-100 border border-stone-200 text-stone-600 text-[11px] font-bold mt-1 mb-4">
              <span>Version 1.1.0</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            </div>

            {/* 업데이트 내역 리스트 */}
            <div className="w-full text-left bg-stone-50 rounded-2xl p-3.5 border border-stone-200/80 space-y-2 text-xs">
              <div className="font-bold text-stone-800 text-[11px] pb-1 border-b border-stone-200/60">
                ✨ 최근 주요 업데이트 내역
              </div>
              <div className="space-y-1.5 text-stone-600 text-[11px] leading-relaxed">
                <div className="flex items-start space-x-1.5">
                  <span className="text-stone-400">•</span>
                  <span>사이드 메뉴 추가 (프로필, 공유, 버전 정보)</span>
                </div>
                <div className="flex items-start space-x-1.5">
                  <span className="text-stone-400">•</span>
                  <span>디바이스 간 초고속 실시간 클라우드 동기화</span>
                </div>
                <div className="flex items-start space-x-1.5">
                  <span className="text-stone-400">•</span>
                  <span>아이폰 Retina 고해상도 무손실 SVG 스티커 최적화</span>
                </div>
                <div className="flex items-start space-x-1.5">
                  <span className="text-stone-400">•</span>
                  <span>감성 손글씨 드로잉 및 속지 커스텀 지원</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setIsVersionModalOpen(false);
              }}
              className="w-full py-2.5 mt-5 rounded-xl bg-black hover:bg-stone-800 active:scale-95 text-white text-xs font-bold transition shadow-xs cursor-pointer"
            >
              확인
            </button>
          </div>
        </div>
      )}

      {/* 4. 플로팅 토스트 알림 (공유 링크 복사 등) */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-70 bg-stone-900/95 text-white text-xs font-medium py-2 px-4 rounded-full shadow-lg backdrop-blur-xs animate-fadeIn flex items-center space-x-2 pointer-events-none">
          <Check size={14} className="text-emerald-400 shrink-0" strokeWidth={2.5} />
          <span>{toastMessage}</span>
        </div>
      )}
    </>
  );
}
