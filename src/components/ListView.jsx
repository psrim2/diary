import React, { useState, useRef, useEffect } from 'react';
import { Search, Trash2, X, Plus } from 'lucide-react';
import { PAPER_STYLES } from '../constants';
import { normalizeDiaryLayers, buildStrokeBands, StrokeBandCanvas, CANONICAL_WIDTH, CANONICAL_HEIGHT, resolveStickerImage, isEmojiSticker, upgradePresetSvgUrl } from '../utils/canvasLayers';
import DatePickerModal from './DatePickerModal';
import { triggerHaptic } from '../utils/haptics';
import { getKoreanHoliday } from '../utils/holidays';

const MONTH_NAMES_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const DAY_NAMES_EN = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

// 낱개 독립 슬라이딩 삭제 카드 컴포넌트
function DiaryCard({ diary, onSelect, onDelete, isSelected, isSwipeOpen, onSwipeOpen, onSwipeClose }) {
  const [translateX, setTranslateX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const currentDeltaXRef = useRef(0);
  const isHorizontalRef = useRef(false);
  const wasDraggingRef = useRef(false);
  const canvasRef = useRef(null);

  // 외부(스크롤 등)에서 스와이프 닫힘 요청 시 부드럽게 원복
  useEffect(() => {
    if (!isSwipeOpen && translateX !== 0 && !isSwiping) {
      setTranslateX(0);
    } else if (isSwipeOpen && translateX !== -90 && !isSwiping) {
      setTranslateX(-90);
    }
  }, [isSwipeOpen, isSwiping]);

  // 날짜 안전 파싱
  const dateParts = diary?.date ? String(diary.date).split('-') : [];
  const year = dateParts[0] && !isNaN(parseInt(dateParts[0], 10)) ? parseInt(dateParts[0], 10) : 2026;
  const month = dateParts[1] && !isNaN(parseInt(dateParts[1], 10)) ? parseInt(dateParts[1], 10) - 1 : 10;
  const day = dateParts[2] && !isNaN(parseInt(dateParts[2], 10)) ? parseInt(dateParts[2], 10) : 17;

  const dateObj = new Date(year, month, day);
  const dayNum = String(isNaN(day) ? 17 : day).padStart(2, '0');
  const dayEn = DAY_NAMES_EN[isNaN(dateObj.getDay()) ? 0 : dateObj.getDay()] || 'WED';
  const now = new Date();
  const localTodayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const isToday = diary?.date === localTodayStr;
  const rawMood = upgradePresetSvgUrl(diary?.thumbnailMood || diary?.weather || '');
  let mood = '';
  if (typeof rawMood === 'string' || typeof rawMood === 'number') {
    mood = upgradePresetSvgUrl(String(rawMood));
  } else if (rawMood && typeof rawMood === 'object') {
    mood = upgradePresetSvgUrl(rawMood.icon || rawMood.imageUrl || rawMood.content || rawMood.label || '');
  }
  const isMoodImage =
    typeof mood === 'string' &&
    (mood.startsWith('data:') ||
      mood.startsWith('http://') ||
      mood.startsWith('https://') ||
      mood.startsWith('/') ||
      mood.startsWith('blob:'));
  const paperClass = PAPER_STYLES.find(p => p.id === diary.paperStyle)?.class || 'paper-minimal-lined';

  const normalizedLayers = React.useMemo(() => normalizeDiaryLayers(diary), [diary]);
  const strokeBands = React.useMemo(
    () =>
      buildStrokeBands(
        normalizedLayers.strokes,
        normalizedLayers.textBlocks,
        normalizedLayers.stickers
      ),
    [normalizedLayers]
  );

  // 작성된 컨텐츠(손글씨, 텍스트, 스티커)의 실제 세로 최대 범위 계산
  // - 불필요한 아래쪽 빈 종이 여백을 없애고 작성된 내용만 딱 나오도록 카드 세로 크기 동적 최적화
  const canonicalContentHeight = React.useMemo(() => {
    let maxY = 0;
    let hasContent = false;

    // 1) 텍스트 블록 바닥 계산
    (normalizedLayers.textBlocks || []).forEach((block) => {
      if (block.text && block.text.trim()) {
        hasContent = true;
        const fontSz = typeof block.fontSize === 'number' ? block.fontSize : 18;
        const blockW = typeof block.width === 'number' ? block.width : CANONICAL_WIDTH;
        const charsPerLine = Math.max(8, Math.floor(blockW / (fontSz * 0.65)));
        const paragraphs = (block.text || '').split('\n');
        let totalLines = 0;
        paragraphs.forEach(p => {
          totalLines += Math.max(1, Math.ceil((p.length || 1) / charsPerLine));
        });
        const approxHeight = Math.max(28, totalLines * fontSz * 1.5) * (block.scale || 1);
        const bottom = (block.y || 0) + approxHeight;
        if (bottom > maxY) maxY = bottom;
      }
    });

    // 2) 스티커/사진 바닥 계산 (실제 렌더링 가능한 유효 스티커만 포함하여 미표출 스티커로 인한 여백 방지)
    (normalizedLayers.stickers || []).forEach((sticker) => {
      const resolvedImg = resolveStickerImage(sticker);
      const isTape = sticker.type === 'tape' || sticker.category === 'tape';
      const isEmoji = isEmojiSticker(sticker);
      if (!resolvedImg && !isTape && !isEmoji) return;

      hasContent = true;
      const isPhoto = sticker.isPhoto || sticker.type === 'photo';
      const defaultH = isPhoto ? 140 : isTape ? 24 : 56;
      const baseH = isPhoto
        ? Math.min(180, typeof sticker.height === 'number' && sticker.height > 0 ? sticker.height : defaultH)
        : isTape
        ? Math.min(28, typeof sticker.height === 'number' && sticker.height > 0 ? sticker.height : defaultH)
        : Math.min(56, typeof sticker.height === 'number' && sticker.height > 0 ? sticker.height : defaultH);
      const scale = sticker.scale || 1;
      // transform-origin: center center 확대이므로 실제 시각적 바닥선은 center + (baseH * scale) / 2
      const bottom = (sticker.y || 0) + (baseH + baseH * scale) / 2;
      if (bottom > maxY) maxY = bottom;
    });

    // 3) 지우개 획 영역 감지 (지워진 선 아래쪽의 유령 좌표 제외용)
    const eraserStrokes = (normalizedLayers.strokes || []).filter((s) => s.tool === 'eraser');
    const eraserBoxes = eraserStrokes.map((s) => {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, strokeMaxY = -Infinity;
      (s.points || []).forEach((p) => {
        if (typeof p.x === 'number' && typeof p.y === 'number') {
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.y > strokeMaxY) strokeMaxY = p.y;
        }
      });
      const radius = (s.size || 20) + 16;
      return { minX: minX - radius, maxX: maxX + radius, minY: minY - radius, maxY: strokeMaxY + radius };
    });

    // 4) 유효한 손글씨 스트로크 바닥 계산 (지우개 획 및 오작동 팜 터치 점 제외)
    // - 보이지 않는 투명/흰색 잉크 제외
    // - 본문과 동떨어진 팜 터치 노이즈 점 제외
    const validDrawStrokes = (normalizedLayers.strokes || []).filter((s) => {
      if (s.tool === 'eraser') return false;
      const c = (s.color || '').toLowerCase().trim();
      if (c === '#ffffff' || c === '#fff' || c === 'white' || c === 'transparent') return false;
      return Array.isArray(s.points) && s.points.length > 0;
    });

    const analyzedStrokes = validDrawStrokes.map((stroke) => {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, strokeMaxY = -Infinity;
      let pathLen = 0;
      let unErasedPoints = 0;

      for (let i = 0; i < stroke.points.length; i++) {
        const pt = stroke.points[i];
        if (typeof pt.x === 'number' && typeof pt.y === 'number' && !isNaN(pt.y)) {
          const isErased = eraserBoxes.some(
            (b) => pt.x >= b.minX && pt.x <= b.maxX && pt.y >= b.minY && pt.y <= b.maxY
          );
          if (!isErased) {
            unErasedPoints++;
            if (pt.x < minX) minX = pt.x;
            if (pt.x > maxX) maxX = pt.x;
            if (pt.y < minY) minY = pt.y;
            if (pt.y > strokeMaxY) strokeMaxY = pt.y;
            if (i > 0) {
              const prev = stroke.points[i - 1];
              pathLen += Math.hypot(pt.x - prev.x, pt.y - prev.y);
            }
          }
        }
      }

      const isSubstantial = unErasedPoints >= 3 && (pathLen > 10 || (strokeMaxY - minY) > 6);
      return {
        stroke,
        unErasedPoints,
        pathLen,
        minY,
        strokeMaxY,
        isSubstantial,
      };
    }).filter((s) => s.unErasedPoints > 0 && isFinite(s.minY) && isFinite(s.strokeMaxY));

    // 유의미한 본문 컨텐츠(텍스트, 스티커, 실질적 필기 획)의 최대 바닥선 계산
    let coreMaxY = maxY;
    analyzedStrokes.forEach((s) => {
      if (s.isSubstantial) {
        hasContent = true;
        if (s.strokeMaxY > coreMaxY) coreMaxY = s.strokeMaxY;
      }
    });

    // 팜 터치 및 고립된 아웃라이어 스트로크 필터링:
    // 본문 컨텐츠(coreMaxY)와 50px 이상 동떨어져 있으면서 점 개수가 적거나 길이가 짧은 획은 팜 터치 노이즈로 간주
    analyzedStrokes.forEach((s) => {
      if (coreMaxY > 0) {
        if (s.minY > coreMaxY + 50 && (s.unErasedPoints <= 8 || s.pathLen < 25)) {
          return;
        }
        if (s.strokeMaxY <= coreMaxY + 45 || s.isSubstantial) {
          hasContent = true;
          if (s.strokeMaxY > maxY) maxY = s.strokeMaxY;
        }
      } else {
        hasContent = true;
        if (s.strokeMaxY > maxY) maxY = s.strokeMaxY;
      }
    });

    if (coreMaxY > maxY) maxY = coreMaxY;

    if (!hasContent || maxY <= 0) {
      // 작성된 컨텐츠가 거의 없는 경우: 최소 높이 128px (줄노트 4줄 규격)로 아담하게 표시
      return 128;
    }

    // 작성된 내용 바로 아래 불필요한 줄노트 빈 여백 없이 깔끔하게 12px 여백 마감
    const targetH = Math.max(120, Math.ceil((maxY + 12) / 16) * 16);
    return targetH;
  }, [normalizedLayers, diary?.date]);

  const cardPaperRef = useRef(null);
  const [previewScale, setPreviewScale] = useState(0.85);

  useEffect(() => {
    const el = cardPaperRef.current;
    if (!el) return;
    const updatePreviewScale = () => {
      const w = el.clientWidth;
      if (w > 0) {
        setPreviewScale(Math.min(2.5, Math.max(0.4, Number((w / CANONICAL_WIDTH).toFixed(3)))));
      }
    };
    updatePreviewScale();
    const ro = new ResizeObserver(updatePreviewScale);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 터치 제스처
  const handleTouchStart = (e) => {
    // 주의: touchstart에서 e.stopPropagation()을 호출하면 부모 목록의 네이티브 세로 스크롤 제스처 초기화가 차단됨
    startXRef.current = e.touches[0].clientX;
    startYRef.current = e.touches[0].clientY;
    currentDeltaXRef.current = 0;
    isHorizontalRef.current = false;
    wasDraggingRef.current = false;
    setIsSwiping(false);
  };

  const handleTouchMove = (e) => {
    const deltaX = e.touches[0].clientX - startXRef.current;
    const deltaY = e.touches[0].clientY - startYRef.current;

    if (!isHorizontalRef.current) {
      if (Math.abs(deltaX) > 8 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
        isHorizontalRef.current = true;
        wasDraggingRef.current = true;
        setIsSwiping(true);
      } else if (Math.abs(deltaY) > 8) {
        return;
      }
    }

    if (isHorizontalRef.current) {
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      // 카드는 왼쪽(삭제)으로만 밀리며, -90px를 넘길 때 과도한 오버드래그 및 튕김 방지
      let clampedX = 0;
      if (deltaX < 0) {
        if (deltaX >= -90) {
          clampedX = deltaX;
        } else {
          clampedX = -90 + (deltaX + 90) * 0.15;
          clampedX = Math.max(-96, clampedX);
        }
      }
      currentDeltaXRef.current = clampedX;
      setTranslateX(clampedX);
    }
  };

  const handleTouchEnd = (e) => {
    if (!isHorizontalRef.current) return;
    e.stopPropagation();

    const deltaX = currentDeltaXRef.current;
    if (deltaX < -35) {
      setTranslateX(-90);
      onSwipeOpen();
      triggerHaptic('light');
    } else {
      setTranslateX(0);
      onSwipeClose();
    }
    setIsSwiping(false);
    isHorizontalRef.current = false;
    setTimeout(() => { wasDraggingRef.current = false; }, 180);
  };

  // 마우스 제스처
  const handleMouseDown = (e) => {
    startXRef.current = e.clientX;
    startYRef.current = e.clientY;
    currentDeltaXRef.current = 0;
    isHorizontalRef.current = false;
    wasDraggingRef.current = false;
    setIsSwiping(false);

    const handleMouseMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startXRef.current;
      const deltaY = moveEvent.clientY - startYRef.current;

      if (!isHorizontalRef.current && Math.abs(deltaX) > 6) {
        isHorizontalRef.current = true;
        wasDraggingRef.current = true;
        setIsSwiping(true);
      }

      if (isHorizontalRef.current) {
        let clampedX = 0;
        if (deltaX < 0) {
          if (deltaX >= -90) {
            clampedX = deltaX;
          } else {
            clampedX = -90 + (deltaX + 90) * 0.15;
            clampedX = Math.max(-96, clampedX);
          }
        }
        currentDeltaXRef.current = clampedX;
        setTranslateX(clampedX);
      }
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);

      if (isHorizontalRef.current) {
        if (currentDeltaXRef.current < -35) {
          setTranslateX(-90);
          onSwipeOpen();
          triggerHaptic('light');
        } else {
          setTranslateX(0);
          onSwipeClose();
        }
        setIsSwiping(false);
        isHorizontalRef.current = false;
        setTimeout(() => { wasDraggingRef.current = false; }, 180);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div 
      className={`relative rounded-3xl transition-all duration-250 select-none ${
        isDeleting ? 'max-h-0 opacity-0 mb-0 py-0 overflow-hidden' : 'mb-4'
      }`}
    >
      {/* [뒷면 삭제 액션: 고정 후 직접 클릭 시에만 삭제] */}
      <div 
        className="absolute inset-y-0 right-0 w-24 flex items-center justify-center cursor-pointer z-0 pr-2"
        onClick={(e) => {
          e.stopPropagation();
          setIsDeleting(true);
          setTimeout(() => {
            onDelete(diary.id);
            onSwipeClose();
          }, 200);
        }}
        title="일기 삭제"
      >
        <div className="flex flex-col items-center space-y-1 text-red-500 hover:text-red-600 transition-colors p-2 active:scale-95">
          <Trash2 size={22} strokeWidth={2.3} />
          <span className="text-[11px] font-bold tracking-tight">삭제</span>
        </div>
      </div>

      {/* [앞면: 박스 묶음 전체 슬라이딩 (배경 삭제 버튼 z-0 위에 위치하되 sticky 헤더 z-30 아래로 슬라이드되도록 z-[1] 적용)] */}
      <div
        style={{
          transform: `translateX(${translateX}px)`,
          transition: isSwiping ? 'none' : 'transform 0.22s cubic-bezier(0.25, 1, 0.5, 1)',
        }}
        className={`relative z-[1] bg-white rounded-3xl p-4 sm:p-5 shadow-xs cursor-pointer touch-pan-y ${
          isSelected
            ? 'border border-stone-200/90 lg:border-2 lg:border-black lg:shadow-sm'
            : 'border border-stone-200/90'
        }`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onClick={(e) => {
          if (wasDraggingRef.current) {
            wasDraggingRef.current = false;
            return;
          }
          if (isSwipeOpen || translateX !== 0) {
            setTranslateX(0);
            onSwipeClose();
            return;
          }
          onSelect(diary);
        }}
      >
        {/* 박스 상단 헤더: [15 SUN] ──────── [대표 스티커] */}
        <div className="flex items-center justify-between pb-3">
          <div className="flex items-center">
            <div className="relative inline-flex items-center">
              <span className="text-xl sm:text-2xl font-black text-black tracking-tight leading-none">
                {dayNum}
              </span>
              {isToday && (
                <span className="absolute -top-0.5 -right-1.5 w-1.5 h-1.5 rounded-full bg-black block select-none pointer-events-none" />
              )}
            </div>
            <span className="text-xl sm:text-2xl font-black text-black tracking-tight leading-none ml-2">
              {dayEn}
            </span>
          </div>
          {isMoodImage ? (
            <img
              src={mood}
              alt=""
              className="w-9 h-9 object-contain select-none overflow-visible p-0.5"
            />
          ) : mood ? (
            <span className="text-2xl select-none filter drop-shadow-2xs">
              {mood}
            </span>
          ) : null}
        </div>

        {/* 박스 본문: 라운드 박스 없이 상단 1px solid #222 구분선 적용 */}
        <div ref={cardPaperRef} className="w-full border-t border-[#222] pt-2.5 overflow-hidden flex justify-center">
          <div
            style={{
              width: `${CANONICAL_WIDTH * previewScale}px`,
              height: `${canonicalContentHeight * previewScale}px`,
            }}
            className="relative shrink-0 overflow-hidden"
          >
            <div
              style={{
                width: `${CANONICAL_WIDTH}px`,
                height: `${canonicalContentHeight}px`,
                transform: `scale(${previewScale})`,
                transformOrigin: 'top left',
              }}
              className={`absolute top-0 left-0 ${paperClass} overflow-hidden`}
            >
              {/* 생성 순서(layerOrder)별 드로잉 밴드 캔버스 */}
              {strokeBands.map((band) => (
                <StrokeBandCanvas
                  key={band.id}
                  band={band}
                  width={CANONICAL_WIDTH}
                  height={canonicalContentHeight}
                />
              ))}

              {/* 텍스트 블록 전체 (인스타그램 스토리 스타일 배지 및 정렬, 작성된 절대 위치 완벽 반영) */}
              {normalizedLayers.textBlocks?.map((block, idx) => {
                let bgClass = '';
                let textColor = block.color || '#111111';
                let customBgStyle = undefined;

                if (block.bgStyle === 'light') {
                  bgClass = 'bg-white/95 text-stone-900 rounded-2xl shadow-sm px-3.5 py-1.5';
                } else if (block.bgStyle === 'dark') {
                  bgClass = 'bg-black/90 text-white rounded-2xl shadow-sm px-3.5 py-1.5';
                  textColor = '#ffffff';
                } else if (block.bgStyle === 'color') {
                  bgClass = 'text-white rounded-2xl shadow-sm px-3.5 py-1.5';
                  customBgStyle = { backgroundColor: block.color || '#111111' };
                  textColor = '#ffffff';
                }

                return (
                  <div
                    key={block.id || `tb-${idx}`}
                    style={{
                      position: 'absolute',
                      left: typeof block.x === 'number' ? `${block.x}px` : '0px',
                      top: `${block.y || 40}px`,
                      width: typeof block.width === 'number' ? `${block.width}px` : `${CANONICAL_WIDTH}px`,
                      maxWidth: '100%',
                      zIndex: typeof block.layerOrder === 'number' ? block.layerOrder : idx + 1,
                      transform: `rotate(${block.rotation || 0}deg) scale(${block.scale || 1})`,
                      transformOrigin: 'center center',
                    }}
                    className="p-1.5 rounded-lg select-none pointer-events-none"
                  >
                    <div
                      style={{
                        fontFamily: block.fontFamily || "'Paperlogy', sans-serif",
                        fontWeight: block.fontWeight || (block.fontFamily && !block.fontFamily.includes('Paperlogy') ? 'normal' : 600),
                        fontSize: `${block.fontSize || 18}px`,
                        color: textColor,
                        textAlign: block.textAlign || 'left',
                        lineHeight: 1.5,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        ...customBgStyle,
                      }}
                      className={`w-full ${bgClass}`}
                    >
                      {block.text}
                    </div>
                  </div>
                );
              })}

              {(!normalizedLayers.textBlocks || normalizedLayers.textBlocks.length === 0) &&
                diary.summary &&
                diary.summary !== '기록된 일기' && (
                  <div
                    style={{
                      position: 'absolute',
                      left: '18px',
                      top: '40px',
                      fontFamily: "'Gaegu', cursive",
                      zIndex: 1,
                    }}
                    className="text-stone-700 text-lg leading-relaxed relative w-[90%] whitespace-pre-wrap break-words"
                  >
                    {diary.summary}
                  </div>
                )}

              {/* 스티커 & 꾸미기 에셋 (작성 화면과 100% 동일한 절대 위치와 크기) */}
              {(normalizedLayers.stickers || []).filter(Boolean).map((sticker, idx) => (
                <div
                  key={sticker.id || `st-${idx}`}
                  style={{
                    position: 'absolute',
                    left: `${sticker.x || 0}px`,
                    top: `${sticker.y || 0}px`,
                    zIndex: typeof sticker.layerOrder === 'number' ? sticker.layerOrder : idx + 1,
                    transform: `rotate(${sticker.rotation || 0}deg) scale(${sticker.scale || 1})`,
                    transformOrigin: 'center center',
                    transformBox: 'fill-box',
                  }}
                  className="select-none pointer-events-none p-1"
                >
                  {(() => {
                    const resolvedImg = resolveStickerImage(sticker);
                    if (resolvedImg) {
                      return (
                        <img
                          src={resolvedImg}
                          alt=""
                          draggable={false}
                          style={{
                            imageRendering: '-webkit-optimize-contrast',
                          }}
                          className={
                            sticker.category === 'tape' || sticker.type === 'tape'
                              ? 'w-28 h-auto object-contain select-none block'
                              : sticker.isPhoto || sticker.type === 'photo'
                              ? 'w-36 h-auto object-contain select-none block'
                              : 'w-14 h-14 object-contain select-none block'
                          }
                        />
                      );
                    }
                    if (sticker.type === 'tape' || sticker.category === 'tape') {
                      return (
                        <div
                          className="w-28 h-6 rounded shadow-xs relative overflow-hidden"
                          style={{
                            backgroundColor: sticker.color || '#fef08a',
                            backgroundImage:
                              sticker.pattern === 'dots'
                                ? 'radial-gradient(rgba(0,0,0,0.15) 1px, transparent 1px)'
                                : sticker.pattern === 'stripes'
                                ? 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(0,0,0,0.08) 4px, rgba(0,0,0,0.08) 8px)'
                                : 'none',
                            backgroundSize: sticker.pattern === 'dots' ? '6px 6px' : 'auto',
                          }}
                        >
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-white/40" />
                          <div className="absolute right-0 top-0 bottom-0 w-1 bg-black/10" />
                        </div>
                      );
                    }
                    if (isEmojiSticker(sticker)) {
                      return (
                        <span className="text-3xl sm:text-4xl filter drop-shadow-xs block leading-none select-none">
                          {sticker.content || sticker.icon || ''}
                        </span>
                      );
                    }
                    // 이미지 스티커의 파일명/라벨(예: "moomi")이 화면에 텍스트로 노출되는 현상 완전 방지
                    return null;
                  })()}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// 썸네일 그리드 셀 컴포넌트: 날짜(상단) + 스티커(하단) 상하 배치, 스티커 없으면 점(dot)
function ThumbnailItem({ diary, onSelect, isSelected }) {
  const dateParts = diary?.date ? String(diary.date).split('-') : [];
  const year = dateParts[0] && !isNaN(parseInt(dateParts[0], 10)) ? parseInt(dateParts[0], 10) : 2026;
  const month = dateParts[1] && !isNaN(parseInt(dateParts[1], 10)) ? parseInt(dateParts[1], 10) - 1 : 10;
  const day = dateParts[2] && !isNaN(parseInt(dateParts[2], 10)) ? parseInt(dateParts[2], 10) : 17;

  const dateObj = new Date(year, month, day);
  const dayNum = String(isNaN(day) ? 17 : day).padStart(2, '0');
  const dayEn = DAY_NAMES_EN[isNaN(dateObj.getDay()) ? 0 : dateObj.getDay()] || 'WED';
  const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
  const holiday = getKoreanHoliday(diary?.date);
  const isHolidayOrWeekend = isWeekend || !!holiday;
  const now = new Date();
  const localTodayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const isToday = diary?.date === localTodayStr;

  const rawMood = upgradePresetSvgUrl(diary?.thumbnailMood || diary?.weather || '');
  let stickerVal = '';
  let isStickerImage = false;

  if (typeof rawMood === 'string' || typeof rawMood === 'number') {
    stickerVal = upgradePresetSvgUrl(String(rawMood));
  } else if (rawMood && typeof rawMood === 'object') {
    const resolvedImg = resolveStickerImage(rawMood);
    if (resolvedImg) {
      stickerVal = upgradePresetSvgUrl(resolvedImg);
    } else if (rawMood.icon && typeof rawMood.icon === 'string' && rawMood.icon.length <= 4) {
      stickerVal = rawMood.icon;
    } else if (rawMood.content && typeof rawMood.content === 'string' && rawMood.content.length <= 4) {
      stickerVal = rawMood.content;
    }
  }

  isStickerImage =
    typeof stickerVal === 'string' &&
    (stickerVal.startsWith('data:') ||
      stickerVal.startsWith('http://') ||
      stickerVal.startsWith('https://') ||
      stickerVal.startsWith('/') ||
      stickerVal.startsWith('blob:'));

  const isShortEmojiOrSymbol =
    !isStickerImage &&
    typeof stickerVal === 'string' &&
    stickerVal.length > 0 &&
    stickerVal.length <= 4 &&
    !/^[a-zA-Z0-9_\-|\s]+$/.test(stickerVal);

  const hasSticker = isStickerImage || isShortEmojiOrSymbol;

  return (
    <div
      id={`diary-card-${diary.date}`}
      onClick={() => onSelect(diary)}
      className="bg-white border border-stone-200/90 hover:border-stone-400 rounded-2xl p-2.5 sm:p-3 flex flex-col items-center justify-between cursor-pointer active:scale-95 transition-all shadow-2xs hover:shadow-xs aspect-square w-full select-none"
      title={`${diary.date} 일기 보기`}
    >
      {/* 상단: 날짜 (숫자 + 요일 + 휴일명 슬롯 고정 높이) */}
      <div className="flex flex-col items-center leading-none mt-0.5 shrink-0">
        <div className="relative inline-flex items-center">
          <span
            className={`text-base sm:text-lg font-black tracking-tight ${
              isHolidayOrWeekend ? 'text-[#ff6b00]' : 'text-black'
            }`}
          >
            {dayNum}
          </span>
          {isToday && (
            <span className="absolute -top-0.5 -right-1.5 w-1.5 h-1.5 rounded-full bg-black block select-none pointer-events-none" />
          )}
        </div>
        <span className="text-[10px] sm:text-[11px] font-bold text-stone-400 mt-0.5 tracking-wider">
          {dayEn}
        </span>
        {/* 휴일명 고정 슬롯 (휴일 없어도 동일 높이 유지하여 카드 높이 일치) */}
        <div className="h-3 sm:h-3.5 flex items-center justify-center mt-0.5 overflow-hidden">
          {holiday ? (
            <span className="text-[8px] sm:text-[9px] font-semibold text-[#ff6b00] truncate max-w-full px-0.5 leading-none">
              {holiday.name}
            </span>
          ) : (
            <div className="h-3 sm:h-3.5" />
          )}
        </div>
      </div>

      {/* 하단: 날짜 옆 스티커 / 없는 경우 달력과 동일하게 점(dot) 표시 (고정 높이 슬롯) */}
      <div className="w-full h-[38px] sm:h-[42px] flex items-center justify-center shrink-0 my-0.5 overflow-visible">
        {hasSticker ? (
          isStickerImage ? (
            <img
              src={stickerVal}
              alt=""
              style={{ width: '80%', maxWidth: '38px', maxHeight: '38px', height: 'auto' }}
              className="w-[80%] max-w-[38px] max-h-[38px] h-auto object-contain select-none pointer-events-none"
            />
          ) : (
            <span className="text-xl sm:text-2xl leading-none filter drop-shadow-2xs select-none">
              {stickerVal}
            </span>
          )
        ) : (
          <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-[#84cc16] select-none block shadow-2xs" />
        )}
      </div>
    </div>
  );
}

export default function ListView({ 
  diaries, 
  onSelectDiary, 
  onDeleteDiary, 
  onNewDiary, 
  selectedDiaryId, 
  selectedDate,
  calendarViewingDate,
  listScrollTrigger,
  isActive,
  savedScrollTop = 0,
  isReturningFromEditor = false,
  onSaveScrollTop,
  onRestoreScrollComplete,
  onOpenYearView,
  isThumbnailView = false,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [openSwipeCardId, setOpenSwipeCardId] = useState(null);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const listContainerRef = useRef(null);
  const isUserTouchingRef = useRef(false);
  const touchStartYRef = useRef(0);

  // 검색 필터링 & 최신 날짜순 정렬
  const filteredDiaries = [...diaries]
    .filter((d) => {
      const textContent = d.textBlocks?.map((t) => t.text).join(' ') || '';
      const titleMatch = (d.title || '').toLowerCase().includes(searchTerm.toLowerCase());
      const textMatch = textContent.toLowerCase().includes(searchTerm.toLowerCase());
      const dateMatch = (d.date || '').includes(searchTerm);
      return titleMatch || textMatch || dateMatch;
    })
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  // 월별 그룹화 (예: '2026-12', '2026-11' 등)
  const groupedByMonth = {};
  filteredDiaries.forEach((diary) => {
    if (!diary) return;
    const parts = diary.date ? String(diary.date).split('-') : [];
    const safeYear = parts[0] && !isNaN(parseInt(parts[0], 10)) ? parseInt(parts[0], 10) : 2026;
    const safeMonth = parts[1] && !isNaN(parseInt(parts[1], 10)) ? parseInt(parts[1], 10) : 11;
    const key = `${safeYear}-${String(safeMonth).padStart(2, '0')}`;
    if (!groupedByMonth[key]) {
      groupedByMonth[key] = {
        year: safeYear,
        month: safeMonth,
        items: []
      };
    }
    groupedByMonth[key].items.push(diary);
  });

  const monthKeys = Object.keys(groupedByMonth).sort((a, b) => b.localeCompare(a));

  // 스크롤 복원 진행 중 플래그 (월 자동 스크롤과 충돌 방지)
  const isRestoringScrollRef = useRef(false);

  // 스크롤 위치 관리:
  // 1) 다이어리 작성/확인 후 목록으로 복귀 시: 직전 스크롤 위치를 그대로 복원
  useEffect(() => {
    if (!isActive || !isReturningFromEditor) return;

    isRestoringScrollRef.current = true;
    const container = listContainerRef.current;
    const restorePos = typeof savedScrollTop === 'number' ? savedScrollTop : 0;

    if (container) {
      container.scrollTop = restorePos;
    }

    // 모바일 렌더링 타이밍 보장을 위해 rAF 및 지연 재적용
    const rafId = requestAnimationFrame(() => {
      if (listContainerRef.current) {
        listContainerRef.current.scrollTop = restorePos;
      }
    });

    const timer = setTimeout(() => {
      if (listContainerRef.current) {
        listContainerRef.current.scrollTop = restorePos;
      }
      onRestoreScrollComplete?.();
      setTimeout(() => {
        isRestoringScrollRef.current = false;
      }, 100);
    }, 60);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timer);
    };
  }, [isActive, isReturningFromEditor, savedScrollTop, onRestoreScrollComplete]);

  // 컨테이너 내부의 임의 요소(중첩 relative 부모 포함)의 정확한 스크롤 Top 계산 헬퍼
  const getElementScrollTopInContainer = (el, container) => {
    if (!el || !container) return 0;
    const elRect = el.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    return elRect.top - containerRect.top + container.scrollTop;
  };

  // 특정 월로 부드럽게 스크롤 이동 헬퍼
  const scrollToMonthKey = (targetKey, targetYear, targetMonth) => {
    const c = listContainerRef.current;
    if (!c) return;

    const targetEl = document.getElementById(`month-group-${targetKey}`);
    if (targetEl) {
      const topPos = getElementScrollTopInContainer(targetEl, c);
      c.scrollTo({ top: Math.max(0, topPos - 10), behavior: 'smooth' });
    } else {
      // 클릭한 달의 일기가 없는 경우: 클릭한 달과 가장 가까운 달 중 일기가 있는 달의 목록으로 이동
      const availableKeys = Object.keys(groupedByMonth);
      if (availableKeys.length > 0) {
        let closestKey = availableKeys[0];
        let minDiff = Infinity;
        const targetTotal = targetYear * 12 + targetMonth;
        availableKeys.forEach((k) => {
          const [ky, km] = k.split('-').map(Number);
          const diff = Math.abs((ky * 12 + km) - targetTotal);
          if (diff < minDiff) {
            minDiff = diff;
            closestKey = k;
          }
        });
        const closestEl = document.getElementById(`month-group-${closestKey}`);
        if (closestEl) {
          const topPos = getElementScrollTopInContainer(closestEl, c);
          c.scrollTo({ top: Math.max(0, topPos - 10), behavior: 'smooth' });
        }
      }
    }
  };

  // 오늘 날짜로 부드럽게 스크롤 이동 (오늘 일기가 있으면 해당 카드로, 없으면 이번 달 그룹으로)
  const scrollToToday = () => {
    const c = listContainerRef.current;
    if (!c) return;

    const now = new Date();
    const todayDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const todayMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // 1) 오늘 날짜의 일기 카드가 있는 경우 해당 카드로 직접 스크롤 (정확한 container 상대 좌표)
    const todayCardEl = document.getElementById(`diary-card-${todayDateStr}`);
    if (todayCardEl) {
      const cardTop = getElementScrollTopInContainer(todayCardEl, c);
      c.scrollTo({ top: Math.max(0, cardTop - 70), behavior: 'smooth' });
      return;
    }

    // 2) 오늘 일기가 없으면 이번 달 헤더로 스크롤
    const todayMonthEl = document.getElementById(`month-group-${todayMonthKey}`);
    if (todayMonthEl) {
      const topPos = getElementScrollTopInContainer(todayMonthEl, c);
      c.scrollTo({ top: Math.max(0, topPos - 10), behavior: 'smooth' });
      return;
    }

    // 3) 이번 달 작성된 일기도 없는 경우 가장 가까운 달로 스크롤
    scrollToMonthKey(todayMonthKey, now.getFullYear(), now.getMonth() + 1);
  };

  // 2) 연력에서 월 선택 시, 일기에서 복귀 시, 또는 오늘 버튼 클릭 시 명시적 스크롤 트리거 처리
  const lastScrolledTargetRef = useRef(null);

  useEffect(() => {
    if (!isActive || !listScrollTrigger) return;

    // 명시적인 사용자 스크롤 요청이므로 복원 플래그 해제 및 즉각 스크롤
    isRestoringScrollRef.current = false;
    lastScrolledTargetRef.current = null;

    const timer = setTimeout(() => {
      const c = listContainerRef.current;
      if (!c) return;

      if (listScrollTrigger.type === 'today') {
        scrollToToday();
      } else if (listScrollTrigger.type === 'diary') {
        const { dateStr, year, monthIdx } = listScrollTrigger;
        const targetCardEl = document.getElementById(`diary-card-${dateStr}`);
        if (targetCardEl) {
          // getBoundingClientRect 기반의 정확한 절대 위치 계산 (중첩 relative 부모 offset 오류 완벽 해결)
          const cardTop = getElementScrollTopInContainer(targetCardEl, c);
          c.scrollTo({ top: Math.max(0, cardTop - 70), behavior: 'smooth' });
        } else {
          const targetMonth = monthIdx + 1;
          const targetKey = `${year}-${String(targetMonth).padStart(2, '0')}`;
          scrollToMonthKey(targetKey, year, targetMonth);
        }
      } else if (listScrollTrigger.type === 'month') {
        const { year, monthIdx } = listScrollTrigger;
        const targetMonth = monthIdx + 1;
        const targetKey = `${year}-${String(targetMonth).padStart(2, '0')}`;
        lastScrolledTargetRef.current = targetKey;
        scrollToMonthKey(targetKey, year, targetMonth);
      }
    }, 60);

    return () => clearTimeout(timer);
  }, [isActive, listScrollTrigger]);

  // 3) 달력 -> 목록 탭 전환 시 보고 있던 달의 위치로 1회 스크롤 (명시적 트리거가 없을 때만)
  useEffect(() => {
    if (!isActive) {
      lastScrolledTargetRef.current = null;
      return;
    }

    // 에디터에서 복귀하는 중이거나 복귀 완료 직후 세션에서는 탭 전환 월 자동 스크롤 금지
    if (isReturningFromEditor || isRestoringScrollRef.current || listScrollTrigger) {
      return;
    }

    const targetDate = calendarViewingDate || new Date();
    const targetYear = targetDate.getFullYear();
    const targetMonth = targetDate.getMonth() + 1;
    const targetKey = `${targetYear}-${String(targetMonth).padStart(2, '0')}`;

    // 이미 이 월로 스크롤한 적이 있다면 스크롤 재실행하지 않음
    if (lastScrolledTargetRef.current === targetKey) return;
    lastScrolledTargetRef.current = targetKey;

    const timer = setTimeout(() => {
      if (isReturningFromEditor || isRestoringScrollRef.current) return;
      scrollToMonthKey(targetKey, targetYear, targetMonth);
    }, 80);

    return () => clearTimeout(timer);
  }, [isActive, calendarViewingDate, isReturningFromEditor]);

  // 다이어리 카드 클릭 시 현재 리스트의 스크롤 위치를 저장한 뒤 에디터로 진입
  const handleSelectCard = (diary) => {
    if (listContainerRef.current) {
      onSaveScrollTop?.(listContainerRef.current.scrollTop);
    }
    onSelectDiary(diary);
  };

  // 검색 옆 [오늘] 버튼 클릭 시 오늘 위치로 스크롤 이동
  const handleGoToTodayMonth = () => {
    scrollToToday();
  };

  return (
    <div 
      ref={listContainerRef}
      onTouchStart={(e) => {
        isUserTouchingRef.current = true;
        if (e.touches && e.touches[0]) {
          touchStartYRef.current = e.touches[0].clientY;
        }
      }}
      onTouchMove={(e) => {
        // 검색창이 포커스된 상태에서 위/아래로 10px 이상 스와이프하면 키보드를 즉시 닫음
        if (e.touches && e.touches[0]) {
          const deltaY = Math.abs(e.touches[0].clientY - touchStartYRef.current);
          if (deltaY > 10) {
            if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
              document.activeElement.blur();
            }
          }
        }
      }}
      onTouchEnd={() => {
        isUserTouchingRef.current = false;
      }}
      onTouchCancel={() => {
        isUserTouchingRef.current = false;
      }}
      onClick={(e) => {
        // 검색창 및 버튼 외의 빈 배경 터치/클릭 시 키보드를 깔끔하게 내림
        if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'BUTTON' && !e.target.closest('button')) {
          if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
            document.activeElement.blur();
          }
        }
      }}
      onScroll={(e) => {
        // 스크롤 시 열려 있는 스와이프 삭제 카드가 있으면 제자리로 복귀
        if (openSwipeCardId) {
          setOpenSwipeCardId(null);
        }
        // 사용자가 터치로 직접 스크롤을 30px 이상 의미있게 내렸을 때 키보드 내림 처리
        if (isUserTouchingRef.current && e.currentTarget.scrollTop > 30) {
          if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
            document.activeElement.blur();
          }
        }
      }}
      style={{
        WebkitOverflowScrolling: filteredDiaries.length === 0 ? 'auto' : 'touch',
        overscrollBehaviorY: 'auto',
        touchAction: filteredDiaries.length === 0 ? 'none' : 'pan-y',
      }}
      className={`flex flex-col h-full bg-[#fafafa] px-6 pb-28 no-scrollbar relative ${
        filteredDiaries.length === 0 ? 'overflow-y-hidden' : 'overflow-y-auto'
      }`}
    >
      
      {/* 1. 상단 둥근 알약형 검색창 */}
      <div className="py-2.5 shrink-0">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-stone-400" size={17} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="기억하고 싶은 순간, 단어, 날짜 검색..."
            className="w-full pl-11 pr-11 py-2.5 bg-white border border-stone-200/90 rounded-full text-xs sm:text-sm text-stone-800 placeholder-stone-400/80 focus:outline-hidden focus:ring-1 focus:ring-black shadow-2xs transition"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-stone-200/80 text-stone-600 hover:bg-stone-300 active:scale-95 transition flex items-center justify-center cursor-pointer"
              title="검색어 지우기"
            >
              <X size={13} strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>

      {/* 2. 월별 그룹 일기 카드 피드 (검색결과 없거나 일기 없을 때: 낙엽 이미지 및 테두리 박스 없이 미니멀 플랫 디자인) */}
      {filteredDiaries.length === 0 ? (
        searchTerm.trim() ? (
          <div className="flex flex-col items-center justify-center py-20 text-center my-auto select-none">
            <p className="text-sm font-semibold text-stone-700">검색 결과가 없어요</p>
            <p className="text-xs text-stone-400 mt-1.5">다른 검색어로 다시 시도해보세요.</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center my-auto select-none">
            <p className="text-sm font-semibold text-stone-700">기록된 일기가 없어요</p>
            <p className="text-xs text-stone-400 mt-1.5">오늘 있었던 작은 순간을 기록해보세요.</p>
            <button
              onClick={onNewDiary}
              className="mt-5 px-4 py-2 bg-black text-white rounded-xl text-xs font-medium hover:bg-stone-800 active:scale-95 transition cursor-pointer"
            >
              첫 일기 작성하기
            </button>
          </div>
        )
      ) : (
        <div className="pt-1 pb-10 space-y-6">
          {monthKeys.map((key) => {
            const group = groupedByMonth[key];
            const monthName = MONTH_NAMES_EN[Math.max(0, Math.min(11, (group.month || 1) - 1))] || 'November';

            return (
              <div key={key} id={`month-group-${key}`} className="relative">
                {/* 8. 목록 월, 년도 영문 표기 sticky: z-30 및 완전 불투명 배경(#fafafa)으로 카드 스크롤 시 최상위 고정 유지 */}
                <div className="sticky top-0 z-30 bg-[#fafafa] pt-2.5 pb-2 -mx-6 px-6 border-b border-stone-200/60 shadow-xs">
                  <div className="flex items-end justify-between">
                    <div className="text-5xl sm:text-6xl font-black text-black leading-none tracking-tight select-none">
                      {group.month}
                    </div>

                    {/* 달력과 동일하게 2026 영문표기 클릭 시, 연력 보이도록 수정 */}
                    <button
                      type="button"
                      onClick={() => onOpenYearView?.(group.year)}
                      className="text-right pb-1 group cursor-pointer hover:opacity-75 transition-opacity select-none focus:outline-none"
                      title={`${group.year}년 연력(전체 달력) 보기`}
                    >
                      <div className="text-sm font-bold text-black leading-tight group-hover:underline">
                        {group.year}
                      </div>
                      <div className="text-xs sm:text-sm font-bold text-black leading-tight group-hover:underline">
                        {monthName}
                      </div>
                    </button>
                  </div>
                </div>

                {/* 해당 월의 일기 목록 (썸네일 격자 보기 or 일반 카드 리스트) */}
                {isThumbnailView ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5 sm:gap-3.5 pt-3">
                    {group.items.map((diary) => (
                      <ThumbnailItem
                        key={diary.id}
                        diary={diary}
                        isSelected={selectedDiaryId === diary.id || (selectedDate && selectedDate === diary.date)}
                        onSelect={handleSelectCard}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4 pt-3">
                    {group.items.map((diary) => (
                      <div key={diary.id} id={`diary-card-${diary.date}`}>
                        <DiaryCard
                          diary={diary}
                          isSelected={selectedDiaryId === diary.id || (selectedDate && selectedDate === diary.date)}
                          onSelect={handleSelectCard}
                          onDelete={onDeleteDiary}
                          isSwipeOpen={openSwipeCardId === diary.id}
                          onSwipeOpen={() => setOpenSwipeCardId(diary.id)}
                          onSwipeClose={() => setOpenSwipeCardId(null)}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          <div className="text-center text-[11px] text-stone-400 font-medium pt-2 select-none">
            {isThumbnailView ? '썸네일을 누르면 일기 상세로 이동해요' : '← 카드를 좌측으로 슬라이딩하면 삭제할 수 있어요'}
          </div>
        </div>
      )}

      {/* 3. 우측 하단 플로팅 새 일기 작성 버튼 (+) 및 날짜 선택 모달 */}
      <button
        type="button"
        onClick={() => {
          triggerHaptic('light');
          setIsDatePickerOpen(true);
        }}
        className="fixed right-6 bottom-8 z-40 w-14 h-14 rounded-full bg-black text-white shadow-2xl flex items-center justify-center hover:bg-stone-800 active:scale-95 transition-all cursor-pointer select-none"
        title="새 일기 작성 (날짜 선택)"
      >
        <Plus size={28} strokeWidth={2.6} />
      </button>

      <DatePickerModal
        isOpen={isDatePickerOpen}
        onClose={() => setIsDatePickerOpen(false)}
        onSelectDate={(targetDate) => {
          onNewDiary(targetDate);
        }}
        existingDates={diaries.map((d) => d.date)}
        title="새 일기 작성할 날짜 선택"
      />
    </div>
  );
}
