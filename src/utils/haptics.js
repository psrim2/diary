/**
 * 웹 및 모바일 환경에서 햅틱(진동/촉각) 피드백을 제공하는 유틸리티
 * 1) Android 등 표준 지원 브라우저: navigator.vibrate()
 * 2) iOS 17.4+ Safari: <input type="checkbox" switch> 네이티브 Taptic Engine 트리거
 * 3) iOS 전반 및 비지원 환경 폴백: Web Audio API 기반 미세 촉각 펄스 (스피커 모터 음향 진동을 통한 촉각 체감)
 */

let hapticSwitch = null;
let hapticLabel = null;
let audioCtx = null;

// iOS Safari switch element 초기화 (DOM 준비 시점)
function ensureIosSwitch() {
  if (typeof document === 'undefined' || !document.body || hapticSwitch) return;
  try {
    hapticSwitch = document.createElement('input');
    hapticSwitch.type = 'checkbox';
    hapticSwitch.setAttribute('switch', '');
    hapticSwitch.id = '__ios_haptic_switch';
    hapticSwitch.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none;z-index:-999;';
    document.body.appendChild(hapticSwitch);

    hapticLabel = document.createElement('label');
    hapticLabel.htmlFor = '__ios_haptic_switch';
    hapticLabel.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none;z-index:-999;';
    document.body.appendChild(hapticLabel);
  } catch {}
}

// Web Audio API를 활용한 초단파 촉각 펄스 (기기 진동 모터 및 스피커 공명을 통해 손끝에 전달되는 물리적 햅틱 느낌 합성)
function playTactilePulse(type = 'light') {
  if (typeof window === 'undefined') return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    if (!audioCtx) {
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    if (type === 'pageTurn') {
      // 책장 넘김: 사각거리는 두 번의 부드러운 다단 펄스
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(130, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.035);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.035);
    } else if (type === 'boundary') {
      // 경계 도달: 묵직한 저음 펄스
      osc.type = 'sine';
      osc.frequency.setValueAtTime(80, now);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.05);
    } else {
      // light / medium: 또각거리는 가벼운 클릭 펄스
      osc.type = 'sine';
      osc.frequency.setValueAtTime(110, now);
      osc.frequency.exponentialRampToValueAtTime(35, now + 0.02);
      gain.gain.setValueAtTime(type === 'medium' ? 0.08 : 0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.02);
    }
  } catch {}
}

export function triggerHaptic(type = 'light') {
  if (typeof window === 'undefined') return;

  // 1. Android 등 표준 navigator.vibrate() 지원 디바이스
  try {
    if ('vibrate' in navigator && typeof navigator.vibrate === 'function') {
      switch (type) {
        case 'light':
          navigator.vibrate(12);
          break;
        case 'medium':
          navigator.vibrate(25);
          break;
        case 'pageTurn':
          navigator.vibrate([15, 30, 20]);
          break;
        case 'boundary':
          navigator.vibrate([25, 40, 25]);
          break;
        case 'success':
          navigator.vibrate([15, 30, 20]);
          break;
        default:
          navigator.vibrate(12);
      }
    }
  } catch {}

  // 2. iOS Safari (vibrate 미지원 대응)
  // 2-1. iOS 17.4+ Switch 체크박스 네이티브 Taptic Engine 트리거
  ensureIosSwitch();
  if (hapticLabel) {
    try {
      hapticLabel.click();
    } catch {}
  }

  // 2-2. Web Audio 기반 촉각 펄스 보강
  playTactilePulse(type);
}
