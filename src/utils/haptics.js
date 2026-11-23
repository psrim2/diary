/**
 * 웹 환경에서 햅틱(진동) 피드백을 제공하는 유틸리티
 * Android 및 지원 브라우저에서는 navigator.vibrate()를 사용하며,
 * 비지원 환경에서는 안전하게 무시됩니다.
 */
export function triggerHaptic(type = 'light') {
  if (typeof window === 'undefined') return;

  try {
    if ('vibrate' in navigator && typeof navigator.vibrate === 'function') {
      switch (type) {
        case 'light': // 버튼 탭, 툴 전환
          navigator.vibrate(10);
          break;
        case 'medium': // 날짜 선택, 다이어리 저장
          navigator.vibrate(20);
          break;
        case 'pageTurn': // 달력/다이어리 책장 넘김 햅틱
          navigator.vibrate([12, 35, 18]);
          break;
        case 'boundary': // 첫 번째 / 최신 일기 도달 (경계 진동)
          navigator.vibrate([25, 40, 25]);
          break;
        case 'success':
          navigator.vibrate([15, 30, 20]);
          break;
        default:
          navigator.vibrate(12);
      }
    }
  } catch {
    // 비지원 또는 차단 환경 무시
  }
}
