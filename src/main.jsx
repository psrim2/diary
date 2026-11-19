import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// iOS Safari 및 모바일 브라우저 가상 키보드 & 뷰포트 완벽 동기화
function setupVisualViewport() {
  if (typeof window === 'undefined') return;

  const update = () => {
    // 1) iOS Safari가 input/textarea 포커스 시 window를 강제 스크롤하는 것을 즉시 원복
    if (window.scrollY !== 0 || window.scrollX !== 0) {
      window.scrollTo(0, 0);
    }
    if (document.body && document.body.scrollTop !== 0) {
      document.body.scrollTop = 0;
    }
    if (document.documentElement && document.documentElement.scrollTop !== 0) {
      document.documentElement.scrollTop = 0;
    }

    const vv = window.visualViewport;
    const vh = vv ? Math.round(vv.height) : window.innerHeight;
    const vt = vv ? Math.round(vv.offsetTop) : 0;

    document.documentElement.style.setProperty('--app-height', `${vh}px`);
    document.documentElement.style.setProperty('--app-top', `${vt}px`);
  };

  update();

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', update);
    window.visualViewport.addEventListener('scroll', update);
  }
  window.addEventListener('resize', update);
  window.addEventListener('scroll', update);

  // 포커스 진입/이탈 시 iOS의 뷰포트 애니메이션(300ms) 단계별로 window.scrollTo(0, 0) 및 높이 보정
  const handleFocus = () => {
    [0, 50, 100, 150, 250, 350, 500].forEach((delay) => {
      setTimeout(update, delay);
    });
  };

  window.addEventListener('focusin', handleFocus);
  window.addEventListener('focusout', handleFocus);
}

setupVisualViewport();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
