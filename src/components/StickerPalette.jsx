import React, { useState, useEffect, useRef } from 'react';
import { Plus, Upload, Sparkles } from 'lucide-react';
import { subscribeToDecorations, uploadDecorationAsset, fileToDataUrl } from '../firebase';
import { PRESET_GIF_STICKERS } from '../constants/presetGifStickers';

const DECORATION_CATEGORIES = [
  { id: 'gif', label: '움직이는 GIF' },
  { id: 'sticker', label: '스티커' },
  { id: 'weather', label: '날씨' },
  { id: 'tape', label: '마스킹테이프' },
];

export default function StickerPalette({ isOpen, onClose, onAddSticker }) {
  const [selectedCategory, setSelectedCategory] = useState('gif');
  const [decorations, setDecorations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  // Firestore decorations 컬렉션 실시간 구독
  useEffect(() => {
    setIsLoading(true);
    const unsubscribe = subscribeToDecorations(
      (items) => {
        setDecorations(items);
        setIsLoading(false);
      },
      (err) => {
        console.error('[StickerPalette] decorations 불러오기 오류:', err);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // 사용자 기기에서 직접 GIF 또는 이미지 파일 선택 업로드
  const handleDirectUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      const isGif = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');
      const targetCategory = isGif || selectedCategory === 'gif' ? 'gif' : selectedCategory;

      // 1) 움직이는 GIF 애니메이션을 100% 보존하여 Data URL 또는 Storage 업로드
      let imageUrl = '';
      try {
        const uploadResult = await uploadDecorationAsset({
          file,
          category: targetCategory,
          name: file.name.replace(/\.[^/.]+$/, ''),
        });
        imageUrl = uploadResult?.imageUrl;
      } catch (uploadErr) {
        console.warn('[StickerPalette] 클라우드 업로드 폴백(로컬 Data URL):', uploadErr);
        imageUrl = await fileToDataUrl(file);
      }

      if (!imageUrl) {
        imageUrl = await fileToDataUrl(file);
      }

      // 2) 캔버스에 즉시 스티커로 배치
      onAddSticker({
        type: targetCategory,
        category: targetCategory,
        imageUrl,
        isGif,
        label: file.name.replace(/\.[^/.]+$/, ''),
      });

      onClose();
    } catch (err) {
      console.error('[StickerPalette] 파일 업로드 실패:', err);
      alert('스티커 이미지/GIF를 추가하는 중 오류가 발생했습니다: ' + (err.message || err));
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  if (!isOpen) return null;

  // 카테고리별 아이템 필터링
  let filteredItems = [];
  if (selectedCategory === 'gif') {
    // 움직이는 GIF 프리셋 + 사용자가 업로드한 gif 카테고리/확장자 에셋 결합
    const uploadedGifs = decorations.filter(
      (item) => item.category === 'gif' || item.isGif || item.fileName?.toLowerCase().endsWith('.gif')
    );
    filteredItems = [...PRESET_GIF_STICKERS, ...uploadedGifs];
  } else {
    filteredItems = decorations.filter(
      (item) => item.category === selectedCategory
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-xs p-0 sm:p-4 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="decoration-palette bg-white w-full sm:max-w-md border border-stone-200 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-slideUp sm:animate-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 상단 헤더 */}
        <div className="p-3.5 border-b border-stone-100 flex items-center justify-between bg-[#fafafa]">
          <div className="flex items-center space-x-2">
            <Sparkles size={16} className="text-stone-700" />
            <h3 className="font-bold text-sm text-stone-900">스티커 보관함</h3>
          </div>

          <div className="flex items-center space-x-2">
            {/* 직접 GIF / 이미지 추가 버튼 */}
            <input
              type="file"
              ref={fileInputRef}
              accept="image/gif,image/png,image/jpeg,image/webp,image/svg+xml,image/*"
              onChange={handleDirectUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="flex items-center space-x-1 px-2.5 py-1 text-xs bg-stone-900 hover:bg-black text-white rounded-lg font-medium active:scale-95 transition shadow-2xs disabled:opacity-50"
              title="내 기기에서 움직이는 GIF나 이미지 스티커를 직접 추가"
            >
              {isUploading ? (
                <span>등록 중...</span>
              ) : (
                <>
                  <Plus size={13} strokeWidth={2.5} />
                  <span>내 GIF/스티커 등록</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-2 py-1 text-xs text-stone-500 hover:text-stone-900 font-medium rounded-md hover:bg-stone-200/60 transition"
            >
              닫기
            </button>
          </div>
        </div>

        {/* 카테고리 필터 탭 (움직이는 GIF, 스티커, 날씨, 마스킹테이프) */}
        <div className="flex border-b border-stone-100 bg-[#f5f5f5]/60">
          {DECORATION_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={`flex-1 py-2.5 text-xs font-semibold border-b-2 transition-all ${
                selectedCategory === cat.id
                  ? 'border-black font-bold text-black bg-white shadow-2xs'
                  : 'border-transparent text-stone-400 hover:text-stone-700'
              }`}
            >
              {cat.label}
              {cat.id === 'gif' && (
                <span className="ml-1 text-[9px] px-1 py-0.2 bg-red-100 text-red-600 rounded font-bold">
                  GIF
                </span>
              )}
            </button>
          ))}
        </div>

        {/* 카테고리별 에셋 목록 */}
        <div className="p-4 overflow-y-auto max-h-[380px] no-scrollbar">
          {isLoading && selectedCategory !== 'gif' ? (
            <p className="text-xs text-stone-400 text-center py-8">
              에셋을 불러오는 중입니다...
            </p>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center space-y-2">
              <p className="text-xs text-stone-400">
                등록된 {DECORATION_CATEGORIES.find((c) => c.id === selectedCategory)?.label} 에셋이 없습니다.
              </p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs text-stone-700 underline font-semibold mt-1"
              >
                + 내 기기에서 직접 파일 추가하기
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-2.5">
              {filteredItems.map((item) => {
                const isGifItem =
                  item.category === 'gif' ||
                  item.isGif ||
                  item.fileName?.toLowerCase().endsWith('.gif');

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
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
                    className="p-2 border border-stone-200/80 rounded-xl hover:border-black hover:shadow-sm bg-white flex flex-col items-center justify-center space-y-1.5 transition active:scale-95 group relative"
                    title={item.name || item.fileName}
                  >
                    {isGifItem && (
                      <span className="absolute top-1 right-1 text-[8px] px-1 bg-stone-900/80 text-white rounded font-bold">
                        GIF
                      </span>
                    )}
                    <img
                      src={item.imageUrl}
                      alt={item.name || item.category}
                      className="w-12 h-12 object-contain group-hover:scale-105 transition-transform"
                    />
                    <span className="text-[10px] text-stone-600 truncate w-full text-center font-medium">
                      {item.name || item.fileName}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
