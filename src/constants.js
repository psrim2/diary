// 다이어리 기본 프리셋 및 스티커 데이터

export const PAPER_STYLES = [
  { id: 'blank', name: '무지', class: 'paper-minimal-blank', desc: '자유로운 여백' },
  { id: 'lined', name: '줄노트', class: 'paper-minimal-lined', desc: '단정한 줄글 필기' },
  { id: 'grid', name: '모눈', class: 'paper-minimal-grid', desc: '호보니치 플래너 감성' },
  { id: 'dots', name: '도트', class: 'paper-minimal-dots', desc: '감성 불렛저널' },
];

export const FONTS = [
  { id: 'paperlogy', name: '페이퍼로지', family: "'Paperlogy', sans-serif", defaultSize: 18, weight: 600 },
  { id: 'sans', name: '고딕체', family: "'Pretendard', sans-serif", defaultSize: 15 },
  { id: 'gaegu', name: '개구체', family: "'Gaegu', cursive", defaultSize: 20 },
  { id: 'hand', name: '손글씨체', family: "'Nanum Pen Script', cursive", defaultSize: 22 },
  { id: 'caveat', name: '영문필기체', family: "'Caveat', cursive", defaultSize: 22 },
  { id: 'serif', name: '명조체', family: "'Nanum Myeongjo', serif", defaultSize: 16 },
];

export const PEN_TOOLS = [
  { id: 'pen', name: '만년필', size: 2.2, opacity: 1.0, type: 'pen' },
  { id: 'pencil', name: '연필', size: 1.8, opacity: 0.85, type: 'pencil' },
  { id: 'highlighter', name: '형광펜', size: 16, opacity: 0.35, type: 'highlighter' },
  { id: 'eraser', name: '지우개', size: 24, opacity: 1.0, type: 'eraser' },
];

export const PEN_COLORS = [
  { name: '먹색 (Black)', value: '#111111' },
  { name: '연필 회색 (Gray)', value: '#666666' },
  { name: '빈티지 잉크 (Sepia)', value: '#5c4033' },
  { name: '만년필 블루 (Navy)', value: '#1b3b6f' },
  { name: '장미빛 레드 (Wine)', value: '#9e2a2b' },
  { name: '포레스트 그린 (Green)', value: '#2d6a4f' },
  { name: '파스텔 옐로우 (Highlighter)', value: '#ffea79' },
  { name: '파스텔 핑크 (Highlighter)', value: '#ffb3c6' },
  { name: '파스텔 민트 (Highlighter)', value: '#b7e4c7' },
  { name: '파스텔 퍼플 (Highlighter)', value: '#d8b4e2' },
];

// 스티커 목록
export const STICKER_PACKS = [
  {
    category: '마스킹 테이프',
    items: [
      { id: 'tape_yellow', type: 'tape', color: '#fef08a', pattern: 'dots', label: '마스킹 테이프 (옐로우)' },
      { id: 'tape_pink', type: 'tape', color: '#fbcfe8', pattern: 'stripes', label: '마스킹 테이프 (핑크)' },
      { id: 'tape_mint', type: 'tape', color: '#a7f3d0', pattern: 'grid', label: '마스킹 테이프 (민트)' },
      { id: 'tape_lavender', type: 'tape', color: '#e9d5ff', pattern: 'solid', label: '마스킹 테이프 (라벤더)' },
      { id: 'tape_kraft', type: 'tape', color: '#d7c4a7', pattern: 'vintage', label: '빈티지 종이 테이프' },
    ]
  },
  {
    category: '기분 & 날씨 스탬프',
    items: [
      { id: 'mood_happy', type: 'emoji', content: '☕️', label: '커피 한 잔' },
      { id: 'mood_love', type: 'emoji', content: '🥰', label: '행복한 날' },
      { id: 'mood_calm', type: 'emoji', content: '🌿', label: '차분한 쉼' },
      { id: 'mood_sparkle', type: 'emoji', content: '✨', label: '빛나는 순간' },
      { id: 'weather_sun', type: 'emoji', content: '☀️', label: '맑음' },
      { id: 'weather_cloud', type: 'emoji', content: '⛅️', label: '구름 조금' },
      { id: 'weather_rain', type: 'emoji', content: '🌧️', label: '비 오는 날' },
      { id: 'weather_moon', type: 'emoji', content: '🌙', label: '밤하늘' },
    ]
  },
  {
    category: '다꾸 데코 & 클립',
    items: [
      { id: 'deco_heart', type: 'emoji', content: '💖', label: '하트' },
      { id: 'deco_star', type: 'emoji', content: '⭐', label: '별' },
      { id: 'deco_ribbon', type: 'emoji', content: '🎀', label: '리본' },
      { id: 'deco_flower', type: 'emoji', content: '🌷', label: '튤립' },
      { id: 'deco_fourleaf', type: 'emoji', content: '🍀', label: '행운의 네잎클로버' },
      { id: 'deco_cat', type: 'emoji', content: '🐾', label: '발자국' },
      { id: 'deco_pin', type: 'emoji', content: '📌', label: '푸시핀' },
      { id: 'deco_clip', type: 'emoji', content: '📎', label: '클립' },
      { id: 'deco_memo', type: 'emoji', content: '💌', label: '편지' },
      { id: 'deco_music', type: 'emoji', content: '🎧', label: '음악' },
      { id: 'deco_cake', type: 'emoji', content: '🍰', label: '디저트' },
    ]
  }
];

// 초기 데이터 (기본값: 빈 배열 - 아무 데이터도 없는 상태로 시작)
export const INITIAL_DIARIES = [];
