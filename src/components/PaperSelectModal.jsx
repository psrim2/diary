import React from 'react';
import { X, Check } from 'lucide-react';
import { PAPER_STYLES } from '../constants';

export default function PaperSelectModal({ isOpen, onClose, selectedStyle, onSelectStyle }) {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-xs p-0 sm:p-4 animate-fadeIn"
      onClick={onClose}
    >
      <div 
        className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col p-4 max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 상단 타이틀 */}
        <div className="flex items-center justify-between pb-3 border-b border-stone-100">
          <div>
            <h3 className="font-bold text-stone-800 text-sm sm:text-base">다이어리 속지 설정</h3>
            <p className="text-[11px] text-stone-400">마음에 드는 종이 질감을 선택해보세요</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-stone-100 text-stone-500 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* 속지 리스트 */}
        <div className="grid grid-cols-2 gap-3 py-4 overflow-y-auto">
          {PAPER_STYLES.map((style) => {
            const isSelected = selectedStyle === style.id;

            return (
              <button
                key={style.id}
                onClick={() => {
                  onSelectStyle(style.id);
                  onClose();
                }}
                className={`relative flex flex-col rounded-xl border-2 p-2.5 transition-all text-left group overflow-hidden ${
                  isSelected
                    ? 'border-amber-600 ring-2 ring-amber-500/20 shadow-sm'
                    : 'border-stone-200 hover:border-amber-300 shadow-2xs'
                }`}
              >
                {/* 미니 종이 텍스처 프리뷰 박스 */}
                <div 
                  className={`w-full h-16 rounded-lg border border-stone-300/60 mb-2 relative overflow-hidden ${style.class}`}
                >
                  {/* 왼쪽 바인더 링 프리뷰 */}
                  <div className="absolute left-1 top-1 bottom-1 w-2 flex flex-col justify-around">
                    <div className="w-1.5 h-1.5 rounded-full bg-stone-400/50" />
                    <div className="w-1.5 h-1.5 rounded-full bg-stone-400/50" />
                    <div className="w-1.5 h-1.5 rounded-full bg-stone-400/50" />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-stone-800">{style.name}</h4>
                    <span className="text-[10px] text-stone-400">{style.desc}</span>
                  </div>
                  {isSelected && (
                    <div className="w-5 h-5 rounded-full bg-amber-600 text-white flex items-center justify-center">
                      <Check size={12} />
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
