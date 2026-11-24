import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, Upload, Sparkles, X, Trash2 } from 'lucide-react';
import {
  subscribeToDecorations,
  subscribeToCategories,
  uploadDecorationAsset,
  deleteDecorationAsset,
  fileToDataUrl,
} from '../firebase';
import { PRESET_GIF_STICKERS } from '../constants/presetGifStickers';

// 기본 하위 카테고리 목록 (폴백용)
const BASE_CATEGORIES = [
  { id: 'sticker', label: '스티커' },
  { id: 'weather', label: '날씨' },
  { id: 'tape', label: '마스킹테이프' },
  { id: 'character', label: '캐릭터' },
  { id: 'emotion', label: '감정' },
  { id: 'daily', label: '일상' },
  { id: 'food', label: '음식' },
];

export default function StickerPalette({ isOpen, onClose, onAddSticker }) {
  const [selectedCategory, setSelectedCategory] = useState('sticker');
  const [decorations, setDecorations] = useState([]);
  const [categories, setCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const fileInputRef = useRef(null);

  // 로컬 개인화 스티커 보관 (MY 카테고리)
  const [myStickers, setMyStickers] = useState(() => {
    try {
      const raw = localStorage.getItem('analog_my_stickers');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const saveMyStickers = (list) => {
    setMyStickers(list);
    try {
      localStorage.setItem('analog_my_stickers', JSON.stringify(list));
    } catch (e) {
      console.error('내 스티커 저장 실패:', e);
    }
  };

  // Firestore decorations 및 categories 컬렉션 실시간 구독
  useEffect(() => {
    setIsLoading(true);
    const unsubDecorations = subscribeToDecorations(
      (items) => {
        setDecorations(items);
        setIsLoading(false);
      },
      (err) => {
        console.error('[StickerPalette] decorations 불러오기 오류:', err);
        setIsLoading(false);
      }
    );

    const unsubCategories = subscribeToCategories(
      (cats) => {
        setCategories(cats);
      },
      (err) => {
        console.error('[StickerPalette] categories 불러오기 오류:', err);
      }
    );

    return () => {
      unsubDecorations();
      unsubCategories();
    };
  }, []);

  // 동적 카테고리 탭 생성 (MY가 항상 맨 앞, 그 뒤에 구독된 카테고리들)
  const allCategories = useMemo(() => {
    const list = [{ id: 'my', label: 'MY' }];
    const sourceCats = categories.length > 0 ? categories : BASE_CATEGORIES;
    const existingIds = new Set(['my']);

    sourceCats.forEach((cat) => {
      if (!existingIds.has(cat.id)) {
        existingIds.add(cat.id);
        list.push({ id: cat.id, label: cat.label });
      }
    });

    // 등록된 에셋 중 카테고리 마스터에 없는 레거시 항목 추가
    decorations.forEach((d) => {
      if (d.category && !existingIds.has(d.category) && d.category !== 'gif') {
        existingIds.add(d.category);
        list.push({ id: d.category, label: d.category });
      }
    });

    return list;
  }, [categories, decorations]);

  // 현재 선택된 카테고리가 삭제된 경우 안전하게 'sticker' 또는 첫 번째 탭으로 이동
  useEffect(() => {
    if (allCategories.length > 0 && !allCategories.some((c) => c.id === selectedCategory)) {
      setSelectedCategory(allCategories[1]?.id || allCategories[0].id);
    }
  }, [allCategories, selectedCategory]);

  // 사용자 기기에서 직접 파일 선택 시: MY 카테고리로 등록
  const handleDirectUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      const isGif = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');
      const stickerName = file.name.replace(/\.[^/.]+$/, '');

      let imageUrl = '';
      let cloudId = null;
      try {
        const uploadResult = await uploadDecorationAsset({
          file,
          category: 'my',
          name: stickerName,
        });
        imageUrl = uploadResult?.imageUrl;
        cloudId = uploadResult?.id;
      } catch (uploadErr) {
        console.warn('[StickerPalette] 클라우드 업로드 폴백(로컬 Data URL):', uploadErr);
        imageUrl = await fileToDataUrl(file);
      }

      if (!imageUrl) {
        imageUrl = await fileToDataUrl(file);
      }

      const newMySticker = {
        id: cloudId || `my-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: stickerName,
        fileName: file.name,
        category: 'my',
        imageUrl,
        isGif,
        isPersonal: true,
        createdAtMs: Date.now(),
      };

      saveMyStickers([newMySticker, ...myStickers.filter(s => s.id !== newMySticker.id)]);
      setSelectedCategory('my');
      setIsDeleteMode(false);
    } catch (err) {
      console.error('[StickerPalette] 파일 업로드 실패:', err);
      alert('스티커 등록 중 오류가 발생했습니다: ' + (err.message || err));
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // 롱프레스(꾹 누르기)로 삭제 모드 토글
  const longPressTimerRef = useRef(null);
  const isLongPressActiveRef = useRef(false);

  const handlePressStart = (item) => {
    if (selectedCategory !== 'my') return;
    isLongPressActiveRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      isLongPressActiveRef.current = true;
      setIsDeleteMode(true);
    }, 450); // 450ms 꾹 누르면 삭제 버튼 표시
  };

  const handlePressEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  // MY 스티커 개별 삭제
  const handleDeleteMySticker = async (e, item) => {
    e.stopPropagation();
    if (!window.confirm(`"${item.name || '스티커'}"를 삭제하시겠습니까?`)) return;

    const nextList = myStickers.filter(s => s.id !== item.id && s.imageUrl !== item.imageUrl);
    saveMyStickers(nextList);

    try {
      await deleteDecorationAsset(item);
    } catch (err) {
      console.warn('[StickerPalette] 클라우드 스티커 삭제 오류:', err);
    }
  };

  if (!isOpen) return null;

  // 카테고리별 에셋 필터링
  let filteredItems = [];
  if (selectedCategory === 'my') {
    const cloudMy = decorations.filter(d => d.category === 'my' || d.isPersonal);
    const mergedMap = new Map();
    myStickers.forEach(s => mergedMap.set(s.id, s));
    cloudMy.forEach(s => {
      if (!mergedMap.has(s.id)) {
        mergedMap.set(s.id, s);
      }
    });
    filteredItems = Array.from(mergedMap.values());
  } else if (selectedCategory === 'sticker') {
    // 일반 스티커 카테고리: 프리셋 GIF/애니메이션 스티커 + Firestore 스티커 에셋 결합
    const cloudStickers = decorations.filter(
      (item) => item.category === 'sticker' || (!item.category && !item.isPersonal)
    );
    filteredItems = [...PRESET_GIF_STICKERS, ...cloudStickers];
  } else {
    filteredItems = decorations.filter(
      (item) => item.category === selectedCategory
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-xs p-0 sm:p-4 animate-fadeIn"
      onClick={() => {
        setIsDeleteMode(false);
        onClose();
      }}
    >
      {/* 1. 세로 사이즈 고정: 70vh */}
      <div
        className="decoration-palette bg-white w-full sm:max-w-md border border-stone-200 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[70vh] max-h-[70vh] animate-slideUp sm:animate-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 상단 헤더 */}
        <div className="p-3.5 border-b border-stone-100 flex items-center justify-between bg-[#fafafa] shrink-0">
          <div className="flex items-center space-x-2">
            <Sparkles size={16} className="text-stone-700" />
            <h3 className="font-bold text-sm text-stone-900">스티커 보관함</h3>
          </div>

          <div className="flex items-center space-x-2">
            {/* 직접 GIF / 이미지 추가 input (MY 카테고리 전용) */}
            <input
              type="file"
              ref={fileInputRef}
              accept="image/gif,image/png,image/jpeg,image/webp,image/svg+xml,image/*"
              onChange={handleDirectUpload}
              className="hidden"
            />
            {/* 내 스티커 등록은 MY 카테고리에서만 노출 (나머지는 어드민에서 관리) */}
            {selectedCategory === 'my' && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="flex items-center space-x-1 px-2.5 py-1 text-xs bg-stone-900 hover:bg-black text-white rounded-lg font-medium active:scale-95 transition shadow-2xs disabled:opacity-50 cursor-pointer"
                title="내 기기에서 직접 스티커/GIF를 추가하여 MY 카테고리에 등록"
              >
                {isUploading ? (
                  <span>등록 중...</span>
                ) : (
                  <>
                    <Plus size={13} strokeWidth={2.5} />
                    <span>내 스티커 등록</span>
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setIsDeleteMode(false);
                onClose();
              }}
              className="px-2 py-1 text-xs text-stone-500 hover:text-stone-900 font-medium rounded-md hover:bg-stone-200/60 transition cursor-pointer"
            >
              닫기
            </button>
          </div>
        </div>

        {/* 2. 하위 카테고리 탭: 가로 스크롤 지원 (카테고리 확장 시 유연하게 노출) */}
        <div className="flex border-b border-stone-100 bg-[#f5f5f5]/60 overflow-x-auto no-scrollbar scroll-smooth whitespace-nowrap px-2.5 py-1.5 gap-1 shrink-0">
          {allCategories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => {
                setSelectedCategory(cat.id);
                setIsDeleteMode(false);
              }}
              className={`shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                selectedCategory === cat.id
                  ? 'font-bold text-black bg-white shadow-2xs border border-stone-200/80'
                  : 'text-stone-400 hover:text-stone-700 hover:bg-stone-200/50'
              }`}
            >
              {cat.label}
              {cat.id === 'my' && filteredItems.length > 0 && selectedCategory === 'my' && (
                <span className="ml-1 text-[10px] px-1.5 py-0.2 bg-stone-200 text-stone-800 rounded-full font-bold">
                  {filteredItems.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* MY 스티커 삭제 모드 안내 배너 */}
        {selectedCategory === 'my' && isDeleteMode && (
          <div className="flex items-center justify-between px-4 py-1.5 bg-red-50 border-b border-red-200 text-xs text-red-600 shrink-0">
            <span>스티커의 빨간 X 버튼을 눌러 삭제할 수 있습니다</span>
            <button
              type="button"
              onClick={() => setIsDeleteMode(false)}
              className="font-bold underline text-red-700 ml-2 cursor-pointer"
            >
              완료
            </button>
          </div>
        )}

        {/* 카테고리별 에셋 그리드 목록 (고정 높이 내 flex-1 스크롤) */}
        <div className="p-4 overflow-y-auto flex-1 no-scrollbar">
          {isLoading && selectedCategory !== 'my' && selectedCategory !== 'sticker' ? (
            <p className="text-xs text-stone-400 text-center py-8">
              에셋을 불러오는 중입니다...
            </p>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center space-y-2">
              <p className="text-xs text-stone-400">
                {selectedCategory === 'my'
                  ? '등록된 내 스티커가 없습니다.'
                  : `등록된 ${allCategories.find((c) => c.id === selectedCategory)?.label || ''} 에셋이 없습니다.`}
              </p>
              {selectedCategory === 'my' ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-stone-800 underline font-semibold mt-1 cursor-pointer hover:text-black"
                >
                  + 내 기기에서 직접 스티커 추가하기
                </button>
              ) : (
                <p className="text-[11px] text-stone-400 mt-0.5">
                  해당 카테고리는 관리자 페이지에서 에셋을 등록하고 관리합니다.
                </p>
              )}
            </div>
          ) : (
            <>
              {selectedCategory === 'my' && !isDeleteMode && (
                <p className="text-[11px] text-stone-400 text-center mb-2.5">
                  스티커를 꾹~ 누르면 삭제할 수 있어요
                </p>
              )}
              <div className="grid grid-cols-4 gap-2.5">
                {/* MY 카테고리일 때 첫 번째 슬롯에 직관적인 + 추가 버튼 노출 */}
                {selectedCategory === 'my' && !isDeleteMode && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="w-full p-2 border-2 border-dashed border-stone-300 hover:border-black rounded-xl bg-stone-50 hover:bg-white flex flex-col items-center justify-center space-y-1.5 transition active:scale-95 group cursor-pointer"
                    title="내 기기에서 새 스티커 추가"
                  >
                    <div className="w-10 h-10 rounded-full bg-stone-200/80 flex items-center justify-center text-stone-600 group-hover:bg-black group-hover:text-white transition-colors">
                      <Plus size={18} strokeWidth={2.5} />
                    </div>
                    <span className="text-[10px] text-stone-600 font-bold truncate w-full text-center">
                      스티커 추가
                    </span>
                  </button>
                )}
                {filteredItems.map((item) => {
                  const isGifItem =
                    item.category === 'gif' ||
                    item.isGif ||
                    item.fileName?.toLowerCase().endsWith('.gif') ||
                    item.imageUrl?.startsWith('data:image/svg+xml');

                  return (
                    <div
                      key={item.id}
                      className="relative"
                    >
                      <button
                        type="button"
                        onTouchStart={() => handlePressStart(item)}
                        onTouchEnd={handlePressEnd}
                        onMouseDown={() => handlePressStart(item)}
                        onMouseUp={handlePressEnd}
                        onMouseLeave={handlePressEnd}
                        onClick={() => {
                          if (isLongPressActiveRef.current) return;
                          if (isDeleteMode) return;
                          onAddSticker({
                            decorationId: item.id,
                            type: item.category || 'sticker',
                            category: item.category || 'sticker',
                            imageUrl: item.imageUrl,
                            isGif: isGifItem,
                            label: item.name || item.fileName || item.category,
                          });
                          onClose();
                        }}
                        className={`w-full p-2 border border-stone-200/80 rounded-xl hover:border-black hover:shadow-xs bg-white flex flex-col items-center justify-center space-y-1.5 transition active:scale-95 group cursor-pointer relative ${
                          isDeleteMode && selectedCategory === 'my' ? 'animate-pulse' : ''
                        }`}
                        title={item.name || item.fileName}
                      >
                        {/* 4. GIF 카테고리 따로 분류 없이 스티커에 GIF 뱃지 표시 */}
                        {isGifItem && (
                          <span className="absolute top-1 right-1 text-[8px] px-1 bg-stone-900/80 text-white rounded font-bold pointer-events-none">
                            GIF
                          </span>
                        )}
                        <img
                          src={item.imageUrl}
                          alt={item.name || item.category}
                          className="w-12 h-12 object-contain group-hover:scale-105 transition-transform select-none pointer-events-none"
                        />
                        <span className="text-[10px] text-stone-600 truncate w-full text-center font-medium select-none">
                          {item.name || item.fileName}
                        </span>
                      </button>

                      {/* 3. MY 스티커 삭제 버튼 (롱프레스 시 표시) */}
                      {selectedCategory === 'my' && isDeleteMode && (
                        <button
                          type="button"
                          onClick={(e) => handleDeleteMySticker(e, item)}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-md active:scale-90 transition z-20 cursor-pointer"
                          title="삭제"
                        >
                          <X size={12} strokeWidth={3} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
