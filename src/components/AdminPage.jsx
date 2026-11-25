import React, { useState, useEffect, useRef, useMemo } from 'react';
import { GripVertical, Plus, Trash2, Upload, ArrowLeft } from 'lucide-react';
import {
  ADMIN_EMAIL,
  loginWithGoogle,
  logoutUser,
  subscribeToAuthChanges,
  uploadDecorationAsset,
  subscribeToDecorations,
  deleteDecorationAsset,
  deleteMultipleDecorationAssets,
  updateDecorationAsset,
  subscribeToCategories,
  addCategory,
  deleteCategory,
  updateCategoriesOrder,
  seedDefaultCategoriesIfNeeded,
  FIXED_CATEGORIES,
  FIXED_CATEGORY_IDS,
  DEFAULT_CUSTOM_CATEGORIES,
} from '../firebase';
import { upgradePresetSvgUrl } from '../utils/canvasLayers';

const BASE_CATEGORIES = [
  { id: 'sticker', label: '스티커 (sticker)' },
  { id: 'character', label: '캐릭터 (character)' },
  { id: 'emotion', label: '감정 (emotion)' },
  { id: 'daily', label: '일상 (daily)' },
  { id: 'weather', label: '날씨 (weather)' },
  { id: 'tape', label: '마스킹테이프 (tape)' },
  { id: 'food', label: '음식 (food)' },
];

function formatDate(item) {
  const ms = item?.createdAt?.toMillis?.() || item?.createdAtMs;
  if (!ms) return '-';
  const d = new Date(ms);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleString('ko-KR');
}

export default function AdminPage({ onBack }) {
  const [user, setUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [unauthorizedInfo, setUnauthorizedInfo] = useState(null);
  const [authError, setAuthError] = useState('');

  const handleGoBack = () => {
    if (onBack) {
      onBack();
    } else if (typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back();
    } else if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  };

  // 에셋 목록 파일 업로드용 ref
  const listFileInputRef = useRef(null);

  // Firestore에서 불러온 원본 에셋 목록
  const [decorations, setDecorations] = useState([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [filterCategory, setFilterCategory] = useState('all');

  // 카테고리 관리 상태
  const [categories, setCategories] = useState([]);
  const [newCatLabel, setNewCatLabel] = useState('');
  const [newCatId, setNewCatId] = useState('');
  const [isCatSubmitting, setIsCatSubmitting] = useState(false);
  const [catMessage, setCatMessage] = useState('');
  // 드래그 앤 드롭 순서 변경 상태
  const [draggedCatIndex, setDraggedCatIndex] = useState(null);
  const [dragOverCatIndex, setDragOverCatIndex] = useState(null);

  // 1) 추가/삭제/순서변경 가능한 스티커 하위 카테고리 목록
  const customCategories = useMemo(() => {
    const list = categories.filter((c) => !FIXED_CATEGORY_IDS.has(c.id));
    if (list.length > 0) return list;
    return DEFAULT_CUSTOM_CATEGORIES;
  }, [categories]);

  // 2) 전체 카테고리 (고정 카테고리: 날씨, 표정 + 스티커 하위 카테고리들)
  const allCategories = useMemo(() => {
    const map = new Map();
    // 고정 카테고리 (날씨, 표정)
    FIXED_CATEGORIES.forEach((c) => {
      map.set(c.id, {
        id: c.id,
        label: `${c.label} (${c.id})`,
        rawLabel: c.label,
        isFixed: true,
      });
    });
    // 스티커 하위 카테고리 (설정한 순서대로)
    customCategories.forEach((c) => {
      map.set(c.id, {
        id: c.id,
        label: `${c.label} (${c.id})`,
        rawLabel: c.label,
        isFixed: false,
      });
    });
    // 혹시 기존 에셋 중 미등록된 레거시 카테고리 보정
    decorations.forEach((d) => {
      if (d.category && !map.has(d.category) && d.category !== 'gif') {
        map.set(d.category, {
          id: d.category,
          label: `${d.category} (${d.category})`,
          rawLabel: d.category,
          isFixed: false,
        });
      }
    });
    return Array.from(map.values());
  }, [customCategories, decorations]);

  // 카테고리별 에셋 개수 계산 헬퍼
  const getCategoryCount = (catId) => {
    return (
      decorations.filter(
        (d) => (pendingUpdates[d.id]?.category || d.category) === catId
      ).length +
      pendingAdds.filter((p) => p.category === catId).length
    );
  };

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
      setCategories([]);
      return;
    }

    // 기본 카테고리가 없으면 1회 시딩
    seedDefaultCategoriesIfNeeded();

    // 카테고리 실시간 구독
    const unsubCats = subscribeToCategories(
      (cats) => {
        setCategories(cats);
      },
      (err) => {
        console.error('[Admin] categories 조회 오류:', err);
      }
    );

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

    return () => {
      unsubCats();
      unsubscribe();
    };
  }, [user]);

  // 카테고리 추가 핸들러
  const handleAddCategory = async (e) => {
    e?.preventDefault?.();
    if (!newCatLabel.trim()) {
      alert('카테고리 이름을 입력해 주세요.');
      return;
    }
    setIsCatSubmitting(true);
    setCatMessage('');
    try {
      const added = await addCategory({
        id: newCatId.trim(),
        label: newCatLabel.trim(),
      });
      setNewCatLabel('');
      setNewCatId('');
      setCatMessage(`'${added.label}' 카테고리가 추가되었습니다.`);
      setTimeout(() => setCatMessage(''), 3000);
    } catch (err) {
      alert(err.message || '카테고리 추가에 실패했습니다.');
    } finally {
      setIsCatSubmitting(false);
    }
  };

  // 카테고리 삭제 핸들러 (고정 카테고리 보호)
  const handleDeleteCategory = async (cat) => {
    if (FIXED_CATEGORY_IDS.has(cat.id)) {
      alert('날씨와 표정은 기본 고정 카테고리이므로 삭제할 수 없습니다.');
      return;
    }
    const count = decorations.filter((d) => d.category === cat.id).length;
    let confirmMsg = `'${cat.label}' (${cat.id}) 카테고리를 삭제하시겠습니까?`;
    if (count > 0) {
      confirmMsg += `\n(주의: 해당 카테고리에 속한 에셋이 ${count}개 있습니다.)`;
    }
    if (!window.confirm(confirmMsg)) return;

    try {
      await deleteCategory(cat.id);
      if (filterCategory === cat.id) {
        setFilterCategory('all');
      }
      setCatMessage(`'${cat.label}' 카테고리가 삭제되었습니다.`);
      setTimeout(() => setCatMessage(''), 3000);
    } catch (err) {
      alert(err.message || '카테고리 삭제에 실패했습니다.');
    }
  };

  // 카테고리 순서 재배치 함수 (customCategories 대상 fromIndex -> toIndex)
  const reorderCategories = async (fromIndex, toIndex) => {
    if (fromIndex === null || toIndex === null || fromIndex === toIndex) return;
    if (
      fromIndex < 0 ||
      fromIndex >= customCategories.length ||
      toIndex < 0 ||
      toIndex >= customCategories.length
    ) {
      return;
    }

    const nextList = [...customCategories];
    const [moved] = nextList.splice(fromIndex, 1);
    nextList.splice(toIndex, 0, moved);

    setCategories(nextList);
    try {
      await updateCategoriesOrder(nextList);
      setCatMessage(`'${moved.label}' 카테고리 순서가 변경되었습니다.`);
      setTimeout(() => setCatMessage(''), 2500);
    } catch (err) {
      console.error('순서 변경 실패:', err);
    }
  };

  // 데스크톱 HTML5 Drag and Drop 핸들러
  const handleDragStart = (e, index) => {
    setDraggedCatIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.setData('text/plain', String(index));
    } catch {}
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverCatIndex !== index) {
      setDragOverCatIndex(index);
    }
  };

  const handleDrop = (e, targetIndex) => {
    e.preventDefault();
    if (draggedCatIndex !== null && draggedCatIndex !== targetIndex) {
      reorderCategories(draggedCatIndex, targetIndex);
    }
    setDraggedCatIndex(null);
    setDragOverCatIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedCatIndex(null);
    setDragOverCatIndex(null);
  };

  // 모바일 터치 드래그 앤 드롭 핸들러
  const touchStartIndexRef = useRef(null);
  const handleTouchStart = (index) => {
    touchStartIndexRef.current = index;
    setDraggedCatIndex(index);
  };

  const handleTouchMove = (e) => {
    if (touchStartIndexRef.current === null) return;
    const touch = e.touches[0];
    if (!touch) return;
    const elem = document.elementFromPoint(touch.clientX, touch.clientY);
    const catCard = elem?.closest?.('[data-cat-index]');
    if (catCard) {
      const idx = Number(catCard.getAttribute('data-cat-index'));
      if (!isNaN(idx) && idx !== dragOverCatIndex) {
        setDragOverCatIndex(idx);
      }
    }
  };

  const handleTouchEnd = () => {
    if (
      touchStartIndexRef.current !== null &&
      dragOverCatIndex !== null &&
      touchStartIndexRef.current !== dragOverCatIndex
    ) {
      reorderCategories(touchStartIndexRef.current, dragOverCatIndex);
    }
    touchStartIndexRef.current = null;
    setDraggedCatIndex(null);
    setDragOverCatIndex(null);
  };

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

  // 에셋 목록에서 바로 파일 선택 시 핸들러 (현재 선택된 카테고리로 즉시 자동 업로드)
  const handleListFileChange = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // 현재 선택된 카테고리 탭 (all이면 첫 번째 카테고리 또는 'sticker')
    const targetCategory =
      filterCategory !== 'all'
        ? filterCategory
        : categories[0]?.id || 'sticker';

    setIsApplying(true);
    setStatusMessage(`에셋 ${files.length}개 업로드 중... (0/${files.length})`);
    let uploadedCount = 0;

    try {
      await Promise.all(
        files.map(async (file) => {
          const defaultName = file.name.replace(/\.[^/.]+$/, '');
          await uploadDecorationAsset({
            file,
            category: targetCategory,
            name: defaultName,
          });
          uploadedCount += 1;
          setStatusMessage(`에셋 ${files.length}개 업로드 중... (${uploadedCount}/${files.length})`);
        })
      );
      setStatusMessage(`에셋 ${files.length}개 업로드가 완료되었습니다.`);
      setTimeout(() => setStatusMessage(''), 3000);
    } catch (err) {
      console.error('[Admin] 목록 즉시 업로드 실패:', err);
      setStatusMessage(`업로드 실패: ${err.message || '오류가 발생했습니다.'}`);
    } finally {
      setIsApplying(false);
      if (listFileInputRef.current) {
        listFileInputRef.current.value = '';
      }
    }
  };

  // 에셋 목록 전체 삭제 핸들러 (현재 표시된 카테고리 또는 전체 에셋 일괄 영구 삭제)
  const handleDeleteAllFiltered = async () => {
    if (filteredDecorations.length === 0) {
      alert('삭제할 등록된 에셋이 없습니다.');
      return;
    }

    const isFiltered = filterCategory !== 'all';
    const catName =
      allCategories.find((c) => c.id === filterCategory)?.label || filterCategory;
    const confirmMessage = isFiltered
      ? `'${catName}' 카테고리에 등록된 에셋 ${filteredDecorations.length}개를 모두 삭제하시겠습니까?\n이 작업은 Firestore 및 저장소에서 영구 삭제되며 복구할 수 없습니다.`
      : `현재 등록된 전체 에셋 ${filteredDecorations.length}개를 모두 삭제하시겠습니까?\n이 작업은 Firestore 및 저장소에서 영구 삭제되며 복구할 수 없습니다.`;

    if (!window.confirm(confirmMessage)) return;

    setIsApplying(true);
    setStatusMessage(`에셋 ${filteredDecorations.length}개 전체 삭제 중...`);

    try {
      await deleteMultipleDecorationAssets(filteredDecorations);

      // 대기 중인 수정/삭제 목록에서 제거된 id 정리
      const deletedIds = new Set(filteredDecorations.map((d) => d.id));
      setPendingDeleteIds((prev) => {
        const next = new Set(prev);
        deletedIds.forEach((id) => next.delete(id));
        return next;
      });
      setPendingUpdates((prev) => {
        const next = { ...prev };
        deletedIds.forEach((id) => delete next[id]);
        return next;
      });

      setStatusMessage(`에셋 ${filteredDecorations.length}개가 모두 삭제되었습니다.`);
      setTimeout(() => setStatusMessage(''), 3000);
    } catch (err) {
      console.error('[Admin] 전체 삭제 오류:', err);
      setStatusMessage(`삭제 실패: ${err.message || '오류가 발생했습니다.'}`);
    } finally {
      setIsApplying(false);
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
    if (listFileInputRef.current) {
      listFileInputRef.current.value = '';
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
      <div className="w-full h-full overflow-y-auto bg-stone-50">
        <div className="admin-page p-6 min-h-full flex items-center justify-center">
          <p>인증 상태를 확인하는 중입니다...</p>
        </div>
      </div>
    );
  }

  // 미로그인 또는 권한 없음(차단) 게이트 화면
  if (!isAuthorizedAdmin) {
    return (
      <div className="w-full h-full overflow-y-auto bg-stone-50">
        <div className="admin-login-gate p-6 max-w-md mx-auto min-h-full flex flex-col justify-center">
          <button
            type="button"
            onClick={handleGoBack}
            className="self-start mb-6 text-sm font-semibold text-stone-600 hover:text-black flex items-center space-x-1.5 px-3 py-1.5 rounded-xl hover:bg-stone-200/70 transition cursor-pointer"
          >
            <ArrowLeft size={16} />
            <span>다이어리로 돌아가기</span>
          </button>

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
      </div>
    );
  }

  // 관리자 대시보드 화면 (psrim2@gmail.com 로그인 완료 시)
  return (
    <div className="w-full h-full overflow-y-auto bg-stone-50 text-stone-900">
      <div className="admin-dashboard p-6 max-w-[1200px] w-full mx-auto min-h-full pb-20">
        {/* 상단 관리자 정보 및 로그아웃 */}
        <header className="admin-header flex items-center justify-between border-b pb-4 mb-6">
          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={handleGoBack}
              className="p-2 -ml-1 text-stone-600 hover:text-stone-900 hover:bg-stone-200/70 rounded-xl transition cursor-pointer flex items-center justify-center"
              title="다이어리로 돌아가기"
              aria-label="다이어리로 돌아가기"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-xl font-bold">꾸미기 에셋 관리자 대시보드</h1>
              <p className="text-sm text-stone-600">접속 계정: {user.email}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleGoBack}
              className="px-3.5 py-1.5 border border-stone-300 bg-white hover:bg-stone-100 text-stone-700 text-sm font-medium rounded-xl transition cursor-pointer"
            >
              다이어리로 이동
            </button>
            <button
              type="button"
              onClick={handleAdminLogout}
              className="px-3.5 py-1.5 border border-stone-400 bg-stone-100 hover:bg-stone-200 text-stone-800 text-sm font-medium rounded-xl transition cursor-pointer"
            >
              로그아웃
            </button>
          </div>
        </header>

      {/* [적용하기 / 취소] 액션 컨트롤 바 (상단 Sticky 고정) */}
      <section className="admin-action-bar sticky top-0 z-30 border p-4 mb-6 bg-white/95 backdrop-blur-xs shadow-sm flex flex-wrap items-center justify-between gap-3">
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
            <p
              className={`text-xs mt-1 font-semibold ${
                statusMessage.includes('실패') || statusMessage.includes('오류')
                  ? 'text-red-600'
                  : statusMessage.includes('완료')
                  ? 'text-green-700'
                  : 'text-stone-700'
              }`}
            >
              {statusMessage}
            </p>
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

      {/* 1. 카테고리 관리 섹션 (추가 및 삭제 가능한 스티커 하위 카테고리) */}
      <section className="admin-category-manage-section border p-4 mb-8 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h2 className="text-base font-bold">에셋 카테고리 관리</h2>
          {catMessage && (
            <span className="text-xs text-green-700 font-medium">
              {catMessage}
            </span>
          )}
        </div>
        <p className="text-xs text-stone-500 mb-3">
          날씨와 표정은 기본 고정 카테고리입니다. 스티커에 들어갈 하위 카테고리를 자유롭게 추가·삭제하고, 드래그하여 순서를 설정할 수 있습니다.
        </p>

        {/* 새 카테고리 추가 폼 */}
        <form
          onSubmit={handleAddCategory}
          className="flex flex-wrap items-end gap-2 mb-4 p-3 bg-stone-50 border border-stone-200 rounded"
        >
          <div>
            <label className="block text-xs font-semibold text-stone-600 mb-1">
              카테고리 이름 (예: 동물, 일상) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={newCatLabel}
              onChange={(e) => setNewCatLabel(e.target.value)}
              placeholder="예: 동물"
              className="border px-2.5 py-1.5 text-sm bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-stone-600 mb-1">
              영문 식별 ID (선택, 미입력 시 자동생성)
            </label>
            <input
              type="text"
              value={newCatId}
              onChange={(e) => setNewCatId(e.target.value.toLowerCase())}
              placeholder="예: animal"
              className="border px-2.5 py-1.5 text-sm bg-white"
            />
          </div>
          <button
            type="submit"
            disabled={isCatSubmitting || !newCatLabel.trim()}
            className="px-4 py-1.5 border border-black bg-black text-white text-sm font-medium disabled:opacity-40 cursor-pointer"
          >
            {isCatSubmitting ? '추가 중...' : '+ 카테고리 추가'}
          </button>
        </form>

        {/* 추가/삭제 가능한 스티커 하위 카테고리 목록 & 드래그 앤 드롭 순서 변경 */}
        <div>
          <h3 className="text-xs font-semibold text-stone-500 mb-2">
            스티커 카테고리 목록 ({customCategories.length}개) - 카드를 원하는 위치로 드래그하여 노출 순서를 변경할 수 있습니다
          </h3>
          <div className="flex flex-wrap gap-2">
            {customCategories.map((cat, index) => {
              const assetCount = decorations.filter((d) => d.category === cat.id).length;
              const isDragging = draggedCatIndex === index;
              const isOver = dragOverCatIndex === index && draggedCatIndex !== index;

              return (
                <div
                  key={cat.id}
                  data-cat-index={index}
                  draggable={true}
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDrop={(e) => handleDrop(e, index)}
                  onDragEnd={handleDragEnd}
                  onTouchStart={() => handleTouchStart(index)}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                  className={`flex items-center gap-1.5 px-3 py-2 bg-stone-100 border rounded text-xs text-stone-800 transition-all select-none cursor-grab active:cursor-grabbing ${
                    isDragging
                      ? 'opacity-40 ring-2 ring-stone-400 border-dashed border-stone-500 scale-95'
                      : isOver
                      ? 'ring-2 ring-black bg-stone-200 border-black scale-105 shadow-sm'
                      : 'border-stone-300 hover:border-stone-400 hover:bg-stone-50'
                  }`}
                  title="드래그하여 순서 변경"
                >
                  {/* 드래그 손잡이 아이콘 */}
                  <span className="text-stone-400 hover:text-black shrink-0">
                    <GripVertical size={13} />
                  </span>

                  {/* 순서 번호 */}
                  <span className="text-[11px] font-bold text-stone-400 shrink-0">
                    {index + 1}.
                  </span>

                  <span className="font-bold">{cat.label}</span>
                  <span className="text-stone-500">({cat.id})</span>
                  <span className="px-1.5 py-0.5 bg-white border border-stone-200 rounded-full text-[10px] text-stone-600 shrink-0">
                    {assetCount}개
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteCategory(cat);
                    }}
                    className="text-stone-400 hover:text-red-600 font-bold ml-1 p-0.5 transition cursor-pointer"
                    title={`${cat.label} 카테고리 삭제`}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 2. 에셋 목록 섹션 */}
      <section className="admin-list-section border p-4 bg-white">
        {/* 숨겨진 목록 전용 파일 인풋 */}
        <input
          ref={listFileInputRef}
          type="file"
          accept="image/gif,image/png,image/jpeg,image/webp,image/svg+xml,image/*"
          multiple
          onChange={handleListFileChange}
          className="hidden"
        />

        {/* 에셋 목록 상단 헤더: 전체 갯수만 표기 */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center space-x-2">
            <h2 className="text-base font-bold">
              에셋 목록
            </h2>
            <button
              type="button"
              onClick={() => setFilterCategory('all')}
              className={`text-xs px-2.5 py-0.5 rounded-full border transition cursor-pointer ${
                filterCategory === 'all'
                  ? 'bg-black text-white font-bold border-black'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200 border-stone-300'
              }`}
              title="클릭 시 전체 에셋 목록 보기"
            >
              전체 {decorations.length + pendingAdds.length}개
            </button>
          </div>
        </div>

        {/* (1) 카테고리 필터 탭: 날씨(고정), 표정(고정) 'ㅣ' 부분선 표시 후 에셋 카테고리에서 설정한 순서대로 나열 (아래 카테고리에서 '전체' 삭제) */}
        <div className="admin-category-filter flex items-center overflow-x-auto no-scrollbar whitespace-nowrap gap-1 pb-2 border-b max-w-full">
          {/* 날씨 (고정) */}
          <button
            type="button"
            onClick={() => setFilterCategory(filterCategory === 'weather' ? 'all' : 'weather')}
            className={`shrink-0 px-3 py-1 border text-xs cursor-pointer transition ${
              filterCategory === 'weather'
                ? 'bg-black text-white font-bold'
                : 'bg-white text-stone-700 hover:bg-stone-50'
            }`}
            title="날씨"
          >
            날씨
          </button>

          {/* 표정 (고정) */}
          <button
            type="button"
            onClick={() => setFilterCategory(filterCategory === 'emotion' ? 'all' : 'emotion')}
            className={`shrink-0 px-3 py-1 border text-xs cursor-pointer transition ${
              filterCategory === 'emotion'
                ? 'bg-black text-white font-bold'
                : 'bg-white text-stone-700 hover:bg-stone-50'
            }`}
            title="표정"
          >
            표정
          </button>

          {/* 'ㅣ' 부분선 (구분선) */}
          <span className="shrink-0 px-2 text-stone-300 font-bold select-none text-sm leading-none">
            |
          </span>

          {/* 에셋 카테고리에서 설정한 순서대로 나열 */}
          {customCategories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setFilterCategory(filterCategory === cat.id ? 'all' : cat.id)}
              className={`shrink-0 px-3 py-1 border text-xs cursor-pointer transition ${
                filterCategory === cat.id
                  ? 'bg-black text-white font-bold'
                  : 'bg-white text-stone-700 hover:bg-stone-50'
              }`}
              title={cat.label}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* (2) 카테고리와 아이템 목록 사이의 서브 컨트롤 바 (하위 개념) */}
        <div className="admin-list-sub-toolbar flex flex-wrap items-center justify-between gap-2 py-3 mb-4 border-b bg-stone-50/60 px-2 rounded">
          <div className="text-xs text-stone-600 font-medium">
            현재 카테고리:{' '}
            <span className="font-bold text-black">
              {filterCategory === 'all'
                ? '전체'
                : allCategories.find((c) => c.id === filterCategory)?.label || filterCategory}
            </span>
            <span className="text-stone-400 ml-1.5">
              ({filteredDecorations.length}개 등록됨)
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => listFileInputRef.current?.click()}
              disabled={isApplying}
              className="flex items-center px-3 py-1.5 border border-black bg-black text-white text-xs font-bold hover:bg-stone-800 transition cursor-pointer disabled:opacity-40"
              title={
                filterCategory !== 'all'
                  ? `'${allCategories.find((c) => c.id === filterCategory)?.label || filterCategory}' 카테고리로 바로 업로드`
                  : '에셋 파일 바로 업로드'
              }
            >
              <Upload size={13} className="mr-1.5" />
              + 파일 바로 업로드
            </button>

            <button
              type="button"
              onClick={handleDeleteAllFiltered}
              disabled={isApplying || filteredDecorations.length === 0}
              className="flex items-center px-3 py-1.5 border border-red-500 text-red-600 bg-white hover:bg-red-50 text-xs font-bold transition cursor-pointer disabled:opacity-30 disabled:hover:bg-white"
              title={
                filterCategory !== 'all'
                  ? `'${allCategories.find((c) => c.id === filterCategory)?.label || filterCategory}' 카테고리 에셋 전체 삭제`
                  : '현재 등록된 전체 에셋 삭제'
              }
            >
              <Trash2 size={13} className="mr-1.5" />
              아이템 전체 지우기 ({filteredDecorations.length}개)
            </button>
          </div>
        </div>

        {/* (3) 아이템 목록 (그리드) */}
        {isLoadingList ? (
          <p className="text-sm py-4">목록을 불러오는 중입니다...</p>
        ) : filteredPendingAdds.length === 0 && filteredDecorations.length === 0 ? (
          <p className="text-sm text-stone-500 py-8 text-center bg-stone-50 border border-dashed rounded">
            해당 카테고리에 등록된 에셋이 없습니다. 위의 [+ 파일 바로 업로드] 버튼을 눌러 등록해 주세요.
          </p>
        ) : (
          <ul className="admin-asset-grid grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
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
                      src={upgradePresetSvgUrl(item.previewUrl)}
                      alt={item.name}
                      style={{ imageRendering: '-webkit-optimize-contrast' }}
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
                    {allCategories.map((cat) => (
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
                        src={upgradePresetSvgUrl(item.imageUrl)}
                        alt={currentName}
                        style={{ imageRendering: '-webkit-optimize-contrast' }}
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
                      {allCategories.map((cat) => (
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
  </div>
  );
}
