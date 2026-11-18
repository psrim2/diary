import React, { useState, useEffect, useRef } from 'react';
import {
  ADMIN_EMAIL,
  loginWithGoogle,
  logoutUser,
  subscribeToAuthChanges,
  uploadDecorationAsset,
  subscribeToDecorations,
  deleteDecorationAsset,
  updateDecorationAsset,
} from '../firebase';

const CATEGORIES = [
  { id: 'sticker', label: '스티커 (sticker)' },
  { id: 'weather', label: '날씨 (weather)' },
  { id: 'tape', label: '마스킹테이프 (tape)' },
];

function formatDate(item) {
  const ms = item?.createdAt?.toMillis?.() || item?.createdAtMs;
  if (!ms) return '-';
  const d = new Date(ms);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleString('ko-KR');
}

export default function AdminPage() {
  const [user, setUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [unauthorizedInfo, setUnauthorizedInfo] = useState(null);
  const [authError, setAuthError] = useState('');

  // 업로드 입력 폼 상태
  const [uploadCategory, setUploadCategory] = useState('sticker');
  const [assetName, setAssetName] = useState('');
  const fileInputRef = useRef(null);

  // Firestore에서 불러온 원본 에셋 목록
  const [decorations, setDecorations] = useState([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [filterCategory, setFilterCategory] = useState('all');

  // [적용하기 / 취소]를 위한 스테이징(대기) 상태
  // 1) 새로 추가할 파일 대기 목록: [{ tempId, file, previewUrl, category, name }]
  const [pendingAdds, setPendingAdds] = useState([]);
  // 2) 삭제 예정인 기존 에셋 ID 집합: Set<string>
  const [pendingDeleteIds, setPendingDeleteIds] = useState(() => new Set());
  // 3) 기존 에셋 수정 대기 맵: { [id]: { name, category } }
  const [pendingUpdates, setPendingUpdates] = useState({});

  // 적용 진행 상태 및 결과 메시지
  const [isApplying, setIsApplying] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  // 1. 인증 상태 감지 및 psrim2@gmail.com 권한 체크
  useEffect(() => {
    const unsubscribe = subscribeToAuthChanges(async (currentUser) => {
      if (currentUser) {
        const email = (currentUser.email || '').toLowerCase();
        if (email === ADMIN_EMAIL.toLowerCase()) {
          setUser(currentUser);
          setUnauthorizedInfo(null);
          setIsAuthLoading(false);
        } else {
          // 허용되지 않은 계정: 차단 메시지 상태 저장 및 즉시 로그아웃 처리
          setUser(null);
          setUnauthorizedInfo({
            email: currentUser.email || '알 수 없는 계정',
            message: '접근 권한이 없습니다',
          });
          setIsAuthLoading(false);
          localStorage.removeItem('analog_diary_auth_user');
          try {
            await logoutUser();
          } catch (err) {
            console.error('[Admin Auth] 비인가 계정 로그아웃 오류:', err);
          }
        }
      } else {
        setUser(null);
        setIsAuthLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // 2. 관리자 인증 완료 시 Firestore decorations 컬렉션 실시간 구독
  useEffect(() => {
    const isAuthorized =
      user && (user.email || '').toLowerCase() === ADMIN_EMAIL.toLowerCase();
    if (!isAuthorized) {
      setDecorations([]);
      return;
    }

    setIsLoadingList(true);
    const unsubscribe = subscribeToDecorations(
      (items) => {
        setDecorations(items);
        setIsLoadingList(false);
      },
      (err) => {
        console.error('[Admin] decorations 조회 오류:', err);
        setIsLoadingList(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // 컴포넌트 언마운트 시에만 Object URL 정리
  const pendingAddsRef = useRef(pendingAdds);
  useEffect(() => {
    pendingAddsRef.current = pendingAdds;
  }, [pendingAdds]);

  useEffect(() => {
    return () => {
      pendingAddsRef.current.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
    };
  }, []);

  // 전용 구글 로그인 핸들러
  const handleAdminLogin = async () => {
    setAuthError('');
    setUnauthorizedInfo(null);
    try {
      await loginWithGoogle(true);
    } catch (err) {
      if (
        err?.code === 'auth/user-cancelled' ||
        err?.code === 'auth/popup-closed-by-user'
      ) {
        return;
      }
      setAuthError(err?.message || '구글 로그인 중 오류가 발생했습니다.');
    }
  };

  // 관리자 로그아웃 핸들러
  const handleAdminLogout = async () => {
    setUnauthorizedInfo(null);
    localStorage.removeItem('analog_diary_auth_user');
    try {
      await logoutUser();
    } catch (err) {
      console.error('[Admin] 로그아웃 오류:', err);
    }
  };

  // 파일 선택 시: 추가 대기 목록(pendingAdds)에 스테이징
  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const customName = assetName.trim();
    const newStagedItems = files.map((file, idx) => {
      const defaultName = file.name.replace(/\.[^/.]+$/, '');
      return {
        tempId: `pending-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        file,
        previewUrl: URL.createObjectURL(file),
        category: uploadCategory,
        name: files.length === 1 && customName ? customName : defaultName,
      };
    });

    setPendingAdds((prev) => [...newStagedItems, ...prev]);
    setAssetName('');
    setStatusMessage('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 추가 대기 항목 개별 수정 (이름/카테고리)
  const handleUpdatePendingAdd = (tempId, fields) => {
    setPendingAdds((prev) =>
      prev.map((item) => (item.tempId === tempId ? { ...item, ...fields } : item))
    );
  };

  // 추가 대기 항목 개별 취소(제거)
  const handleRemovePendingAdd = (tempId) => {
    setPendingAdds((prev) => {
      const target = prev.find((item) => item.tempId === tempId);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((item) => item.tempId !== tempId);
    });
  };

  // 기존 에셋 삭제 대기 토글 (즉시 삭제하지 않고 '적용하기' 전까지 대기)
  const handleTogglePendingDelete = (id) => {
    setStatusMessage('');
    setPendingDeleteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // 기존 에셋 이름/카테고리 수정 대기
  const handleStageUpdateExisting = (item, fields) => {
    setStatusMessage('');
    setPendingUpdates((prev) => {
      const current = prev[item.id] || {
        name: item.name || item.fileName || '',
        category: item.category,
      };
      const updated = { ...current, ...fields };

      // 원본과 동일하면 수정 대기에서 제거
      const origName = item.name || item.fileName || '';
      if (updated.name === origName && updated.category === item.category) {
        const copy = { ...prev };
        delete copy[item.id];
        return copy;
      }
      return {
        ...prev,
        [item.id]: updated,
      };
    });
  };

  // 미적용 변경사항 존재 여부 계산
  const pendingUpdateIds = Object.keys(pendingUpdates).filter(
    (id) => !pendingDeleteIds.has(id)
  );
  const hasPendingChanges =
    pendingAdds.length > 0 ||
    pendingDeleteIds.size > 0 ||
    pendingUpdateIds.length > 0;

  // [취소] 버튼 핸들러: 모든 대기 중인 추가/수정/삭제 내역 초기화 및 원상복구
  const handleCancelChanges = () => {
    pendingAdds.forEach((item) => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });
    setPendingAdds([]);
    setPendingDeleteIds(new Set());
    setPendingUpdates({});
    setAssetName('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setStatusMessage('변경사항이 취소되었습니다.');
  };

  // [적용하기] 버튼 핸들러: 대기 중인 추가(업로드), 수정, 삭제를 일괄 반영
  const handleApplyChanges = async () => {
    if (!hasPendingChanges) {
      setStatusMessage('적용할 변경사항이 없습니다.');
      return;
    }

    const totalOps =
      pendingAdds.length + pendingUpdateIds.length + pendingDeleteIds.size;
    let completedOps = 0;
    const updateProgress = () => {
      completedOps += 1;
      setStatusMessage(`변경사항을 적용하는 중입니다... (${completedOps}/${totalOps})`);
    };

    setIsApplying(true);
    setStatusMessage(`변경사항을 적용하는 중입니다... (0/${totalOps})`);

    try {
      // 1) 신규 추가 대기 파일 업로드 (첫 번째 항목으로 Storage 가용 여부 확인 후 나머지 병렬 고속 처리)
      if (pendingAdds.length > 0) {
        const [firstItem, ...restItems] = pendingAdds;
        await uploadDecorationAsset({
          file: firstItem.file,
          category: firstItem.category,
          name: firstItem.name,
        });
        if (firstItem.previewUrl) URL.revokeObjectURL(firstItem.previewUrl);
        updateProgress();

        if (restItems.length > 0) {
          await Promise.all(
            restItems.map(async (addItem) => {
              await uploadDecorationAsset({
                file: addItem.file,
                category: addItem.category,
                name: addItem.name,
              });
              if (addItem.previewUrl) URL.revokeObjectURL(addItem.previewUrl);
              updateProgress();
            })
          );
        }
      }

      // 2) 기존 항목 수정 사항 병렬 반영
      if (pendingUpdateIds.length > 0) {
        await Promise.all(
          pendingUpdateIds.map(async (id) => {
            await updateDecorationAsset(id, pendingUpdates[id]);
            updateProgress();
          })
        );
      }

      // 3) 삭제 예정 항목 병렬 최종 삭제
      if (pendingDeleteIds.size > 0) {
        const deleteIdsArr = Array.from(pendingDeleteIds);
        await Promise.all(
          deleteIdsArr.map(async (id) => {
            const targetItem = decorations.find((d) => d.id === id) || { id };
            await deleteDecorationAsset(targetItem);
            updateProgress();
          })
        );
      }

      const summaryParts = [];
      if (pendingAdds.length > 0) summaryParts.push(`추가 ${pendingAdds.length}건`);
      if (pendingUpdateIds.length > 0) summaryParts.push(`수정 ${pendingUpdateIds.length}건`);
      if (pendingDeleteIds.size > 0) summaryParts.push(`삭제 ${pendingDeleteIds.size}건`);

      setPendingAdds([]);
      setPendingDeleteIds(new Set());
      setPendingUpdates({});
      setStatusMessage(`적용 완료 (${summaryParts.join(', ')})`);
    } catch (err) {
      console.error('[Admin] 변경사항 적용 실패:', err);
      setStatusMessage(`적용 실패: ${err.message || '오류가 발생했습니다.'}`);
    } finally {
      setIsApplying(false);
    }
  };

  const isAuthorizedAdmin =
    user && (user.email || '').toLowerCase() === ADMIN_EMAIL.toLowerCase();

  const filteredDecorations =
    filterCategory === 'all'
      ? decorations
      : decorations.filter((item) => {
          const effectiveCategory =
            pendingUpdates[item.id]?.category || item.category;
          return effectiveCategory === filterCategory;
        });

  const filteredPendingAdds =
    filterCategory === 'all'
      ? pendingAdds
      : pendingAdds.filter((item) => item.category === filterCategory);

  // 로딩 화면
  if (isAuthLoading) {
    return (
      <div className="admin-page p-6">
        <p>인증 상태를 확인하는 중입니다...</p>
      </div>
    );
  }

  // 미로그인 또는 권한 없음(차단) 게이트 화면
  if (!isAuthorizedAdmin) {
    return (
      <div className="admin-login-gate p-6 max-w-md mx-auto">
        <h1 className="text-xl font-bold mb-4">관리자 전용 페이지 (/admin)</h1>

        {unauthorizedInfo && (
          <div
            role="alert"
            className="admin-access-denied border border-red-400 bg-red-50 text-red-700 p-4 mb-4"
          >
            <p className="font-bold">{unauthorizedInfo.message}</p>
            <p className="text-sm mt-1">
              로그인 시도 계정: {unauthorizedInfo.email} (자동 로그아웃 및 접근 차단됨)
            </p>
          </div>
        )}

        {authError && (
          <div className="border border-red-300 bg-red-50 text-red-600 p-3 mb-4 text-sm">
            {authError}
          </div>
        )}

        <p className="text-sm mb-4">
          관리자 계정으로 로그인해야 대시보드에 접근할 수 있습니다.
        </p>

        <button
          type="button"
          onClick={handleAdminLogin}
          className="px-4 py-2 border border-black bg-black text-white text-sm"
        >
          구글 로그인
        </button>
      </div>
    );
  }

  // 관리자 대시보드 화면 (psrim2@gmail.com 로그인 완료 시)
  return (
    <div className="admin-dashboard p-6 max-w-4xl mx-auto">
      {/* 상단 관리자 정보 및 로그아웃 */}
      <header className="admin-header flex items-center justify-between border-b pb-4 mb-6">
        <div>
          <h1 className="text-xl font-bold">꾸미기 에셋 관리자 대시보드</h1>
          <p className="text-sm text-stone-600">접속 계정: {user.email}</p>
        </div>
        <button
          type="button"
          onClick={handleAdminLogout}
          className="px-3 py-1.5 border border-stone-400 text-sm"
        >
          로그아웃
        </button>
      </header>

      {/* [적용하기 / 취소] 액션 컨트롤 바 */}
      <section className="admin-action-bar border p-4 mb-6 bg-white flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          {hasPendingChanges ? (
            <span className="font-bold">
              대기 중인 변경사항: 추가 {pendingAdds.length}건 / 수정{' '}
              {pendingUpdateIds.length}건 / 삭제 {pendingDeleteIds.size}건
            </span>
          ) : (
            <span className="text-stone-500">대기 중인 변경사항이 없습니다.</span>
          )}
          {statusMessage && (
            <p className="text-xs text-stone-600 mt-1">{statusMessage}</p>
          )}
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={handleCancelChanges}
            disabled={isApplying || !hasPendingChanges}
            className="px-4 py-2 border border-stone-400 bg-white text-stone-800 text-sm disabled:opacity-40"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleApplyChanges}
            disabled={isApplying || !hasPendingChanges}
            className="px-4 py-2 border border-black bg-black text-white text-sm disabled:opacity-40"
          >
            {isApplying ? '적용 중...' : '적용하기'}
          </button>
        </div>
      </section>

      {/* 1. 새 에셋 파일 선택 (선택 시 대기 목록에 추가됨 -> '적용하기' 클릭 시 최종 반영) */}
      <section className="admin-upload-section border p-4 mb-8 bg-white">
        <h2 className="text-base font-bold mb-3">새 꾸미기 에셋 추가</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">
              기본 카테고리 선택
            </label>
            <select
              value={uploadCategory}
              onChange={(e) => setUploadCategory(e.target.value)}
              className="border px-3 py-1.5 text-sm"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              에셋 이름 (선택사항, 미입력 시 파일명 사용)
            </label>
            <input
              type="text"
              value={assetName}
              onChange={(e) => setAssetName(e.target.value)}
              placeholder="예: 맑은 날, 하트 스티커, 체크 마스킹테이프"
              className="border px-3 py-1.5 text-sm w-full max-w-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              이미지 파일 선택 (선택 즉시 아래 대기열에 추가되며, [적용하기]를 누르면 업로드됩니다)
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/svg+xml,image/*"
              multiple
              onChange={handleFileChange}
              className="text-sm"
            />
          </div>
        </div>
      </section>

      {/* 2. 카테고리별 에셋 조회 / 대기열 확인 / 삭제 및 수정 섹션 */}
      <section className="admin-list-section border p-4 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h2 className="text-base font-bold">
            에셋 목록 (등록됨 {filteredDecorations.length}개
            {filteredPendingAdds.length > 0
              ? ` / 추가 예정 ${filteredPendingAdds.length}개`
              : ''}
            )
          </h2>

          {/* 카테고리 필터 탭 */}
          <div className="admin-category-filter flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => setFilterCategory('all')}
              className={`px-3 py-1 border text-xs ${
                filterCategory === 'all' ? 'bg-black text-white' : 'bg-white'
              }`}
            >
              전체 ({decorations.length + pendingAdds.length})
            </button>
            {CATEGORIES.map((cat) => {
              const count =
                decorations.filter(
                  (d) =>
                    (pendingUpdates[d.id]?.category || d.category) === cat.id
                ).length +
                pendingAdds.filter((p) => p.category === cat.id).length;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setFilterCategory(cat.id)}
                  className={`px-3 py-1 border text-xs ${
                    filterCategory === cat.id
                      ? 'bg-black text-white'
                      : 'bg-white'
                  }`}
                >
                  {cat.label} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {isLoadingList ? (
          <p className="text-sm py-4">목록을 불러오는 중입니다...</p>
        ) : filteredPendingAdds.length === 0 &&
          filteredDecorations.length === 0 ? (
          <p className="text-sm text-stone-500 py-4">
            해당 카테고리에 등록된 에셋이 없습니다.
          </p>
        ) : (
          <ul className="admin-asset-grid grid grid-cols-2 sm:grid-cols-4 gap-4">
            {/* (A) 새로 추가 대기 중인 에셋 카드 */}
            {filteredPendingAdds.map((item) => (
              <li
                key={item.tempId}
                className="admin-asset-item border-2 border-dashed border-black p-3 flex flex-col justify-between bg-stone-50"
              >
                <div>
                  <div className="text-[11px] font-bold mb-1">[추가 예정]</div>
                  <div className="h-24 flex items-center justify-center bg-white mb-2 overflow-hidden border">
                    <img
                      src={item.previewUrl}
                      alt={item.name}
                      className="max-h-20 max-w-full object-contain"
                    />
                  </div>
                  <input
                    type="text"
                    value={item.name}
                    onChange={(e) =>
                      handleUpdatePendingAdd(item.tempId, {
                        name: e.target.value,
                      })
                    }
                    className="border px-2 py-1 text-xs w-full mb-1 bg-white"
                    placeholder="에셋 이름"
                  />
                  <select
                    value={item.category}
                    onChange={(e) =>
                      handleUpdatePendingAdd(item.tempId, {
                        category: e.target.value,
                      })
                    }
                    className="border px-2 py-1 text-xs w-full bg-white"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => handleRemovePendingAdd(item.tempId)}
                  className="mt-3 w-full py-1 border border-stone-500 text-stone-700 text-xs bg-white"
                >
                  추가 취소
                </button>
              </li>
            ))}

            {/* (B) 이미 등록된 에셋 카드 */}
            {filteredDecorations.map((item) => {
              const isMarkedForDelete = pendingDeleteIds.has(item.id);
              const staged = pendingUpdates[item.id];
              const currentName =
                staged?.name !== undefined
                  ? staged.name
                  : item.name || item.fileName || '';
              const currentCategory = staged?.category || item.category;

              return (
                <li
                  key={item.id}
                  className={`admin-asset-item border p-3 flex flex-col justify-between ${
                    isMarkedForDelete ? 'opacity-50 bg-red-50 border-red-400' : ''
                  }`}
                >
                  <div>
                    {isMarkedForDelete && (
                      <div className="text-[11px] font-bold text-red-600 mb-1">
                        [삭제 예정 - 적용하기 시 삭제됨]
                      </div>
                    )}
                    {!isMarkedForDelete && staged && (
                      <div className="text-[11px] font-bold text-blue-600 mb-1">
                        [수정 예정]
                      </div>
                    )}

                    <div className="h-24 flex items-center justify-center bg-stone-50 mb-2 overflow-hidden">
                      <img
                        src={item.imageUrl}
                        alt={currentName}
                        className="max-h-20 max-w-full object-contain"
                      />
                    </div>

                    <input
                      type="text"
                      value={currentName}
                      disabled={isMarkedForDelete}
                      onChange={(e) =>
                        handleStageUpdateExisting(item, {
                          name: e.target.value,
                        })
                      }
                      className="border px-2 py-1 text-xs font-bold w-full mb-1"
                    />

                    <select
                      value={currentCategory}
                      disabled={isMarkedForDelete}
                      onChange={(e) =>
                        handleStageUpdateExisting(item, {
                          category: e.target.value,
                        })
                      }
                      className="border px-2 py-1 text-xs w-full mb-1"
                    >
                      {CATEGORIES.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.label}
                        </option>
                      ))}
                    </select>

                    <p className="text-[11px] text-stone-400">
                      등록일: {formatDate(item)}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleTogglePendingDelete(item.id)}
                    className={`mt-3 w-full py-1 border text-xs ${
                      isMarkedForDelete
                        ? 'border-stone-600 text-stone-800 bg-white'
                        : 'border-red-500 text-red-600'
                    }`}
                  >
                    {isMarkedForDelete ? '삭제 취소 (복구)' : '삭제'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {/* 하단 적용하기 / 취소 버튼 바 */}
        <div className="mt-6 pt-4 border-t flex items-center justify-end space-x-2">
          <button
            type="button"
            onClick={handleCancelChanges}
            disabled={isApplying || !hasPendingChanges}
            className="px-4 py-2 border border-stone-400 bg-white text-stone-800 text-sm disabled:opacity-40"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleApplyChanges}
            disabled={isApplying || !hasPendingChanges}
            className="px-4 py-2 border border-black bg-black text-white text-sm disabled:opacity-40"
          >
            {isApplying ? '적용 중...' : '적용하기'}
          </button>
        </div>
      </section>
    </div>
  );
}
