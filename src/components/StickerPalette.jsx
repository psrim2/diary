import React, { useState, useEffect } from 'react';
import { subscribeToDecorations } from '../firebase';

const DECORATION_CATEGORIES = [
  { id: 'sticker', label: '스티커' },
  { id: 'weather', label: '날씨' },
  { id: 'tape', label: '마스킹테이프' },
];

export default function StickerPalette({ isOpen, onClose, onAddSticker }) {
  const [selectedCategory, setSelectedCategory] = useState('sticker');
  const [decorations, setDecorations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

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

  if (!isOpen) return null;

  const filteredItems = decorations.filter(
    (item) => item.category === selectedCategory
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="decoration-palette bg-white w-full sm:max-w-md border border-stone-200 overflow-hidden flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 상단 헤더 */}
        <div className="p-3 border-b flex items-center justify-between">
          <h3 className="font-bold text-sm">꾸미기 보관함</h3>
          <button
            type="button"
            onClick={onClose}
            className="px-2 py-1 text-xs border"
          >
            닫기
          </button>
        </div>

        {/* 카테고리 필터 탭 (날씨, 스티커, 마스킹테이프) */}
        <div className="flex border-b">
          {DECORATION_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={`flex-1 py-2 text-xs font-medium border-b-2 ${
                selectedCategory === cat.id
                  ? 'border-black font-bold text-black'
                  : 'border-transparent text-stone-500'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* 카테고리별 에셋 목록 */}
        <div className="p-4 overflow-y-auto max-h-[360px]">
          {isLoading ? (
            <p className="text-xs text-stone-500 text-center py-6">
              에셋을 불러오는 중입니다...
            </p>
          ) : filteredItems.length === 0 ? (
            <p className="text-xs text-stone-500 text-center py-6">
              등록된 {DECORATION_CATEGORIES.find((c) => c.id === selectedCategory)?.label} 에셋이 없습니다.
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-3">
              {filteredItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onAddSticker({
                      decorationId: item.id,
                      type: item.category,
                      category: item.category,
                      imageUrl: item.imageUrl,
                      label: item.name || item.fileName || item.category,
                    });
                    onClose();
                  }}
                  className="p-2 border flex flex-col items-center justify-center space-y-1"
                  title={item.name || item.fileName}
                >
                  <img
                    src={item.imageUrl}
                    alt={item.name || item.category}
                    className="w-12 h-12 object-contain"
                  />
                  <span className="text-[10px] truncate w-full text-center">
                    {item.name || item.fileName}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
