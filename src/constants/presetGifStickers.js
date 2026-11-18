// 내장 움직이는 GIF 및 애니메이션 스티커 프리셋
// 브라우저에서 무한 루프 60fps로 재생되는 경량 애니메이션 벡터/GIF 에셋

function encodeSvg(svg) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg.trim())}`;
}

export const PRESET_GIF_STICKERS = [
  {
    id: 'gif-heart',
    name: '두근두근 하트',
    category: 'gif',
    isGif: true,
    imageUrl: encodeSvg(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <style>
          @keyframes heartbeat {
            0%, 100% { transform: scale(1); }
            14% { transform: scale(1.18); }
            28% { transform: scale(1); }
            42% { transform: scale(1.15); }
            70% { transform: scale(1); }
          }
          .heart { transform-origin: center; animation: heartbeat 1.2s ease-in-out infinite; }
        </style>
        <path class="heart" d="M50,88 C20,65 5,45 5,28 C5,13 16,3 30,3 C38,3 45,7 50,15 C55,7 62,3 70,3 C84,3 95,13 95,28 C95,45 80,65 50,88 Z" fill="#ff4d6d" stroke="#c9184a" stroke-width="2" />
      </svg>
    `),
  },
  {
    id: 'gif-sparkle',
    name: '반짝반짝 별',
    category: 'gif',
    isGif: true,
    imageUrl: encodeSvg(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <style>
          @keyframes twinkle {
            0%, 100% { transform: scale(0.85) rotate(0deg); opacity: 0.85; }
            50% { transform: scale(1.18) rotate(180deg); opacity: 1; filter: drop-shadow(0 0 6px #facc15); }
          }
          .star { transform-origin: center; animation: twinkle 1.8s ease-in-out infinite; }
        </style>
        <path class="star" d="M50 2 L58 35 L95 50 L58 65 L50 98 L42 65 L5 50 L42 35 Z" fill="#facc15" stroke="#eab308" stroke-width="2"/>
      </svg>
    `),
  },
  {
    id: 'gif-cat',
    name: '손흔드는 냥이',
    category: 'gif',
    isGif: true,
    imageUrl: encodeSvg(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <style>
          @keyframes paw {
            0%, 100% { transform: rotate(0deg); }
            50% { transform: rotate(-24deg); }
          }
          .paw { transform-origin: 75px 55px; animation: paw 0.8s ease-in-out infinite; }
        </style>
        <circle cx="50" cy="55" r="32" fill="#ffffff" stroke="#1c1917" stroke-width="3"/>
        <polygon points="26,30 36,12 48,26" fill="#ffffff" stroke="#1c1917" stroke-width="3"/>
        <polygon points="74,30 64,12 52,26" fill="#ffffff" stroke="#1c1917" stroke-width="3"/>
        <circle cx="38" cy="50" r="3.5" fill="#1c1917"/>
        <circle cx="62" cy="50" r="3.5" fill="#1c1917"/>
        <polygon points="50,56 46,60 54,60" fill="#f43f5e"/>
        <path d="M46 62 Q50 66 54 62" fill="none" stroke="#1c1917" stroke-width="2"/>
        <ellipse cx="32" cy="56" rx="4" ry="2.5" fill="#fda4af"/>
        <ellipse cx="68" cy="56" rx="4" ry="2.5" fill="#fda4af"/>
        <g class="paw">
          <ellipse cx="78" cy="46" rx="7" ry="10" fill="#ffffff" stroke="#1c1917" stroke-width="3"/>
          <circle cx="78" cy="42" r="3" fill="#fda4af"/>
        </g>
      </svg>
    `),
  },
  {
    id: 'gif-rain',
    name: '비 내리는 구름',
    category: 'gif',
    isGif: true,
    imageUrl: encodeSvg(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <style>
          @keyframes drop1 {
            0% { transform: translateY(0); opacity: 0; }
            30% { opacity: 1; }
            100% { transform: translateY(22px); opacity: 0; }
          }
          @keyframes drop2 {
            0% { transform: translateY(0); opacity: 0; }
            30% { opacity: 1; }
            100% { transform: translateY(22px); opacity: 0; }
          }
          .d1 { animation: drop1 0.8s linear infinite; }
          .d2 { animation: drop2 0.8s linear 0.4s infinite; }
          .d3 { animation: drop1 0.8s linear 0.2s infinite; }
        </style>
        <path d="M25 50 a18 18 0 0 1 32 -10 a15 15 0 0 1 23 8 a14 14 0 0 1 -7 22 h-44 a10 10 0 0 1 -4 -20 z" fill="#94a3b8" />
        <line class="d1" x1="32" y1="72" x2="28" y2="82" stroke="#38bdf8" stroke-width="3" stroke-linecap="round"/>
        <line class="d2" x1="50" y1="72" x2="46" y2="82" stroke="#38bdf8" stroke-width="3" stroke-linecap="round"/>
        <line class="d3" x1="68" y1="72" x2="64" y2="82" stroke="#38bdf8" stroke-width="3" stroke-linecap="round"/>
      </svg>
    `),
  },
  {
    id: 'gif-coffee',
    name: '김나는 커피',
    category: 'gif',
    isGif: true,
    imageUrl: encodeSvg(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <style>
          @keyframes steam {
            0% { transform: translateY(0) scaleX(1); opacity: 0; }
            40% { opacity: 0.85; }
            100% { transform: translateY(-16px) scaleX(1.3); opacity: 0; }
          }
          .s1 { animation: steam 1.5s ease-out infinite; }
          .s2 { animation: steam 1.5s ease-out 0.5s infinite; }
          .s3 { animation: steam 1.5s ease-out 1s infinite; }
        </style>
        <path class="s1" d="M38 32 Q34 22 38 12" fill="none" stroke="#a8a29e" stroke-width="2.5" stroke-linecap="round"/>
        <path class="s2" d="M50 30 Q54 20 50 10" fill="none" stroke="#a8a29e" stroke-width="2.5" stroke-linecap="round"/>
        <path class="s3" d="M62 32 Q58 22 62 12" fill="none" stroke="#a8a29e" stroke-width="2.5" stroke-linecap="round"/>
        <rect x="25" y="38" width="50" height="42" rx="10" fill="#fafaf9" stroke="#44403c" stroke-width="3"/>
        <path d="M75 48 h8 a7 7 0 0 1 7 7 v4 a7 7 0 0 1 -7 7 h-8" fill="none" stroke="#44403c" stroke-width="3"/>
        <rect x="23" y="80" width="54" height="4" rx="2" fill="#d6d3d1"/>
        <text x="50" y="63" font-size="14" text-anchor="middle" fill="#78350f" font-weight="bold">☕</text>
      </svg>
    `),
  },
  {
    id: 'gif-sparkles',
    name: '반짝이 스탬프',
    category: 'gif',
    isGif: true,
    imageUrl: encodeSvg(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <style>
          @keyframes s1 { 0%, 100% { transform: scale(0.2); opacity: 0.1; } 50% { transform: scale(1.1); opacity: 1; } }
          @keyframes s2 { 0%, 100% { transform: scale(1.1); opacity: 1; } 50% { transform: scale(0.2); opacity: 0.1; } }
          .sp1 { transform-origin: 35px 35px; animation: s1 1.2s ease-in-out infinite; }
          .sp2 { transform-origin: 70px 65px; animation: s2 1.2s ease-in-out infinite; }
          .sp3 { transform-origin: 75px 25px; animation: s1 1.2s ease-in-out 0.6s infinite; }
        </style>
        <path class="sp1" d="M35 15 L39 30 L54 35 L39 40 L35 55 L31 40 L16 35 L31 30 Z" fill="#fbbf24"/>
        <path class="sp2" d="M70 50 L73 61 L84 65 L73 69 L70 80 L67 69 L56 65 L67 61 Z" fill="#f472b6"/>
        <path class="sp3" d="M75 12 L77 21 L86 25 L77 29 L75 38 L73 29 L64 25 L73 21 Z" fill="#60a5fa"/>
      </svg>
    `),
  },
  {
    id: 'gif-fire',
    name: '타오르는 불꽃',
    category: 'gif',
    isGif: true,
    imageUrl: encodeSvg(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <style>
          @keyframes flame {
            0%, 100% { transform: scale(1) rotate(-3deg); }
            50% { transform: scale(1.08, 0.95) rotate(3deg); }
          }
          .flame { transform-origin: 50px 85px; animation: flame 0.65s ease-in-out infinite alternate; }
        </style>
        <g class="flame">
          <path d="M50 10 C65 35 85 55 85 72 C85 88 70 95 50 95 C30 95 15 88 15 72 C15 55 35 35 50 10 Z" fill="#f97316"/>
          <path d="M50 35 C60 50 72 65 72 76 C72 86 62 90 50 90 C38 90 28 86 28 76 C28 65 40 50 50 35 Z" fill="#facc15"/>
        </g>
      </svg>
    `),
  },
  {
    id: 'gif-leaf',
    name: '살랑살랑 나뭇잎',
    category: 'gif',
    isGif: true,
    imageUrl: encodeSvg(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <style>
          @keyframes sway {
            0%, 100% { transform: rotate(-15deg); }
            50% { transform: rotate(18deg); }
          }
          .leaf { transform-origin: 50px 85px; animation: sway 2s ease-in-out infinite; }
        </style>
        <g class="leaf">
          <path d="M50 15 Q80 40 50 85 Q20 40 50 15 Z" fill="#22c55e" stroke="#15803d" stroke-width="2.5"/>
          <path d="M50 85 L50 25" stroke="#15803d" stroke-width="2" stroke-linecap="round"/>
          <path d="M50 45 L62 38 M50 60 L62 53 M50 50 L38 43 M50 65 L38 58" stroke="#15803d" stroke-width="1.8" stroke-linecap="round"/>
        </g>
      </svg>
    `),
  },
  {
    id: 'gif-sun',
    name: '빛나는 태양',
    category: 'gif',
    isGif: true,
    imageUrl: encodeSvg(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <style>
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          .rays { transform-origin: 50px 50px; animation: spin 10s linear infinite; }
        </style>
        <g class="rays">
          <line x1="50" y1="10" x2="50" y2="20" stroke="#f59e0b" stroke-width="4" stroke-linecap="round"/>
          <line x1="50" y1="80" x2="50" y2="90" stroke="#f59e0b" stroke-width="4" stroke-linecap="round"/>
          <line x1="10" y1="50" x2="20" y2="50" stroke="#f59e0b" stroke-width="4" stroke-linecap="round"/>
          <line x1="80" y1="50" x2="90" y2="50" stroke="#f59e0b" stroke-width="4" stroke-linecap="round"/>
          <line x1="22" y1="22" x2="29" y2="29" stroke="#f59e0b" stroke-width="4" stroke-linecap="round"/>
          <line x1="71" y1="71" x2="78" y2="78" stroke="#f59e0b" stroke-width="4" stroke-linecap="round"/>
          <line x1="22" y1="78" x2="29" y2="71" stroke="#f59e0b" stroke-width="4" stroke-linecap="round"/>
          <line x1="71" y1="29" x2="78" y2="22" stroke="#f59e0b" stroke-width="4" stroke-linecap="round"/>
        </g>
        <circle cx="50" cy="50" r="22" fill="#fbbf24" stroke="#f59e0b" stroke-width="3"/>
        <circle cx="43" cy="47" r="2.5" fill="#78350f"/>
        <circle cx="57" cy="47" r="2.5" fill="#78350f"/>
        <path d="M44 54 Q50 60 56 54" fill="none" stroke="#78350f" stroke-width="2.5" stroke-linecap="round"/>
      </svg>
    `),
  },
  {
    id: 'gif-moon',
    name: '반짝이는 달님',
    category: 'gif',
    isGif: true,
    imageUrl: encodeSvg(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <style>
          @keyframes glow { 0%, 100% { opacity: 0.85; filter: drop-shadow(0 0 2px #e0e7ff); } 50% { opacity: 1; filter: drop-shadow(0 0 8px #818cf8); } }
          .moon { animation: glow 2.5s ease-in-out infinite; }
        </style>
        <path class="moon" d="M68 20 A38 38 0 1 0 68 80 A28 28 0 0 1 68 20 Z" fill="#6366f1" stroke="#4338ca" stroke-width="2"/>
        <circle cx="78" cy="30" r="3" fill="#facc15"/>
        <circle cx="85" cy="55" r="2" fill="#facc15"/>
      </svg>
    `),
  },
];
