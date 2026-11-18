import React from 'react';
import { PenTool, Edit2, Highlighter, Eraser, RotateCcw, RotateCw, Trash } from 'lucide-react';
import { PEN_TOOLS, PEN_COLORS } from '../constants';

export default function PenToolbar({
  activeTool,
  setActiveTool,
  penColor,
  setPenColor,
  penSize,
  setPenSize,
  onUndo,
  onRedo,
  onClear,
  canUndo,
  canRedo
}) {
  return (
    <div className="bg-stone-50/95 backdrop-blur border border-stone-200/90 rounded-2xl p-2.5 shadow-md flex flex-col space-y-2.5">
      {/* 펜 종류 선택 & 되돌리기 */}
      <div className="flex items-center justify-between space-x-1">
        <div className="flex items-center space-x-1 bg-stone-200/60 p-0.5 rounded-xl">
          {PEN_TOOLS.map((tool) => {
            const isSelected = activeTool === tool.id;
            const Icon =
              tool.id === 'pen'
                ? PenTool
                : tool.id === 'pencil'
                ? Edit2
                : tool.id === 'highlighter'
                ? Highlighter
                : Eraser;

            return (
              <button
                key={tool.id}
                onClick={() => {
                  setActiveTool(tool.id);
                  if (tool.size) setPenSize(tool.size);
                }}
                className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition ${
                  isSelected
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
                title={tool.name}
              >
                <Icon size={14} />
                <span className="hidden sm:inline">{tool.name}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center space-x-0.5">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className="p-1.5 rounded-lg text-stone-600 hover:bg-stone-200 disabled:opacity-30 disabled:hover:bg-transparent transition"
            title="실행 취소 (Undo)"
          >
            <RotateCcw size={15} />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            className="p-1.5 rounded-lg text-stone-600 hover:bg-stone-200 disabled:opacity-30 disabled:hover:bg-transparent transition"
            title="다시 실행 (Redo)"
          >
            <RotateCw size={15} />
          </button>
          <button
            onClick={onClear}
            className="p-1.5 rounded-lg text-stone-400 hover:text-red-500 hover:bg-red-50 transition"
            title="손글씨 전체 지우기"
          >
            <Trash size={15} />
          </button>
        </div>
      </div>

      {/* 색상 선택 팔레트 및 굵기 조절 (지우개가 아닐 때만) */}
      {activeTool !== 'eraser' && (
        <div className="flex items-center justify-between pt-1 border-t border-stone-200/50">
          {/* 컬러 스와치 */}
          <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar py-0.5">
            {PEN_COLORS.map((c) => (
              <button
                key={c.value}
                onClick={() => setPenColor(c.value)}
                className={`w-6 h-6 rounded-full transition-transform flex items-center justify-center ${
                  penColor === c.value ? 'scale-125 ring-2 ring-stone-700 ring-offset-1' : 'hover:scale-110'
                }`}
                style={{ backgroundColor: c.value }}
                title={c.name}
              />
            ))}
          </div>

          {/* 선 굵기 슬라이더 */}
          <div className="flex items-center space-x-2 pl-3">
            <span className="text-[10px] text-stone-500 font-medium">굵기</span>
            <input
              type="range"
              min={activeTool === 'highlighter' ? 8 : 1}
              max={activeTool === 'highlighter' ? 36 : 10}
              value={penSize}
              onChange={(e) => setPenSize(Number(e.target.value))}
              className="w-16 sm:w-20 accent-stone-700 cursor-pointer"
            />
          </div>
        </div>
      )}
    </div>
  );
}
